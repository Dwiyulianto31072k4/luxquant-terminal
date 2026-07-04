-- ════════════════════════════════════════════════════════════════
-- Social media post automation queue
--   social_posts: AI/news-derived drafts, approval state, render artifact
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS social_posts (
    id              BIGSERIAL PRIMARY KEY,

    -- source
    source_type     TEXT NOT NULL DEFAULT 'crypto_news',
    news_id         INTEGER,
    source_url      TEXT,
    source_domain   TEXT,

    -- destination
    platform        TEXT NOT NULL DEFAULT 'x',       -- x | instagram | telegram
    status          TEXT NOT NULL DEFAULT 'draft',   -- draft | approved | posted | rejected | error

    -- creative
    angle           TEXT,
    template_style  TEXT NOT NULL DEFAULT 'market_pulse',
    headline        TEXT NOT NULL,
    caption         TEXT NOT NULL,
    hashtags        TEXT[] NOT NULL DEFAULT '{}',
    image_path      TEXT,
    score           NUMERIC(8, 3) NOT NULL DEFAULT 0,
    sources_json    JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- publishing
    scheduled_at    TIMESTAMPTZ,
    posted_at       TIMESTAMPTZ,
    posted_url      TEXT,
    error_message   TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_social_posts_news_platform
    ON social_posts(news_id, platform)
    WHERE news_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_social_posts_status
    ON social_posts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_social_posts_platform
    ON social_posts(platform, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_social_posts_news_id
    ON social_posts(news_id);
