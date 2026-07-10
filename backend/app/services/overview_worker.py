"""
LuxQuant Terminal - Overview Page Background Cache Worker
Pre-computes data for the Overview dashboard page.

OPTIMIZED v2:
- Exponential backoff for Binance Futures (Indonesia block)
- Stale cache fallback via cache_set dual-write
- Log suppression after first consecutive error
"""
import asyncio
import time
import traceback
import os
import httpx
from datetime import datetime
from app.core.redis import cache_set, cache_get, is_redis_available

# Import shared failure tracker from cache_worker
from app.services.cache_worker import _tracker
from app.core.leader import is_leader  # single-leader gate (avoid N× duplicate API calls)

# APIs
COINGECKO_API = "https://api.coingecko.com/api/v3"
BINANCE_FUTURES_API = "https://fapi.binance.com"
FEAR_GREED_API = "https://api.alternative.me/fng"

CG_API_KEY = os.getenv("COINGECKO_API_KEY", "")
CG_HEADERS = {"accept": "application/json"}
if CG_API_KEY:
    CG_HEADERS["x-cg-demo-api-key"] = CG_API_KEY

TIMEOUT = 15.0


# ============================================
# FETCH FUNCTIONS
# ============================================

async def fetch_categories():
    """Fetch top crypto categories/sectors from CoinGecko"""
    if _tracker.should_skip("coingecko_categories"):
        return None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(
                f"{COINGECKO_API}/coins/categories",
                params={"order": "market_cap_change_24h_desc"},
                headers=CG_HEADERS,
            )
            if res.status_code != 200:
                _tracker.record_failure("coingecko_categories", Exception(f"HTTP {res.status_code}"), base_interval=300)
                return None

            raw = res.json()
            categories = []
            for cat in raw:
                mcap = cat.get("market_cap", 0) or 0
                if mcap < 1_000_000:
                    continue
                categories.append({
                    "id": cat.get("id", ""),
                    "name": cat.get("name", ""),
                    "market_cap": mcap,
                    "market_cap_change_24h": cat.get("market_cap_change_24h", 0) or 0,
                    "volume_24h": cat.get("total_volume", 0) or 0,
                    "top_3_coins": cat.get("top_3_coins", [])[:3],
                    "updated_at": cat.get("updated_at", ""),
                })

            categories.sort(key=lambda x: abs(x["market_cap_change_24h"]), reverse=True)
            _tracker.record_success("coingecko_categories")
            return categories[:30]
    except Exception as e:
        _tracker.record_failure("coingecko_categories", e, base_interval=300)
        return None


async def fetch_trending():
    """Fetch trending coins & categories from CoinGecko"""
    if _tracker.should_skip("coingecko_trending"):
        return None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{COINGECKO_API}/search/trending", headers=CG_HEADERS)
            if res.status_code != 200:
                _tracker.record_failure("coingecko_trending", Exception(f"HTTP {res.status_code}"), base_interval=300)
                return None

            data = res.json()
            _tracker.record_success("coingecko_trending")
            return {
                "coins": [
                    {
                        "id": c["item"]["id"],
                        "name": c["item"]["name"],
                        "symbol": c["item"]["symbol"],
                        "market_cap_rank": c["item"].get("market_cap_rank"),
                        "thumb": c["item"].get("thumb", ""),
                        "price_btc": c["item"].get("price_btc", 0),
                    }
                    for c in data.get("coins", [])[:7]
                ],
                "categories": [
                    {
                        "id": cat.get("id"),
                        "name": cat.get("name"),
                        "market_cap_1h_change": cat.get("data", {}).get(
                            "market_cap_change_percentage_24h", {}
                        ).get("usd", 0) if isinstance(cat.get("data"), dict) else 0,
                    }
                    for cat in data.get("categories", [])[:5]
                ],
            }
    except Exception as e:
        _tracker.record_failure("coingecko_trending", e, base_interval=300)
        return None


