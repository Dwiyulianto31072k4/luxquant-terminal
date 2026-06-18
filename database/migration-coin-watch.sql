-- ============================================
-- LuxQuant Terminal - Coin Watch (Waitlist) + Notifications Migration
-- ============================================
-- Jalankan di lokal: docker exec -i luxquant-db psql -U luxquant -d luxquant < database/migration-coin-watch.sql
-- Jalankan di VPS:   psql -U luxq -d luxquant < migration-coin-watch.sql
-- ============================================
-- Idempotent: aman dijalanin berkali-kali (semua pakai IF NOT EXISTS).
-- Depends: tabel users + signals harus udah ada (lihat migration-watchlist.sql).
-- ============================================

-- ============================================
-- 1. coin_watch  — WAITLIST (coin-based)
--    Beda dari tabel `watchlist` yang signal-based (FK ke signal_id).
--    Ini nyimpen KOIN yang user tungguin, belum tentu udah ada signalnya.
--    `symbol` disimpan dalam format yang sama dgn signals.pair (mis. 'BTCUSDT').
-- ============================================
CREATE TABLE IF NOT EXISTS coin_watch (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol      TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, symbol)   -- satu user ga bisa watch koin yang sama 2x
);

CREATE INDEX IF NOT EXISTS idx_coin_watch_user   ON coin_watch(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_watch_symbol ON coin_watch(symbol);

-- ============================================
-- 2. notifications  — NOTIF CENTER (bell + dropdown)
--    type     : jenis notif (sementara cuma 'coin_called', future-proof)
--    signal_id: signal yang nge-trigger (buat buka SignalModal pas diklik)
--    pair     : disimpen denormalized biar dropdown ga perlu JOIN
--    is_read  : buat badge unread count
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'coin_called',
    signal_id   TEXT REFERENCES signals(signal_id) ON DELETE CASCADE,
    pair        TEXT,
    title       TEXT,
    body        TEXT,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- Partial index khusus query badge unread (paling sering dipanggil, polling 15s)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications(user_id) WHERE is_read = FALSE;

-- SAFETY NET: cegah notif dobel buat (user, signal) yang sama.
-- Ini penting karena scraper_core.upsert_signal pakai ON CONFLICT DO UPDATE,
-- jadi fungsinya kepanggil lagi tiap signal di-EDIT. Kalau hook notif keliru
-- nembak ulang, constraint ini yang nahan di level DB (ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_signal
    ON notifications(user_id, signal_id) WHERE signal_id IS NOT NULL;

-- ============================================
-- Verifikasi
-- ============================================
-- \dt coin_watch
-- \dt notifications
-- \d coin_watch
-- \d notifications
