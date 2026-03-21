# backend/app/services/crypto_calendar_service.py
"""
Crypto Calendar Service — Token Unlocks & Crypto Events
Data sources:
  - Token Unlocks: CoinMarketCap internal API (same as their frontend)
  - Crypto Events: CoinMarketCap events page __NEXT_DATA__ (SSR JSON)

Caches in Redis for 1 hour. Stale-while-revalidate pattern.
"""
import json
import httpx
import logging
import re
import html as html_mod
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.redis import cache_get, cache_set, cache_get_with_stale

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour
_mem_cache: dict = {}

# Known major tokens for impact boosting
MAJOR_TOKENS = {
    "ARB", "OP", "SUI", "APT", "SEI", "TIA", "JUP", "STRK", "WLD", "PYTH",
    "DYDX", "IMX", "MANTA", "ALT", "PIXEL", "PORTAL", "AEVO", "ENA", "W",
    "ZRO", "ZK", "BLAST", "EIGEN", "SCR", "MOVE", "HYPE", "ME", "PENGU",
    "ONDO", "JTO", "BONK", "WIF", "LINK", "UNI", "AAVE", "MKR", "CRV",
    "LDO", "SNX", "COMP", "SUSHI", "YFI", "1INCH", "BAL", "DOGE", "SHIB",
    "SOL", "AVAX", "DOT", "ATOM", "FTM", "NEAR", "ICP", "FIL", "INJ",
    "ADA", "XRP", "BNB", "ETH", "BTC", "MATIC", "TON", "TRX", "ALGO",
    "SAND", "MANA", "AXS", "GALA", "ENJ", "FLOW", "ROSE", "CELO", "KAVA",
    "OSMO", "AKT", "NTRN", "DYM", "SAGA", "ETHFI", "REZ", "IO", "NOT",
    "LISTA", "BOME", "TRUMP", "IP", "KAITO", "LAYER", "RED",
}

CMC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Event tag -> impact mapping
TAG_IMPACT = {
    "Release": "Medium", "AMA": "Low", "Airdrop": "High",
    "Tokenomics": "High", "Fork/Swap": "High", "Partnership": "Medium",
    "Community": "Low", "Other": "Low", "Team Update": "Low",
    "Roadmap Update": "Medium", "Farming/Staking": "Medium",
    "Listing": "High", "Exchange": "High", "Hard Fork": "High",
    "Burning": "Medium", "Conference": "Low", "Contest": "Low",
    "NFT": "Low", "Regulation": "High", "Report": "Low",
    "Testing": "Low", "Update": "Medium", "Swap": "Medium",
    "Lock & Unlock": "High", "Announcement": "Medium",
}


# ════════════════════════════════════════════
# CRYPTO EVENTS — CoinMarketCap __NEXT_DATA__
# ════════════════════════════════════════════

async def _fetch_cmc_events_page() -> dict:
    """Fetch CMC events page and extract __NEXT_DATA__ pageProps."""
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                resp = await client.get(
                    "https://coinmarketcap.com/events/",
                    headers=CMC_HEADERS,
                )
                if resp.status_code == 200:
                    match = re.search(
                        r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                        resp.text, re.DOTALL,
                    )
                    if match:
                        data = json.loads(match.group(1))
                        return data.get("props", {}).get("pageProps", {})
        except Exception as e:
            logger.warning(f"CMC events page attempt {attempt+1} failed: {e}")
            if attempt == 0:
                continue
    return {}


def _parse_cmc_events(page_props: dict) -> list[dict]:
    """
    Parse CMC events from __NEXT_DATA__ pageProps.
    Structure confirmed:
      tableData: [ { timestamp, eventsList: [ {id,name,title,content,tags,eventTime,...} ] } ]
      calendarSignificantData: [ same event structure ]
      trendingData: [ same event structure ]
    """
    events = []
    now = datetime.now(timezone.utc)
    seen_ids = set()

    # 1. tableData — main events grouped by day
    for day_group in page_props.get("tableData", []):
        for item in day_group.get("eventsList", []):
            ev = _parse_single_cmc_event(item, now)
            if ev and ev.get("_id") not in seen_ids:
                seen_ids.add(ev.pop("_id"))
                events.append(ev)

    # 2. calendarSignificantData — featured events
    for item in page_props.get("calendarSignificantData", []):
        ev = _parse_single_cmc_event(item, now)
        if ev and ev.get("_id") not in seen_ids:
            seen_ids.add(ev.pop("_id"))
            if ev["impact"] == "Low":
                ev["impact"] = "Medium"
            events.append(ev)

    # 3. trendingData
    for item in page_props.get("trendingData", []):
        ev = _parse_single_cmc_event(item, now)
        if ev and ev.get("_id") not in seen_ids:
            seen_ids.add(ev.pop("_id"))
            events.append(ev)

    events.sort(key=lambda e: e.get("date", ""))
    return events


