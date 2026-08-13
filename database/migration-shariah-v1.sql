-- Migration: Shariah Screening v1 (idempotent, safe re-run)
--
-- Dua tabel baru. TIDAK menyentuh `users` maupun `signals` — preferensi user
-- disimpan di kolom users.ui_prefs (jsonb) yang sudah ada, karena ALTER TABLE
-- pada `users` pernah mengambil ACCESS EXCLUSIVE dan menyebabkan statement
-- timeout massal di produksi.
--
-- Rujukan desain: SHARIAH_MODE_RESEARCH.md §5.1

-- ============================================================
-- coin_shariah — satu baris per pair
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_shariah (
    pair              TEXT PRIMARY KEY REFERENCES coins(pair) ON DELETE CASCADE,

    -- Diklasifikasi dari Binance exchangeInfo SEBELUM rubrik apa pun dijalankan.
    -- Salah kelas = rubrik salah. Lihat §4.2.
    --   crypto_token = PERPETUAL/COIN      → dirubrik 7 kriteria
    --   tradfi_perp  = TRADIFI_PERPETUAL   → not_applicable (tak bisa dimiliki)
    --   index_perp   = PERPETUAL/INDEX     → not_applicable
    --   delisted     = tidak ada lagi di Binance USDⓈ-M futures
    asset_class       TEXT NOT NULL DEFAULT 'crypto_token',

    -- halal | mashbooh | haram | unrated | not_applicable
    -- Default SENGAJA 'unrated': tidak ada coin yang tampil halal karena kelalaian.
    status            TEXT NOT NULL DEFAULT 'unrated',
    confidence        SMALLINT NOT NULL DEFAULT 0,          -- 0-100

    -- {kriteria: {pass, reason, evidence, source}} — evidence wajib ada, §4.1.D
    criteria          JSONB NOT NULL DEFAULT '{}'::jsonb,

    summary           TEXT,          -- 2-3 kalimat, netral. Bukan fatwa.
    summary_id        TEXT,          -- terjemahan Indonesia
    summary_ar        TEXT,          -- terjemahan Arab

    consensus         TEXT,          -- pos | pow | other
    engine_version    TEXT NOT NULL DEFAULT 'v1',
    screened_at       TIMESTAMPTZ,

    -- Identitas: hasil validasi coingecko_id vs base_symbol (§2.5).
    -- 'ok' | 'mismatch' | 'unknown'. mismatch → status dipaksa 'unrated'.
    identity_status   TEXT NOT NULL DEFAULT 'unknown',
    identity_note     TEXT,

    -- Jalur review manusia — meniru pola review_status di tabel coins.
    review_status     TEXT NOT NULL DEFAULT 'pending',      -- pending|approved|overridden
    reviewed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    review_notes      TEXT,
    override_status   TEXT,          -- kalau diisi, INI yang ditampilkan

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coin_shariah_status   ON coin_shariah(status);
CREATE INDEX IF NOT EXISTS idx_coin_shariah_class    ON coin_shariah(asset_class);
CREATE INDEX IF NOT EXISTS idx_coin_shariah_review   ON coin_shariah(review_status);
CREATE INDEX IF NOT EXISTS idx_coin_shariah_screened ON coin_shariah(screened_at NULLS FIRST);

-- ============================================================
-- coin_shariah_sources — sitasi sumber eksternal (N baris per pair)
-- Kita MENAUTKAN dan menyebut status sumber lain; tidak menyalin analisisnya.
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_shariah_sources (
    id           BIGSERIAL PRIMARY KEY,
    pair         TEXT NOT NULL REFERENCES coins(pair) ON DELETE CASCADE,
    source       TEXT NOT NULL,      -- sharlife | cryptoummah | crypto_halal | crypto_islam | pif
    status_raw   TEXT,               -- "Yes"/"Grey"/"Non-Shariah" apa adanya dari sumber
    status_norm  TEXT,               -- halal | mashbooh | haram | not_found
    url          TEXT,
    label        TEXT,               -- nama aset menurut sumber tsb
    -- Bagaimana kita mencocokkannya. 'ambiguous' = sengaja TIDAK dipakai (§2.4).
    match_method TEXT,               -- coingecko_id | ticker_unique | ambiguous | none
    checked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pair, source)
);

CREATE INDEX IF NOT EXISTS idx_shariah_sources_pair ON coin_shariah_sources(pair);

-- ============================================================
-- Seed: satu baris per pair yang sudah ada, semuanya 'unrated'.
-- Worker yang mengisi sisanya.
-- ============================================================
INSERT INTO coin_shariah (pair)
SELECT pair FROM coins
ON CONFLICT (pair) DO NOTHING;
