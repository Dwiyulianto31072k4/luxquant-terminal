"""
LuxQuant AI Arena v3 — Data Layer
===================================
Multi-timeframe BTC data gathering + anomaly detection + chart image generation.

Sources:
  - Bybit REST API (free): klines (1D/4H/1H), ticker (price/OI/funding), OI history
  - Coinalyze API (free key): aggregated OI, liquidation history, funding, L/S ratio
  - Coinglass V3 API: aggregated OI (30+ exchanges), OI-weighted funding
  - BGeometrics (free): NUPL, MVRV, SOPR, exchange flow, realized price
  - Google News RSS (free): BTC news headlines
  - Alternative.me (free): Fear & Greed Index
  - CoinGecko (free): BTC dominance, global market cap
  - X/Twitter API (OAuth 1.0a): curated analyst tweets

Multi-Timeframe (Triple Screen):
  - 1D (90 candle) — Tide/trend utama — EMA 21/55/200
  - 4H (200 candle) — Wave/setup — EMA 20/50, SMA 100/200
  - 1H (168 candle) — Ripple/precision — RSI, momentum

All functions return None/[] on failure — never raise exceptions.
"""

import os
import io
import json
import time as _time
import requests
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv
from app.services.arena_tweets_v6 import fetch_contextual_tweets_v6
from app.services.arena_tweets_v5 import fetch_analyst_tweets_v5

load_dotenv()

# ═══════════════════════════════════════════
# Config
# ═══════════════════════════════════════════
BYBIT_BASE = "https://api.bybit.com"
COINALYZE_BASE = "https://api.coinalyze.net/v1"
BGEOMETRICS_BASE = "https://bitcoin-data.com/v1"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
FEAR_GREED_BASE = "https://api.alternative.me/fng"
COINGLASS_API = "https://open-api.coinglass.com"

COINALYZE_API_KEY = os.getenv("COINALYZE_API_KEY", "")
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")
COINGLASS_KEY = os.getenv("COINGLASS_API_KEY", "")
TIMEOUT = 15

# Chart image output directory
CHART_DIR = os.getenv("AI_ARENA_CHART_DIR", "/opt/luxquant/ai-arena-charts")

# Bybit interval mapping
BYBIT_INTERVALS = {
    "1D": "D",    # Daily
    "4H": "240",  # 4 hours
    "1H": "60",   # 1 hour
    "15m": "15",  # 15 minutes (for anomaly checker)
}

# Timeframe configs for multi-TF analysis
TIMEFRAME_CONFIG = {
    "1D": {"interval": "D",   "limit": 90,  "label": "Daily (Tide)",   "ema_periods": [21, 55, 200]},
    "4H": {"interval": "240", "limit": 200, "label": "4H (Wave)",      "ema_periods": [20, 50], "sma_periods": [100, 200]},
    "1H": {"interval": "60",  "limit": 168, "label": "1H (Ripple)",    "ema_periods": [20, 50]},
}


def _log(msg):
    print(f"  [arena-data] {msg}")


# ═══════════════════════════════════════════
# 1. BYBIT — Price, Klines, OI, Funding
# ═══════════════════════════════════════════

def fetch_bybit_klines(symbol="BTCUSDT", interval="240", limit=120) -> Optional[List[Dict]]:
    """Fetch OHLCV klines from Bybit. Returns list of dicts."""
    try:
        r = requests.get(f"{BYBIT_BASE}/v5/market/kline",
            params={"category": "linear", "symbol": symbol, "interval": interval, "limit": limit},
            timeout=TIMEOUT)
        data = r.json()
        if data.get("retCode") != 0:
            _log(f"Bybit kline error: {data.get('retMsg')}")
            return None

        rows = []
        for item in reversed(data["result"]["list"]):
            rows.append({
                "timestamp": datetime.fromtimestamp(int(item[0]) / 1000),
                "open": float(item[1]),
                "high": float(item[2]),
                "low": float(item[3]),
                "close": float(item[4]),
                "volume": float(item[5]),
                "turnover": float(item[6]),
            })
        return rows
    except Exception as e:
        _log(f"Bybit kline failed: {e}")
        return None


def fetch_bybit_ticker(symbol="BTCUSDT") -> Optional[Dict]:
    """Fetch current BTC ticker: price, OI, funding, volume."""
    try:
        r = requests.get(f"{BYBIT_BASE}/v5/market/tickers",
            params={"category": "linear", "symbol": symbol},
            timeout=TIMEOUT)
        data = r.json()
        if data.get("retCode") == 0 and data["result"]["list"]:
            t = data["result"]["list"][0]
            return {
                "price": float(t.get("lastPrice", 0)),
                "open_interest_usd": float(t.get("openInterestValue", 0)),
                "open_interest_btc": float(t.get("openInterest", 0)),
                "funding_rate": float(t.get("fundingRate", 0)),
                "volume_24h": float(t.get("volume24h", 0)),
                "turnover_24h": float(t.get("turnover24h", 0)),
                "high_24h": float(t.get("highPrice24h", 0)),
                "low_24h": float(t.get("lowPrice24h", 0)),
                "prev_price_24h": float(t.get("prevPrice24h", 0)),
                "price_change_pct": float(t.get("price24hPcnt", 0)) * 100,
            }
    except Exception as e:
        _log(f"Bybit ticker failed: {e}")
    return None


def fetch_bybit_oi_history(symbol="BTCUSDT", interval="4h", limit=48) -> List[Dict]:
    """Fetch OI history (last N intervals)."""
    try:
        r = requests.get(f"{BYBIT_BASE}/v5/market/open-interest",
            params={"category": "linear", "symbol": symbol, "intervalTime": interval, "limit": limit},
            timeout=TIMEOUT)
        data = r.json()
        if data.get("retCode") == 0:
            result = []
            for row in reversed(data["result"]["list"]):
                result.append({
                    "timestamp": datetime.fromtimestamp(int(row["timestamp"]) / 1000),
                    "open_interest_btc": float(row["openInterest"]),
                })
            return result
    except Exception as e:
        _log(f"Bybit OI history failed: {e}")
    return []


# ═══════════════════════════════════════════
# 2. COINALYZE — Aggregated Derivatives Data
# ═══════════════════════════════════════════

