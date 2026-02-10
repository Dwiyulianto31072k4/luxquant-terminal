# backend/app/services/overview_worker.py
"""
LuxQuant Terminal - Overview Page Background Cache Worker
Pre-computes data specifically for the Overview dashboard page.

Endpoints cached:
  - /market/categories       → CoinGecko categories (sector performance)
  - /market/trending-categories → CoinGecko trending
  - /market/derivatives-pulse → Binance Futures aggregated data
  - Fear & Greed historical  → Alternative.me (already in coingecko_cache_loop, but refreshed here too)

Intervals:
  - Categories + Trending: every 300s (5min) — CoinGecko rate limit friendly
  - Derivatives Pulse: every 60s — Binance has no rate limit
"""
import asyncio
import time
import os
import httpx
from datetime import datetime
from app.core.redis import cache_set, is_redis_available

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
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(
                f"{COINGECKO_API}/coins/categories",
                params={"order": "market_cap_change_24h_desc"},
                headers=CG_HEADERS,
            )
            if res.status_code != 200:
                print(f"⚠️ Categories API returned {res.status_code}")
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
            return categories[:30]
    except Exception as e:
        print(f"❌ Categories fetch error: {e}")
        return None


async def fetch_trending():
    """Fetch trending coins & categories from CoinGecko"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{COINGECKO_API}/search/trending", headers=CG_HEADERS)
            if res.status_code != 200:
                print(f"⚠️ Trending API returned {res.status_code}")
                return None

            data = res.json()
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
        print(f"❌ Trending fetch error: {e}")
        return None


async def fetch_derivatives_pulse():
    """Fetch aggregated derivatives data from Binance Futures"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # 1. Premium index (all funding rates)
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
                except:
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
                except:
                    continue

            total_oi = sum(x["oi_usd"] for x in oi_results)

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
        print(f"❌ Derivatives pulse fetch error: {e}")
        return None


# ============================================
# WORKER LOOPS
# ============================================

async def overview_coingecko_loop():
    """
    Pre-compute CoinGecko-based Overview data every 300s.
    - Categories (sector performance)
    - Trending categories & coins
    
    Staggered requests with 3s gap to respect rate limits.
    Uses 2 API calls per cycle = ~576/day (well under 10,000/month limit).
    """
    print("🔄 Overview CoinGecko worker started (interval: 300s)")
    await asyncio.sleep(8)  # Stagger after other workers

    while True:
        try:
            if not is_redis_available():
                await asyncio.sleep(300)
                continue

            start = time.time()
            cached = 0

            # Categories
            categories = await fetch_categories()
            if categories:
                cache_set("lq:market:categories", categories, ttl=310)
                cached += 1
            
            await asyncio.sleep(3)  # Rate limit gap

            # Trending
            trending = await fetch_trending()
            if trending:
                cache_set("lq:market:trending", trending, ttl=310)
                cached += 1

            elapsed = round((time.time() - start) * 1000)
            print(f"✅ Overview CoinGecko: {cached} keys in {elapsed}ms")
        except Exception as e:
            print(f"❌ Overview CoinGecko worker error: {e}")

        await asyncio.sleep(300)


async def overview_derivatives_loop():
    """
    Pre-compute Binance derivatives data every 60s.
    - Funding rates (all symbols)
    - Long/Short ratio (BTC, ETH)
    - Open Interest (top 5)
    
    Binance has no rate limit for these endpoints.
    """
    print("🔄 Overview Derivatives worker started (interval: 60s)")
    await asyncio.sleep(6)  # Stagger

    while True:
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
            print(f"✅ Overview Derivatives: {cached} keys in {elapsed}ms")
        except Exception as e:
            print(f"❌ Overview Derivatives worker error: {e}")

        await asyncio.sleep(60)


# ============================================
# ENTRY POINT — call from main.py startup
# ============================================

def start_overview_workers():
    """Start Overview page background workers"""
    loop = asyncio.get_event_loop()
    loop.create_task(overview_coingecko_loop())
    loop.create_task(overview_derivatives_loop())
    print("📊 Overview workers registered (categories: 300s, derivatives: 60s)")