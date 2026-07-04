-- migration-bot-started-v1.sql
-- ---------------------------------------------------------------------------
-- Bot DM readiness tracking.
--
-- Adds users.telegram_bot_started_at: set the first time the bot successfully
-- DMs a user (only possible after they've /started the bot). Lets the admin
-- CRM tell apart "linked Telegram" from "we can actually message them".
--
-- Safe to run multiple times (IF NOT EXISTS). No data backfill required — the
-- column fills in naturally as admins send DMs; users already inside the VIP
-- group are treated as bot-ready at query time.
-- ---------------------------------------------------------------------------

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS telegram_bot_started_at TIMESTAMPTZ NULL;

-- Optional backfill: anyone currently inside the VIP group has demonstrably
-- interacted with the bot, so mark them ready.
UPDATE users
   SET telegram_bot_started_at = COALESCE(telegram_bot_started_at, NOW())
 WHERE telegram_in_group = TRUE
   AND telegram_bot_started_at IS NULL;
