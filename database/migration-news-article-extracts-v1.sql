-- ════════════════════════════════════════════════════════════════
-- News article extraction cache
--   Stores full-text extraction for thin crypto_news rows, especially
--   TradingView News Flow wrappers that only store headline previews.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS news_article_extracts (
    news_id          INTEGER PRIMARY KEY,
    url              TEXT NOT NULL,
    domain           TEXT,
    provider         TEXT NOT NULL DEFAULT 'direct',
    status           TEXT NOT NULL DEFAULT 'pending', -- pending | ok | error

    title            TEXT,
    extracted_text   TEXT,
    summary          TEXT,
    image_url        TEXT,
    canonical_url    TEXT,
    source_domain    TEXT,
    error_message    TEXT,

    extracted_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_news_article_extracts_status
    ON news_article_extracts(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_news_article_extracts_domain
    ON news_article_extracts(domain, updated_at DESC);
