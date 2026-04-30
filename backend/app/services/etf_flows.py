# backend/app/services/etf_flows.py
"""
LuxQuant AI Arena v5 — ETF Flows Data Layer (CoinGlass-backed)
================================================================
Institutional spot BTC ETF flow tracking via CoinGlass v3 API.

Sources:
  - Primary: CoinGlass /api/bitcoin/etf/flow-history (uses existing API key)
  - Coinbase Premium: Coinbase Exchange ticker vs Binance ticker

Why not Farside (the original plan):
  Farside Investors blocks datacenter IP ranges (Hetzner/DigitalOcean/etc)
  with 403 anti-bot. CoinGlass returns the same daily-flow + per-fund
  breakdown via JSON API and we already have a working API key.

All functions return None/[] on failure — never raise.
"""

import os
import time
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, List

# ═══════════════════════════════════════════
# Config
# ═══════════════════════════════════════════

COINGLASS_API = "https://open-api-v3.coinglass.com"
COINGLASS_KEY = os.getenv("COINGLASS_API_KEY", "")

COINBASE_TICKER = "https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD"
BINANCE_TICKER = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"

TIMEOUT = 15
CACHE_TTL = 1800  # 30 min — ETF data updates ~once per day, no need to re-fetch often

# In-memory cache
_cache = {"data": None, "fetched_at": 0}


def _log(msg):
    print(f"  [etf-flows] {msg}")


# ═══════════════════════════════════════════
# 1. CoinGlass ETF Flow History
# ═══════════════════════════════════════════

