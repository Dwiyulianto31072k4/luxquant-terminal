-- Watchlist: did you actually take this call?
--
-- Measured before writing this (2026-09-12): the watchlist holds 741 rows for
-- 60 users, 98.2% of them already resolved and 90% older than seven days. It
-- stopped being a "things to watch" list a long time ago and became a journal —
-- but a journal that cannot tell a call you entered from one you only watched.
--
-- THREE states, not a boolean. Every one of those 741 existing rows has never
-- been answered, and a boolean would silently record all of them as "not taken"
-- the moment this ships. NULL means not answered yet and is the only honest
-- default; 'taken' and 'skipped' are the two things a person can actually say.
--
-- Nullable ADD COLUMN with no default does not rewrite the table on PG 11+, and
-- this table is 741 rows, so the ACCESS EXCLUSIVE lock is taken and released
-- immediately — not the users-table incident where an ADD COLUMN at import time
-- queued behind long reads.

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS taken TEXT;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'watchlist_taken_check'
    ) THEN
        ALTER TABLE watchlist
            ADD CONSTRAINT watchlist_taken_check
            CHECK (taken IS NULL OR taken IN ('taken', 'skipped'));
    END IF;
END $$;

-- The journal bar counts by state for one user; every read is user-scoped.
CREATE INDEX IF NOT EXISTS idx_watchlist_user_taken ON watchlist (user_id, taken);