async def fetch_derivatives_pulse():
    """
    Fetch aggregated derivatives data from Binance Futures.
    With exponential backoff when Binance is blocked.
    """
    if _tracker.should_skip("binance_derivatives"):
        return None
    # shared Binance fapi cooldown (lazy import avoids any circular-import order issue)
    from app.services.terminal_worker import _fapi_ok, _note_ban
    # realtime WS funding/mark first (zero REST weight); REST only when WS is cold
    ws = cache_get("lq:terminal:ws") or {}
    ws_pairs = ws.get("pairs") or {}
    ws_fresh = bool(ws_pairs) and (time.time() - (ws.get("generated_at") or 0) < 30)
    if not ws_fresh and not _fapi_ok():
        return None  # global Binance fapi cooldown active — do NOT poke a live ban

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # 1. Funding + mark — from WS if fresh, else REST premiumIndex
            if ws_fresh:
                premium_data = [
                    {"symbol": s, "lastFundingRate": d.get("funding") or 0, "markPrice": d.get("mark") or 0}
                    for s, d in ws_pairs.items() if d.get("funding") is not None
                ]
            else:
                premium_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex")
                premium_res.raise_for_status()
                premium_data = premium_res.json()

            all_funding = []
            for item in premium_data:
                sym = item.get("symbol", "")
                if not sym.endswith("USDT"):
                    continue
                rate = float(item.get("lastFundingRate", 0))
                mark_price = float(item.get("markPrice", 0))
                all_funding.append({
                    "symbol": sym.replace("USDT", ""),
                    "rate": rate,
                    "rate_pct": round(rate * 100, 4),
                    "mark_price": mark_price,
                })

            all_funding.sort(key=lambda x: x["rate"], reverse=True)
            top_positive = all_funding[:5]
            top_negative = all_funding[-5:][::-1]

            # 2. Long/short ratio BTC & ETH
            ls_results = {}
            for sym in ["BTCUSDT", "ETHUSDT"]:
                try:
                    ls_res = await client.get(
                        f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
                        params={"symbol": sym, "period": "5m", "limit": 1},
                    )
                    ls_data = ls_res.json()
                    if ls_data and isinstance(ls_data, list):
                        ls_results[sym.replace("USDT", "")] = {
                            "long": round(float(ls_data[0]["longAccount"]) * 100, 1),
                            "short": round(float(ls_data[0]["shortAccount"]) * 100, 1),
                            "ratio": float(ls_data[0]["longShortRatio"]),
                        }
                except Exception:
                    continue

            # 3. Aggregated OI for top coins
            oi_results = []
            for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"]:
                try:
                    oi_res = await client.get(
                        f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
                        params={"symbol": sym},
                    )
                    price_res = await client.get(
                        f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price",
                        params={"symbol": sym},
                    )
                    if oi_res.status_code == 200 and price_res.status_code == 200:
                        oi = float(oi_res.json()["openInterest"])
                        price = float(price_res.json()["price"])
                        oi_results.append({
                            "symbol": sym.replace("USDT", ""),
                            "oi_usd": round(oi * price, 0),
                        })
                except Exception:
                    continue

            total_oi = sum(x["oi_usd"] for x in oi_results)

            _tracker.record_success("binance_derivatives")
            return {
                "funding": {
                    "most_long": top_positive,
                    "most_short": top_negative,
                    "total_symbols": len(all_funding),
                    "avg_rate": round(
                        sum(f["rate"] for f in all_funding)
                        / max(len(all_funding), 1)
                        * 100,
                        4,
                    ),
                },
                "longShort": ls_results,
                "openInterest": {
                    "total_usd": total_oi,
                    "breakdown": oi_results,
                },
                "timestamp": datetime.utcnow().isoformat(),
            }
    except Exception as e:
        resp = getattr(e, "response", None)
        if resp is not None and getattr(resp, "status_code", None) in (418, 429):
            # honor + SHARE the ban so terminal_worker also backs off; long base
            # interval so we never re-poke a live Binance ban (which extends it)
            _note_ban(resp, 900)
            _tracker.record_failure("binance_derivatives", e, base_interval=900)
        else:
            _tracker.record_failure("binance_derivatives", e, base_interval=60)
        return None


# ============================================
# WORKER LOOPS
# ============================================

async def overview_coingecko_loop():
    """Pre-compute CoinGecko-based Overview data.
    CHANGED: interval 300s -> 900s (categories/trending change slowly) to cut
    CoinGecko quota usage."""
    interval = 900
    print(f"🔄 Overview CoinGecko worker started (interval: {interval}s)")
    await asyncio.sleep(8)

    while True:
        if not is_leader():
            await asyncio.sleep(15)   # standby — re-check leadership quickly
            continue
        try:
            if not is_redis_available():
                await asyncio.sleep(interval)
                continue

            start = time.time()
            cached = 0
            ttl = interval + 30

            categories = await fetch_categories()
            if categories:
                cache_set("lq:market:categories", categories, ttl=ttl)
                cached += 1

            await asyncio.sleep(3)

            trending = await fetch_trending()
            if trending:
                cache_set("lq:market:trending", trending, ttl=ttl)
                cached += 1

            elapsed = round((time.time() - start) * 1000)
            print(f"✅ Overview CoinGecko: {cached} keys in {elapsed}ms")
        except Exception as e:
            print(f"❌ Overview CoinGecko worker error: {type(e).__name__}: {e}")
            traceback.print_exc()

        await asyncio.sleep(interval)


async def overview_derivatives_loop():
    """Pre-compute Binance derivatives data every 60s with backoff."""
    print("🔄 Overview Derivatives worker started (interval: 60s)")
    await asyncio.sleep(6)

    while True:
        if not is_leader():
            await asyncio.sleep(15)   # standby — re-check leadership quickly
            continue
        try:
            if not is_redis_available():
                await asyncio.sleep(60)
                continue

            start = time.time()
            cached = 0

            deriv = await fetch_derivatives_pulse()
            if deriv:
                cache_set("lq:market:deriv-pulse", deriv, ttl=70)
                cached += 1

            elapsed = round((time.time() - start) * 1000)
            if cached > 0:
                print(f"✅ Overview Derivatives: {cached} keys in {elapsed}ms")
            # Don't log "0 keys" when backoff is active — reduce noise

        except Exception as e:
            print(f"❌ Overview Derivatives worker error: {type(e).__name__}: {e}")
            traceback.print_exc()

        await asyncio.sleep(60)


def start_overview_workers():
    """Start Overview page background workers"""
    loop = asyncio.get_event_loop()
    loop.create_task(overview_coingecko_loop())
    loop.create_task(overview_derivatives_loop())
    print("📊 Overview workers registered (categories: 300s, derivatives: 60s)")