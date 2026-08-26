-- ════════════════════════════════════════════════════════════════════
-- Compass — riwayat fitur, untuk penilaian berbasis persentil
-- ════════════════════════════════════════════════════════════════════
-- KENAPA:
--   Skor arah memakai ambang absolut yang dipatok di kode. Dua di antaranya
--   sudah mati diam-diam:
--     • funding-rate  : ambang >0,01% dipasang TEPAT di nilai dasar industri.
--                       Menyala 0 kali dari 494 laporan.
--     • basis         : ambang bullish >+50, sedangkan rentang nyata sepanjang
--                       494 laporan adalah -41,12..-1,45. Tak pernah terjangkau,
--                       jadi basis hanya bisa bernilai 0 atau -1.
--
--   Ambang absolut tidak bisa tahu bahwa regime sudah bergeser. Peringkat
--   persentil terhadap jendela berjalan tahu dengan sendirinya.
--
-- YANG DISIMPAN:
--   satu baris per (fitur, waktu) berisi nilai MENTAH. Persentil dihitung
--   saat dibaca, dari baris yang lebih tua saja — supaya kausal, tidak bocor.
--
-- Idempoten.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS compass_feature_history (
    feature     VARCHAR(48)  NOT NULL,
    observed_at TIMESTAMPTZ  NOT NULL,
    raw_value   DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (feature, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_compass_feature_hist
    ON compass_feature_history (feature, observed_at DESC);

COMMENT ON TABLE compass_feature_history IS
    'Nilai mentah per fitur untuk peringkat persentil kausal. Menggantikan '
    'ambang absolut yang diam-diam jadi usang saat regime bergeser.';

COMMIT;

-- ── Verifikasi ───────────────────────────────────────────────────────
--   SELECT feature, count(*), min(observed_at), max(observed_at)
--   FROM compass_feature_history GROUP BY 1 ORDER BY 1;
