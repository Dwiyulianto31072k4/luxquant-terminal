"""
BGeometrics Advanced API client for AI Arena v6.

Wraps all 24 endpoints across 5 tiers used by the AI Arena worker:
- Tier 1 Cycle Position (5)        : MVRV-Z, Puell, Mayer, Pi-Cycle, Reserve Risk
- Tier 2 Macro Liquidity (4)       : M2 Global, M2 YoY, SSR, SSR Oscillator
- Tier 3 Smart Money (5)           : Top traders L/S, Funding, Basis, Taker volume
- Tier 4 On-chain Behavior (6)     : NUPL, SOPR, STH-MVRV, Miner flow, Exchange netflow, Hashribbons
- Tier 5 Volatility & Risk (4)     : Volatility, Open Interest, Liquidations, Fear & Greed

Quota: 200 req/h, 400 req/day (Advanced tier).
Cache strategy: 6h fresh + 24h stale fallback (Redis).

Usage:
    from app.services.bg_advanced import BGClient

    bg = BGClient()
    snapshot = await bg.fetch_all()  # returns dict with 24 metrics
    cycle = await bg.fetch_tier("cycle")  # specific tier only
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from typing import Any

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

# Optional Redis dependency — degrades to no-cache if unavailable
try:
    from app.core.redis import redis_client  # type: ignore
    HAS_REDIS = redis_client is not None
except Exception:
    redis_client = None
    HAS_REDIS = False


# ─── Endpoint registry ────────────────────────────────────────────────
TIER_CYCLE = ("mvrv-zscore", "puell-multiple", "mayer-multiple", "pi-cycle", "reserve-risk")
TIER_MACRO = ("m2global", "m2yoy-change", "ssr", "ssr-oscillator")
TIER_SMART = ("top-trader-position-1h", "top-trader-account-1h", "funding-rate",
              "btc-derivatives-basis-1h", "taker-vol-1h")
TIER_ONCHAIN = ("nupl", "sopr", "sth-mvrv", "miner-net-flow", "exchange-netflow-btc", "hashribbons")
TIER_RISK = ("volatility", "open-interest", "liquidations", "fear-greed")

TIERS: dict[str, tuple[str, ...]] = {
    "cycle": TIER_CYCLE,
    "macro": TIER_MACRO,
    "smart": TIER_SMART,
    "onchain": TIER_ONCHAIN,
    "risk": TIER_RISK,
}

ALL_ENDPOINTS = TIER_CYCLE + TIER_MACRO + TIER_SMART + TIER_ONCHAIN + TIER_RISK  # 24 total


# ─── Data structures ──────────────────────────────────────────────────
@dataclass
class BGMetric:
    """Normalized BGeometrics metric response."""
    key: str
    value: Any = None
    timestamp: int | None = None     # source data timestamp (unix ms)
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
        raw = await redis_client.get(_cache_key(endpoint))  # type: ignore
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


async def _cache_set(metric: BGMetric) -> None:
    if not HAS_REDIS or not metric.ok:
        return
    try:
        await redis_client.set(  # type: ignore
            _cache_key(metric.key),
            json.dumps(metric.to_dict(), default=str),
            ex=CACHE_TTL_STALE,
        )
    except Exception as e:
        logger.warning("BG cache write failed for %s: %s", metric.key, e)


# ─── Response normalization ───────────────────────────────────────────
def _normalize(endpoint: str, raw: Any) -> tuple[Any, int | None]:
    """
    BGeometrics endpoints return varied shapes. Normalize to (value, timestamp).

    Common shapes:
    - {"value": 0.76, "t": 1714502400000}
    - [{"x": 1714502400000, "y": 0.76}]
    - {"data": {...}}
    - bare number / string

    Returns (None, None) if cannot extract.
    """
    if raw is None:
        return None, None

    # Bare scalar
    if isinstance(raw, (int, float, str, bool)):
        return raw, None

    # List of points — take last
    if isinstance(raw, list):
        if not raw:
            return None, None
        last = raw[-1]
        if isinstance(last, dict):
            value = last.get("y") or last.get("value") or last.get("v")
            ts = last.get("x") or last.get("t") or last.get("timestamp")
            return value, ts
        return last, None

    # Dict — try common keys
    if isinstance(raw, dict):
        # Direct value
        for k in ("value", "v", "y", "data"):
            if k in raw and not isinstance(raw[k], (dict, list)):
                ts = raw.get("t") or raw.get("timestamp") or raw.get("x")
                return raw[k], ts

        # Nested data
        if "data" in raw and isinstance(raw["data"], (list, dict)):
            return _normalize(endpoint, raw["data"])

        # Endpoint-specific shapes
        if endpoint == "hashribbons":
            return raw.get("status") or raw.get("signal") or raw.get("trend"), raw.get("t")

        if endpoint == "fear-greed":
            return raw.get("score") or raw.get("value") or raw.get("fgi"), raw.get("t")

        # Last resort: first non-meta numeric
        for k, v in raw.items():
            if k in ("t", "timestamp", "date") or v is None:
                continue
            if isinstance(v, (int, float, str)):
                ts = raw.get("t") or raw.get("timestamp")
                return v, ts

    return None, None


# ─── HTTP fetch ───────────────────────────────────────────────────────
async def _http_fetch(client: httpx.AsyncClient, endpoint: str) -> BGMetric:
    """Single endpoint HTTP fetch with retry. Does not touch cache."""
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
            if resp.status_code in (429, 503):
                # rate limit / temporarily unavailable — back off
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
        fetch_all()             → all 24 endpoints (parallel)
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

    async def fetch_tier(self, tier: str) -> dict[str, BGMetric]:
        """Fetch all endpoints in a tier in parallel."""
        if tier not in TIERS:
            raise ValueError(f"unknown tier: {tier}. valid: {list(TIERS)}")
        endpoints = TIERS[tier]
        results = await asyncio.gather(*(self.fetch(ep) for ep in endpoints))
        return {m.key: m for m in results}

    async def fetch_all(self) -> dict[str, BGMetric]:
        """Fetch all 24 endpoints in parallel. Used by AI Arena worker per report."""
        results = await asyncio.gather(*(self.fetch(ep) for ep in ALL_ENDPOINTS))
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
