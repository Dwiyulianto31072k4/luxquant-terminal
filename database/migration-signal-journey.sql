-- ============================================
-- LuxQuant Terminal - Signal Journey Migration
-- ============================================
-- Layer 2 dari fitur Signal Journey
-- Bikin table signal_journey buat nyimpen analysis price action per-signal:
-- initial drawdown (silent dump sebelum TP1), swing events, peak excursion,
-- TP-then-SL detection, dan post-trade gap analysis.
--
-- Jalankan di lokal (Mac, via SSH tunnel):
--   psql -h 127.0.0.1 -U luxq -d luxquant -f database/migration-signal-journey.sql
--
-- Jalankan di VPS (peer auth):
--   sudo -u postgres psql -d luxquant -f /root/luxquant-terminal/database/migration-signal-journey.sql
--
-- Idempotent: aman di-run berkali-kali.
-- Rollback: DROP TABLE IF EXISTS signal_journey CASCADE;
-- ============================================

BEGIN;

-- ============================================
-- 1. Main table
-- ============================================
CREATE TABLE IF NOT EXISTS signal_journey (
    -- IDENTITY
    signal_id           TEXT PRIMARY KEY REFERENCES signals(signal_id) ON DELETE CASCADE,

    -- METADATA
    direction           TEXT NOT NULL,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_event_at       TIMESTAMPTZ,
    data_source         TEXT NOT NULL,
    kline_interval      TEXT NOT NULL DEFAULT '1h',
    swing_threshold_pct REAL NOT NULL DEFAULT 1.5,

    -- COVERAGE WINDOW
    coverage_from       TIMESTAMPTZ NOT NULL,
    coverage_until      TIMESTAMPTZ NOT NULL,
    coverage_status     TEXT NOT NULL,

    -- EVENTS TIMELINE (source of truth)
    events              JSONB NOT NULL,

    -- AGGREGATE METRICS - Excursion extremes
    overall_mae_pct     REAL,
    overall_mae_at      TIMESTAMPTZ,
    overall_mfe_pct     REAL,
    overall_mfe_at      TIMESTAMPTZ,

    -- Initial drawdown (THE key metric Erik minta)
    initial_mae_pct     REAL,
    initial_mae_at      TIMESTAMPTZ,
    initial_mae_before  TEXT,

    -- Speed
    time_to_tp1_seconds      INTEGER,
    time_to_outcome_seconds  INTEGER,

    -- Comfort
    pct_time_above_entry     REAL,

    -- TP-then-SL warning
    tp_then_sl          BOOLEAN NOT NULL DEFAULT FALSE,
    tps_hit_before_sl   JSONB,

    -- Post-trade gap analysis
    realized_outcome_pct REAL,
    missed_potential_pct REAL,

    -- ============================================
    -- CONSTRAINTS (data integrity)
    -- ============================================
    CONSTRAINT chk_journey_direction
        CHECK (direction IN ('long', 'short')),

    CONSTRAINT chk_journey_coverage_status
        CHECK (coverage_status IN ('live', 'frozen', 'sl_truncated', 'unavailable')),

    CONSTRAINT chk_journey_data_source
        CHECK (data_source IN ('binance_futures', 'binance_spot', 'bybit_linear', 'bybit_spot', 'unavailable')),

    CONSTRAINT chk_journey_initial_before
        CHECK (initial_mae_before IS NULL OR initial_mae_before IN ('tp1', 'sl', 'none')),

    -- Sign convention: mae always <= 0 (adverse), mfe always >= 0 (favorable)
    -- For SHORT signals, compute logic flips signs so semantic stays consistent
    CONSTRAINT chk_journey_mae_sign
        CHECK (overall_mae_pct IS NULL OR overall_mae_pct <= 0),

    CONSTRAINT chk_journey_mfe_sign
        CHECK (overall_mfe_pct IS NULL OR overall_mfe_pct >= 0),

    CONSTRAINT chk_journey_initial_mae_sign
        CHECK (initial_mae_pct IS NULL OR initial_mae_pct <= 0),

    -- Time fields non-negative
    CONSTRAINT chk_journey_time_tp1
        CHECK (time_to_tp1_seconds IS NULL OR time_to_tp1_seconds >= 0),

    CONSTRAINT chk_journey_time_outcome
        CHECK (time_to_outcome_seconds IS NULL OR time_to_outcome_seconds >= 0),

    CONSTRAINT chk_journey_swing_thresh
        CHECK (swing_threshold_pct > 0),

    -- pct_time_above_entry harus 0-100
    CONSTRAINT chk_journey_pct_time
        CHECK (pct_time_above_entry IS NULL OR (pct_time_above_entry >= 0 AND pct_time_above_entry <= 100)),

    -- coverage_until >= coverage_from
    CONSTRAINT chk_journey_coverage_window
        CHECK (coverage_until >= coverage_from),

    -- tp_then_sl flag harus konsisten sama tps_hit_before_sl
    CONSTRAINT chk_journey_tp_then_sl_consistency
        CHECK (
            (tp_then_sl = FALSE AND tps_hit_before_sl IS NULL) OR
            (tp_then_sl = TRUE  AND tps_hit_before_sl IS NOT NULL)
        ),

    -- missed_potential_pct harus konsisten kalau ada
    -- (= overall_mfe_pct - realized_outcome_pct, jadi kalau dua-duanya ada, ini juga ada)
    CONSTRAINT chk_journey_missed_potential
        CHECK (
            missed_potential_pct IS NULL OR
            (overall_mfe_pct IS NOT NULL AND realized_outcome_pct IS NOT NULL)
        )
);

