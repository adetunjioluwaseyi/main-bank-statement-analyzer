# ml-service/extractor.py
import io
import re
from typing import List, Dict, Any, Tuple, Optional
import pdfplumber

NIGERIAN_FINANCIAL_INSTITUTIONS = [
    "STANBIC IBTC", "FIDELITY", "UNION BANK", "ACCESS BANK", "ZENITH",
    "FIRST BANK", "GTBANK", "GUARANTY TRUST", "UBA",
    "UNITED BANK FOR AFRICA", "STERLING", "FCMB", "FIRST CITY MONUMENT",
    "WEMA", "KUDA", "MONIEPOINT", "OPAY", "PALMPAY", "POLARIS", "KEYSTONE"
]

DATE_RE = re.compile(
    r"^(?:\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})$"
)
MONEY_TOKEN_RE = re.compile(r"^-?\(?\d{1,3}(?:,\d{3})*\.\d{2}\)?$")
MAX_SANE_TX_AMOUNT = 50_000_000_000.0  # 50 Billion NGN sanity cap per single transaction


def parse_num(val: Any) -> float:
    if val is None:
        return 0.0
    raw = str(val).strip()
    if not raw or raw in ["-", "--", "None", "null", ""]:
        return 0.0
    # Reject strings containing multiple newline-separated numbers (merged cells)
    if "\n" in raw:
        parts = [p.strip() for p in raw.split("\n") if p.strip()]
        if len(parts) > 1:
            return parse_num(parts[0])
    normalized = re.sub(r"\b(?:NGN|USD|GBP|EUR|KES|ZAR|KSH|GHS|CR|DR|₦)\b", "", raw, flags=re.IGNORECASE).strip()
    # Must look like a formatted decimal amount, not a 10-digit NUBAN or 19-digit ref ID
    if not MONEY_TOKEN_RE.match(normalized):
        return 0.0
    is_neg = normalized.startswith("-") or (normalized.startswith("(") and normalized.endswith(")"))
    clean = re.sub(r"[^\d.]", "", normalized)
    try:
        num = float(clean)
        if abs(num) > MAX_SANE_TX_AMOUNT:
            return 0.0
        return -num if is_neg else num
    except ValueError:
        return 0.0


def detect_bank_provider(header_text: str, filename: str = "") -> str:
    combined = (header_text + " " + filename).upper()
    if "STANBIC" in combined:
        return "Stanbic IBTC Bank"
    if "FIDELITY" in combined:
        return "Fidelity Bank"
    if "UNION" in combined:
        return "Union Bank of Nigeria"
    if "ZENITH" in combined:
        return "Zenith Bank"
    if "ACCESS" in combined:
        return "Access Bank"
    if "FIRST BANK" in combined:
        return "First Bank"
    if "GTB" in combined or "GUARANTY" in combined:
        return "GTBank"
    if "UBA" in combined:
        return "UBA"
    if "MONIEPOINT" in combined:
        return "Moniepoint"
    if "OPAY" in combined:
        return "OPay"

    for bank in NIGERIAN_FINANCIAL_INSTITUTIONS:
        if bank in combined:
            return " ".join(word.capitalize() for word in bank.split())
    return "Commercial Bank"


