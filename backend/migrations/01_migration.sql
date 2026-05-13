-- ============================================================
-- LuxQuant: BTC Correlation Injection — Schema Migration
-- ============================================================
-- Creates:
--   1. Table signal_btc_correlation (stores metrics + interpretation per signal)
--   2. Trigger on signals INSERT → pg_notify('signal_created', signal_id)
-- ============================================================

CREATE TABLE IF NOT EXISTS signal_btc_correlation (
    id              SERIAL PRIMARY KEY,
    signal_id       BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    coin_symbol     VARCHAR(20) NOT NULL,

    -- 5 core metrics
    corr_1h_7d      NUMERIC(6,4),   -- Pearson, short-term (entry timing)
    corr_4h_30d     NUMERIC(6,4),   -- Pearson, medium-term (regime)
    beta_30d        NUMERIC(8,4),   -- Slope vs BTC returns (position sizing)
    r_squared_30d   NUMERIC(6,4),   -- Coefficient of determination (explained variance)
    corr_zscore     NUMERIC(8,4),   -- Current corr vs 90d baseline (decoupling)

    -- BTC snapshot at signal time
    btc_context     JSONB,          -- { price, trend, rsi_14, change_24h_pct, regime, dominance }

    -- Flags
    is_decoupled    BOOLEAN DEFAULT FALSE,

    -- Auto-generated interpretation (English)
    interpretation  JSONB,          -- { alignment_score, risk_level, headline, summary,
                                    --   sizing_hint, hedge_hint, regime_warning,
                                    --   decoupling_note, trade_bias }

    -- Metadata
    data_source     VARCHAR(20),    -- 'binance' | 'coingecko'
    sample_quality  VARCHAR(10),    -- 'high' | 'medium' | 'low'
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_signal_correlation UNIQUE (signal_id)
);

CREATE INDEX IF NOT EXISTS idx_corr_signal_id   ON signal_btc_correlation(signal_id);
CREATE INDEX IF NOT EXISTS idx_corr_computed_at ON signal_btc_correlation(computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_corr_decoupled   ON signal_btc_correlation(is_decoupled) WHERE is_decoupled = TRUE;
CREATE INDEX IF NOT EXISTS idx_corr_symbol      ON signal_btc_correlation(coin_symbol);

-- ============================================================
-- LISTEN/NOTIFY trigger — fires whenever a new signal is inserted
-- ============================================================
CREATE OR REPLACE FUNCTION notify_signal_created() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('signal_created', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_signal_created_corr ON signals;
CREATE TRIGGER trg_signal_created_corr
    AFTER INSERT ON signals
    FOR EACH ROW
    EXECUTE FUNCTION notify_signal_created();

-- ============================================================
-- Helper view: signal + correlation joined (convenience for API)
-- ============================================================
CREATE OR REPLACE VIEW v_signal_with_correlation AS
SELECT
    s.*,
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
    c.computed_at        AS correlation_computed_at
FROM signals s
LEFT JOIN signal_btc_correlation c ON c.signal_id = s.id;
