"""
BGeometrics Advanced API client for AI Arena v6.

Wraps 23 endpoints across 5 tiers used by the AI Arena worker:
- Tier 1 Cycle Position (5)        : MVRV-Z, Puell, Mayer, Pi-Cycle, Reserve Risk
- Tier 2 Macro Liquidity (4)       : M2 Global, M2 YoY, SSR, SSR Oscillator
- Tier 3 Smart Money (5)           : Top traders L/S, Funding, Basis, Taker volume
- Tier 4 On-chain Behavior (6)     : NUPL, SOPR, STH-MVRV, Miner flow, Exchange netflow, Hashribbons
- Tier 5 Volatility & Risk (3)     : Volatility, Open Interest, Fear & Greed

Note: 'liquidations' endpoint dropped — returns 404 on BGeometrics API.
Liquidations data should be sourced from CoinGlass externally if needed.

Quota: 200 req/h, 400 req/day (Advanced tier).
Cache strategy: 6h fresh + 24h stale fallback (Redis).

Usage:
    from app.services.bg_advanced import BGClient

    bg = BGClient()
    snapshot = await bg.fetch_all()  # returns dict with 23 metrics
    cycle = await bg.fetch_tier("cycle")  # specific tier only
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import statistics
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from dotenv import load_dotenv
load_dotenv()

import httpx

logger = logging.getLogger(__name__)

# ─── Config ────────────────────────────────────────────────────────────
BG_API_URL = "https://api.bgeometrics.com/v1"
BG_TOKEN = os.getenv("BGEOMETRICS_API_KEY", "")

CACHE_TTL_FRESH = 6 * 3600        # 6 hours — counts as fresh
CACHE_TTL_STALE = 24 * 3600       # 24 hours — fallback when fresh fetch fails
HTTP_TIMEOUT = 10.0
HTTP_MAX_RETRIES = 2
RATE_LIMIT_SLEEP = 0.3            # seconds between sequential requests

# The BGeometrics allowance (200/hour) is per ACCOUNT, not per endpoint, so a
# 429 on one endpoint means all 23 are out of budget.  A single global breaker
# therefore parks every endpoint at once.
#
# Why this exists: failures are never written to the metric cache, so before the
# breaker a rate-limited run left nothing cached, and the arena-v6 monitor timer
# (OnUnitActiveSec=2min) re-fetched all 23 endpoints two minutes later — 23
# calls, ×3 while 429 was also retried, ~2000 requests/hour against a 200/hour
# cap.  The quota could never recover on its own and BTC Compass hard-failed for
# 17 hours with `BG snapshot: 0/23 ok`.  Do not reintroduce retry-on-429.
COOLDOWN_KEY = "bg:adv:cooldown"
COOLDOWN_DEFAULT = 600            # 10 min when the provider gives no reset hint
COOLDOWN_MAX = 3600               # cap when the hourly (200) window is the empty one
COOLDOWN_MAX_DAY = 24 * 3600      # cap when the daily (800) window is the empty one

# Optional Redis dependency — degrades to no-cache if unavailable.
#
# This used to import `redis_client`, which app.core.redis has never exported
# (the module keeps a private `_redis_client` and hands it out via get_redis()).
# The ImportError was swallowed by the bare `except`, so HAS_REDIS silently
# pinned to False and THE BGEOMETRICS CACHE NEVER RAN ONCE. Every scheduled
# pass therefore refetched all 23 endpoints, which is what exhausted the
# 200/hour quota and hard-failed BTC Compass. Keep this import bound to a name
# app.core.redis actually exports.
try:
    from app.core.redis import get_redis  # type: ignore
    HAS_REDIS = True
except Exception:
    get_redis = None  # type: ignore
    HAS_REDIS = False


async def _redis(command: str, *args, **kwargs):
    """Run one sync redis command off the event loop.

    app.core.redis hands out a *synchronous* client, but everything here is
    async, so the calls are pushed to a worker thread rather than awaited
    directly. Returns None whenever Redis is unusable — callers treat that as
    "no cache" and carry on.
    """
    if not HAS_REDIS or get_redis is None:
        return None
    try:
        client = get_redis()
        if client is None:
            return None
        return await asyncio.to_thread(getattr(client, command), *args, **kwargs)
    except Exception as e:
        logger.warning("BG redis %s failed: %s", command, e)
        return None


# ─── Endpoint registry ────────────────────────────────────────────────
TIER_CYCLE = ("mvrv-zscore", "puell-multiple", "mayer-multiple", "pi-cycle", "reserve-risk")
TIER_MACRO = ("m2global", "m2yoy-change", "ssr", "ssr-oscillator")
# taker-vol-1h removed from the fetch list, not from the product: it returns one
# aggregate figure where an imbalance needs both sides, and was recorded
# unavailable in all 494 reports audited. The evidence matrix still lists the key
# and will keep rendering it unavailable, exactly as it already did — real order
# flow comes from Binance via order_flow.fetch_taker_split. Dropping it returns a
# slot to a quota that is now 10/hour.
TIER_SMART = ("top-trader-position-1h", "top-trader-account-1h", "funding-rate",
              "btc-derivatives-basis-1h")
TIER_ONCHAIN = ("nupl", "sopr", "sth-mvrv", "miner-net-flow", "exchange-netflow-btc", "hashribbons")
TIER_RISK = ("volatility", "open-interest", "fear-greed")  # 'liquidations' dropped — 404

TIERS: dict[str, tuple[str, ...]] = {
    "cycle": TIER_CYCLE,
    "macro": TIER_MACRO,
    "smart": TIER_SMART,
    "onchain": TIER_ONCHAIN,
    "risk": TIER_RISK,
}

ALL_ENDPOINTS = TIER_CYCLE + TIER_MACRO + TIER_SMART + TIER_ONCHAIN + TIER_RISK  # 22 total

# ─── Field mapping (endpoint → response field name) ─────────────────
# BGeometrics returns {"d": date, "unixTs": ts, "<fieldName>": value}.
# Field name is camelCase derived from endpoint, but with quirks. Map explicitly.
ENDPOINT_FIELD_MAP: dict[str, str | tuple[str, ...]] = {
    # Cycle
    "mvrv-zscore": "mvrvZscore",
    "puell-multiple": "puellMultiple",
    "mayer-multiple": "mayerMultiple",
    "pi-cycle": ("piSignal", "piCycle"),
    "reserve-risk": "reserveRisk",
    # Macro
    "m2global": "m2global",
    "m2yoy-change": ("m2yoyChange", "m2YoYChange", "m2yoy"),
    "ssr": "ssr",
    "ssr-oscillator": ("ssrOscillator", "ssrOsc"),
    # Smart Money
    "top-trader-position-1h": "topTraderLongShortRatioPosition",
    "top-trader-account-1h": ("topTraderLongShortRatioAccount", "topTraderLongShortRatio"),
    "funding-rate": "fundingRate",
    "btc-derivatives-basis-1h": ("basis", "derivativesBasis", "btcBasis"),
    "taker-vol-1h": ("takerBuyRatio", "takerVol", "takerVolume"),
    # On-chain
    "nupl": "nupl",
    "sopr": "sopr",
    "sth-mvrv": ("sthMvrv", "sthMVRV"),
    "miner-net-flow": ("minerNetFlow", "minerNetflow"),
    "exchange-netflow-btc": ("exchangeNetflow", "exchangeNetFlow", "exchangeNetflowBtc"),
    "hashribbons": "hashribbons",
    # Risk
    "volatility": "volatility",
    "open-interest": ("openInterest", "oi"),
    "fear-greed": "fearGreed",
}


# ─── Data structures ──────────────────────────────────────────────────
@dataclass
class BGMetric:
    """Normalized BGeometrics metric response."""
    key: str
    value: Any = None
    timestamp: int | None = None     # source data timestamp (unix s or ms)
    fetched_at: float = field(default_factory=lambda: time.time())
    is_stale: bool = False
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and self.value is not None

    def to_dict(self) -> dict:
        return asdict(self)


# ─── Cache layer ──────────────────────────────────────────────────────
def _cache_key(endpoint: str) -> str:
    return f"bg:adv:{endpoint}"


async def _cache_get(endpoint: str) -> BGMetric | None:
    """Return cached metric. is_stale=True if past fresh TTL but within stale TTL."""
    if not HAS_REDIS:
        return None
    try:
        raw = await _redis("get", _cache_key(endpoint))
        if not raw:
            return None
        data = json.loads(raw)
        age = time.time() - data.get("fetched_at", 0)
        metric = BGMetric(**{k: v for k, v in data.items() if k != "is_stale"})
        if age < CACHE_TTL_FRESH:
            metric.is_stale = False
            return metric
        if age < CACHE_TTL_STALE:
            metric.is_stale = True
            return metric
        return None
    except Exception as e:
        logger.warning("BG cache read failed for %s: %s", endpoint, e)
        return None


async def _cooldown_left() -> int:
    """Seconds remaining on the account-wide rate-limit breaker, 0 if clear."""
    try:
        ttl = await _redis("ttl", COOLDOWN_KEY)
        return int(ttl) if ttl and int(ttl) > 0 else 0
    except Exception:
        return 0


def _reset_delta(hint: str | None) -> int | None:
    """Seconds until a unix-timestamp reset hint, or None if unusable."""
    try:
        if not hint:
            return None
        delta = int(float(hint) - time.time())
        return delta if delta > 0 else None
    except (TypeError, ValueError):
        return None


async def _cooldown_start(headers: Any) -> None:
    """Park all endpoints until the exhausted window actually rolls over.

    BGeometrics enforces TWO ceilings — 200/hour and 800/day — and only the day
    one appears in ``x-ratelimit-remaining-day``. Parking on the hourly reset
    while the daily budget is the empty one means waking up every hour to spend
    23 requests on another 429, so pick whichever window is actually blocking.
    """
    h = {str(k).lower(): v for k, v in dict(headers or {}).items()}
    day_left = h.get("x-ratelimit-remaining-day")
    hour_delta = _reset_delta(h.get("x-ratelimit-reset-hour"))
    day_delta = _reset_delta(h.get("x-ratelimit-reset-day"))

    seconds, window = COOLDOWN_DEFAULT, "default"
    if str(day_left).strip() == "0" and day_delta:
        seconds, window = day_delta + 5, "daily"
    elif hour_delta:
        seconds, window = hour_delta + 5, "hourly"

    seconds = max(60, min(seconds, COOLDOWN_MAX_DAY if window == "daily" else COOLDOWN_MAX))
    try:
        await _redis("set", COOLDOWN_KEY, "1", ex=seconds)
        logger.warning(
            "BG rate limited (%s window empty) — pausing all endpoints for %ss "
            "so the quota can recover", window, seconds,
        )
    except Exception as e:
        logger.warning("BG cooldown write failed: %s", e)


async def _cache_set(metric: BGMetric) -> None:
    if not HAS_REDIS or not metric.ok:
        return
    try:
        await _redis(
            "set",
            _cache_key(metric.key),
            json.dumps(metric.to_dict(), default=str),
            ex=CACHE_TTL_STALE,
        )
    except Exception as e:
        logger.warning("BG cache write failed for %s: %s", metric.key, e)


# ─── Response normalization ───────────────────────────────────────────
_META_FIELDS = {"d", "date", "unixTs", "unix_ts", "timestamp", "t", "x"}


def _coerce_value(value: Any) -> Any:
    """Try to coerce string numerics to float. Leave strings ('Up'/'Down') as-is."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            if "." in value or "e" in value.lower():
                return float(value)
            return int(value)
        except (ValueError, TypeError):
            return value
    return value


