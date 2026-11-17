# ml-service/multi_statement_reconciler.py
from datetime import datetime
from typing import List, Dict, Any, Tuple
import re

def parse_date(date_str: str) -> datetime:
    clean_date = re.sub(r"[^\w\s\-/]", "", str(date_str)).strip()
    formats = [
        "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y",
        "%d %b %Y", "%d %B %Y", "%Y/%m/%d"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean_date, fmt)
        except ValueError:
            continue
    return datetime.min

def _amount_close(a: float, b: float) -> bool:
    """Match across different account statements even when the same transfer is rounded or shifted by fees."""
    if a <= 0 or b <= 0:
        return False
    tolerance = max(100.0, min(a, b) * 0.01)
    return abs(a - b) <= tolerance


def _parse_beneficiary_from_description(description: str) -> str:
    text = (description or "").strip()
    if not text:
        return ""

    match = re.search(r"(?:TO|FROM)\s+([A-Z0-9][A-Za-z0-9 .,'-]{2,80})\b", text, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()

    tokens = re.split(r"\s{2,}|\s+-\s+|\s*\*\*\d+", text)
    for token in tokens:
        cleaned = token.strip()
        if len(cleaned) > 3 and not re.fullmatch(r"[A-Z0-9/\-]+", cleaned):
            return cleaned
    return text


def _looks_like_transfer(description: str) -> bool:
    text = (description or "").lower()
    keywords = [
        "transfer", "bank transfer", "fund transfer", "wire", "intra", "interbank",
        "same day", "swift", "domestic transfer", "cash transfer", "tt", "pay", "sent to",
        "nip", "mobile transfer", "cob trf", "trf to", "trf from", "credit to", "debit to"
    ]
    return any(keyword in text for keyword in keywords)


def _description_match(description_a: str, description_b: str) -> bool:
    left = (description_a or "").strip()
    right = (description_b or "").strip()
    if not left or not right:
        return True
    if left.lower() == right.lower():
        return True
    if _looks_like_transfer(left) or _looks_like_transfer(right):
        return True
    if left.lower() in right.lower() or right.lower() in left.lower():
        return True
    return False


def reconcile_client_multi_accounts(
    statements: List[Dict[str, Any]], 
    tolerance_days: int = 2
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Consolidates multiple accounts for the same client:
    - Neutralizes internal transfers (±48-hour window) to eliminate double-counted expenses.
    - Tags fund flow directions (e.g., Outflow to Stanbic, Inflow from Zenith).
    - Flags repeated same-amount movement patterns that may indicate funds moved to multiple beneficiaries.
    """
    flat_transactions = []

    for idx, stmt in enumerate(statements):
        acct_id = stmt.get("account_number") or stmt.get("fileName") or f"Account_{idx + 1}"
        bank_name = stmt.get("bank_provider") or "Unknown Bank"

        for tx in stmt.get("transactions", []):
            flat_transactions.append({
                "account_id": acct_id,
                "bank_name": bank_name,
                "file_name": stmt.get("fileName", ""),
                "date": tx.get("date", ""),
                "parsed_date": parse_date(tx.get("date", "")),
                "description": tx.get("description", ""),
                "debit": float(tx.get("debit", 0.0) or 0.0),
                "credit": float(tx.get("credit", 0.0) or 0.0),
                "balance": float(tx.get("balance", 0.0) or 0.0),
                "is_internal_transfer": False,
                "transfer_pair_id": None,
                "transfer_source": None,
                "transfer_destination": None,
            })

    flat_transactions.sort(key=lambda x: x["parsed_date"])

    debits = [tx for tx in flat_transactions if tx["debit"] > 0]
    credits = [tx for tx in flat_transactions if tx["credit"] > 0]

    inter_account_flows = []
    pair_counter = 1
    seen_pairs = set()

    for dr in debits:
        for cr in credits:
            if dr["account_id"] == cr["account_id"]:
                continue

            same_amount = _amount_close(dr["debit"], cr["credit"])
            time_window = abs((cr["parsed_date"] - dr["parsed_date"]).days) <= tolerance_days
            description_match = _description_match(dr["description"], cr["description"])

            if same_amount and time_window and description_match:
                pair_key = (
                    dr["account_id"],
                    cr["account_id"],
                    round(dr["debit"], 2),
                    round(cr["credit"], 2),
                    dr["date"],
                    cr["date"],
                )
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)

                pair_id = f"FLOW_{pair_counter:03d}"
                pair_counter += 1

                dr.setdefault("transfer_pair_ids", [])
                cr.setdefault("transfer_pair_ids", [])
                if pair_id not in dr["transfer_pair_ids"]:
                    dr["transfer_pair_ids"].append(pair_id)
                if pair_id not in cr["transfer_pair_ids"]:
                    cr["transfer_pair_ids"].append(pair_id)

                dr["is_internal_transfer"] = bool(dr.get("transfer_pair_ids"))
                cr["is_internal_transfer"] = bool(cr.get("transfer_pair_ids"))
                dr["transfer_destination"] = cr["bank_name"]
                cr["transfer_source"] = dr["bank_name"]

                inter_account_flows.append({
                    "flow_id": pair_id,
                    "from_bank": dr["bank_name"],
                    "from_account": dr["account_id"],
                    "to_bank": cr["bank_name"],
                    "to_account": cr["account_id"],
                    "amount": dr["debit"],
                    "outflow_date": dr["date"],
                    "inflow_date": cr["date"],
                    "description": dr["description"] or cr["description"],
                    "matched_by": "same_amount_and_time_window",
                    "beneficiary": _parse_beneficiary_from_description(cr["description"] or dr["description"]),
                })

    amount_clusters = {}
    for flow in inter_account_flows:
        bucket = round(flow["amount"] / 1000.0) * 1000.0
        amount_clusters.setdefault(bucket, []).append(flow)

    repeated_same_amount_movements = []
    for amount, flows in amount_clusters.items():
        if len(flows) > 1:
            destination_banks = sorted({flow["to_bank"] for flow in flows})
            source_banks = sorted({flow["from_bank"] for flow in flows})
            repeated_same_amount_movements.append({
                "amount": amount,
                "match_count": len(flows),
                "source_banks": source_banks,
                "destination_banks": destination_banks,
                "beneficiaries": sorted({flow.get("beneficiary") for flow in flows if flow.get("beneficiary")}),
                "flows": flows,
            })

    suspicious_multiplicity = []
    threshold_amount = 1000.0
    for cluster in repeated_same_amount_movements:
        amount = cluster["amount"]
        count = cluster["match_count"]
        if amount >= threshold_amount and count >= 2:
            suspicious_multiplicity.append({
                "amount": amount,
                "count": count,
                "beneficiaries": cluster["beneficiaries"],
                "source_banks": cluster["source_banks"],
                "destination_banks": cluster["destination_banks"],
                "reason": "Same amount moved to multiple recipients within a short period",
            })

    gross_inflows = sum(tx["credit"] for tx in flat_transactions)
    gross_outflows = sum(tx["debit"] for tx in flat_transactions)
    internal_flow_volume = sum(f["amount"] for f in inter_account_flows)

    true_external_revenue = max(0.0, gross_inflows - internal_flow_volume)
    true_external_expenses = max(0.0, gross_outflows - internal_flow_volume)
    net_operational_cashflow = true_external_revenue - true_external_expenses
    circular_ratio = (internal_flow_volume / gross_inflows * 100.0) if gross_inflows > 0 else 0.0

    flow_summary = {
        "statements_analyzed_count": len(statements),
        "total_cross_account_transactions": len(flat_transactions),
        "gross_turnover": round(gross_inflows, 2),
        "gross_expenses": round(gross_outflows, 2),
        "internal_transfers_deducted": round(internal_flow_volume, 2),
        "internal_transfer_events_count": len(inter_account_flows),
        "true_operational_inflow": round(true_external_revenue, 2),
        "true_operational_expense": round(true_external_expenses, 2),
        "net_operational_cashflow": round(net_operational_cashflow, 2),
        "circular_ratio_pct": round(circular_ratio, 2),
        "circular_velocity_risk": "HIGH_CIRCULAR_MOVEMENT" if circular_ratio > 35 else ("MODERATE" if circular_ratio > 15 else "LOW"),
        "detected_flows": inter_account_flows,
        "same_amount_transfer_clusters": repeated_same_amount_movements,
        "multi_destination_transfer_count": sum(1 for cluster in repeated_same_amount_movements if len(cluster["destination_banks"]) > 1 or len(cluster["source_banks"]) > 1),
        "same_amount_suspicious_patterns": suspicious_multiplicity,
    }

    return flat_transactions, flow_summary