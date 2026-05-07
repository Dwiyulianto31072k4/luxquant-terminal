-- ============================================
-- LuxQuant Terminal - Coins Initial Backfill
-- ============================================
-- Backfill 671 existing pairs dari signals ke coins table.
-- Run SETELAH migration-coins-categorization.sql sukses.
--
-- Run: sudo -u postgres psql -d luxquant < seed-coins-initial.sql
--
-- Idempotent: pakai ON CONFLICT DO NOTHING.
-- Setelah ini, coin_metadata_worker.py bakal proses semua row
-- yang review_status = 'pending'.
-- ============================================

BEGIN;

-- Insert semua unique pair dari signals → coins
INSERT INTO coins (pair, base_symbol, quote_symbol, review_status, metadata_source)
SELECT
    DISTINCT pair AS pair,
    regexp_replace(pair, '(USDT|USDC|BUSD|USD)$', '') AS base_symbol,
    COALESCE(
        substring(pair FROM '(USDT|USDC|BUSD|USD)$'),
        'USDT'
    ) AS quote_symbol,
    'pending' AS review_status,
    'pending' AS metadata_source
FROM signals
WHERE pair IS NOT NULL AND pair != ''
ON CONFLICT (pair) DO NOTHING;


-- ============================================
-- Verification (auto-printed after commit)
-- ============================================
SELECT
    COUNT(*) AS total_coins_inserted,
    COUNT(*) FILTER (WHERE review_status = 'pending') AS pending_review,
    COUNT(*) FILTER (WHERE token_type IS NOT NULL) AS already_categorized
FROM coins;


COMMIT;


-- ============================================
-- After commit, sample check:
-- ============================================
-- SELECT pair, base_symbol, quote_symbol, review_status FROM coins ORDER BY pair LIMIT 20;
-- SELECT COUNT(*) FROM coins;  -- should be ~671
