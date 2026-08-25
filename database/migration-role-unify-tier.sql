-- ════════════════════════════════════════════════════════════════════
-- LuxQuant — satu role member (`subscriber`) + kolom `subscription_tier`
-- ════════════════════════════════════════════════════════════════════
-- LATAR:
--   `premium` bukan tier yang lebih tinggi. Itu cohort pre-webapp yang
--   di-grandfather jadi lifetime: 71 akun, 100% subscription_source='legacy',
--   100% tanpa expiry. Ditulis cuma di 2 tempat, dua-duanya di-gate `is_legacy`
--   (role_resolver.py:145, telegram_auth.py:321). Semua jalur lain — payment,
--   admin grant, Discord, Telegram — sudah menulis `subscriber`.
--
--   Audit 2026-08-25: TIDAK ADA satu pun gate yang membedakan keduanya. Akses
--   diputuskan has_active_access (baca kolom expiry), proteksi legacy oleh
--   subscription_source. Nama role tidak menggerbangi apa pun.
--
--   Yang HILANG selama ini: `subscription_expires_at` bisa bilang "lifetime vs
--   bermasa", tapi tidak bisa membedakan monthly dari yearly. Itu yang jadi
--   kolom `subscription_tier`.
--
-- URUTAN AMAN (jangan dibalik):
--   1. File ini  — kolom + backfill. Aditif, belum ada kode yang baca.
--   2. Deploy kode — is_premium diperbaiki, writer emit `subscriber`,
--      purchase/grant menulis tier.
--   3. bagian 3 di bawah — UPDATE role premium -> subscriber.
--   Kalau role dimigrasi SEBELUM kode di-deploy, user legacy yang login via
--   Telegram akan di-set balik ke 'premium' oleh kode lama.
--
-- Idempotent: aman dijalankan berkali-kali.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Kolom ─────────────────────────────────────────────────────────
-- Tanpa DEFAULT dan nullable: di PG11+ ini metadata-only, tidak rewrite
-- tabel. ACCESS EXCLUSIVE-nya sepersekian detik. JANGAN pernah taruh
-- ADD COLUMN di import path aplikasi — itu yang dulu bikin statement
-- timeout beruntun karena antrean lock FIFO.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(16);

COMMENT ON COLUMN users.subscription_tier IS
    'Bentuk entitlement: lifetime | monthly | yearly | custom. NULL = tidak punya akses. '
    'Melengkapi subscription_expires_at (KAPAN habis) dan subscription_source (DARI MANA).';

CREATE INDEX IF NOT EXISTS idx_users_subscription_tier
    ON users (subscription_tier) WHERE subscription_tier IS NOT NULL;

-- ── 2. Backfill ──────────────────────────────────────────────────────
-- Diturunkan dari rentang granted_at -> expires_at, bukan ditebak. Diukur
-- 2026-08-25 pada 27 akun bermasa: 25 tepat 30 hari, 1 tepat 365, 1 di 289.
-- Payment cuma menutup 21 dari 145 akun, jadi rentang adalah satu-satunya
-- bukti yang tersedia untuk sisanya.
UPDATE users u
SET subscription_tier = CASE
        WHEN u.role NOT IN ('premium', 'subscriber')       THEN NULL
        WHEN u.subscription_expires_at IS NULL             THEN 'lifetime'
        WHEN EXTRACT(EPOCH FROM (u.subscription_expires_at
             - coalesce(u.subscription_granted_at, u.created_at))) / 86400
             BETWEEN 25 AND 35                             THEN 'monthly'
        WHEN EXTRACT(EPOCH FROM (u.subscription_expires_at
             - coalesce(u.subscription_granted_at, u.created_at))) / 86400
             BETWEEN 350 AND 380                           THEN 'yearly'
        ELSE 'custom'
    END
WHERE u.subscription_tier IS DISTINCT FROM CASE
        WHEN u.role NOT IN ('premium', 'subscriber')       THEN NULL
        WHEN u.subscription_expires_at IS NULL             THEN 'lifetime'
        WHEN EXTRACT(EPOCH FROM (u.subscription_expires_at
             - coalesce(u.subscription_granted_at, u.created_at))) / 86400
             BETWEEN 25 AND 35                             THEN 'monthly'
        WHEN EXTRACT(EPOCH FROM (u.subscription_expires_at
             - coalesce(u.subscription_granted_at, u.created_at))) / 86400
             BETWEEN 350 AND 380                           THEN 'yearly'
        ELSE 'custom'
    END;

-- ── 3. Satu role member ──────────────────────────────────────────────
-- JALANKAN HANYA SETELAH KODE DI-DEPLOY (lihat catatan urutan di atas).
-- Aman: semua 71 baris lifetime + source='legacy'. subscription_source yang
-- membawa proteksi legacy, bukan nama role, jadi tidak ada hak yang berpindah.
UPDATE users SET role = 'subscriber' WHERE role = 'premium';

COMMIT;

-- ── Verifikasi ───────────────────────────────────────────────────────
--   SELECT role, subscription_tier, count(*) FROM users
--   WHERE role IN ('subscriber','premium') GROUP BY 1,2 ORDER BY 3 DESC;
--
--   Harapan setelah semua langkah: 0 baris 'premium'; 145 'subscriber'
--   (118 lifetime, 25 monthly, 1 yearly, 1 custom* — *289 hari).
