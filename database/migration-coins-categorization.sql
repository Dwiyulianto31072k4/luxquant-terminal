-- ============================================
-- LuxQuant Terminal - Coins Categorization Migration
-- ============================================
-- Bikin table `coins` master untuk categorization (jenis, sektor, utility).
-- Konsisten dengan style migration-* lain di /root/luxquant-terminal/database/.
--
-- Run: sudo -u postgres psql -d luxquant < migration-coins-categorization.sql
--
-- Idempotent: aman di-run berkali-kali.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_new_pair_to_coins ON signals;
--   DROP FUNCTION IF EXISTS notify_new_pair();
--   DROP TABLE IF EXISTS coins CASCADE;
-- ============================================

BEGIN;

-- ============================================
-- 1. Table: coins
-- ============================================
-- One row per trading pair. Master metadata untuk categorization.
-- Linked ke signals.pair via pair string (no FK karena signals udah punya banyak data).
-- ============================================
CREATE TABLE IF NOT EXISTS coins (
    pair                TEXT PRIMARY KEY,                    -- e.g. "BTCUSDT"
    base_symbol         TEXT NOT NULL,                       -- e.g. "BTC"
    quote_symbol        TEXT DEFAULT 'USDT',                 -- e.g. "USDT"

    -- ── Categorization (manual or auto from CoinGecko) ──
    token_type          TEXT,                                -- layer1, layer2, utility, governance, stablecoin, memecoin, rwa, privacy, exchange, defi
    sector              TEXT,                                -- defi, gamefi, ai, infrastructure, socialfi, payments, rwa, privacy, meme, other
    has_utility         BOOLEAN,                             -- TRUE = real utility, FALSE = pure speculation, NULL = unreviewed
    utility_details     JSONB,                               -- {"governance": true, "gas_fee": false, "staking": true, "buyback_burn": true}

    -- ── External metadata (from CoinGecko API) ──
    coingecko_id        TEXT,                                -- e.g. "bitcoin"
    market_cap_rank     INTEGER,                             -- nullable, snapshot last fetch
    market_cap_usd      NUMERIC(20,2),                       -- snapshot last fetch
    description         TEXT,
    website             TEXT,
    whitepaper_url      TEXT,
    categories_raw      JSONB,                               -- raw categories from CoinGecko ["Smart Contract Platform", "Layer 1", ...]

    -- ── Review & curation status ──
    review_status       TEXT DEFAULT 'pending',              -- pending, auto_categorized, manual_reviewed, flagged
    reviewed_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    review_notes        TEXT,

    -- ── Provenance ──
    metadata_source     TEXT DEFAULT 'pending',              -- pending, coingecko, manual, hybrid
    last_fetched_at     TIMESTAMPTZ,                         -- last time CoinGecko was queried
    fetch_error         TEXT,                                -- error msg if last fetch failed

    -- ── Timestamps ──
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================
-- 2. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_coins_token_type      ON coins(token_type);
CREATE INDEX IF NOT EXISTS idx_coins_sector          ON coins(sector);
CREATE INDEX IF NOT EXISTS idx_coins_has_utility     ON coins(has_utility);
CREATE INDEX IF NOT EXISTS idx_coins_review_status   ON coins(review_status);
CREATE INDEX IF NOT EXISTS idx_coins_market_cap_rank ON coins(market_cap_rank NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_coins_coingecko_id    ON coins(coingecko_id);
CREATE INDEX IF NOT EXISTS idx_coins_last_fetched    ON coins(last_fetched_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_coins_base_symbol     ON coins(base_symbol);


-- ============================================
-- 3. Trigger: auto-create coin row when new pair appears in signals
-- ============================================
-- Pattern mirror trg_new_signal (yang udah ada di table signals).
-- Fire NOTIFY ke channel 'new_pair_to_categorize' biar worker pickup.
-- ============================================
CREATE OR REPLACE FUNCTION notify_new_pair()
RETURNS trigger AS $$
DECLARE
    v_base_symbol TEXT;
BEGIN
    -- Skip kalau pair NULL atau kosong
    IF NEW.pair IS NULL OR NEW.pair = '' THEN
        RETURN NEW;
    END IF;

    -- Extract base symbol (strip USDT / USDC / BUSD suffix)
    v_base_symbol := regexp_replace(NEW.pair, '(USDT|USDC|BUSD|USD)$', '');

    -- INSERT IF NOT EXISTS pattern (idempotent)
    INSERT INTO coins (pair, base_symbol, quote_symbol, review_status, metadata_source)
    VALUES (
        NEW.pair,
        v_base_symbol,
        regexp_replace(NEW.pair, '^.*?(USDT|USDC|BUSD|USD)$', '\1'),
        'pending',
        'pending'
    )
    ON CONFLICT (pair) DO NOTHING;

    -- Notify worker (only if newly inserted — check via xmax = 0 trick is too complex,
    -- just always notify; worker can dedupe).
    PERFORM pg_notify('new_pair_to_categorize', NEW.pair);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_new_pair_to_coins ON signals;

CREATE TRIGGER trg_new_pair_to_coins
    AFTER INSERT ON signals
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_pair();


-- ============================================
-- 4. Helper view: coins_with_signal_stats
-- ============================================
-- Quick view buat dashboard / admin panel.
-- Joins coins dengan agg dari signals.
-- ============================================
CREATE OR REPLACE VIEW coins_with_signal_stats AS
SELECT
    c.pair,
    c.base_symbol,
    c.token_type,
    c.sector,
    c.has_utility,
    c.review_status,
    c.market_cap_rank,
    COUNT(s.signal_id) AS total_signals,
    MAX(s.created_at) AS last_signal_at,
    c.last_fetched_at,
    c.updated_at
FROM coins c
LEFT JOIN signals s ON s.pair = c.pair
GROUP BY c.pair, c.base_symbol, c.token_type, c.sector, c.has_utility,
         c.review_status, c.market_cap_rank, c.last_fetched_at, c.updated_at;


-- ============================================
-- 5. Comments (documentation)
-- ============================================
COMMENT ON TABLE coins IS
    'Master categorization table for trading pairs. One row per pair (e.g. BTCUSDT). Auto-populated from signals via trg_new_pair_to_coins trigger.';

COMMENT ON COLUMN coins.token_type IS
    'High-level token classification: layer1, layer2, utility, governance, stablecoin, memecoin, rwa, privacy, exchange, defi.';

COMMENT ON COLUMN coins.sector IS
    'Industry sector: defi, gamefi, ai, infrastructure, socialfi, payments, rwa, privacy, meme, other. (legacy: hype was renamed to meme — not Hyperliquid.)';

COMMENT ON COLUMN coins.has_utility IS
    'TRUE = real utility (governance, staking, gas, RWA, etc.), FALSE = pure speculation/memecoin, NULL = not yet reviewed.';

COMMENT ON COLUMN coins.utility_details IS
    'JSONB flags: {governance, gas_fee, staking, buyback_burn, payments, collateral, premium_access, backed_by_asset}.';

COMMENT ON COLUMN coins.review_status IS
    'pending = awaiting categorization, auto_categorized = filled by worker from CoinGecko, manual_reviewed = admin verified, flagged = needs attention.';

COMMENT ON FUNCTION notify_new_pair() IS
    'Auto-creates a coins row when new pair appears in signals + fires NOTIFY new_pair_to_categorize for worker pickup.';


COMMIT;


-- ============================================
-- VERIFICATION (run manual after migration)
-- ============================================

-- 1. Check table & indexes
-- \d+ coins

-- 2. Check trigger registered on signals
-- SELECT trigger_name FROM information_schema.triggers
-- WHERE event_object_table = 'signals';
-- (should show trg_new_signal AND trg_new_pair_to_coins)

-- 3. Check view
-- SELECT * FROM coins_with_signal_stats LIMIT 5;

-- 4. Test trigger (smoke test):
--    Session A:  LISTEN new_pair_to_categorize;
--    Session B:  -- insert won't actually fire unless real signal flow runs
--                -- so just check empty table:
--                SELECT COUNT(*) FROM coins;  -- should be 0 fresh after migration
