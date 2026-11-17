# ml-service/extractor.py
import io
import re
from pathlib import Path
from typing import List, Dict, Any
import numpy as np
import pandas as pd
import pymupdf
import pdfplumber
import xgboost as xgb

MODEL_PATH = Path("models/tamper_xgb.json")
tamper_model = xgb.XGBClassifier()
if MODEL_PATH.exists():
    try:
        tamper_model.load_model(str(MODEL_PATH))
    except Exception as e:
        print(f"XGBoost load note: {e}")

SUSPICIOUS_TOOLS = [
    "canva", "photoshop", "itext", "pdfescape", "nitro", "foxit",
    "sejda", "ilovepdf", "smallpdf", "libreoffice", "acrobat",
    "illustrator", "inkscape", "pdf-xchange", "soda", "pdf2go",
    "cutepdf", "pdfcreator", "gimp", "coreldraw", "chromium", "skia", "word", "pages", "openoffice", "preview","excel", "powerpoint", "pdfsam", "pdf24", "pdfarchitect", "pdfill", "pdfescape", "pdfshuffler", "pdfmod", "pdfsplitandmerge", "pdfsam-basic", "pdfsam-enhanced", "pdfsam-visual", "pdfsam-advanced"
]

BANK_HINTS = [
    "Access Bank", "AccessBank", "Accessbank", "First Bank", "FirstBank", "GTBank",
    "Guaranty Trust Bank", "UBA", "United Bank for Africa", "Zenith Bank", "Zenith",
    "Stanbic IBTC", "Fidelity Bank", "Fidelity", "Sterling Bank", "Union Bank",
    "Union", "Wema Bank", "FCMB", "Polaris Bank", "Keystone Bank", "Ecobank",
    "Standard Chartered", "Citibank", "Heritage Bank", "Jaiz Bank", "OPay", "Kuda",
    "Moniepoint", "PalmPay", "Airtel Money", "Momo", "Paystack", "Flutterwave",
    "Bank of America", "Citi", "Wells Fargo", "HSBC", "Barclays", "Standard Bank",
    "FBNQuest", "Providus", "Nova Merchant Bank", "Titan Trust", "Unity Bank"
]


def detect_bank_provider(full_text: str) -> str:
    text = (full_text or "").lower()
    if not text:
        return "Unknown Bank"
    for bank in BANK_HINTS:
        if bank.lower() in text:
            return bank
    for marker in ["bank", "bank plc", "bank ltd", "financial institution", "merchant bank"]:
        if marker in text:
            return "Named Bank (detected from statement)"
    return "Unknown Bank"


