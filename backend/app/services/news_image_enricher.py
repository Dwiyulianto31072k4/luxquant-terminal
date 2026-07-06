"""
Best-effort og:image backfill for RSS news rows that arrived without an image.

Called periodically from the leader-gated background cache loop. Never raises;
rows that cannot resolve an image are left NULL so the frontend falls back to
the LuxQuant News placeholder.

Google News aggregator links are skipped — they are redirect wrappers that
rarely expose a usable og:image.
"""

from __future__ import annotations

import asyncio
import re
from typing import Optional

import httpx
from sqlalchemy import text

_UA = {"User-Agent": "Mozilla/5.0 (compatible; LuxQuantBot/1.0)"}


def _og_image(markup: str) -> Optional[str]:
    """Pull og:image / twitter:image out of raw HTML (mirrors
    news_article_extractor._meta_content)."""
    for key in ("og:image", "twitter:image"):
        patterns = (
            rf'<meta[^>]+property=["\']{key}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+name=["\']{key}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{key}["\']',
        )
        for pat in patterns:
            m = re.search(pat, markup, flags=re.I)
            if m:
                url = m.group(1).strip()
                if url.startswith("http"):
                    return url
    return None


def _fetch_candidates(limit: int) -> list[dict]:
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT id, url FROM crypto_news
            WHERE source_type = 'rss'
              AND coalesce(image_url, '') = ''
              AND url IS NOT NULL
              AND url NOT LIKE '%news.google.com%'
              AND created_at > now() - interval '2 days'
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"limit": limit}).mappings().all()
        return [dict(r) for r in rows]
    finally:
        db.close()


def _apply(updates: list[tuple[int, str]]) -> int:
    if not updates:
        return 0
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        changed = 0
        for news_id, img in updates:
            res = db.execute(text("""
                UPDATE crypto_news SET image_url = :img
                WHERE id = :id AND coalesce(image_url, '') = ''
            """), {"img": img, "id": news_id})
            changed += res.rowcount or 0
        db.commit()
        return changed
    finally:
        db.close()


async def _resolve(client: httpx.AsyncClient, sem: asyncio.Semaphore, row: dict) -> tuple[int, Optional[str]]:
    async with sem:
        try:
            resp = await client.get(row["url"])
            if resp.status_code != 200:
                return row["id"], None
            return row["id"], _og_image(resp.text)
        except Exception:
            return row["id"], None


async def enrich_missing_images(limit: int = 25, concurrency: int = 6, timeout: float = 6.0) -> int:
    """Fetch og:image for recent RSS rows missing a picture. Returns rows filled."""
    try:
        rows = await asyncio.to_thread(_fetch_candidates, limit)
    except Exception:
        return 0
    if not rows:
        return 0
    sem = asyncio.Semaphore(concurrency)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=_UA) as client:
            results = await asyncio.gather(*[_resolve(client, sem, r) for r in rows])
    except Exception:
        return 0
    updates = [(news_id, img) for news_id, img in results if img]
    try:
        return await asyncio.to_thread(_apply, updates)
    except Exception:
        return 0
