-- ════════════════════════════════════════════════════════════════
-- Unified News Hub — v1
--   Goal: make crypto_news the single home for ALL news (Telegram
--   scraper + RSS market/bitcoin/macro), tagged with one `category`
--   column, with a 7-day retention window (news is time-sensitive).
--
--   Idempotent. Safe to run multiple times.
--   Run on VPS:
--     sudo -u postgres psql -d luxquant -f migration-news-unified-hub-v1.sql
-- ════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1. New columns
--    category    : which surface/page the item primarily belongs to
--                  ('crypto' default | 'bitcoin' | 'macro' | 'market' | 'general')
--    source_type : where the row came from ('telegram' existing | 'rss' new)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE crypto_news
    ADD COLUMN IF NOT EXISTS category    TEXT NOT NULL DEFAULT 'crypto',
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'telegram';


-- ─────────────────────────────────────────────────────────────
-- 2. Indexes
--    - per-category page reads (Market/Bitcoin/News pages)
--    - source_type filtering
--    - RSS de-dup by URL (Telegram rows already de-duped via the
--      existing UNIQUE(source_channel, source_msg_id) constraint)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cn_category_created
    ON crypto_news (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cn_source_type
    ON crypto_news (source_type);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cn_rss_url
    ON crypto_news (url)
    WHERE source_type = 'rss' AND url IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 3. Backfill category on existing rows (keyword classifier).
--    First match wins, priority: general → macro → bitcoin → market → crypto.
--    Only touches rows still on the default so re-runs are cheap and
--    won't overwrite manual corrections.
--    NOTE: Postgres regex word boundary is \y (NOT \b).
-- ─────────────────────────────────────────────────────────────
WITH classified AS (
    SELECT
        id,
        lower(concat_ws(' ',
            coalesce(title, ''),
            coalesce(description, ''),
            coalesce(raw_text, '')
        )) AS blob
    FROM crypto_news
)
UPDATE crypto_news cn
SET category = CASE
    -- Non-crypto geopolitics / world news (no crypto term present)
    WHEN c.blob !~ '(bitcoin|\ybtc\y|ethereum|\yeth\y|crypto|token|blockchain|stablecoin|\ydefi\y|altcoin|solana|\yxrp\y|memecoin|\yetf\y|satoshi)'
         AND c.blob ~ '(missile|nuclear|airstrike|troops|ceasefire|\ywar\y|invasion|\yelection\y|sanction|geopolit)'
        THEN 'general'
    -- Macro / rates / central banks
    WHEN c.blob ~ '(\yfed\y|fomc|inflation|\ycpi\y|\ypce\y|\ygdp\y|treasury|powell|rate cut|rate hike|interest rate|\yecb\y|tariff|nonfarm|non-farm|jobs report|recession)'
        THEN 'macro'
    -- Bitcoin-specific
    WHEN c.blob ~ '(bitcoin|\ybtc\y|satoshi|halving)'
        THEN 'bitcoin'
    -- Market structure / flows
    WHEN c.blob ~ '(\yetf\y|liquidation|altcoin|\ydefi\y|stablecoin|\ywhale\y|trading volume|\yrally\y|market cap|open interest)'
        THEN 'market'
    ELSE 'crypto'
END
FROM classified c
WHERE c.id = cn.id
  AND cn.category = 'crypto';   -- only rows still on default


-- ─────────────────────────────────────────────────────────────
-- 4. Retention helper — keep only the last 7 days, but NEVER delete a
--    row that has already been turned into a social post.
--    Wrapped as a function so a scheduler can call it cleanly.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prune_crypto_news(retain_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM crypto_news cn
    WHERE cn.created_at < now() - make_interval(days => retain_days)
      AND NOT EXISTS (
          SELECT 1 FROM social_posts sp WHERE sp.news_id = cn.id
      );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Manual run:  SELECT prune_crypto_news(7);
--
-- Scheduling options (pick one, outside this migration):
--   a) pg_cron (if installed):
--        SELECT cron.schedule('prune-news', '30 3 * * *', 'SELECT prune_crypto_news(7)');
--   b) systemd timer calling:
--        sudo -u postgres psql -d luxquant -c "SELECT prune_crypto_news(7)"
--      (mirror deployment/luxquant-social-publisher.{service,timer})


-- ─────────────────────────────────────────────────────────────
-- 5. Sanity check (read-only; comment out if running non-interactively)
-- ─────────────────────────────────────────────────────────────
-- SELECT category, source_type, count(*)
-- FROM crypto_news
-- GROUP BY category, source_type
-- ORDER BY category, source_type;
