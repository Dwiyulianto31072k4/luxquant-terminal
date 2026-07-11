"""
Bybit trade-flow WebSocket worker — Cumulative Volume Delta (CVD).

WHY: CVD = aggressive market-buys minus market-sells. It's the order-flow read
pros use to confirm or fade a move: if price rises while CVD falls, the rally is
being sold into (weak conviction → reversal risk). Bybit streams every taker
print on `publicTrade.<SYMBOL>`, so this worker keeps one socket open, subscribes
to the most-liquid called pairs, and rolls a per-minute buy/sell ledger.

Output: Redis blob  lq:terminal:cvd
  { generated_at, n, pairs: { SYM: {cvd_15m, cvd_1h, buyratio_15m, trades} } }
    cvd_*      = net taker USD (buy - sell) over the window (signed)
    buyratio   = buy_usd / (buy+sell) over 15m (0.5 = balanced)

Memory stays flat: trades are folded into 1-minute buckets, pruned past 60m.
Leader-gated + auto-reconnect with backoff. Registered from cache_worker.
"""
import asyncio
import json
import time

import websockets

from app.core.redis import cache_set, cache_get, is_redis_available
from app.core.leader import is_leader

WS_URL = "wss://stream.bybit.com/v5/public/linear"
BLOB_KEY = "lq:terminal:cvd"
BYBIT_BLOB_KEY = "lq:terminal:bybit"
TTL = 120
FLUSH = 3.0
MAX_SYMS = 50           # publicTrade is a firehose — cap to the most-liquid perps
WINDOW_S = 3600         # keep 60 minutes of buckets

DEFAULTS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "BNBUSDT",
            "1000PEPEUSDT", "SUIUSDT", "AVAXUSDT", "LINKUSDT"]

# sym -> { minute_ts -> [buy_usd, sell_usd, trades] }
_buckets = {}


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _top_symbols(limit=MAX_SYMS):
    by = cache_get(BYBIT_BLOB_KEY) or {}
    pairs = by.get("pairs") or {}
    if not pairs:
        return DEFAULTS
    ranked = sorted(pairs.items(), key=lambda kv: (kv[1].get("oi") or 0), reverse=True)
    syms = [s for s, _ in ranked[:limit]]
    return syms or DEFAULTS


def _flush():
    now = time.time()
    cutoff = now - WINDOW_S
    m15 = now - 900
    out = {}
    for sym, buckets in list(_buckets.items()):
        # prune old minutes
        for m in [m for m in buckets if m * 60 < cutoff]:
            buckets.pop(m, None)
        if not buckets:
            _buckets.pop(sym, None)
            continue
        cvd15 = buy15 = sell15 = cvd60 = trades = 0.0
        for m, (b, s, t) in buckets.items():
            cvd60 += b - s
            trades += t
            if m * 60 >= m15:
                cvd15 += b - s
                buy15 += b
                sell15 += s
        tot15 = buy15 + sell15
        out[sym] = {
            "cvd_15m": round(cvd15),
            "cvd_1h": round(cvd60),
            "buyratio_15m": round(buy15 / tot15, 3) if tot15 > 0 else None,
            "trades": int(trades),
        }
    try:
        cache_set(BLOB_KEY, {"generated_at": now, "n": len(out), "pairs": out}, ttl=TTL)
    except Exception as e:
        print(f"📊 CVD flush error: {type(e).__name__}: {e}")


async def _subscribe(ws, syms):
    for i in range(0, len(syms), 10):
        args = [f"publicTrade.{s}" for s in syms[i:i + 10]]
        await ws.send(json.dumps({"op": "subscribe", "args": args}))
        await asyncio.sleep(0.2)


async def bybit_cvd_loop():
    """Leader-elected trade-flow ingest loop (auto-reconnect + backoff)."""
    print("📊 Bybit CVD worker started")
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
                print(f"📊 Bybit CVD connected ({len(syms)} symbols)")
                backoff = 1
                last_flush = 0.0
                last_ping = time.time()
                _flush()
                while True:
                    if not is_leader():
                        break
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    except asyncio.TimeoutError:
                        raw = None
                    if raw is not None:
                        try:
                            msg = json.loads(raw)
                            if msg.get("op") == "subscribe" and msg.get("success") is False:
                                print(f"📊 CVD subscribe REJECTED: {msg.get('ret_msg') or msg}")
                            if msg.get("topic", "").startswith("publicTrade"):
                                for it in (msg.get("data") or []):
                                    price = _f(it.get("p"))
                                    size = _f(it.get("v"))
                                    sym = it.get("s")
                                    if not price or not size or not sym:
                                        continue
                                    usd = price * size
                                    ts_ms = _f(it.get("T"))
                                    m = int((ts_ms / 1000.0 if ts_ms else time.time()) // 60)
                                    bk = _buckets.setdefault(sym, {}).setdefault(m, [0.0, 0.0, 0])
                                    # S = taker side ("Buy" lifts the ask, "Sell" hits the bid)
                                    if it.get("S") == "Buy":
                                        bk[0] += usd
                                    else:
                                        bk[1] += usd
                                    bk[2] += 1
                        except Exception:
                            pass
                    now = time.time()
                    if now - last_flush >= FLUSH:
                        _flush()
                        last_flush = now
                    if now - last_ping >= 18:
                        try:
                            await ws.send(json.dumps({"op": "ping"}))
                        except Exception:
                            break
                        last_ping = now
        except Exception as e:
            print(f"📊 Bybit CVD disconnected: {type(e).__name__}: {e} — reconnect in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
