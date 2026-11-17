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
from datetime import datetime

import pymupdf
import pdfplumber
import pandas as pd
import xgboost as xgb

# Sibling imports inside ml-service
from vertex_forensics import analyze_statement_with_vertex
from multi_statement_reconciler import reconcile_client_multi_accounts
from extractor import extract_ledger_from_pdf

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
    "cutepdf", "pdfcreator", "gimp", "coreldraw", "word", "excel", 
    "powerpoint", "adobe", "pdfelement", "pdfsam", "chromium", "skia"
]

# --- LOCAL FEATURE EXTRACTOR ---

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

def compute_local_tamper_score(features: dict) -> tuple[float, str, list[str]]:
    """Runs local XGBoost scoring with dynamic 4 vs 11 feature detection."""
    tamper_proba = 0.0
    if MODEL_PATH.exists():
        try:
            expected_features = tamper_model.get_booster().feature_names
            if expected_features == ["is_suspicious_tool", "revision_count", "font_count", "page_count"]:
                feat_df = pd.DataFrame([{
                    "is_suspicious_tool": features["is_suspicious_tool"],
                    "revision_count": features["revision_count"],
                    "font_count": features["font_count"],
                    "page_count": features["page_count"],
                }])
            else:
                feat_df = pd.DataFrame([{
                    "is_suspicious_tool": features["is_suspicious_tool"],
                    "has_empty_producer": 0,
                    "revision_count": features["revision_count"],
                    "trailer_count": 1,
                    "has_multiple_revisions": features["has_multiple_revisions"],
                    "date_tampered": 0,
                    "font_count": features["font_count"],
                    "font_variety": 1,
                    "x_alignment_variance": 0.0,
                    "char_width_variance": 0.0,
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
        reason_codes.append(f"PDF_INCREMENTAL_REVISION_ANOMALY: {features['revision_count']} revisions")
        status = "MANUAL_REVIEW"
    elif tamper_proba > 0.40:
        status = "MANUAL_REVIEW"
    else:
        status = "VERIFIED"

    return tamper_proba, status, reason_codes


# --- ENDPOINT 1: SINGLE STATEMENT AUDIT ---

@app.post("/api/v1/analyze")
async def analyze_single_statement(file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    sha256_hash = hashlib.sha256(contents).hexdigest()
    features = extract_pdf_features(contents)
    tamper_proba, local_status, local_reasons = compute_local_tamper_score(features)

    # 1. Deterministic Multi-page Ledger Extraction
    ledger = extract_ledger_from_pdf(contents)

    # 2. Try Gemini via AI Studio for forensic/visual layout verification
    vertex_result = analyze_statement_with_vertex(contents)

    if vertex_result:
        status = vertex_result.forensics.status
        reasons = list(vertex_result.forensics.reasons)
        confidence = vertex_result.forensics.confidence
        font_status = vertex_result.forensics.font_status
        engine = getattr(vertex_result, "engine_used", "GOOGLE_AI_STUDIO")
    else:
        status = local_status
        reasons = local_reasons + ["PARSED_VIA_DETERMINISTIC_LOCAL_ENGINE"]
        confidence = round(1.0 - tamper_proba, 2)
        font_status = "Inspected via local structural parser"
        engine = "LOCAL_EXTRACTOR"

    # Format Rows for Frontend Table Display
    rows = [
        [
            tx["date"],
            tx["description"],
            f"{tx['debit']:,.2f}" if tx["debit"] > 0 else "-",
            f"{tx['credit']:,.2f}" if tx["credit"] > 0 else "-",
            f"{tx['balance']:,.2f}"
        ]
        for tx in ledger["transactions"]
    ]

    return {
        "status": status,
        "fileName": file.filename,
        "sha256": sha256_hash,
        "bank_provider": ledger["bank_provider"],
        "account_name": ledger["account_name"],
        "account_number": ledger["account_number"],
        "headers": ["Date", "Description", "Debit", "Credit", "Balance"],
        "rows": rows,
        "openingBalance": ledger["opening_balance"],
        "closingBalance": ledger["closing_balance"],
        "totalInflow": ledger["total_inflow"],
        "totalOutflow": ledger["total_outflow"],
        "netMovement": ledger["net_movement"],
        "forensics": {
            "is_tampered": status == "POSSIBLE_MANIPULATION",
            "status": status,
            "confidence": confidence,
            "reasons": reasons,
            "font_status": font_status,
        },
        "engine": engine,
        "transactions": ledger["transactions"]
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
        features = extract_pdf_features(contents)
        tamper_proba, local_status, local_reasons = compute_local_tamper_score(features)

        # Exact multi-page ledger parsing
        ledger = extract_ledger_from_pdf(contents)

        if local_status == "POSSIBLE_MANIPULATION":
            has_any_tampering = True
            tamper_alerts.extend([f"[{file.filename}] {r}" for r in local_reasons])

        individual_audits.append({
            "fileName": file.filename,
            "sha256": sha256,
            "bank_provider": ledger["bank_provider"],
            "account_number": ledger["account_number"],
            "account_name": ledger["account_name"],
            "opening_balance": ledger["opening_balance"],
            "closing_balance": ledger["closing_balance"],
            "total_inflow": ledger["total_inflow"],
            "total_outflow": ledger["total_outflow"],
            "net_movement": ledger["net_movement"],
            "forensics": {
                "is_tampered": local_status == "POSSIBLE_MANIPULATION",
                "status": local_status,
                "confidence": round(1.0 - tamper_proba, 2),
                "reasons": local_reasons,
                "font_status": "Inspected via local structural parser"
            },
            "transactions": ledger["transactions"]
        })

    # Inter-account transfer matching (Fidelity <-> Union Bank)
    reconciled_txs, flow_summary = reconcile_client_multi_accounts(individual_audits)

    headers = ["Bank", "Date", "Description", "Debit", "Credit", "Balance", "Inter-Account Flow"]
    formatted_rows = []
    for tx in reconciled_txs:
        status_tag = "-"
        if tx.get("is_internal_transfer"):
            status_tag = f"🔄 {tx.get('transfer_details')}"

        formatted_rows.append([
            tx.get("bank_name", "Unknown"),
            tx.get("date", ""),
            tx.get("description", ""),
            f"{tx['debit']:,.2f}" if tx.get("debit", 0) > 0 else "-",
            f"{tx['credit']:,.2f}" if tx.get("credit", 0) > 0 else "-",
            f"{tx['balance']:,.2f}",
            status_tag
        ])

    overall_forensic_status = "POSSIBLE_MANIPULATION" if has_any_tampering else "VERIFIED"

    # Group statements by Account Holder
    grouped_clients = {}
    for stmt in individual_audits:
        account_name = (stmt.get("account_name") or stmt.get("fileName") or "Unassigned Client").strip()
        grouped_clients.setdefault(account_name, {"account_name": account_name, "statements": [], "banks": set()})
        grouped_clients[account_name]["statements"].append(stmt)
        grouped_clients[account_name]["banks"].add(stmt.get("bank_provider") or "Unknown Bank")

    client_groups = [
        {
            "account_name": client_name,
            "statement_count": len(payload["statements"]),
            "bank_count": len(payload["banks"]),
            "banks": sorted(payload["banks"]),
            "files": [s.get("fileName") for s in payload["statements"]],
        }
        for client_name, payload in grouped_clients.items()
    ]

    return {
        "status": "PORTFOLIO_ANALYSIS_SUCCESS",
        "portfolio_forensic_status": overall_forensic_status,
        "portfolio_scope": "multi-bank multi-account reconciliation",
        "tamper_alerts": tamper_alerts,
        "headers": headers,
        "rows": formatted_rows,
        "flow_summary": flow_summary,
        "inter_account_alerts": flow_summary.get("detected_internal_movements", []),
        "circular_turnover_percentage": flow_summary.get("circular_turnover_percentage", 0.0),
        "true_operational_revenue": flow_summary.get("true_operational_revenue", 0.0),
        "client_groups": client_groups,
        "individual_statements": individual_audits
    }