def _parse_single_cmc_event(item: dict, now: datetime) -> dict | None:
    """Parse one CMC event into normalized format."""
    try:
        title = item.get("title", "").strip()
        if not title:
            return None

        event_id = item.get("id", "")

        # Coins from name array: [{id, slug, name}, ...]
        coins = []
        coin_display = ""
        for n in item.get("name", []):
            cname = n.get("name", "")
            if cname:
                coins.append(cname)
                if not coin_display:
                    coin_display = cname

        # Tags: [{id, name, trending}, ...]
        tag_names = [t.get("name", "") for t in item.get("tags", [])]
        primary_tag = tag_names[0] if tag_names else "Other"

        # Impact
        impact = TAG_IMPACT.get(primary_tag, "Low")
        if item.get("significant"):
            impact = "High"
        elif item.get("trending") and impact == "Low":
            impact = "Medium"
        for c in coins:
            if c.upper() in MAJOR_TOKENS and impact == "Low":
                impact = "Medium"
                break

        # Timestamp (milliseconds)
        event_time = item.get("eventTime", 0)
        if not event_time:
            return None
        event_dt = datetime.fromtimestamp(event_time / 1000, tz=timezone.utc)
        diff = (event_dt - now).total_seconds()

        # Content
        content = item.get("content", "").strip()
        if content:
            content = re.sub(r'<[^>]+>', '', html_mod.unescape(content))[:300]

        return {
            "_id": event_id,
            "type": "crypto_event",
            "title": f"{coin_display}: {title}" if coin_display else title,
            "symbol": coins[0].upper() if coins else "",
            "coins": [c.upper() for c in coins],
            "date": event_dt.isoformat(),
            "impact": impact,
            "category": primary_tag,
            "description": content[:200],
            "source_link": item.get("originalSource", ""),
            "is_past": diff < 0,
            "seconds_until": max(0, int(diff)),
        }
    except Exception as e:
        logger.debug(f"Skip CMC event parse: {e}")
        return None


async def get_crypto_events() -> list[dict]:
    """Get upcoming crypto events with caching."""
    cache_key = "lq:calendar:crypto_events"

    cached = cache_get(cache_key)
    if cached and isinstance(cached, list):
        return cached

    stale, _ = cache_get_with_stale(cache_key)
    if stale and isinstance(stale, list):
        return stale

    if "crypto_events" in _mem_cache:
        return list(_mem_cache["crypto_events"])

    page_props = await _fetch_cmc_events_page()
    if page_props:
        events = _parse_cmc_events(page_props)
        if events:
            cache_set(cache_key, events, ttl=CACHE_TTL)
            _mem_cache["crypto_events"] = events
            logger.info(f"📅 Fetched {len(events)} crypto events from CMC")
            return events

    logger.error("❌ Crypto events: no data available")
    return []


# ════════════════════════════════════════════
# TOKEN UNLOCKS — CoinMarketCap data-api
# ════════════════════════════════════════════

CMC_UNLOCK_API = "https://api.coinmarketcap.com/data-api/v3/token-unlocks/list"


