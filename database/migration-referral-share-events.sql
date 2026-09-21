-- ════════════════════════════════════════════════════════════════
-- referral_share_events — one row per share, so "where did you share it"
-- becomes answerable.
--
-- `POST /referral/track-share` has always accepted a `channel` and thrown it
-- away: track_share_event() only bumped share_count / qr_count. 134 shares and
-- 17 QR downloads are recorded with no idea which platform any of them went to.
-- ════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS referral_share_events (
    id          BIGSERIAL PRIMARY KEY,
    code_id     INTEGER NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- copy_link | qr_download | telegram | whatsapp | twitter | native | other
    channel     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The page reads "my shares, grouped by channel", so lead with user_id.
CREATE INDEX IF NOT EXISTS ix_share_events_user ON referral_share_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_share_events_code ON referral_share_events(code_id);

RESET lock_timeout;
