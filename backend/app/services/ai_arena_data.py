"""
LuxQuant AI Arena v2 — Data Layer
==================================
Fetches all BTC data from free APIs for AI analysis.

Sources:
  - Bybit REST API (free): klines, ticker (price/OI/funding), OI history
  - Coinalyze API (free key): aggregated OI, liquidation history, funding, L/S ratio
  - BGeometrics (free): NUPL, MVRV, SOPR, exchange flow, realized price
  - Google News RSS (free): BTC news headlines
  - Alternative.me (free): Fear & Greed Index
  - CoinGecko (free): BTC dominance, global market cap
  - X/Twitter API (OAuth 1.0a): curated analyst tweets

All functions return None/[] on failure — never raise exceptions.
"""

import os
import json
import requests
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv

load_dotenv()

# ═══════════════════════════════════════════
# Config
# ═══════════════════════════════════════════
BYBIT_BASE = "https://api.bybit.com"
COINALYZE_BASE = "https://api.coinalyze.net/v1"
BGEOMETRICS_BASE = "https://bitcoin-data.com/v1"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
FEAR_GREED_BASE = "https://api.alternative.me/fng"

COINALYZE_API_KEY = os.getenv("COINALYZE_API_KEY", "")
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")
TIMEOUT = 15

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
        for item in reversed(data["result"]["list"]):  # API returns newest first
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
    """Fetch aggregated OI from Coinalyze. Returns OI in both BTC and USD."""
    data = _coinalyze_get("open-interest", {"symbols": symbol})
    if data and len(data) > 0:
        raw_value = data[0].get("value", 0)
        oi_btc = raw_value
        oi_usd = raw_value * current_price if current_price > 0 else 0
        return {
            "oi_btc": oi_btc,
            "oi_usd": oi_usd,
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
    """Fetch aggregated funding rate (OI-weighted across exchanges)."""
    data = _coinalyze_get("funding-rate", {"symbols": symbol})
    if data and len(data) > 0:
        return {
            "funding_rate": data[0].get("value", 0),
            "source": "coinalyze_aggregated",
        }
    return None


def fetch_coinalyze_liquidation_history(symbol="BTCUSDT_PERP.A", interval="1hour") -> List[Dict]:
    """Fetch aggregated liquidation history (long/short per interval)."""
    import time as _time
    _now = int(_time.time())
    data = _coinalyze_get("liquidation-history", {"symbols": symbol, "interval": interval, "from": _now - 86400, "to": _now})
    if data and len(data) > 0:
        history = data[0].get("history", [])
        result = []
        for h in history:
            ts = h.get("t", 0)
            result.append({
                "timestamp": ts,
                "long_liq": h.get("l", 0),
                "short_liq": h.get("s", 0),
            })
        return result
    return []


def fetch_coinalyze_long_short_ratio(symbol="BTCUSDT_PERP.A", interval="4hour") -> List[Dict]:
    """Fetch long/short ratio history."""
    import time as _time
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
    """Fetch on-chain metric from BGeometrics (bitcoin-data.com)."""
    try:
        r = requests.get(f"{BGEOMETRICS_BASE}/{metric}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        _log(f"BGeometrics {metric} failed: {e}")
    return None


def fetch_onchain_nupl() -> Optional[Dict]:
    """Net Unrealized Profit/Loss — gauge market euphoria/capitulation."""
    data = _bgeometrics_get("nupl")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "nupl": float(latest.get("nupl", 0))}
    return None


def fetch_onchain_mvrv() -> Optional[Dict]:
    """MVRV Z-Score — overbought/oversold cycle-level."""
    data = _bgeometrics_get("mvrv-z-score")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "mvrv_z": float(latest.get("mvrvZScore", 0))}
    return None


def fetch_onchain_sopr() -> Optional[Dict]:
    """Spent Output Profit Ratio — are holders selling at profit or loss."""
    data = _bgeometrics_get("sopr")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "sopr": float(latest.get("sopr", 0))}
    return None


def fetch_onchain_sth_sopr() -> Optional[Dict]:
    """Short-Term Holder SOPR."""
    data = _bgeometrics_get("sth-sopr")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "sth_sopr": float(latest.get("sthSopr", latest.get("sopr", 0)))}
    return None


def fetch_onchain_exchange_flow() -> Optional[Dict]:
    """Exchange inflow/outflow/reserves."""
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
    """Realized Price — average cost basis of all BTC."""
    data = _bgeometrics_get("realized-price")
    if data and len(data) > 0:
        latest = data[-1]
        return {"date": latest.get("d"), "realized_price": float(latest.get("realizedPrice", 0))}
    return None


