"""
Binance Futures order-book WebSocket worker — bid/ask imbalance & depth.

WHY: CVD shows AGGRESSIVE flow (market orders). The order book shows PASSIVE
intent (resting limit orders) — where the walls are, and which side is stacked.
Together they're the full order-flow picture. LuxQuant calls are Binance-native
perps, and Binance WS (fstream) is NOT rate-limited/IP-banned the way REST is,
so we read depth straight from the venue the calls live on.

Streams (one combined connection, SUBSCRIBE after connect):
  · <symbol>@depth20@500ms  → top-20 bids/asks snapshot every 500ms

Output: Redis blob  lq:terminal:orderbook
  { generated_at, n, pairs: { "<SYMBOL>": {imb, bid_usd, ask_usd, wall_side, wall_usd} } }
    imb       = (bidUSD - askUSD) / (bidUSD + askUSD)  in %  (+ = bid-stacked)
    wall_side = "bid"/"ask" of the single biggest resting level; wall_usd its size

Symbols come from the called-pairs (deriv blob), capped for socket sanity.
Leader-gated + auto-reconnect with backoff. Registered from cache_worker.
"""
import asyncio
import json
import time

import websockets

from app.core.redis import cache_set, cache_get, is_redis_available
from app.core.leader import is_leader

WS_BASE = "wss://fstream.binance.com/stream"
BLOB_KEY = "lq:terminal:orderbook"
DERIV_BLOB_KEY = "lq:terminal:deriv"
TTL = 120
FLUSH = 1.5
MAX_SYMS = 90           # top-20 depth @500ms — keep the socket sane
LEVELS = 20             # top levels to sum for imbalance

DEFAULTS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "BNBUSDT",
            "1000PEPEUSDT", "SUIUSDT", "AVAXUSDT", "LINKUSDT"]

_state = {}   # SYMBOL -> {imb, bid_usd, ask_usd, wall_side, wall_usd}


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _called_symbols(limit=MAX_SYMS):
    """The actual active-call pairs, from the terminal deriv blob."""
    d = cache_get(DERIV_BLOB_KEY) or {}
    pairs = d.get("pairs") or {}
    if not pairs:
        return DEFAULTS
    # prefer the most-liquid (24h vol) so the biggest books are always covered
    ranked = sorted(pairs.items(), key=lambda kv: (kv[1].get("vol24h") or 0), reverse=True)
    syms = [s for s, _ in ranked[:limit]]
    return syms or DEFAULTS


def _apply_depth(sym, bids, asks):
    bid_usd = ask_usd = 0.0
    wall_side, wall_usd = None, 0.0
    for p, q in bids[:LEVELS]:
        pf, qf = _f(p), _f(q)
        if pf and qf:
            u = pf * qf
            bid_usd += u
            if u > wall_usd:
                wall_usd, wall_side = u, "bid"
    for p, q in asks[:LEVELS]:
        pf, qf = _f(p), _f(q)
        if pf and qf:
            u = pf * qf
            ask_usd += u
            if u > wall_usd:
                wall_usd, wall_side = u, "ask"
    tot = bid_usd + ask_usd
    if tot <= 0:
        return
    _state[sym] = {
        "imb": round((bid_usd - ask_usd) / tot * 100, 1),
        "bid_usd": round(bid_usd),
        "ask_usd": round(ask_usd),
        "wall_side": wall_side,
        "wall_usd": round(wall_usd),
    }


def _flush():
    try:
        cache_set(BLOB_KEY, {"generated_at": time.time(), "n": len(_state),
                             "pairs": dict(_state)}, ttl=TTL)
    except Exception as e:
        print(f"📖 Orderbook flush error: {type(e).__name__}: {e}")


async def _subscribe(ws, syms):
    params = [f"{s.lower()}@depth20@500ms" for s in syms]
    for i in range(0, len(params), 100):
        await ws.send(json.dumps({"method": "SUBSCRIBE",
                                  "params": params[i:i + 100], "id": i + 1}))
        await asyncio.sleep(0.2)


async def binance_orderbook_loop():
    """Leader-elected order-book ingest loop (auto-reconnect + backoff)."""
    print("📖 Binance order-book worker started")
    backoff = 1
    await asyncio.sleep(8)   # let the deriv blob populate the call list first
    while True:
        if not is_leader() or not is_redis_available():
            await asyncio.sleep(15)
            continue
        try:
            async with websockets.connect(
                WS_BASE, ping_interval=20, ping_timeout=20, close_timeout=5,
                max_size=16 * 1024 * 1024,
            ) as ws:
                syms = _called_symbols()
                await _subscribe(ws, syms)
                print(f"📖 Binance order-book connected ({len(syms)} call pairs)")
                backoff = 1
                last_flush = 0.0
                _flush()
                async for raw in ws:
                    if not is_leader():
                        break
                    try:
                        msg = json.loads(raw)
                        data = msg.get("data")
                        if isinstance(data, dict) and (data.get("b") or data.get("a")):
                            sym = data.get("s")
                            if sym:
                                _apply_depth(sym, data.get("b") or [], data.get("a") or [])
                    except Exception:
                        pass
                    now = time.time()
                    if now - last_flush >= FLUSH:
                        _flush()
                        last_flush = now
        except Exception as e:
            print(f"📖 Binance order-book disconnected: {type(e).__name__}: {e} — reconnect in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
