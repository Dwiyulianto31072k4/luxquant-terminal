-- ════════════════════════════════════════════════════════════════════
-- LuxQuant Terminal — Referral System v2 Migration
-- ════════════════════════════════════════════════════════════════════
-- Author       : Dwi
-- Date         : 2026-05-09
-- Purpose      : Rebuild referral system dengan credit balance model
-- Strategy     : ADDITIVE ONLY — zero risk, no DROP, no destructive change
-- Compatible   : Production data tetap aman (verified state: 8 codes, 0 uses)
--
-- Cara deploy:
--   psql -h 127.0.0.1 -U luxq -d luxquant < migration-referral-v2.sql
--
-- Cara verify:
--   \d users
--   \d referral_uses
--   \d credit_ledger
--
-- Rollback file: rollback-referral-v2.sql
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- STEP 1 — USERS table: tambah credit balance + login tracking
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_credit_usdt   NUMERIC(10,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS lifetime_credit_earned NUMERIC(10,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_login_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_login_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count            INTEGER DEFAULT 0 NOT NULL;

-- Constraint: credit balance ga boleh negatif (defensive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_credit_nonneg'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_referral_credit_nonneg
      CHECK (referral_credit_usdt >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_lifetime_credit_nonneg'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_lifetime_credit_nonneg
      CHECK (lifetime_credit_earned >= 0);
  END IF;
END $$;

-- Index untuk query "active users last 30 days" (analytics referrer)
CREATE INDEX IF NOT EXISTS idx_users_last_login
  ON users(last_login_at DESC NULLS LAST);


-- ════════════════════════════════════════════════════════════════════
-- STEP 2 — REFERRAL_USES: tambah tracking fields untuk recurring + funnel
-- ════════════════════════════════════════════════════════════════════
-- Status flow baru: pending → active → subscribed → churned
-- - pending    : code applied saat register, belum login
-- - active     : referee udah pernah login (first_login_at terisi)
-- - subscribed : referee udah bayar minimal sekali
-- - churned    : referee subscription expired & ga renew >30 hari
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE referral_uses
  ADD COLUMN IF NOT EXISTS first_login_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_commission_earned  NUMERIC(10,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS total_payments           INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_payment_at          TIMESTAMPTZ;

-- Constraint: commission accumulator ga boleh negatif
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_total_commission_nonneg'
  ) THEN
    ALTER TABLE referral_uses
      ADD CONSTRAINT chk_total_commission_nonneg
      CHECK (total_commission_earned >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_total_payments_nonneg'
  ) THEN
    ALTER TABLE referral_uses
      ADD CONSTRAINT chk_total_payments_nonneg
      CHECK (total_payments >= 0);
  END IF;
END $$;

-- Composite index buat funnel query (referrer + status)
CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer_status
  ON referral_uses(referrer_id, status);


-- ════════════════════════════════════════════════════════════════════
-- STEP 3 — REFERRAL_CODES: case-insensitive lookup
-- ════════════════════════════════════════════════════════════════════

-- Functional index: speed up case-insensitive search
-- (user ketik "dwi-2026" atau "DWI-2026" sama-sama match)
CREATE INDEX IF NOT EXISTS idx_referral_codes_code_lower
  ON referral_codes(LOWER(code));


-- ════════════════════════════════════════════════════════════════════
-- STEP 4 — NEW TABLE: credit_ledger
-- ════════════════════════════════════════════════════════════════════
-- Audit trail untuk SEMUA pergerakan credit balance.
-- Setiap baris = satu transaksi credit (earn/redeem/adjust/refund).
-- balance_after = saldo user SETELAH transaksi ini (snapshot).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS credit_ledger (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,        -- positif=earn, negatif=redeem
  type            VARCHAR(20)   NOT NULL,        -- earn|redeem|adjust|refund
  ref_payment_id  INTEGER       REFERENCES payments(id) ON DELETE SET NULL,
  ref_use_id      INTEGER       REFERENCES referral_uses(id) ON DELETE SET NULL,
  balance_after   NUMERIC(10,2) NOT NULL,        -- snapshot saldo setelah tx
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT chk_ledger_type
    CHECK (type IN ('earn', 'redeem', 'adjust', 'refund')),

  CONSTRAINT chk_ledger_balance_nonneg
    CHECK (balance_after >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_time
  ON credit_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_type
  ON credit_ledger(type);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_payment
  ON credit_ledger(ref_payment_id) WHERE ref_payment_id IS NOT NULL;

-- Comments untuk dokumentasi
COMMENT ON TABLE  credit_ledger IS 'Audit trail untuk semua pergerakan referral_credit_usdt di tabel users';
COMMENT ON COLUMN credit_ledger.amount        IS 'Positif=earn, negatif=redeem';
COMMENT ON COLUMN credit_ledger.type          IS 'earn=dari komisi referee, redeem=potong invoice, adjust=manual admin, refund=reverse refund';
COMMENT ON COLUMN credit_ledger.balance_after IS 'Snapshot users.referral_credit_usdt SETELAH transaksi ini';


-- ════════════════════════════════════════════════════════════════════
-- STEP 5 — CLEANUP: normalize existing referral codes ke UPPERCASE
-- ════════════════════════════════════════════════════════════════════
-- Existing 8 codes udah uppercase semua (LUXQ-XXXX), tapi defensive update
-- biar konsisten ke depannya. Aman karena di referral_codes_code_key (UNIQUE)
-- ga ada kolision.
-- ════════════════════════════════════════════════════════════════════

UPDATE referral_codes
SET code = UPPER(code)
WHERE code != UPPER(code);


-- ════════════════════════════════════════════════════════════════════
-- STEP 6 — PERMISSIONS
-- ════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON credit_ledger TO luxq;
GRANT USAGE, SELECT ON SEQUENCE credit_ledger_id_seq TO luxq;
GRANT SELECT ON credit_ledger TO luxq_readonly;


-- ════════════════════════════════════════════════════════════════════
-- STEP 7 — VERIFICATION QUERIES (read-only, aman)
-- ════════════════════════════════════════════════════════════════════

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'VERIFICATION — pastiin semua field baru terbentuk'
\echo '═══════════════════════════════════════════════════════════════'

\echo ''
\echo '── users: kolom credit/login baru ──'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'referral_credit_usdt','lifetime_credit_earned',
    'last_login_at','first_login_at','login_count'
  )
ORDER BY column_name;

\echo ''
\echo '── referral_uses: kolom tracking baru ──'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'referral_uses'
  AND column_name IN (
    'first_login_at','total_commission_earned',
    'total_payments','last_payment_at'
  )
ORDER BY column_name;

\echo ''
\echo '── credit_ledger: tabel baru ──'
SELECT
  COUNT(*) FILTER (WHERE table_name = 'credit_ledger') AS table_exists,
  (SELECT COUNT(*) FROM credit_ledger) AS row_count
FROM information_schema.tables
WHERE table_name = 'credit_ledger';

\echo ''
\echo '── indexes baru ──'
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname IN (
  'idx_users_last_login',
  'idx_referral_uses_referrer_status',
  'idx_referral_codes_code_lower',
  'idx_credit_ledger_user_time',
  'idx_credit_ledger_type',
  'idx_credit_ledger_payment'
)
ORDER BY tablename, indexname;

\echo ''
\echo '── existing data UNTOUCHED ──'
SELECT
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM referral_codes) AS codes_count,
  (SELECT COUNT(*) FROM referral_uses) AS uses_count,
  (SELECT COUNT(*) FROM referral_payouts) AS payouts_count;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'MIGRATION SELESAI — commit transaction'
\echo '═══════════════════════════════════════════════════════════════'

COMMIT;
