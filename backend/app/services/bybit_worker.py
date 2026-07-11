"""
Bybit derivatives worker — funding / OI / price / volume in ONE call.

WHY: Binance futures REST is heavily IP-rate-limited from this server (recurring
418 bans) and its market WebSocket is suppressed for this IP. Bybit is a
different exchange (not affected by Binance bans) and its public endpoint
`GET /v5/market/tickers?category=linear` returns EVERYTHING we need for every
USDT perp in a SINGLE request:

    lastPrice · markPrice · price24hPcnt · turnover24h (quote vol) ·
    openInterest · openInterestValue (USD) · fundingRate

So this one cheap call replaces Binance's premiumIndex + ticker/24hr + the
120-call open-interest pass. terminal_worker reads this blob FIRST.

Output: Redis blob  lq:terminal:bybit
    { generated_at, n, pairs: { "<SYMBOL>": {price, mark, funding, chg, vol, oi} } }

Public market data on Bybit is IP-limited but very generous; one call / 30s is
nothing. Leader-gated + graceful failure. Registered from cache_worker.
"""
import asyncio
import time

import httpx

from app.core.redis import cache_set, is_redis_available
from app.core.leader import is_leader

BYBIT_API = "https://api.bybit.com"
BYBIT_BLOB_KEY = "lq:terminal:bybit"
INTERVAL = 30              # 1 cheap call → refresh often
BLOB_TTL = INTERVAL + 300  # generous floor; cache_set also keeps a stale copy


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def _fetch(client):
    r = await client.get(f"{BYBIT_API}/v5/market/tickers", params={"category": "linear"})
    if r.status_code != 200:
        print(f"⚠️ Bybit tickers HTTP {r.status_code}")
        return None
    data = r.json()
    if data.get("retCode") != 0:
        print(f"⚠️ Bybit retCode {data.get('retCode')}: {data.get('retMsg')}")
        return None
    out = {}
    for it in data.get("result", {}).get("list", []) or []:
        sym = it.get("symbol")
        if not sym or not sym.endswith("USDT"):
            continue
        price = _f(it.get("lastPrice"))
        if price is None:
            continue
        pcnt = _f(it.get("price24hPcnt"))
        mark = _f(it.get("markPrice"))
        idx = _f(it.get("indexPrice"))
        # perp premium / basis: how far the perp trades above/below index (%)
        basis = round((mark - idx) / idx * 100, 4) if (mark and idx) else None
        # 24h realized range as % of price → daily-range exhaustion (ATR levels)
        h24 = _f(it.get("highPrice24h"))
        l24 = _f(it.get("lowPrice24h"))
        range24 = round((h24 - l24) / price * 100, 3) if (h24 and l24 and price) else None
        out[sym] = {
            "price": price,
            "mark": mark,
            "index": idx,
            "basis": basis,
            "range24": range24,
            "funding": _f(it.get("fundingRate")),
            "chg": round(pcnt * 100, 4) if pcnt is not None else None,
            "vol": _f(it.get("turnover24h")),          # quote (USD) 24h volume
            "oi": _f(it.get("openInterestValue")),      # OI in USD notional
        }
    return out


async def bybit_deriv_loop():
    """Leader-elected loop — one tickers call → Redis blob."""
    print("🟣 Bybit derivatives worker started (tickers, 1 call / 30s)")
    await asyncio.sleep(3)
    while True:
        if not is_leader() or not is_redis_available():
            await asyncio.sleep(15)
            continue
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                pairs = await _fetch(client)
            if pairs:
                cache_set(BYBIT_BLOB_KEY, {
                    "generated_at": time.time(),
                    "n": len(pairs),
                    "pairs": pairs,
                }, ttl=BLOB_TTL)
        except Exception as e:
            print(f"⚠️ Bybit worker error: {type(e).__name__}: {e}")
        await asyncio.sleep(INTERVAL)