def detect_account_name(full_text: str) -> str:
    text = full_text or ""
    patterns = [
        r"(?im)(?:account\s*name|customer\s*name|client\s*name|name\s*[:\-])\s*([A-Z0-9&/.,'()\- ][A-Z0-9&/.,'()\- ]{3,120})",
        r"(?im)^(?:GOD OF|[A-Z][A-Z0-9&/.,'()\- ]{8,120})$",
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for candidate in matches:
            cleaned = re.sub(r"\s+", " ", candidate).strip(" -:;,. ")
            if len(cleaned) > 4 and not re.fullmatch(r"(?:statement|account|currency|bank|branch|title|date|page)\b.*", cleaned, flags=re.IGNORECASE):
                return cleaned
    return "Account Holder"


def detect_account_number(full_text: str) -> str:
    matches = re.findall(r"(?im)(?:account\s*(?:no|number)|acct\s*(?:no|number)|account\s*[:\-])\s*([0-9]{6,20})", full_text)
    if matches:
        return matches[0]
    matches = re.findall(r"(?im)\b\d{10,20}\b", full_text)
    if matches:
        return matches[0]
    return ""

def parse_num(val: Any) -> float:
    if not val:
        return 0.0
    raw = str(val).strip()
    is_neg = raw.startswith("-") or (raw.startswith("(") and raw.endswith(")"))
    clean = re.sub(r"[^\d.]", "", raw)
    try:
        num = float(clean)
        return -num if is_neg else num
    except ValueError:
        return 0.0


def _normalize_statement_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("₦", "").replace("N", "").replace("\u202f", " ")
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _extract_table_transactions(raw_rows: List[List[str]]) -> List[Dict[str, Any]]:
    """Handle statements exported as tables when the PDF layout is still structured."""
    transactions: List[Dict[str, Any]] = []
    if not raw_rows:
        return transactions

    date_pattern = r"\d{1,2}[-/][A-Za-z]{3,4}[-/]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2}"

    for row in raw_rows:
        clean_row = [str(cell).strip() if cell is not None else "" for cell in row]
        if not any(clean_row):
            continue

        header_text = " ".join(str(cell).lower() for cell in clean_row)
        if any(k in header_text for k in ["posted date", "value date", "description", "withdrawal", "deposit", "balance"]):
            continue

        if len(clean_row) >= 7 and re.search(date_pattern, clean_row[0], flags=re.IGNORECASE):
            date_value = clean_row[0]
            description = clean_row[1]
            debit = parse_num(clean_row[4])
            credit = parse_num(clean_row[5])
            balance = parse_num(clean_row[6])
            description_clean = re.sub(r"\s+", " ", description).strip()
            if description_clean and "opening balance" not in description_clean.lower() and "closing balance" not in description_clean.lower():
                transactions.append({
                    "date": date_value,
                    "description": description_clean,
                    "debit": debit,
                    "credit": credit,
                    "balance": balance,
                })
            continue

        if len(clean_row) >= 5 and re.search(date_pattern, clean_row[0], flags=re.IGNORECASE):
            date_value = clean_row[0]
            description = clean_row[1]
            debit = parse_num(clean_row[2])
            credit = parse_num(clean_row[3])
            balance = parse_num(clean_row[4])
            description_clean = re.sub(r"\s+", " ", description).strip()
            if description_clean and "opening balance" not in description_clean.lower() and "closing balance" not in description_clean.lower():
                transactions.append({
                    "date": date_value,
                    "description": description_clean,
                    "debit": debit,
                    "credit": credit,
                    "balance": balance,
                })

    return transactions


def _is_date_value(value: str) -> bool:
    clean = (value or "").strip().replace("\n", " ")
    if not clean:
        return False
    return bool(re.search(r"^(?:\d{1,2}[-/][A-Za-z]{3,4}[-/]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2})$", clean, flags=re.IGNORECASE))


def _extract_text_transactions(text: str) -> List[Dict[str, Any]]:
    """Parse irregular text-heavy statements such as Fidelity-style PDFs."""
    transactions: List[Dict[str, Any]] = []
    normalized = _normalize_statement_text(text)
    if not normalized:
        return transactions
    normalized = re.split(r"\bsummary\b", normalized, flags=re.IGNORECASE)[0].strip()

    lines = [line.strip() for line in normalized.split("\n") if line.strip()]
    blocks: List[List[str]] = []
    current: List[str] = []

    for line in lines:
        if _is_date_value(line):
            if current:
                blocks.append(current)
            current = [line]
            continue
        if current:
            current.append(line)

    if current:
        blocks.append(current)

    for block in blocks:
        filtered_block = []
        for line in block:
            s = line.strip()
            if not s:
                continue
            if re.fullmatch(r"(?:Page\s+\d+\s+of\s+\d+|\d+\s+of\s+\d+|\d{1,2}/\d{1,2}/\d{2,4}\s+\d+\s+of\s+\d+)", s, flags=re.IGNORECASE):
                continue
            if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{2,4}", s):
                continue
            if re.fullmatch(r"(?:[A-Za-z]+\s+)?\d+\s+of\s+\d+", s, flags=re.IGNORECASE):
                continue
            filtered_block.append(s)

        if not filtered_block:
            continue

        block_text = " ".join(filtered_block)
        block_text_lower = block_text.lower()
        if any(token in block_text_lower for token in ["opening balance", "closing balance", "total debit", "total credit", "debit count", "credit count", "summary"]):
            continue
        if not re.search(r"\d{1,3}[,\d]*\.\d{2}", block_text):
            continue
        description_bits = []
        for line in filtered_block:
            if _is_date_value(line):
                continue
            if any(k in line.lower() for k in ["transaction", "value date", "channel", "pay in", "pay out", "balance", "opening balance", "closing balance", "statement", "page "]):
                continue
            if re.fullmatch(r"(?:others|nib|nip|transfer|mobile|cash|teller|cob|channel|bank|others)\b", line, flags=re.IGNORECASE):
                continue
            description_bits.append(line)

        description = re.sub(r"\s+", " ", " ".join(description_bits)).strip(" -:;,. ")
        description = re.sub(r"(?<![A-Za-z])[-+]?\d[\d,]*\.\d{2}(?![A-Za-z])", "", description)
        description = re.sub(r"\b(?:\d{1,2}[-/]\w{3,4}[-/]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2})\b", "", description, flags=re.IGNORECASE)
        description = re.sub(r"\s+", " ", description).strip(" -:;,. ")
        if not description or len(description) < 4:
            continue
        description_lower = description.lower()
        if any(token in description_lower for token in ["opening balance", "closing balance", "statement print date", "currency", "account", "transaction date", "value date", "available balance", "page "]):
            continue

        numbers = re.findall(r"-?\d[\d,]*\.\d{2}", block_text)
        if len(numbers) < 2:
            continue

        # The last numeric token is usually the running balance; the first numeric token is the transaction amount.
        first_amount = float(numbers[0].replace(",", ""))
        balance = float(numbers[-1].replace(",", ""))

        if any(token in description_lower for token in ["charge", "vat", "levy", "sms", "stamp duty", "below minimum", "soft token", "fee", "service charge"]):
            debit = first_amount
            credit = 0.0
        elif any(token in description_lower for token in ["transfer from", "pay in", "deposit", "salary", "credit", "refund"]) or (" from " in description_lower and " to " not in description_lower and "trf to" not in description_lower):
            debit = 0.0
            credit = first_amount
        elif any(token in description_lower for token in ["to ", "transfer to", "trf to", "payment for", "withdrawal", "debit", "mobile transfer to", "cob trf to", "payment by", "pay by"]):
            debit = first_amount
            credit = 0.0
        elif "transfer" in description_lower:
            if " from " in description_lower or "from " in description_lower:
                debit = 0.0
                credit = first_amount
            else:
                debit = first_amount
                credit = 0.0
        else:
            debit = first_amount
            credit = 0.0

        if abs(first_amount) < 0.01:
            continue

        date_value = next((line for line in filtered_block if _is_date_value(line)), "")
        if not date_value or not re.search(r"[A-Za-z]", description):
            continue
        if re.fullmatch(r"[-+]?\d[\d,]*\.\d{2}", description):
            continue
        if re.fullmatch(r"[-+]?\d[\d,]*\.\d{2}", date_value.replace("\n", "").replace("-", "")):
            continue
        transactions.append({
            "date": date_value,
            "description": description,
            "debit": debit,
            "credit": credit,
            "balance": balance,
        })

    # Remove artificial opening rows and duplicate balance-only lines when the PDF text repeats a row.
    deduped = []
    seen_keys = set()
    for tx in transactions:
        desc = (tx.get("description") or "").lower()
        if "opening balance" in desc or "closing balance" in desc:
            continue
        if re.fullmatch(r"[-\d,\.\s]+", tx.get("description") or ""):
            continue
        key = (tx.get("date"), tx.get("description"), tx.get("debit"), tx.get("credit"), tx.get("balance"))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(tx)

    return deduped


def run_local_extractor(raw_bytes: bytes) -> Dict[str, Any]:
    """Tier 3: Offline PyMuPDF + pdfplumber + XGBoost analysis."""
    # 1. PyMuPDF Metadata & Layout Metrics
    try:
        doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
        metadata = doc.metadata or {}
        producer = (metadata.get("producer") or "").lower()
        creator = (metadata.get("creator") or "").lower()
        is_suspicious_tool = int(any(t in producer or t in creator for t in SUSPICIOUS_TOOLS))
        has_empty_producer = int(len(producer.strip()) == 0)

        xref_count = len(re.findall(rb"xref\b|/XRef\b", raw_bytes))
        trailer_count = len(re.findall(rb"trailer\b", raw_bytes))
        has_multiple_revisions = int(xref_count > 1 or trailer_count > 1)
        mod_date = metadata.get("modDate") or ""
        creation_date = metadata.get("creationDate") or ""
        date_tampered = int(bool(mod_date and creation_date and mod_date != creation_date))

        all_fonts = set()
        font_sizes = []
        char_widths = []
        amount_x_coords = []

        for page in doc:
            for f in page.get_fonts():
                all_fonts.add(f[3])
            text_page = page.get_text("dict")
            for block in text_page.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        font_sizes.append(round(span.get("size", 0), 1))
                        text = span.get("text", "").strip()
                        if re.match(r"^[\d,]+\.\d{2}$", text):
                            bbox = span.get("bbox", [0, 0, 0, 0])
                            amount_x_coords.append(round(bbox[0], 1))
                            if len(text) > 0:
                                char_widths.append((bbox[2] - bbox[0]) / len(text))

        font_variety = len(set(font_sizes))
        x_alignment_variance = float(np.var(amount_x_coords)) if len(amount_x_coords) > 5 else 0.0
        char_width_variance = float(np.var(char_widths)) if len(char_widths) > 5 else 0.0
        page_count = len(doc)
        doc.close()
    except Exception:
        is_suspicious_tool, has_empty_producer, xref_count, trailer_count = 0, 0, 1, 1
        has_multiple_revisions, date_tampered, font_variety = 0, 0, 1
        all_fonts, x_alignment_variance, char_width_variance, page_count = set(), 0.0, 0.0, 1
        producer, creator = "", ""

    # 2. Dynamic XGBoost Inference (Resolves feature mismatch)
    tamper_proba = 0.0
    if MODEL_PATH.exists():
        try:
            booster = tamper_model.get_booster()
            expected_features = booster.feature_names

            if expected_features == ["is_suspicious_tool", "revision_count", "font_count", "page_count"]:
                # Matches your 4-feature trained model artifact
                feat_df = pd.DataFrame([{
                    "is_suspicious_tool": is_suspicious_tool,
                    "revision_count": xref_count,
                    "font_count": len(all_fonts),
                    "page_count": page_count,
                }])
            else:
                # Matches the 11-feature model artifact
                feat_df = pd.DataFrame([{
                    "is_suspicious_tool": is_suspicious_tool,
                    "has_empty_producer": has_empty_producer,
                    "revision_count": xref_count,
                    "trailer_count": trailer_count,
                    "has_multiple_revisions": has_multiple_revisions,
                    "date_tampered": date_tampered,
                    "font_count": len(all_fonts),
                    "font_variety": font_variety,
                    "x_alignment_variance": x_alignment_variance,
                    "char_width_variance": char_width_variance,
                    "page_count": page_count,
                }])

            tamper_proba = float(tamper_model.predict_proba(feat_df)[0][1])
        except Exception as e:
            print(f"XGBoost scoring note: {e}")

    # 3. Text-line extraction for statement PDFs that are not regular tables
    full_text = ""
    raw_rows = []
    try:
        with pymupdf.open(stream=raw_bytes, filetype="pdf") as doc:
            for page in doc:
                t = page.get_text("text") or ""
                if t:
                    full_text += t + "\n"
    except Exception:
        full_text = ""

    try:
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
            for page in pdf.pages:
                for tbl in (page.extract_tables() or []):
                    for row in tbl:
                        clean = [str(c).strip() if c is not None else "" for c in row]
                        if any(clean):
                            raw_rows.append(clean)
    except Exception:
        raw_rows = []

    detected_bank = detect_bank_provider(full_text)
    detected_account_name = detect_account_name(full_text)
    detected_account_number = detect_account_number(full_text)

    table_transactions = _extract_table_transactions(raw_rows)
    text_transactions = _extract_text_transactions(_normalize_statement_text(full_text))
    transactions = table_transactions or text_transactions

    valid_transactions = []
    date_pattern = r"\d{1,2}[-/][A-Za-z]{3,4}[-/]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2}"
    for tx in transactions:
        candidate_date = str(tx.get("date", "")).replace("\n", " ").strip()
        description = str(tx.get("description", "")).strip()
        if not candidate_date and not description:
            continue
        if not re.search(date_pattern, candidate_date, flags=re.IGNORECASE):
            continue
        if re.fullmatch(r"[-\d,\.\s]+", description):
            continue
        if not re.search(r"[A-Za-z]", description):
            continue
        if any(token in description.lower() for token in ["opening balance", "closing balance", "total debit", "total credit", "summary", "debit count", "credit count"]):
            continue
        valid_transactions.append(tx)
    transactions = valid_transactions

    if not transactions and raw_rows:
        date_idx, desc_idx, dr_idx, cr_idx, bal_idx = 0, 1, 2, 3, 4
        if raw_rows and any("date" in c.lower() for c in raw_rows[0]):
            first_row = [c.lower() for c in raw_rows[0]]
            for i, col in enumerate(first_row):
                if any(k in col for k in ["date", "time", "trans"]):
                    date_idx = i
                elif any(k in col for k in ["desc", "particular", "narration", "details"]):
                    desc_idx = i
                elif any(k in col for k in ["dr", "debit", "withdrawal"]):
                    dr_idx = i
                elif any(k in col for k in ["cr", "credit", "deposit"]):
                    cr_idx = i
                elif any(k in col for k in ["bal", "running"]):
                    bal_idx = i

        start_row = 1 if raw_rows and any("date" in c.lower() for c in raw_rows[0]) else 0
        for r in raw_rows[start_row:]:
            if len(r) > max(date_idx, desc_idx):
                dr = parse_num(r[dr_idx]) if dr_idx < len(r) else 0.0
                cr = parse_num(r[cr_idx]) if cr_idx < len(r) else 0.0
                bal = parse_num(r[bal_idx]) if bal_idx < len(r) else 0.0
                if dr > 0 or cr > 0 or bal > 0:
                    transactions.append({
                        "date": r[date_idx] if date_idx < len(r) else "",
                        "description": r[desc_idx] if desc_idx < len(r) else "",
                        "debit": dr,
                        "credit": cr,
                        "balance": bal
                    })

    reason_codes = []
    if is_suspicious_tool:
        reason_codes.append(f"SUSPICIOUS_PRODUCER_TOOL: {producer or creator}")
    if has_multiple_revisions:
        reason_codes.append(f"INCREMENTAL_REVISION_ANOMALY: {xref_count} xrefs")
    if date_tampered:
        reason_codes.append("METADATA_TIMESTAMP_MODIFIED_POST_CREATION")

    if tamper_proba > 0.70 or is_suspicious_tool:
        status = "POSSIBLE_MANIPULATION"
        score = 25
    elif tamper_proba > 0.35 or has_multiple_revisions:
        status = "MANUAL_REVIEW"
        score = 65
    else:
        status = "VERIFIED"
        score = 98

    opening_balance = None
    opening_match = re.search(r"opening balance\s*[:\-]?\s*(-?\d[\d,]*\.\d{2})", full_text, flags=re.IGNORECASE)
    if opening_match:
        opening_balance = float(opening_match.group(1).replace(",", ""))
    for tx in transactions:
        if "opening balance" in str(tx.get("description", "")).lower():
            opening_balance = float(tx.get("balance", 0.0) or 0.0)
            break
    if opening_balance is None and transactions:
        opening_balance = 0.0

    closing_match = re.search(r"closing balance\s*[:\-]?\s*(-?\d[\d,]*\.\d{2})", full_text, flags=re.IGNORECASE)
    closing_balance = float(closing_match.group(1).replace(",", "")) if closing_match else (float(transactions[-1].get("balance", 0.0) or 0.0) if transactions else 0.0)

    return {
        "status": status,
        "bank_provider": detected_bank,
        "account_name": detected_account_name,
        "account_number": detected_account_number,
        "tamperConfidence": round(tamper_proba, 2),
        "integrityScore": score,
        "reasonCodes": reason_codes,
        "transactions": transactions,
        "opening_balance": opening_balance,
        "closing_balance": closing_balance
    }