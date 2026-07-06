# Unified News Hub — Design

Status: proposal (migration written, not yet applied to DB)
Migration: `database/migration-news-unified-hub-v1.sql`

## Why

Right now "news" lives in two disconnected worlds:

- **`crypto_news` (Postgres table)** — populated by the Telegram scraper. Rich rows (title, url, domain, image_url, raw_text, content_type). De-duped by a `UNIQUE(source_channel, source_msg_id)` constraint. This is the only source the social automation and the dedicated News page use. Real snapshot: ~288 rows spanning ~3 days (article 226, photo 53, video 7, headline 2), so the table is already small and recent.
- **RSS feeds (Redis cache only)** — CoinTelegraph, CoinDesk, Decrypt, Google News. Fetched live and cached in Redis (`lq:macro-news`, `lq:mkt:crypto-news`, `lq:bitcoin:news`). Thin rows (title, link, short description, image). Never persisted to the DB. Powers the Market page, Bitcoin page, and the BTC Compass event-risk AI.

The goal is one home for all news, tagged by which surface it belongs to, and automatically pruned after 7 days because news is time-sensitive.

## Decisions locked in

- **Single home:** `crypto_news` becomes the hub. RSS is written into it too (running code adjusted — see below).
- **Single `category` column** (not multi-tag). One row → one primary surface.
- **7-day retention**, but rows already turned into a social post are never deleted.

## Schema changes

Applied by the migration (idempotent):

- `category TEXT NOT NULL DEFAULT 'crypto'` — values: `crypto` (default), `bitcoin`, `macro`, `market`, `general`.
- `source_type TEXT NOT NULL DEFAULT 'telegram'` — existing rows stay `telegram`; RSS rows come in as `rss`.
- Indexes: `idx_cn_category_created (category, created_at DESC)` for per-page reads, `idx_cn_source_type`, and a partial `ux_cn_rss_url` for RSS de-dup by URL.
- `prune_crypto_news(retain_days=7)` function for retention.

`category` meaning: `general` = non-crypto world/geopolitics items that the Telegram channel also carries (e.g. the missile / North Korea rows). Keeping them tagged means the social automation can simply skip `general` instead of accidentally posting them.

## How a row is classified

Keyword classifier, first match wins, priority **general → macro → bitcoin → market → crypto**:

1. **general** — has a geopolitics term (missile, nuclear, war, election, sanction…) **and** no crypto term.
2. **macro** — Fed / FOMC / inflation / CPI / rates / treasury / ECB / tariff…
3. **bitcoin** — bitcoin / btc / satoshi / halving.
4. **market** — etf / liquidation / altcoin / defi / stablecoin / whale / volume / market cap…
5. **crypto** — everything else (default).

The migration backfills existing rows with this logic in SQL. The same rules should live in one small shared module (proposed `backend/app/services/news_category.py`) so RSS ingestion and the SQL backfill stay in sync. The keyword lists already exist in `social_news_worker.py` (`MARKET_KEYWORDS`) and `macro_news_service.py` (`MACRO_KEYWORDS`) — reuse them.

## Bringing RSS into the table

RSS items have no `source_channel` / `source_msg_id`, which are `NOT NULL`. Convention for RSS inserts:

- `source_type = 'rss'`
- `source_channel = 'rss:' || <feed source>` (e.g. `rss:cointelegraph`)
- `source_msg_id = abs(hashtext(url))` — deterministic, so the existing unique constraint also blocks duplicates
- `category = classify(title + description)`
- de-dup safety net: the partial `ux_cn_rss_url` unique index

Use `INSERT ... ON CONFLICT DO NOTHING` so re-fetching the same feed is a no-op.

## Running code that needs adjusting

The ask is "gabung, tapi code yang jalan disesuaikan." These are the touch points:

- **`backend/app/services/macro_news_service.py`** — after `fetch_macro_news()` pulls & filters RSS, upsert the items into `crypto_news` (source_type=`rss`, category via classifier). Keep the Redis cache as the fast read path.
- **`backend/app/api/routes/market_overview.py`** (`get_crypto_news`) — same upsert step; the `/crypto-news` and `/markets-page` responses can keep serving from Redis or switch to a DB read filtered by category.
- **`backend/app/api/routes/market.py`** (`/bitcoin/news`, `/bitcoin/overview`) — read `category = 'bitcoin'` (with `market`/`crypto` fallback) from the DB, or keep RSS + persist.
- **`backend/app/api/routes/crypto_news_endpoint.py`** (`/feed`) — add an optional `category` query param so the News page can filter; default behavior unchanged.
- **`backend/app/services/social_news_worker.py`** — in candidate selection, skip `category = 'general'`, and use `category` as an angle hint instead of the current keyword guess.
- **New `backend/app/services/news_category.py`** — the shared `classify(text) -> category` used by all of the above and mirrored by the SQL backfill.
- **Retention scheduler** — a daily job calling `SELECT prune_crypto_news(7)`, modeled on the existing `deployment/luxquant-social-publisher.{service,timer}`, or `pg_cron` if available.

Because every existing endpoint keeps its current response shape (Redis stays as the read cache, `category` is additive), nothing on the frontend breaks during rollout.

## Suggested rollout order

1. Apply the migration (adds columns + backfills existing rows). Reads are unaffected.
2. Add `news_category.py` and wire RSS ingestion to write into `crypto_news`.
3. Add the `category` filter to the feed endpoint and point the Market/Bitcoin reads at the DB when ready.
4. Enable the daily `prune_crypto_news(7)` job.

Each step is independently shippable and reversible.

## Open items

- Confirm `pg_cron` availability on the VPS, otherwise use a systemd timer for retention.
- `social_posts.news_id` is `INTEGER` while `crypto_news.id` is `BIGINT`; harmless for the retention join today, worth aligning long-term.
- Decide whether `general` (non-crypto) items should stay in this table at all, or be filtered at scrape time.