async def _fetch_cmc_unlocks() -> list[dict]:
    """Fetch token unlocks from CMC internal data-api (client-side loaded)."""
    headers = {
        "User-Agent": CMC_HEADERS["User-Agent"],
        "Accept": "application/json",
        "Referer": "https://coinmarketcap.com/token-unlocks/",
        "Origin": "https://coinmarketcap.com",
    }
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(
                    CMC_UNLOCK_API,
                    params={"start": "1", "limit": "50", "sortBy": "unlockDate", "sortType": "asc"},
                    headers=headers,
                )
                if resp.status_code == 200:
                    body = resp.json()
                    items = body.get("data", {}).get("list", [])
                    if not items:
                        items = body.get("data", [])
                    if isinstance(items, list) and items:
                        return items
                else:
                    logger.warning(f"CMC unlock API HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"CMC unlock API attempt {attempt+1}: {e}")
            if attempt == 0:
                continue
    return []


def _parse_cmc_unlocks(raw: list[dict]) -> list[dict]:
    """Parse CMC token unlock list into normalized format."""
    events = []
    now = datetime.now(timezone.utc)

    for item in raw:
        try:
            name = item.get("name") or item.get("tokenName") or ""
            symbol = item.get("symbol") or item.get("tokenSymbol") or ""

            next_unlock = (
                item.get("nextUnlockDate") or item.get("unlockDate")
                or item.get("nextEventDate") or item.get("nextUnlockDatetime")
            )
            if not next_unlock:
                continue

            if isinstance(next_unlock, (int, float)):
                ts = next_unlock / 1000 if next_unlock > 1e12 else next_unlock
                event_dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            elif isinstance(next_unlock, str):
                event_dt = datetime.fromisoformat(next_unlock.replace("Z", "+00:00"))
            else:
                continue

            diff = (event_dt - now).total_seconds()
            if diff < -86400 or diff > 30 * 86400:
                continue

            usd_val = item.get("nextUnlockValue") or item.get("unlockValue") or 0
            if isinstance(usd_val, str):
                usd_val = float(usd_val.replace(",", "").replace("$", "")) if usd_val else 0

            pct = item.get("nextUnlockPercentage") or item.get("unlockPercentage") or 0
            if isinstance(pct, str):
                pct = float(pct.replace("%", "")) if pct else 0

            if pct > 5 or usd_val > 50_000_000:
                impact = "High"
            elif pct > 1 or usd_val > 10_000_000:
                impact = "Medium"
            else:
                impact = "Low"
            if symbol.upper() in MAJOR_TOKENS and impact == "Low":
                impact = "Medium"

            events.append({
                "type": "unlock",
                "title": f"{symbol or name} token unlock",
                "symbol": symbol.upper(),
                "name": name,
                "date": event_dt.isoformat(),
                "impact": impact,
                "unlock_type": item.get("unlockType") or "cliff",
                "description": str(item.get("description") or item.get("allocation") or "")[:200],
                "usd_value": round(float(usd_val), 2) if usd_val else None,
                "pct_circulating": round(float(pct), 2) if pct else None,
                "is_past": diff < 0,
                "seconds_until": max(0, int(diff)),
            })
        except Exception as e:
            logger.debug(f"Skip unlock parse: {e}")
            continue

    events.sort(key=lambda e: e.get("date", ""))
    return events


async def get_token_unlocks() -> list[dict]:
    """Get upcoming token unlocks with caching."""
    cache_key = "lq:calendar:token_unlocks"

    cached = cache_get(cache_key)
    if cached and isinstance(cached, list):
        return cached

    stale, _ = cache_get_with_stale(cache_key)
    if stale and isinstance(stale, list):
        return stale

    if "unlocks" in _mem_cache:
        return list(_mem_cache["unlocks"])

    raw = await _fetch_cmc_unlocks()
    if raw:
        events = _parse_cmc_unlocks(raw)
        if events:
            cache_set(cache_key, events, ttl=CACHE_TTL)
            _mem_cache["unlocks"] = events
            logger.info(f"📅 Fetched {len(events)} token unlock events")
            return events

    logger.error("❌ Token unlocks: no data available")
    return []


# ════════════════════════════════════════════
# UNIFIED CALENDAR
# ════════════════════════════════════════════

async def get_unified_calendar(
    event_type: Optional[str] = None,
    impact: Optional[str] = None,
    symbol: Optional[str] = None,
) -> dict:
    """Merge macro + token unlocks + crypto events into one timeline."""
    from app.services.calendar_service import get_calendar as get_macro_calendar

    all_events = []

    if not event_type or event_type in ("all", "macro"):
        try:
            macro = await get_macro_calendar(include_next_week=False)
            for e in macro:
                e["type"] = "macro"
                if not e.get("symbol"):
                    e["symbol"] = e.get("country", "")
            all_events.extend(macro)
        except Exception as ex:
            logger.warning(f"Macro calendar fetch failed: {ex}")

    if not event_type or event_type in ("all", "unlock"):
        try:
            all_events.extend(await get_token_unlocks())
        except Exception as ex:
            logger.warning(f"Token unlocks fetch failed: {ex}")

    if not event_type or event_type in ("all", "crypto_event"):
        try:
            all_events.extend(await get_crypto_events())
        except Exception as ex:
            logger.warning(f"Crypto events fetch failed: {ex}")

    if impact:
        vals = [i.strip() for i in impact.split(",")]
        all_events = [e for e in all_events if e.get("impact") in vals]

    if symbol:
        sym = symbol.upper()
        all_events = [e for e in all_events if
                      sym in (e.get("symbol", "").upper(), e.get("country", "").upper())
                      or sym in [c.upper() for c in e.get("coins", [])]]

    all_events.sort(key=lambda e: e.get("date", ""))

    return {
        "events": all_events,
        "stats": {
            "total": len(all_events),
            "macro": sum(1 for e in all_events if e.get("type") == "macro"),
            "unlocks": sum(1 for e in all_events if e.get("type") == "unlock"),
            "crypto_events": sum(1 for e in all_events if e.get("type") == "crypto_event"),
            "high_impact": sum(1 for e in all_events if e.get("impact") == "High"),
            "upcoming": sum(1 for e in all_events if not e.get("is_past")),
        },
    }
    
    
    