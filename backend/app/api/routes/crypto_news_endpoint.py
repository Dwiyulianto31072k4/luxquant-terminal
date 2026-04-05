"""
Crypto News API — Serve news from crypto_news table (populated by Telegram bot)
Endpoints:
  GET /feed       — paginated news feed with filters
  GET /stats      — quick stats (total, by type, trending domains)
  GET /trending   — trending topics extracted from headlines
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.redis import cache_get, cache_set

router = APIRouter(tags=["crypto-news-feed"])

CACHE_TTL = 60  # 1 min cache


# ════════════════════════════════════════════
# 1. NEWS FEED — paginated, filterable
# ════════════════════════════════════════════

@router.get("/feed")
async def get_news_feed(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    content_type: Optional[str] = Query(None, description="article|photo|headline"),
    domain: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search in title/description"),
    db: Session = Depends(get_db),
):
    """News feed from crypto_news table (3-day rolling window)."""
    # Build cache key
    cache_key = f"lq:news:feed:{limit}:{offset}:{content_type or 'all'}:{domain or 'all'}:{search or ''}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    where_clauses = ["created_at > NOW() - INTERVAL '3 days'"]
    params = {"limit": limit, "offset": offset}

    if content_type:
        where_clauses.append("content_type = :content_type")
        params["content_type"] = content_type

    if domain:
        where_clauses.append("domain = :domain")
        params["domain"] = domain

    if search:
        where_clauses.append("(title ILIKE :search OR description ILIKE :search)")
        params["search"] = f"%{search}%"

    where_sql = " AND ".join(where_clauses)

    # Get items
    rows = db.execute(text(f"""
        SELECT id, content_type, title, description, url, domain,
               image_url, published_at, has_photo, has_webpage,
               created_at, raw_text
        FROM crypto_news
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """), params).fetchall()

    # Get total count
    count_row = db.execute(text(f"""
        SELECT COUNT(*) FROM crypto_news WHERE {where_sql}
    """), params).fetchone()
    total = count_row[0] if count_row else 0

    items = []
    for r in rows:
        items.append({
            "id": r[0],
            "content_type": r[1],
            "title": r[2],
            "description": r[3],
            "url": r[4],
            "domain": r[5],
            "image_url": r[6],
            "published_at": r[7],
            "has_photo": r[8],
            "has_webpage": r[9],
            "created_at": r[10].isoformat() if r[10] else None,
            "raw_text": r[11][:500] if r[11] else None,
        })

    result = {"items": items, "total": total, "limit": limit, "offset": offset}
    cache_set(cache_key, result, ttl=CACHE_TTL)
    return result


# ════════════════════════════════════════════
# 2. STATS — quick overview
# ════════════════════════════════════════════

@router.get("/stats")
async def get_news_stats(db: Session = Depends(get_db)):
    """Quick stats for the news page header."""
    cached = cache_get("lq:news:stats")
    if cached:
        return cached

    row = db.execute(text("""
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE content_type = 'article') as articles,
            COUNT(*) FILTER (WHERE content_type = 'photo') as photos,
            COUNT(*) FILTER (WHERE content_type = 'headline') as headlines,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '6 hours') as last_6h
        FROM crypto_news
        WHERE created_at > NOW() - INTERVAL '3 days'
    """)).fetchone()

    # Top domains
    domains = db.execute(text("""
        SELECT domain, COUNT(*) as cnt
        FROM crypto_news
        WHERE created_at > NOW() - INTERVAL '3 days'
          AND domain IS NOT NULL AND domain != ''
        GROUP BY domain
        ORDER BY cnt DESC
        LIMIT 10
    """)).fetchall()

    # Hourly distribution (last 24h)
    hourly = db.execute(text("""
        SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as cnt
        FROM crypto_news
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour DESC
        LIMIT 24
    """)).fetchall()

    result = {
        "total": row[0] if row else 0,
        "articles": row[1] if row else 0,
        "photos": row[2] if row else 0,
        "headlines": row[3] if row else 0,
        "last_hour": row[4] if row else 0,
        "last_6h": row[5] if row else 0,
        "top_domains": [{"domain": d[0], "count": d[1]} for d in domains],
        "hourly": [{"hour": h[0].isoformat() if h[0] else None, "count": h[1]} for h in hourly],
    }
    cache_set("lq:news:stats", result, ttl=CACHE_TTL)
    return result


# ════════════════════════════════════════════
# 3. TRENDING — extracted topics from recent headlines
# ════════════════════════════════════════════

@router.get("/trending")
async def get_trending_topics(db: Session = Depends(get_db)):
    """Extract trending topics from recent news titles."""
    cached = cache_get("lq:news:trending")
    if cached:
        return cached

    rows = db.execute(text("""
        SELECT title FROM crypto_news
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND title IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 100
    """)).fetchall()

    # Simple keyword extraction
    import re
    from collections import Counter

    stop_words = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
        'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
        'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
        'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
        'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
        'or', 'if', 'while', 'about', 'up', 'down', 'its', 'it', 'this',
        'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'their',
        'his', 'her', 'our', 'your', 'my', 'we', 'they', 'he', 'she', 'i',
        'me', 'us', 'them', 'new', 'says', 'said', 'report', 'reports',
        'according', 'amid', 'per', 'via', 'also', 'now', 'still', 'get',
        'gets', 'got', 'one', 'two', 'first', 'after', 'over', 'back',
        'like', 'even', 'much', 'big', 'top', 'set', 'hit', 'huge',
        'price', 'market', 'crypto', 'cryptocurrency',
    }

    word_count = Counter()
    for row in rows:
        title = row[0] or ""
        # Extract words, keep uppercase/crypto terms
        words = re.findall(r'[A-Za-z$₿#]+', title)
        for w in words:
            w_lower = w.lower()
            if len(w_lower) >= 3 and w_lower not in stop_words:
                # Keep original case for proper nouns / tickers
                display = w if w[0].isupper() or w.isupper() else w.lower()
                word_count[display] += 1

    # Top trending
    trending = [{"topic": t, "count": c} for t, c in word_count.most_common(15)]

    result = {"trending": trending, "total_articles_analyzed": len(rows)}
    cache_set("lq:news:trending", result, ttl=120)
    return result