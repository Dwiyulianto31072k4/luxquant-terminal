-- ════════════════════════════════════════════════════════════════
-- Migration: notif-readat-v1
-- Purpose: Add notifications_read_at timestamp ke users table
--          untuk hybrid "mark all read" cutoff pattern.
-- Idempotent: aman re-run berkali-kali.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add column dengan default NOW() — existing user otomatis get current timestamp
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notifications_read_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Backfill NULL kalau ada (defensive — kalau column udah ada tapi NULL)
UPDATE users
SET notifications_read_at = COALESCE(notifications_read_at, NOW())
WHERE notifications_read_at IS NULL;

-- 3. Enforce NOT NULL setelah backfill
ALTER TABLE users
ALTER COLUMN notifications_read_at SET NOT NULL;

-- 4. Index untuk query performance
CREATE INDEX IF NOT EXISTS idx_users_notifications_read_at
ON users(notifications_read_at);

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- Verify (run manual setelah migration)
-- ════════════════════════════════════════════════════════════════
-- SELECT count(*) total, count(notifications_read_at) has_value
-- FROM users;
-- Expected: total = has_value (semua user keisi)
--
-- SELECT id, username, notifications_read_at FROM users LIMIT 5;
-- Expected: semua row punya timestamp baru (sekitar NOW())
