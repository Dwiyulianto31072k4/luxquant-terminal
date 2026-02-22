# backend/app/services/calendar_service.py
"""
Macro Economic Calendar — ForexFactory data
Free, no API key needed.
Fetches weekly calendar, caches in memory for 1 hour.
"""
import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── Cache ──
_cache: dict = {"data": None, "fetched_at": None}
CACHE_TTL = 3600  # 1 hour

FF_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]


async def get_calendar(
    impact: Optional[str] = None,
    country: Optional[str] = None,
    include_next_week: bool = False,
) -> list[dict]:
    """
    Get macro economic calendar events.
    
    Args:
        impact: Filter by impact level ("High", "Medium", "Low", "Holiday")
        country: Filter by country code ("USD", "EUR", "GBP", etc.)
        include_next_week: Also fetch next week's data
    """
    events = await _fetch_cached(include_next_week)

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
    now = datetime.now(timezone.utc)
    for event in events:
        try:
            event_dt = datetime.fromisoformat(event["date"].replace("Z", "+00:00"))
            diff = (event_dt - now).total_seconds()
            event["is_past"] = diff < 0
            event["seconds_until"] = max(0, int(diff))
        except Exception:
            event["is_past"] = True
            event["seconds_until"] = 0

    return events


async def get_upcoming_high_impact(limit: int = 5) -> list[dict]:
    """Get next N high-impact events (for widget/overview)"""
    events = await get_calendar(impact="High")
    upcoming = [e for e in events if not e.get("is_past")]
    return upcoming[:limit]


async def _fetch_cached(include_next_week: bool = False) -> list[dict]:
    """Fetch with simple in-memory cache"""
    now = datetime.now(timezone.utc)
    cache_key = "with_next" if include_next_week else "this_week"

    if (
        _cache.get(cache_key)
        and _cache.get(f"{cache_key}_at")
        and (now - _cache[f"{cache_key}_at"]).total_seconds() < CACHE_TTL
    ):
        return list(_cache[cache_key])  # Return copy

    # Fetch fresh data
    urls = FF_URLS if include_next_week else [FF_URLS[0]]
    all_events = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        for url in urls:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                all_events.extend(data)
                logger.info(f"📅 Fetched {len(data)} events from {url}")
            except Exception as e:
                logger.error(f"❌ Failed to fetch calendar from {url}: {e}")

    # Cache it
    _cache[cache_key] = all_events
    _cache[f"{cache_key}_at"] = now

    return list(all_events)