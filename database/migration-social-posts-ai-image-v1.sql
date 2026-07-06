-- ════════════════════════════════════════════════════════════════
-- Social post AI image generation metadata
--   Keeps social_posts backward-compatible while tracking whether the image was
--   AI-generated, reference-assisted, or a deterministic fallback render.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE social_posts
    ADD COLUMN IF NOT EXISTS image_mode TEXT NOT NULL DEFAULT 'template',
    ADD COLUMN IF NOT EXISTS image_prompt TEXT,
    ADD COLUMN IF NOT EXISTS reference_image_url TEXT,
    ADD COLUMN IF NOT EXISTS reference_image_path TEXT;

CREATE INDEX IF NOT EXISTS ix_social_posts_image_mode
    ON social_posts(image_mode, created_at DESC);
