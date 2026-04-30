# backend/app/services/onchain_extra.py
"""
LuxQuant AI Arena v5 — Additional On-Chain Metrics
===================================================
Supplements existing BGeometrics on-chain data with:

  - STH-MVRV: Short-term holder MVRV (most reactive bottom/top signal)
  - Puell Multiple: Miner revenue cycle indicator (bottom/top zones)
  - Exchange Reserve trend: Structural supply change over 30 days

Source: BGeometrics (https://bitcoin-data.com), free public API.

Rate-limit strategy:
  bitcoin-data.com aggressively returns HTTP 429 on consecutive
  requests from the same IP. On-chain metrics, however, only
  update once per day, so we cache aggressively in Redis (12 h TTL)
  with a stale-OK fallback for an additional 24 h. Effect:
  worst case we make ~1 successful round-trip per day per metric.

Logic:
  1. Try Redis fresh cache (12 h)
  2. Try fresh fetch from BGeometrics
  3. On 429 / failure → return stale cached value (up to 36 h old)
  4. If no stale either → return None (AI report still works,
     it just shows fewer signals — these are EXTRAS, not core)

All functions return None on failure — never raise.
"""

import time
import json
import requests
from typing import Optional, Dict, List

from app.core.redis import cache_get, cache_set, get_redis

BGEOMETRICS_BASE = "https://bitcoin-data.com/v1"
TIMEOUT = 15
INTER_REQUEST_SLEEP = 2.0   # seconds between BGeometrics requests
FRESH_TTL    = 12 * 3600    # 12 hours — fresh data
STALE_TTL    = 36 * 3600    # 36 hours — accept stale fallback
CACHE_PREFIX = "lq:onchain-extra"


def _log(msg):
    print(f"  [onchain-extra] {msg}")


# ═══════════════════════════════════════════
# Cache wrapper
# ═══════════════════════════════════════════

def _cache_key(metric: str) -> str:
    return f"{CACHE_PREFIX}:{metric}"


def _stale_key(metric: str) -> str:
    return f"{CACHE_PREFIX}:stale:{metric}"


def _cache_read_fresh(metric: str) -> Optional[Dict]:
    """Return fresh cached value if available."""
    try:
        return cache_get(_cache_key(metric))
    except Exception:
        return None


def _cache_read_stale(metric: str) -> Optional[Dict]:
    """Return stale cached value (up to 36 h old) for fallback."""
    try:
        return cache_get(_stale_key(metric))
    except Exception:
        return None


def _cache_write(metric: str, value: Dict):
    """Write fresh + stale (long-lived) copies."""
    try:
        cache_set(_cache_key(metric), value, ttl=FRESH_TTL)
        cache_set(_stale_key(metric), value, ttl=STALE_TTL)
    except Exception as e:
        _log(f"cache write failed for {metric}: {e}")


# ═══════════════════════════════════════════
# Low-level HTTP fetch (with 429 awareness)
# ═══════════════════════════════════════════

