-- Migration: Max Leverage per Signal (idempotent, safe re-run)

-- Real max leverage from Binance Futures (source of truth)
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS max_leverage INTEGER;

-- Worker status: pending = belum, done = sukses, error = gagal fetch, unsupported = coin gak ada di Binance futures
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS max_leverage_status VARCHAR(20) DEFAULT 'pending';

-- Kapan terakhir di-compute
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS max_leverage_at TIMESTAMPTZ;

-- Index buat cepet cari signal pending (backfill)
CREATE INDEX IF NOT EXISTS idx_signals_max_leverage_status
    ON signals (max_leverage_status)
    WHERE max_leverage_status = 'pending';