def _coinalyze_get(endpoint: str, params: dict = None) -> Optional[Any]:
    """Helper for Coinalyze API calls."""
    if not COINALYZE_API_KEY:
        return None
    if params is None:
        params = {}
    params["api_key"] = COINALYZE_API_KEY
    try:
        r = requests.get(f"{COINALYZE_BASE}/{endpoint}", params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        else:
            _log(f"Coinalyze {endpoint} HTTP {r.status_code}")
    except Exception as e:
        _log(f"Coinalyze {endpoint} failed: {e}")
    return None


def fetch_coinalyze_oi(symbol="BTCUSDT_PERP.A", current_price=0) -> Optional[Dict]:
    """Fetch aggregated OI from Coinalyze."""
    data = _coinalyze_get("open-interest", {"symbols": symbol})
    if data and len(data) > 0:
        raw_value = data[0].get("value", 0)
        return {
            "oi_btc": raw_value,
            "oi_usd": raw_value * current_price if current_price > 0 else 0,
            "source": "coinalyze_aggregated",
        }
    return None


def fetch_coinalyze_oi_history(symbol="BTCUSDT_PERP.A", interval="4hour") -> List[Dict]:
    """Fetch aggregated OI history."""
    data = _coinalyze_get("open-interest-history", {"symbols": symbol, "interval": interval})
    if data and len(data) > 0:
        history = data[0].get("history", [])
        return [{"timestamp": h["t"], "oi": h["o"]} for h in history]
    return []


def fetch_coinalyze_funding(symbol="BTCUSDT_PERP.A") -> Optional[Dict]:
    """Fetch aggregated funding rate."""
    data = _coinalyze_get("funding-rate", {"symbols": symbol})
    if data and len(data) > 0:
        return {"funding_rate": data[0].get("value", 0), "source": "coinalyze_aggregated"}
    return None


def fetch_coinalyze_liquidation_history(symbol="BTCUSDT_PERP.A", interval="1hour") -> List[Dict]:
    """Fetch aggregated liquidation history (long/short per interval)."""
    _now = int(_time.time())
    data = _coinalyze_get("liquidation-history", {"symbols": symbol, "interval": interval, "from": _now - 86400, "to": _now})
    if data and len(data) > 0:
        history = data[0].get("history", [])
        return [{"timestamp": h.get("t", 0), "long_liq": h.get("l", 0), "short_liq": h.get("s", 0)} for h in history]
    return []


def fetch_coinalyze_long_short_ratio(symbol="BTCUSDT_PERP.A", interval="4hour") -> List[Dict]:
    """Fetch long/short ratio history."""
    _now = int(_time.time())
    data = _coinalyze_get("long-short-ratio-history", {"symbols": symbol, "interval": interval, "from": _now - 86400, "to": _now})
    if data and len(data) > 0:
        history = data[0].get("history", [])
        return [{"timestamp": h["t"], "ratio": h.get("r", 1.0)} for h in history]
    return []


# ═══════════════════════════════════════════
# 3. BGEOMETRICS — On-Chain Metrics
# ═══════════════════════════════════════════

def _bgeometrics_get(metric: str) -> Optional[List]:
    try:
        r = requests.get(f"{BGEOMETRICS_BASE}/{metric}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        _log(f"BGeometrics {metric} failed: {e}")
    return None


def fetch_onchain_nupl() -> Optional[Dict]:
    data = _bgeometrics_get("nupl")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "nupl": float(latest.get("nupl", 0))}
    return None


def fetch_onchain_mvrv() -> Optional[Dict]:
    data = _bgeometrics_get("mvrv-z-score")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "mvrv_z": float(latest.get("mvrvZScore", 0))}
    return None


def fetch_onchain_sopr() -> Optional[Dict]:
    data = _bgeometrics_get("sopr")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "sopr": float(latest.get("sopr", 0))}
    return None


def fetch_onchain_sth_sopr() -> Optional[Dict]:
    data = _bgeometrics_get("sth-sopr")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "sth_sopr": float(latest.get("sthSopr", latest.get("sopr", 0)))}
    return None


def fetch_onchain_exchange_flow() -> Optional[Dict]:
    data = _bgeometrics_get("exchange-flow")
    if data and len(data) > 0:
        latest = data[-1]
        return {
            "date": latest.get("d"),
            "inflow": float(latest.get("inflow", 0)),
            "outflow": float(latest.get("outflow", 0)),
            "netflow": float(latest.get("netflow", 0)),
        }
    return None


def fetch_onchain_realized_price() -> Optional[Dict]:
    data = _bgeometrics_get("realized-price")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "realized_price": float(latest.get("realizedPrice", 0))}
    return None


# ═══════════════════════════════════════════
# 4. SENTIMENT & NEWS
# ═══════════════════════════════════════════

def fetch_fear_greed() -> Optional[Dict]:
    try:
        r = requests.get(f"{FEAR_GREED_BASE}/?limit=1", timeout=TIMEOUT)
        data = r.json()
        if data.get("data"):
            fg = data["data"][0]
            return {"value": int(fg["value"]), "classification": fg["value_classification"], "timestamp": fg.get("timestamp")}
    except Exception as e:
        _log(f"Fear & Greed failed: {e}")
    return None


def fetch_btc_news(limit=10) -> List[Dict]:
    import xml.etree.ElementTree as ET
    try:
        r = requests.get("https://news.google.com/rss/search",
            params={"q": "bitcoin crypto BTC", "hl": "en-US", "gl": "US", "ceid": "US:en"}, timeout=15)
        if r.status_code == 200:
            root = ET.fromstring(r.text)
            items = root.findall(".//item")
            result = []
            for item in items[:limit]:
                title = item.find("title").text if item.find("title") is not None else ""
                pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
                source = item.find("source").text if item.find("source") is not None else ""
                link = item.find("link").text if item.find("link") is not None else ""
                result.append({"title": title, "source": source, "published": pub_date, "url": link})
            _log(f"  Got {len(result)} news articles via Google News RSS")
            return result
    except Exception as e:
        _log(f"News fetch failed: {e}")
    return []


def fetch_btc_dominance() -> Optional[float]:
    try:
        headers = {"accept": "application/json"}
        if COINGECKO_API_KEY:
            headers["x-cg-demo-api-key"] = COINGECKO_API_KEY
        r = requests.get(f"{COINGECKO_BASE}/global", headers=headers, timeout=TIMEOUT)
        data = r.json()
        return data.get("data", {}).get("market_cap_percentage", {}).get("btc", None)
    except Exception as e:
        _log(f"BTC dominance failed: {e}")
    return None


