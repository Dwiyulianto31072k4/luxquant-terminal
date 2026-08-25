-- ════════════════════════════════════════════════════════════════════
-- LuxQuant — Learn: kurikulum berurutan, menggantikan rak "Resources"
-- ════════════════════════════════════════════════════════════════════
-- KENAPA DIROMBAK:
--   `resources` dibangun sebagai perpustakaan serbaguna dengan taksonomi
--   FORMAT (Research / Videos / Guides / Links). Setelah sekian lama isinya
--   2 baris. Taksonomi format tidak menolong orang yang sedang belajar — dia
--   tidak mencari "sebuah video", dia mencari "cara membaca call".
--
--   Formatnya jadi PROPERTI pelajaran, bukan raknya. Raknya adalah `track`:
--   urutan yang membawa orang dari "saya dapat call" sampai "saya bisa
--   mengukur posisi dan mengelolanya".
--
-- YANG DITAMBAH:
--   • track / order_index / level / est_minutes  → kurikulum berurutan
--   • resource_progress                          → pelajaran mana yang selesai
--
-- Tidak ada kolom lama yang dibuang: 2 baris yang ada tetap valid, cuma
-- belum punya track (jadi tidak muncul di Learn sampai diberi satu).
--
-- Idempotent: aman dijalankan berkali-kali.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Kurikulum ─────────────────────────────────────────────────────
ALTER TABLE resources
    ADD COLUMN IF NOT EXISTS track        VARCHAR(40),
    ADD COLUMN IF NOT EXISTS order_index  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level        VARCHAR(16),
    ADD COLUMN IF NOT EXISTS est_minutes  INTEGER;

COMMENT ON COLUMN resources.track IS
    'Trek kurikulum: start | read-a-call | numbers | tools | automation | account. '
    'NULL = tidak tampil di Learn.';
COMMENT ON COLUMN resources.order_index IS
    'Urutan di dalam trek. Kecil = lebih dulu.';
COMMENT ON COLUMN resources.level IS
    'basic | intermediate | advanced — dipakai sebagai penanda, bukan gerbang.';

-- Satu urutan per trek. Indeks, bukan constraint: memindahkan pelajaran akan
-- sesaat menabrak urutan yang sudah ada, dan itu bukan kesalahan data.
CREATE INDEX IF NOT EXISTS idx_resources_track_order
    ON resources (track, order_index) WHERE track IS NOT NULL;

-- ── 2. Kemajuan per pengguna ─────────────────────────────────────────
-- Ada supaya orang tahu sudah sampai mana, dan supaya kita tahu pelajaran
-- mana yang ditinggalkan orang di tengah jalan.
CREATE TABLE IF NOT EXISTS resource_progress (
    user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id  INTEGER      NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_progress_user ON resource_progress (user_id);

COMMENT ON TABLE resource_progress IS
    'Pelajaran Learn yang sudah ditandai selesai. Satu baris = satu penyelesaian.';

COMMIT;

-- ── Verifikasi ───────────────────────────────────────────────────────
--   SELECT track, count(*) FROM resources GROUP BY track;
--   SELECT count(*) FROM resource_progress;
