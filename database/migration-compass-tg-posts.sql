-- ════════════════════════════════════════════════════════════════════
-- Compass — tautan laporan ke pesan Telegram-nya
-- ════════════════════════════════════════════════════════════════════
-- KENAPA:
--   Tiap laporan baru menggantikan yang sebelumnya. Supaya pembaca di grup
--   bisa melihat APA yang diganti, posting baru harus membalas posting lama.
--   Untuk itu kita perlu ingat message_id tiap laporan.
--
--   `ai_arena_reports.previous_report_id` sudah ada sebagai kolom, tapi tidak
--   pernah diisi — semuanya NULL. Rantai laporan bersifat berurutan, jadi
--   pendahulu sebuah laporan adalah entri terakhir di tabel ini.
--
-- Tabel terpisah, bukan kolom baru di ai_arena_reports: ALTER pada tabel yang
-- sedang panas pernah mengunci dan menimbulkan gelombang timeout di sini.
--
-- Idempoten.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS compass_tg_posts (
    report_id   VARCHAR(64)  PRIMARY KEY,
    chat_id     VARCHAR(48)  NOT NULL,
    thread_id   VARCHAR(48),
    message_id  BIGINT       NOT NULL,
    sent_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compass_tg_posts_sent
    ON compass_tg_posts (sent_at DESC);

COMMENT ON TABLE compass_tg_posts IS
    'message_id Telegram per laporan Compass, supaya revisi berikutnya bisa '
    'membalas posting yang digantikannya.';

COMMIT;

-- ── Verifikasi ───────────────────────────────────────────────────────
--   SELECT count(*), max(sent_at) FROM compass_tg_posts;
