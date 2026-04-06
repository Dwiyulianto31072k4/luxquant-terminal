# backend/app/api/routes/crypto_news_endpoint.py
"""
Crypto News Feed API — reads from crypto_news DB table
Redis cached: feed 60s, stats 120s, trending 120s
+ Article extract endpoint (newspaper3k, cached 24h)
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import text
from app.core.database import get_db as get_db_session
from app.core.redis import cache_get, cache_set
from typing import Optional
import hashlib

router = APIRouter()


def _build_cache_key(prefix: str, **kwargs) -> str:
    parts = [f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None and v != ""]
    raw = ":".join(parts) if parts else "default"
    short = hashlib.md5(raw.encode()).hexdigest()[:8]
    return f"lq:news:{prefix}:{short}"


# ════════════════════════════════════════════
# 1. NEWS FEED — paginated, filterable
# ════════════════════════════════════════════

@router.get("/feed")
async def get_news_feed(
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    content_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    cache_key = _build_cache_key("feed", limit=limit, offset=offset, content_type=content_type, search=search)
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        db = next(get_db_session())

        where_clauses = ["created_at > NOW() - INTERVAL '3 days'"]
        params = {"limit": limit, "offset": offset}

        if content_type and content_type in ("article", "photo", "headline"):
            where_clauses.append("content_type = :content_type")
            params["content_type"] = content_type

        if search:
            where_clauses.append("(title ILIKE :search OR description ILIKE :search)")
            params["search"] = f"%{search}%"

        where_sql = " AND ".join(where_clauses)

        count_q = text(f"SELECT COUNT(*) FROM crypto_news WHERE {where_sql}")
        total = db.execute(count_q, params).scalar()

        items_q = text(f"""
            SELECT id, content_type, title, description, url, domain,
                   image_url, published_at, created_at, has_photo, raw_text
            FROM crypto_news
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        rows = db.execute(items_q, params).fetchall()

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
                "published_at": str(r[7]) if r[7] else None,
                "created_at": str(r[8]) if r[8] else None,
                "has_photo": r[9],
                "raw_text": r[10],
            })

        db.close()

        result = {"items": items, "total": total, "limit": limit, "offset": offset}
        cache_set(cache_key, result, ttl=60)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feed error: {str(e)}")


# ════════════════════════════════════════════
# 2. STATS
# ════════════════════════════════════════════

@router.get("/stats")
async def get_news_stats():
    cache_key = "lq:news:stats"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        db = next(get_db_session())

        type_q = text("""
            SELECT content_type, COUNT(*)
            FROM crypto_news
            WHERE created_at > NOW() - INTERVAL '3 days'
            GROUP BY content_type
        """)
        type_rows = db.execute(type_q).fetchall()
        type_map = {r[0]: r[1] for r in type_rows}

        total = sum(type_map.values())
        articles = type_map.get("article", 0)
        photos = type_map.get("photo", 0)
        headlines = type_map.get("headline", 0)

        hour_q = text("SELECT COUNT(*) FROM crypto_news WHERE created_at > NOW() - INTERVAL '1 hour'")
        last_hour = db.execute(hour_q).scalar()

        six_h_q = text("SELECT COUNT(*) FROM crypto_news WHERE created_at > NOW() - INTERVAL '6 hours'")
        last_6h = db.execute(six_h_q).scalar()

        hourly_q = text("""
            SELECT date_trunc('hour', created_at) AS hr, COUNT(*)
            FROM crypto_news
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY hr ORDER BY hr
        """)
        hourly_rows = db.execute(hourly_q).fetchall()
        hourly = [{"hour": str(r[0]), "count": r[1]} for r in hourly_rows]

        domain_q = text("""
            SELECT domain, COUNT(*) as cnt
            FROM crypto_news
            WHERE created_at > NOW() - INTERVAL '3 days' AND domain IS NOT NULL
            GROUP BY domain ORDER BY cnt DESC LIMIT 10
        """)
        domain_rows = db.execute(domain_q).fetchall()
        top_domains = [{"domain": r[0], "count": r[1]} for r in domain_rows]

        db.close()

        result = {
            "total": total, "articles": articles, "photos": photos,
            "headlines": headlines, "last_hour": last_hour, "last_6h": last_6h,
            "hourly": hourly, "top_domains": top_domains,
        }
        cache_set(cache_key, result, ttl=120)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stats error: {str(e)}")


