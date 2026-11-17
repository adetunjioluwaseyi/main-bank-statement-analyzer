# ml-service/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import pymupdf
import pdfplumber
import hashlib
import re
import pandas as pd
import xgboost as xgb
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from collections import defaultdict
import io

# Import the Vertex AI forensic service
from vertex_forensics import analyze_statement_with_vertex

app = FastAPI(title="Statement Forensic & Underwriting Engine")

# Enable CORS for Next.js frontend (port 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Model 1 (XGBoost)
MODEL_PATH = Path("models/tamper_xgb.json")
tamper_model = xgb.XGBClassifier()
if MODEL_PATH.exists():
    tamper_model.load_model(str(MODEL_PATH))
    print(f"Loaded Tamper Model from {MODEL_PATH}")
else:
    print("WARNING: models/tamper_xgb.json not found. Run training first.")

SUSPICIOUS_TOOLS = [
    "canva", "photoshop", "itext", "pdfescape", "nitro", "foxit",
    "sejda", "ilovepdf", "smallpdf", "libreoffice", "acrobat",
    "illustrator", "inkscape", "pdf-xchange", "soda", "pdf2go",
    "cutepdf", "pdfcreator", "gimp", "coreldraw","word", "excel", "powerpoint", "openoffice", "pdfforge"
]

# Added: hybrid training metadata so Vertex output can be stored as trusted labels for local model learning.
TRAINING_SAMPLE_PATH = Path("training/vertex_labeled_samples.jsonl")

def normalize_vertex_training_record(file_name: str, sha256_hash: str, vertex_result: Any, local_status: str) -> Dict[str, Any]:
    return {
        "file_name": file_name,
        "sha256": sha256_hash,
        "status": local_status,
        "account_number": getattr(vertex_result, "account_number", None),
        "account_holder": getattr(vertex_result, "account_holder", None),
        "period_start": getattr(vertex_result, "period_start", None),
        "period_end": getattr(vertex_result, "period_end", None),
        "opening_balance": getattr(vertex_result, "opening_balance", None),
        "closing_balance": getattr(vertex_result, "closing_balance", None),
        "total_debits": getattr(vertex_result, "total_debits", None),
        "total_credits": getattr(vertex_result, "total_credits", None),
        "forensics": {
            "is_tampered": getattr(vertex_result.forensics, "is_tampered", False),
            "status": getattr(vertex_result.forensics, "status", "UNKNOWN"),
            "confidence": getattr(vertex_result.forensics, "confidence", 0.0),
            "reasons": getattr(vertex_result.forensics, "reasons", []),
        },
        "transactions": [
            {
                "date": tx.date,
                "description": tx.description,
                "debit": tx.debit,
                "credit": tx.credit,
                "balance": tx.balance,
            }
            for tx in vertex_result.transactions
        ],
    }


def save_vertex_training_sample(file_name: str, sha256_hash: str, vertex_result: Any, local_status: str) -> None:
    TRAINING_SAMPLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    sample = normalize_vertex_training_record(file_name, sha256_hash, vertex_result, local_status)
    with TRAINING_SAMPLE_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(sample, default=str) + "\n")


def extract_pdf_features(doc: pymupdf.Document, raw_bytes: bytes) -> Dict[str, Any]:
    metadata = doc.metadata or {}
    producer = (metadata.get("producer") or "").lower()
    creator = (metadata.get("creator") or "").lower()

    is_suspicious_tool = int(any(t in producer or t in creator for t in SUSPICIOUS_TOOLS))

    all_fonts = set()
    for page in doc:
        for f in page.get_fonts():
            all_fonts.add(f[3])

    # Inspect raw uploaded bytes for incremental revisions
    xref_count = len(re.findall(rb"xref\b|/XRef\b", raw_bytes))
    trailer_count = len(re.findall(rb"trailer\b", raw_bytes))
    has_multiple_revisions = int(xref_count > 1 or trailer_count > 1)

    return {
        "is_suspicious_tool": is_suspicious_tool,
        "revision_count": xref_count,
        "has_multiple_revisions": has_multiple_revisions,
        "font_count": len(all_fonts),
        "page_count": len(doc),
        "producer": producer,
        "creator": creator,
    }

def extract_table_data_fallback(file_bytes: bytes) -> tuple[List[str], List[List[str]]]:
    """Fallback row extractor using pdfplumber."""
    headers = ["Date", "Description", "Debit", "Credit", "Balance"]
    rows = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    for r in table:
                        clean_row = [str(cell).strip() if cell is not None else "" for cell in r]
                        if any(clean_row):
                            rows.append(clean_row)
    except Exception as e:
        print(f"Table extraction notice: {e}")

    if rows and any("date" in str(c).lower() for c in rows[0]):
        headers = rows[0]
        rows = rows[1:]

    return headers, rows

