"""
Market Data Router - Proxy for Binance & CoinGecko APIs (bypass CORS)
With Redis caching (pre-computed by background worker)
Falls back to direct API call if cache miss
UPDATED: /overview has fallback to Binance Spot if Futures unavailable
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any
import httpx
import asyncio
import time
from pydantic import BaseModel
from datetime import datetime
from app.core.redis import cache_get, cache_set, cache_get_with_stale

router = APIRouter(tags=["market"])

# API endpoints
BINANCE_SPOT_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"
COINGECKO_API = "https://api.coingecko.com/api/v3"
FEAR_GREED_API = "https://api.alternative.me/fng"

# CoinGecko Demo API Key
import os
CG_API_KEY = os.getenv("COINGECKO_API_KEY", "CG-Cj4mhiz6QhsQZnfD4Ukd7QRH")
CG_HEADERS = {"accept": "application/json", "x-cg-demo-api-key": CG_API_KEY}

TIMEOUT = 15.0


# ============ Response Models ============

class BtcTickerResponse(BaseModel):
    price: float
    high_24h: float
    low_24h: float
    volume_24h: float
    price_change_24h: float
    price_change_pct: float

class FundingRateItem(BaseModel):
    symbol: str
    rate: float
    time: int

class LongShortRatioResponse(BaseModel):
    symbol: str
    longAccount: float
    shortAccount: float
    longShortRatio: float
    timestamp: int

class OpenInterestResponse(BaseModel):
    symbol: str
    openInterest: float
    openInterestUsd: float

class OIHistoryItem(BaseModel):
    timestamp: int
    sumOpenInterest: float
    sumOpenInterestValue: float


# ============================================================
# COINGECKO PROXY ENDPOINTS (cached by background worker)
# ============================================================

@router.get("/bitcoin")
async def get_bitcoin_data():
    """Bitcoin data from CoinGecko (cached 120s by worker)"""
    cached = cache_get("lq:market:bitcoin")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            btc_task = client.get(f"{COINGECKO_API}/coins/bitcoin", params={"localization":"false","tickers":"false","community_data":"false","developer_data":"false"}, headers=CG_HEADERS)
            global_task = client.get(f"{COINGECKO_API}/global", headers=CG_HEADERS)
            fg_task = client.get(f"{FEAR_GREED_API}/?limit=1")
            btc_res, global_res, fg_res = await asyncio.gather(btc_task, global_task, fg_task, return_exceptions=True)

            btc_data = btc_res.json() if not isinstance(btc_res, Exception) and btc_res.status_code == 200 else None
            global_data = global_res.json().get("data") if not isinstance(global_res, Exception) and global_res.status_code == 200 else None
            fear_greed = {"value": 50, "label": "Neutral"}
            if not isinstance(fg_res, Exception) and fg_res.status_code == 200:
                fg = fg_res.json()
                if fg.get("data") and len(fg["data"]) > 0:
                    fear_greed = {"value": int(fg["data"][0]["value"]), "label": fg["data"][0]["value_classification"]}

            if not btc_data:
                stale, _ = cache_get_with_stale("lq:market:bitcoin")
                if stale:
                    return stale
                raise HTTPException(status_code=502, detail="Failed to fetch Bitcoin data")

            md = btc_data.get("market_data", {})
            result = {
                "price": md.get("current_price",{}).get("usd",0),
                "priceChange24h": md.get("price_change_percentage_24h",0),
                "priceChange7d": md.get("price_change_percentage_7d",0),
                "priceChange30d": md.get("price_change_percentage_30d",0),
                "high24h": md.get("high_24h",{}).get("usd",0),
                "low24h": md.get("low_24h",{}).get("usd",0),
                "ath": md.get("ath",{}).get("usd",0),
                "athChange": md.get("ath_change_percentage",{}).get("usd",0),
                "marketCap": md.get("market_cap",{}).get("usd",0),
                "marketCapRank": btc_data.get("market_cap_rank",1),
                "volume24h": md.get("total_volume",{}).get("usd",0),
                "circulatingSupply": md.get("circulating_supply",0),
                "maxSupply": md.get("max_supply") or 21000000,
                "dominance": global_data.get("market_cap_percentage",{}).get("btc",0) if global_data else 0,
                "fearGreed": fear_greed,
            }
            cache_set("lq:market:bitcoin", result, ttl=120)
            return result
    except HTTPException:
        raise
    except Exception as e:
        stale, _ = cache_get_with_stale("lq:market:bitcoin")
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"CoinGecko API error: {str(e)}")


@router.get("/coins")
async def get_coins_market(
    per_page: int = Query(100, ge=1, le=250),
    page: int = Query(1, ge=1),
    order: str = Query("market_cap_desc")
):
    """Coins market data (cached 120s by worker)"""
    cache_key = f"lq:market:coins:{per_page}:{page}:{order}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{COINGECKO_API}/coins/markets", params={
                "vs_currency":"usd","order":order,"per_page":per_page,"page":page,
                "sparkline":"false","price_change_percentage":"1h,24h,7d"
            }, headers=CG_HEADERS)
            if response.status_code == 429:
                stale, _ = cache_get_with_stale(cache_key)
                if stale:
                    return stale
                raise HTTPException(status_code=429, detail="CoinGecko rate limit exceeded")
            response.raise_for_status()
            result = response.json()
            cache_set(cache_key, result, ttl=120)
            return result
    except HTTPException:
        raise
    except Exception as e:
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"CoinGecko API error: {str(e)}")


@router.get("/global")
async def get_global_data():
    """Global market data (cached 120s by worker)"""
    cached = cache_get("lq:market:global")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            global_res, coins_res, fg_res = await asyncio.gather(
                client.get(f"{COINGECKO_API}/global", headers=CG_HEADERS),
                client.get(f"{COINGECKO_API}/coins/markets", params={"vs_currency":"usd","order":"market_cap_desc","per_page":20,"page":1,"sparkline":"false","price_change_percentage":"24h,7d"}, headers=CG_HEADERS),
                client.get(f"{FEAR_GREED_API}/?limit=7"),
                return_exceptions=True,
            )
            global_data = global_res.json().get("data") if not isinstance(global_res, Exception) and global_res.status_code == 200 else None
            coins_data = coins_res.json() if not isinstance(coins_res, Exception) and coins_res.status_code == 200 else []
            fear_greed = {"value":50,"label":"Neutral","yesterday":50,"lastWeek":50}
            if not isinstance(fg_res, Exception) and fg_res.status_code == 200:
                fg = fg_res.json()
                if fg.get("data") and len(fg["data"])>0:
                    fear_greed = {"value":int(fg["data"][0]["value"]),"label":fg["data"][0]["value_classification"],
                        "yesterday":int(fg["data"][1]["value"]) if len(fg["data"])>1 else 50,
                        "lastWeek":int(fg["data"][6]["value"]) if len(fg["data"])>6 else 50}
            result = {"global": global_data, "coins": coins_data, "fearGreed": fear_greed}
            cache_set("lq:market:global", result, ttl=120)
            return result
    except Exception as e:
        stale, _ = cache_get_with_stale("lq:market:global")
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"API error: {str(e)}")


# ============================================================
# BINANCE PROXY ENDPOINTS (cached by background worker)
# ============================================================

@router.get("/btc-ticker", response_model=BtcTickerResponse)
async def get_btc_ticker():
    """BTC ticker (cached 15s by worker)"""
    cached = cache_get("lq:market:btc-ticker")
    if cached:
        return BtcTickerResponse(**cached)

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol": "BTCUSDT"})
            response.raise_for_status()
            data = response.json()
            result = {"price":float(data["lastPrice"]),"high_24h":float(data["highPrice"]),"low_24h":float(data["lowPrice"]),
                "volume_24h":float(data["quoteVolume"]),"price_change_24h":float(data["priceChange"]),"price_change_pct":float(data["priceChangePercent"])}
            cache_set("lq:market:btc-ticker", result, ttl=15)
            return BtcTickerResponse(**result)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/funding-rates", response_model=List[FundingRateItem])
async def get_funding_rates(symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"):
    """Funding rates (cached 15s by worker for default symbols)"""
    if symbols == "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT":
        cached = cache_get("lq:market:funding-rates")
        if cached:
            return [FundingRateItem(**item) for item in cached]

    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = []
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for symbol in symbol_list:
            try:
                response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate", params={"symbol": symbol, "limit": 1})
                response.raise_for_status()
                data = response.json()
                if data:
                    results.append(FundingRateItem(symbol=symbol.replace("USDT",""), rate=float(data[0]["fundingRate"]), time=int(data[0]["fundingTime"])))
            except: continue
    return results


@router.get("/funding-rate/{symbol}")
async def get_single_funding_rate(symbol: str = "BTCUSDT"):
    """Get funding rate for a single symbol"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate", params={"symbol": symbol.upper(), "limit": 1})
            response.raise_for_status()
            data = response.json()
            if data:
                return {"symbol": symbol.replace("USDT",""), "rate": float(data[0]["fundingRate"]), "time": int(data[0]["fundingTime"])}
            return None
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/long-short-ratio", response_model=LongShortRatioResponse)
async def get_long_short_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """Long/short ratio (cached 15s by worker for BTCUSDT)"""
    if symbol.upper() == "BTCUSDT" and period == "5m":
        cached = cache_get("lq:market:long-short-ratio")
        if cached:
            return LongShortRatioResponse(**cached)

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio", params={"symbol":symbol.upper(),"period":period,"limit":1})
            response.raise_for_status()
            data = response.json()
            if data:
                return LongShortRatioResponse(symbol=symbol, longAccount=float(data[0]["longAccount"]), shortAccount=float(data[0]["shortAccount"]),
                    longShortRatio=float(data[0]["longShortRatio"]), timestamp=int(data[0]["timestamp"]))
            raise HTTPException(status_code=404, detail="No data available")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/top-trader-ratio")
