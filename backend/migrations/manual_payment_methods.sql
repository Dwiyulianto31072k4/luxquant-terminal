-- Manual Payment Methods (Phase A) — add off-chain method tracking to payments.
-- Idempotent. Run:  sudo -u postgres psql -d luxquant -f backend/migrations/manual_payment_methods.sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method        VARCHAR(20)  NOT NULL DEFAULT 'onchain_bsc';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference     VARCHAR(200);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_currency VARCHAR(10);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_amount   NUMERIC(20,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fx_rate       NUMERIC(20,6);
