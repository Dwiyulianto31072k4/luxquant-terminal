-- Saved signal filters that gate alerts.
--
-- Asked for by a subscriber who wanted "only Hunt Full TP, risk normal" rather
-- than every call. Nothing existing covers it: notification_preferences is an
-- on/off switch per notification type, and coin_watch fires only for coins the
-- user already picked by hand. Neither can express a condition.
--
-- Criteria are stored as jsonb rather than columns because the filter set on
-- the Signals page changes often, and a schema migration per filter would mean
-- saved presets silently losing meaning between deploys.
--
-- Everything a filter can test lives in signals + signal_enrichment, so a
-- filter is evaluable the moment enrichment lands — median 3.8 minutes after
-- the call, p90 11.5.

BEGIN;

CREATE TABLE IF NOT EXISTS signal_alert_filters (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    criteria        JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_matched_at TIMESTAMPTZ,
    match_count     INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT signal_alert_filters_name_uniq UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_saf_user ON signal_alert_filters (user_id);

-- The evaluator sweeps enabled filters on every pass; without this it reads
-- every row belonging to every user on a table that only grows.
CREATE INDEX IF NOT EXISTS idx_saf_enabled
    ON signal_alert_filters (user_id) WHERE enabled;

-- One row per (filter, signal) that already fired. This is what stops a signal
-- being re-announced on every worker pass, and it is why the evaluator can be
-- restarted without spamming anyone.
CREATE TABLE IF NOT EXISTS signal_alert_matches (
    filter_id  INTEGER NOT NULL REFERENCES signal_alert_filters(id) ON DELETE CASCADE,
    signal_id  TEXT NOT NULL,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (filter_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_sam_signal ON signal_alert_matches (signal_id);

COMMENT ON TABLE signal_alert_filters IS
    'Saved filter presets per user. enabled=true means matching signals raise a '
    'signal_match notification, which the Telegram worker then delivers if the '
    'user has that type switched on.';
COMMENT ON COLUMN signal_alert_filters.criteria IS
    'jsonb: risk_level[], rating[], min_confidence, tags[], tag_match (any|all), pairs[]';

COMMIT;

-- ── Verifikasi ───────────────────────────────────────────────────────
--   SELECT count(*) FROM signal_alert_filters;
--   SELECT count(*) FROM signal_alert_matches;
