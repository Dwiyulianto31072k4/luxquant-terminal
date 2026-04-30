# backend/app/services/macro_data.py
"""
LuxQuant AI Arena v5 — Macro Data Layer
=========================================
Tracks macro assets that correlate with BTC price action.

Source: Yahoo Finance (free, no API key needed)
  - yfinance Python lib wraps the Yahoo endpoints
  - Fallback: direct Yahoo chart API if yfinance fails

Assets tracked:
  - DXY (^DXY): US Dollar Index — typically inverse to BTC
  - SPX (^GSPC): S&P 500 — post-ETF era, positive correlation
  - Gold (GC=F): Gold futures — diversification gauge
  - 10Y Treasury (^TNX): 10-year yield — risk-on/risk-off

Computed metrics:
  - Current price + 1D/7D/30D change
  - 30D rolling Pearson correlation vs BTC
  - Macro regime classification (risk_on / risk_off / mixed)

All functions return None on failure — never raise.
"""

import time
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple

TIMEOUT = 15
YAHOO_CHART_API = "https://query1.finance.yahoo.com/v8/finance/chart"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0"

# Yahoo symbols — keep list small & curated
MACRO_SYMBOLS = {
    "dxy":    {"symbol": "DX-Y.NYB",   "label": "US Dollar Index"},
    "spx":    {"symbol": "^GSPC",      "label": "S&P 500"},
    "gold":   {"symbol": "GC=F",       "label": "Gold"},
    "us10y":  {"symbol": "^TNX",       "label": "US 10Y Yield"},
}

BTC_SYMBOL = "BTC-USD"

# Cache: Yahoo rate-limits aggressive polling; 30 min is safe.
CACHE_TTL = 1800
_cache = {"data": None, "fetched_at": 0}


def _log(msg):
    print(f"  [macro-data] {msg}")


# ═══════════════════════════════════════════
# Yahoo Finance chart API (daily candles)
# ═══════════════════════════════════════════

def fetch_yahoo_history(symbol: str, days: int = 45) -> Optional[List[Dict]]:
    """
    Fetch daily closes for `days` days back.
    Returns list of {date, close} sorted ascending, or None on failure.
    """
    # Use period1/period2 (unix seconds)
    period2 = int(time.time())
    period1 = period2 - (days * 86400)

    params = {
        "period1": period1,
        "period2": period2,
        "interval": "1d",
        "events": "history",
    }

    try:
        r = requests.get(
            f"{YAHOO_CHART_API}/{symbol}",
            params=params,
            headers={"User-Agent": UA},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            _log(f"{symbol} HTTP {r.status_code}")
            return None

        j = r.json()
        result = j.get("chart", {}).get("result")
        if not result:
            _log(f"{symbol} empty chart result")
            return None

        res = result[0]
        timestamps = res.get("timestamp", []) or []
        closes = (res.get("indicators", {}).get("quote", [{}])[0] or {}).get("close", []) or []

        history = []
        for ts, close in zip(timestamps, closes):
            if close is None:
                continue
            history.append({
                "date": datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d"),
                "close": float(close),
            })
        return history
    except Exception as e:
        _log(f"{symbol} failed: {e}")
        return None


# ═══════════════════════════════════════════
# Pearson correlation (no numpy dependency)
# ═══════════════════════════════════════════

def pearson_correlation(xs: List[float], ys: List[float]) -> Optional[float]:
    """Simple Pearson correlation implementation."""
    if len(xs) != len(ys) or len(xs) < 3:
        return None

    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n

    cov = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)

    if var_x == 0 or var_y == 0:
        return None

    return cov / ((var_x * var_y) ** 0.5)


def align_by_date(series_a: List[Dict], series_b: List[Dict]) -> Tuple[List[float], List[float]]:
    """Align two date-close series on matching dates. Returns (xs, ys)."""
    b_map = {r["date"]: r["close"] for r in series_b}
    xs, ys = [], []
    for ra in series_a:
        if ra["date"] in b_map:
            xs.append(ra["close"])
            ys.append(b_map[ra["date"]])
    return xs, ys


# ═══════════════════════════════════════════
# Asset snapshot builder
# ═══════════════════════════════════════════

def build_asset_snapshot(history: List[Dict]) -> Optional[Dict]:
    """From daily history, compute current price + 1D / 7D / 30D change."""
    if not history or len(history) < 2:
        return None

    current = history[-1]["close"]
    prev_1d = history[-2]["close"] if len(history) >= 2 else None
    prev_7d = history[-8]["close"] if len(history) >= 8 else None
    prev_30d = history[0]["close"] if len(history) >= 30 else history[0]["close"]

    def pct_change(now, then):
        if not then or then == 0:
            return None
        return round((now - then) / then * 100, 2)

    return {
        "current": round(current, 2),
        "change_1d_pct": pct_change(current, prev_1d),
        "change_7d_pct": pct_change(current, prev_7d),
        "change_30d_pct": pct_change(current, prev_30d),
    }