def _extract_timestamp(raw: dict) -> int | None:
    """Pull timestamp from common metadata fields."""
    for k in ("unixTs", "unix_ts", "timestamp", "t"):
        if k in raw:
            try:
                ts = raw[k]
                if isinstance(ts, str):
                    ts = float(ts)
                return int(ts)
            except (ValueError, TypeError):
                continue
    return None


def _normalize(endpoint: str, raw: Any) -> tuple[Any, int | None]:
    """
    Extract value + timestamp from BGeometrics response.

    BG returns {"d": "2026-05-01", "unixTs": 1777593600, "<field>": <value>}.
    Field name is mapped per endpoint via ENDPOINT_FIELD_MAP.

    Returns (None, None) if cannot extract.
    """
    if raw is None:
        return None, None

    # Bare scalar — defensive
    if isinstance(raw, (int, float, bool)):
        return raw, None
    if isinstance(raw, str):
        return _coerce_value(raw), None

    # List of points — take last entry, recurse
    if isinstance(raw, list):
        if not raw:
            return None, None
        return _normalize(endpoint, raw[-1])

    if not isinstance(raw, dict):
        return None, None

    # Dict path — use field map
    timestamp = _extract_timestamp(raw)
    field_spec = ENDPOINT_FIELD_MAP.get(endpoint)

    candidates: tuple[str, ...]
    if field_spec is None:
        candidates = ("value", "v", "y")
    elif isinstance(field_spec, str):
        candidates = (field_spec,)
    else:
        candidates = field_spec

    for field_name in candidates:
        if field_name in raw and raw[field_name] is not None:
            return _coerce_value(raw[field_name]), timestamp

    # Last resort: take first non-meta field
    for k, v in raw.items():
        if k in _META_FIELDS or v is None:
            continue
        if isinstance(v, (dict, list)):
            continue
        return _coerce_value(v), timestamp

    return None, timestamp


