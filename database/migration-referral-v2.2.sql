-- ════════════════════════════════════════════════════════════════════
-- LuxQuant Terminal — Migration v2.2: Share Tracking
-- ════════════════════════════════════════════════════════════════════
-- Date         : 2026-05-09
-- Purpose      : Track berapa kali code di-share/QR di-download.
--                Membantu identifikasi: code generated tapi never shared
--                (UX problem) vs code shared tapi never converted
--                (reach problem).
-- Strategy     : Additive only.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- STEP 1 — ADD COLUMNS
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE referral_codes
  ADD COLUMN IF NOT EXISTS share_count    INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS qr_count       INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_shared_at TIMESTAMPTZ;

-- Constraint: counters non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_share_count_nonneg'
  ) THEN
    ALTER TABLE referral_codes
      ADD CONSTRAINT chk_share_count_nonneg
      CHECK (share_count >= 0 AND qr_count >= 0);
  END IF;
END $$;

-- Index buat sorting "most shared codes" (analytics)
CREATE INDEX IF NOT EXISTS idx_referral_codes_shared
  ON referral_codes(last_shared_at DESC NULLS LAST)
  WHERE share_count > 0;


-- ════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'VERIFICATION'
\echo '═══════════════════════════════════════════════════════════════'

\echo ''
\echo '── New columns di referral_codes ──'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'referral_codes'
  AND column_name IN ('share_count', 'qr_count', 'last_shared_at')
ORDER BY column_name;

\echo ''
\echo '── Existing data UNTOUCHED ──'
SELECT
  COUNT(*) AS total_codes,
  SUM(share_count) AS total_shares,
  SUM(qr_count) AS total_qr_downloads
FROM referral_codes;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'

COMMIT;
