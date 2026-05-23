-- ════════════════════════════════════════════════════════════════════
-- Migration: Admin Enrichment Columns
-- Purpose: Allow admin to manually enrich user contact info
--          (Telegram/Discord handle) for users who signed up via
--          providers that don't expose those handles natively (Google,
--          local register, Telegram phone-only).
--
-- Adds to users table:
--   admin_telegram_username  — admin-curated @username for outreach
--   admin_discord_handle     — admin-curated discord handle/id for outreach
--   admin_notes              — free-text admin notes about the user
--   admin_enriched_by        — which admin last touched these fields
--   admin_enriched_at        — when last touched
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_telegram_username VARCHAR(100),
  ADD COLUMN IF NOT EXISTS admin_discord_handle    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS admin_notes             TEXT,
  ADD COLUMN IF NOT EXISTS admin_enriched_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_enriched_at       TIMESTAMPTZ;

-- Index untuk search by admin-enriched TG (admin might search "@username" yang dia tambahkan)
CREATE INDEX IF NOT EXISTS idx_users_admin_tg
  ON users (lower(admin_telegram_username))
  WHERE admin_telegram_username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_admin_dc
  ON users (lower(admin_discord_handle))
  WHERE admin_discord_handle IS NOT NULL;

-- Helpful for "user yang udah di-enrich" filter
CREATE INDEX IF NOT EXISTS idx_users_enriched_at
  ON users (admin_enriched_at DESC NULLS LAST)
  WHERE admin_enriched_at IS NOT NULL;

COMMENT ON COLUMN users.admin_telegram_username IS 'Admin-curated TG @username for outreach (overrides oauth telegram_username)';
COMMENT ON COLUMN users.admin_discord_handle    IS 'Admin-curated Discord handle/id for outreach (overrides oauth discord_username)';
COMMENT ON COLUMN users.admin_notes             IS 'Free-text admin notes about the user (CRM-style)';
COMMENT ON COLUMN users.admin_enriched_by       IS 'FK to users.id of last admin who touched enrichment fields';
COMMENT ON COLUMN users.admin_enriched_at       IS 'Last enrichment timestamp';

-- Verify
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'users'
    AND column_name IN (
      'admin_telegram_username',
      'admin_discord_handle',
      'admin_notes',
      'admin_enriched_by',
      'admin_enriched_at'
    );

  IF col_count = 5 THEN
    RAISE NOTICE '✅ All 5 admin enrichment columns present in users table';
  ELSE
    RAISE EXCEPTION '❌ Expected 5 admin enrichment columns, found %', col_count;
  END IF;
END $$;

COMMIT;
