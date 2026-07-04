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
  Admin API for listing drafts, generating a draft, and updating status.

## Deploy

```bash
cd /root/luxquant-terminal
git pull

psql "$DATABASE_URL" -f database/migration-social-posts-v1.sql

cd backend
venv/bin/pip install -r requirements.txt
systemctl restart luxquant-backend.service
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

## Next Step

Add a publisher worker that only posts rows where:

```sql
status = 'approved'
AND (scheduled_at IS NULL OR scheduled_at <= now())
```

That keeps generation and publishing separate.
