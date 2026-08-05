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
from app.services.news_article_extractor import extract_news_item
from typing import Optional
from urllib.parse import urlparse
import hashlib
import os
import re

router = APIRouter()


# Telegram source channels we ingest from, keyed by the numeric channel id the
# news bot writes as "source_<id>". Keep in sync with SOURCE_CHANNELS in the
# bot's config.py on the VPS. A channel without a username is private, so it
# gets a credit line but no link.
# The third field marks whether the channel actually writes what it posts.
# Aggregators repost other outlets, so crediting them would name the wrong
# author — those rows fall through to the article's own publisher instead.
TELEGRAM_SOURCES = {
    "-1003089008073": ("Crypto News", "CryptoNewsFeed1", False),
    "-1003107709083": ("CBS-VIP News", None, False),
    # Boss Bot writes its own wire copy — short original headlines, not reposts
    # of someone else's article — and its posts carry no link, so the aggregator
    # path resolved to no publisher and the card showed no credit at all. Marked
    # True so it gets its own avatar, name and channel link like the other two.
    "-1003096102566": ("Boss Bot News", "BossBotOfficial", True),
    "-1001858640084": ("The Kobeissi Letter", "thekobeissiletter", True),
    "-1001976111514": ("Walter Bloomberg", "WalterBloomberg", True),
}


# RSS rows carry no domain column, so the publisher is read off the article
# host. These are the hosts we see often enough to be worth a proper name.
PUBLISHER_NAMES = {
    "cointelegraph.com": "Cointelegraph",
    "coindesk.com": "CoinDesk",
    "decrypt.co": "Decrypt",
    "tradingview.com": "TradingView",
    "theblock.co": "The Block",
    "bitcoinworld.co.in": "Bitcoin World",
}


def _self_handle(source_channel) -> Optional[str]:
    """The @username of the channel a row came from, if it signs its own posts."""
    channel = str(source_channel or "")
    if not channel.startswith("source_"):
        return None
    _name, username, writes_its_own = TELEGRAM_SOURCES.get(
        channel[len("source_"):], (None, None, False)
    )
    return username if (username and writes_its_own) else None


def _strip_self_promo(value: Optional[str], username: Optional[str]) -> Optional[str]:
    """Drop a channel's own @handle where it is a signature, not content.

    Boss Bot signs every post with a trailing `@BossBotOfficial` (77 of 77 rows);
    Kobeissi and Walter Bloomberg use a parenthesised `(@handle)`. That is the
    channel advertising itself inside our copy, and it is redundant here because
    the card already credits the channel by name, avatar and a link to it.

    Only the channel's OWN handle is removed, and only where it trails the text,
    so a post that genuinely mentions someone — or quotes another account
    mid-sentence — keeps every word of it.
    """
    if not value or not username:
        return value
    pattern = re.compile(
        rf"[\s​]*[\(\[]?\s*@{re.escape(username)}\s*[\)\]]?[\s​]*$",
        re.IGNORECASE,
    )
    return pattern.sub("", value).rstrip() or None


def _publisher_from_host(host: str):
    host = (host or "").lower().lstrip(".")
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return None, None
    return PUBLISHER_NAMES.get(host, host), host


# Telegram avatars are mirrored here by scripts/sync_source_avatars.py, because
# cdn*.telesco.pe is blocked on networks that block Telegram and the credit then
# renders with no mark at all. Falls back to Telegram if a file is missing.
SOURCE_ICON_DIR = os.path.join(
    os.environ.get("NEWS_IMAGES_DIR", "/opt/luxquant/news-images"), "sources"
)


def _favicon(host: Optional[str]) -> Optional[str]:
    return f"https://www.google.com/s2/favicons?domain={host}&sz=128" if host else None


def _telegram_icon(username: Optional[str]) -> Optional[str]:
    if not username:
        return None
    if os.path.exists(os.path.join(SOURCE_ICON_DIR, f"{username}.jpg")):
        return f"/api/v1/news-images/sources/{username}.jpg"
    return f"https://t.me/i/userpic/320/{username}.jpg"


def _source_info(source_channel, source_msg_id, domain, url, title=None, resolved_host=None):
    """Attribution for one news row: who published it and where to read it there.

    Telegram rows resolve to the channel's public permalink. RSS rows have no
    domain column, so the publisher is derived from the article host — which is
    also the right answer for aggregated feeds, where the host is the outlet
    that actually wrote the piece.
    """
    channel = str(source_channel or "")

    if channel.startswith("source_"):
        name, username, writes_its_own = TELEGRAM_SOURCES.get(
            channel[len("source_"):], (None, None, False)
        )
        if name and writes_its_own:
            return {
                "kind": "telegram",
                "name": name,
                "handle": f"@{username}" if username else None,
                "icon": _telegram_icon(username),
                "url": (
                    f"https://t.me/{username}/{source_msg_id}"
                    if username and source_msg_id
                    else None
                ),
            }
        # Aggregator: credit whoever the article actually belongs to.

    host = domain
    if not host and url:
        try:
            host = urlparse(url).netloc
        except Exception:
            host = None

    name, clean_host = _publisher_from_host(host)
    if not name:
        return None

    # Google News links are redirects, so the host names the aggregator rather
    # than whoever wrote the piece. Its titles end in " - Publisher", which is
    # the only place the real outlet survives.
    icon_host = clean_host
    if clean_host == "news.google.com":
        outlet = None
        if title and " - " in title:
            tail = title.rsplit(" - ", 1)[-1].strip()
            if 0 < len(tail) <= 40:
                outlet = tail
        name = outlet or "Google News"
        clean_host = "via Google News" if outlet else None
        # The extractor already redeemed the Google token for the publisher's
        # own address, so use that host for the logo rather than Google's.
        icon_host = resolved_host or "news.google.com"

    return {
        "kind": "rss",
        "name": name,
        "handle": clean_host,
        "icon": _favicon(icon_host),
        "url": url,
    }


