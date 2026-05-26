-- ============================================================
-- Admin Workspace Migration v1
-- Tables: admin_followups, marketing_campaigns, brand_todos
-- ============================================================
-- All 3 tables are SHARED across admins (no admin_id ownership).
-- Safe to re-run (idempotent).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. admin_followups — penagihan / outreach reminder queue
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_followups (
    id SERIAL PRIMARY KEY,

    -- Optional link to user (NULL for non-user followups)
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Content
    title VARCHAR(200) NOT NULL,
    note TEXT,
    category VARCHAR(50) DEFAULT 'general',  -- 'renewal' | 'payment' | 'support' | 'general'

    -- Schedule
    due_date TIMESTAMPTZ NOT NULL,
    reminder_sent_at TIMESTAMPTZ,            -- track when reminder was last viewed

    -- Status: 'pending' | 'in_progress' | 'done' | 'cancelled'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Priority: 'low' | 'normal' | 'high' | 'urgent'
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',

    -- Audit
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followups_status ON admin_followups(status);
CREATE INDEX IF NOT EXISTS idx_followups_due_date ON admin_followups(due_date);
CREATE INDEX IF NOT EXISTS idx_followups_user_id ON admin_followups(user_id);

-- ============================================================
-- 2. marketing_campaigns — flexible budget tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id SERIAL PRIMARY KEY,

    name VARCHAR(200) NOT NULL,
    description TEXT,
    platform VARCHAR(50),                    -- 'twitter' | 'telegram' | 'discord' | 'influencer' | 'other'

    -- Money
    budget_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
    spent_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,

    -- Custom fields — any extra key/value the user wants to track
    -- Example: {"impressions": 50000, "conversions": 12, "tags": ["promo", "Q2"]}
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Line items (flexible)
    -- Example: [{"label": "Ad spend", "amount": 100, "date": "2025-05-20", "note": "..."}]
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Schedule
    start_date DATE,
    end_date DATE,

    -- Status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled'
    status VARCHAR(20) NOT NULL DEFAULT 'planning',

    -- Audit
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON marketing_campaigns(platform);

-- ============================================================
-- 3. brand_todos — internal task list for LuxQuant team
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_todos (
    id SERIAL PRIMARY KEY,

    title VARCHAR(200) NOT NULL,
    description TEXT,

    -- Category: 'product' | 'marketing' | 'ops' | 'bug' | 'idea' | 'other'
    category VARCHAR(50) DEFAULT 'other',

    -- Status: 'backlog' | 'in_progress' | 'done' | 'cancelled'
    status VARCHAR(20) NOT NULL DEFAULT 'backlog',

    -- Priority: 'low' | 'normal' | 'high' | 'urgent'
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',

    -- Optional deadline
    due_date DATE,

    -- Free-form tags array
    -- Example: ["frontend", "v2", "user-request"]
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Audit
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON brand_todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON brand_todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_category ON brand_todos(category);

-- ============================================================
-- Auto-update updated_at trigger function (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Attach trigger to each table (drop+create for idempotency)
DROP TRIGGER IF EXISTS trg_followups_updated_at ON admin_followups;
CREATE TRIGGER trg_followups_updated_at
    BEFORE UPDATE ON admin_followups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON marketing_campaigns;
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON marketing_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_todos_updated_at ON brand_todos;
CREATE TRIGGER trg_todos_updated_at
    BEFORE UPDATE ON brand_todos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================================
-- Verify
-- ============================================================
SELECT
    table_name,
    (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns
FROM (VALUES ('admin_followups'), ('marketing_campaigns'), ('brand_todos')) t(table_name);
