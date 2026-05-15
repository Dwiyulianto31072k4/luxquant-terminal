-- ============================================================
-- LuxQuant: BTC Correlation v3 — Point-in-time tracking
-- ============================================================
-- Adds column to record WHEN the correlation snapshot reflects.
-- For live worker: == signals.created_at
-- For backfill:    == signals.created_at (historical snapshot)
-- ============================================================

ALTER TABLE signal_btc_correlation
    ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMP WITH TIME ZONE;
-- snapshot_at = the moment in time the correlation analysis represents.
-- Different from analyzed_at, which is when the worker actually computed it.
-- e.g. signal created Jan 2024, processed by backfill May 2026:
--   snapshot_at = Jan 2024  (BTC context + correlation as-of that time)
--   analyzed_at = May 2026  (when we ran the math)

CREATE INDEX IF NOT EXISTS idx_correlation_snapshot_at
    ON signal_btc_correlation(snapshot_at DESC NULLS LAST);

-- Update view
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
    c.snapshot_at,
    c.data_source        AS correlation_source,
    c.sample_quality     AS correlation_quality,
    c.analyzed_at        AS correlation_analyzed_at
FROM signals s
LEFT JOIN coins                  co ON co.pair = s.pair
LEFT JOIN signal_btc_correlation c  ON c.signal_id = s.signal_id;
