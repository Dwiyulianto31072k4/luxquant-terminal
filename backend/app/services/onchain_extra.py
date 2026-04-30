# backend/app/services/onchain_extra.py
"""
LuxQuant AI Arena v5 — Additional On-Chain Metrics
===================================================
Supplements existing BGeometrics on-chain data with:

  - STH-MVRV: Short-term holder MVRV (most reactive bottom/top signal)
  - Puell Multiple: Miner revenue cycle indicator (bottom/top zones)
  - Exchange Reserve trend: Structural supply change over 30 days

All sourced from BGeometrics (free public API, no key).
Complements fetch_onchain_nupl, fetch_onchain_mvrv in ai_arena_data.py.

All functions return None on failure — never raise.
"""

import requests
from datetime import datetime
from typing import Optional, Dict, List

BGEOMETRICS_BASE = "https://bitcoin-data.com/v1"
TIMEOUT = 15


def _log(msg):
    print(f"  [onchain-extra] {msg}")


def _bg_get(metric: str) -> Optional[List]:
    try:
        r = requests.get(f"{BGEOMETRICS_BASE}/{metric}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        else:
            _log(f"{metric} HTTP {r.status_code}")
    except Exception as e:
        _log(f"{metric} failed: {e}")
    return None


# ═══════════════════════════════════════════
# 1. STH-MVRV (Short-Term Holder MVRV)
# ═══════════════════════════════════════════
# Zones:
#  < 1.0  = STH in aggregate loss (historically near local bottoms)
#  ~ 1.0  = break-even (pivot zone)
#  > 1.2  = STH in strong profit (froth / local top zone)

def fetch_sth_mvrv() -> Optional[Dict]:
    """
    STH-MVRV from BGeometrics. Try several endpoint names in case of naming variance.
    """
    candidates = ["sth-mvrv", "short-term-holder-mvrv", "sth_mvrv"]
    for ep in candidates:
        data = _bg_get(ep)
        if data and len(data) > 0:
            latest = data[-1]
            v = latest.get("sthMvrv", latest.get("mvrv", latest.get("value")))
            if v is None:
                continue
            v = float(v or 0)
            zone = _classify_sth_mvrv(v)
            return {
                "date": latest.get("d"),
                "sth_mvrv": round(v, 3),
                "zone": zone,
            }
    return None


def _classify_sth_mvrv(v: float) -> str:
    if v < 0.95:
        return "capitulation"      # Strong buy signal
    elif v < 1.0:
        return "loss"              # Bottom zone
    elif v < 1.08:
        return "pivot"             # Break-even, neutral
    elif v < 1.2:
        return "profit"            # Healthy profit
    else:
        return "euphoria"          # Froth / top zone


# ═══════════════════════════════════════════
# 2. Puell Multiple
# ═══════════════════════════════════════════
# Zones:
#  < 0.5  = miner capitulation (historical cycle bottoms)
#  0.5-1  = undervalued
#  1-2    = normal
#  2-4    = euphoria / caution
#  > 4    = cycle top risk

def fetch_puell_multiple() -> Optional[Dict]:
    candidates = ["puell-multiple", "puell_multiple", "puell"]
    for ep in candidates:
        data = _bg_get(ep)
        if data and len(data) > 0:
            latest = data[-1]
            v = latest.get("puellMultiple", latest.get("puell", latest.get("value")))
            if v is None:
                continue
            v = float(v or 0)
            zone = _classify_puell(v)
            return {
                "date": latest.get("d"),
                "puell": round(v, 3),
                "zone": zone,
            }
    return None


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
# Detects structural supply flowing OUT of exchanges (bullish)
# or INTO exchanges (bearish / distribution).

def fetch_exchange_reserve_trend() -> Optional[Dict]:
    """
    Fetch exchange reserve data, compute 30-day delta.
    Uses 'exchange-reserve' metric from BGeometrics.
    """
    candidates = ["exchange-reserve", "exchange_reserve"]
    for ep in candidates:
        data = _bg_get(ep)
        if not data or len(data) < 2:
            continue

        # Extract daily values
        series = []
        for row in data:
            # Try common field names
            v = row.get("exchangeReserve", row.get("reserve", row.get("value")))
            d = row.get("d", row.get("date"))
            if v is None or d is None:
                continue
            try:
                series.append({"date": d, "reserve": float(v)})
            except (ValueError, TypeError):
                continue

        if len(series) < 30:
            continue

        # Sort ascending by date
        series.sort(key=lambda r: r["date"])
        latest = series[-1]
        ref_30d = series[-30]

        current = latest["reserve"]
        before = ref_30d["reserve"]
        if before == 0:
            continue

        delta_pct = (current - before) / before * 100
        # Classify: significant outflow is bullish (supply shock potential)
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
            "current_reserve_btc": round(current, 0),
            "reserve_30d_ago_btc": round(before, 0),
            "change_30d_pct": round(delta_pct, 2),
            "trend": trend,
        }

    return None


# ═══════════════════════════════════════════
# 4. Top-level bundle
# ═══════════════════════════════════════════

def fetch_onchain_extras() -> Dict:
    """Fetch all extra on-chain metrics. Never raises, returns empty dict on total failure."""
    result = {}

    sth = fetch_sth_mvrv()
    if sth:
        result["sth_mvrv"] = sth

    puell = fetch_puell_multiple()
    if puell:
        result["puell"] = puell

    er = fetch_exchange_reserve_trend()
    if er:
        result["exchange_reserve_trend"] = er

    return result