def extract_front_page_metadata(first_page_text: str) -> Dict[str, Any]:
    """Extracts official summary totals, account info, and period from Page 1."""
    meta: Dict[str, Any] = {
        "account_number": "",
        "account_name": "Account Holder",
        "period_start": "",
        "period_end": "",
        "reported_total_debit": None,
        "reported_total_credit": None,
        "reported_closing_balance": None,
    }

    # Account Number (10-digit NUBAN)
    acc_match = re.search(r"(?:Account\s*(?:No\.?|Number)?|Acct\s*No\.?|NUBAN)\s*[:|]?\s*(\d{10})", first_page_text, re.IGNORECASE)
    if acc_match:
        meta["account_number"] = acc_match.group(1)
    else:
        m2 = re.search(r"\b(\d{10})\b", first_page_text)
        if m2:
            meta["account_number"] = m2.group(1)

    # Account Name / Applicant
    name_match = re.search(
        r"(?:Account\s*name|Applicant\(s\)|Customer\s*Name|Account\s*Holder)\s*[:|]?\s*([A-Za-z0-9\s.,&'-]+)",
        first_page_text,
        re.IGNORECASE,
    )
    if name_match:
        candidate = name_match.group(1).split("\n")[0].strip(" |:-")
        if len(candidate) > 2 and candidate.lower() not in {"applicant", "corporate", "current"}:
            meta["account_name"] = candidate

    # Statement Period (e.g., "Jan 15, 2025 to Jan 15, 2026" or "2025-09-24 to 2026-09-24")
    period_match = re.search(
        r"Period\s*[:|]?\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4}|\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4}|\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})",
        first_page_text,
        re.IGNORECASE,
    )
    if period_match:
        meta["period_start"] = period_match.group(1).strip()
        meta["period_end"] = period_match.group(2).strip()

    # Official Summary Totals (Total Debit, Total Credit, Book/Available Balance)
    td_match = re.search(r"Total\s+Debit\s*[:|]?\s*(\d{1,3}(?:,\d{3})*\.\d{2})", first_page_text, re.IGNORECASE)
    if td_match:
        meta["reported_total_debit"] = float(td_match.group(1).replace(",", ""))

    tc_match = re.search(r"Total\s+Credit\s*[:|]?\s*(\d{1,3}(?:,\d{3})*\.\d{2})", first_page_text, re.IGNORECASE)
    if tc_match:
        meta["reported_total_credit"] = float(tc_match.group(1).replace(",", ""))

    bal_match = re.search(r"(?:Book\s+Balance|Available\s+Balance|Closing\s+Balance)\s*[:|]?\s*(-?\d{1,3}(?:,\d{3})*\.\d{2})", first_page_text, re.IGNORECASE)
    if bal_match:
        meta["reported_closing_balance"] = float(bal_match.group(1).replace(",", ""))

    return meta


def _map_page_headers(row: List[str]) -> Optional[Tuple[int, int, int, int, int]]:
    """Detects column positions for a single page's table header row."""
    lowered = [c.lower().strip() for c in row]
    row_str = " ".join(lowered)
    if not any(k in row_str for k in ["debit", "credit", "pay in", "pay out", "withdrawal", "deposit"]):
        return None
    if "balance" not in row_str and "bal" not in row_str:
        return None

    date_idx, desc_idx, dr_idx, cr_idx, bal_idx = -1, -1, -1, -1, -1
    for i, col in enumerate(lowered):
        if any(k in col for k in ["tran. date", "trans date", "posting date", "posted date", "date"]):
            if date_idx == -1 or "tran" in col:
                date_idx = i
        elif any(k in col for k in ["transaction details", "details", "description", "particulars", "narration", "channel"]):
            desc_idx = i
        elif any(k in col for k in ["debit", "pay out", "withdrawal", "dr"]):
            dr_idx = i
        elif any(k in col for k in ["credit", "pay in", "deposit", "cr"]):
            cr_idx = i
        elif any(k in col for k in ["balance", "bal"]):
            bal_idx = i

    if dr_idx != -1 and cr_idx != -1 and bal_idx != -1:
        if date_idx == -1:
            date_idx = 0
        if desc_idx == -1:
            desc_idx = 2 if date_idx == 0 else 1
        return date_idx, desc_idx, dr_idx, cr_idx, bal_idx
    return None


