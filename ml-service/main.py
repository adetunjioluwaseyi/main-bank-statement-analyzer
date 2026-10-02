# ml-service/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymupdf
import pdfplumber
import hashlib
import re
import pandas as pd
import xgboost as xgb
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
import io

app = FastAPI(title="Statement Forensic & Underwriting Engine")

# Enable CORS so your Next.js frontend (running on port 3000) can communicate seamlessly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the trained Model 1
MODEL_PATH = Path("models/tamper_xgb.json")
tamper_model = xgb.XGBClassifier()
if MODEL_PATH.exists():
    tamper_model.load_model(str(MODEL_PATH))
    print(f"Loaded Tamper Model from {MODEL_PATH}")
else:
    print("WARNING: models/tamper_xgb.json not found. Run training first.")

def extract_pdf_features(doc: pymupdf.Document) -> Dict[str, Any]:
    metadata = doc.metadata or {}
    producer = metadata.get("producer", "").lower()
    creator = metadata.get("creator", "").lower()

    suspicious_tools = ["canva", "photoshop", "itext", "pdfescape"]
    is_suspicious_tool = int(any(t in producer or t in creator for t in suspicious_tools))

    all_fonts = set()
    for page in doc:
        for f in page.get_fonts():
            all_fonts.add(f[3])

    stream_bytes = doc.write()
    revision_count = len(re.findall(rb"/XRef", stream_bytes))

    return {
        "is_suspicious_tool": is_suspicious_tool,
        "revision_count": revision_count,
        "font_count": len(all_fonts),
        "page_count": len(doc),
        "producer": producer,
        "creator": creator,
    }

def extract_table_data(file_bytes: bytes) -> tuple[List[str], List[List[str]]]:
    """Extracts tabular rows and headers using pdfplumber."""
    headers = []
    rows = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    for r in table:
                        clean_row = [str(cell).strip() if cell is not None else "" for cell in r]
                        if not any(clean_row):
                            continue
                        if not headers:
                            headers = clean_row
                        else:
                            rows.append(clean_row)
    except Exception as e:
        print(f"Table extraction notice: {e}")

    # Fallback headers if none extracted cleanly
    if not headers:
        headers = ["Date", "Description", "Debit", "Credit", "Balance"]
    return headers, rows

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
            for candidate in ["", "08012345678"]:
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

    # 2. Extract structural & visual features
    features = extract_pdf_features(doc)
    doc.close()

    # 3. Model 1 Prediction
    feat_df = pd.DataFrame([{
        "is_suspicious_tool": features["is_suspicious_tool"],
        "revision_count": features["revision_count"],
        "font_count": features["font_count"],
        "page_count": features["page_count"],
    }])

    tamper_proba = 0.0
    if MODEL_PATH.exists():
        tamper_proba = float(tamper_model.predict_proba(feat_df)[0][1])

    # 4. Reason codes and policy arbitration
    reason_codes = []
    if features["is_suspicious_tool"]:
        reason_codes.append("TAMPER_PRODUCER_TOOL_FLAGGED")
    if features["revision_count"] > 2:
        reason_codes.append("PDF_INCREMENTAL_REVISION_ANOMALY")
    if tamper_proba > 0.70:
        reason_codes.append("ML_TAMPER_HIGH_CONFIDENCE")
    elif tamper_proba > 0.40:
        reason_codes.append("ML_TAMPER_MODERATE_RISK")

    # Final verdict
    if features["is_suspicious_tool"] and tamper_proba > 0.75:
        status = "POSSIBLE_MANIPULATION"
    elif tamper_proba > 0.40 or features["is_suspicious_tool"]:
        status = "MANUAL_REVIEW"
    elif tamper_proba < 0.15:
        status = "VERIFIED"
    else:
        status = "NO_OBVIOUS_TAMPERING"

    # 5. Extract tables for Next.js to render
    headers, rows = extract_table_data(contents)

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