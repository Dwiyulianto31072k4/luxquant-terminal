-- ════════════════════════════════════════════════════════════════════
-- LuxQuant — Exchange Delisting Alerts
-- ════════════════════════════════════════════════════════════════════
-- Menyimpan pengumuman delisting dari beberapa exchange (Binance CMS,
-- Bybit announcements API, dst). Worker `delisting_worker.py` yang mengisi.
-- Route /delistings membaca + hitung % move sejak announce (pump tracker).
--
-- Idempotent: aman dijalankan berkali-kali.
-- Run: psql "postgresql://luxq:...@127.0.0.1:5432/luxquant" -f migration-delisting-events.sql
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS delisting_events (
    id                BIGSERIAL PRIMARY KEY,
    exchange          TEXT NOT NULL,                 -- 'binance' | 'bybit' | 'okx'
    ann_id            TEXT NOT NULL,                 -- id unik pengumuman per-exchange (dedupe)
    title             TEXT NOT NULL,
    url               TEXT,
    announced_at      TIMESTAMPTZ,                   -- kapan diumumkan
    delist_at         TIMESTAMPTZ,                   -- tanggal delist efektif (kalau ke-parse)
    symbols           TEXT[],                        -- token yang di-delist (hasil parse judul/isi)
    price_at_announce JSONB,                         -- snapshot harga per-symbol saat pertama terlihat
    notified          BOOLEAN NOT NULL DEFAULT FALSE,-- sudah dipush ke user?
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_delisting_exchange_ann UNIQUE (exchange, ann_id)
);

CREATE INDEX IF NOT EXISTS ix_delisting_announced ON delisting_events (announced_at DESC);
CREATE INDEX IF NOT EXISTS ix_delisting_exchange  ON delisting_events (exchange, announced_at DESC);

COMMIT;
