# backend/app/services/macro_data.py
"""
LuxQuant AI Arena v5 — Macro Data Layer (Stooq-backed)
========================================================
Tracks macro assets that correlate with BTC price action.

Source: stooq.com (free CSV downloads, no API key, no aggressive rate limits)
  - Direct CSV endpoints: /q/d/l/?s=<symbol>&i=d
  - Reliable from datacenter IPs (unlike Yahoo Finance which 429s)

Why not Yahoo Finance (the original plan):
  query1.finance.yahoo.com aggressively rate-limits scraper traffic.
  Returns HTTP 429 from typical VPS IPs even with browser headers.
  Stooq has no such issue and same data shape.

Assets tracked:
  - DXY  (^dxy)   : US Dollar Index — typically inverse to BTC
  - SPX  (^spx)   : S&P 500 — post-ETF era, positive correlation
  - Gold (gc.f)   : Gold futures — diversification gauge
  - US10Y (10usy.b): 10-year yield — risk-on/risk-off

Computed metrics:
  - Current price + 1D / 7D / 30D change
  - 30D rolling Pearson correlation vs BTC
  - Macro regime classification (risk_on / risk_off / mixed)

All functions return None on failure — never raise.
"""

import csv
import io
import time
import requests
from datetime import datetime
from typing import Optional, Dict, List, Tuple

TIMEOUT = 15
STOOQ_BASE = "https://stooq.com/q/d/l/"

# Stooq symbol mapping. `i=d` = daily candles.
MACRO_SYMBOLS = {
    "dxy":   {"symbol": "^dxy",     "label": "US Dollar Index"},
    "spx":   {"symbol": "^spx",     "label": "S&P 500"},
    "gold":  {"symbol": "gc.f",     "label": "Gold"},
    "us10y": {"symbol": "10usy.b",  "label": "US 10Y Yield"},
}

# Use Stooq's BTC. .v = market series. Format same CSV.
BTC_SYMBOL = "btc.v"

CACHE_TTL = 1800  # 30 min
_cache = {"data": None, "fetched_at": 0}


def _log(msg):
    print(f"  [macro-data] {msg}")


# ═══════════════════════════════════════════
# Stooq CSV fetcher
# ═══════════════════════════════════════════

def fetch_stooq_history(symbol: str, days: int = 60) -> Optional[List[Dict]]:
    """
    Fetch daily closes for a Stooq symbol.

    Stooq returns CSV with columns: Date,Open,High,Low,Close,Volume
    Most recent rows at the bottom (chronological ascending).

    Returns list of {date, close} dicts, last `days` entries, or None on failure.
    """
    try:
        r = requests.get(
            STOOQ_BASE,
            params={"s": symbol, "i": "d"},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            _log(f"{symbol} HTTP {r.status_code}")
            return None
        text = r.text
        # Stooq returns "No data" or empty CSV when symbol invalid
        if "no data" in text[:50].lower() or len(text) < 50:
            _log(f"{symbol} empty response")
            return None
    except Exception as e:
        _log(f"{symbol} fetch failed: {e}")
        return None

    # Parse CSV
    history = []
    try:
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            d = row.get("Date") or ""
            c = row.get("Close")
            if not d or c is None:
                continue
            try:
                close = float(c)
            except (ValueError, TypeError):
                continue
            history.append({"date": d, "close": close})
    except Exception as e:
        _log(f"{symbol} CSV parse failed: {e}")
        return None

    if not history:
        return None

    # Stooq is already chronological ascending. Take tail.
    return history[-days:]


# ═══════════════════════════════════════════
# Pearson correlation (no numpy dependency)
# ═══════════════════════════════════════════

def pearson_correlation(xs: List[float], ys: List[float]) -> Optional[float]:
    """Simple Pearson correlation."""
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
    """Align two date-close series on matching dates."""
    b_map = {r["date"]: r["close"] for r in series_b}
    xs, ys = [], []
    for ra in series_a:
        if ra["date"] in b_map:
            xs.append(ra["close"])
            ys.append(b_map[ra["date"]])
    return xs, ys


# ═══════════════════════════════════════════
# Snapshot builder
# ═══════════════════════════════════════════

def build_asset_snapshot(history: List[Dict]) -> Optional[Dict]:
    """From daily history, compute current + 1D / 7D / 30D change %."""
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
    Main entry point. Fetches BTC + 4 macro assets from Stooq,
    builds snapshots, computes 30-day rolling correlations vs BTC,
    classifies regime.

    Returns a dict the same shape as the previous Yahoo-backed module.
    """
    global _cache
    now = time.time()
    if not force_refresh and _cache["data"] and (now - _cache["fetched_at"] < CACHE_TTL):
        return _cache["data"]

    btc_history = fetch_stooq_history(BTC_SYMBOL, days=60)
    if not btc_history or len(btc_history) < 10:
        _log("BTC history insufficient, aborting")
        return None

    btc_snapshot = build_asset_snapshot(btc_history)
    if not btc_snapshot:
        return None

    assets_out = {}
    for key, cfg in MACRO_SYMBOLS.items():
        history = fetch_stooq_history(cfg["symbol"], days=60)
        if not history:
            continue
        snap = build_asset_snapshot(history)
        if not snap:
            continue
        # Correlation vs BTC, last 30 aligned points
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

    regime, detail = classify_regime(assets_out, btc_snapshot)

    data = {
        "btc": btc_snapshot,
        "assets": assets_out,
        "regime": regime,
        "regime_detail": detail,
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "source": "stooq",
    }

    _cache = {"data": data, "fetched_at": now}
    _log(f"OK regime={regime} SPX={assets_out.get('spx', {}).get('change_1d_pct')}% "
         f"DXY={assets_out.get('dxy', {}).get('change_1d_pct')}%")
    return data


def classify_regime(assets: Dict, btc: Dict) -> Tuple[str, str]:
    """
    Classify macro regime based on 1D moves of key assets.

    risk_on:  equities up, dollar down, yields up moderately
    risk_off: equities down, dollar up, gold up, yields down (flight to safety)
    mixed:    conflicting signals
    """
    spx = assets.get("spx", {})
    dxy = assets.get("dxy", {})
    gold = assets.get("gold", {})
    us10y = assets.get("us10y", {})

    spx_1d = spx.get("change_1d_pct") or 0
    dxy_1d = dxy.get("change_1d_pct") or 0
    gold_1d = gold.get("change_1d_pct") or 0
    y10_1d = us10y.get("change_1d_pct") or 0

    risk_on_score = 0
    risk_off_score = 0

    if spx_1d > 0.3:
        risk_on_score += 2
    elif spx_1d < -0.3:
        risk_off_score += 2

    if dxy_1d > 0.3:
        risk_off_score += 1
    elif dxy_1d < -0.3:
        risk_on_score += 1

    if gold_1d > 0.5 and spx_1d < 0:
        risk_off_score += 1

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

    pieces = []
    if spx_1d:
        pieces.append(f"SPX {spx_1d:+.2f}%")
    if dxy_1d:
        pieces.append(f"DXY {dxy_1d:+.2f}%")
    if gold_1d:
        pieces.append(f"Gold {gold_1d:+.2f}%")
    detail = ", ".join(pieces) if pieces else "no data"

    return regime, detail
