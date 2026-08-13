"""
Order Book Imbalance Service
────────────────────────────
Primary: Binance USDT-M futures depth (same venue as LuxQuant calls)
Fallback: Bybit linear orderbook
Enrichment: Redis blob lq:terminal:orderbook (WS worker), 24h ticker

- Redis cache: 8 seconds per symbol
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.core.redis import get_redis

# ── Config ──
BINANCE_FAPI = "https://fapi.binance.com"
BYBIT_BASE = "https://api.bybit.com"
CACHE_TTL = 8
CACHE_KEY = "orderbook"
TERMINAL_OB_BLOB = "lq:terminal:orderbook"

SUPPORTED_SYMBOLS = {
    "BTCUSDT": {"name": "Bitcoin", "base": "BTC"},
    "ETHUSDT": {"name": "Ethereum", "base": "ETH"},
    "SOLUSDT": {"name": "Solana", "base": "SOL"},
    "BNBUSDT": {"name": "BNB", "base": "BNB"},
    "XRPUSDT": {"name": "XRP", "base": "XRP"},
    "DOGEUSDT": {"name": "Dogecoin", "base": "DOGE"},
}

WALL_THRESHOLD_MULTIPLIER = 2.8
TOP_WALLS_COUNT = 6
DEPTH_LIMIT_BINANCE = 100
DEPTH_LIMIT_BYBIT = 200
DEPTH_RETURN_LEVELS = 40  # per side to frontend


def _price_decimals(p: float) -> int:
    if p >= 1000:
        return 2
    if p >= 1:
        return 4
    if p >= 0.01:
        return 6
    return 8


def _round_price(p: float) -> float:
    d = _price_decimals(p)
    return round(p, d)


# ════════════════════════════════════════
# Fetchers
# ════════════════════════════════════════
async def _fetch_binance_depth(symbol: str, limit: int = DEPTH_LIMIT_BINANCE) -> dict:
    url = f"{BINANCE_FAPI}/fapi/v1/depth"
    params = {"symbol": symbol, "limit": min(limit, 1000)}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        if not data.get("bids") or not data.get("asks"):
            return {}
        return {
            "source": "binance_futures",
            "b": data["bids"],
            "a": data["asks"],
            "ts": data.get("T") or data.get("E"),
        }
    except Exception as e:
        print(f"❌ Binance depth [{symbol}]: {e}")
        return {}


async def _fetch_bybit_depth(symbol: str, limit: int = DEPTH_LIMIT_BYBIT) -> dict:
    url = f"{BYBIT_BASE}/v5/market/orderbook"
    params = {"category": "linear", "symbol": symbol, "limit": limit}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        if data.get("retCode") != 0:
            return {}
        result = data.get("result") or {}
        return {
            "source": "bybit_linear",
            "b": result.get("b") or [],
            "a": result.get("a") or [],
            "ts": result.get("ts"),
        }
    except Exception as e:
        print(f"❌ Bybit depth [{symbol}]: {e}")
        return {}


async def _fetch_binance_ticker(symbol: str) -> dict:
    url = f"{BINANCE_FAPI}/fapi/v1/ticker/24hr"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url, params={"symbol": symbol})
            resp.raise_for_status()
            d = resp.json()
        return {
            "last": float(d.get("lastPrice") or 0),
            "change_pct": float(d.get("priceChangePercent") or 0),
            "high": float(d.get("highPrice") or 0),
            "low": float(d.get("lowPrice") or 0),
            "volume_usd": float(d.get("quoteVolume") or 0),
        }
    except Exception:
        return {}


async def _fetch_orderbook(symbol: str) -> dict:
    raw = await _fetch_binance_depth(symbol)
    if raw.get("b") and raw.get("a"):
        return raw
    return await _fetch_bybit_depth(symbol)


def _terminal_blob_row(symbol: str) -> Optional[dict]:
    """Live WS imbalance snapshot from binance_orderbook_worker (if running)."""
    redis = get_redis()
    if not redis:
        return None
    try:
        # cache_get may already deserialize; raw redis.get for flexibility
        from app.core.redis import cache_get

        blob = cache_get(TERMINAL_OB_BLOB)
        if not blob and hasattr(redis, "get"):
            raw = redis.get(TERMINAL_OB_BLOB)
            if raw:
                blob = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
        if not isinstance(blob, dict):
            return None
        pairs = blob.get("pairs") or {}
        row = pairs.get(symbol)
        if not row:
            return None
        return {
            **row,
            "generated_at": blob.get("generated_at"),
            "tracked_pairs": blob.get("n"),
        }
    except Exception:
        return None


# ════════════════════════════════════════
# Analysis
# ════════════════════════════════════════
def _analyze_orderbook(raw: dict, symbol: str, ticker: Optional[dict] = None) -> dict:
    bids_raw = raw.get("b", [])
    asks_raw = raw.get("a", [])
    source = raw.get("source") or "unknown"

    if not bids_raw or not asks_raw:
        return _empty_result(symbol)

    bids = [{"price": float(b[0]), "qty": float(b[1])} for b in bids_raw]
    asks = [{"price": float(a[0]), "qty": float(a[1])} for a in asks_raw]
    # ensure sorted: bids desc, asks asc
    bids.sort(key=lambda x: x["price"], reverse=True)
    asks.sort(key=lambda x: x["price"])

    best_bid = bids[0]["price"]
    best_ask = asks[0]["price"]
    mid_price = (best_bid + best_ask) / 2
    spread = best_ask - best_bid
    spread_pct = (spread / mid_price * 100) if mid_price else 0
    dec = _price_decimals(mid_price)

    total_bid_usd = sum(b["qty"] * b["price"] for b in bids)
    total_ask_usd = sum(a["qty"] * a["price"] for a in asks)
    total_bid_qty = sum(b["qty"] for b in bids)
    total_ask_qty = sum(a["qty"] for a in asks)

    imbalance_ratio = 0.0
    if total_bid_usd + total_ask_usd > 0:
        imbalance_ratio = (total_bid_usd - total_ask_usd) / (total_bid_usd + total_ask_usd)

    bid_pct = (
        (total_bid_usd / (total_bid_usd + total_ask_usd) * 100)
        if (total_bid_usd + total_ask_usd) > 0
        else 50
    )
    ask_pct = 100 - bid_pct

    if imbalance_ratio > 0.15:
        sentiment, sentiment_label = "strong_buy", "Strong Buy Pressure"
    elif imbalance_ratio > 0.05:
        sentiment, sentiment_label = "buy", "Buy Pressure"
    elif imbalance_ratio < -0.15:
        sentiment, sentiment_label = "strong_sell", "Strong Sell Pressure"
    elif imbalance_ratio < -0.05:
        sentiment, sentiment_label = "sell", "Sell Pressure"
    else:
        sentiment, sentiment_label = "neutral", "Balanced"

    avg_bid_usd = total_bid_usd / len(bids) if bids else 0
    avg_ask_usd = total_ask_usd / len(asks) if asks else 0

    buy_walls = []
    for b in bids:
        usd_val = b["qty"] * b["price"]
        if avg_bid_usd > 0 and usd_val > avg_bid_usd * WALL_THRESHOLD_MULTIPLIER:
            buy_walls.append(
                {
                    "price": _round_price(b["price"]),
                    "qty": b["qty"],
                    "usd": round(usd_val, 0),
                    "strength": round(usd_val / avg_bid_usd, 1),
                    "dist_pct": round((b["price"] - mid_price) / mid_price * 100, 3),
                }
            )
    buy_walls.sort(key=lambda w: w["usd"], reverse=True)
    buy_walls = buy_walls[:TOP_WALLS_COUNT]

    sell_walls = []
    for a in asks:
        usd_val = a["qty"] * a["price"]
        if avg_ask_usd > 0 and usd_val > avg_ask_usd * WALL_THRESHOLD_MULTIPLIER:
            sell_walls.append(
                {
                    "price": _round_price(a["price"]),
                    "qty": a["qty"],
                    "usd": round(usd_val, 0),
                    "strength": round(usd_val / avg_ask_usd, 1),
                    "dist_pct": round((a["price"] - mid_price) / mid_price * 100, 3),
                }
            )
    sell_walls.sort(key=lambda w: w["usd"], reverse=True)
    sell_walls = sell_walls[:TOP_WALLS_COUNT]

    support_levels = [
        {"price": w["price"], "usd": w["usd"], "type": "support", "dist_pct": w["dist_pct"]}
        for w in buy_walls[:4]
    ]
    resistance_levels = [
        {"price": w["price"], "usd": w["usd"], "type": "resistance", "dist_pct": w["dist_pct"]}
        for w in sell_walls[:4]
    ]

    # Ladder rows (top of book) for classic UI
    ladder_n = 18
    ladder_bids = []
    for b in bids[:ladder_n]:
        usd = b["qty"] * b["price"]
        ladder_bids.append(
            {
                "price": _round_price(b["price"]),
                "qty": b["qty"],
                "usd": round(usd, 0),
            }
        )
    ladder_asks = []
    for a in asks[:ladder_n]:
        usd = a["qty"] * a["price"]
        ladder_asks.append(
            {
                "price": _round_price(a["price"]),
                "qty": a["qty"],
                "usd": round(usd, 0),
            }
        )

    # Cumulative depth profile
    bid_depth = []
    cumulative = 0.0
    for b in bids[:DEPTH_RETURN_LEVELS]:
        cumulative += b["qty"] * b["price"]
        bid_depth.append(
            {
                "price": _round_price(b["price"]),
                "cumulative_usd": round(cumulative, 0),
                "qty": b["qty"],
                "individual_usd": round(b["qty"] * b["price"], 0),
            }
        )

    ask_depth = []
    cumulative = 0.0
    for a in asks[:DEPTH_RETURN_LEVELS]:
        cumulative += a["qty"] * a["price"]
        ask_depth.append(
            {
                "price": _round_price(a["price"]),
                "cumulative_usd": round(cumulative, 0),
                "qty": a["qty"],
                "individual_usd": round(a["qty"] * a["price"], 0),
            }
        )

    buckets = _build_heatmap_buckets(bids, asks, mid_price)
    config = SUPPORTED_SYMBOLS.get(symbol, {})
    live_ws = _terminal_blob_row(symbol)

    ticker = ticker or {}
    last = ticker.get("last") or mid_price

    return {
        "symbol": symbol,
        "base": config.get("base", symbol.replace("USDT", "")),
        "name": config.get("name", symbol),
        "venue": source,
        "mid_price": round(mid_price, dec),
        "best_bid": round(best_bid, dec),
        "best_ask": round(best_ask, dec),
        "spread": round(spread, max(dec, 2)),
        "spread_pct": round(spread_pct, 4),
        "price_decimals": dec,
        "ticker": {
            "last": round(last, dec) if last else None,
            "change_pct": ticker.get("change_pct"),
            "high": ticker.get("high"),
            "low": ticker.get("low"),
            "volume_usd": ticker.get("volume_usd"),
        },
        "imbalance": {
            "ratio": round(imbalance_ratio, 4),
            "bid_pct": round(bid_pct, 1),
            "ask_pct": round(ask_pct, 1),
            "bid_usd": round(total_bid_usd, 0),
            "ask_usd": round(total_ask_usd, 0),
            "bid_qty": round(total_bid_qty, 4),
            "ask_qty": round(total_ask_qty, 4),
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
        "ladder": {
            "bids": ladder_bids,
            "asks": ladder_asks,
            "max_usd": max(
                max((r["usd"] for r in ladder_bids), default=1),
                max((r["usd"] for r in ladder_asks), default=1),
            ),
        },
        "depth": {
            "bids": bid_depth,
            "asks": ask_depth,
        },
        "heatmap": buckets,
        "live_ws": live_ws,
        "total_levels": len(bids) + len(asks),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _build_heatmap_buckets(bids: list, asks: list, mid_price: float) -> list:
    if mid_price == 0:
        return []
    buckets: dict[float, dict] = {}
    bucket_size_pct = 0.1

    for b in bids:
        pct_from_mid = ((b["price"] - mid_price) / mid_price) * 100
        bucket_key = round(round(pct_from_mid / bucket_size_pct) * bucket_size_pct, 1)
        if bucket_key not in buckets:
            buckets[bucket_key] = {"price_pct": bucket_key, "bid_usd": 0, "ask_usd": 0}
        buckets[bucket_key]["bid_usd"] += b["qty"] * b["price"]

    for a in asks:
        pct_from_mid = ((a["price"] - mid_price) / mid_price) * 100
        bucket_key = round(round(pct_from_mid / bucket_size_pct) * bucket_size_pct, 1)
        if bucket_key not in buckets:
            buckets[bucket_key] = {"price_pct": bucket_key, "bid_usd": 0, "ask_usd": 0}
        buckets[bucket_key]["ask_usd"] += a["qty"] * a["price"]

    result = sorted(buckets.values(), key=lambda x: x["price_pct"])
    for r in result:
        r["bid_usd"] = round(r["bid_usd"], 0)
        r["ask_usd"] = round(r["ask_usd"], 0)
        r["total_usd"] = round(r["bid_usd"] + r["ask_usd"], 0)
    return result


def _empty_result(symbol: str) -> dict:
    config = SUPPORTED_SYMBOLS.get(symbol, {})
    return {
        "symbol": symbol,
        "base": config.get("base", symbol.replace("USDT", "")),
        "name": config.get("name", symbol),
        "venue": None,
        "mid_price": 0,
        "best_bid": 0,
        "best_ask": 0,
        "spread": 0,
        "spread_pct": 0,
        "price_decimals": 2,
        "ticker": {},
        "imbalance": {
            "ratio": 0,
            "bid_pct": 50,
            "ask_pct": 50,
            "bid_usd": 0,
            "ask_usd": 0,
            "bid_qty": 0,
            "ask_qty": 0,
            "sentiment": "neutral",
            "sentiment_label": "No Data",
        },
        "walls": {"buy": [], "sell": [], "buy_total_usd": 0, "sell_total_usd": 0},
        "support_resistance": {"support": [], "resistance": []},
        "ladder": {"bids": [], "asks": [], "max_usd": 1},
        "depth": {"bids": [], "asks": []},
        "heatmap": [],
        "live_ws": None,
        "total_levels": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ════════════════════════════════════════
# Public API
# ════════════════════════════════════════
async def get_orderbook_analysis(symbol: str = "BTCUSDT") -> dict:
    symbol = symbol.upper().replace("/", "").replace("-", "")
    if not symbol.endswith("USDT") and symbol in ("BTC", "ETH", "SOL", "BNB", "XRP", "DOGE"):
        symbol = f"{symbol}USDT"
    if symbol not in SUPPORTED_SYMBOLS:
        # allow any *USDT for analysis (not only whitelist)
        if not symbol.endswith("USDT"):
            return _empty_result(symbol)
        SUPPORTED_SYMBOLS.setdefault(
            symbol, {"name": symbol.replace("USDT", ""), "base": symbol.replace("USDT", "")}
        )

    redis = get_redis()
    cache_key = f"{CACHE_KEY}:{symbol}"

    if redis:
        try:
            cached = redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    raw, ticker = await asyncio.gather(
        _fetch_orderbook(symbol),
        _fetch_binance_ticker(symbol),
    )
    if not raw:
        return _empty_result(symbol)

    result = _analyze_orderbook(raw, symbol, ticker=ticker)

    if redis:
        try:
            redis.setex(cache_key, CACHE_TTL, json.dumps(result, default=str))
        except Exception:
            pass

    return result


async def get_orderbook_comparison() -> dict:
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    results = await asyncio.gather(*[get_orderbook_analysis(s) for s in symbols])
    out = {s: r for s, r in zip(symbols, results)}
    out["timestamp"] = datetime.now(timezone.utc).isoformat()
    return out


async def get_orderbook_heatmap_overview() -> dict:
    """Multi-pair imbalance strip from live WS blob + quick REST for majors."""
    from app.core.redis import cache_get

    blob = cache_get(TERMINAL_OB_BLOB) or {}
    pairs = blob.get("pairs") or {}
    ranked = sorted(
        (
            {"symbol": s, **v}
            for s, v in pairs.items()
            if isinstance(v, dict) and v.get("bid_usd") is not None
        ),
        key=lambda r: abs(r.get("imb") or 0),
        reverse=True,
    )[:24]
    return {
        "pairs": ranked,
        "n": blob.get("n") or len(pairs),
        "generated_at": blob.get("generated_at"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