async def get_top_trader_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """Top trader long/short ratio"""
    cache_key = f"lq:market:top-trader:{symbol}:{period}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/topLongShortPositionRatio", params={"symbol":symbol.upper(),"period":period,"limit":1})
            response.raise_for_status()
            data = response.json()
            if data:
                result = {"symbol":symbol,"longAccount":float(data[0]["longAccount"]),"shortAccount":float(data[0]["shortAccount"]),
                    "longShortRatio":float(data[0]["longShortRatio"]),"timestamp":int(data[0]["timestamp"])}
                cache_set(cache_key, result, ttl=30)
                return result
            raise HTTPException(status_code=404, detail="No data available")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/open-interest", response_model=OpenInterestResponse)
async def get_open_interest(symbol: str = "BTCUSDT"):
    """Open interest (cached 15s by worker for BTCUSDT)"""
    if symbol.upper() == "BTCUSDT":
        cached = cache_get("lq:market:open-interest")
        if cached:
            return OpenInterestResponse(**cached)

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            oi_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol":symbol.upper()})
            oi_res.raise_for_status()
            price_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price", params={"symbol":symbol.upper()})
            price_res.raise_for_status()
            oi = float(oi_res.json()["openInterest"])
            price = float(price_res.json()["price"])
            return OpenInterestResponse(symbol=symbol, openInterest=oi, openInterestUsd=oi*price)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/open-interest-history", response_model=List[OIHistoryItem])
