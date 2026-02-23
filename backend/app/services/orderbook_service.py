"""
Order Book Imbalance Service
Data source: Bybit API v5 (free, no key needed)
- GET /v5/market/orderbook?category=linear&symbol=BTCUSDT&limit=200
- Rate limit: 10 req/sec (very generous)
- Redis cache: 10 seconds
"""
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.redis import get_redis

# ── Config ──
BYBIT_BASE = "https://api.bybit.id"  # Indonesian-friendly domain
CACHE_TTL = 10  # 10 seconds — order book changes fast
CACHE_KEY = "orderbook"

SUPPORTED_SYMBOLS = {
    "BTCUSDT": {"name": "Bitcoin", "icon": "₿", "color": "#F7931A"},
    "ETHUSDT": {"name": "Ethereum", "icon": "Ξ", "color": "#627EEA"},
}

WALL_THRESHOLD_MULTIPLIER = 3.0  # 3x average = wall
TOP_WALLS_COUNT = 5


# ════════════════════════════════════════
# Bybit order book fetcher
# ════════════════════════════════════════
async def _fetch_orderbook(symbol: str = "BTCUSDT", limit: int = 200) -> dict:
    """Fetch order book from Bybit v5 API."""
    url = f"{BYBIT_BASE}/v5/market/orderbook"
    params = {
        "category": "linear",
        "symbol": symbol,
        "limit": limit,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data.get("retCode") != 0:
            print(f"❌ Bybit orderbook error: {data.get('retMsg', 'unknown')}")
            return {}

        result = data.get("result", {})
        return result

    except Exception as e:
        print(f"❌ Bybit orderbook fetch error [{symbol}]: {e}")
        return {}


# ════════════════════════════════════════
# Analysis functions
# ════════════════════════════════════════
def _analyze_orderbook(raw: dict, symbol: str) -> dict:
    """
    Analyze order book data:
    - Imbalance ratio
    - Buy/sell walls
    - Depth data for chart
    - Support/resistance levels
    """
    bids_raw = raw.get("b", [])  # [[price, qty], ...]
    asks_raw = raw.get("a", [])

    if not bids_raw or not asks_raw:
        return _empty_result(symbol)

    # Parse into float lists
    bids = [{"price": float(b[0]), "qty": float(b[1])} for b in bids_raw]
    asks = [{"price": float(a[0]), "qty": float(a[1])} for a in asks_raw]

    # Current mid price
    best_bid = bids[0]["price"] if bids else 0
    best_ask = asks[0]["price"] if asks else 0
    mid_price = (best_bid + best_ask) / 2 if best_bid and best_ask else 0
    spread = best_ask - best_bid if best_ask and best_bid else 0
    spread_pct = (spread / mid_price * 100) if mid_price else 0

    # ── Imbalance ratio ──
    total_bid_qty = sum(b["qty"] for b in bids)
    total_ask_qty = sum(a["qty"] for a in asks)
    total_bid_usd = sum(b["qty"] * b["price"] for b in bids)
    total_ask_usd = sum(a["qty"] * a["price"] for a in asks)

    imbalance_ratio = 0
    if total_bid_usd + total_ask_usd > 0:
        imbalance_ratio = (total_bid_usd - total_ask_usd) / (total_bid_usd + total_ask_usd)

    bid_pct = (total_bid_usd / (total_bid_usd + total_ask_usd) * 100) if (total_bid_usd + total_ask_usd) > 0 else 50
    ask_pct = 100 - bid_pct

    # Sentiment
    if imbalance_ratio > 0.15:
        sentiment = "strong_buy"
        sentiment_label = "Strong Buy Pressure"
    elif imbalance_ratio > 0.05:
        sentiment = "buy"
        sentiment_label = "Buy Pressure"
    elif imbalance_ratio < -0.15:
        sentiment = "strong_sell"
        sentiment_label = "Strong Sell Pressure"
    elif imbalance_ratio < -0.05:
        sentiment = "sell"
        sentiment_label = "Sell Pressure"
    else:
        sentiment = "neutral"
        sentiment_label = "Balanced"

    # ── Wall detection ──
    avg_bid_usd = total_bid_usd / len(bids) if bids else 0
    avg_ask_usd = total_ask_usd / len(asks) if asks else 0

    buy_walls = []
    for b in bids:
        usd_val = b["qty"] * b["price"]
        if usd_val > avg_bid_usd * WALL_THRESHOLD_MULTIPLIER:
            buy_walls.append({
                "price": b["price"],
                "qty": b["qty"],
                "usd": round(usd_val, 0),
                "strength": round(usd_val / avg_bid_usd, 1),
            })
    buy_walls.sort(key=lambda w: w["usd"], reverse=True)
    buy_walls = buy_walls[:TOP_WALLS_COUNT]

    sell_walls = []
    for a in asks:
        usd_val = a["qty"] * a["price"]
        if usd_val > avg_ask_usd * WALL_THRESHOLD_MULTIPLIER:
            sell_walls.append({
                "price": a["price"],
                "qty": a["qty"],
                "usd": round(usd_val, 0),
                "strength": round(usd_val / avg_ask_usd, 1),
            })
    sell_walls.sort(key=lambda w: w["usd"], reverse=True)
    sell_walls = sell_walls[:TOP_WALLS_COUNT]

    # ── Support/Resistance from walls ──
    support_levels = [{"price": w["price"], "usd": w["usd"], "type": "support"} for w in buy_walls[:3]]
    resistance_levels = [{"price": w["price"], "usd": w["usd"], "type": "resistance"} for w in sell_walls[:3]]

    # ── Depth chart data (cumulative) ──
    # Bids: cumulative from best bid down
    bid_depth = []
    cumulative = 0
    for b in bids:
        cumulative += b["qty"] * b["price"]
        bid_depth.append({
            "price": b["price"],
            "cumulative_usd": round(cumulative, 0),
            "qty": b["qty"],
            "individual_usd": round(b["qty"] * b["price"], 0),
        })

    # Asks: cumulative from best ask up
    ask_depth = []
    cumulative = 0
    for a in asks:
        cumulative += a["qty"] * a["price"]
        ask_depth.append({
            "price": a["price"],
            "cumulative_usd": round(cumulative, 0),
            "qty": a["qty"],
            "individual_usd": round(a["qty"] * a["price"], 0),
        })

    # ── Price range buckets for heatmap (group by % from mid) ──
    buckets = _build_heatmap_buckets(bids, asks, mid_price)

    config = SUPPORTED_SYMBOLS.get(symbol, {})

    return {
        "symbol": symbol,
        "name": config.get("name", symbol),
        "icon": config.get("icon", "?"),
        "color": config.get("color", "#888"),
        "mid_price": round(mid_price, 2),
        "best_bid": best_bid,
        "best_ask": best_ask,
        "spread": round(spread, 2),
        "spread_pct": round(spread_pct, 4),
        "imbalance": {
            "ratio": round(imbalance_ratio, 4),
            "bid_pct": round(bid_pct, 1),
            "ask_pct": round(ask_pct, 1),
            "bid_usd": round(total_bid_usd, 0),
            "ask_usd": round(total_ask_usd, 0),
            "sentiment": sentiment,
            "sentiment_label": sentiment_label,
        },
        "walls": {
            "buy": buy_walls,
            "sell": sell_walls,
            "buy_total_usd": round(sum(w["usd"] for w in buy_walls), 0),
            "sell_total_usd": round(sum(w["usd"] for w in sell_walls), 0),
        },
        "support_resistance": {
            "support": support_levels,
            "resistance": resistance_levels,
        },
        "depth": {
            "bids": bid_depth[:50],  # limit for frontend perf
            "asks": ask_depth[:50],
        },
        "heatmap": buckets,
        "total_levels": len(bids) + len(asks),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _build_heatmap_buckets(bids: list, asks: list, mid_price: float) -> list:
    """Group order book into price buckets (0.1% increments) for visual heatmap."""
    if mid_price == 0:
        return []

    buckets = {}
    bucket_size_pct = 0.1  # 0.1% per bucket

    for b in bids:
        pct_from_mid = ((b["price"] - mid_price) / mid_price) * 100
        bucket_key = round(pct_from_mid / bucket_size_pct) * bucket_size_pct
        bucket_key = round(bucket_key, 1)
        if bucket_key not in buckets:
            buckets[bucket_key] = {"price_pct": bucket_key, "bid_usd": 0, "ask_usd": 0}
        buckets[bucket_key]["bid_usd"] += b["qty"] * b["price"]

    for a in asks:
        pct_from_mid = ((a["price"] - mid_price) / mid_price) * 100
        bucket_key = round(pct_from_mid / bucket_size_pct) * bucket_size_pct
        bucket_key = round(bucket_key, 1)
        if bucket_key not in buckets:
            buckets[bucket_key] = {"price_pct": bucket_key, "bid_usd": 0, "ask_usd": 0}
        buckets[bucket_key]["ask_usd"] += a["qty"] * a["price"]

    result = sorted(buckets.values(), key=lambda x: x["price_pct"])

    # Round values
    for r in result:
        r["bid_usd"] = round(r["bid_usd"], 0)
        r["ask_usd"] = round(r["ask_usd"], 0)
        r["total_usd"] = round(r["bid_usd"] + r["ask_usd"], 0)

    return result


def _empty_result(symbol: str) -> dict:
    config = SUPPORTED_SYMBOLS.get(symbol, {})
    return {
        "symbol": symbol,
        "name": config.get("name", symbol),
        "icon": config.get("icon", "?"),
        "color": config.get("color", "#888"),
        "mid_price": 0,
        "best_bid": 0,
        "best_ask": 0,
        "spread": 0,
        "spread_pct": 0,
        "imbalance": {
            "ratio": 0, "bid_pct": 50, "ask_pct": 50,
            "bid_usd": 0, "ask_usd": 0,
            "sentiment": "neutral", "sentiment_label": "No Data",
        },
        "walls": {"buy": [], "sell": [], "buy_total_usd": 0, "sell_total_usd": 0},
        "support_resistance": {"support": [], "resistance": []},
        "depth": {"bids": [], "asks": []},
        "heatmap": [],
        "total_levels": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ════════════════════════════════════════
# Public API
# ════════════════════════════════════════
async def get_orderbook_analysis(symbol: str = "BTCUSDT") -> dict:
    """Get analyzed order book with caching."""
    symbol = symbol.upper()
    if symbol not in SUPPORTED_SYMBOLS:
        return _empty_result(symbol)

    redis = get_redis()
    cache_key = f"{CACHE_KEY}:{symbol}"

    # Check cache
    if redis:
        try:
            cached = redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    # Fetch & analyze
    raw = await _fetch_orderbook(symbol=symbol, limit=200)
    if not raw:
        return _empty_result(symbol)

    result = _analyze_orderbook(raw, symbol)

    # Cache
    if redis:
        try:
            redis.setex(cache_key, CACHE_TTL, json.dumps(result, default=str))
        except Exception:
            pass

    return result


async def get_orderbook_comparison() -> dict:
    """Get BTC + ETH side by side."""
    btc, eth = await asyncio.gather(
        get_orderbook_analysis("BTCUSDT"),
        get_orderbook_analysis("ETHUSDT"),
    )
    return {
        "BTCUSDT": btc,
        "ETHUSDT": eth,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }