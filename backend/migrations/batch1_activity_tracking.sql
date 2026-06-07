-- backend/migrations/batch1_activity_tracking.sql
-- Run once on the production DB:
--   sudo -u postgres psql -d luxquant -f batch1_activity_tracking.sql
-- (or paste the block into psql). All statements are idempotent.

BEGIN;

-- 1. New activity columns on users (do NOT touch existing login_count / last_login_at)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_active_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS total_sessions        INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_feature_touched  VARCHAR(50);

-- 2. Seed last_active_at from last_login_at so "last seen" isn't blank
--    for existing users until they generate fresh activity.
UPDATE users
SET last_active_at = last_login_at
WHERE last_active_at IS NULL
  AND last_login_at IS NOT NULL;

-- 3. Per-feature event log (deduped to ~1 row per user/feature/hour by the middleware)
CREATE TABLE IF NOT EXISTS user_activity_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature     VARCHAR(50) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_activity_user_time
    ON user_activity_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_activity_feature_time
    ON user_activity_events (feature, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_user_activity_events_user_id
    ON user_activity_events (user_id);

CREATE INDEX IF NOT EXISTS ix_user_activity_events_feature
    ON user_activity_events (feature);

CREATE INDEX IF NOT EXISTS ix_user_activity_events_occurred_at
    ON user_activity_events (occurred_at);

COMMIT;

-- Verify:
--   \d+ user_activity_events
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='users'
--       AND column_name IN ('last_active_at','total_sessions','last_feature_touched');
