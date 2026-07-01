-- ════════════════════════════════════════════════════════════════════
-- LuxQuant — Fix kebocoran auth: legacy member re-grant setelah revoke
-- ════════════════════════════════════════════════════════════════════
-- MASALAH:
--   revoke_subscription hanya membersihkan role/source di tabel `users`,
--   tapi baris di `legacy_members` (snapshot member Telegram pre-webapp)
--   tidak pernah ditandai. Akibatnya tiap user login via Telegram,
--   _check_legacy_member menemukan baris itu -> resolve_role_for_telegram
--   nge-grant ulang ("premium", "legacy"). Revoke jadi percuma.
--
-- FIX:
--   1. Tambah kolom `revoked` + `revoked_at` di legacy_members.
--   2. _check_legacy_member kini abaikan baris revoked=TRUE (code).
--   3. revoke_subscription kini menandai legacy_members.revoked (code).
--   4. Backfill: tombstone snapshot untuk user yang pernah di-revoke, dan
--      balikin user yang sudah terlanjur bocor (source='legacy') ke free.
--
-- Idempotent: aman dijalankan berkali-kali.
-- Run:    psql "postgresql://luxq:...@127.0.0.1:5432/luxquant" -f migration-legacy-revoke-fix.sql
-- Verify: \d+ legacy_members
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Schema: kolom baru -------------------------------------------------
ALTER TABLE legacy_members
    ADD COLUMN IF NOT EXISTS revoked    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- 2. Backfill: tombstone snapshot legacy untuk SEMUA telegram_id yang
--    catatannya menunjukkan pernah di-revoke admin. Mencegah re-grant
--    di login berikutnya (termasuk #74 yang belum sempat login lagi).
UPDATE legacy_members lm
SET    revoked = TRUE,
       revoked_at = COALESCE(lm.revoked_at, NOW())
FROM   users u
WHERE  u.telegram_id = lm.telegram_id
  AND  u.subscription_note ILIKE '%Revoked%'
  AND  lm.revoked = FALSE;

-- 3. Cleanup: user yang SUDAH bocor (di-revoke tapi sekarang balik
--    premium via legacy) dikembalikan ke free.
--    Scope sengaja dibatasi source='legacy' supaya user yang setelah
--    revoke benar-benar re-subscribe (source payment/admin) TIDAK ikut
--    terkena.
UPDATE users
SET    role = 'free',
       subscription_source = NULL,
       subscription_expires_at = NULL
WHERE  subscription_note ILIKE '%Revoked%'
  AND  subscription_source = 'legacy';

COMMIT;

-- ── Verifikasi (jalankan manual setelah commit) ──────────────────────
-- Harusnya 0 baris:
--   SELECT u.id, u.username, u.role, u.subscription_source
--   FROM users u JOIN legacy_members lm ON lm.telegram_id = u.telegram_id
--   WHERE u.subscription_note ILIKE '%Revoked%'
--     AND u.subscription_source = 'legacy';
--
-- Snapshot yang di-tombstone:
--   SELECT telegram_id, username, revoked, revoked_at
--   FROM legacy_members WHERE revoked = TRUE;
