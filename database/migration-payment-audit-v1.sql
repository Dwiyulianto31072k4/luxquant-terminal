-- ════════════════════════════════════════════════════════════════════
-- Payment Record Audit + Profit-sharing tag — v1
-- ════════════════════════════════════════════════════════════════════
-- Part 1: tracks which active premium/subscriber users still lack a confirmed
-- payment record, and who (which admin) is responsible for recording it.
--
-- The "needs a record" set is computed live (see /api/v1/workspace/payment-audit):
--   active premium/subscriber, created on/after the cutoff (2026-06-17),
--   with NO confirmed, non-deleted payment. Grandfathered users (before the
--   cutoff) are exempt because the new system applies from that date.
--
-- Part 2: tags each payment with its profit-sharing source (regular vs a
-- special partner like Canada) so the recap can apply the right split.
--
-- Run once on the VPS:  psql "$DB_URL" -f database/migration-payment-audit-v1.sql

CREATE TABLE IF NOT EXISTS payment_record_assignments (
    user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    assigned_admin_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | recorded | waived
    note               TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pra_admin  ON payment_record_assignments(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_pra_status ON payment_record_assignments(status);

-- Part 2 — profit-sharing source tag on payments. Default 'regular' (80/20).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS partner_source VARCHAR(30) NOT NULL DEFAULT 'regular';
CREATE INDEX IF NOT EXISTS idx_payments_partner_source ON payments(partner_source);
