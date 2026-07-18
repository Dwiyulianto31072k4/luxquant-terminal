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

# Binance documents TWO base endpoints for USD-M futures streams. Only the
# second one actually delivers.
#
# fstream.binance.com accepts the TLS handshake in ~0.3s, reports state OPEN,
# and then sends nothing — no frames, no close, no error — on every path
# (/ws/, /stream, and the newer /public/… variants) and via every edge IP
# (Mumbai and Tokyo alike). Reproduced from two machines on different
# continents, so it is neither this server's IP nor a regional restriction.
# stream.binancefuture.com, on the same box in the same second, returns a
# 511-symbol !ticker@arr frame immediately.
#
# A silent-but-open socket is the worst failure shape there is: nothing to
# catch, nothing logged, and every consumer quietly falling back to REST until
# the weight budget runs out. Hence the ordered list plus the staleness
# watchdog below — if a host goes deaf we move to the next one.
WS_HOSTS = [
    "wss://stream.binancefuture.com",   # verified delivering
    "wss://fstream.binance.com",        # documented, currently silent — kept as fallback
]
WS_PATH = "/stream?streams=!markPrice@arr@1s/!ticker@arr"
WS_URL = WS_HOSTS[0] + WS_PATH
WS_BLOB_KEY = "lq:terminal:ws"
WS_TTL = 120           # blob is refreshed every ~2s; TTL is a generous floor
_FLUSH_INTERVAL = 2.0
STALE_AFTER = 45       # no frame for this long while leader ⇒ the socket is deaf  # write to Redis at most every 2s (don't spam Redis)

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
        high = _f(it.get("h"))
        low = _f(it.get("l"))
        if price is not None:
            d["price"] = price
        if chg is not None:
            d["chg"] = chg
        if vol is not None:
            d["vol"] = vol
        # high/low are in the !ticker@arr payload already; carrying them lets
        # market.py serve batch prices straight from this blob instead of
        # spending a weight-40 REST call per request.
        if high is not None:
            d["high"] = high
        if low is not None:
            d["low"] = low


def _flush():
    try:
        cache_set(WS_BLOB_KEY, {"generated_at": time.time(), "pairs": dict(_state)}, ttl=WS_TTL)
    except Exception as e:
        print(f"🔌 Binance WS flush error: {type(e).__name__}: {e}")


async def binance_ws_loop():
    """Leader-elected WS ingest loop (auto-reconnect + backoff).

    Hardened after this worker sat silent for over 24 hours in production:
    connected at 16:40 on Jul 17, then never flushed, never disconnected and
    never logged again, while the blob every consumer reads FIRST simply never
    existed. Everything downstream quietly fell back to REST — which is how a
    weight-40 ticker call ended up in a user-facing route and got the server
    IP-banned.

    Three changes, all about never being blind again:
      · the leader/redis probe moved INSIDE the try. Raising there killed the
        asyncio task outright, and a dead create_task() reports nothing at all.
      · a staleness watchdog. A half-open socket delivers no frames and no
        error, so waiting for an exception can wait forever; if we hold
        leadership and have not flushed in STALE_AFTER seconds, drop the
        connection and rebuild it.
      · a heartbeat, so "no logs" stops being ambiguous between healthy and dead.
    """
    print("🔌 Binance WS worker started (markPrice + ticker)")
    backoff = 1
    last_beat = 0.0
    host_i = 0
    await asyncio.sleep(4)
    while True:
        try:
            if not is_leader() or not is_redis_available():
                if time.time() - last_beat > 300:
                    print("🔌 Binance WS idle (not leader or redis down)")
                    last_beat = time.time()
                await asyncio.sleep(15)
                continue

            url = WS_HOSTS[host_i % len(WS_HOSTS)] + WS_PATH
            async with websockets.connect(
                url, ping_interval=20, ping_timeout=20, close_timeout=5,
                max_size=16 * 1024 * 1024,
            ) as ws:
                print(f"🔌 Binance WS connected ({WS_HOSTS[host_i % len(WS_HOSTS)]})")
                backoff = 1
                last_flush = 0.0
                got_any = False
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=STALE_AFTER)
                    except asyncio.TimeoutError:
                        # Connected but deaf — the failure mode that hid for a day.
                        host_i += 1   # deaf host → try the other one
                        print(f"🔌 Binance WS silent for {STALE_AFTER}s — switching host")
                        break
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
                    # Flush the first batch immediately so the blob exists within
                    # seconds of connecting, not one interval later.
                    if not got_any or now - last_flush >= _FLUSH_INTERVAL:
                        _flush()
                        last_flush = now
                        if not got_any:
                            got_any = True
                            print(f"🔌 Binance WS blob live ({len(_state)} symbols)")
                    if now - last_beat > 300:
                        print(f"🔌 Binance WS heartbeat — {len(_state)} symbols")
                        last_beat = now
        except Exception as e:
            print(f"🔌 Binance WS disconnected: {type(e).__name__}: {e} — reconnect in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