# ════════════════════════════════════════════
# 3. TRENDING TOPICS
# ════════════════════════════════════════════

@router.get("/trending")
async def get_trending_topics():
    cache_key = "lq:news:trending"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        db = next(get_db_session())

        q = text("""
            SELECT title FROM crypto_news
            WHERE created_at > NOW() - INTERVAL '24 hours' AND title IS NOT NULL
        """)
        rows = db.execute(q).fetchall()
        db.close()

        stop_words = {
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "shall", "can",
            "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "as", "into", "through", "during", "before", "after", "above",
            "below", "between", "out", "off", "over", "under", "again",
            "further", "then", "once", "here", "there", "when", "where",
            "why", "how", "all", "both", "each", "few", "more", "most",
            "other", "some", "such", "no", "nor", "not", "only", "own",
            "same", "so", "than", "too", "very", "just", "don", "now",
            "and", "but", "or", "if", "while", "about", "up", "its",
            "it", "this", "that", "these", "those", "what", "which",
            "who", "whom", "his", "her", "their", "your", "our", "my",
            "new", "says", "said", "per", "via", "amid", "among",
            "also", "still", "get", "gets", "got", "set", "see", "sees",
            "hits", "hit", "key", "big", "one", "two", "first", "last",
            "day", "days", "week", "month", "year", "april", "march",
            "2024", "2025", "2026", "2027", "report", "reports", "update",
        }

        word_counts = {}
        for row in rows:
            title = row[0] or ""
            words = title.upper().split()
            for word in words:
                clean = "".join(c for c in word if c.isalnum() or c in "$")
                if len(clean) < 3 or clean.lower() in stop_words:
                    continue
                word_counts[clean] = word_counts.get(clean, 0) + 1

        sorted_topics = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:15]
        trending = [{"topic": t[0], "count": t[1]} for t in sorted_topics]

        result = {"trending": trending}
        cache_set(cache_key, result, ttl=120)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trending error: {str(e)}")


# ════════════════════════════════════════════
# 4. ARTICLE EXTRACT — on-demand, cached 24h
# ════════════════════════════════════════════

@router.get("/extract/{news_id}")
async def extract_article(news_id: int):
    """
    Extract article summary + keywords from URL using newspaper3k.
    Cached 24h per news_id.
    """
    cache_key = f"lq:news:extract:{news_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    # Get URL from DB
    try:
        db = next(get_db_session())
        q = text("SELECT url, title, description, raw_text, image_url, domain, content_type, created_at FROM crypto_news WHERE id = :id")
        row = db.execute(q, {"id": news_id}).fetchone()
        db.close()

        if not row:
            raise HTTPException(status_code=404, detail="News not found")

        url = row[0]
        base_data = {
            "id": news_id,
            "url": url,
            "title": row[1],
            "description": row[2],
            "raw_text": row[3],
            "image_url": row[4],
            "domain": row[5],
            "content_type": row[6],
            "created_at": str(row[7]) if row[7] else None,
            "extracted": False,
            "summary": None,
            "keywords": [],
            "authors": [],
            "full_text": None,
            "top_image": None,
        }

        # Try newspaper3k extraction if URL exists
        if url:
            try:
                from newspaper import Article as NpArticle
                import nltk
                try:
                    nltk.data.find('tokenizers/punkt_tab')
                except LookupError:
                    nltk.download('punkt_tab', quiet=True)

                article = NpArticle(url)
                article.download()
                article.parse()

                try:
                    article.nlp()
                    base_data["summary"] = article.summary[:500] if article.summary else None
                    base_data["keywords"] = article.keywords[:10] if article.keywords else []
                except Exception:
                    pass

                base_data["authors"] = article.authors[:5] if article.authors else []
                base_data["full_text"] = article.text[:2000] if article.text else None
                base_data["top_image"] = article.top_image or base_data["image_url"]
                base_data["extracted"] = True

                if not base_data["title"] and article.title:
                    base_data["title"] = article.title

            except Exception as e:
                print(f"⚠️ Article extract failed for {url}: {e}")
                # Return base data without extraction
                pass

        # Cache for 24 hours
        cache_set(cache_key, base_data, ttl=86400)
        return base_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extract error: {str(e)}")