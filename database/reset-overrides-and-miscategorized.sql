-- ============================================
-- Reset coins yang misclassified atau dari override expansion
-- ============================================
-- Run di VPS:
--   sudo -u postgres psql -d luxquant < reset-overrides-and-miscategorized.sql
--
-- Tujuan:
-- 1. Reset semua coins yang base_symbol-nya ada di MANUAL_OVERRIDES baru
--    (ADA, AVAX, XRP, DOT, TON, NEAR, APT, SUI, TRX, ATOM, ARB, OP, MATIC,
--     LINK, AAVE, UNI, MKR, LDO, CRV, WIF, FLOKI, 1000FLOKI, 1000SHIB)
--    biar di-reprocess oleh worker v3.1 dengan override yang akurat.
--
-- 2. Reset LINK & similar yang misclassified sebagai 'rwa' tapi bukan beneran RWA.
-- ============================================

BEGIN;

-- ── Reset 'rwa' coins yang sebenernya bukan RWA (misclassified bug v3) ──
UPDATE coins
SET review_status = 'pending', last_fetched_at = NULL, fetch_error = NULL
WHERE pair IN ('LINKUSDT')
   AND token_type = 'rwa';


-- ── Reset coins yang punya manual override baru di v3.1 ──
UPDATE coins
SET review_status = 'pending', last_fetched_at = NULL, fetch_error = NULL
WHERE base_symbol IN (
    -- Layer 1 additions
    'ADA', 'AVAX', 'XRP', 'DOT', 'TON', 'NEAR', 'APT', 'SUI', 'TRX', 'ATOM',
    -- Layer 2 additions
    'ARB', 'OP', 'MATIC',
    -- Oracle
    'LINK',
    -- DeFi additions
    'AAVE', 'UNI', 'MKR', 'LDO', 'CRV',
    -- Memes additions
    'WIF', 'FLOKI', '1000FLOKI', '1000SHIB'
);


-- ── Verification ──
SELECT
    COUNT(*) FILTER (WHERE review_status = 'pending') AS pending_now,
    COUNT(*) FILTER (WHERE review_status = 'auto_categorized') AS done,
    COUNT(*) AS total
FROM coins;

COMMIT;
