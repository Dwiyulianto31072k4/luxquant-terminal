-- ════════════════════════════════════════════════════════════════════
-- migration-resources-v1.sql
-- Unified Resource Hub (CoinGecko-style research/tips/video/link CMS).
-- Creates the `resources` table and migrates existing `tips` rows into it.
-- Idempotent — safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS resources (
    id                SERIAL PRIMARY KEY,
    type              VARCHAR(20)  NOT NULL DEFAULT 'article',   -- article | pdf | video | link
    title             VARCHAR(300) NOT NULL,
    slug              VARCHAR(340) UNIQUE,
    excerpt           TEXT,
    content           TEXT,
    content_format    VARCHAR(10)  DEFAULT 'html',               -- html | markdown
    cover_image       VARCHAR(1000),
    cover_is_external BOOLEAN      DEFAULT FALSE,
    pdf_path          VARCHAR(500),
    source_url        VARCHAR(1000),
    embed_html        TEXT,
    provider          VARCHAR(50),                               -- youtube | vimeo | twitter | web
    category          VARCHAR(100) DEFAULT 'General',
    tags              TEXT,
    author_name       VARCHAR(200),
    reading_time      INTEGER,
    view_count        INTEGER      DEFAULT 0,
    status            VARCHAR(20)  DEFAULT 'published',          -- draft | published
    is_featured       BOOLEAN      DEFAULT FALSE,
    is_active         BOOLEAN      DEFAULT TRUE,
    created_by        INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  DEFAULT now(),
    updated_at        TIMESTAMPTZ  DEFAULT now(),
    published_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_type       ON resources(type);
CREATE INDEX IF NOT EXISTS idx_resources_category   ON resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_status     ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_featured   ON resources(is_featured);
CREATE INDEX IF NOT EXISTS idx_resources_active     ON resources(is_active);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at DESC);

-- ── Slug helper: build a URL-safe slug from a title ──
CREATE OR REPLACE FUNCTION _slugify(txt TEXT) RETURNS TEXT AS $$
  SELECT trim(both '-' from
           regexp_replace(
             regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g'),
             '-{2,}', '-', 'g'
           )
         );
$$ LANGUAGE sql IMMUTABLE;

-- ── One-time migration of legacy tips → resources (type='pdf') ──
-- Only runs when the tips table exists and hasn't been migrated yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tips') THEN
    INSERT INTO resources (
      type, title, slug, excerpt, cover_image, pdf_path, category,
      status, is_active, created_by, created_at, updated_at, published_at
    )
    SELECT
      'pdf',
      t.title,
      _slugify(t.title) || '-' || t.id,     -- ensure uniqueness with id suffix
      t.description,
      t.cover_image,
      t.pdf_path,
      COALESCE(t.category, 'General'),
      'published',
      COALESCE(t.is_active, TRUE),
      t.created_by,
      t.created_at,
      t.updated_at,
      t.created_at
    FROM tips t
    WHERE NOT EXISTS (
      -- don't double-import: match on the (unique) pdf_path
      SELECT 1 FROM resources r WHERE r.pdf_path = t.pdf_path AND r.type = 'pdf'
    );
  END IF;
END $$;