async def get_open_interest_history(symbol: str = "BTCUSDT", period: str = "1h", limit: int = 24):
    """OI history (cached 15s by worker for BTCUSDT 1h 24)"""
    if symbol.upper() == "BTCUSDT" and period == "1h" and limit == 24:
        cached = cache_get("lq:market:oi-history")
        if cached:
            return [OIHistoryItem(timestamp=i["timestamp"], sumOpenInterest=i.get("sumOpenInterest",0), sumOpenInterestValue=i["sumOpenInterestValue"]) for i in cached]

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/openInterestHist", params={"symbol":symbol.upper(),"period":period,"limit":min(limit,500)})
            response.raise_for_status()
            return [OIHistoryItem(timestamp=int(i["timestamp"]), sumOpenInterest=float(i["sumOpenInterest"]), sumOpenInterestValue=float(i["sumOpenInterestValue"])) for i in response.json()]
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/taker-volume")
async def get_taker_volume(symbol: str = "BTCUSDT", period: str = "5m", limit: int = 30):
    """Taker buy/sell volume ratio"""
    cache_key = f"lq:market:taker:{symbol}:{period}:{limit}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/takerlongshortRatio", params={"symbol":symbol.upper(),"period":period,"limit":min(limit,500)})
            response.raise_for_status()
            result = [{"timestamp":int(i["timestamp"]),"buyVol":float(i["buyVol"]),"sellVol":float(i["sellVol"]),"buySellRatio":float(i["buySellRatio"])} for i in response.json()]
            cache_set(cache_key, result, ttl=30)
            return result
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/prices")
async def get_batch_prices(symbols: str = "BTCUSDT,ETHUSDT"):
    """Batch prices from Binance (not cached - real-time). Tries Futures first, falls back to Spot."""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = {}
    failed = []
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Futures first
        for symbol in symbol_list:
            try:
                response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price", params={"symbol": symbol})
                if response.status_code == 200:
                    results[symbol] = float(response.json()["price"])
                else:
                    failed.append(symbol)
            except:
                failed.append(symbol)
        
        # Fallback to Spot for failed symbols
        if failed:
            for symbol in failed:
                try:
                    response = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/price", params={"symbol": symbol})
                    if response.status_code == 200:
                        results[symbol] = float(response.json()["price"])
                except:
                    continue
    
    return results