# ═══════════════════════════════════════════
# 4. SENTIMENT & NEWS
# ═══════════════════════════════════════════

def fetch_fear_greed() -> Optional[Dict]:
    """Fear & Greed Index (0-100)."""
    try:
        r = requests.get(f"{FEAR_GREED_BASE}/?limit=1", timeout=TIMEOUT)
        data = r.json()
        if data.get("data"):
            fg = data["data"][0]
            return {
                "value": int(fg["value"]),
                "classification": fg["value_classification"],
                "timestamp": fg.get("timestamp"),
            }
    except Exception as e:
        _log(f"Fear & Greed failed: {e}")
    return None


def fetch_btc_news(limit=10) -> List[Dict]:
    """Fetch BTC news from Google News RSS (free, no key required)."""
    import xml.etree.ElementTree as ET
    try:
        r = requests.get(
            "https://news.google.com/rss/search",
            params={"q": "bitcoin crypto BTC", "hl": "en-US", "gl": "US", "ceid": "US:en"},
            timeout=15
        )
        if r.status_code == 200:
            root = ET.fromstring(r.text)
            items = root.findall(".//item")
            result = []
            for item in items[:limit]:
                title = item.find("title").text if item.find("title") is not None else ""
                pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
                source = item.find("source").text if item.find("source") is not None else ""
                link = item.find("link").text if item.find("link") is not None else ""
                result.append({
                    "title": title,
                    "source": source,
                    "published": pub_date,
                    "url": link,
                })
            _log(f"  Got {len(result)} news articles via Google News RSS")
            return result
    except Exception as e:
        _log(f"News fetch failed: {e}")
    return []


def fetch_btc_dominance() -> Optional[float]:
    """BTC dominance % from CoinGecko."""
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
# 5. TECHNICAL INDICATORS (computed from klines)
# ═══════════════════════════════════════════

def compute_ema(closes: list, period: int) -> float:
    """Exponential Moving Average — more responsive to recent price action."""
    if len(closes) < period:
        return 0
    multiplier = 2 / (period + 1)
    ema = sum(closes[:period]) / period  # seed with SMA
    for price in closes[period:]:
        ema = (price - ema) * multiplier + ema
    return ema


def compute_sma(closes: list, period: int) -> float:
    """Simple Moving Average."""
    if len(closes) < period:
        return 0
    return sum(closes[-period:]) / period


def compute_rsi(closes: list, period: int = 14) -> float:
    """Relative Strength Index."""
    if len(closes) < period + 1:
        return 50
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    recent = deltas[-period:]
    gains = [d for d in recent if d > 0]
    losses = [-d for d in recent if d < 0]
    avg_gain = sum(gains) / period if gains else 0
    avg_loss = sum(losses) / period if losses else 0.001
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_technicals(klines: List[Dict]) -> Dict:
    """Compute all technical indicators from klines."""
    if not klines or len(klines) < 200:
        return {}
    
    closes = [k["close"] for k in klines]
    highs = [k["high"] for k in klines]
    lows = [k["low"] for k in klines]
    volumes = [k["volume"] for k in klines]
    
    current = closes[-1]
    
    # Hybrid MA system: EMA for short-term, SMA for long-term
    ema20 = compute_ema(closes, 20)
    ema50 = compute_ema(closes, 50)
    sma100 = compute_sma(closes, 100)
    sma200 = compute_sma(closes, 200)
    
    rsi_14 = compute_rsi(closes, 14)
    
    # Volume analysis
    vol_avg_20 = sum(volumes[-20:]) / 20
    vol_current = volumes[-1]
    vol_ratio = vol_current / vol_avg_20 if vol_avg_20 > 0 else 1
    
    # Price position relative to MAs
    above_ema20 = current > ema20
    above_ema50 = current > ema50
    above_sma100 = current > sma100
    above_sma200 = current > sma200
    
    # Trend signals
    ema_bullish_cross = ema20 > ema50  # short-term momentum
    golden_cross = ema50 > sma200  # strong trend confirmation
    
    # 24h range (6 x 4H candles)
    high_24h = max(highs[-6:])
    low_24h = min(lows[-6:])
    
    # EMA spread: EMA20 - EMA50 distance as % of price
    ema_spread = ((ema20 - ema50) / current * 100) if current > 0 else 0
    
    return {
        "price": current,
        "ema20": round(ema20, 1),
        "ema50": round(ema50, 1),
        "sma100": round(sma100, 1),
        "sma200": round(sma200, 1),
        "rsi_14": round(rsi_14, 1),
        "ema_spread_pct": round(ema_spread, 3),
        "volume_current": round(vol_current, 0),
        "volume_avg_20": round(vol_avg_20, 0),
        "volume_ratio": round(vol_ratio, 2),
        "above_ema20": above_ema20,
        "above_ema50": above_ema50,
        "above_sma100": above_sma100,
        "above_sma200": above_sma200,
        "ema_bullish_cross": ema_bullish_cross,
        "golden_cross": golden_cross,
        "high_24h": round(high_24h, 1),
        "low_24h": round(low_24h, 1),
    }


