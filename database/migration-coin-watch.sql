-- ============================================
-- LuxQuant Terminal - Coin Watch (Waitlist) Migration
-- ============================================
-- Notif coin-called di-generate notification_worker.py
-- (generate_coin_called_notifications) ke tabel notifications yg ada,
-- type='coin_called'. TANPA trigger. Idempotent.
-- ============================================

CREATE TABLE IF NOT EXISTS coin_watch (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol      TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_coin_watch_user   ON coin_watch(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_watch_symbol ON coin_watch(symbol);
