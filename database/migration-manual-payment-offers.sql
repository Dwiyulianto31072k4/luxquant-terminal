-- ════════════════════════════════════════════════════════════════════
-- LuxQuant — manual payment offers (link klaim)
-- ════════════════════════════════════════════════════════════════════
-- MASALAH:
--   Orang bayar lewat chat (wallet / Binance UID / transfer bank), lalu admin
--   mencatatnya di /finance/manual-payment. Itu langsung memberi akses — jadi
--   admin harus tahu akun web orang itu, dan kalau salah pilih akun, akses
--   mendarat di orang yang salah.
--
-- YANG DIUBAH:
--   Admin bikin PENAWARAN dulu, dapat link unik, kirim ke yang bayar. Orangnya
--   login, membuka link, melihat persis apa yang akan didapat, lalu menerima.
--   Akses baru menempel saat itu — ke akun yang benar-benar dia pakai.
--   Setelah diklaim, satu baris `payments` dibuat seperti biasa, jadi tetap
--   masuk pembukuan; dan expiry-nya diurus worker langganan yang sudah ada,
--   bukan admin yang kick manual di Telegram.
--
-- CATATAN KEAMANAN:
--   `token` adalah kredensial pembawa. Yang memegang link bisa mengklaim —
--   karena itu: satu kali pakai, ada masa berlaku, bisa dibatalkan, dan kalau
--   admin sudah tahu akun tujuannya, diikat ke `user_id` supaya orang lain
--   tidak bisa memakainya meski linknya bocor.
--
-- Idempotent: aman dijalankan berkali-kali.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS manual_payment_offers (
    id              SERIAL PRIMARY KEY,

    -- Kredensial link. 32 byte urlsafe, pola yang sama dengan api_key.
    token           VARCHAR(64)  NOT NULL UNIQUE,

    created_by      INTEGER      NOT NULL REFERENCES users(id),

    -- NULL = siapa pun yang login dan memegang link boleh klaim (dipakai saat
    -- admin belum tahu akun webnya). Terisi = hanya user itu yang boleh.
    user_id         INTEGER      REFERENCES users(id),

    plan_id         INTEGER      NOT NULL REFERENCES subscription_plans(id),

    -- Override durasi. NULL = ikut plan. Ada untuk kasus diskon / akses
    -- beberapa hari saja, yang tidak diwakili plan mana pun.
    duration_days   INTEGER,

    -- Nominal yang benar-benar dibayar (bisa nego, jadi bukan harga plan).
    amount_usd      NUMERIC(18,2) NOT NULL,

    method          VARCHAR(32)  NOT NULL,
    method_label    VARCHAR(64),
    reference       VARCHAR(128),
    paid_currency   VARCHAR(8),
    paid_amount     NUMERIC(24,8),
    fx_rate         NUMERIC(24,8),

    admin_note      TEXT         NOT NULL,

    status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
    expires_at      TIMESTAMPTZ  NOT NULL,

    claimed_at      TIMESTAMPTZ,
    claimed_by      INTEGER      REFERENCES users(id),
    payment_id      INTEGER      REFERENCES payments(id),
    cancelled_at    TIMESTAMPTZ,
    cancelled_by    INTEGER      REFERENCES users(id),

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT manual_payment_offers_status_chk
        CHECK (status IN ('pending', 'claimed', 'cancelled', 'expired')),
    -- Sekali pakai, ditegakkan skema — bukan cuma dijaga kode aplikasi.
    CONSTRAINT manual_payment_offers_claim_chk
        CHECK ((status = 'claimed') = (claimed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_mpo_status  ON manual_payment_offers (status);
CREATE INDEX IF NOT EXISTS idx_mpo_user    ON manual_payment_offers (user_id);
CREATE INDEX IF NOT EXISTS idx_mpo_created ON manual_payment_offers (created_at DESC);

COMMENT ON TABLE manual_payment_offers IS
    'Penawaran langganan yang dibuat admin untuk pembayaran di luar web. '
    'Diklaim user lewat link unik; klaim yang berhasil membuat baris payments.';
COMMENT ON COLUMN manual_payment_offers.duration_days IS
    'Override durasi plan. NULL = ikut plan. Untuk diskon / akses beberapa hari.';
COMMENT ON COLUMN manual_payment_offers.user_id IS
    'NULL = link terbuka untuk siapa pun yang login. Terisi = terikat ke user itu.';

COMMIT;
