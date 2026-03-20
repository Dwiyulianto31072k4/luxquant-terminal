# backend/app/services/macro_news_service.py
"""
Macro & Crypto News Aggregator
Fetches from RSS feeds, filters for macro/economy/crypto relevance.
Sources: CoinTelegraph, CoinDesk, Decrypt
Cached in Redis for 15 minutes.
"""
import re
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx

from app.core.redis import cache_get, cache_set, cache_get_with_stale

logger = logging.getLogger(__name__)

CACHE_KEY = "lq:macro-news"
CACHE_TTL = 900  # 15 minutes

RSS_FEEDS = [
    {"url": "https://cointelegraph.com/rss", "source": "CoinTelegraph"},
    {"url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "source": "CoinDesk"},
    {"url": "https://decrypt.co/feed", "source": "Decrypt"},
]

# Keywords to identify macro/economy/crypto-relevant articles
MACRO_KEYWORDS = [
    # US Macro
    "fed", "fomc", "inflation", "cpi", "pce", "gdp", "nonfarm", "non-farm",
    "unemployment", "jobs report", "interest rate", "rate cut", "rate hike",
    "treasury", "yield", "bond", "recession", "economy", "economic",
    "powell", "fed chair", "central bank", "monetary policy", "fiscal",
    "tariff", "trade war", "sanctions", "debt ceiling",
    # Global Macro
    "ecb", "boj", "bank of england", "pboc", "imf", "world bank",
    "oil", "crude", "opec", "commodities", "gold",
    "dollar", "dxy", "forex", "yen", "euro",
    "geopolitical", "war", "election",
    # Crypto Macro
    "bitcoin", "btc", "ethereum", "eth", "crypto", "stablecoin",
    "etf", "sec", "regulation", "defi", "institutional",
    "halving", "mining", "whale", "liquidation", "dominance",
    "market cap", "bull", "bear", "rally", "crash", "dump", "pump",
    "altcoin", "solana", "sol", "bnb", "xrp",
]


def _parse_rss_date(date_str: str) -> Optional[datetime]:
    """Parse various RSS date formats."""
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        pass
    for fmt in ["%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"]:
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            continue
    return None


def _time_ago(pub_dt: Optional[datetime]) -> str:
    """Format datetime as relative time string."""
    if not pub_dt:
        return ""
    try:
        now = datetime.now(timezone.utc)
        if pub_dt.tzinfo is None:
            from datetime import timezone as tz
            pub_dt = pub_dt.replace(tzinfo=tz.utc)
        diff = now - pub_dt
        mins = int(diff.total_seconds() / 60)
        if mins < 1:
            return "just now"
        if mins < 60:
            return f"{mins}m ago"
        hours = mins // 60
        if hours < 24:
            return f"{hours}h ago"
        days = hours // 24
        return f"{days}d ago"
    except Exception:
        return ""


def _extract_image(item) -> Optional[str]:
    """Extract image URL from RSS item."""
    ns = {
        "media": "http://search.yahoo.com/mrss/",
        "content": "http://purl.org/rss/1.0/modules/content/",
    }

    # media:content
    for tag in item.findall("media:content", ns):
        url = tag.get("url", "")
        if url and any(ext in url.lower() for ext in [".jpg", ".png", ".webp", ".jpeg"]):
            return url

    # media:thumbnail
    for tag in item.findall("media:thumbnail", ns):
        url = tag.get("url", "")
        if url:
            return url

    # enclosure
    for enc in item.findall("enclosure"):
        if "image" in (enc.get("type", "") or ""):
            return enc.get("url", "")

    # content:encoded <img>
    encoded = item.find("content:encoded", ns)
    if encoded is not None and encoded.text:
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', encoded.text)
        if m:
            return m.group(1)

    # description <img>
    desc = item.find("description")
    if desc is not None and desc.text:
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc.text)
        if m:
            return m.group(1)

    return None


def _is_macro_relevant(title: str, description: str) -> bool:
    """Check if article is macro/economy/crypto relevant."""
    text = (title + " " + description).lower()
    return any(kw in text for kw in MACRO_KEYWORDS)


async def fetch_macro_news(limit: int = 20) -> dict:
    """
    Fetch and filter macro-relevant news from RSS feeds.
    Returns cached data if available.
    """
    # 1. Try cache
    cached = cache_get(CACHE_KEY)
    if cached:
        return cached

    # 2. Fetch fresh
    articles = []

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
        for feed in RSS_FEEDS:
            try:
                resp = await client.get(feed["url"], headers={
                    "User-Agent": "Mozilla/5.0 (compatible; LuxQuant/1.0)"
                })
                if resp.status_code != 200:
                    continue

                root = ET.fromstring(resp.text)
                for item in root.iter("item"):
                    title_el = item.find("title")
                    link_el = item.find("link")
                    desc_el = item.find("description")
                    pub_el = item.find("pubDate")

                    title = title_el.text.strip() if title_el is not None and title_el.text else None
                    link = link_el.text.strip() if link_el is not None and link_el.text else None
                    desc_raw = desc_el.text.strip() if desc_el is not None and desc_el.text else ""

                    if not title or not link:
                        continue

                    # Clean HTML from description
                    clean_desc = re.sub(r'<[^>]+>', '', desc_raw).strip()[:200]

                    # Filter for macro relevance
                    if not _is_macro_relevant(title, clean_desc):
                        continue

                    pub_dt = _parse_rss_date(pub_el.text.strip() if pub_el is not None and pub_el.text else "")
                    image = _extract_image(item)

                    articles.append({
                        "title": title,
                        "link": link,
                        "description": clean_desc,
                        "image": image,
                        "source": feed["source"],
                        "published": pub_dt.isoformat() if pub_dt else None,
                        "time_ago": _time_ago(pub_dt),
                    })

            except Exception as e:
                logger.warning(f"RSS feed error ({feed['source']}): {e}")
                continue

    # Deduplicate by title
    seen = set()
    unique = []
    for a in articles:
        key = a["title"].lower()[:50]
        if key not in seen:
            seen.add(key)
            unique.append(a)

    # Sort by published date (newest first)
    unique.sort(key=lambda x: x.get("published") or "", reverse=True)
    unique = unique[:limit]

    result = {
        "articles": unique,
        "total": len(unique),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    # Cache
    cache_set(CACHE_KEY, result, ttl=CACHE_TTL)

    return result


async def get_macro_news(limit: int = 20) -> dict:
    """Public API — get macro news with stale fallback."""
    try:
        return await fetch_macro_news(limit=limit)
    except Exception as e:
        logger.error(f"Macro news fetch failed: {e}")
        # Stale fallback
        stale, _ = cache_get_with_stale(CACHE_KEY)
        if stale:
            return stale
        return {"articles": [], "total": 0, "error": str(e)}