-- Set ownership ke luxq (sama kayak tabel signals lain)
ALTER TABLE signal_journey OWNER TO luxq;


-- ============================================
-- 2. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_journey_computed
    ON signal_journey(computed_at);

CREATE INDEX IF NOT EXISTS idx_journey_mae
    ON signal_journey(overall_mae_pct);

CREATE INDEX IF NOT EXISTS idx_journey_mfe
    ON signal_journey(overall_mfe_pct);

CREATE INDEX IF NOT EXISTS idx_journey_initial_mae
    ON signal_journey(initial_mae_pct);

CREATE INDEX IF NOT EXISTS idx_journey_status
    ON signal_journey(coverage_status);

-- Partial index buat fast filter "signals yang TP-then-SL"
CREATE INDEX IF NOT EXISTS idx_journey_tp_then_sl
    ON signal_journey(tp_then_sl) WHERE tp_then_sl = TRUE;

-- GIN index buat JSONB events (fast filter by event type, dst)
CREATE INDEX IF NOT EXISTS idx_journey_events_gin
    ON signal_journey USING GIN (events);


-- ============================================
-- 3. Comments (self-documentation, muncul di \d+ signal_journey)
-- ============================================
COMMENT ON TABLE signal_journey IS
    'Per-signal price action analysis: drawdown, swings, peak excursion. Computed from OHLCV kline (Binance/Bybit fallback chain).';

COMMENT ON COLUMN signal_journey.events IS
    'Chronological array of events. Types: entry | swing_low | swing_high | tp1-tp4 | sl. Field telegram=true berarti event datang dari signal_updates (announced); tanpa flag = swing detected dari kline analysis.';

COMMENT ON COLUMN signal_journey.coverage_status IS
    'live: masih di-update reactive on signal_update | frozen: post-TP4 lebih dari 14d, freeze | sl_truncated: stopped di SL trigger | unavailable: pair gak ada di Binance/Bybit';

COMMENT ON COLUMN signal_journey.initial_mae_pct IS
    'Worst drawdown dari entry sebelum first TP hit (atau sebelum SL kalau gak ada TP). Selalu <= 0 (sign-normalized buat trader perspective, jadi LONG dan SHORT semantic-nya sama).';

COMMENT ON COLUMN signal_journey.swing_threshold_pct IS
    'ZigZag deviation threshold buat swing detection. Default 1.5% (filter noise, capture significant moves only).';

COMMENT ON COLUMN signal_journey.tp_then_sl IS
    'TRUE kalau signal hit TP dulu sebelum dump ke SL. Penting buat user kalibrasi exit strategy (ambil profit di TP1 vs hold full).';

COMMENT ON COLUMN signal_journey.missed_potential_pct IS
    'Gap antara realized outcome vs absolute peak. Positif = user "ketinggalan" peak kalau hold lebih lama. NULL kalau SL atau intermediate.';


COMMIT;


-- ============================================
-- VERIFICATION (jalanin ini setelah migration)
-- ============================================

-- 1. Check table exists & structure
-- \d+ signal_journey

-- 2. Check indexes
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'signal_journey';

-- 3. Check constraints
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'signal_journey'::regclass
-- ORDER BY conname;

-- 4. Should return 0 (empty table after fresh migration)
-- SELECT COUNT(*) FROM signal_journey;

-- 5. Smoke test: insert dummy row buat verify all constraints work
-- (Uncomment dan run manual buat test, terus delete)
/*
INSERT INTO signal_journey (
    signal_id, direction, data_source,
    coverage_from, coverage_until, coverage_status,
    events,
    overall_mae_pct, overall_mae_at,
    overall_mfe_pct, overall_mfe_at,
    initial_mae_pct, initial_mae_at, initial_mae_before,
    time_to_tp1_seconds,
    pct_time_above_entry,
    tp_then_sl, tps_hit_before_sl,
    realized_outcome_pct, missed_potential_pct
) VALUES (
    (SELECT signal_id FROM signals LIMIT 1),  -- pake signal_id yg ada
    'long', 'binance_futures',
    NOW() - INTERVAL '1 day', NOW(), 'live',
    '[
        {"type":"entry","at":"2026-04-24T11:55:00Z","price":0.2088,"pct":0},
        {"type":"swing_low","at":"2026-04-24T12:30:00Z","price":0.2030,"pct":-2.78},
        {"type":"tp1","at":"2026-04-24T13:10:00Z","price":0.2150,"pct":2.97,"telegram":true}
    ]'::jsonb,
    -2.78, '2026-04-24T12:30:00Z',
    22.51, '2026-04-24T23:00:00Z',
    -2.78, '2026-04-24T12:30:00Z', 'tp1',
    4500,
    94.2,
    FALSE, NULL,
    20.21, 2.30
);

-- Verify smoke insert
SELECT signal_id, direction, coverage_status, overall_mae_pct, overall_mfe_pct,
       jsonb_array_length(events) as event_count
FROM signal_journey;

-- Cleanup smoke test
DELETE FROM signal_journey WHERE signal_id = (SELECT signal_id FROM signals LIMIT 1);
*/
