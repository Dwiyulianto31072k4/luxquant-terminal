-- ════════════════════════════════════════════════════════════════════
-- LuxQuant Terminal — Referral System v2 ROLLBACK
-- ════════════════════════════════════════════════════════════════════
-- Author    : Dwi
-- Date      : 2026-05-09
-- Purpose   : Undo migration-referral-v2.sql
-- WARNING   : Ini akan DROP credit_ledger table & SEMUA isinya!
--             Cuma jalanin kalo lo yakin mau rollback.
--
-- Cara deploy:
--   psql -h 127.0.0.1 -U luxq -d luxquant < rollback-referral-v2.sql
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- WARNING CHECK — kalo credit_ledger udah ada data, abort
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  ledger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ledger_count FROM credit_ledger;
  IF ledger_count > 0 THEN
    RAISE EXCEPTION 'ABORT: credit_ledger masih ada % rows. Backup dulu sebelum rollback!', ledger_count;
  END IF;
END $$;

DO $$
DECLARE
  credit_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO credit_users FROM users WHERE referral_credit_usdt > 0 OR lifetime_credit_earned > 0;
  IF credit_users > 0 THEN
    RAISE EXCEPTION 'ABORT: ada % users dengan credit balance > 0. Backup dulu sebelum rollback!', credit_users;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- STEP 1 — DROP credit_ledger (table + indexes + sequence auto)
-- ════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS credit_ledger CASCADE;


-- ════════════════════════════════════════════════════════════════════
-- STEP 2 — DROP indexes baru di referral_codes & referral_uses
-- ════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_referral_codes_code_lower;
DROP INDEX IF EXISTS idx_referral_uses_referrer_status;
DROP INDEX IF EXISTS idx_users_last_login;


-- ════════════════════════════════════════════════════════════════════
-- STEP 3 — DROP constraints baru
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_referral_credit_nonneg,
  DROP CONSTRAINT IF EXISTS chk_lifetime_credit_nonneg;

ALTER TABLE referral_uses
  DROP CONSTRAINT IF EXISTS chk_total_commission_nonneg,
  DROP CONSTRAINT IF EXISTS chk_total_payments_nonneg;


-- ════════════════════════════════════════════════════════════════════
-- STEP 4 — DROP kolom baru di referral_uses
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE referral_uses
  DROP COLUMN IF EXISTS first_login_at,
  DROP COLUMN IF EXISTS total_commission_earned,
  DROP COLUMN IF EXISTS total_payments,
  DROP COLUMN IF EXISTS last_payment_at;


-- ════════════════════════════════════════════════════════════════════
-- STEP 5 — DROP kolom baru di users
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users
  DROP COLUMN IF EXISTS referral_credit_usdt,
  DROP COLUMN IF EXISTS lifetime_credit_earned,
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS first_login_at,
  DROP COLUMN IF EXISTS login_count;


-- ════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'ROLLBACK SELESAI — verifikasi'
\echo '═══════════════════════════════════════════════════════════════'

\echo ''
\echo '── credit_ledger harus GA ADA ──'
SELECT COUNT(*) AS table_should_be_zero
FROM information_schema.tables
WHERE table_name = 'credit_ledger';

\echo ''
\echo '── users harus balik ke kolom original ──'
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'referral_credit_usdt','lifetime_credit_earned',
    'last_login_at','first_login_at','login_count'
  );

\echo ''
\echo '── referral_uses harus balik ke kolom original ──'
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'referral_uses'
  AND column_name IN (
    'first_login_at','total_commission_earned',
    'total_payments','last_payment_at'
  );

\echo ''
\echo '═══════════════════════════════════════════════════════════════'

COMMIT;
