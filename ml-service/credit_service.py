from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import text

from db import SessionLocal


def ensure_user_record(
    session,
    *,
    email: str,
    display_name: str,
    ad_object_id: Optional[str] = None,
    role: str = "analyst",
):
    query = text(
        """
        INSERT INTO users (ad_object_id, email, display_name, role, created_at)
        VALUES (:ad_object_id, :email, :display_name, :role, NOW())
        ON CONFLICT (email)
        DO UPDATE SET
            display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            ad_object_id = COALESCE(users.ad_object_id, EXCLUDED.ad_object_id),
            last_login_at = NOW()
        RETURNING id
        """
    )
    result = session.execute(
        query,
        {
            "ad_object_id": ad_object_id,
            "email": email,
            "display_name": display_name,
            "role": role,
        },
    )
    session.commit()
    record = result.fetchone()
    return record[0] if record else None


def get_user_balance(session, user_id: str):
    query = text(
        """
        SELECT available_credits, total_allocated, total_consumed, last_updated_at
        FROM user_credit_balances
        WHERE user_id = :user_id
        """
    )
    result = session.execute(query, {"user_id": user_id})
    row = result.fetchone()
    if not row:
        return {"available_credits": 0, "total_allocated": 0, "total_consumed": 0, "last_updated_at": None}

    return {
        "available_credits": row[0],
        "total_allocated": row[1],
        "total_consumed": row[2],
        "last_updated_at": row[3],
    }


def create_admin_pool(session, *, admin_user_id: str, pool_name: str, total_credits: int):
    query = text(
        """
        INSERT INTO admin_credit_pools (admin_user_id, pool_name, total_credits, available_credits, created_at, updated_at)
        VALUES (:admin_user_id, :pool_name, :total_credits, :total_credits, NOW(), NOW())
        RETURNING id
        """
    )
    result = session.execute(
        query,
        {
            "admin_user_id": admin_user_id,
            "pool_name": pool_name,
            "total_credits": int(total_credits),
        },
    )
    session.commit()
    row = result.fetchone()
    return row[0] if row else None


def allocate_credits_to_user(session, *, admin_user_id: str, target_user_id: str, pool_id: str, amount: int, reason: str):
    if amount <= 0:
        raise ValueError("Allocation amount must be greater than zero")

    pool = session.execute(
        text("SELECT available_credits FROM admin_credit_pools WHERE id = :pool_id AND admin_user_id = :admin_user_id"),
        {"pool_id": pool_id, "admin_user_id": admin_user_id},
    ).fetchone()
    if not pool:
        raise ValueError("Admin pool not found or not owned by this admin")
    if int(pool[0]) < amount:
        raise ValueError("Not enough credits in the admin pool")

    allocation_id = session.execute(
        text(
            """
            INSERT INTO credit_allocations (admin_user_id, target_user_id, pool_id, amount, reason, created_at)
            VALUES (:admin_user_id, :target_user_id, :pool_id, :amount, :reason, NOW())
            RETURNING id
            """
        ),
        {
            "admin_user_id": admin_user_id,
            "target_user_id": target_user_id,
            "pool_id": pool_id,
            "amount": int(amount),
            "reason": reason,
        },
    ).fetchone()[0]

    session.execute(
        text(
            """
            UPDATE admin_credit_pools
            SET available_credits = available_credits - :amount, updated_at = NOW()
            WHERE id = :pool_id
            """
        ),
        {"amount": int(amount), "pool_id": pool_id},
    )

    session.execute(
        text(
            """
            INSERT INTO credit_transactions (
                user_id,
                pool_id,
                allocation_id,
                transaction_type,
                amount,
                balance_after,
                description,
                created_at
            )
            VALUES (
                :target_user_id,
                :pool_id,
                :allocation_id,
                'allocation',
                :amount,
                COALESCE((SELECT available_credits FROM user_credit_balances WHERE user_id = :target_user_id), 0) + :amount,
                :reason,
                NOW()
            )
            """
        ),
        {
            "target_user_id": target_user_id,
            "pool_id": pool_id,
            "allocation_id": allocation_id,
            "amount": int(amount),
            "reason": reason,
        },
    )

    session.execute(
        text(
            """
            INSERT INTO user_credit_balances (user_id, available_credits, total_allocated, total_consumed, last_updated_at)
            VALUES (:user_id, :amount, :amount, 0, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET
                available_credits = user_credit_balances.available_credits + EXCLUDED.available_credits,
                total_allocated = user_credit_balances.total_allocated + EXCLUDED.total_allocated,
                last_updated_at = NOW()
            """
        ),
        {"user_id": target_user_id, "amount": int(amount)},
    )

    session.commit()
    return allocation_id