def _split_merged_row(row: List[str]) -> List[List[str]]:
    """
    Splits table rows where pdfplumber merged 2 stacked transactions into one cell
    separated by newlines (e.g., '09-Jan-2026\\n09-Jan-2026' and '25.00\\n1.88').
    """
    split_cols = [[part.strip() for part in cell.split("\n") if part.strip()] for cell in row]
    # Check if numeric columns (Debit/Credit/Balance) have matching multi-line counts (e.g. 2 stacked txns)
    multi_lengths = [len(c) for c in split_cols if len(c) > 1 and all(MONEY_TOKEN_RE.match(x) for x in c)]
    if multi_lengths and len(set(multi_lengths)) == 1 and multi_lengths[0] > 1:
        n = multi_lengths[0]
        expanded: List[List[str]] = []
        for idx in range(n):
            new_r = []
            for col_parts in split_cols:
                if len(col_parts) == n:
                    new_r.append(col_parts[idx])
                elif len(col_parts) == 1:
                    new_r.append(col_parts[0])
                elif len(col_parts) > n:
                    # Narration lines distributed across stacked rows
                    chunk_size = max(1, len(col_parts) // n)
                    start = idx * chunk_size
                    end = len(col_parts) if idx == n - 1 else (idx + 1) * chunk_size
                    new_r.append(" ".join(col_parts[start:end]))
                else:
                    new_r.append(col_parts[0] if col_parts else "")
            expanded.append(new_r)
        return expanded

    return [[cell.replace("\n", " ").strip() for cell in row]]


def extract_ledger_from_pdf(file_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    page_texts: List[str] = []
    transactions: List[Dict[str, Any]] = []
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for p_idx, page in enumerate(pdf.pages):
            txt = page.extract_text() or ""
            page_texts.append(txt)

            # Skip Page 1 if it is a mybankStatement / Stanbic cover summary page
            if p_idx == 0 and ("SUMMARY INFO" in txt.upper() or "TRANSACTION SUMMARY" in txt.upper()):
                continue

            tables = page.extract_tables() or []
            if not tables:
                tables = page.extract_tables(
                    table_settings={"vertical_strategy": "text", "horizontal_strategy": "text"}
                ) or []

            # Default column indices (updated per page when header row is encountered)
            col_map: Optional[Tuple[int, int, int, int, int]] = None

            for tbl in tables:
                for raw_r in tbl:
                    if not raw_r or not any(raw_r):
                        continue

                    # Check if this row is a header row for the current page
                    cleaned_header = [str(c).replace("\n", " ").strip() if c else "" for c in raw_r]
                    detected_map = _map_page_headers(cleaned_header)
                    if detected_map:
                        col_map = detected_map
                        continue

                    if col_map is None:
                        # Infer standard layout if header wasn't captured on this page
                        if len(raw_r) >= 7:
                            # e.g., [Tran Date, Value Date, Details, Debit, Credit, Spacer, Balance]
                            col_map = (0, 2, 3, 4, 6)
                        elif len(raw_r) == 6:
                            col_map = (0, 2, 3, 4, 5)
                        else:
                            col_map = (0, 1, 2, 3, 4)

                    date_idx, desc_idx, dr_idx, cr_idx, bal_idx = col_map

                    # Expand stacked multi-transaction rows cleanly
                    for r in _split_merged_row([str(c) if c is not None else "" for c in raw_r]):
                        row_upper = " ".join(r).upper()

                        if "OPENING BALANCE" in row_upper:
                            for cell in reversed(r):
                                val = parse_num(cell)
                                if val != 0.0 or cell in ["0.00", "0"]:
                                    opening_balance = val
                                    break
                            continue

                        if "CLOSING BALANCE" in row_upper:
                            for cell in reversed(r):
                                val = parse_num(cell)
                                if val != 0.0 or cell in ["0.00", "0"]:
                                    closing_balance = val
                                    break
                            continue

                        # Handle shifted empty spacer columns dynamically (e.g., Balance in last non-empty cell)
                        non_empty_indices = [idx for idx, val in enumerate(r) if val.strip()]
                        if len(non_empty_indices) < 4:
                            continue

                        # Find date token anywhere in the first 3 columns
                        date_val = ""
                        actual_date_col = date_idx
                        for candidate_col in range(min(3, len(r))):
                            token = r[candidate_col].replace(" ", "")
                            if DATE_RE.match(token):
                                date_val = token
                                actual_date_col = candidate_col
                                break

                        if not date_val:
                            continue

                        # Extract numeric cells from the right side of the row (Balance, Credit, Debit)
                        # In Stanbic / Union / Fidelity, the rightmost 3 numeric cells are Debit, Credit, Balance
                        # (or Pay In, Pay Out, Balance for Fidelity)
                        numeric_cells = [(idx, parse_num(r[idx])) for idx in range(len(r)) if MONEY_TOKEN_RE.match(r[idx].strip())]
                        if len(numeric_cells) < 2:
                            continue

                        # Description is the text column not occupied by dates or numeric amounts
                        numeric_col_set = {idx for idx, _ in numeric_cells}
                        desc_parts = [
                            r[idx]
                            for idx in range(len(r))
                            if idx not in numeric_col_set
                            and idx != actual_date_col
                            and not DATE_RE.match(r[idx].replace(" ", ""))
                            and r[idx].strip()
                        ]
                        desc_val = " ".join(desc_parts).strip()

                        if any(skip in desc_val.lower() for skip in ["total debit", "total credit", "clrd + unclrd"]):
                            continue

                        bal_val = numeric_cells[-1][1]
                        if len(numeric_cells) >= 3:
                            first_amt = numeric_cells[-3][1]
                            second_amt = numeric_cells[-2][1]
                            first_page_upper = (page_texts[0] if page_texts else "").upper()
                            if "FIDELITY" in first_page_upper or "FIDELITY" in filename.upper():
                                cr_val, dr_val = first_amt, second_amt
                            else:
                                dr_val, cr_val = first_amt, second_amt
                        else:
                            # Only 1 movement column + Balance
                            amt = numeric_cells[-2][1]
                            dr_val, cr_val = amt, 0.0

                        if dr_val == 0.0 and cr_val == 0.0 and bal_val == 0.0:
                            continue

                        transactions.append({
                            "date": date_val,
                            "description": desc_val or "Bank Transaction",
                            "debit": round(dr_val, 2),
                            "credit": round(cr_val, 2),
                            "balance": round(bal_val, 2),
                        })

    first_page_text = page_texts[0] if page_texts else ""
    detected_bank = detect_bank_provider(first_page_text, filename)
    front_meta = extract_front_page_metadata(first_page_text)

    # Stanbic mybankStatement lists transactions in reverse chronological order (newest on Page 2, oldest on last page).
    # Reverse to chronological order so opening balance, running balance, and weekly/monthly progressions align.
    if len(transactions) >= 2:
        first_dt = transactions[0]["date"]
        last_dt = transactions[-1]["date"]
        if first_dt != last_dt and "2026" in first_dt and "2025" in last_dt:
            transactions.reverse()

    calc_inflow = round(sum(tx["credit"] for tx in transactions), 2)
    calc_outflow = round(sum(tx["debit"] for tx in transactions), 2)

    if opening_balance is None:
        if transactions:
            first_tx = transactions[0]
            opening_balance = round(first_tx["balance"] - first_tx["credit"] + first_tx["debit"], 2)
        else:
            opening_balance = 0.0

    if closing_balance is None:
        if front_meta["reported_closing_balance"] is not None:
            closing_balance = front_meta["reported_closing_balance"]
        elif transactions:
            closing_balance = transactions[-1]["balance"]
        else:
            closing_balance = 0.0

    return {
        "bank_provider": detected_bank,
        "account_number": front_meta["account_number"],
        "account_name": front_meta["account_name"],
        "periodStart": front_meta["period_start"],
        "periodEnd": front_meta["period_end"],
        "opening_balance": round(opening_balance, 2),
        "closing_balance": round(closing_balance, 2),
        "total_inflow": front_meta["reported_total_credit"] if front_meta["reported_total_credit"] is not None else calc_inflow,
        "total_outflow": front_meta["reported_total_debit"] if front_meta["reported_total_debit"] is not None else calc_outflow,
        "calculated_inflow": calc_inflow,
        "calculated_outflow": calc_outflow,
        "net_movement": round(
            (front_meta["reported_total_credit"] or calc_inflow)
            - (front_meta["reported_total_debit"] or calc_outflow),
            2,
        ),
        "transactions": transactions,
    }