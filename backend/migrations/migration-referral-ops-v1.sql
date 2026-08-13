-- Referral Operations v1 — additive, zero-downtime tables only.
-- Safe to run repeatedly.

BEGIN;

CREATE TABLE IF NOT EXISTS referral_reminder_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    opted_out BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_reminder_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code_id INTEGER REFERENCES referral_codes(id) ON DELETE SET NULL,
    segment VARCHAR(30) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'telegram',
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    message TEXT NOT NULL,
    error TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_reminder_events_user
    ON referral_reminder_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_reminder_events_status
    ON referral_reminder_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_reminder_events_sent
    ON referral_reminder_events(sent_at DESC) WHERE sent_at IS NOT NULL;

COMMIT;