# ============================================================
# MARKET OVERVIEW - WITH FALLBACK
# ============================================================

async def _fetch_overview_full(client):
    """Try full overview from Binance Futures (production/VPS)"""
    btc_res = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol":"BTCUSDT"})
    btc_data = btc_res.json()
    btc_price = float(btc_data["lastPrice"])

    # Funding rates
    funding_rates = []
    for sym in ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]:
        try:
            fr = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate", params={"symbol":sym,"limit":1})
            d = fr.json()
            if d and isinstance(d, list): 
                funding_rates.append({"symbol":sym.replace("USDT",""),"rate":float(d[0]["fundingRate"]),"time":int(d[0]["fundingTime"])})
        except: continue

    # Long/short
    ls_res = await client.get(f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio", params={"symbol":"BTCUSDT","period":"5m","limit":1})
    ls_data = ls_res.json()
    long_short = {"symbol":"BTCUSDT","longAccount":float(ls_data[0]["longAccount"]),"shortAccount":float(ls_data[0]["shortAccount"]),"longShortRatio":float(ls_data[0]["longShortRatio"]),"timestamp":int(ls_data[0]["timestamp"])} if ls_data and isinstance(ls_data, list) else None

    # OI
    oi_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol":"BTCUSDT"})
    oi_val = float(oi_res.json()["openInterest"])

    # OI history
    oih = await client.get(f"{BINANCE_FUTURES_API}/futures/data/openInterestHist", params={"symbol":"BTCUSDT","period":"1h","limit":24})
    oi_hist = [{"timestamp":int(i["timestamp"]),"sumOpenInterestValue":float(i["sumOpenInterestValue"])} for i in oih.json()]

    return {
        "btc": {"price":btc_price,"high_24h":float(btc_data["highPrice"]),"low_24h":float(btc_data["lowPrice"]),
            "volume_24h":float(btc_data["quoteVolume"]),"price_change_24h":float(btc_data["priceChange"]),"price_change_pct":float(btc_data["priceChangePercent"])},
        "fundingRates": funding_rates, "longShortRatio": long_short,
        "openInterest": {"symbol":"BTCUSDT","openInterest":oi_val,"openInterestUsd":oi_val*btc_price},
        "oiHistory": oi_hist, "timestamp": datetime.utcnow().isoformat(),
        "source": "full",
    }


async def _fetch_overview_fallback(client):
    """Fallback: Binance Spot only (when Futures API is blocked/unavailable)"""
    # BTC from Spot
    btc_res = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol":"BTCUSDT"})
    btc_data = btc_res.json()
    btc_price = float(btc_data["lastPrice"])

    # Top coins from Spot
    top_symbols = ["ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"]
    top_coins = []
    for sym in top_symbols:
        try:
            res = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol": sym})
            if res.status_code == 200:
                d = res.json()
                top_coins.append({
                    "symbol": sym.replace("USDT",""),
                    "price": float(d["lastPrice"]),
                    "change_pct": float(d["priceChangePercent"]),
                    "volume_24h": float(d["quoteVolume"]),
                })
        except: continue

    return {
        "btc": {
            "price": btc_price,
            "high_24h": float(btc_data["highPrice"]),
            "low_24h": float(btc_data["lowPrice"]),
            "volume_24h": float(btc_data["quoteVolume"]),
            "price_change_24h": float(btc_data["priceChange"]),
            "price_change_pct": float(btc_data["priceChangePercent"]),
        },
        "fundingRates": [],
        "longShortRatio": None,
        "openInterest": None,
        "oiHistory": [],
        "topCoins": top_coins,
        "timestamp": datetime.utcnow().isoformat(),
        "source": "spot_fallback",
    }


@router.get("/overview")
async def get_market_overview():
    """
    Complete market overview.
    Strategy:
    1. Check Redis cache first
    2. Try full Binance Futures overview
    3. Fallback to Binance Spot if Futures unavailable
    """
    cached = cache_get("lq:market:overview")
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try full overview (Futures)
        try:
            result = await _fetch_overview_full(client)
            cache_set("lq:market:overview", result, ttl=15)
            return result
        except Exception as e:
            print(f"⚠️ Futures unavailable ({e}), falling back to Spot...")

        # Fallback to Spot only
        try:
            result = await _fetch_overview_fallback(client)
            cache_set("lq:market:overview", result, ttl=15)
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"All Binance APIs failed: {str(e)}")


