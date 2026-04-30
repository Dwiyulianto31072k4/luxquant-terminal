# backend/app/services/macro_data.py
"""
LuxQuant AI Arena v5 — Macro Data Layer (FRED + Binance)
==========================================================
Tracks macro assets that correlate with BTC price action.

Sources:
  - FRED (St. Louis Fed): DXY-proxy, SPX, US10Y    — official, free, no key
  - Binance: BTC and PAXG (Pax Gold, tokenized 1:1) — already in our stack

Why this combination:
  Earlier attempts:
    1. Yahoo Finance — HTTP 429 from datacenter IPs (rate limited)
    2. Stooq.com    — switched to API key gating recently
  FRED is the US government's economic data service: never rate-limits
  serious users, and the Trade-Weighted Dollar Index (DTWEXBGS) is
  arguably a better USD proxy than the legacy futures-based DXY.
  Binance gives us BTC + PAXG (gold spot via tokenized ETF), reliable
  and consistent with the rest of the AI Arena stack.

Assets tracked:
  - DXY  (DTWEXBGS via FRED): Trade-Weighted USD Index — typically inverse to BTC
  - SPX  (SP500    via FRED): S&P 500 — post-ETF era, positive correlation
  - Gold (PAXGUSDT via Binance): Tokenized gold spot
  - US10Y (DGS10   via FRED): 10Y Treasury yield — risk-on/risk-off

All functions return None on failure — never raise.
"""

import csv
import io
import time
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, List, Tuple

TIMEOUT = 15

FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv"
BINANCE_KLINES = "https://api.binance.com/api/v3/klines"

# Symbol map. Each entry tells us which fetcher to call.
MACRO_SYMBOLS = {
    "dxy":   {"source": "fred",    "id": "DTWEXBGS", "label": "USD Index (Trade-Weighted)"},
    "spx":   {"source": "fred",    "id": "SP500",    "label": "S&P 500"},
    "gold":  {"source": "binance", "id": "PAXGUSDT", "label": "Gold (PAXG spot)"},
    "us10y": {"source": "fred",    "id": "DGS10",    "label": "US 10Y Yield"},
}

BTC_BINANCE_SYMBOL = "BTCUSDT"

CACHE_TTL = 1800  # 30 min
_cache = {"data": None, "fetched_at": 0}


def _log(msg):
    print(f"  [macro-data] {msg}")


# ═══════════════════════════════════════════
# FRED CSV fetcher
# ═══════════════════════════════════════════

def fetch_fred_history(series_id: str, days: int = 60) -> Optional[List[Dict]]:
    """
    Fetch daily CSV from FRED for a given series.

    Returns list of {date, close} sorted ascending, last `days` entries
    (skipping rows where the value is missing — FRED uses '.' for holidays).
    """
    try:
        r = requests.get(FRED_BASE, params={"id": series_id}, timeout=TIMEOUT)
        if r.status_code != 200:
            _log(f"FRED {series_id} HTTP {r.status_code}")
            return None
        text = r.text
        if "<!DOCTYPE" in text[:50] or "DOCTYPE html" in text[:50]:
            _log(f"FRED {series_id} returned HTML (series likely missing)")
            return None
    except Exception as e:
        _log(f"FRED {series_id} fetch failed: {e}")
        return None

    history = []
    try:
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            d = (row.get("observation_date") or row.get("DATE") or "").strip()
            v = row.get(series_id)
            if not d or v is None:
                continue
            v = v.strip()
            if not v or v == ".":
                continue
            try:
                close = float(v)
            except (ValueError, TypeError):
                continue
            history.append({"date": d, "close": close})
    except Exception as e:
        _log(f"FRED {series_id} CSV parse failed: {e}")
        return None

    if not history:
        return None

    return history[-days:]


# ═══════════════════════════════════════════
# Binance daily klines
# ═══════════════════════════════════════════

def fetch_binance_daily(symbol: str, days: int = 60) -> Optional[List[Dict]]:
    """
    Fetch daily candles from Binance public REST API.
    Returns list of {date, close} ascending, last `days` entries.
    """
    try:
        r = requests.get(
            BINANCE_KLINES,
            params={"symbol": symbol, "interval": "1d", "limit": days},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            _log(f"Binance {symbol} HTTP {r.status_code}")
            return None
        rows = r.json()
        if not isinstance(rows, list) or not rows:
            _log(f"Binance {symbol} empty response")
            return None
    except Exception as e:
        _log(f"Binance {symbol} fetch failed: {e}")
        return None

    history = []
    for k in rows:
        try:
            ts_ms = int(k[0])
            close = float(k[4])
            date_str = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            history.append({"date": date_str, "close": close})
        except (ValueError, TypeError, IndexError):
            continue

    return history if history else None


# ═══════════════════════════════════════════
# Pearson correlation (no numpy dependency)
# ═══════════════════════════════════════════

def pearson_correlation(xs: List[float], ys: List[float]) -> Optional[float]:
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
# Source dispatcher
# ═══════════════════════════════════════════

def fetch_history_for(cfg: Dict, days: int = 60) -> Optional[List[Dict]]:
    src = cfg.get("source")
    sid = cfg.get("id")
    if src == "fred":
        return fetch_fred_history(sid, days=days)
    if src == "binance":
        return fetch_binance_daily(sid, days=days)
    _log(f"unknown source {src}")
    return None


# ═══════════════════════════════════════════
# Top-level Macro Pulse
# ═══════════════════════════════════════════

def fetch_macro_pulse(force_refresh: bool = False) -> Optional[Dict]:
    global _cache
    now = time.time()
    if not force_refresh and _cache["data"] and (now - _cache["fetched_at"] < CACHE_TTL):
        return _cache["data"]

    btc_history = fetch_binance_daily(BTC_BINANCE_SYMBOL, days=60)
    if not btc_history or len(btc_history) < 10:
        _log("BTC history insufficient, aborting")
        return None

    btc_snapshot = build_asset_snapshot(btc_history)
    if not btc_snapshot:
        return None

    assets_out = {}
    for key, cfg in MACRO_SYMBOLS.items():
        history = fetch_history_for(cfg, days=60)
        if not history:
            continue
        snap = build_asset_snapshot(history)
        if not snap:
            continue
        xs, ys = align_by_date(btc_history[-30:], history[-30:])
        corr = pearson_correlation(xs, ys)
        assets_out[key] = {
            **snap,
            "symbol": cfg["id"],
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
        "source": "fred+binance",
    }

    _cache = {"data": data, "fetched_at": now}
    _log(f"OK regime={regime} SPX={assets_out.get('spx', {}).get('change_1d_pct')}% "
         f"DXY={assets_out.get('dxy', {}).get('change_1d_pct')}%")
    return data


def classify_regime(assets: Dict, btc: Dict) -> Tuple[str, str]:
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
