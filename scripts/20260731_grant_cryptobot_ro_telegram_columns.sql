-- cryptobot reads a user's Telegram handle out of the luxquant database to
-- decide where to send an alert (app/domains/monitoring/telegram.py,
-- sync_luxquant_telegram). The cryptobot_ro role had SELECT on `signals` and
-- nothing else, so that query failed every single time.
--
-- The failure was silent to cryptobot — sync_luxquant_telegram catches and
-- returns False — but not to Postgres: 4,186,164 "permission denied for table
-- users" errors had accumulated, arriving at ~490 per minute, each one a fresh
-- connection and backend fork. The server log had grown to 948 MB of it.
--
-- Three columns only. `users` also holds password_hash and subscription data,
-- and a read-only reporting role has no business with either.
GRANT SELECT (id, telegram_id, telegram_username) ON users TO cryptobot_ro;

-- Undo:
--   REVOKE SELECT (id, telegram_id, telegram_username) ON users FROM cryptobot_ro;