# ═══════════════════════════════════════════
# 6. LIQUIDATION ESTIMATION (Option A+B combined)
# ═══════════════════════════════════════════

LEVERAGE_DISTRIBUTION = {
    5: 0.04, 10: 0.12, 20: 0.22, 25: 0.18,
    50: 0.22, 75: 0.10, 100: 0.08, 125: 0.04,
}

def estimate_liquidation_levels(current_price: float, total_oi_usd: float) -> Dict:
    """
    Estimate liquidation clusters from OI + leverage distribution.
    Same method CoinGlass uses internally.
    """
    long_clusters = {}
    short_clusters = {}
    bucket_size = 200  # group into $200 buckets
    
    # Simulate entries spread around current price
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
    
    # Find peaks
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
# 7. X (TWITTER) — Curated Analyst Tweets
# ═══════════════════════════════════════════

ANALYST_ACCOUNTS = [
    # Tier A — Macro/Structure (3)
    "52kskew", "HsakaTrades", "LynAldenContact",
    # Tier B — On-chain/Derivatives (2)
    "ki_young_ju", "Lookonchain",
    # Tier C — News/Alerts (3)
    "WatcherGuru", "whale_alert", "BTC_Archive",
]

def fetch_analyst_tweets(limit_per_account=3) -> List[Dict]:
    """Fetch recent tweets from curated BTC analysts via X API OAuth 1.0a."""
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
    
    # Build query: tweets from any analyst mentioning BTC-related terms
    accounts_query = " OR ".join([f"from:{a}" for a in ANALYST_ACCOUNTS])
    query = f"({accounts_query}) (BTC OR bitcoin OR liquidation OR funding OR ETF OR onchain OR structure OR whale)"
    
    try:
        r = requests.get(
            "https://api.twitter.com/2/tweets/search/recent",
            auth=auth,
            params={
                "query": query,
                "max_results": min(limit_per_account * len(ANALYST_ACCOUNTS), 100),
                "tweet.fields": "created_at,author_id,public_metrics",
                "expansions": "author_id",
                "user.fields": "username,name",
            },
            timeout=15
        )
        
        if r.status_code != 200:
            _log(f"  X API error: HTTP {r.status_code}")
            return []
        
        data = r.json()
        tweets_raw = data.get("data", [])
        
        # Build author lookup
        users = {}
        for u in data.get("includes", {}).get("users", []):
            users[u["id"]] = u.get("username", "unknown")
        
        tweets = []
        for t in tweets_raw:
            tweets.append({
                "text": t.get("text", ""),
                "author": users.get(t.get("author_id", ""), "unknown"),
                "created_at": t.get("created_at", ""),
                "likes": t.get("public_metrics", {}).get("like_count", 0),
                "retweets": t.get("public_metrics", {}).get("retweet_count", 0),
            })
        
        _log(f"  Got {len(tweets)} analyst tweets from X")
        return tweets
        
    except Exception as e:
        _log(f"  X fetch failed: {e}")
        return []


# ═══════════════════════════════════════════
# 8. MASTER GATHER FUNCTION
# ═══════════════════════════════════════════



# ═══════════════════════════════════════════
# COINGLASS DATA (Hobbyist plan — V3 API)
# ═══════════════════════════════════════════

COINGLASS_API = "https://open-api.coinglass.com"
COINGLASS_KEY = os.getenv("COINGLASS_API_KEY", "")


