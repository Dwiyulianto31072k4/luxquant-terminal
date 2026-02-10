-- ============================================
-- LuxQuant Terminal - Watchlist Migration
-- ============================================
-- Jalankan di lokal: docker exec -i luxquant-db psql -U luxquant -d luxquant < database/migration-watchlist.sql
-- Jalankan di VPS:   psql -U <user> -d <db> < migration-watchlist.sql
-- ============================================

-- 1. Buat tabel users (kalau belum ada)
--    Backend pakai SQLAlchemy model User, tapi init.sql ga punya CREATE TABLE users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 2. Buat tabel watchlist (yang dipakai backend watchlist.py)
CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signal_id TEXT NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, signal_id)  -- satu user ga bisa star signal yang sama 2x
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_signal ON watchlist(signal_id);

-- 3. (Optional) Drop tabel starred_signals lama yang ga kepake
-- Uncomment kalau mau hapus:
-- DROP TABLE IF EXISTS starred_signals;

-- ============================================
-- Verifikasi
-- ============================================
-- Cek tabel sudah dibuat:
-- \dt users
-- \dt watchlist
-- \d watchlist
