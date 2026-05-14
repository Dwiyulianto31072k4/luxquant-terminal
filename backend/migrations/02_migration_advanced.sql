-- ============================================================
-- LuxQuant: BTC Correlation v2 — Advanced metrics migration
-- ============================================================
-- Adds advanced columns to existing signal_btc_correlation table.
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ============================================================

ALTER TABLE signal_btc_correlation
    ADD COLUMN IF NOT EXISTS sample_size          INTEGER,
    ADD COLUMN IF NOT EXISTS confidence           VARCHAR(20)   DEFAULT 'insufficient_data',
    -- 'high' | 'medium' | 'low' | 'insufficient_data'

    -- Tail-risk metrics (behavior in BTC stress)
    ADD COLUMN IF NOT EXISTS tail_corr_btc_down   NUMERIC(6,4),
    -- correlation conditional on BTC daily return < -3%
    ADD COLUMN IF NOT EXISTS tail_corr_btc_up     NUMERIC(6,4),
    -- correlation conditional on BTC daily return > +3%
    ADD COLUMN IF NOT EXISTS downside_beta        NUMERIC(8,4),
    -- beta computed only on BTC-down candles (key asymmetry indicator)

    -- Timing / lead-lag
    ADD COLUMN IF NOT EXISTS lead_lag_hours       INTEGER,
    -- positive = coin LEADS BTC, negative = coin LAGS BTC, 0 = sync

    -- Volatility profile
    ADD COLUMN IF NOT EXISTS volatility_ratio     NUMERIC(8,4),
    -- (coin annualized vol) / (BTC annualized vol). >1 = more volatile than BTC
    ADD COLUMN IF NOT EXISTS coin_volatility_pct  NUMERIC(8,2),
    -- coin annualized vol in %

    -- Momentum divergence (signal-time context)
    ADD COLUMN IF NOT EXISTS momentum_divergence_7d  NUMERIC(8,2),
    -- coin 7d return - BTC 7d return (in %). Positive = outperforming.
    ADD COLUMN IF NOT EXISTS is_extended          BOOLEAN  DEFAULT FALSE;
    -- TRUE if coin outperformed BTC > 30% in last 7d


-- Indexes for the new fields useful in dashboard queries
CREATE INDEX IF NOT EXISTS idx_correlation_confidence
    ON signal_btc_correlation(confidence);
CREATE INDEX IF NOT EXISTS idx_correlation_extended
    ON signal_btc_correlation(is_extended) WHERE is_extended = TRUE;
CREATE INDEX IF NOT EXISTS idx_correlation_downside_beta
    ON signal_btc_correlation(downside_beta DESC NULLS LAST);


-- Update the convenience view to expose new fields
DROP VIEW IF EXISTS v_signal_with_correlation;
CREATE VIEW v_signal_with_correlation AS
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
    c.tail_corr_btc_down,
    c.tail_corr_btc_up,
    c.downside_beta,
    c.lead_lag_hours,
    c.volatility_ratio,
    c.coin_volatility_pct,
    c.momentum_divergence_7d,
    c.is_extended,
    c.btc_context,
    c.is_decoupled,
    c.interpretation,
    c.confidence,
    c.sample_size,
    c.data_source        AS correlation_source,
    c.sample_quality     AS correlation_quality,
    c.analyzed_at        AS correlation_analyzed_at
FROM signals s
LEFT JOIN coins                  co ON co.pair = s.pair
LEFT JOIN signal_btc_correlation c  ON c.signal_id = s.signal_id;
