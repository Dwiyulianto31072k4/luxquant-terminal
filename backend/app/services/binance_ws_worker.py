"""
Binance Futures WebSocket worker — realtime funding / mark / price / volume.

WHY: Binance recommends WebSocket for live data — WS frames do NOT count toward
the REST request-weight limit, so this removes the biggest source of 418 IP
bans (the per-minute premiumIndex + ticker REST polling).

Streams (one combined connection):
  · !markPrice@arr@1s  → mark price + funding rate for EVERY futures symbol (1s)
  · !ticker@arr        → last price + 24h change% + 24h quote volume (all symbols)

Output: Redis blob  lq:terminal:ws
  { generated_at, pairs: { "<SYMBOL>": {price, mark, funding, chg, vol} } }

terminal_worker / overview_worker read this blob FIRST and only fall back to REST
when it's stale — so REST weight (and 418 risk) drops dramatically.

Leader-gated + auto-reconnect with exponential backoff. Registered from
cache_worker.start_cache_workers().
"""
import asyncio
import json
import time

import websockets

from app.core.redis import cache_set, is_redis_available
from app.core.leader import is_leader

WS_URL = "wss://fstream.binance.com/stream?streams=!markPrice@arr@1s/!ticker@arr"
WS_BLOB_KEY = "lq:terminal:ws"
WS_TTL = 120           # blob is refreshed every ~2s; TTL is a generous floor
_FLUSH_INTERVAL = 2.0  # write to Redis at most every 2s (don't spam Redis)

_state = {}            # SYMBOL -> {price, mark, funding, chg, vol}


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _apply_markprice(arr):
    for it in arr:
        s = it.get("s")
        if not s:
            continue
        d = _state.setdefault(s, {})
        mark = _f(it.get("p"))
        fund = _f(it.get("r"))
        if mark is not None:
            d["mark"] = mark
        if fund is not None:
            d["funding"] = fund


def _apply_ticker(arr):
    for it in arr:
        s = it.get("s")
        if not s:
            continue
        d = _state.setdefault(s, {})
        price = _f(it.get("c"))
        chg = _f(it.get("P"))
        vol = _f(it.get("q"))
        if price is not None:
            d["price"] = price
        if chg is not None:
            d["chg"] = chg
        if vol is not None:
            d["vol"] = vol


def _flush():
    try:
        cache_set(WS_BLOB_KEY, {"generated_at": time.time(), "pairs": dict(_state)}, ttl=WS_TTL)
    except Exception as e:
        print(f"🔌 Binance WS flush error: {type(e).__name__}: {e}")


async def binance_ws_loop():
    """Leader-elected WS ingest loop (auto-reconnect + backoff)."""
    print("🔌 Binance WS worker started (markPrice + ticker)")
    backoff = 1
    await asyncio.sleep(4)
    while True:
        if not is_leader() or not is_redis_available():
            await asyncio.sleep(15)
            continue
        try:
            async with websockets.connect(
                WS_URL, ping_interval=20, ping_timeout=20, close_timeout=5,
                max_size=16 * 1024 * 1024,
            ) as ws:
                print("🔌 Binance WS connected")
                backoff = 1
                last_flush = 0.0
                async for raw in ws:
                    if not is_leader():
                        break
                    try:
                        msg = json.loads(raw)
                        stream = msg.get("stream", "")
                        data = msg.get("data")
                        if not isinstance(data, list):
                            continue
                        if stream.startswith("!markPrice"):
                            _apply_markprice(data)
                        elif stream.startswith("!ticker"):
                            _apply_ticker(data)
                    except Exception:
                        continue
                    now = time.time()
                    if now - last_flush >= _FLUSH_INTERVAL:
                        _flush()
                        last_flush = now
        except Exception as e:
            print(f"🔌 Binance WS disconnected: {type(e).__name__}: {e} — reconnect in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
