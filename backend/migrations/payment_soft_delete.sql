-- ════════════════════════════════════════════════════════════════════
-- Payment soft-delete (void) support
--
-- Adds a nullable deleted_at column to payments.
--   NULL      = active (shown in finance list)
--   timestamp = voided (hidden, recoverable via Restore)
--
-- Idempotent: safe to run multiple times.
-- No DEFAULT, so existing rows are NOT rewritten/backfilled.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