# ============================================================
# SECTOR / CATEGORIES PERFORMANCE (CoinGecko)
# ============================================================

@router.get("/categories")
async def get_categories(limit: int = Query(10, ge=1, le=50)):
    """
    Top crypto sectors/narratives sorted by 24h market cap change.
    From CoinGecko /coins/categories (free with demo key).
    Cached 300s (5min) to conserve API calls.
    """
    cached = cache_get("lq:market:categories")
    if cached:
        # Return limited
        return cached[:limit]

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{COINGECKO_API}/coins/categories",
                params={"order": "market_cap_change_24h_desc"},
                headers=CG_HEADERS
            )
            if response.status_code == 429:
                stale, _ = cache_get_with_stale("lq:market:categories")
                if stale:
                    return stale[:limit]
                raise HTTPException(status_code=429, detail="CoinGecko rate limit")
            response.raise_for_status()
            raw = response.json()

            # Filter out categories with very small or no data
            categories = []
            for cat in raw:
                mcap = cat.get("market_cap", 0) or 0
                if mcap < 1_000_000:  # Skip tiny categories
                    continue
                categories.append({
                    "id": cat.get("id", ""),
                    "name": cat.get("name", ""),
                    "market_cap": mcap,
                    "market_cap_change_24h": cat.get("market_cap_change_24h", 0) or 0,
                    "volume_24h": cat.get("content", {}).get("total_volume", 0) if isinstance(cat.get("content"), dict) else (cat.get("total_volume", 0) or 0),
                    "top_3_coins": cat.get("top_3_coins", [])[:3],
                    "updated_at": cat.get("updated_at", ""),
                })

            # Sort by absolute 24h change (most movement = most interesting)
            categories.sort(key=lambda x: abs(x["market_cap_change_24h"]), reverse=True)

            # Cache top 30
            cache_set("lq:market:categories", categories[:30], ttl=300)
            return categories[:limit]

    except HTTPException:
        raise
    except Exception as e:
        stale, _ = cache_get_with_stale("lq:market:categories")
        if stale:
            return stale[:limit]
        raise HTTPException(status_code=502, detail=f"Categories API error: {str(e)}")


