"""
News category classifier + RSS → crypto_news persistence.

Single source of truth for how a news item is tagged with ONE `category`
so RSS ingestion and the SQL backfill in
`database/migration-news-unified-hub-v1.sql` stay in sync.

Priority (first match wins): general → macro → bitcoin → market → crypto.

Nothing here runs on its own; it is called by the RSS services once wired.
"""

from __future__ import annotations

import hashlib
import re
from typing import Iterable, Optional

from sqlalchemy import text


# ── Keyword patterns (mirror the SQL CASE in the migration) ──────────
# Python `re` uses \b for word boundaries (Postgres uses \y).
_CRYPTO_TERMS = re.compile(
    r"(bitcoin|\bbtc\b|ethereum|\beth\b|crypto|token|blockchain|stablecoin"
    r"|\bdefi\b|altcoin|solana|\bxrp\b|memecoin|\betf\b|satoshi)",
    re.I,
)
_GEO_TERMS = re.compile(
    r"(missile|nuclear|airstrike|troops|ceasefire|\bwar\b|invasion"
    r"|\belection\b|sanction|geopolit)",
    re.I,
)
_MACRO_TERMS = re.compile(
    r"(\bfed\b|fomc|inflation|\bcpi\b|\bpce\b|\bgdp\b|treasury|powell"
    r"|rate cut|rate hike|interest rate|\becb\b|tariff|nonfarm|non-farm"
    r"|jobs report|recession)",
    re.I,
)
_BITCOIN_TERMS = re.compile(r"(bitcoin|\bbtc\b|satoshi|halving)", re.I)
_MARKET_TERMS = re.compile(
    r"(\betf\b|liquidation|altcoin|\bdefi\b|stablecoin|\bwhale\b"
    r"|trading volume|\brally\b|market cap|open interest)",
    re.I,
)

VALID_CATEGORIES = ("crypto", "bitcoin", "macro", "market", "general")


def classify(title: str, description: str = "", raw_text: str = "") -> str:
    """Return the single primary category for a news item."""
    blob = " ".join(filter(None, (title, description, raw_text)))
    if not _CRYPTO_TERMS.search(blob) and _GEO_TERMS.search(blob):
        return "general"
    if _MACRO_TERMS.search(blob):
        return "macro"
    if _BITCOIN_TERMS.search(blob):
        return "bitcoin"
    if _MARKET_TERMS.search(blob):
        return "market"
    return "crypto"


def _synthetic_msg_id(url: str) -> int:
    """Stable positive int4 from a URL. Uses md5 (not builtin hash(), which is
    randomized per process) so the (source_channel, source_msg_id) unique
    constraint stays consistent across worker restarts."""
    digest = hashlib.md5(url.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 2_147_483_647


def persist_rss_items(
    db,
    items: Iterable[dict],
    *,
    default_category: Optional[str] = None,
) -> int:
    """
    Upsert RSS items into crypto_news. Idempotent per URL.

    Expected item shape (macro_news_service / market_overview):
        {title, link, description, image, source, published}

    Returns the number of rows inserted (conflicts are skipped).
    `default_category` overrides the classifier (e.g. force 'bitcoin' for
    the bitcoin-page feed); leave None to auto-classify.
    """
    inserted = 0
    stmt = text("""
        INSERT INTO crypto_news (
            source_channel, source_msg_id, source_type, content_type,
            category, title, description, url, image_url, published_at, raw_text
        )
        VALUES (
            :source_channel, :source_msg_id, 'rss', 'article',
            :category, :title, :description, :url, :image_url, :published_at, :raw_text
        )
        ON CONFLICT DO NOTHING
    """)
    for it in items:
        url = (it.get("link") or it.get("url") or "").strip()
        title = (it.get("title") or "").strip()
        if not url or not title:
            continue
        desc = (it.get("description") or "").strip()
        source = (it.get("source") or "rss").strip().lower().replace(" ", "-")
        category = default_category or classify(title, desc)
        result = db.execute(stmt, {
            "source_channel": f"rss:{source}",
            "source_msg_id": _synthetic_msg_id(url),
            "category": category,
            "title": title,
            "description": desc,
            "url": url,
            "image_url": it.get("image"),
            "published_at": it.get("published") or it.get("pubDate"),
            "raw_text": desc,
        })
        inserted += result.rowcount or 0
    db.commit()
    return inserted


def save_rss_items(items: Iterable[dict], *, default_category: Optional[str] = None) -> int:
    """
    Self-contained persist: opens its own DB session, never raises.

    Designed to be called from async code via:
        await asyncio.to_thread(save_rss_items, items)
    so it never blocks the event loop and a DB hiccup never breaks the
    news response that the web app depends on.
    """
    try:
        from app.core.database import SessionLocal
    except Exception:
        return 0
    db = SessionLocal()
    try:
        return persist_rss_items(db, items, default_category=default_category)
    except Exception:  # noqa: BLE001 — persistence is best-effort
        try:
            db.rollback()
        except Exception:
            pass
        return 0
    finally:
        db.close()
