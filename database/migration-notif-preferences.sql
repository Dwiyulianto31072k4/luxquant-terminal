-- ============================================
-- LuxQuant Terminal — Notification Preferences
-- Layer 1: tabel preferensi notif per-user per-tipe
-- ============================================
-- Lokal:  docker exec -i luxquant-db psql -U luxquant -d luxquant < migration-notif-preferences.sql
-- VPS:    psql -U <user> -d luxquant < migration-notif-preferences.sql   (JANGAN dulu, test lokal)
-- ============================================
--
-- Pola desain: ABSENCE = DEFAULT.
-- Kalau user belum pernah set sebuah tipe, anggap pakai default dari registry
-- di aplikasi (in_app=ON, telegram=OFF). Jadi TIDAK perlu seed row per user.
--
-- Channel telegram hanya efektif kalau users.telegram_id IS NOT NULL
-- (di-enforce di backend, bukan di DB, biar fleksibel).
-- ============================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notif_type TEXT    NOT NULL,
    in_app     BOOLEAN NOT NULL DEFAULT TRUE,
    telegram   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, notif_type)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);

-- Verifikasi:
-- \d notification_preferences
