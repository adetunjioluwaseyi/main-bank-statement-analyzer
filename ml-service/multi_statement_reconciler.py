# ml-service/multi_statement_reconciler.py
from datetime import datetime
import re
from typing import List, Dict, Any, Tuple


def parse_date(date_str: str) -> datetime:
    if not date_str:
        return datetime(1970, 1, 1)

    cleaned = date_str.strip().split("\n")[0].split("T")[0]
    cleaned = re.sub(r"\s+\d{1,2}:\d{2}(?::\d{2})?.*$", "", cleaned).strip()

    formats = [
        "%d-%b-%y",    # 28-Apr-26 (Fidelity)
        "%d-%b-%Y",   # 28-Apr-2026
        "%Y-%m-%d",   # 2026-04-28 (Union Bank)
        "%d/%m/%Y",   # 28/04/2026
        "%d-%m-%Y",   # 28-04-2026
        "%b %d, %Y",  # Apr 28, 2026
        "%d %b %Y",   # 28 Apr 2026
        "%Y/%m/%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            pass
    return datetime(1970, 1, 1)


def reconcile_client_multi_accounts(
    audits: List[Dict[str, Any]],
    time_window_hours: int = 72,
    max_fee_variance: float = 200.0,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Identifies and links internal transfers between different bank statements
    belonging to the same client, and deducts circular movements from gross inflow.
    """
    all_transactions: List[Dict[str, Any]] = []

    for account_idx, audit in enumerate(audits):
        b_name = audit.get("bank_provider", f"Account_{account_idx + 1}")
        acc_num = audit.get("account_number", "")

        for tx in audit.get("transactions", []):
            tx_copy = dict(tx)
            tx_copy["account_idx"] = account_idx
            tx_copy["bank_name"] = b_name
            tx_copy["account_number"] = acc_num
            tx_copy["parsed_date"] = parse_date(str(tx.get("date", "")))
            tx_copy["is_internal_transfer"] = False
            tx_copy["transfer_details"] = None
            all_transactions.append(tx_copy)

    # Sort all transactions chronologically across all accounts
    all_transactions.sort(key=lambda x: x["parsed_date"])

    matched_pairs: List[Dict[str, Any]] = []
    total_internal_fund_flow = 0.0

    # Match Outflow from Bank A with Inflow in Bank B
    for debit_tx in all_transactions:
        debit_amt = float(debit_tx.get("debit", 0.0))
        if debit_amt <= 0 or debit_tx["is_internal_transfer"]:
            continue

        for credit_tx in all_transactions:
            credit_amt = float(credit_tx.get("credit", 0.0))
            if credit_amt <= 0 or credit_tx["is_internal_transfer"]:
                continue
            if debit_tx["account_idx"] == credit_tx["account_idx"]:
                continue

            amount_diff = abs(debit_amt - credit_amt)
            dates_valid = (
                debit_tx["parsed_date"].year > 1970
                and credit_tx["parsed_date"].year > 1970
            )
            time_diff_hours = (
                abs((credit_tx["parsed_date"] - debit_tx["parsed_date"]).total_seconds()) / 3600.0
                if dates_valid
                else 0.0
            )

            is_matched = (
                dates_valid
                and time_diff_hours <= time_window_hours
                and amount_diff <= max_fee_variance
            )

            # High-value exact amount fallback (e.g., ₦50M or ₦11M cross-bank transfers)
            if not is_matched and amount_diff == 0.0 and debit_amt >= 1_000_000.0:
                is_matched = True

            if is_matched:
                debit_tx["is_internal_transfer"] = True
                credit_tx["is_internal_transfer"] = True

                source_bank = debit_tx["bank_name"]
                dest_bank = credit_tx["bank_name"]
                source_desc = debit_tx.get("description", "")
                dest_desc = credit_tx.get("description", "")

                flag_msg = (
                    f"INTERNAL FUND MOVEMENT: ₦{debit_amt:,.2f} moved from "
                    f"{source_bank} to {dest_bank} (Outflow: {debit_tx['date']}, Inflow: {credit_tx['date']})"
                )
                debit_tx["transfer_details"] = flag_msg
                credit_tx["transfer_details"] = flag_msg

                matched_pairs.append({
                    "date": debit_tx["date"],
                    "source_date": debit_tx["date"],
                    "destination_date": credit_tx["date"],
                    "amount": debit_amt,
                    "source_bank": source_bank,
                    "source_acc": debit_tx.get("account_number", ""),
                    "source_desc": source_desc,
                    "destination_bank": dest_bank,
                    "dest_acc": credit_tx.get("account_number", ""),
                    "destination_desc": dest_desc,
                    "description": flag_msg,
                })

                total_internal_fund_flow += debit_amt
                break

    total_gross_inflow = sum(float(a.get("total_inflow", 0.0)) for a in audits)
    total_gross_outflow = sum(float(a.get("total_outflow", 0.0)) for a in audits)
    true_operating_revenue = max(0.0, total_gross_inflow - total_internal_fund_flow)

    flow_summary = {
        "matched_internal_transfers_count": len(matched_pairs),
        "total_internal_fund_flow": round(total_internal_fund_flow, 2),
        "total_gross_inflow": round(total_gross_inflow, 2),
        "total_gross_outflow": round(total_gross_outflow, 2),
        "true_operational_revenue": round(true_operating_revenue, 2),
        "circular_turnover_percentage": round(
            (total_internal_fund_flow / max(1.0, total_gross_inflow)) * 100, 2
        ),
        "detected_internal_movements": matched_pairs,
    }

    return all_transactions, flow_summary