-- ════════════════════════════════════════════════════════════════════
-- LuxQuant Public API — api_keys Migration
-- ════════════════════════════════════════════════════════════════════
-- Membuat tabel api_keys untuk Public Data API (akses autotrade / agent
-- milik subscriber). Key bersifat long-lived, di-hash (SHA-256), revocable.
--
-- Idempotent: aman dijalankan berkali-kali.
-- Run:    psql -U luxq -d luxquant -f public_api_keys.sql
-- Verify: \d+ api_keys
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS api_keys (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Aman ditampilkan: potongan depan key buat identifikasi, mis. "lq_live_AbC123"
    key_prefix         TEXT NOT NULL,

    -- SHA-256 hex dari key utuh. Key utuh TIDAK PERNAH disimpan.
    -- UNIQUE sekaligus jadi index buat hot-path lookup tiap request.
    key_hash           TEXT NOT NULL UNIQUE,

    -- Label dari user, mis. "autotrade bot"
    name               TEXT,

    -- Scope akses. Single tier = full access ('*') untuk sekarang.
    -- Kolom disiapkan biar bisa tier-ing nanti tanpa ubah schema.
    scopes             TEXT[] NOT NULL DEFAULT ARRAY['*'],

    -- Override rate limit per-key (req/menit). NULL = pakai default global.
    -- CATATAN: enforcement utama PER-USER (lihat rate limiter di step c);
    -- kolom ini cuma ceiling opsional buat kasus khusus.
    rate_limit_per_min INTEGER,

    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at       TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- List key milik satu user + agregasi rate limit per-user.
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- (Lookup by key_hash sudah ter-index otomatis oleh constraint UNIQUE di atas,
--  jadi tidak perlu index tambahan — itu akan redundant.)

-- Self-documentation (muncul di \d+ api_keys)
COMMENT ON TABLE api_keys IS
    'API key long-lived untuk Public Data API. SHA-256 hashed, dimiliki per-user, revocable.';
COMMENT ON COLUMN api_keys.key_hash IS
    'SHA-256 hex dari key utuh. Lookup lewat kolom ini. Key utuh hanya ditampilkan sekali saat dibuat.';
COMMENT ON COLUMN api_keys.key_prefix IS
    'Potongan depan key buat display/identifikasi (mis. lq_live_AbC123). Bukan rahasia.';
COMMENT ON COLUMN api_keys.rate_limit_per_min IS
    'Override per-key opsional. NULL = default global. Bucket enforcement-nya per-user.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFICATION (jalankan setelah migration)
-- ════════════════════════════════════════════════════════════════════
-- \d+ api_keys
-- SELECT COUNT(*) FROM api_keys;   -- harusnya 0 di tabel baru