# ═══════════════════════════════════════════
# 5. TECHNICAL INDICATORS
# ═══════════════════════════════════════════

def compute_ema(closes: list, period: int) -> float:
    if len(closes) < period:
        return 0
    multiplier = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for price in closes[period:]:
        ema = (price - ema) * multiplier + ema
    return ema


def compute_sma(closes: list, period: int) -> float:
    if len(closes) < period:
        return 0
    return sum(closes[-period:]) / period


def compute_rsi(closes: list, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    recent = deltas[-period:]
    gains = [d for d in recent if d > 0]
    losses = [-d for d in recent if d < 0]
    avg_gain = sum(gains) / period if gains else 0
    avg_loss = sum(losses) / period if losses else 0.001
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_macd(closes: list, fast=12, slow=26, signal=9) -> Optional[Dict]:
    """MACD with signal line and histogram."""
    if len(closes) < slow + signal:
        return None
    ema_fast = compute_ema(closes, fast)
    ema_slow = compute_ema(closes, slow)
    macd_val = ema_fast - ema_slow

    # Build MACD line series for signal
    fast_mult = 2 / (fast + 1)
    slow_mult = 2 / (slow + 1)
    ef = sum(closes[:fast]) / fast
    es = sum(closes[:slow]) / slow
    macd_line = []
    for i in range(slow, len(closes)):
        ef = closes[i] * fast_mult + ef * (1 - fast_mult)
        es = closes[i] * slow_mult + es * (1 - slow_mult)
        macd_line.append(ef - es)

    if len(macd_line) < signal:
        return None

    sig_mult = 2 / (signal + 1)
    sig = sum(macd_line[:signal]) / signal
    for v in macd_line[signal:]:
        sig = v * sig_mult + sig * (1 - sig_mult)

    histogram = macd_val - sig
    crossover = "bullish" if len(macd_line) > 1 and macd_line[-2] <= sig and macd_val > sig else \
                "bearish" if len(macd_line) > 1 and macd_line[-2] >= sig and macd_val < sig else "neutral"

    return {"macd": round(macd_val, 2), "signal": round(sig, 2), "histogram": round(histogram, 2), "crossover": crossover}


def compute_bollinger(closes: list, period=20, std_dev=2) -> Optional[Dict]:
    """Bollinger Bands."""
    if len(closes) < period:
        return None
    recent = closes[-period:]
    sma = sum(recent) / period
    variance = sum((x - sma) ** 2 for x in recent) / period
    std = variance ** 0.5
    return {
        "upper": round(sma + std_dev * std, 2),
        "middle": round(sma, 2),
        "lower": round(sma - std_dev * std, 2),
        "bandwidth": round((std_dev * std * 2) / sma * 100, 2) if sma > 0 else 0,
    }


def compute_technicals_for_tf(klines: List[Dict], tf_key: str) -> Dict:
    """
    Compute technical indicators for a specific timeframe.
    Each TF has its own EMA/SMA config from TIMEFRAME_CONFIG.
    """
    if not klines or len(klines) < 20:
        return {}

    config = TIMEFRAME_CONFIG.get(tf_key, {})
    closes = [k["close"] for k in klines]
    highs = [k["high"] for k in klines]
    lows = [k["low"] for k in klines]
    volumes = [k["volume"] for k in klines]
    current = closes[-1]

    result = {
        "timeframe": tf_key,
        "label": config.get("label", tf_key),
        "price": current,
        "candle_count": len(klines),
    }

    # EMAs
    for period in config.get("ema_periods", []):
        val = compute_ema(closes, period)
        result[f"ema{period}"] = round(val, 1) if val else 0
        result[f"above_ema{period}"] = current > val if val else None

    # SMAs (only 4H has these)
    for period in config.get("sma_periods", []):
        val = compute_sma(closes, period)
        result[f"sma{period}"] = round(val, 1) if val else 0
        result[f"above_sma{period}"] = current > val if val else None

    # RSI
    result["rsi_14"] = round(compute_rsi(closes, 14), 1)

    # MACD
    macd = compute_macd(closes)
    if macd:
        result["macd"] = macd

    # Bollinger (only 4H primary)
    if tf_key == "4H":
        bb = compute_bollinger(closes)
        if bb:
            result["bollinger"] = bb

    # Volume analysis
    vol_avg_20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else sum(volumes) / len(volumes)
    result["volume_ratio"] = round(volumes[-1] / vol_avg_20, 2) if vol_avg_20 > 0 else 1

    # Trend signals for this TF
    ema_periods = config.get("ema_periods", [])
    if len(ema_periods) >= 2:
        short_ema = result.get(f"ema{ema_periods[0]}", 0)
        long_ema = result.get(f"ema{ema_periods[1]}", 0)
        if short_ema and long_ema:
            result["ema_bullish_cross"] = short_ema > long_ema
            result["ema_spread_pct"] = round((short_ema - long_ema) / current * 100, 3) if current > 0 else 0

    # Golden cross (4H: EMA50 vs SMA200)
    if tf_key == "4H":
        ema50 = result.get("ema50", 0)
        sma200 = result.get("sma200", 0)
        if ema50 and sma200:
            result["golden_cross"] = ema50 > sma200

    # 1D: Trend classification
    if tf_key == "1D":
        ema21 = result.get("ema21", 0)
        ema55 = result.get("ema55", 0)
        ema200 = result.get("ema200", 0)
        if ema21 and ema55 and ema200:
            if current > ema21 > ema55 > ema200:
                result["trend"] = "STRONG_UPTREND"
            elif current > ema200:
                result["trend"] = "UPTREND"
            elif current < ema21 < ema55 < ema200:
                result["trend"] = "STRONG_DOWNTREND"
            elif current < ema200:
                result["trend"] = "DOWNTREND"
            else:
                result["trend"] = "SIDEWAYS"

    # 1H: Momentum and divergence check
    if tf_key == "1H" and len(closes) >= 30:
        # Simple momentum: price rate of change over last 12 candles (12H)
        roc_12 = ((closes[-1] - closes[-13]) / closes[-13] * 100) if closes[-13] > 0 else 0
        result["momentum_12h"] = round(roc_12, 2)

        # RSI divergence check (simplified)
        price_higher_high = closes[-1] > max(closes[-25:-12]) if len(closes) >= 25 else False
        rsi_values = [compute_rsi(closes[:i], 14) for i in range(len(closes) - 12, len(closes) + 1)]
        if len(rsi_values) >= 2:
            rsi_higher = rsi_values[-1] > max(rsi_values[:-1]) if rsi_values[:-1] else False
            if price_higher_high and not rsi_higher:
                result["divergence"] = "bearish"
            elif not price_higher_high and rsi_higher:
                result["divergence"] = "bullish"

    # Range (last N candles relevant to TF)
    range_candles = 6 if tf_key == "4H" else (24 if tf_key == "1H" else 5)
    if len(highs) >= range_candles:
        result["range_high"] = round(max(highs[-range_candles:]), 1)
        result["range_low"] = round(min(lows[-range_candles:]), 1)

    return result


def compute_technicals(klines: List[Dict]) -> Dict:
    """Legacy single-TF compute (backward compatible). Uses 4H config."""
    return compute_technicals_for_tf(klines, "4H")


# ═══════════════════════════════════════════
# 6. LIQUIDATION ESTIMATION
# ═══════════════════════════════════════════

LEVERAGE_DISTRIBUTION = {
    5: 0.04, 10: 0.12, 20: 0.22, 25: 0.18,
    50: 0.22, 75: 0.10, 100: 0.08, 125: 0.04,
}


def estimate_liquidation_levels(current_price: float, total_oi_usd: float) -> Dict:
    """Estimate liquidation clusters from OI + leverage distribution."""
    long_clusters = {}
    short_clusters = {}
    bucket_size = 200

    entry_spread = np.linspace(current_price * 0.85, current_price * 1.15, 30)

    for entry in entry_spread:
        distance = abs(entry - current_price) / current_price
        weight = max(0, 1 - distance * 5)

        for leverage, pct in LEVERAGE_DISTRIBUTION.items():
            portion = total_oi_usd * pct * weight / len(entry_spread)
            if portion < 50000:
                continue

            long_liq = entry * (1 - 1 / leverage)
            short_liq = entry * (1 + 1 / leverage)

            lb = round(long_liq / bucket_size) * bucket_size
            sb = round(short_liq / bucket_size) * bucket_size

            if lb < current_price:
                long_clusters[lb] = long_clusters.get(lb, 0) + portion
            if sb > current_price:
                short_clusters[sb] = short_clusters.get(sb, 0) + portion

    peak_long = max(long_clusters, key=long_clusters.get) if long_clusters else current_price * 0.95
    peak_short = max(short_clusters, key=short_clusters.get) if short_clusters else current_price * 1.05

    return {
        "long_clusters": long_clusters,
        "short_clusters": short_clusters,
        "peak_long_price": peak_long,
        "peak_long_amount": long_clusters.get(peak_long, 0),
        "peak_short_price": peak_short,
        "peak_short_amount": short_clusters.get(peak_short, 0),
        "total_long_estimated": sum(long_clusters.values()),
        "total_short_estimated": sum(short_clusters.values()),
    }


# ═══════════════════════════════════════════
# 7. X (TWITTER) — Curated BTC Analyst Tweets
# ═══════════════════════════════════════════

# Curated BTC-focused analysts by expertise area
# Each analyst is selected for BTC-specific signal quality, not generic crypto news
ANALYST_ACCOUNTS = {
    # ── Optimized Trading Focused (12 Best) ──
    "52kskew": "derivatives",
    "Maaborz": "derivatives",
    "HsakaTrades": "derivatives",

    "CryptoCred": "technical",
    "DonAlt": "technical",
    "Pentosh1": "technical",

    "ki_young_ju": "onchain",
    "woaborz": "onchain",

    "LynAldenContact": "macro",
    "RaoulGMI": "macro",

    "BTC_Archive": "btc_news",
    "CryptoCapo_": "technical",
}


def fetch_analyst_tweets(limit_per_account: int = 2) -> List[Dict]:
    """
    Fetch recent BTC-focused tweets from curated analysts via X API v2.

    Optimizations vs v3:
    - Tight BTC filter: (BTC OR bitcoin OR #BTC) — no altcoin leakage
    - Exclude retweets and replies: original content only
    - Dedup by author: keep highest-engagement tweet per author
    - Enrich with expertise tag from ANALYST_ACCOUNTS dict
    """
    try:
        from requests_oauthlib import OAuth1
    except ImportError:
        _log("  requests_oauthlib not installed, skipping X")
        return []

    consumer_key = os.getenv("X_CONSUMER_KEY", "")
    consumer_secret = os.getenv("X_CONSUMER_SECRET", "")
    access_token = os.getenv("X_ACCESS_TOKEN", "")
    access_secret = os.getenv("X_ACCESS_TOKEN_SECRET", "")

    if not all([consumer_key, consumer_secret, access_token, access_secret]):
        _log("  X API keys not configured, skipping")
        return []

    auth = OAuth1(consumer_key, consumer_secret, access_token, access_secret)
    account_handles = list(ANALYST_ACCOUNTS.keys())

    # Build query: accounts + BTC filter + exclude noise
    accounts_query = " OR ".join([f"from:{a}" for a in account_handles])
    query = f"({accounts_query}) (BTC OR bitcoin OR #BTC) -is:retweet -is:reply"

    # X API v2 query max length is 512 chars for Basic tier
    if len(query) > 512:
        # Split into two batches if too many accounts
        mid = len(account_handles) // 2
        batch1 = account_handles[:mid]
        batch2 = account_handles[mid:]
        _log(f"  Query too long ({len(query)} chars), splitting into 2 batches")
        tweets1 = _fetch_tweet_batch(auth, batch1, limit_per_account)
        tweets2 = _fetch_tweet_batch(auth, batch2, limit_per_account)
        all_tweets = tweets1 + tweets2
    else:
        all_tweets = _fetch_tweet_batch(auth, account_handles, limit_per_account)

    # ── Dedup: keep top tweet per author (by engagement score) ──
    best_by_author = {}
    for t in all_tweets:
        author = t["author"].lower()
        score = t.get("likes", 0) + t.get("retweets", 0) * 2  # Retweets weighted 2x
        if author not in best_by_author or score > best_by_author[author]["_score"]:
            t["_score"] = score
            best_by_author[author] = t

    # Sort by engagement, remove internal score
    deduped = sorted(best_by_author.values(), key=lambda x: x.get("_score", 0), reverse=True)
    for t in deduped:
        t.pop("_score", None)

    _log(f"  Got {len(all_tweets)} raw tweets → {len(deduped)} after dedup (from {len(account_handles)} accounts)")
    return deduped


def _fetch_tweet_batch(auth, accounts: list, limit_per_account: int) -> List[Dict]:
    """Fetch a batch of tweets for a list of accounts."""
    accounts_query = " OR ".join([f"from:{a}" for a in accounts])
    query = f"({accounts_query}) (BTC OR bitcoin OR #BTC) -is:retweet -is:reply"

    try:
        r = requests.get("https://api.twitter.com/2/tweets/search/recent", auth=auth,
            params={
                "query": query,
                "max_results": min(limit_per_account * len(accounts), 100),
                "tweet.fields": "created_at,author_id,public_metrics",
                "expansions": "author_id",
                "user.fields": "username,name",
            }, timeout=15)

        if r.status_code != 200:
            _log(f"  X API error: HTTP {r.status_code} — {r.text[:200]}")
            return []

        data = r.json()
        tweets_raw = data.get("data", [])
        users = {u["id"]: u.get("username", "unknown") for u in data.get("includes", {}).get("users", [])}

        tweets = []
        for t in tweets_raw:
            author = users.get(t.get("author_id", ""), "unknown")
            metrics = t.get("public_metrics", {})
            expertise = ANALYST_ACCOUNTS.get(author, "unknown")

            tweets.append({
                "text": t.get("text", ""),
                "author": author,
                "expertise": expertise,
                "created_at": t.get("created_at", ""),
                "likes": metrics.get("like_count", 0),
                "retweets": metrics.get("retweet_count", 0),
                "replies": metrics.get("reply_count", 0),
                "quotes": metrics.get("quote_count", 0),
            })

        return tweets
    except Exception as e:
        _log(f"  X batch fetch failed: {e}")
        return []


# ═══════════════════════════════════════════
# 8. COINGLASS DATA
# ═══════════════════════════════════════════

def _coinglass_get(path: str, params: dict = None) -> Optional[Any]:
    if not COINGLASS_KEY:
        _log("  [coinglass] No API key configured")
        return None
    headers = {"accept": "application/json", "coinglassSecret": COINGLASS_KEY}
    try:
        r = requests.get(f"{COINGLASS_API}{path}", headers=headers, params=params or {}, timeout=TIMEOUT)
        j = r.json()
        if j.get("code") == "0" or j.get("success"):
            return j.get("data")
        else:
            _log(f"  [coinglass] {path} -> code={j.get('code')} msg={j.get('msg', '')[:60]}")
            return None
    except Exception as e:
        _log(f"  [coinglass] {path} error: {e}")
        return None


def fetch_coinglass_oi(symbol: str = "BTC") -> Optional[Dict]:
    data = _coinglass_get("/public/v2/open_interest", {"symbol": symbol})
    if not data:
        return None

    total_oi_usd = 0
    total_vol_usd = 0
    exchange_breakdown = []

    for entry in data:
        oi_usd = entry.get("openInterest", 0) or 0
        vol = entry.get("volUsd", 0) or 0
        total_oi_usd += oi_usd
        total_vol_usd += vol
        exchange_breakdown.append({
            "exchange": entry.get("exchangeName", "?"),
            "oi_usd": oi_usd,
            "oi_change_pct": entry.get("oIChangePercent", 0),
            "volume_usd": vol,
        })

    exchange_breakdown.sort(key=lambda x: x["oi_usd"], reverse=True)
    return {
        "total_oi_usd": total_oi_usd,
        "total_volume_usd": total_vol_usd,
        "exchange_count": len(exchange_breakdown),
        "top_exchanges": exchange_breakdown[:10],
        "source": "coinglass_v3_aggregated",
    }


def fetch_coinglass_funding(symbol: str = "BTC") -> Optional[Dict]:
    data = _coinglass_get("/public/v2/funding", {"symbol": symbol})
    if not data:
        return None

    exchanges = []
    weighted_sum = 0
    total_oi = 0

    for entry in data:
        rate = entry.get("rate", 0) or 0
        oi = entry.get("openInterest", 0) or 0
        exchanges.append({
            "exchange": entry.get("exchangeName", "?"),
            "funding_rate": rate,
            "oi_usd": oi,
            "next_funding_time": entry.get("nextFundingTime", 0),
        })
        weighted_sum += rate * oi
        total_oi += oi

    oi_weighted_avg = weighted_sum / total_oi if total_oi > 0 else 0
    exchanges.sort(key=lambda x: x["oi_usd"], reverse=True)

    return {
        "oi_weighted_avg_rate": oi_weighted_avg,
        "exchange_count": len(exchanges),
        "top_exchanges": exchanges[:10],
        "source": "coinglass_v3_funding",
    }


# ═══════════════════════════════════════════
# 9. ANOMALY DETECTION
# ═══════════════════════════════════════════

# Thresholds (research-backed)
ANOMALY_THRESHOLDS = {
    "price_pct_15m": 2.0,      # >2% in 15min = significant move
    "price_pct_15m_flash": 3.5, # >3.5% = flash crash/pump
    "oi_change_pct": 8.0,       # >8% OI change vs last report
    "funding_extreme_high": 0.08,  # >0.08%
    "funding_extreme_low": -0.03,  # <-0.03%
    "fg_shift": 15,             # >15 point Fear & Greed shift
}


def check_anomaly(previous_report: Optional[Dict] = None) -> Optional[Dict]:
    """
    Lightweight anomaly check — no LLM, just price + OI + funding.
    Returns anomaly dict if threshold exceeded, None if normal.
    Designed to run every 30 minutes.
    """
    anomalies = []

    # 1. Price check: fetch last 2 x 15min candles
    klines_15m = fetch_bybit_klines(interval="15", limit=2)
    if klines_15m and len(klines_15m) >= 2:
        price_now = klines_15m[-1]["close"]
        price_prev = klines_15m[-2]["open"]  # 15 min ago open
        if price_prev > 0:
            pct_change = abs(price_now - price_prev) / price_prev * 100
            direction = "dump" if price_now < price_prev else "pump"

            if pct_change >= ANOMALY_THRESHOLDS["price_pct_15m_flash"]:
                anomalies.append({
                    "type": "flash_crash" if direction == "dump" else "flash_pump",
                    "severity": "FLASH",
                    "detail": f"BTC {direction} {pct_change:.1f}% in 15min (${price_prev:,.0f} → ${price_now:,.0f})",
                    "value": pct_change,
                })
            elif pct_change >= ANOMALY_THRESHOLDS["price_pct_15m"]:
                anomalies.append({
                    "type": f"price_{direction}",
                    "severity": "ANOMALY",
                    "detail": f"BTC {direction} {pct_change:.1f}% in 15min (${price_prev:,.0f} → ${price_now:,.0f})",
                    "value": pct_change,
                })

    # 2. Compare with previous report (if available)
    if previous_report:
        prev_price = previous_report.get("btc_price", 0)
        prev_fg = previous_report.get("fear_greed")

        # OI change
        prev_oi = previous_report.get("source_metrics", {}).get("coinglass_oi_usd", 0) if isinstance(previous_report.get("source_metrics"), dict) else 0
        if prev_oi > 0:
            cg_oi = fetch_coinglass_oi()
            if cg_oi:
                current_oi = cg_oi["total_oi_usd"]
                oi_change_pct = abs(current_oi - prev_oi) / prev_oi * 100
                if oi_change_pct >= ANOMALY_THRESHOLDS["oi_change_pct"]:
                    direction = "increase" if current_oi > prev_oi else "decrease"
                    anomalies.append({
                        "type": f"oi_{direction}",
                        "severity": "ANOMALY",
                        "detail": f"OI {direction} {oi_change_pct:.1f}% since last report",
                        "value": oi_change_pct,
                    })

        # Fear & Greed shift
        if prev_fg is not None:
            fg = fetch_fear_greed()
            if fg:
                fg_shift = abs(fg["value"] - prev_fg)
                if fg_shift >= ANOMALY_THRESHOLDS["fg_shift"]:
                    anomalies.append({
                        "type": "sentiment_shift",
                        "severity": "ANOMALY",
                        "detail": f"Fear & Greed shifted {fg_shift} points ({prev_fg} → {fg['value']})",
                        "value": fg_shift,
                    })

    # 3. Funding rate extremes (always check)
    ticker = fetch_bybit_ticker()
    if ticker:
        fr = ticker["funding_rate"] * 100  # convert to percent
        if fr >= ANOMALY_THRESHOLDS["funding_extreme_high"]:
            anomalies.append({
                "type": "funding_extreme_long",
                "severity": "ANOMALY",
                "detail": f"Funding rate extreme positive: {fr:.4f}% (longs paying heavily)",
                "value": fr,
            })
        elif fr <= ANOMALY_THRESHOLDS["funding_extreme_low"]:
            anomalies.append({
                "type": "funding_extreme_short",
                "severity": "ANOMALY",
                "detail": f"Funding rate extreme negative: {fr:.4f}% (shorts paying heavily)",
                "value": fr,
            })

    if not anomalies:
        return None

    # Return highest severity anomaly as primary
    anomalies.sort(key=lambda a: 0 if a["severity"] == "FLASH" else 1)
    return {
        "triggered": True,
        "primary": anomalies[0],
        "all_anomalies": anomalies,
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "is_flash": any(a["severity"] == "FLASH" for a in anomalies),
    }


# ═══════════════════════════════════════════
# 10. CHART IMAGE GENERATION
# ═══════════════════════════════════════════

def generate_chart_image(
    klines_1d: List[Dict],
    klines_4h: List[Dict],
    klines_1h: List[Dict],
    technicals: Dict,
    liquidation_levels: Optional[Dict] = None,
    key_levels: Optional[Dict] = None,
    report_id: str = "unknown",
) -> Optional[str]:
    """
    Generate a 3-panel chart PNG using mplfinance.
    Returns file path of saved image, or None on failure.

    Panels:
      Top:    1D candlestick + EMA 21/55/200
      Middle: 4H candlestick + EMA 20/50, SMA 100/200 + liquidation levels
      Bottom: 1H candlestick + RSI subplot
    """
    try:
        import mplfinance as mpf
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import pandas as pd
    except ImportError as e:
        _log(f"Chart generation failed — missing library: {e}")
        return None

    os.makedirs(CHART_DIR, exist_ok=True)

    # LuxQuant dark theme colors
    bg_color = "#0f0e0c"
    panel_bg = "#141310"
    gold = "#d4a853"
    gold_dim = "#6b5c3a"
    green = "#4ade80"
    red = "#f87171"
    text_color = "#a39882"
    grid_color = "#1f1d18"

    luxquant_style = mpf.make_mpf_style(
        base_mpf_style="nightclouds",
        marketcolors=mpf.make_marketcolors(
            up=green, down=red, edge={"up": green, "down": red},
            wick={"up": green, "down": red}, volume={"up": green, "down": red},
        ),
        facecolor=panel_bg,
        edgecolor=grid_color,
        figcolor=bg_color,
        gridcolor=grid_color,
        gridstyle=":",
        gridaxis="both",
        y_on_right=True,
        rc={
            "axes.labelcolor": text_color,
            "xtick.color": text_color,
            "ytick.color": text_color,
            "font.size": 9,
        },
    )

    def klines_to_df(klines):
        df = pd.DataFrame(klines)
        df.index = pd.DatetimeIndex(df["timestamp"])
        df = df.rename(columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"})
        return df[["Open", "High", "Low", "Close", "Volume"]]

    try:
        fig, axes = plt.subplots(4, 1, figsize=(19.2, 10.8),
            gridspec_kw={"height_ratios": [2.5, 3.5, 2.5, 1.5]},
            facecolor=bg_color)

        # ── Panel 1: Daily (Tide) ──
        if klines_1d and len(klines_1d) >= 20:
            df_1d = klines_to_df(klines_1d)
            closes_1d = [k["close"] for k in klines_1d]

            addplots_1d = []
            for period, color, label in [(21, gold, "EMA21"), (55, "#e87e38", "EMA55"), (200, "#8b5cf6", "EMA200")]:
                ema_vals = []
                ema = sum(closes_1d[:period]) / period if len(closes_1d) >= period else closes_1d[0]
                mult = 2 / (period + 1)
                for i, p in enumerate(closes_1d):
                    if i < period:
                        ema_vals.append(float('nan'))
                    else:
                        ema = (p - ema) * mult + ema
                        ema_vals.append(ema)
                addplots_1d.append(mpf.make_addplot(ema_vals, ax=axes[0], color=color, width=1.2))

            mpf.plot(df_1d, type="candle", style=luxquant_style, ax=axes[0], volume=False,
                     addplot=addplots_1d if addplots_1d else None)
            axes[0].set_title("BTC/USDT Daily — Tide", color=gold, fontsize=11, fontweight="bold", loc="left", pad=4)

        # ── Panel 2: 4H (Wave) — Main panel ──
        if klines_4h and len(klines_4h) >= 50:
            df_4h = klines_to_df(klines_4h)
            closes_4h = [k["close"] for k in klines_4h]

            addplots_4h = []
            ma_configs = [
                (20, "ema", gold, 1.5, "EMA20"),
                (50, "ema", "#e87e38", 1.5, "EMA50"),
                (100, "sma", "#22d3ee", 1.0, "SMA100"),
                (200, "sma", "#8b5cf6", 1.0, "SMA200"),
            ]
            for period, ma_type, color, width, label in ma_configs:
                vals = []
                if ma_type == "ema":
                    ema = sum(closes_4h[:period]) / period if len(closes_4h) >= period else closes_4h[0]
                    mult = 2 / (period + 1)
                    for i, p in enumerate(closes_4h):
                        if i < period:
                            vals.append(float('nan'))
                        else:
                            ema = (p - ema) * mult + ema
                            vals.append(ema)
                else:
                    for i in range(len(closes_4h)):
                        if i < period - 1:
                            vals.append(float('nan'))
                        else:
                            vals.append(sum(closes_4h[i - period + 1:i + 1]) / period)

                addplots_4h.append(mpf.make_addplot(vals, ax=axes[1], color=color, width=width, linestyle="-" if ma_type == "ema" else "--"))

            mpf.plot(df_4h, type="candle", style=luxquant_style, ax=axes[1], volume=False,
                     addplot=addplots_4h if addplots_4h else None)
            axes[1].set_title("BTC/USDT 4H — Wave", color=gold, fontsize=11, fontweight="bold", loc="left", pad=4)

            # Liquidation levels as horizontal lines
            if liquidation_levels:
                peak_long = liquidation_levels.get("peak_long_price", 0)
                peak_short = liquidation_levels.get("peak_short_price", 0)
                if peak_long > 0:
                    axes[1].axhline(y=peak_long, color=red, linewidth=0.8, linestyle=":", alpha=0.6)
                    axes[1].text(0.01, peak_long, f"Liq Long ${peak_long:,.0f}", transform=axes[1].get_yaxis_transform(),
                                 color=red, fontsize=7, va="bottom", alpha=0.7)
                if peak_short > 0:
                    axes[1].axhline(y=peak_short, color=green, linewidth=0.8, linestyle=":", alpha=0.6)
                    axes[1].text(0.01, peak_short, f"Liq Short ${peak_short:,.0f}", transform=axes[1].get_yaxis_transform(),
                                 color=green, fontsize=7, va="top", alpha=0.7)

            # Key levels from AI
            if key_levels:
                for level_key, color_l, style_l in [
                    ("strong_support", "#22c55e", "-"), ("support", "#86efac", "--"),
                    ("resistance", "#fca5a5", "--"), ("strong_resistance", "#ef4444", "-"),
                ]:
                    val = key_levels.get(level_key, 0)
                    if val and val > 0:
                        axes[1].axhline(y=val, color=color_l, linewidth=0.6, linestyle=style_l, alpha=0.4)

        # ── Panel 3: 1H (Ripple) ──
        if klines_1h and len(klines_1h) >= 20:
            df_1h = klines_to_df(klines_1h)
            mpf.plot(df_1h, type="candle", style=luxquant_style, ax=axes[2], volume=False)
            axes[2].set_title("BTC/USDT 1H — Ripple", color=gold, fontsize=11, fontweight="bold", loc="left", pad=4)

        # ── Panel 4: RSI ──
        if klines_4h and len(klines_4h) >= 20:
            closes = [k["close"] for k in klines_4h]
            rsi_vals = []
            for i in range(len(closes)):
                if i < 15:
                    rsi_vals.append(float('nan'))
                else:
                    rsi_vals.append(compute_rsi(closes[:i + 1], 14))

            axes[3].fill_between(range(len(rsi_vals)), 30, 70, alpha=0.05, color=gold)
            axes[3].axhline(y=70, color=red, linewidth=0.5, linestyle=":", alpha=0.5)
            axes[3].axhline(y=30, color=green, linewidth=0.5, linestyle=":", alpha=0.5)
            axes[3].axhline(y=50, color=text_color, linewidth=0.3, linestyle="-", alpha=0.3)
            axes[3].plot(rsi_vals, color=gold, linewidth=1.2)
            axes[3].set_ylim(15, 85)
            axes[3].set_title("RSI (14) — 4H", color=gold, fontsize=9, fontweight="bold", loc="left", pad=2)
            axes[3].set_facecolor(panel_bg)
            axes[3].tick_params(colors=text_color, labelsize=8)
            for spine in axes[3].spines.values():
                spine.set_color(grid_color)

        # ── Branding ──
        fig.text(0.99, 0.005, f"LuxQuant AI Arena  ·  {report_id}  ·  {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
                 ha="right", va="bottom", fontsize=7, color=gold_dim, alpha=0.6)

        plt.tight_layout(pad=1.0, h_pad=0.5)

        filepath = os.path.join(CHART_DIR, f"{report_id}.png")
        fig.savefig(filepath, dpi=150, bbox_inches="tight", facecolor=bg_color, pad_inches=0.2)
        plt.close(fig)

        _log(f"Chart image saved: {filepath}")
        return filepath

    except Exception as e:
        _log(f"Chart generation error: {e}")
        import traceback
        traceback.print_exc()
        return None


# ═══════════════════════════════════════════
# 11. MULTI-TIMEFRAME GATHER
# ═══════════════════════════════════════════

def gather_all_data(is_anomaly: bool = False) -> Dict:
    """
    Fetch ALL data needed for AI Arena report.
    v3: Multi-timeframe klines + anomaly-ready structure.
    Returns a big dict with all data points. Never raises.
    """
    _log("Starting data gather...")
    result = {"gathered_at": datetime.utcnow().isoformat(), "errors": []}

    # 1. Bybit ticker
    _log("Fetching Bybit ticker...")
    ticker = fetch_bybit_ticker()
    if ticker:
        result["ticker"] = ticker
        result["current_price"] = ticker["price"]
        _log(f"  Price: ${ticker['price']:,.0f} | OI: ${ticker['open_interest_usd']:,.0f}")
    else:
        result["errors"].append("bybit_ticker")
        result["current_price"] = 0

    # 2. Multi-timeframe klines + technicals
    result["timeframes"] = {}
    for tf_key, tf_cfg in TIMEFRAME_CONFIG.items():
        _log(f"Fetching klines {tf_key} ({tf_cfg['label']})...")
        klines = fetch_bybit_klines(interval=tf_cfg["interval"], limit=tf_cfg["limit"])
        if klines:
            tech = compute_technicals_for_tf(klines, tf_key)
            result["timeframes"][tf_key] = {
                "klines": klines,
                "technicals": tech,
                "candle_count": len(klines),
            }
            _log(f"  {tf_key}: {len(klines)} candles, RSI: {tech.get('rsi_14')}")
            if result["current_price"] == 0:
                result["current_price"] = klines[-1]["close"]
        else:
            result["errors"].append(f"bybit_klines_{tf_key}")

    # Legacy compatibility: expose 4H technicals at top level
    if "4H" in result["timeframes"]:
        result["klines"] = result["timeframes"]["4H"]["klines"]
        result["technicals"] = result["timeframes"]["4H"]["technicals"]

    current_price = result["current_price"]

    # 3. Coinalyze OI
    _log("Fetching Coinalyze OI...")
    cz_oi = fetch_coinalyze_oi(current_price=current_price)
    if cz_oi:
        result["coinalyze_oi"] = cz_oi
        _log(f"  Aggregated OI: {cz_oi['oi_btc']:,.0f} BTC (${cz_oi['oi_usd']:,.0f})")

    # 3b. Coinglass OI (30+ exchanges)
    _log("Fetching Coinglass OI (30+ exchanges)...")
    cg_oi = fetch_coinglass_oi()
    if cg_oi:
        result["coinglass_oi"] = cg_oi
        _log(f"  Coinglass OI: ${cg_oi['total_oi_usd']:,.0f} from {cg_oi['exchange_count']} exchanges")
    else:
        result["errors"].append("coinglass_oi")

    # 3c. Coinglass funding
    _log("Fetching Coinglass funding (multi-exchange)...")
    cg_funding = fetch_coinglass_funding()
    if cg_funding:
        result["coinglass_funding"] = cg_funding
        _log(f"  OI-weighted funding: {cg_funding['oi_weighted_avg_rate']:.6f}")
    else:
        result["errors"].append("coinglass_funding")

    # 4. Coinalyze funding
    _log("Fetching Coinalyze funding...")
    cz_funding = fetch_coinalyze_funding()
    if cz_funding:
        result["coinalyze_funding"] = cz_funding

    # 5. Liquidation history
    _log("Fetching liquidation history...")
    liq_hist = fetch_coinalyze_liquidation_history()
    if liq_hist:
        result["liquidation_history"] = liq_hist
        recent = liq_hist[-24:]
        total_long = sum(h["long_liq"] for h in recent)
        total_short = sum(h["short_liq"] for h in recent)
        result["liquidation_24h"] = {"long": total_long, "short": total_short}
        _log(f"  24h Liq: Long ${total_long:,.0f} | Short ${total_short:,.0f}")

    # 6. L/S ratio
    ls_ratio = fetch_coinalyze_long_short_ratio()
    if ls_ratio:
        result["long_short_ratio"] = ls_ratio[-1]["ratio"] if ls_ratio else None

    # 7. Liquidation estimation
    _log("Estimating liquidation levels...")
    best_oi = 0
    if cg_oi and cg_oi.get("total_oi_usd", 0) > 1_000_000_000:
        best_oi = cg_oi["total_oi_usd"]
        _log(f"  Using Coinglass OI for estimation: ${best_oi:,.0f}")
    elif cz_oi and cz_oi["oi_usd"] > 1_000_000_000:
        best_oi = cz_oi["oi_usd"]
    elif ticker and ticker["open_interest_usd"] > 1_000_000_000:
        best_oi = ticker["open_interest_usd"]
    else:
        best_oi = ticker["open_interest_usd"] if ticker else 18_000_000_000

    if current_price > 0:
        result["liquidation_levels"] = estimate_liquidation_levels(current_price, best_oi)
        _log(f"  Peak Long Liq: ${result['liquidation_levels']['peak_long_price']:,.0f}")
        _log(f"  Peak Short Liq: ${result['liquidation_levels']['peak_short_price']:,.0f}")

    # 8. On-chain metrics
    _log("Fetching on-chain data...")
    for name, func in [("nupl", fetch_onchain_nupl), ("mvrv", fetch_onchain_mvrv),
                        ("sopr", fetch_onchain_sopr), ("sth_sopr", fetch_onchain_sth_sopr),
                        ("exchange_flow", fetch_onchain_exchange_flow), ("realized_price", fetch_onchain_realized_price)]:
        data = func()
        if data:
            result[name] = data

    # 9. Sentiment
    _log("Fetching sentiment...")
    fg = fetch_fear_greed()
    if fg:
        result["fear_greed"] = fg
        _log(f"  Fear & Greed: {fg['value']} ({fg['classification']})")

    btc_dom = fetch_btc_dominance()
    if btc_dom:
        result["btc_dominance"] = round(btc_dom, 2)

    # 10. News
    _log("Fetching news...")
    news = fetch_btc_news(limit=10)
    if news:
        result["news"] = news
        _log(f"  Got {len(news)} articles")

    # 11. Analyst tweets — v6 context-aware
    _log("Fetching contextual tweets (v6)...")
    _bitcoin = result.get("bitcoin", {}) or {}
    _technicals = result.get("technicals", {}) or {}
    _fg = result.get("fear_greed", {}) or {}
    _price = _bitcoin.get("current_price") or _bitcoin.get("price") or 70000
    _snapshot = {
        "price": _price,
        "rsi_1d": (_technicals.get("1D", {}) or {}).get("rsi", 50),
        "fear_greed": _fg.get("value", 50),
        "key_level_above": _price * 1.03,
        "key_level_below": _price * 0.97,
    }
    try:
        tweets = fetch_contextual_tweets_v6(_snapshot, force_refresh=is_anomaly)
    except Exception as _e:
        _log(f"  v6 fetch failed: {_e}")
        tweets = []
    result["analyst_tweets"] = tweets or []

    _log(f"Data gather complete. Errors: {result['errors'] or 'none'}")
    return result
