"""
Bybit liquidation WebSocket worker — a live forced-liquidation tape.

WHY: liquidation flow is a pro trader's favorite read (Coinglass's whole
business). Bybit exposes it only over WebSocket (`allLiquidation.<SYMBOL>`),
so this worker keeps one connection open, subscribes to the most-liquid called
pairs, and streams recent liquidation events into a Redis ring buffer.

Output: Redis blob  lq:terminal:liq
  { generated_at, events: [{ts, pair, side, usd}], long_usd_5m, short_usd_5m, n }
    side = "long"  → a long position was force-closed (Sell order)
    side = "short" → a short was force-closed (Buy order)

Leader-gated + auto-reconnect with exponential backoff. Registered from
cache_worker.start_cache_workers(). Degrades gracefully (empty tape) if the
stream is unavailable from this host.
"""
import asyncio
import json
import time
from collections import deque

import websockets

from app.core.redis import cache_set, cache_get, is_redis_available
from app.core.leader import is_leader

WS_URL = "wss://stream.bybit.com/v5/public/linear"
BLOB_KEY = "lq:terminal:liq"
BYBIT_BLOB_KEY = "lq:terminal:bybit"
TTL = 120
FLUSH = 2.5
MAX_EVENTS = 250
DEFAULTS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "BNBUSDT",
            "1000PEPEUSDT", "SUIUSDT", "AVAXUSDT", "LINKUSDT"]

_events = deque(maxlen=MAX_EVENTS)


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _top_symbols(limit=120):
    """Most-liquid USDT perps (by OI) from the Bybit tickers blob."""
    by = cache_get(BYBIT_BLOB_KEY) or {}
    pairs = by.get("pairs") or {}
    if not pairs:
        return DEFAULTS
    ranked = sorted(pairs.items(), key=lambda kv: (kv[1].get("oi") or 0), reverse=True)
    syms = [s for s, _ in ranked[:limit]]
    return syms or DEFAULTS


def _flush():
    now = time.time()
    long5 = sum(e["usd"] for e in _events if e["side"] == "long" and now - e["ts"] < 300)
    short5 = sum(e["usd"] for e in _events if e["side"] == "short" and now - e["ts"] < 300)
    evs = list(_events)[-120:][::-1]  # newest first
    try:
        cache_set(BLOB_KEY, {
            "generated_at": now, "events": evs,
            "long_usd_5m": round(long5), "short_usd_5m": round(short5),
            "n": len(_events),
        }, ttl=TTL)
    except Exception as e:
        print(f"🩸 Bybit liq flush error: {type(e).__name__}: {e}")


async def _subscribe(ws, syms):
    for i in range(0, len(syms), 10):
        args = [f"allLiquidation.{s}" for s in syms[i:i + 10]]
        await ws.send(json.dumps({"op": "subscribe", "args": args}))
        await asyncio.sleep(0.2)


async def bybit_liq_loop():
    """Leader-elected liquidation WS ingest loop (auto-reconnect + backoff)."""
    print("🩸 Bybit liquidation worker started")
    backoff = 1
    await asyncio.sleep(6)
    while True:
        if not is_leader() or not is_redis_available():
            await asyncio.sleep(15)
            continue
        try:
            async with websockets.connect(
                WS_URL, ping_interval=20, ping_timeout=20, close_timeout=5,
                max_size=8 * 1024 * 1024,
            ) as ws:
                syms = _top_symbols()
                await _subscribe(ws, syms)
                print(f"🩸 Bybit liq connected ({len(syms)} symbols)")
                backoff = 1
                last_flush = 0.0
                async for raw in ws:
                    if not is_leader():
                        break
                    try:
                        msg = json.loads(raw)
                        topic = msg.get("topic", "")
                        if not topic.startswith("allLiquidation"):
                            continue
                        for it in (msg.get("data") or []):
                            price = _f(it.get("p"))
                            size = _f(it.get("v"))
                            if not price or not size:
                                continue
                            side = "long" if it.get("S") == "Sell" else "short"
                            ts_ms = _f(it.get("T"))
                            _events.append({
                                "ts": ts_ms / 1000.0 if ts_ms else time.time(),
                                "pair": it.get("s"),
                                "side": side,
                                "usd": round(price * size, 2),
                            })
                    except Exception:
                        continue
                    now = time.time()
                    if now - last_flush >= FLUSH:
                        _flush()
                        last_flush = now
        except Exception as e:
            print(f"🩸 Bybit liq disconnected: {type(e).__name__}: {e} — reconnect in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