def deduct_credits_for_analysis(session, *, user_id: str, amount: int, description: str):
    if amount <= 0:
        raise ValueError("Credit deduction amount must be greater than zero")

    balance = session.execute(
        text("SELECT available_credits FROM user_credit_balances WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()

    if not balance:
        raise ValueError("User has no credit balance record")

    if int(balance[0]) < amount:
        raise ValueError("Insufficient credits")

    session.execute(
        text(
            """
            INSERT INTO credit_transactions (
                user_id,
                transaction_type,
                amount,
                balance_after,
                description,
                created_at
            )
            VALUES (:user_id, 'usage', :amount, :balance_after, :description, NOW())
            """
        ),
        {
            "user_id": user_id,
            "amount": -int(amount),
            "balance_after": int(balance[0]) - amount,
            "description": description,
        },
    )

    session.execute(
        text(
            """
            UPDATE user_credit_balances
            SET available_credits = available_credits - :amount,
                total_consumed = total_consumed + :amount,
                last_updated_at = NOW()
            WHERE user_id = :user_id
            """
        ),
        {"user_id": user_id, "amount": int(amount)},
    )

    session.commit()
    return True


def create_analysis_run(session, *, user_id: str, statement_id: Optional[str], credits_used: int, status: str = "queued"):
    result = session.execute(
        text(
            """
            INSERT INTO analysis_runs (user_id, statement_id, status, credits_used, started_at, created_at)
            VALUES (:user_id, :statement_id, :status, :credits_used, NOW(), NOW())
            RETURNING id
            """
        ),
        {
            "user_id": user_id,
            "statement_id": statement_id,
            "status": status,
            "credits_used": int(credits_used),
        },
    )
    session.commit()
    row = result.fetchone()
    return row[0] if row else None


def register_report(session, *, user_id: str, analysis_run_id: str, report_name: str, storage_path: str):
    session.execute(
        text(
            """
            INSERT INTO generated_reports (user_id, analysis_run_id, report_name, storage_path, generated_at, status)
            VALUES (:user_id, :analysis_run_id, :report_name, :storage_path, NOW(), 'generated')
            """
        ),
        {
            "user_id": user_id,
            "analysis_run_id": analysis_run_id,
            "report_name": report_name,
            "storage_path": storage_path,
        },
    )
    session.commit()


def log_audit(session, *, user_id: Optional[str], entity_type: str, action: str, details: dict, ip_address: Optional[str] = None, user_agent: Optional[str] = None):
    session.execute(
        text(
            """
            INSERT INTO audit_logs (user_id, entity_type, action, details, ip_address, user_agent, created_at)
            VALUES (:user_id, :entity_type, :action, CAST(:details AS JSONB), :ip_address, :user_agent, NOW())
            """
        ),
        {
            "user_id": user_id,
            "entity_type": entity_type,
            "action": action,
            "details": str(details),
            "ip_address": ip_address,
            "user_agent": user_agent,
        },
    )
    session.commit()


def demo_flow():
    session = SessionLocal()
    try:
        admin_id = ensure_user_record(
            session,
            email="admin@company.com",
            display_name="System Admin",
            ad_object_id="admin-ad-001",
            role="admin",
        )
        user_id = ensure_user_record(
            session,
            email="analyst@company.com",
            display_name="Analyst User",
            ad_object_id="user-ad-001",
            role="analyst",
        )

        pool_id = create_admin_pool(session, admin_user_id=admin_id, pool_name="Corporate Pool", total_credits=5_000_000)
        allocate_credits_to_user(
            session,
            admin_user_id=admin_id,
            target_user_id=user_id,
            pool_id=pool_id,
            amount=5000,
            reason="Initial user allocation",
        )
        print(get_user_balance(session, user_id))
        deduct_credits_for_analysis(
            session,
            user_id=user_id,
            amount=25,
            description="Uploaded and analyzed statement",
        )
        print(get_user_balance(session, user_id))
    finally:
        session.close()