@router.get("/trending-categories")
async def get_trending_categories():
    """
    Trending searched categories on CoinGecko (last 24h).
    From /search/trending endpoint.
    """
    cached = cache_get("lq:market:trending")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{COINGECKO_API}/search/trending", headers=CG_HEADERS)
            if response.status_code == 429:
                stale, _ = cache_get_with_stale("lq:market:trending")
                if stale:
                    return stale
                raise HTTPException(status_code=429, detail="CoinGecko rate limit")
            response.raise_for_status()
            data = response.json()

            result = {
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
                        "market_cap_1h_change": cat.get("data", {}).get("market_cap_change_percentage_24h", {}).get("usd", 0) if isinstance(cat.get("data"), dict) else 0,
                    }
                    for cat in data.get("categories", [])[:5]
                ],
            }
            cache_set("lq:market:trending", result, ttl=300)
            return result

    except HTTPException:
        raise
    except Exception as e:
        stale, _ = cache_get_with_stale("lq:market:trending")
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"Trending API error: {str(e)}")


# ============================================================
# DERIVATIVES PULSE (Binance Futures - all free, no key)
# ============================================================

@router.get("/derivatives-pulse")
async def get_derivatives_pulse():
    """
    Aggregated derivatives data:
    - Top 10 funding rates (highest & lowest)
    - Global long/short ratio
    - Total aggregated open interest for top coins
    All from Binance Futures API (free, no key needed).
    Cached 60s.
    """
    cached = cache_get("lq:market:deriv-pulse")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # 1. Get ALL premium index (funding rates for all symbols)
            premium_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex")
            premium_res.raise_for_status()
            premium_data = premium_res.json()

            # Parse funding rates
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

            # Sort: top positive (most longs) and top negative (most shorts)
            all_funding.sort(key=lambda x: x["rate"], reverse=True)
            top_positive = all_funding[:5]  # Most bullish sentiment
            top_negative = all_funding[-5:][::-1]  # Most bearish sentiment

            # 2. Global long/short for BTC & ETH
            ls_results = {}
            for sym in ["BTCUSDT", "ETHUSDT"]:
                try:
                    ls_res = await client.get(
                        f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
                        params={"symbol": sym, "period": "5m", "limit": 1}
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
                    oi_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol": sym})
                    price_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price", params={"symbol": sym})
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

            result = {
                "funding": {
                    "most_long": top_positive,
                    "most_short": top_negative,
                    "total_symbols": len(all_funding),
                    "avg_rate": round(sum(f["rate"] for f in all_funding) / max(len(all_funding), 1) * 100, 4),
                },
                "longShort": ls_results,
                "openInterest": {
                    "total_usd": total_oi,
                    "breakdown": oi_results,
                },
                "timestamp": datetime.utcnow().isoformat(),
            }
            cache_set("lq:market:deriv-pulse", result, ttl=60)
            return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Derivatives pulse error: {str(e)}")


# ============================================
# BITCOIN EXTENDED DATA (from cache worker)
# ============================================

@router.get("/bitcoin/technical")
async def get_btc_technical():
    """BTC technical indicators (RSI, MACD, BB, EMA) for multi-timeframes"""
    cached = cache_get("lq:bitcoin:technical")
    if cached:
        return cached
    raise HTTPException(status_code=503, detail="Technical data not ready yet")


@router.get("/bitcoin/network")
async def get_btc_network():
    """Bitcoin network health (hashrate, fees, mempool, difficulty)"""
    cached = cache_get("lq:bitcoin:network")
    if cached:
        return cached
    raise HTTPException(status_code=503, detail="Network data not ready yet")


@router.get("/bitcoin/onchain")
async def get_btc_onchain():
    """Bitcoin on-chain metrics (MVRV, NVT, active addresses)"""
    cached = cache_get("lq:bitcoin:onchain")
    if cached:
        return cached
    raise HTTPException(status_code=503, detail="On-chain data not ready yet")


@router.get("/bitcoin/news")
async def get_btc_news():
    """Latest Bitcoin news from RSS feeds"""
    cached = cache_get("lq:bitcoin:news")
    if cached:
        return cached
    raise HTTPException(status_code=503, detail="News data not ready yet")


@router.get("/bitcoin/full")
async def get_btc_full():
    """All Bitcoin page data in one request"""
    return {
        "technical": cache_get("lq:bitcoin:technical"),
        "network": cache_get("lq:bitcoin:network"),
        "onchain": cache_get("lq:bitcoin:onchain"),
        "news": cache_get("lq:bitcoin:news"),
    }