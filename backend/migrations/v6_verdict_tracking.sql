-- ════════════════════════════════════════════════════════════════════
-- LuxQuant AI Arena v6.1 — Verdict Tracking Migration
-- ════════════════════════════════════════════════════════════════════
-- This migration EXTENDS existing v4 tables (no destructive changes).
-- Idempotent: safe to run multiple times.
--
-- Changes:
--   1. ALTER ai_arena_reports — add v6 verdict columns (nullable)
--   2. CREATE ai_arena_verdict_outcomes — new table for track record
--   3. Add indexes for ledger queries
--
-- Run: psql -U luxq -d luxquant -f v6_verdict_tracking.sql
-- Verify: \d ai_arena_reports
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Extend ai_arena_reports with v6 columns
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS schema_version VARCHAR(10) DEFAULT 'v4';

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS primary_direction_30d VARCHAR(10);    -- bullish/bearish/neutral

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS primary_confidence_30d INTEGER;       -- 0-100

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS secondary_direction_7d VARCHAR(10);

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS secondary_confidence_7d INTEGER;

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS tactical_direction_24h VARCHAR(10);

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS tactical_confidence_24h INTEGER;

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS cycle_score DOUBLE PRECISION;         -- 0-100

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS cycle_phase VARCHAR(20);              -- ACCUMULATION, etc.

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS critique_decision VARCHAR(30);        -- approved/approved_with_caveat/needs_revision

ALTER TABLE ai_arena_reports
  ADD COLUMN IF NOT EXISTS total_cost_usd DOUBLE PRECISION;      -- AI generation cost

-- Mark existing reports as v4 explicitly
UPDATE ai_arena_reports
SET schema_version = 'v4'
WHERE schema_version IS NULL OR schema_version = '';

-- Index for filtering by schema version (v4 vs v6)
CREATE INDEX IF NOT EXISTS idx_ai_arena_reports_schema_version
  ON ai_arena_reports(schema_version);

-- Index for ledger queries (latest first by schema)
CREATE INDEX IF NOT EXISTS idx_ai_arena_reports_v6_timestamp
  ON ai_arena_reports(timestamp DESC)
  WHERE schema_version = 'v6.1';


-- ─────────────────────────────────────────────────────────────────────
-- 2. Create ai_arena_verdict_outcomes
-- ─────────────────────────────────────────────────────────────────────
-- Stores hit/miss evaluation per (report, horizon).
-- Each v6 report creates 4 rows initially (24h/72h/7d/30d), all status='pending'.
-- Hourly cron evaluator updates rows whose horizon has elapsed.

CREATE TABLE IF NOT EXISTS ai_arena_verdict_outcomes (
    id              BIGSERIAL PRIMARY KEY,
    report_id       INTEGER NOT NULL REFERENCES ai_arena_reports(id) ON DELETE CASCADE,
    report_uuid     VARCHAR(40) NOT NULL,                        -- denormalized for direct lookup (v6_xxxxx)
    horizon         VARCHAR(10) NOT NULL,                        -- '24h', '72h', '7d', '30d'

    -- Verdict at time of call
    direction       VARCHAR(10) NOT NULL,                        -- bullish/bearish/neutral
    confidence      INTEGER,                                     -- 0-100 (nullable for backfilled)
    price_at_call   DOUBLE PRECISION NOT NULL,
    called_at       TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Evaluation
    horizon_target_at  TIMESTAMP WITH TIME ZONE NOT NULL,        -- called_at + horizon
    price_at_horizon   DOUBLE PRECISION,                         -- filled by evaluator
    move_pct           DOUBLE PRECISION,                         -- (price_at_horizon / price_at_call - 1) * 100
    outcome            VARCHAR(15) NOT NULL DEFAULT 'pending',   -- pending/hit/miss/expired

    -- Threshold logic used (for reproducibility)
    threshold_pct      DOUBLE PRECISION DEFAULT 1.0,             -- direction threshold
    neutral_band_pct   DOUBLE PRECISION DEFAULT 2.0,             -- neutral ±band

    evaluated_at       TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_outcome_report_horizon UNIQUE (report_id, horizon)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_pending
  ON ai_arena_verdict_outcomes(outcome, horizon_target_at)
  WHERE outcome = 'pending';

CREATE INDEX IF NOT EXISTS idx_outcomes_called_at
  ON ai_arena_verdict_outcomes(called_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcomes_report_uuid
  ON ai_arena_verdict_outcomes(report_uuid);

CREATE INDEX IF NOT EXISTS idx_outcomes_horizon_outcome
  ON ai_arena_verdict_outcomes(horizon, outcome)
  WHERE outcome IN ('hit', 'miss');


-- ─────────────────────────────────────────────────────────────────────
-- 3. Verification queries (manual run after migration)
-- ─────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'ai_arena_reports' AND column_name LIKE '%direction%';
--
-- SELECT count(*) FROM ai_arena_reports WHERE schema_version = 'v4';
-- SELECT count(*) FROM ai_arena_verdict_outcomes;

COMMIT;

-- Done. Schema ready for v6 reports + outcome tracking.