def _bg_get(metric: str) -> Optional[List]:
    """Single GET with graceful 429 / error handling."""
    try:
        r = requests.get(f"{BGEOMETRICS_BASE}/{metric}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        elif r.status_code == 429:
            _log(f"{metric} rate limited (429)")
        else:
            _log(f"{metric} HTTP {r.status_code}")
    except Exception as e:
        _log(f"{metric} failed: {e}")
    return None


def _bg_first_match(candidates: List[str]) -> Optional[List]:
    """Try candidate slugs in order, return first 200 OK. Pause briefly between."""
    for i, ep in enumerate(candidates):
        if i > 0:
            time.sleep(0.6)
        data = _bg_get(ep)
        if data is not None:
            return data
    return None


# ═══════════════════════════════════════════
# Cached fetch helper
# ═══════════════════════════════════════════

def _cached_fetch(metric_name: str, candidates: List[str], parser) -> Optional[Dict]:
    """
    Generic cache-first fetch:
      1. Try fresh cache
      2. Try fetch + parse + cache
      3. Fall back to stale cache (up to 36 h)
      4. Return None
    """
    # Step 1: fresh cache
    fresh = _cache_read_fresh(metric_name)
    if fresh:
        _log(f"{metric_name} from cache (fresh)")
        return fresh

    # Step 2: fetch + parse
    raw = _bg_first_match(candidates)
    if raw:
        try:
            parsed = parser(raw)
            if parsed:
                _cache_write(metric_name, parsed)
                _log(f"{metric_name} fetched + cached")
                return parsed
        except Exception as e:
            _log(f"{metric_name} parser failed: {e}")

    # Step 3: stale fallback
    stale = _cache_read_stale(metric_name)
    if stale:
        _log(f"{metric_name} using STALE cache (BGeometrics unavailable)")
        return stale

    return None


# ═══════════════════════════════════════════
# 1. STH-MVRV (Short-Term Holder MVRV)
# ═══════════════════════════════════════════
# Zones:
#  < 0.95 = capitulation (strong buy zone)
#  < 1.0  = loss (bottom zone)
#  ~1.0   = pivot
#  < 1.2  = profit
#  >= 1.2 = euphoria (top zone)

def _parse_sth_mvrv(data: List) -> Optional[Dict]:
    if not data:
        return None
    latest = data[-1]
    v = latest.get("sthMvrv", latest.get("mvrv", latest.get("value")))
    if v is None:
        return None
    try:
        v = float(v)
    except (ValueError, TypeError):
        return None
    return {
        "date": latest.get("d"),
        "sth_mvrv": round(v, 3),
        "zone": _classify_sth_mvrv(v),
    }


def _classify_sth_mvrv(v: float) -> str:
    if v < 0.95:
        return "capitulation"
    elif v < 1.0:
        return "loss"
    elif v < 1.08:
        return "pivot"
    elif v < 1.2:
        return "profit"
    else:
        return "euphoria"


def fetch_sth_mvrv() -> Optional[Dict]:
    return _cached_fetch(
        "sth_mvrv",
        ["sth-mvrv", "short-term-holder-mvrv", "sth_mvrv"],
        _parse_sth_mvrv,
    )


# ═══════════════════════════════════════════
# 2. Puell Multiple
# ═══════════════════════════════════════════
# Zones:
#  < 0.5  = miner_capitulation (cycle-bottom signal)
#  < 1    = undervalued
#  < 2    = normal
#  < 4    = caution
#  >= 4   = cycle_top_risk

def _parse_puell(data: List) -> Optional[Dict]:
    if not data:
        return None
    latest = data[-1]
    v = latest.get("puellMultiple", latest.get("puell", latest.get("value")))
    if v is None:
        return None
    try:
        v = float(v)
    except (ValueError, TypeError):
        return None
    return {
        "date": latest.get("d"),
        "puell": round(v, 3),
        "zone": _classify_puell(v),
    }


def _classify_puell(v: float) -> str:
    if v < 0.5:
        return "miner_capitulation"
    elif v < 1.0:
        return "undervalued"
    elif v < 2.0:
        return "normal"
    elif v < 4.0:
        return "caution"
    else:
        return "cycle_top_risk"


def fetch_puell_multiple() -> Optional[Dict]:
    return _cached_fetch(
        "puell",
        ["puell-multiple", "puell_multiple", "puell"],
        _parse_puell,
    )


# ═══════════════════════════════════════════
# 3. Exchange Reserve Trend (30-day)
# ═══════════════════════════════════════════

def _parse_reserve_trend(data: List) -> Optional[Dict]:
    if not data or len(data) < 30:
        return None

    series = []
    for row in data:
        v = row.get("exchangeReserve", row.get("reserve", row.get("value")))
        d = row.get("d", row.get("date"))
        if v is None or d is None:
            continue
        try:
            series.append({"date": d, "reserve": float(v)})
        except (ValueError, TypeError):
            continue

    if len(series) < 30:
        return None

    series.sort(key=lambda r: r["date"])
    latest = series[-1]
    ref = series[-30]
    if ref["reserve"] == 0:
        return None

    delta_pct = (latest["reserve"] - ref["reserve"]) / ref["reserve"] * 100
    if delta_pct < -3.0:
        trend = "strong_outflow"
    elif delta_pct < -1.0:
        trend = "outflow"
    elif delta_pct > 3.0:
        trend = "strong_inflow"
    elif delta_pct > 1.0:
        trend = "inflow"
    else:
        trend = "stable"

    return {
        "date": latest["date"],
        "current_reserve_btc": round(latest["reserve"], 0),
        "reserve_30d_ago_btc": round(ref["reserve"], 0),
        "change_30d_pct": round(delta_pct, 2),
        "trend": trend,
    }


def fetch_exchange_reserve_trend() -> Optional[Dict]:
    return _cached_fetch(
        "exchange_reserve_trend",
        ["exchange-reserve", "exchange_reserve", "exchange-balance", "exchanges-net-position-change"],
        _parse_reserve_trend,
    )


# ═══════════════════════════════════════════
# 4. Top-level bundle
# ═══════════════════════════════════════════

def fetch_onchain_extras() -> Dict:
    """
    Fetch all extras with sleep between calls + Redis cache + stale fallback.
    Returns whatever subset succeeded.
    """
    result = {}

    sth = fetch_sth_mvrv()
    if sth:
        result["sth_mvrv"] = sth

    time.sleep(INTER_REQUEST_SLEEP)

    puell = fetch_puell_multiple()
    if puell:
        result["puell"] = puell

    time.sleep(INTER_REQUEST_SLEEP)

    er = fetch_exchange_reserve_trend()
    if er:
        result["exchange_reserve_trend"] = er

    return result
