-- ============================================
-- LuxQuant Terminal - Coins Categorization v2
-- ============================================
-- Tambah kolom detail human-readable untuk display di frontend.
--
-- Run: sudo -u postgres psql -d luxquant < migration-coins-categorization-v2.sql
--
-- Idempotent: aman di-run berkali-kali.
-- ============================================

BEGIN;

-- ============================================
-- 1. ADD detail columns
-- ============================================
ALTER TABLE coins ADD COLUMN IF NOT EXISTS summary       TEXT;
ALTER TABLE coins ADD COLUMN IF NOT EXISTS use_cases     JSONB;
ALTER TABLE coins ADD COLUMN IF NOT EXISTS key_features  JSONB;
ALTER TABLE coins ADD COLUMN IF NOT EXISTS risk_notes    TEXT;


-- ============================================
-- 2. Comments
-- ============================================
COMMENT ON COLUMN coins.summary IS
    '1-paragraph human-readable description for tooltip/badge display.';

COMMENT ON COLUMN coins.use_cases IS
    'Array of practical use cases. Example: ["Store of value", "Peer-to-peer payments"]';

COMMENT ON COLUMN coins.key_features IS
    'Array of key technical/economic features. Example: ["21M max supply", "Proof-of-Work"]';

COMMENT ON COLUMN coins.risk_notes IS
    'Important caveats: volatility, regulatory risk, technical risk, etc.';


-- ============================================
-- 3. Reset BTCUSDT, ETHUSDT, etc — biar di-re-process by worker dengan detail baru
-- ============================================
-- Catatan: ini hanya RESET review_status biar worker baru pickup lagi.
-- Data lama di kolom existing tetep ada (gak hilang).
UPDATE coins
SET review_status = 'pending', last_fetched_at = NULL
WHERE metadata_source = 'manual';


COMMIT;


-- ============================================
-- VERIFICATION
-- ============================================
-- \d+ coins
-- SELECT COUNT(*) FROM coins WHERE review_status = 'pending';
