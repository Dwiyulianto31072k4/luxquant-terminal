-- ════════════════════════════════════════════════════════════════
-- Migration: Cashout & Credit Redemption (Layer 8)
-- ════════════════════════════════════════════════════════════════
-- Purpose: 
--   1. Add cashout_requests table for users to request balance withdrawal
--      (admin processes manually via Telegram)
--   2. Expand credit_ledger to support cashout-related types:
--      - cashout_pending  : balance reserved when user submits request
--      - cashout_completed: status marker after admin sends fund
--      - referral_discount: track discount applied to invoice (audit trail)
--
-- Architecture (Hard Reserve):
--   user request cashout $X
--     → balance -= X immediately
--     → ledger entry: type='cashout_pending', amount=-X
--     → cashout_requests row: status='pending'
--
--   admin reviews:
--     APPROVE & MARK SENT:
--       → cashout_requests: status='completed', tx_hash set
--       → ledger entry: type='cashout_completed' (informational, amount=0)
--     REJECT:
--       → cashout_requests: status='rejected', admin_note set
--       → balance += X (refund)
--       → ledger entry: type='refund', amount=+X
--
-- Backward compat:
--   - Existing credit_ledger types ('earn', 'redeem', 'adjust', 'refund') unaffected
--   - Adding new types via CHECK constraint expansion
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. CASHOUT_REQUESTS TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cashout_requests (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Financial
  amount_usdt           NUMERIC(10, 2) NOT NULL,
  
  -- Destination — telegram only for MVP
  method                VARCHAR(30) NOT NULL DEFAULT 'telegram_admin',
  destination_telegram  VARCHAR(100),                  -- user's Telegram @username
  destination_note      TEXT,                          -- optional notes from user
  
  -- Status flow: pending → approved → completed
  --              pending → rejected
  --              pending → cancelled (by user, if still pending)
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Admin handling
  admin_note            TEXT,                          -- admin internal note
  tx_hash               VARCHAR(100),                  -- proof of send (optional)
  
  -- Audit
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,                   -- when admin first reviewed
  completed_at          TIMESTAMPTZ,                   -- when fund actually sent
  reviewed_by_admin_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Link to ledger entries (one for reserve, one for completion or refund)
  ledger_reserve_id     INTEGER REFERENCES credit_ledger(id) ON DELETE SET NULL,
  ledger_final_id       INTEGER REFERENCES credit_ledger(id) ON DELETE SET NULL,
  
  -- Constraints
  CONSTRAINT chk_cashout_amount_positive 
    CHECK (amount_usdt > 0),
  CONSTRAINT chk_cashout_status 
    CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled')),
  CONSTRAINT chk_cashout_method 
    CHECK (method IN ('telegram_admin', 'usdt_bep20', 'usdt_trc20', 'bank', 'other'))
);

-- ════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_cashout_user 
  ON cashout_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_cashout_status 
  ON cashout_requests(status);

CREATE INDEX IF NOT EXISTS idx_cashout_user_status 
  ON cashout_requests(user_id, status);

CREATE INDEX IF NOT EXISTS idx_cashout_pending 
  ON cashout_requests(requested_at DESC) 
  WHERE status = 'pending';

-- Partial unique index: enforce 1 active request per user
-- "Active" = pending or approved (not yet completed/rejected/cancelled)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashout_one_active_per_user
  ON cashout_requests(user_id) 
  WHERE status IN ('pending', 'approved');

-- ════════════════════════════════════════════════════════════════
-- 3. EXPAND CREDIT_LEDGER TYPES
-- ════════════════════════════════════════════════════════════════
-- Add new types: cashout_pending, cashout_completed, referral_discount
-- Existing types preserved: earn, redeem, adjust, refund

-- Drop existing CHECK constraint if present (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_ledger_type' 
       OR conname = 'credit_ledger_type_check'
  ) THEN
    -- Find and drop the type check constraint
    EXECUTE (
      SELECT 'ALTER TABLE credit_ledger DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'credit_ledger'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%type%earn%redeem%'
      LIMIT 1
    );
  END IF;
END $$;

-- Re-add with expanded types
ALTER TABLE credit_ledger 
  ADD CONSTRAINT chk_ledger_type 
  CHECK (type IN (
    'earn',                -- referrer commission from referee payment
    'redeem',              -- user used credit as invoice discount
    'adjust',              -- admin manual adjustment
    'refund',              -- credit returned (cashout rejected/cancelled)
    'cashout_pending',     -- balance reserved for cashout request
    'cashout_completed',   -- cashout fulfilled (admin sent funds)
    'referral_discount'    -- referral 10% discount applied to invoice (audit)
  ));

-- ════════════════════════════════════════════════════════════════
-- 4. GRANTS
-- ════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON cashout_requests TO luxq;
GRANT USAGE, SELECT ON SEQUENCE cashout_requests_id_seq TO luxq;

-- Conditional readonly grant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luxq_readonly') THEN
    GRANT SELECT ON cashout_requests TO luxq_readonly;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- 5. COMMENTS (self-documentation)
-- ════════════════════════════════════════════════════════════════

COMMENT ON TABLE cashout_requests IS
  'User requests to withdraw referral credit balance. Admin fulfills manually via Telegram. Hard-reserve: balance deducted on request, refunded on rejection.';

COMMENT ON COLUMN cashout_requests.status IS
  'pending: awaiting admin review (balance reserved) | approved: admin OK, processing | completed: admin sent fund (terminal) | rejected: admin denied (refund issued) | cancelled: user cancelled (refund issued)';

COMMENT ON COLUMN cashout_requests.method IS
  'Fulfillment method. MVP: telegram_admin (user provides Telegram username, admin contacts for details).';

COMMENT ON COLUMN cashout_requests.ledger_reserve_id IS
  'Ledger entry created when request submitted (type=cashout_pending, amount=-X).';

COMMENT ON COLUMN cashout_requests.ledger_final_id IS
  'Final ledger entry: type=cashout_completed (after admin send) or type=refund (after rejection/cancellation).';

-- ════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'VERIFICATION'
\echo '═══════════════════════════════════════════════════════════════'

\echo ''
\echo '── cashout_requests structure ──'
\d cashout_requests

\echo ''
\echo '── credit_ledger CHECK constraint ──'
SELECT pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'credit_ledger'::regclass
  AND conname = 'chk_ledger_type';

\echo ''
\echo '── Existing credit_ledger types in use ──'
SELECT type, COUNT(*) AS count 
FROM credit_ledger 
GROUP BY type 
ORDER BY count DESC;

\echo ''
\echo '── Indexes ──'
SELECT indexname FROM pg_indexes WHERE tablename = 'cashout_requests' ORDER BY indexname;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'MIGRATION COMPLETE — commit'
\echo '═══════════════════════════════════════════════════════════════'

COMMIT;