# ─── HTTP fetch ───────────────────────────────────────────────────────

# ─── Free replacements (Binance / alternative.me) ─────────────────────
#
# The BGeometrics plan lapsed on 2026-08-30 and the account fell back to the
# free tier's 10 requests/hour. Twenty-three endpoints cannot refresh inside
# that: five stopped reaching the cache at all — mvrv-zscore among them, the
# heaviest-weighted cycle input — and the rest began serving past their 6h
# fresh window.
#
# These six carry the same numbers Binance publishes for nothing, so they are
# taken there instead. Every mapping below was checked against the value
# BGeometrics had cached at the time:
#
#   top-trader-position-1h   0.6742  vs longAccount 0.6753
#   top-trader-account-1h    0.5759  vs longAccount 0.5778
#   funding-rate           3.844e-05 vs fundingRate 0.00003844   (exact)
#   open-interest           109,442  vs 108,878                  (~0.5%, minutes apart)
#   volatility               42.11   vs 42.98
#   fear-greed                  69   vs 69                       (exact)
#
# Not moved: btc-derivatives-basis-1h. BGeometrics reports -22.09 where the
# perp basis is -0.04%, so the unit is something else, and this value feeds a
# correlation series that changing scale mid-flight would corrupt.
#
# Measured on the free tier after the lapse: exchange-netflow-btc answers 403
# INVALID_TOKEN, so it is paid-only and is simply gone until someone subscribes
# again. The rest answer, subject to the 10/hour ceiling.
#
# Not replaced but dropped: taker-vol-1h. It returns one aggregate where an
# imbalance needs both sides, and was already recorded unavailable in all 494
# reports audited — order flow comes from Binance via order_flow.fetch_taker_split.
BINANCE_BACKED = frozenset({
    "top-trader-position-1h",
    "top-trader-account-1h",
    "funding-rate",
    "open-interest",
    "volatility",
    "fear-greed",
})

