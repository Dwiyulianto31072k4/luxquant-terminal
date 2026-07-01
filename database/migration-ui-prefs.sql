-- ════════════════════════════════════════════════════════════════════
-- LuxQuant — users.ui_prefs (per-user UI preferences)
-- ════════════════════════════════════════════════════════════════════
-- Menyimpan preferensi UI yang di-remember per user, mis.
--   {"chart_indicators": true}  → SignalModal "always show indicators".
-- Pola: ABSENCE = DEFAULT (backend UI_PREF_DEFAULTS yang menentukan default).
--
-- Idempotent: aman dijalankan berkali-kali.
-- Run: psql "postgresql://luxq:...@127.0.0.1:5432/luxquant" -f migration-ui-prefs.sql
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ui_prefs JSONB;

COMMIT;
