-- Canonical authenticated growth milestones.
--
-- Existing sources remain authoritative for their own domains:
--   funnel_events        anonymous landing/auth funnel
--   users.acq_*          first-touch acquisition
--   user_activity_events coarse feature usage / retention
--   payments             invoices and confirmed revenue
--
-- This table only fills the missing, user-linked intent milestones that cannot
-- be reconstructed reliably from those sources (proof views, pricing intent,
-- checkout actions and payment-verification attempts).
--
-- Idempotent. Run before deploying code that writes growth_events:
--   sudo -u postgres psql -d luxquant -f backend/migrations/growth_measurement_foundation.sql

BEGIN;

CREATE TABLE IF NOT EXISTS growth_events (
    id            bigserial PRIMARY KEY,
    event_id      varchar(80),
    user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event         varchar(64) NOT NULL,
    session_id    varchar(80),
    source        varchar(80),
    path          varchar(200),
    entity_type   varchar(40),
    entity_id     varchar(100),
    meta          jsonb,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT growth_events_event_not_blank CHECK (length(trim(event)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_growth_events_event_id
    ON growth_events (event_id)
    WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_growth_events_user_time
    ON growth_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_growth_events_event_time
    ON growth_events (event, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_growth_events_user_event_time
    ON growth_events (user_id, event, occurred_at DESC);

COMMIT;