# ═══════════════════════════════════════════
# Top-level Macro Pulse
# ═══════════════════════════════════════════

def fetch_macro_pulse(force_refresh: bool = False) -> Optional[Dict]:
    """
    Main entry point. Fetches all macro assets + BTC history,
    computes snapshots + 30D rolling correlations.

    Returns:
        {
          "btc": {"current": 75000, "change_1d_pct": 1.2, ...},
          "assets": {
            "dxy":   {"current": ..., "correlation_30d": -0.65, "label": "..."},
            "spx":   {"current": ..., "correlation_30d":  0.54, "label": "..."},
            "gold":  {...},
            "us10y": {...},
          },
          "regime": "risk_on" | "risk_off" | "mixed",
          "regime_detail": "SPX strong, DXY weakening, Gold flat",
          "updated_at": "2026-04-23T03:20:00Z",
        }
        or None on failure.
    """
    global _cache
    now = time.time()
    if not force_refresh and _cache["data"] and (now - _cache["fetched_at"] < CACHE_TTL):
        return _cache["data"]

    # Fetch BTC baseline (Yahoo)
    btc_history = fetch_yahoo_history(BTC_SYMBOL, days=45)
    if not btc_history or len(btc_history) < 10:
        _log("BTC history insufficient, aborting")
        return None

    btc_snapshot = build_asset_snapshot(btc_history)
    if not btc_snapshot:
        return None

    # Fetch each macro asset
    assets_out = {}
    for key, cfg in MACRO_SYMBOLS.items():
        history = fetch_yahoo_history(cfg["symbol"], days=45)
        if not history:
            continue
        snap = build_asset_snapshot(history)
        if not snap:
            continue
        # Correlation vs BTC (30D window)
        xs, ys = align_by_date(btc_history[-30:], history[-30:])
        corr = pearson_correlation(xs, ys)

        assets_out[key] = {
            **snap,
            "symbol": cfg["symbol"],
            "label": cfg["label"],
            "correlation_30d": round(corr, 3) if corr is not None else None,
        }

    if not assets_out:
        _log("no assets fetched")
        return None

    # Regime classification: simple heuristic
    regime, detail = classify_regime(assets_out, btc_snapshot)

    data = {
        "btc": btc_snapshot,
        "assets": assets_out,
        "regime": regime,
        "regime_detail": detail,
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "source": "yahoo_finance",
    }

    _cache = {"data": data, "fetched_at": now}
    _log(f"OK regime={regime} SPX={assets_out.get('spx', {}).get('change_1d_pct')}% "
         f"DXY={assets_out.get('dxy', {}).get('change_1d_pct')}%")
    return data


def classify_regime(assets: Dict, btc: Dict) -> Tuple[str, str]:
    """
    Classify macro regime based on asset movements.

    risk_on: equities up, dollar down, yields stable/up moderately
    risk_off: equities down, dollar up, gold up, yields down (flight to safety)
    mixed: conflicting signals
    """
    spx = assets.get("spx", {})
    dxy = assets.get("dxy", {})
    gold = assets.get("gold", {})
    us10y = assets.get("us10y", {})

    spx_1d = spx.get("change_1d_pct") or 0
    dxy_1d = dxy.get("change_1d_pct") or 0
    gold_1d = gold.get("change_1d_pct") or 0
    y10_1d = us10y.get("change_1d_pct") or 0

    # Scoring
    risk_on_score = 0
    risk_off_score = 0

    # SPX up => risk on
    if spx_1d > 0.3:
        risk_on_score += 2
    elif spx_1d < -0.3:
        risk_off_score += 2

    # DXY up => risk off (USD strength)
    if dxy_1d > 0.3:
        risk_off_score += 1
    elif dxy_1d < -0.3:
        risk_on_score += 1

    # Gold up + SPX down => risk off (flight to safety)
    if gold_1d > 0.5 and spx_1d < 0:
        risk_off_score += 1

    # 10Y dropping hard => risk off (flight to bonds)
    if y10_1d < -1.0:
        risk_off_score += 1
    elif y10_1d > 1.0:
        risk_on_score += 1

    if risk_on_score > risk_off_score + 1:
        regime = "risk_on"
    elif risk_off_score > risk_on_score + 1:
        regime = "risk_off"
    else:
        regime = "mixed"

    # Build human-readable detail
    pieces = []
    if spx_1d:
        pieces.append(f"SPX {spx_1d:+.2f}%")
    if dxy_1d:
        pieces.append(f"DXY {dxy_1d:+.2f}%")
    if gold_1d:
        pieces.append(f"Gold {gold_1d:+.2f}%")
    detail = ", ".join(pieces) if pieces else "no data"

    return regime, detail
