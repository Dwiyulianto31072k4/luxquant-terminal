# backend/app/services/calendar_service.py
"""
Macro Economic Calendar — ForexFactory data
Free, no API key needed.
Fetches weekly calendar, caches in Redis for 1 hour.
Stale-while-revalidate: serves old data if fetch fails.
NO deep_translator — translations handled on frontend.
"""
import json
import httpx
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.redis import cache_get, cache_set, cache_get_with_stale, is_redis_available

logger = logging.getLogger(__name__)

# ── Cache Config ──
CACHE_TTL = 3600  # 1 hour

# ── In-memory fallback ──
_mem_cache: dict = {}
_source_health: dict[str, dict] = {}

FF_URLS = {
    "this": "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "next": "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
}


async def _fetch_ff(url: str) -> list[dict]:
    """Fetch from ForexFactory with timeout & retry."""
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (compatible; LuxQuant/1.0)"
                })
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"FF fetch attempt {attempt+1} failed for {url}: {e}")
            if attempt == 0:
                continue
    return []


def _get_cached_events(cache_key: str, ff_key: str) -> list[dict] | None:
    """Try to get from Redis cache (fresh then stale)."""
    # Fresh
    cached = cache_get(cache_key)
    if cached and isinstance(cached, list) and len(cached) > 0:
        meta = cache_get(f"{cache_key}:meta") or {}
        _source_health[ff_key] = {
            "status": "fresh",
            "fetched_at": meta.get("fetched_at"),
            "source": FF_URLS.get(ff_key),
        }
        return cached

    # Stale
    stale, is_stale = cache_get_with_stale(cache_key)
    if stale and isinstance(stale, list) and len(stale) > 0:
        logger.info(f"📅 Serving stale cache for {cache_key}")
        meta, _ = cache_get_with_stale(f"{cache_key}:meta")
        _source_health[ff_key] = {
            "status": "stale",
            "fetched_at": (meta or {}).get("fetched_at"),
            "source": FF_URLS.get(ff_key),
        }
        return stale

    # Memory
    if ff_key in _mem_cache:
        logger.info(f"📅 Serving memory cache for {ff_key}")
        previous = _source_health.get(ff_key, {})
        _source_health[ff_key] = {
            "status": "stale",
            "fetched_at": previous.get("fetched_at"),
            "source": FF_URLS.get(ff_key),
        }
        return list(_mem_cache[ff_key])

    return None


async def _get_events(cache_key: str, ff_key: str) -> list[dict]:
    """Get events: cache → fetch → stale → memory → empty."""
    # 1. Try cache
    cached = _get_cached_events(cache_key, ff_key)
    if cached:
        return cached

    # 2. Fetch fresh
    url = FF_URLS.get(ff_key)
    if not url:
        return []

    events = await _fetch_ff(url)

    if events:
        # Store in Redis + memory
        fetched_at = datetime.now(timezone.utc).isoformat()
        cache_set(cache_key, events, ttl=CACHE_TTL)
        cache_set(
            f"{cache_key}:meta",
            {"fetched_at": fetched_at, "source": url},
            ttl=CACHE_TTL,
        )
        _mem_cache[ff_key] = events
        _source_health[ff_key] = {
            "status": "fresh",
            "fetched_at": fetched_at,
            "source": url,
        }
        logger.info(f"📅 Fetched {len(events)} events from {url}")
        return events

    # 3. All failed
    _source_health[ff_key] = {
        "status": "unavailable",
        "fetched_at": None,
        "source": url,
    }
    logger.error(f"❌ Calendar: no data for {ff_key}")
    return []


def get_calendar_health(
    *,
    include_next_week: bool = False,
    event_count: int = 0,
    events: Optional[list[dict]] = None,
) -> dict:
    """Return the source state from the most recent calendar fetch."""
    now = datetime.now(timezone.utc)
    keys = ["this"] + (["next"] if include_next_week else [])
    states = [_source_health.get(key) for key in keys]
    states = [state for state in states if state]
    primary = _source_health.get("this") or {}
    status = primary.get("status", "unavailable")
    fetched_at = primary.get("fetched_at")
    parsed_at = None
    if fetched_at:
        try:
            parsed_at = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
            if parsed_at.tzinfo is None:
                parsed_at = parsed_at.replace(tzinfo=timezone.utc)
        except ValueError:
            parsed_at = None
    age_seconds = (
        max(0.0, (now - parsed_at).total_seconds()) if parsed_at else None
    )
    event_dates = []
    for event in events or []:
        try:
            value = str(event.get("date") or "").replace("Z", "+00:00")
            event_at = datetime.fromisoformat(value)
            if event_at.tzinfo is None:
                event_at = event_at.replace(tzinfo=timezone.utc)
            event_dates.append(event_at.astimezone(timezone.utc))
        except (TypeError, ValueError):
            continue
    coverage_through = max(event_dates) if event_dates else None
    covers_72h = (
        coverage_through >= now + timedelta(hours=72)
        if coverage_through is not None
        else False
    )
    return {
        "provider": "forexfactory",
        "status": status,
        "available": status in {"fresh", "stale"},
        "fetched_at": fetched_at,
        "age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
        "event_count": event_count,
        "weeks_requested": keys,
        "sources": states,
        "coverage_through": (
            coverage_through.isoformat() if coverage_through else None
        ),
        "covers_72h": covers_72h,
    }


def _enrich_events(events: list[dict]) -> list[dict]:
    """Add computed fields: is_past, seconds_until."""
    now = datetime.now(timezone.utc)
    for event in events:
        try:
            date_str = event.get("date", "")
            if date_str:
                event_dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                diff = (event_dt - now).total_seconds()
                event["is_past"] = diff < 0
                event["seconds_until"] = max(0, int(diff))
            else:
                event["is_past"] = True
                event["seconds_until"] = 0
        except Exception:
            event["is_past"] = True
            event["seconds_until"] = 0
    return events


async def get_calendar(
    impact: Optional[str] = None,
    country: Optional[str] = None,
    include_next_week: bool = False,
) -> list[dict]:
    """Get macro economic calendar events."""
    events = await _get_events("lq:calendar:thisweek", "this")

    if include_next_week:
        next_events = await _get_events("lq:calendar:nextweek", "next")
        events = events + next_events

    # Apply filters
    if impact:
        impacts = [i.strip() for i in impact.split(",")]
        events = [e for e in events if e.get("impact") in impacts]

    if country:
        countries = [c.strip().upper() for c in country.split(",")]
        events = [e for e in events if e.get("country") in countries]

    # Sort by date
    events.sort(key=lambda e: e.get("date", ""))

    # Add computed fields
    events = _enrich_events(events)

    return events


async def get_upcoming_high_impact(limit: int = 5) -> list[dict]:
    """Get next N high-impact events."""
    events = await get_calendar(impact="High")
    upcoming = [e for e in events if not e.get("is_past")]
    return upcoming[:limit]