# Removed: a single-customer analysis page was the only supported flow.
# Added: bundle analysis so one client can be evaluated across several bank statements.
@app.post("/api/v1/analyze-bundle")
async def analyze_statement_bundle(
    files: List[UploadFile] = File(...),
    client_id: Optional[str] = Form(None),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one statement file is required")

    bundle = []
    for file in files:
        contents = await file.read()
        if not contents:
            continue
        sha256_hash = hashlib.sha256(contents).hexdigest()
        vertex_result = analyze_statement_with_vertex(contents)
        if vertex_result:
            save_vertex_training_sample(file.filename or "statement.pdf", sha256_hash, vertex_result, "VERIFIED")
            bundle.append({
                "fileName": file.filename,
                "sha256": sha256_hash,
                "accountNumber": vertex_result.account_number,
                "accountHolder": vertex_result.account_holder,
                "totalCredits": vertex_result.total_credits,
                "totalDebits": vertex_result.total_debits,
                "closingBalance": vertex_result.closing_balance,
                "status": getattr(vertex_result.forensics, "status", "VERIFIED"),
            })

    total_credits = sum(float(item["totalCredits"] or 0.0) for item in bundle)
    total_debits = sum(float(item["totalDebits"] or 0.0) for item in bundle)

    return {
        "clientId": client_id,
        "statementCount": len(bundle),
        "totalCredits": total_credits,
        "totalDebits": total_debits,
        "netCashFlow": total_credits - total_debits,
        "statements": bundle,
    }

@app.post("/api/v1/analyze")
async def analyze_statement(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None)
):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    sha256_hash = hashlib.sha256(contents).hexdigest()

    # 1. Open document with PyMuPDF
    try:
        doc = pymupdf.open(stream=contents, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")

    if doc.is_encrypted:
        unlocked = False
        if password and doc.authenticate(password):
            unlocked = True
        else:
            for candidate in ["", "08012345678", "password"]:
                if doc.authenticate(candidate):
                    unlocked = True
                    break
        if not unlocked:
            doc.close()
            return {
                "fileName": file.filename,
                "sha256": sha256_hash,
                "status": "UNABLE_TO_VERIFY",
                "tamperConfidence": 0.0,
                "reasonCodes": ["PDF_ENCRYPTED_PASSWORD_REQUIRED"],
                "headers": ["Date", "Description", "Debit", "Credit", "Balance"],
                "rows": [],
            }

    # 2. Extract structural & local forensic features
    features = extract_pdf_features(doc, raw_bytes=contents)
    doc.close()

    # 3. Model 1 (XGBoost) baseline check
    feat_df = pd.DataFrame([{
        "is_suspicious_tool": features["is_suspicious_tool"],
        "revision_count": features["revision_count"],
        "font_count": features["font_count"],
        "page_count": features["page_count"],
    }])

    tamper_proba = 0.0
    if MODEL_PATH.exists():
        tamper_proba = float(tamper_model.predict_proba(feat_df)[0][1])

    reason_codes = []
    if features["is_suspicious_tool"]:
        reason_codes.append(f"TAMPER_SUSPICIOUS_PRODUCER_TOOL: {features['producer'] or features['creator']}")
    if features["has_multiple_revisions"]:
        reason_codes.append("PDF_INCREMENTAL_REVISION_ANOMALY")

    # 4. PRIMARY INGESTION: Run Vertex AI Multimodal Analysis
    print(f"--> Invoking Vertex AI Gemini Forensic Extraction for {file.filename}...")
    vertex_result = analyze_statement_with_vertex(contents)

    if vertex_result:
        # Build tabular matrix for frontend
        headers = ["Date", "Description", "Debit", "Credit", "Balance"]
        rows = [
            [
                tx.date,
                tx.description,
                f"{tx.debit:.2f}" if tx.debit > 0 else "",
                f"{tx.credit:.2f}" if tx.credit > 0 else "",
                f"{tx.balance:.2f}"
            ]
            for tx in vertex_result.transactions
        ]

        # Merge Vertex AI forensic findings with local flags
        if vertex_result.forensics.is_tampered or vertex_result.forensics.status == "POSSIBLE_MANIPULATION":
            status = "POSSIBLE_MANIPULATION"
            integrity_score = 30
        elif vertex_result.forensics.status == "MANUAL_REVIEW" or features["is_suspicious_tool"]:
            status = "MANUAL_REVIEW"
            integrity_score = 65
        else:
            status = "VERIFIED"
            integrity_score = 98

        reason_codes.extend(vertex_result.forensics.reasons)
        if vertex_result.forensics.font_status:
            reason_codes.append(vertex_result.forensics.font_status)

        return {
            "fileName": file.filename,
            "sha256": sha256_hash,
            "status": status,
            "tamperConfidence": round(vertex_result.forensics.confidence, 2),
            "integrityScore": integrity_score,
            "reasonCodes": list(dict.fromkeys(reason_codes)), # remove duplicates
            "analyzedAt": datetime.utcnow().isoformat() + "Z",
            "headers": headers,
            "rows": rows,
            "openingBalance": vertex_result.opening_balance,
            "closingBalance": vertex_result.closing_balance,
            "totalDebits": vertex_result.total_debits,
            "totalCredits": vertex_result.total_credits,
            "periodStart": vertex_result.period_start,
            "periodEnd": vertex_result.period_end,
            "accountHolder": vertex_result.account_holder,
            "accountNumber": vertex_result.account_number,
        }

    # 5. FALLBACK: In case Vertex AI is offline or credentials aren't set
    print("⚠️ Vertex AI fallback triggered. Using local extractors.")
    headers, rows = extract_table_data_fallback(contents)
    
    if features["is_suspicious_tool"] or tamper_proba > 0.70:
        status = "POSSIBLE_MANIPULATION"
    elif tamper_proba > 0.40:
        status = "MANUAL_REVIEW"
    elif tamper_proba < 0.15:
        status = "VERIFIED"
    else:
        status = "NO_OBVIOUS_TAMPERING"

    return {
        "fileName": file.filename,
        "sha256": sha256_hash,
        "status": status,
        "tamperConfidence": round(tamper_proba, 2),
        "integrityScore": round((1.0 - tamper_proba) * 100),
        "reasonCodes": reason_codes,
        "analyzedAt": datetime.utcnow().isoformat() + "Z",
        "headers": headers,
        "rows": rows,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)