_FAPI = "https://fapi.binance.com"


async def _fetch_free(client: httpx.AsyncClient, endpoint: str) -> BGMetric:
    """One of BINANCE_BACKED, from its free public source. Spends no BG quota."""
    try:
        if endpoint == "top-trader-position-1h":
            r = await client.get(f"{_FAPI}/futures/data/topLongShortPositionRatio",
                                 params={"symbol": "BTCUSDT", "period": "1h", "limit": 1},
                                 timeout=HTTP_TIMEOUT)
            row = r.json()[-1]
            return BGMetric(key=endpoint, value=float(row["longAccount"]),
                            timestamp=int(row["timestamp"]) // 1000)

        if endpoint == "top-trader-account-1h":
            r = await client.get(f"{_FAPI}/futures/data/topLongShortAccountRatio",
                                 params={"symbol": "BTCUSDT", "period": "1h", "limit": 1},
                                 timeout=HTTP_TIMEOUT)
            row = r.json()[-1]
            return BGMetric(key=endpoint, value=float(row["longAccount"]),
                            timestamp=int(row["timestamp"]) // 1000)

        if endpoint == "funding-rate":
            # The last SETTLED rate, which is what BGeometrics reports —
            # premiumIndex.lastFundingRate is the current prediction and differs.
            r = await client.get(f"{_FAPI}/fapi/v1/fundingRate",
                                 params={"symbol": "BTCUSDT", "limit": 1},
                                 timeout=HTTP_TIMEOUT)
            row = r.json()[-1]
            return BGMetric(key=endpoint, value=float(row["fundingRate"]),
                            timestamp=int(row["fundingTime"]) // 1000)

        if endpoint == "open-interest":
            r = await client.get(f"{_FAPI}/fapi/v1/openInterest",
                                 params={"symbol": "BTCUSDT"}, timeout=HTTP_TIMEOUT)
            d = r.json()
            return BGMetric(key=endpoint, value=float(d["openInterest"]),
                            timestamp=int(d.get("time", 0)) // 1000 or None)

        if endpoint == "volatility":
            # 30d realised, annualised, in percent — matches BGeometrics' scale.
            r = await client.get(f"{_FAPI}/fapi/v1/klines",
                                 params={"symbol": "BTCUSDT", "interval": "1d", "limit": 31},
                                 timeout=HTTP_TIMEOUT)
            closes = [float(k[4]) for k in r.json()]
            if len(closes) < 10:
                return BGMetric(key=endpoint, error="klines_too_short")
            rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
            vol = statistics.stdev(rets) * math.sqrt(365) * 100
            return BGMetric(key=endpoint, value=round(vol, 4), timestamp=int(time.time()))

        if endpoint == "fear-greed":
            r = await client.get("https://api.alternative.me/fng/",
                                 params={"limit": 1}, timeout=HTTP_TIMEOUT)
            d = r.json()["data"][0]
            return BGMetric(key=endpoint, value=float(d["value"]),
                            timestamp=int(d.get("timestamp", 0)) or None)

        return BGMetric(key=endpoint, error="no_free_source")
    except Exception as e:
        return BGMetric(key=endpoint, error=f"free_source: {type(e).__name__}: {e}")


async def _http_fetch(client: httpx.AsyncClient, endpoint: str) -> BGMetric:
    """Single endpoint HTTP fetch with retry. Does not touch cache."""
    if endpoint in BINANCE_BACKED:
        return await _fetch_free(client, endpoint)

    if not BG_TOKEN:
        return BGMetric(key=endpoint, error="BGEOMETRICS_API_KEY not set")

    url = f"{BG_API_URL}/{endpoint}/last"
    params = {"token": BG_TOKEN}
    last_err = ""

    for attempt in range(HTTP_MAX_RETRIES + 1):
        try:
            resp = await client.get(url, params=params, timeout=HTTP_TIMEOUT)
            if resp.status_code == 200:
                value, ts = _normalize(endpoint, resp.json())
                if value is None:
                    return BGMetric(key=endpoint, error=f"normalize_failed: {resp.text[:100]}")
                return BGMetric(key=endpoint, value=value, timestamp=ts)
            if resp.status_code == 429:
                # Never retry a rate limit — each extra attempt spends quota we
                # already do not have. Park every endpoint instead.
                await _cooldown_start(resp.headers)
                return BGMetric(key=endpoint, error="http_429: rate limited")
            if resp.status_code == 503:
                await asyncio.sleep(1.0 * (attempt + 1))
                last_err = f"http_{resp.status_code}"
                continue
            return BGMetric(key=endpoint, error=f"http_{resp.status_code}: {resp.text[:80]}")
        except httpx.TimeoutException:
            last_err = "timeout"
        except Exception as e:
            last_err = f"exception: {type(e).__name__}: {e}"

    return BGMetric(key=endpoint, error=last_err or "unknown_error")


# ─── Public client ────────────────────────────────────────────────────
class BGClient:
    """
    BGeometrics Advanced API client with cache.

    Methods:
        fetch(endpoint)         → single endpoint with cache
        fetch_tier(name)        → all endpoints in a tier
        fetch_all()             → all 23 endpoints (parallel)
        health_check()          → quick liveness check
    """

    def __init__(self, token: str | None = None):
        self.token = token or BG_TOKEN
        if not self.token:
            logger.warning("BGClient initialized without token — all calls will fail")

    async def fetch(self, endpoint: str, force_refresh: bool = False) -> BGMetric:
        """Fetch one endpoint. Tries cache first unless force_refresh."""
        if endpoint not in ALL_ENDPOINTS:
            return BGMetric(key=endpoint, error=f"unknown endpoint: {endpoint}")

        if not force_refresh:
            cached = await _cache_get(endpoint)
            if cached and not cached.is_stale:
                return cached

        # Rate-limit breaker: while it is armed, make no request at all. Serving
        # stale data (or failing) costs nothing; hammering keeps the quota at
        # zero. force_refresh does not override this — the whole point is that
        # the caller cannot spend budget the account does not have.
        cooling = await _cooldown_left()
        if cooling:
            stale = await _cache_get(endpoint)
            if stale and stale.value is not None:
                stale.is_stale = True
                return stale
            return BGMetric(
                key=endpoint,
                error=f"rate_limit_cooldown: retrying in {cooling}s",
            )

        async with httpx.AsyncClient() as client:
            metric = await _http_fetch(client, endpoint)

        if metric.ok:
            await _cache_set(metric)
            return metric

        # fetch failed — fall back to stale cache if available
        stale = await _cache_get(endpoint)
        if stale and stale.value is not None:
            stale.is_stale = True
            logger.info("BG fetch failed for %s, serving stale cache", endpoint)
            return stale

        return metric

    async def fetch_tier(
        self,
        tier: str,
        force_refresh: bool = False,
    ) -> dict[str, BGMetric]:
        """Fetch all endpoints in a tier in parallel."""
        if tier not in TIERS:
            raise ValueError(f"unknown tier: {tier}. valid: {list(TIERS)}")
        endpoints = TIERS[tier]
        results = await asyncio.gather(
            *(self.fetch(ep, force_refresh=force_refresh) for ep in endpoints)
        )
        return {m.key: m for m in results}

    async def fetch_all(self, force_refresh: bool = False) -> dict[str, BGMetric]:
        """Fetch all 23 endpoints in parallel. Used by AI Arena worker per report."""
        results = await asyncio.gather(
            *(self.fetch(ep, force_refresh=force_refresh) for ep in ALL_ENDPOINTS)
        )
        snapshot = {m.key: m for m in results}

        # Log summary
        ok_count = sum(1 for m in snapshot.values() if m.ok)
        stale_count = sum(1 for m in snapshot.values() if m.is_stale)
        logger.info(
            "BG snapshot: %d/%d ok, %d stale, %d failed",
            ok_count, len(snapshot), stale_count, len(snapshot) - ok_count,
        )
        return snapshot

    async def health_check(self) -> dict:
        """Quick health check — fetches mvrv-zscore, returns status."""
        metric = await self.fetch("mvrv-zscore", force_refresh=True)
        return {
            "ok": metric.ok,
            "value": metric.value,
            "timestamp": metric.timestamp,
            "error": metric.error,
            "has_redis": HAS_REDIS,
            "has_token": bool(self.token),
        }


# ─── Module-level singleton (optional convenience) ────────────────────
_default_client: BGClient | None = None


def get_client() -> BGClient:
    """Return shared default client instance."""
    global _default_client
    if _default_client is None:
        _default_client = BGClient()
    return _default_client