def _coinglass_get(path: str, params: dict = None) -> Optional[Any]:
    """Coinglass V3 API helper."""
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
    """
    Fetch aggregated OI from Coinglass (30+ exchanges).
    Returns per-exchange breakdown + totals.
    """
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
    """
    Fetch funding rates from Coinglass (all major exchanges).
    Returns per-exchange funding + OI-weighted average.
    """
    data = _coinglass_get("/public/v2/funding", {"symbol": symbol})
    if not data:
        return None
    
    exchanges = []
    weighted_sum = 0
    total_oi = 0
    
    for entry in data:
        rate = entry.get("rate", 0) or 0
        oi = entry.get("openInterest", 0) or 0
        next_time = entry.get("nextFundingTime", 0)
        exchanges.append({
            "exchange": entry.get("exchangeName", "?"),
            "funding_rate": rate,
            "oi_usd": oi,
            "next_funding_time": next_time,
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


def gather_all_data() -> Dict:
    """
    Fetch ALL data needed for AI Arena report.
    Returns a big dict with all data points.
    Never raises — missing data = None/empty.
    """
    _log("Starting data gather...")
    result = {"gathered_at": datetime.utcnow().isoformat(), "errors": []}
    
    # 1. Bybit ticker (most important — gives us current price)
    _log("Fetching Bybit ticker...")
    ticker = fetch_bybit_ticker()
    if ticker:
        result["ticker"] = ticker
        result["current_price"] = ticker["price"]
        _log(f"  Price: ${ticker['price']:,.0f} | OI: ${ticker['open_interest_usd']:,.0f}")
    else:
        result["errors"].append("bybit_ticker")
        result["current_price"] = 0
    
    # 2. Bybit klines (4H)
    _log("Fetching klines...")
    klines = fetch_bybit_klines(interval="240", limit=200)
    if klines:
        result["klines"] = klines
        result["technicals"] = compute_technicals(klines)
        _log(f"  Got {len(klines)} candles, RSI: {result['technicals'].get('rsi_14')}")
        if result["current_price"] == 0:
            result["current_price"] = klines[-1]["close"]
    else:
        result["errors"].append("bybit_klines")
    
    current_price = result["current_price"]
    
    # 3. Coinalyze aggregated OI
    _log("Fetching Coinalyze OI...")
    cz_oi = fetch_coinalyze_oi(current_price=current_price)
    if cz_oi:
        result["coinalyze_oi"] = cz_oi
        _log(f"  Aggregated OI: {cz_oi['oi_btc']:,.0f} BTC (${cz_oi['oi_usd']:,.0f})")
    
    # 3b. Coinglass aggregated OI (30+ exchanges)
    _log("Fetching Coinglass OI (30+ exchanges)...")
    cg_oi = fetch_coinglass_oi()
    if cg_oi:
        result["coinglass_oi"] = cg_oi
        _log(f"  Coinglass OI: ${cg_oi['total_oi_usd']:,.0f} from {cg_oi['exchange_count']} exchanges")
    else:
        result["errors"].append("coinglass_oi")
    
    # 3c. Coinglass funding rates (multi-exchange, OI-weighted)
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
    
    # 5. Coinalyze liquidation history
    _log("Fetching liquidation history...")
    liq_hist = fetch_coinalyze_liquidation_history()
    if liq_hist:
        result["liquidation_history"] = liq_hist
        recent = liq_hist[-24:]  # last 24h
        total_long = sum(h["long_liq"] for h in recent)
        total_short = sum(h["short_liq"] for h in recent)
        result["liquidation_24h"] = {"long": total_long, "short": total_short}
        _log(f"  24h Liq: Long ${total_long:,.0f} | Short ${total_short:,.0f}")
    
    # 6. Coinalyze L/S ratio
    ls_ratio = fetch_coinalyze_long_short_ratio()
    if ls_ratio:
        result["long_short_ratio"] = ls_ratio[-1]["ratio"] if ls_ratio else None
    
    # 7. Liquidation level estimation
    _log("Estimating liquidation levels...")
    best_oi = 0
    # Prefer Coinglass (30+ exchanges) > Coinalyze > Bybit-only
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
    nupl = fetch_onchain_nupl()
    if nupl: result["nupl"] = nupl
    
    mvrv = fetch_onchain_mvrv()
    if mvrv: result["mvrv"] = mvrv
    
    sopr = fetch_onchain_sopr()
    if sopr: result["sopr"] = sopr
    
    sth_sopr = fetch_onchain_sth_sopr()
    if sth_sopr: result["sth_sopr"] = sth_sopr
    
    exchange_flow = fetch_onchain_exchange_flow()
    if exchange_flow: result["exchange_flow"] = exchange_flow
    
    realized_price = fetch_onchain_realized_price()
    if realized_price: result["realized_price"] = realized_price
    
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
    
    # 11. Analyst tweets from X
    _log("Fetching analyst tweets...")
    tweets = fetch_analyst_tweets()
    if tweets:
        result["analyst_tweets"] = tweets
    else:
        result["analyst_tweets"] = []
    
    _log(f"Data gather complete. Errors: {result['errors'] or 'none'}")
    return result
