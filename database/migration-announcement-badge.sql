-- ════════════════════════════════════════════════════════════════
-- Campaign badge — the small pill that sits on the announcement image
-- ("NEW", "UPDATE", "PROMO"). Admin-typed, free text, NULL = no pill.
--
-- Metadata-only on PostgreSQL 11+ (nullable, no DEFAULT), so it does not
-- rewrite the table. lock_timeout is set anyway: the announcements table is
-- read on every authenticated page load, and a blocked ALTER queues behind
-- an ACCESS EXCLUSIVE lock that would stall those reads. Fail fast instead.
-- ════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS badge TEXT;

RESET lock_timeout;

-- Verify
\d announcements
