-- ════════════════════════════════════════════════════════════════
-- Admin-fillable announcement modals
--   announcements        : content + targeting + schedule + status
--   announcement_views   : per-user view/dismiss tracking (frequency)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcements (
    id            SERIAL PRIMARY KEY,

    -- content
    title         TEXT NOT NULL,
    body          TEXT,
    image_url     TEXT,                       -- uploaded path OR external URL
    cta_label     TEXT,                        -- button text (NULL = no button)
    cta_url       TEXT,                        -- button link (internal /path or https://)

    -- targeting
    --   audience: 'all' | 'role' | 'user' | 'no_telegram' | 'paid_outside'
    audience      TEXT NOT NULL DEFAULT 'all',
    target_role   TEXT,                        -- when audience='role': free|subscriber|premium|admin
    target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- when audience='user'

    -- frequency (per-user): how many times to show before stopping
    max_shows     INTEGER NOT NULL DEFAULT 3,
    cooldown_hours INTEGER NOT NULL DEFAULT 72,  -- gap between shows for same user

    -- schedule + status
    status        TEXT NOT NULL DEFAULT 'draft',  -- draft | active | archived
    starts_at     TIMESTAMPTZ,                  -- NULL = immediately
    ends_at       TIMESTAMPTZ,                  -- NULL = no expiry

    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ann_status   ON announcements(status);
CREATE INDEX IF NOT EXISTS ix_ann_audience ON announcements(audience);
CREATE INDEX IF NOT EXISTS ix_ann_schedule ON announcements(starts_at, ends_at);

-- Per-user view tracking: drives frequency (max_shows + cooldown) and
-- "don't show again after dismiss/action".
CREATE TABLE IF NOT EXISTS announcement_views (
    announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shows           INTEGER NOT NULL DEFAULT 0,
    last_shown_at   TIMESTAMPTZ,
    dismissed_at    TIMESTAMPTZ,               -- set when user closes
    acted_at        TIMESTAMPTZ,               -- set when user clicks CTA (stop showing)
    PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_annview_user ON announcement_views(user_id);

-- Verify
\d announcements
\d announcement_views
