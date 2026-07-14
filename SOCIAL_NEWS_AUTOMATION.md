# LuxQuant Social News Automation MVP

This MVP turns rows from `crypto_news` into approval-ready social media drafts.

It does **not** auto-post yet. Drafts are saved to `social_posts` with a rendered
image and caption so an admin can review/approve first.

## Pieces

- `database/migration-social-posts-v1.sql`
  Creates the `social_posts` draft queue.

- `backend/app/services/social_news_worker.py`
  Picks recent `crypto_news`, scores them, generates headline/caption/hashtags,
  renders a news-card PNG, then inserts/upserts a `draft`.

- `backend/app/api/routes/admin_social_posts.py`
  Admin API for listing drafts, generating a draft, publishing approved rows,
  and updating status.

- `backend/app/services/social_post_publisher.py`
  Publishes only approved and due rows. Supports X and Telegram when credentials
  are configured.

- `backend/app/services/news_article_extractor.py`
  Enriches thin `crypto_news` rows before drafting. It tries direct HTML/JSON-LD
  first and falls back to Jina Reader, which is especially useful for
  TradingView News Flow wrappers.

- `backend/app/services/social_image_generator.py`
  Generates AI images (xAI/OpenAI). If an article/reference image exists,
  it downloads it and attempts a reference-assisted image edit; otherwise it
  generates from the article brief. If OpenAI fails or no key is configured, the
  old deterministic LuxQuant card renderer is used as fallback.

- `backend/app/services/social_entity_assets.py`
  **Entity visual pipeline** (logos + people):
  1. Editorial AI returns `entities` (orgs/people) + `featured_person`.
  2. Logos are resolved from cache → Wikipedia lead image → Clearbit domain logo
     (never AI-invented marks — those look wrong and violate QC LEG-6).
  3. People faces use the face library + Wikipedia autofetch; image-edit is
     conditioned on the real portrait when available.
  4. Verified logos are **composited** as top-right badges on the final
     LuxQuant editorial card (e.g. Hyperliquid + SEC on a regulation story).

  Cache dirs (on VPS):
  - `$SOCIAL_POST_ASSETS_DIR/logos/` — org marks (`sec.png`, `hyperliquid.png`, …)
  - `$SOCIAL_POST_ASSETS_DIR/faces/` — people (`vitalik-buterin.jpg`, …)

  Env:
  - `SOCIAL_LOGO_AUTOFETCH=1` (default) — fetch missing logos
  - `SOCIAL_FACE_AUTOFETCH=1` (default) — fetch missing portraits

## Deploy

```bash
cd /root/luxquant-terminal
git pull

psql "$DATABASE_URL" -f database/migration-social-posts-v1.sql
psql "$DATABASE_URL" -f database/migration-news-article-extracts-v1.sql
psql "$DATABASE_URL" -f database/migration-social-posts-ai-image-v1.sql

cd backend
venv/bin/pip install -r requirements.txt
systemctl restart luxquant-backend.service

cp deployment/luxquant-social-publisher.service /etc/systemd/system/
cp deployment/luxquant-social-publisher.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now luxquant-social-publisher.timer
```

## Generate A Draft

Auto-pick the best recent news:

```bash
cd /root/luxquant-terminal/backend
SOCIAL_POST_ASSETS_DIR=/opt/luxquant/social-posts \
venv/bin/python -m app.services.social_news_worker --limit 1
```

Generate from a specific `crypto_news.id`:

```bash
cd /root/luxquant-terminal/backend
SOCIAL_POST_ASSETS_DIR=/opt/luxquant/social-posts \
venv/bin/python -m app.services.social_news_worker --news-id 21350
```

Extract thin recent articles first:

```bash
cd /root/luxquant-terminal/backend
venv/bin/python -m app.services.news_article_extractor --limit 50
```

Generate one Instagram-ready draft with AI image attempt:

```bash
cd /root/luxquant-terminal/backend
SOCIAL_POST_ASSETS_DIR=/opt/luxquant/social-posts \
venv/bin/python -m app.services.social_news_worker --news-id 21432
```

Check whether AI image was used:

```sql
SELECT id, news_id, status, image_mode, image_path, reference_image_url
FROM social_posts
WHERE news_id = 21432;
```

## Admin API

List drafts:

```http
GET /api/v1/admin/social-posts?status=draft
```

Generate one draft:

```http
POST /api/v1/admin/social-posts/generate-draft
{
  "news_id": 21350,
  "platform": "x",
  "limit": 1
}
```

Approve/reject:

```http
PATCH /api/v1/admin/social-posts/{id}/status
{
  "status": "approved"
}
```

Publish approved and due rows manually:

```http
POST /api/v1/admin/social-posts/publish-approved
{
  "limit": 5,
  "dry_run": false
}
```

Or from the server:

```bash
cd /root/luxquant-terminal/backend
SOCIAL_POST_ASSETS_DIR=/opt/luxquant/social-posts \
venv/bin/python -m app.services.social_post_publisher --limit 5
```

Publishing remains separate from generation. Rows must be `approved`, and
`scheduled_at` must be empty or in the past. While a row is being processed it
uses status `publishing`; failed publishes move to `error` with `error_message`.
Set `X_ACCOUNT_HANDLE` for the public tweet URL returned after posting.
