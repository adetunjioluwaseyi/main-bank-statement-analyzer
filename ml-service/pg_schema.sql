CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_object_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    department TEXT,
    job_title TEXT,
    role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'super_admin', 'analyst', 'reviewer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE ad_group_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_object_id TEXT UNIQUE NOT NULL,
    app_role TEXT NOT NULL CHECK (app_role IN ('admin', 'super_admin', 'analyst', 'reviewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_credit_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    pool_name TEXT NOT NULL,
    total_credits BIGINT NOT NULL DEFAULT 0 CHECK (total_credits >= 0),
    available_credits BIGINT NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_credit_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    available_credits BIGINT NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
    total_allocated BIGINT NOT NULL DEFAULT 0 CHECK (total_allocated >= 0),
    total_consumed BIGINT NOT NULL DEFAULT 0 CHECK (total_consumed >= 0),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    target_user_id UUID NOT NULL REFERENCES users(id),
    pool_id UUID REFERENCES admin_credit_pools(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    pool_id UUID REFERENCES admin_credit_pools(id),
    allocation_id UUID REFERENCES credit_allocations(id),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('allocation', 'usage', 'refund', 'adjustment', 'reversal')),
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE uploaded_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    file_hash TEXT,
    file_type TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed', 'rejected')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    statement_id UUID REFERENCES uploaded_statements(id),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    credits_used BIGINT NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result_summary JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE generated_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    analysis_run_id UUID REFERENCES analysis_runs(id),
    report_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'archived', 'deleted'))
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    entity_type TEXT NOT NULL,
    entity_id UUID,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE statement_analysis_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES uploaded_statements(id),
    analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_ad_object_id ON users(ad_object_id);
CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id, created_at);
CREATE INDEX idx_analysis_runs_user ON analysis_runs(user_id, created_at);
CREATE INDEX idx_uploaded_statements_user ON uploaded_statements(user_id, uploaded_at);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);

CREATE OR REPLACE FUNCTION recalculate_user_credit_balance(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_allocated BIGINT;
    v_total_consumed BIGINT;
    v_available BIGINT;
BEGIN
    SELECT COALESCE(SUM(CASE
        WHEN transaction_type IN ('allocation', 'refund') THEN amount
        ELSE 0
    END), 0)
    INTO v_total_allocated
    FROM credit_transactions
    WHERE user_id = p_user_id;

    SELECT COALESCE(SUM(CASE
        WHEN transaction_type = 'usage' THEN ABS(amount)
        WHEN transaction_type = 'adjustment' THEN ABS(amount)
        ELSE 0
    END), 0)
    INTO v_total_consumed
    FROM credit_transactions
    WHERE user_id = p_user_id;

    v_available := v_total_allocated - v_total_consumed;

    INSERT INTO user_credit_balances (
        user_id,
        available_credits,
        total_allocated,
        total_consumed,
        last_updated_at
    )
    VALUES (
        p_user_id,
        v_available,
        v_total_allocated,
        v_total_consumed,
        NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        available_credits = EXCLUDED.available_credits,
        total_allocated = EXCLUDED.total_allocated,
        total_consumed = EXCLUDED.total_consumed,
        last_updated_at = EXCLUDED.last_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION sync_user_credit_balance_on_txn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM recalculate_user_credit_balance(NEW.user_id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_user_credit_balance
AFTER INSERT ON credit_transactions
FOR EACH ROW
EXECUTE FUNCTION sync_user_credit_balance_on_txn();