def fetch_coinglass_etf_flows(force_refresh: bool = False) -> Optional[Dict]:
    """
    Fetch BTC spot ETF daily flow history via CoinGlass v3.

    Endpoint: GET /api/bitcoin/etf/flow-history
    Returns daily array, each row contains:
      - date (unix ms)
      - changeUsd (total net flow USD)
      - price / closePrice (BTC ref price that day)
      - list: [{ticker, changeUsd}, ...] per-fund breakdown

    Returns dict with same shape as the previous Farside-backed module,
    so worker + frontend don't need to change.
    """
    global _cache
    now = time.time()

    if not force_refresh and _cache["data"] and (now - _cache["fetched_at"] < CACHE_TTL):
        _log("using cached data")
        return _cache["data"]

    if not COINGLASS_KEY:
        _log("no COINGLASS_API_KEY in env — skipping")
        return None

    headers = {
        "accept": "application/json",
        "CG-API-KEY": COINGLASS_KEY,
    }

    try:
        r = requests.get(
            f"{COINGLASS_API}/api/bitcoin/etf/flow-history",
            headers=headers,
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            _log(f"HTTP {r.status_code}")
            return None

        j = r.json()
        if j.get("code") != "0":
            _log(f"API code={j.get('code')} msg={j.get('msg')}")
            return None

        rows = j.get("data") or []
        if not rows:
            _log("empty data array")
            return None

    except Exception as e:
        _log(f"fetch failed: {e}")
        return None

    # Normalize rows
    parsed = []
    for r_ in rows:
        try:
            ts_ms = int(r_.get("date", 0))
            if ts_ms <= 0:
                continue
            date_str = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            total_usd = float(r_.get("changeUsd", 0) or 0)
            total_m = round(total_usd / 1_000_000, 2)  # convert USD → millions
            per_fund = {}
            for f in (r_.get("list") or []):
                ticker = f.get("ticker")
                v = f.get("changeUsd", 0) or 0
                if ticker:
                    per_fund[ticker] = round(float(v) / 1_000_000, 2)
            parsed.append({
                "date": date_str,
                "total": total_m,
                "per_fund": per_fund,
            })
        except (ValueError, TypeError, KeyError):
            continue

    if not parsed:
        _log("no rows parsed")
        return None

    # Sort by date ascending (oldest first)
    parsed.sort(key=lambda r_: r_["date"])

    last_30 = parsed[-30:]
    last_7 = parsed[-7:]
    latest = parsed[-1]

    # Streak: count consecutive same-direction days from latest backwards
    streak_direction = None
    streak_days = 0
    for row in reversed(last_30):
        if row["total"] is None or row["total"] == 0:
            continue
        direction = "inflow" if row["total"] > 0 else "outflow"
        if streak_direction is None:
            streak_direction = direction
            streak_days = 1
        elif direction == streak_direction:
            streak_days += 1
        else:
            break

    cum_7d = sum((r_["total"] or 0) for r_ in last_7)
    cum_30d = sum((r_["total"] or 0) for r_ in last_30)

    # Top contributors today (by absolute flow magnitude)
    top_contributors = sorted(
        [(k, v) for k, v in (latest.get("per_fund") or {}).items() if v is not None],
        key=lambda kv: abs(kv[1]),
        reverse=True,
    )[:3]

    data = {
        "last_date": latest["date"],
        "last_total": latest["total"],
        "last_per_fund": latest["per_fund"],
        "top_contributors": [{"fund": f, "flow": v} for f, v in top_contributors],
        "history_7d": last_7,
        "history_30d": last_30,
        "streak": {"direction": streak_direction, "days": streak_days},
        "cumulative_7d": round(cum_7d, 1),
        "cumulative_30d": round(cum_30d, 1),
        "source": "coinglass",
    }

    _cache = {"data": data, "fetched_at": now}
    _log(f"OK last={latest['date']} total=${latest['total']}M "
         f"streak={streak_direction} {streak_days}d cum7d=${cum_7d:.0f}M")
    return data


# Backward-compat alias (old name expected by some imports)
def fetch_farside_etf_flows(force_refresh: bool = False) -> Optional[Dict]:
    """Compat wrapper. Source is now CoinGlass, but the shape is identical."""
    return fetch_coinglass_etf_flows(force_refresh=force_refresh)


# ═══════════════════════════════════════════
# 2. Coinbase Premium Index
# ═══════════════════════════════════════════

def fetch_coinbase_premium() -> Optional[Dict]:
    """
    Coinbase Premium = (Coinbase BTC-USD - Binance BTCUSDT) / Binance * 100

    Interpretation:
      - Positive premium: US institutional buying pressure (Coinbase paying up)
      - Negative premium: US selling / offshore buying
      - Sustained premium > 0.1% historically aligns with strong accumulation phases
    """
    cb_price = 0.0
    bn_price = 0.0

    try:
        cb_r = requests.get(COINBASE_TICKER, timeout=TIMEOUT)
        cb_data = cb_r.json()
        cb_price = float(cb_data.get("price", 0) or 0)
    except Exception as e:
        _log(f"coinbase failed: {e}")

    try:
        bn_r = requests.get(BINANCE_TICKER, timeout=TIMEOUT)
        bn_data = bn_r.json()
        bn_price = float(bn_data.get("price", 0) or 0)
    except Exception as e:
        _log(f"binance failed: {e}")

    if cb_price <= 0 or bn_price <= 0:
        _log("missing one or both prices, skipping premium calc")
        return None

    premium = (cb_price - bn_price) / bn_price * 100

    if premium > 0.1:
        signal = "strong_buying"
    elif premium > 0.02:
        signal = "mild_buying"
    elif premium < -0.1:
        signal = "strong_selling"
    elif premium < -0.02:
        signal = "mild_selling"
    else:
        signal = "neutral"

    return {
        "coinbase_price": round(cb_price, 2),
        "binance_price": round(bn_price, 2),
        "premium_pct": round(premium, 4),
        "signal": signal,
    }


# ═══════════════════════════════════════════
# 3. Top-level Combined Report
# ═══════════════════════════════════════════

def fetch_etf_summary() -> Dict:
    """
    Top-level entry point used by the AI Arena worker.
    Returns combined ETF flows + Coinbase Premium snapshot. Never raises.
    """
    result = {}

    flows = fetch_coinglass_etf_flows()
    if flows:
        result["flows"] = flows

    premium = fetch_coinbase_premium()
    if premium:
        result["coinbase_premium"] = premium

    return result
