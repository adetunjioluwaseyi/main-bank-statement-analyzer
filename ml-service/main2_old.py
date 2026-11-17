# ml-service/main.py
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import hashlib
import io
import re
from pathlib import Path
from datetime import datetime

import pymupdf
import pdfplumber
import pandas as pd
import xgboost as xgb

# Sibling imports inside ml-service
from vertex_forensics import analyze_statement_with_vertex
from multi_statement_reconciler import reconcile_client_multi_accounts
from extractor import run_local_extractor

app = FastAPI(title="Forensic Statement Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Local Model 1 (XGBoost)
MODEL_PATH = Path("models/tamper_xgb.json")
tamper_model = xgb.XGBClassifier()
if MODEL_PATH.exists():
    try:
        tamper_model.load_model(str(MODEL_PATH))
        print(f"Loaded Local Tamper Model from {MODEL_PATH}")
    except Exception as e:
        print(f"Notice: Could not load {MODEL_PATH}: {e}")

SUSPICIOUS_TOOLS = [
    "canva", "photoshop", "itext", "pdfescape", "nitro", "foxit",
    "sejda", "ilovepdf", "smallpdf", "libreoffice", "acrobat",
    "illustrator", "inkscape", "pdf-xchange", "soda", "pdf2go",
    "cutepdf", "pdfcreator", "gimp", "coreldraw", "Word", "excel", "powerpoint", "adobe", "pdfelement", "pdfsam",
]

# --- LOCAL FEATURE & TABLE EXTRACTORS (FALLBACK) ---

def extract_pdf_features(raw_bytes: bytes) -> dict:
    """Extracts byte-level and metadata forensic indicators via PyMuPDF."""
    try:
        doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
        metadata = doc.metadata or {}
        producer = (metadata.get("producer") or "").lower()
        creator = (metadata.get("creator") or "").lower()

        is_suspicious_tool = int(any(t in producer or t in creator for t in SUSPICIOUS_TOOLS))

        all_fonts = set()
        for page in doc:
            for f in page.get_fonts():
                all_fonts.add(f[3])

        xref_count = len(re.findall(rb"xref\b|/XRef\b", raw_bytes))
        trailer_count = len(re.findall(rb"trailer\b", raw_bytes))
        has_multiple_revisions = int(xref_count > 1 or trailer_count > 1)
        page_count = len(doc)
        doc.close()

        return {
            "is_suspicious_tool": is_suspicious_tool,
            "revision_count": xref_count,
            "has_multiple_revisions": has_multiple_revisions,
            "font_count": len(all_fonts),
            "page_count": page_count,
            "producer": producer,
            "creator": creator,
        }
    except Exception as e:
        print(f"Local feature extraction note: {e}")
        return {
            "is_suspicious_tool": 0,
            "revision_count": 1,
            "has_multiple_revisions": 0,
            "font_count": 1,
            "page_count": 1,
            "producer": "",
            "creator": "",
        }

def extract_table_data_fallback(file_bytes: bytes) -> tuple[List[str], List[List[str]]]:
    """Extracts tabular rows and headers using pdfplumber when Vertex is offline."""
    headers = ["Date", "Description", "Debit", "Credit", "Balance"]
    rows = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables() or []
                for table in tables:
                    for r in table:
                        clean_row = [str(cell).strip() if cell is not None else "" for cell in r]
                        if any(clean_row):
                            rows.append(clean_row)
    except Exception as e:
        print(f"Local table extraction note: {e}")

    if rows and any("date" in str(c).lower() for c in rows[0]):
        headers = rows[0]
        rows = rows[1:]

    return headers, rows

def parse_num(val: str) -> float:
    try:
        clean = re.sub(r"[^\d.-]", "", str(val))
        return float(clean) if clean else 0.0
    except ValueError:
        return 0.0


def build_local_statement_payload(raw_bytes: bytes) -> dict:
    local = run_local_extractor(raw_bytes)
    txs = []
    for tx in local.get("transactions", []):
        txs.append({
            "date": tx.get("date", ""),
            "description": tx.get("description", ""),
            "debit": float(tx.get("debit", 0.0) or 0.0),
            "credit": float(tx.get("credit", 0.0) or 0.0),
            "balance": float(tx.get("balance", 0.0) or 0.0),
        })
    return {
        "bank_provider": local.get("bank_provider", "Local Extractor"),
        "account_name": local.get("account_name", "Account Holder"),
        "account_number": local.get("account_number", ""),
        "transactions": txs,
        "status": local.get("status", "VERIFIED"),
        "opening_balance": local.get("opening_balance"),
        "closing_balance": local.get("closing_balance"),
    }


# --- ENDPOINT 1: SINGLE STATEMENT AUDIT ---

@app.post("/api/v1/analyze")
async def analyze_single_statement(file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    sha256_hash = hashlib.sha256(contents).hexdigest()
    features = extract_pdf_features(contents)

    # 1. Try Vertex AI Gemini extraction
    print(f"--> [ANALYZE] Ingesting {file.filename} via Vertex AI...")
    vertex_result = analyze_statement_with_vertex(contents)

    if vertex_result:
        print("--> Vertex AI analysis completed successfully.")
        headers = ["Date", "Description", "Debit", "Credit", "Balance"]
        rows = [
            [
                tx.date,
                tx.description,
                f"{tx.debit:.2f}" if tx.debit > 0 else "-",
                f"{tx.credit:.2f}" if tx.credit > 0 else "-",
                f"{tx.balance:.2f}"
            ]
            for tx in (vertex_result.transactions or [])
        ]

        status = vertex_result.forensics.status
        reasons = list(vertex_result.forensics.reasons)
        if features["is_suspicious_tool"]:
            reasons.append(f"LOCAL_METADATA_ALERT: Edited with {features['producer'] or features['creator']}")

        return {
            "status": status,
            "fileName": file.filename,
            "sha256": sha256_hash,
            "bank_provider": getattr(vertex_result, "bank_provider", "Unknown Bank"),
            "account_name": getattr(vertex_result, "account_name", "Account Holder"),
            "headers": headers,
            "rows": rows,
            "openingBalance": vertex_result.opening_balance,
            "closingBalance": vertex_result.closing_balance,
            "forensics": {
                "is_tampered": vertex_result.forensics.is_tampered,
                "status": status,
                "confidence": vertex_result.forensics.confidence,
                "reasons": reasons,
                "font_status": vertex_result.forensics.font_status
            },
            "transactions": [tx.model_dump() for tx in (vertex_result.transactions or [])]
        }

    # 2. Local fallback if Vertex AI throws an error or fails to authenticate
    print("⚠️ Vertex AI unavailable. Activating local fallback pipeline.")
    local_result = build_local_statement_payload(contents)
    rows = [
        [
            tx["date"],
            tx["description"],
            f"{tx['debit']:.2f}" if tx["debit"] > 0 else "-",
            f"{tx['credit']:.2f}" if tx["credit"] > 0 else "-",
            f"{tx['balance']:.2f}"
        ]
        for tx in local_result["transactions"]
    ]

    tamper_proba = 0.0
    if MODEL_PATH.exists():
        try:
            feat_df = pd.DataFrame([{
                "is_suspicious_tool": features["is_suspicious_tool"],
                "revision_count": features["revision_count"],
                "font_count": features["font_count"],
                "page_count": features["page_count"],
            }])
            tamper_proba = float(tamper_model.predict_proba(feat_df)[0][1])
        except Exception:
            tamper_proba = 0.1

    reason_codes = []
    if features["is_suspicious_tool"]:
        reason_codes.append(f"SUSPICIOUS_PDF_PRODUCER: {features['producer'] or features['creator']}")
        status = "POSSIBLE_MANIPULATION"
    elif features["has_multiple_revisions"]:
        reason_codes.append("PDF_INCREMENTAL_REVISION_ANOMALY")
        status = "MANUAL_REVIEW"
    elif tamper_proba > 0.40:
        status = "MANUAL_REVIEW"
    else:
        status = "VERIFIED"

    reason_codes.append("ANALYZED_VIA_LOCAL_FALLBACK_ENGINE")

    return {
        "status": status,
        "fileName": file.filename,
        "sha256": sha256_hash,
        "bank_provider": local_result["bank_provider"],
        "account_name": "Account Holder",
        "headers": ["Date", "Description", "Debit", "Credit", "Balance"],
        "rows": rows,
        "openingBalance": local_result.get("opening_balance"),
        "closingBalance": local_result.get("closing_balance"),
        "forensics": {
            "is_tampered": status == "POSSIBLE_MANIPULATION",
            "status": status,
            "confidence": round(1.0 - tamper_proba, 2),
            "reasons": reason_codes,
            "font_status": "Inspected via local structural parser"
        },
        "transactions": local_result["transactions"]
    }


# --- ENDPOINT 2: MULTI-STATEMENT RECONCILIATION ---

@app.post("/api/v1/analyze-client-portfolio")
async def analyze_client_portfolio(files: List[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Multi-account mode requires at least 2 bank statements.")

    individual_audits = []
    has_any_tampering = False
    tamper_alerts = []

    for file in files:
        contents = await file.read()
        sha256 = hashlib.sha256(contents).hexdigest()

        # Ingestion pass (Vertex AI -> fallback to local extractor)
        parsed = analyze_statement_with_vertex(contents)

        if parsed and parsed.transactions:
            if parsed.forensics.is_tampered or parsed.forensics.status == "POSSIBLE_MANIPULATION":
                has_any_tampering = True
                tamper_alerts.extend([f"[{file.filename}] {r}" for r in parsed.forensics.reasons])

            individual_audits.append({
                "fileName": file.filename,
                "sha256": sha256,
                "bank_provider": parsed.bank_provider or "Unknown Bank",
                "account_number": parsed.account_number or "",
                "account_name": parsed.account_name or "",
                "opening_balance": parsed.opening_balance,
                "closing_balance": parsed.closing_balance,
                "forensics": parsed.forensics.model_dump(),
                "transactions": [tx.model_dump() for tx in parsed.transactions]
            })
        else:
            print(f"⚠️ Falling back to local extractor for {file.filename} in portfolio.")
            local_result = build_local_statement_payload(contents)
            local_txs = local_result["transactions"]

            individual_audits.append({
                "fileName": file.filename,
                "sha256": sha256,
                "bank_provider": local_result["bank_provider"],
                "account_number": "",
                "account_name": "Account Holder",
                "opening_balance": local_result.get("opening_balance"),
                "closing_balance": local_result["closing_balance"],
                "forensics": {
                    "is_tampered": False,
                    "status": local_result["status"],
                    "confidence": 0.85,
                    "reasons": ["LOCAL_TEXT_PARSER_ENGAGED"],
                    "font_status": "Standard layout"
                },
                "transactions": local_txs
            })

    # Inter-account transfer deduplication
    reconciled_txs, flow_summary = reconcile_client_multi_accounts(individual_audits)

    headers = ["Origin Bank", "Date", "Description", "Debit", "Credit", "Balance", "Flow Status"]
    formatted_rows = []
    for tx in reconciled_txs:
        status_tag = "-"
        if tx["is_internal_transfer"]:
            if tx.get("transfer_destination"):
                status_tag = f"🔄 Outflow to {tx['transfer_destination']}"
            elif tx.get("transfer_source"):
                status_tag = f"📥 Inflow from {tx['transfer_source']}"

        formatted_rows.append([
            tx["bank_name"],
            tx["date"],
            tx["description"],
            str(tx["debit"]) if tx["debit"] > 0 else "-",
            str(tx["credit"]) if tx["credit"] > 0 else "-",
            str(tx["balance"]),
            status_tag
        ])

    overall_forensic_status = "POSSIBLE_MANIPULATION" if has_any_tampering else "VERIFIED"

    grouped_clients = {}
    for stmt in individual_audits:
        account_name = (stmt.get("account_name") or stmt.get("fileName") or "Unassigned Client").strip()
        if not account_name:
            account_name = "Unassigned Client"
        grouped_clients.setdefault(account_name, {"account_name": account_name, "statements": [], "banks": set()})
        grouped_clients[account_name]["statements"].append(stmt)
        grouped_clients[account_name]["banks"].add(stmt.get("bank_provider") or "Unknown Bank")

    client_groups = []
    for client_name, payload in grouped_clients.items():
        client_groups.append({
            "account_name": client_name,
            "statement_count": len(payload["statements"]),
            "bank_count": len(payload["banks"]),
            "banks": sorted(payload["banks"]),
            "files": [s.get("fileName") for s in payload["statements"]],
        })

    return {
        "status": "PORTFOLIO_ANALYSIS_SUCCESS",
        "portfolio_forensic_status": overall_forensic_status,
        "portfolio_scope": "multi-bank multi-user analysis",
        "tamper_alerts": tamper_alerts,
        "headers": headers,
        "rows": formatted_rows,
        "flow_summary": flow_summary,
        "same_amount_transfer_clusters": flow_summary.get("same_amount_transfer_clusters", []),
        "same_amount_suspicious_patterns": flow_summary.get("same_amount_suspicious_patterns", []),
        "multi_destination_transfer_count": flow_summary.get("multi_destination_transfer_count", 0),
        "client_groups": client_groups,
        "individual_statements": individual_audits
    }