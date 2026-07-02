-- ════════════════════════════════════════════════════════════════════
-- LuxQuant — Delisting: peak-since-announce tracking
-- ════════════════════════════════════════════════════════════════════
-- Simpan puncak harga (dan % move) tiap token SEJAK pengumuman delisting,
-- bukan sekadar harga sekarang. Ini metrik "pump after delist" yang benar.
-- Format: {"NFP": {"peak": 0.06, "peak_pct": 92.3, "peak_at": "2026-..."}}
--
-- Idempotent. Run: psql "postgresql://luxq:...@127.0.0.1:5432/luxquant" -f migration-delisting-peak.sql
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE delisting_events
    ADD COLUMN IF NOT EXISTS peak_since_announce JSONB;

COMMIT;
