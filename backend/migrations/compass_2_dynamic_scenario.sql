-- =====================================================================
-- LuxQuant Compass 2.0 - Dynamic Scenario Map Foundation
-- =====================================================================
-- Additive migration only. Existing ai_arena_reports, signals, and
-- signal_updates stay as the source of truth for legacy reports and official
-- LuxQuant calls.
--
-- Run:
--   psql -U luxq -d luxquant -f backend/migrations/compass_2_dynamic_scenario.sql
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS compass_reads (
    read_id              VARCHAR(48) PRIMARY KEY,
    report_pk            INTEGER REFERENCES ai_arena_reports(id) ON DELETE SET NULL,
    report_id            VARCHAR(40),
    issued_at            TIMESTAMPTZ NOT NULL,
    btc_reference_price  NUMERIC(30, 12) NOT NULL,
    snapshot_hash        VARCHAR(80),
    schema_version       VARCHAR(20) NOT NULL DEFAULT 'compass_2.0',
    model_version        VARCHAR(80),
    prompt_version       VARCHAR(80),
    source_json          JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compass_reads_issued_at
    ON compass_reads(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_compass_reads_report_id
    ON compass_reads(report_id);
CREATE INDEX IF NOT EXISTS idx_compass_reads_snapshot_hash
    ON compass_reads(snapshot_hash);

CREATE TABLE IF NOT EXISTS compass_projection_contracts (
    projection_id              VARCHAR(64) PRIMARY KEY,
    read_id                    VARCHAR(48) NOT NULL REFERENCES compass_reads(read_id) ON DELETE CASCADE,
    version                    INTEGER NOT NULL DEFAULT 1,
    status                     VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    primary_bias               VARCHAR(48) NOT NULL,
    reference_price            NUMERIC(30, 12) NOT NULL,

    support_level              NUMERIC(30, 12) NOT NULL,
    support_trigger            VARCHAR(32) NOT NULL,
    confirmation_level         NUMERIC(30, 12) NOT NULL,
    confirmation_trigger       VARCHAR(32) NOT NULL,
    primary_touch_level        NUMERIC(30, 12) NOT NULL,
    primary_touch_trigger      VARCHAR(32) NOT NULL,
    extension_low              NUMERIC(30, 12) NOT NULL,
    extension_high             NUMERIC(30, 12) NOT NULL,
    invalidation_level         NUMERIC(30, 12) NOT NULL,
    invalidation_trigger       VARCHAR(32) NOT NULL,

    alternative_path           JSONB NOT NULL,
    market_mode                VARCHAR(48) NOT NULL,
    expected_pace              VARCHAR(32) NOT NULL,
    soft_review_after_minutes  INTEGER NOT NULL,
    stale_after_minutes        INTEGER NOT NULL,
    probabilities              JSONB NOT NULL,
    key_conditions             JSONB NOT NULL,
    key_risks                  JSONB NOT NULL,
    contract_json              JSONB NOT NULL,

    active_from                TIMESTAMPTZ NOT NULL,
    superseded_at              TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_compass_projection_read_version UNIQUE (read_id, version),
    CONSTRAINT chk_compass_projection_positive_levels CHECK (
        reference_price > 0
        AND support_level > 0
        AND confirmation_level > 0
        AND primary_touch_level > 0
        AND extension_low > 0
        AND extension_high > 0
        AND invalidation_level > 0
    ),
    CONSTRAINT chk_compass_projection_extension_order CHECK (extension_low <= extension_high),
    CONSTRAINT chk_compass_projection_review_order CHECK (soft_review_after_minutes < stale_after_minutes)
);

CREATE INDEX IF NOT EXISTS idx_compass_projection_status
    ON compass_projection_contracts(status, active_from DESC);
CREATE INDEX IF NOT EXISTS idx_compass_projection_market_mode
    ON compass_projection_contracts(market_mode, active_from DESC);
CREATE INDEX IF NOT EXISTS idx_compass_projection_read_id
    ON compass_projection_contracts(read_id);

CREATE TABLE IF NOT EXISTS compass_projection_events (
    event_id       BIGSERIAL PRIMARY KEY,
    projection_id  VARCHAR(64) NOT NULL REFERENCES compass_projection_contracts(projection_id) ON DELETE CASCADE,
    event_time     TIMESTAMPTZ NOT NULL,
    event_type     VARCHAR(48) NOT NULL,
    price          NUMERIC(30, 12),
    source         VARCHAR(80),
    evidence_json  JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compass_projection_events_projection_time
    ON compass_projection_events(projection_id, event_time ASC);
CREATE INDEX IF NOT EXISTS idx_compass_projection_events_type
    ON compass_projection_events(event_type, event_time DESC);

CREATE TABLE IF NOT EXISTS compass_projection_resolutions (
    resolution_id                      BIGSERIAL PRIMARY KEY,
    projection_id                      VARCHAR(64) NOT NULL UNIQUE REFERENCES compass_projection_contracts(projection_id) ON DELETE CASCADE,
    outcome                            VARCHAR(48) NOT NULL,
    first_barrier                      VARCHAR(48),
    first_barrier_at                   TIMESTAMPTZ,
    first_barrier_price                NUMERIC(30, 12),
    max_favorable_excursion_pct        NUMERIC(18, 8),
    max_adverse_excursion_pct          NUMERIC(18, 8),
    time_to_confirmation_seconds       INTEGER,
    time_to_target_seconds             INTEGER,
    time_to_invalidation_seconds       INTEGER,
    reason_codes                       JSONB NOT NULL DEFAULT '[]'::jsonb,
    observed_facts                     JSONB NOT NULL DEFAULT '{}'::jsonb,
    interpretation                     TEXT,
    evaluator_version                  VARCHAR(40) NOT NULL,
    policy_version                     VARCHAR(40) NOT NULL,
    resolved_at                        TIMESTAMPTZ NOT NULL,
    created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compass_projection_resolutions_outcome
    ON compass_projection_resolutions(outcome, resolved_at DESC);

CREATE TABLE IF NOT EXISTS btc_market_context_snapshots (
    snapshot_id              VARCHAR(64) PRIMARY KEY,
    captured_at              TIMESTAMPTZ NOT NULL,
    btc_price                NUMERIC(30, 12) NOT NULL,
    market_mode              VARCHAR(48) NOT NULL,
    dominance_state          VARCHAR(48),
    breadth_state            VARCHAR(48),
    volatility_regime        VARCHAR(48),
    liquidity_state          VARCHAR(48),
    funding_state            VARCHAR(48),
    open_interest_state      VARCHAR(48),
    is_data_fresh            BOOLEAN NOT NULL DEFAULT TRUE,
    freshness_seconds        INTEGER,
    snapshot_json            JSONB NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btc_market_context_captured_at
    ON btc_market_context_snapshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_btc_market_context_mode
    ON btc_market_context_snapshots(market_mode, captured_at DESC);

CREATE TABLE IF NOT EXISTS signal_btc_assessments (
    assessment_id             BIGSERIAL PRIMARY KEY,
    signal_id                 TEXT NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,
    projection_id             VARCHAR(64) REFERENCES compass_projection_contracts(projection_id) ON DELETE SET NULL,
    snapshot_id               VARCHAR(64) REFERENCES btc_market_context_snapshots(snapshot_id) ON DELETE SET NULL,
    as_of                     TIMESTAMPTZ NOT NULL,
    btc_impact                VARCHAR(32) NOT NULL,
    entry_aggression          VARCHAR(32) NOT NULL,
    holder_context            VARCHAR(40) NOT NULL,
    btc_vulnerability_score   INTEGER,
    reason_codes              JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation               TEXT,
    source_freshness_seconds  INTEGER,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_btc_assessments_signal_time
    ON signal_btc_assessments(signal_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_signal_btc_assessments_projection
    ON signal_btc_assessments(projection_id);
CREATE INDEX IF NOT EXISTS idx_signal_btc_assessments_impact
    ON signal_btc_assessments(btc_impact, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_signal_btc_assessments_aggression
    ON signal_btc_assessments(entry_aggression, as_of DESC);

CREATE TABLE IF NOT EXISTS outbox_events (
    event_id      BIGSERIAL PRIMARY KEY,
    event_type    VARCHAR(80) NOT NULL,
    payload       JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at  TIMESTAMPTZ,
    attempts      INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished
    ON outbox_events(created_at ASC)
    WHERE published_at IS NULL;

COMMIT;