def _build_cache_key(prefix: str, **kwargs) -> str:
    parts = [f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None and v != ""]
    raw = ":".join(parts) if parts else "default"
    short = hashlib.md5(raw.encode()).hexdigest()[:8]
    return f"lq:news:{prefix}:{short}"


# ════════════════════════════════════════════
# 1. NEWS FEED — paginated, filterable
# ════════════════════════════════════════════

@router.get("/feed")
def get_news_feed(
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

        # Qualified with n. because the items query joins a table that also has
        # a title column — unqualified names would be ambiguous there.
        where_clauses = ["n.created_at > NOW() - INTERVAL '3 days'"]
        params = {"limit": limit, "offset": offset}

        if content_type and content_type in ("article", "photo", "headline", "video"):
            where_clauses.append("n.content_type = :content_type")
            params["content_type"] = content_type

        if search:
            where_clauses.append("(n.title ILIKE :search OR n.description ILIKE :search)")
            params["search"] = f"%{search}%"

        where_sql = " AND ".join(where_clauses)

        count_q = text(f"SELECT COUNT(*) FROM crypto_news n WHERE {where_sql}")
        total = db.execute(count_q, params).scalar()

        # The extract table knows the publisher behind a redirect link, which is
        # the only way a Google News row can show the real outlet's logo.
        items_q = text(f"""
            SELECT n.id, n.content_type, n.title, n.description, n.url, n.domain,
                   n.image_url, n.video_url, n.published_at, n.created_at,
                   n.has_photo, n.has_video, n.raw_text,
                   n.source_channel, n.source_msg_id,
                   COALESCE(e.source_domain, e.domain) AS resolved_host
            FROM crypto_news n
            LEFT JOIN news_article_extracts e
                   ON e.news_id = n.id
            WHERE {where_sql}
            ORDER BY n.created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        rows = db.execute(items_q, params).fetchall()

        items = []
        for r in rows:
            # Stripped on the way out, not in the table: the raw post is what the
            # channel actually published and stays intact for the extractor and
            # for anything that needs to match the original.
            handle = _self_handle(r[13])
            items.append({
                "source": _source_info(r[13], r[14], r[5], r[4], r[2], r[15]),
                "id": r[0],
                "content_type": r[1],
                "title": _strip_self_promo(r[2], handle),
                "description": _strip_self_promo(r[3], handle),
                "url": r[4],
                "domain": r[5],
                "image_url": r[6],
                "video_url": r[7],
                "published_at": str(r[8]) if r[8] else None,
                "created_at": str(r[9]) if r[9] else None,
                "has_photo": r[10],
                "has_video": r[11],
                "raw_text": _strip_self_promo(r[12], handle),
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
def get_news_stats():
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
        videos = type_map.get("video", 0)

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

        # Resolve the publisher exactly like the feed does, and for the same
        # reason: `domain` is only ever set on Telegram rows that carried a link
        # preview, so filtering on it alone hid every RSS publisher — CoinDesk,
        # Decrypt and Google News never appeared here at all, and Cointelegraph
        # counted only the handful that arrived via Telegram. The extract table
        # wins because it redeems a Google News token for the real outlet; the
        # URL host is the last resort so a row is never dropped for lack of a
        # stored domain. www. is stripped so one publisher is not two rows.
        domain_q = text(r"""
            WITH resolved AS (
                SELECT regexp_replace(
                           lower(COALESCE(
                               NULLIF(e.source_domain, ''),
                               NULLIF(e.domain, ''),
                               NULLIF(n.domain, ''),
                               substring(n.url from '^https?://([^/:?#]+)')
                           )),
                           '^www\.', ''
                       ) AS host
                FROM crypto_news n
                LEFT JOIN news_article_extracts e ON e.news_id = n.id
                WHERE n.created_at > NOW() - INTERVAL '3 days'
            )
            SELECT host, COUNT(*) AS cnt
            FROM resolved
            WHERE host IS NOT NULL AND host <> ''
            GROUP BY host ORDER BY cnt DESC LIMIT 10
        """)
        domain_rows = db.execute(domain_q).fetchall()
        top_domains = [{"domain": r[0], "count": r[1]} for r in domain_rows]

        db.close()

        result = {
            "total": total, "articles": articles, "photos": photos,
            "headlines": headlines, "videos": videos,
            "last_hour": last_hour, "last_6h": last_6h,
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
def get_trending_topics():
    """
    Trending TOPICS from titles — never sources/handles.
    BossBotOfficial, @mentions, domain names, and telegram channels are excluded.
    """
    import re

    cache_key = "lq:news:trending:v2"
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

        # Build a set of known sources (domains / channels) so they never rank as "topics"
        src_rows = db.execute(text("""
            SELECT DISTINCT LOWER(COALESCE(domain, '')) AS d,
                   LOWER(COALESCE(source_channel, '')) AS c
            FROM crypto_news
            WHERE created_at > NOW() - INTERVAL '7 days'
        """)).fetchall()
        db.close()

        source_tokens = set()
        for d, c in src_rows:
            for raw in (d or "", c or ""):
                raw = raw.strip()
                if not raw:
                    continue
                # tradingview.com → tradingview ; rss:cointelegraph → cointelegraph
                base = raw.split(":")[-1]
                base = base.split("/")[0]
                base = base.replace(".com", "").replace(".co", "").replace(".org", "").replace(".net", "")
                base = re.sub(r"[^a-z0-9]", "", base)
                if len(base) >= 3:
                    source_tokens.add(base)
                # also keep full domain-ish tokens
                source_tokens.add(re.sub(r"[^a-z0-9]", "", raw))

        # Hard-coded publisher / telegram handles that flood titles
        source_tokens.update({
            "bossbotofficial", "bossbot", "middleeastspectator", "cryptonewsnet",
            "cryptobriefing", "cointelegraph", "coindesk", "decrypt", "theblock",
            "newsbtc", "beincrypto", "bitcoinmagazine", "u", "today", "utoday",
            "tradingview", "seekingalpha", "reuters", "bloomberg", "wsj",
            "official", "telegram", "twitter", "youtube",
        })

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
            "day", "days", "week", "month", "year", "april", "march", "july",
            "june", "may", "august", "september", "october", "november", "december",
            "2024", "2025", "2026", "2027", "report", "reports", "update",
            "million", "billion", "launches", "launch", "price", "market",
            "crypto", "token", "tokens", "coin", "coins", "news", "live",
            "breaking", "alert", "according", "against", "towards", "toward",
            "large", "scale", "could", "into", "over", "under", "after",
        }

        word_counts = {}
        for row in rows:
            title = row[0] or ""
            # Drop @handles and bare handles that look like sources
            title = re.sub(r"@[\w.]+", " ", title)
            title = re.sub(r"https?://\S+", " ", title)
            words = title.upper().split()
            for word in words:
                clean = "".join(c for c in word if c.isalnum() or c in "$")
                if len(clean) < 3:
                    continue
                low = clean.lower().lstrip("$")
                if low in stop_words or low in source_tokens:
                    continue
                # Long camel/joined tokens without $ are usually handles (BossBotOfficial)
                if len(low) >= 12 and low.isalpha() and not low.startswith("$"):
                    # allow known tickers/themes; reject handle-like
                    if any(x in low for x in ("official", "bot", "channel", "news", "spectator")):
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
def extract_article(news_id: int):
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
        q = text("SELECT url, title, description, raw_text, image_url, domain, content_type, created_at, video_url, source_channel FROM crypto_news WHERE id = :id")
        row = db.execute(q, {"id": news_id}).fetchone()
        db.close()

        if not row:
            raise HTTPException(status_code=404, detail="News not found")

        url = row[0]
        handle = _self_handle(row[9])
        base_data = {
            "id": news_id,
            "url": url,
            "title": _strip_self_promo(row[1], handle),
            "description": _strip_self_promo(row[2], handle),
            "raw_text": _strip_self_promo(row[3], handle),
            "image_url": row[4],
            "domain": row[5],
            "content_type": row[6],
            "created_at": str(row[7]) if row[7] else None,
            "video_url": row[8],
            "extracted": False,
            "summary": None,
            "keywords": [],
            "authors": [],
            "full_text": None,
            "top_image": None,
        }

        # Try persistent extraction first (direct HTML + Jina fallback).
        if url:
            db = None
            try:
                db = next(get_db_session())
                extracted = extract_news_item(db, news_id)
                if extracted and extracted.get("status") == "ok":
                    base_data["summary"] = extracted.get("summary")
                    base_data["full_text"] = (extracted.get("extracted_text") or "")[:4000]
                    base_data["top_image"] = extracted.get("image_url") or base_data["image_url"]
                    base_data["extracted"] = True
                    base_data["extract_provider"] = extracted.get("provider")
                    if extracted.get("title"):
                        base_data["title"] = extracted["title"]
                    cache_set(cache_key, base_data, ttl=86400)
                    return base_data
            except Exception as e:
                print(f"⚠️ Persistent article extract failed for {url}: {e}")
            finally:
                if db:
                    db.close()

        # Legacy newspaper3k fallback if installed.
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
