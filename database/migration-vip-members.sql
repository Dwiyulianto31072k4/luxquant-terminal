-- VIP group membership audit (2026-09-23)
-- Who is inside the VIP group, traced to a LuxQuant account, with the invite
-- link they used when the bot saw them join. Created at runtime too, by
-- app/services/vip_members.ensure_tables().

CREATE TABLE IF NOT EXISTS vip_members (
    telegram_id         BIGINT PRIMARY KEY,
    username            TEXT,
    full_name           TEXT,
    status              TEXT,
    present             BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at           TIMESTAMPTZ,
    left_at             TIMESTAMPTZ,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    invite_link         TEXT,
    invite_link_name    TEXT,
    invited_by_id       BIGINT,
    invited_by_username TEXT,
    join_source         TEXT,
    note                TEXT,
    note_at             TIMESTAMPTZ,
    note_by             INTEGER
);

CREATE TABLE IF NOT EXISTS vip_member_events (
    id               BIGSERIAL PRIMARY KEY,
    telegram_id      BIGINT NOT NULL,
    event            TEXT NOT NULL,
    at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_status       TEXT,
    new_status       TEXT,
    invite_link      TEXT,
    invite_link_name TEXT,
    actor_id         BIGINT,
    actor_username   TEXT,
    source           TEXT NOT NULL DEFAULT 'chat_member',
    detail           JSONB
);

CREATE INDEX IF NOT EXISTS idx_vip_events_member ON vip_member_events (telegram_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_vip_members_present ON vip_members (present);
