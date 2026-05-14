-- ════════════════════════════════════════════════════════════════
-- Migration: Add credit_redeemed column to payments (Layer 8)
-- ════════════════════════════════════════════════════════════════
-- Purpose: Track how much credit balance was redeemed per invoice.
--          Used for refund logic if invoice expires/cancelled.
--
-- Backward compat: column nullable with default 0 — existing payments unaffected.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- Add column if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'credit_redeemed'
  ) THEN
    ALTER TABLE payments ADD COLUMN credit_redeemed NUMERIC(10, 2) DEFAULT 0;
    
    -- Set existing rows to 0 explicitly (in case default doesn't backfill)
    UPDATE payments SET credit_redeemed = 0 WHERE credit_redeemed IS NULL;
  END IF;
END $$;

-- Add CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_payments_credit_redeemed_nonneg'
  ) THEN
    ALTER TABLE payments 
    ADD CONSTRAINT chk_payments_credit_redeemed_nonneg 
    CHECK (credit_redeemed >= 0);
  END IF;
END $$;

COMMENT ON COLUMN payments.credit_redeemed IS
  'Amount of referral credit balance redeemed for this invoice. Refundable if invoice expires/cancelled before payment confirmation.';

-- Verify
\echo ''
\echo '── Verify credit_redeemed column ──'
SELECT column_name, data_type, column_default, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payments' 
  AND column_name IN ('amount_usdt', 'discount_amount', 'final_amount', 'credit_redeemed')
ORDER BY ordinal_position;

\echo ''
\echo '── Sample data ──'
SELECT id, amount_usdt, discount_amount, final_amount, credit_redeemed, status
FROM payments
ORDER BY id DESC
LIMIT 5;

\echo ''
\echo '✅ MIGRATION COMPLETE'

COMMIT;
