import os
from pathlib import Path

from dotenv import load_dotenv

from credit_service import (
    allocate_credits_to_user,
    create_admin_pool,
    deduct_credits_for_analysis,
    ensure_user_record,
    get_user_balance,
)
from db import SessionLocal, test_connection

load_dotenv(Path(__file__).with_name(".env"))


def main():
    print("Testing PostgreSQL connection...")
    ok = test_connection()
    if not ok:
        print("PostgreSQL is not reachable. Confirm DATABASE_URL in ml-service/.env and that Postgres is running.")
        return 1

    session = SessionLocal()
    try:
        admin_id = ensure_user_record(
            session,
            email="admin.test@company.local",
            display_name="Test Admin",
            ad_object_id="test-admin-001",
            role="admin",
        )
        analyst_id = ensure_user_record(
            session,
            email="analyst.test@company.local",
            display_name="Test Analyst",
            ad_object_id="test-user-001",
            role="analyst",
        )

        pool_id = create_admin_pool(
            session,
            admin_user_id=str(admin_id),
            pool_name="Test Pool",
            total_credits=5000000,
        )
        allocation_id = allocate_credits_to_user(
            session,
            admin_user_id=str(admin_id),
            target_user_id=str(analyst_id),
            pool_id=str(pool_id),
            amount=5000,
            reason="Initial credit allocation for testing",
        )

        print("Allocation created:", allocation_id)
        print("User balance before analysis:", get_user_balance(session, str(analyst_id)))

        deducted = deduct_credits_for_analysis(
            session,
            user_id=str(analyst_id),
            amount=25,
            description="Test statement analysis",
        )
        print("Deduction successful:", deducted)
        print("User balance after analysis:", get_user_balance(session, str(analyst_id)))
    finally:
        session.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
