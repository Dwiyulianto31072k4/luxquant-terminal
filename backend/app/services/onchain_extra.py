# backend/app/services/onchain_extra.py
"""
LuxQuant AI Arena v5 — Additional On-Chain Metrics
===================================================
Supplements existing BGeometrics on-chain data with:

  - STH-MVRV: Short-term holder MVRV (most reactive bottom/top signal)
  - Puell Multiple: Miner revenue cycle indicator (bottom/top zones)
  - Exchange Reserve trend: Structural supply change over 30 days

All sourced from BGeometrics (free public API, no key).

Rate-limit notes:
  bitcoin-data.com aggressively returns HTTP 429 if multiple endpoints
  are hit in quick succession. We add a small inter-request sleep, and
  treat 429 as a graceful skip (returning None for that one metric)
  instead of failing the whole module. The first metric usually
  succeeds, the rest may be 429 — the AI report still benefits from
  whatever subset comes back.

All functions return None on failure — never raise.
"""

import time
import requests
from typing import Optional, Dict, List

BGEOMETRICS_BASE = "https://bitcoin-data.com/v1"
TIMEOUT = 15
INTER_REQUEST_SLEEP = 1.5  # seconds between BGeometrics requests


def _log(msg):
    print(f"  [onchain-extra] {msg}")


def _bg_get(metric: str) -> Optional[List]:
    """Single GET with graceful 429 handling."""
    try:
        r = requests.get(f"{BGEOMETRICS_BASE}/{metric}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        elif r.status_code == 429:
            _log(f"{metric} rate limited (429), skipping")
        else:
            _log(f"{metric} HTTP {r.status_code}")
    except Exception as e:
        _log(f"{metric} failed: {e}")
    return None


def _bg_first_match(candidates: List[str]) -> Optional[List]:
    """Try a list of slug candidates, return first that works.
    Sleep briefly between attempts to avoid 429."""
    for i, ep in enumerate(candidates):
        if i > 0:
            time.sleep(0.6)  # short pause between candidate attempts
        data = _bg_get(ep)
        if data is not None:
            return data
    return None


# ═══════════════════════════════════════════
# 1. STH-MVRV (Short-Term Holder MVRV)
# ═══════════════════════════════════════════
# Zones:
#  < 0.95 = capitulation (strong buy zone)
#  < 1.0  = loss (bottom zone)
#  ~1.0   = pivot (break-even)
#  < 1.2  = profit (healthy)
#  >= 1.2 = euphoria (top zone)

def fetch_sth_mvrv() -> Optional[Dict]:
    data = _bg_first_match(["sth-mvrv", "short-term-holder-mvrv", "sth_mvrv"])
    if not data:
        return None
    latest = data[-1] if data else None
    if not latest:
        return None
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


# ═══════════════════════════════════════════
# 2. Puell Multiple
# ═══════════════════════════════════════════
# Zones:
#  < 0.5  = miner_capitulation (cycle-bottom signal)
#  < 1    = undervalued
#  < 2    = normal
#  < 4    = caution
#  >= 4   = cycle_top_risk

def fetch_puell_multiple() -> Optional[Dict]:
    data = _bg_first_match(["puell-multiple", "puell_multiple", "puell"])
    if not data:
        return None
    latest = data[-1] if data else None
    if not latest:
        return None
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


# ═══════════════════════════════════════════
# 3. Exchange Reserve Trend (30-day)
# ═══════════════════════════════════════════

def fetch_exchange_reserve_trend() -> Optional[Dict]:
    data = _bg_first_match([
        "exchange-reserve",
        "exchange_reserve",
        "exchange-balance",
        "exchanges-net-position-change",
    ])
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


# ═══════════════════════════════════════════
# 4. Top-level bundle (with rate-limit-friendly pacing)
# ═══════════════════════════════════════════

def fetch_onchain_extras() -> Dict:
    """
    Fetch all extras with sleep between calls to avoid BGeometrics 429.
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
