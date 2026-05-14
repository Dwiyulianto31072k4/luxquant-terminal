-- ============================================================
-- LuxQuant: BTC Correlation Injection — Migration v2
-- ============================================================
-- Adjusted to actual schema:
--   • signals.signal_id is TEXT (UUID), not BIGINT
--   • Reuses EXISTING trigger trg_new_signal → channel 'new_signal'
--     (payload: JSON {signal_id, pair, entry, created_at})
--   • coingecko_id lives in coins table, joined via signals.pair
--   • Mirrors signal_enrichment patterns (jsonb defaults, analyzed_at, version)
-- ============================================================

CREATE TABLE IF NOT EXISTS signal_btc_correlation (
    id              SERIAL PRIMARY KEY,
    signal_id       TEXT NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,
    pair            TEXT NOT NULL,

    -- 5 core metrics
    corr_1h_7d      NUMERIC(6,4),   -- Pearson, short-term (entry timing)
    corr_4h_30d     NUMERIC(6,4),   -- Pearson, medium-term (regime)
    beta_30d        NUMERIC(8,4),   -- Slope vs BTC returns (position sizing)
    r_squared_30d   NUMERIC(6,4),   -- Coefficient of determination (explained variance)
    corr_zscore     NUMERIC(8,4),   -- Current corr vs 60-period baseline (decoupling)

    -- BTC snapshot at signal time
    btc_context     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { price, trend, rsi_14, change_24h_pct, regime, dominance }

    -- Flag
    is_decoupled    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Auto-generated interpretation (English)
    interpretation  JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { alignment_score, risk_level, headline, summary,
    --          sizing_hint, hedge_hint, regime_warning,
    --          decoupling_note, trade_bias }

    -- Metadata
    data_source     VARCHAR(20),    -- 'binance' | 'coingecko'
    sample_quality  VARCHAR(10),    -- 'high' | 'medium' | 'low'
    worker_version  VARCHAR(8)  NOT NULL DEFAULT 'v1.0',
    analyzed_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT uq_correlation_signal UNIQUE (signal_id)
);

CREATE INDEX IF NOT EXISTS idx_correlation_pair        ON signal_btc_correlation(pair);
CREATE INDEX IF NOT EXISTS idx_correlation_analyzed_at ON signal_btc_correlation(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_correlation_decoupled   ON signal_btc_correlation(is_decoupled) WHERE is_decoupled = TRUE;
CREATE INDEX IF NOT EXISTS idx_correlation_alignment
    ON signal_btc_correlation(((interpretation->>'alignment_score')::int) DESC);

-- ============================================================
-- Convenience view: signal + correlation + coin metadata
-- ============================================================
CREATE OR REPLACE VIEW v_signal_with_correlation AS
SELECT
    s.signal_id,
    s.pair,
    s.entry,
    s.target1, s.target2, s.target3,
    s.stop1, s.stop2,
    s.status,
    s.risk_level,
    s.created_at,
    co.base_symbol,
    co.coingecko_id,
    co.market_cap_rank,
    c.corr_1h_7d,
    c.corr_4h_30d,
    c.beta_30d,
    c.r_squared_30d,
    c.corr_zscore,
    c.btc_context,
    c.is_decoupled,
    c.interpretation,
    c.data_source        AS correlation_source,
    c.sample_quality     AS correlation_quality,
    c.analyzed_at        AS correlation_analyzed_at
FROM signals s
LEFT JOIN coins                  co ON co.pair = s.pair
LEFT JOIN signal_btc_correlation c  ON c.signal_id = s.signal_id;

-- ============================================================
-- NOTE: NO new trigger needed.
-- The worker LISTENs on the existing channel 'new_signal'
-- (fired by trg_new_signal → notify_new_signal()).
-- Payload is JSON: {"signal_id":"...","pair":"AINUSDT","entry":...,"created_at":"..."}
-- ============================================================
