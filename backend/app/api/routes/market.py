"""
Market Data Router - Proxy for Binance & CoinGecko APIs (bypass CORS)
With Redis caching (pre-computed by background worker)
Falls back to direct API call if cache miss

OPTIMIZED v3:
- SHARED HTTP CLIENTS (no more per-request AsyncClient creation)
- STALE FALLBACK on ALL endpoints (never return 502 if we have old data)
- Config-driven timeouts
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any
import asyncio
import time
from pydantic import BaseModel
from datetime import datetime
from app.core.redis import cache_get, cache_set, cache_get_with_stale
from app.core.http_client import get_binance_client, get_coingecko_client, get_general_client

router = APIRouter(tags=["market"])

# API endpoints
BINANCE_SPOT_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"
COINGECKO_API = "https://api.coingecko.com/api/v3"
FEAR_GREED_API = "https://api.alternative.me/fng"

# CoinGecko Demo API Key
import os
CG_API_KEY = os.getenv("COINGECKO_API_KEY", "")
CG_HEADERS = {"accept": "application/json"}
if CG_API_KEY:
    CG_HEADERS["x-cg-demo-api-key"] = CG_API_KEY


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
    """Bitcoin data from CoinGecko (cached by worker)"""
    # Try fresh cache first
    cached = cache_get("lq:market:bitcoin")
    if cached:
        return cached

    # Cache miss — try direct fetch
    try:
        client = get_coingecko_client()
        btc_res, global_res, fg_res = await asyncio.gather(
            client.get(f"{COINGECKO_API}/coins/bitcoin", params={"localization":"false","tickers":"false","community_data":"false","developer_data":"false"}, headers=CG_HEADERS),
            client.get(f"{COINGECKO_API}/global", headers=CG_HEADERS),
            client.get(f"{FEAR_GREED_API}/?limit=1"),
            return_exceptions=True,
        )

        btc_data = btc_res.json() if not isinstance(btc_res, Exception) and btc_res.status_code == 200 else None
        global_data = global_res.json().get("data") if not isinstance(global_res, Exception) and global_res.status_code == 200 else None
        fear_greed = {"value": 50, "label": "Neutral"}
        if not isinstance(fg_res, Exception) and fg_res.status_code == 200:
            fg = fg_res.json()
            if fg.get("data") and len(fg["data"]) > 0:
                fear_greed = {"value": int(fg["data"][0]["value"]), "label": fg["data"][0]["value_classification"]}

        if not btc_data:
            # Direct fetch failed — try stale
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
    """Coins market data (cached by worker)"""
    cache_key = f"lq:market:coins:{per_page}:{page}:{order}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        client = get_coingecko_client()
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
    """Global market data (cached by worker, stale fallback on failure)"""
    cached = cache_get("lq:market:global")
    if cached:
        return cached

    try:
        client = get_coingecko_client()
        global_res, coins_res, fg_res = await asyncio.gather(
            client.get(f"{COINGECKO_API}/global", headers=CG_HEADERS),
            client.get(f"{COINGECKO_API}/coins/markets", params={"vs_currency":"usd","order":"market_cap_desc","per_page":20,"page":1,"sparkline":"false","price_change_percentage":"24h,7d"}, headers=CG_HEADERS),
            client.get(f"{FEAR_GREED_API}/?limit=7"),
            return_exceptions=True,
        )

        # Check for rate limiting
        for res in [global_res, coins_res]:
            if not isinstance(res, Exception) and res.status_code == 429:
                stale, _ = cache_get_with_stale("lq:market:global")
                if stale:
                    return stale
                raise HTTPException(status_code=429, detail="CoinGecko rate limit exceeded")

        global_data = global_res.json().get("data") if not isinstance(global_res, Exception) and global_res.status_code == 200 else None
        coins_data = coins_res.json() if not isinstance(coins_res, Exception) and coins_res.status_code == 200 else []

        if global_data is None and len(coins_data) == 0:
            stale, _ = cache_get_with_stale("lq:market:global")
            if stale:
                return stale

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

    except HTTPException:
        raise
    except Exception as e:
        stale, _ = cache_get_with_stale("lq:market:global")
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"Global market API error: {str(e)}")


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
        client = get_binance_client()
        response = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol": "BTCUSDT"})
        response.raise_for_status()
        data = response.json()
        result = {"price":float(data["lastPrice"]),"high_24h":float(data["highPrice"]),"low_24h":float(data["lowPrice"]),
            "volume_24h":float(data["quoteVolume"]),"price_change_24h":float(data["priceChange"]),"price_change_pct":float(data["priceChangePercent"])}
        cache_set("lq:market:btc-ticker", result, ttl=15)
        return BtcTickerResponse(**result)
    except Exception as e:
        # CHANGED: stale fallback instead of immediate 502
        stale, _ = cache_get_with_stale("lq:market:btc-ticker")
        if stale:
            return BtcTickerResponse(**stale)
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
    client = get_binance_client()
    for symbol in symbol_list:
        try:
            response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate", params={"symbol": symbol, "limit": 1})
            response.raise_for_status()
            data = response.json()
            if data:
                results.append(FundingRateItem(symbol=symbol.replace("USDT",""), rate=float(data[0]["fundingRate"]), time=int(data[0]["fundingTime"])))
        except: continue

    # CHANGED: if direct fetch failed completely, try stale
    if not results and symbols == "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT":
        stale, _ = cache_get_with_stale("lq:market:funding-rates")
        if stale:
            return [FundingRateItem(**item) for item in stale]

    return results


@router.get("/funding-rate/{symbol}")
async def get_single_funding_rate(symbol: str = "BTCUSDT"):
    """Get funding rate for a single symbol"""
    try:
        client = get_binance_client()
        response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate", params={"symbol": symbol.upper(), "limit": 1})
        response.raise_for_status()
        data = response.json()
        if data:
            return {"symbol": symbol.replace("USDT",""), "rate": float(data[0]["fundingRate"]), "time": int(data[0]["fundingTime"])}
        return None
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/long-short-ratio", response_model=LongShortRatioResponse)
async def get_long_short_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """Long/short ratio (cached 15s by worker for BTCUSDT)"""
    if symbol.upper() == "BTCUSDT" and period == "5m":
        cached = cache_get("lq:market:long-short-ratio")
        if cached:
            return LongShortRatioResponse(**cached)

    try:
        client = get_binance_client()
        response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio", params={"symbol":symbol.upper(),"period":period,"limit":1})
        response.raise_for_status()
        data = response.json()
        if data:
            return LongShortRatioResponse(symbol=symbol, longAccount=float(data[0]["longAccount"]), shortAccount=float(data[0]["shortAccount"]),
                longShortRatio=float(data[0]["longShortRatio"]), timestamp=int(data[0]["timestamp"]))
        raise HTTPException(status_code=404, detail="No data available")
    except HTTPException:
        raise
    except Exception as e:
        # CHANGED: stale fallback
        if symbol.upper() == "BTCUSDT" and period == "5m":
            stale, _ = cache_get_with_stale("lq:market:long-short-ratio")
            if stale:
                return LongShortRatioResponse(**stale)
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/top-trader-ratio")
async def get_top_trader_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """Top trader long/short ratio"""
    cache_key = f"lq:market:top-trader:{symbol}:{period}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        client = get_binance_client()
        response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/topLongShortPositionRatio", params={"symbol":symbol.upper(),"period":period,"limit":1})
        response.raise_for_status()
        data = response.json()
        if data:
            result = {"symbol":symbol,"longAccount":float(data[0]["longAccount"]),"shortAccount":float(data[0]["shortAccount"]),
                "longShortRatio":float(data[0]["longShortRatio"]),"timestamp":int(data[0]["timestamp"])}
            cache_set(cache_key, result, ttl=30)
            return result
        raise HTTPException(status_code=404, detail="No data available")
    except HTTPException:
        raise
    except Exception as e:
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/open-interest", response_model=OpenInterestResponse)
async def get_open_interest(symbol: str = "BTCUSDT"):
    """Open interest (cached 15s by worker for BTCUSDT)"""
    if symbol.upper() == "BTCUSDT":
        cached = cache_get("lq:market:open-interest")
        if cached:
            return OpenInterestResponse(**cached)

    try:
        client = get_binance_client()
        oi_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol":symbol.upper()})
        oi_res.raise_for_status()
        price_res = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price", params={"symbol":symbol.upper()})
        price_res.raise_for_status()
        oi = float(oi_res.json()["openInterest"])
        price = float(price_res.json()["price"])
        return OpenInterestResponse(symbol=symbol, openInterest=oi, openInterestUsd=oi*price)
    except Exception as e:
        # CHANGED: stale fallback
        if symbol.upper() == "BTCUSDT":
            stale, _ = cache_get_with_stale("lq:market:open-interest")
            if stale:
                return OpenInterestResponse(**stale)
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/open-interest-history", response_model=List[OIHistoryItem])
async def get_open_interest_history(symbol: str = "BTCUSDT", period: str = "1h", limit: int = 24):
    """OI history (cached 15s by worker for BTCUSDT 1h 24)"""
    if symbol.upper() == "BTCUSDT" and period == "1h" and limit == 24:
        cached = cache_get("lq:market:oi-history")
        if cached:
            return [OIHistoryItem(timestamp=i["timestamp"], sumOpenInterest=i.get("sumOpenInterest",0), sumOpenInterestValue=i["sumOpenInterestValue"]) for i in cached]

    try:
        client = get_binance_client()
        response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/openInterestHist", params={"symbol":symbol.upper(),"period":period,"limit":min(limit,500)})
        response.raise_for_status()
        return [OIHistoryItem(timestamp=int(i["timestamp"]), sumOpenInterest=float(i["sumOpenInterest"]), sumOpenInterestValue=float(i["sumOpenInterestValue"])) for i in response.json()]
    except Exception as e:
        # CHANGED: stale fallback
        if symbol.upper() == "BTCUSDT" and period == "1h" and limit == 24:
            stale, _ = cache_get_with_stale("lq:market:oi-history")
            if stale:
                return [OIHistoryItem(timestamp=i["timestamp"], sumOpenInterest=i.get("sumOpenInterest",0), sumOpenInterestValue=i["sumOpenInterestValue"]) for i in stale]
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/taker-volume")
async def get_taker_volume(symbol: str = "BTCUSDT", period: str = "5m", limit: int = 30):
    """Taker buy/sell volume ratio"""
    cache_key = f"lq:market:taker:{symbol}:{period}:{limit}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        client = get_binance_client()
        response = await client.get(f"{BINANCE_FUTURES_API}/futures/data/takerlongshortRatio", params={"symbol":symbol.upper(),"period":period,"limit":min(limit,500)})
        response.raise_for_status()
        result = [{"timestamp":int(i["timestamp"]),"buyVol":float(i["buyVol"]),"sellVol":float(i["sellVol"]),"buySellRatio":float(i["buySellRatio"])} for i in response.json()]
        cache_set(cache_key, result, ttl=30)
        return result
    except Exception as e:
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/prices")
async def get_batch_prices(symbols: str = "BTCUSDT,ETHUSDT"):
    """
    Batch prices with 5-second Redis cache.
    Uses single bulk API call instead of per-symbol sequential calls.
    All users share the same cached price data — near-instant response.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        return {}

    # Step 1: Check cache for ALL futures prices (single key, refreshed every 5s)
    cache_key = "lq:market:all-futures-prices"
    all_prices = cache_get(cache_key)

    if not all_prices:
        # Cache miss — fetch ALL futures prices in single call
        client = get_binance_client()
        all_prices = {}
        try:
            response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price")
            if response.status_code == 200:
                for item in response.json():
                    all_prices[item["symbol"]] = float(item["price"])
                cache_set(cache_key, all_prices, ttl=5)
        except Exception:
            # Fallback: try stale cache
            stale = cache_get_with_stale(cache_key)
            if stale:
                all_prices = stale

    # Step 2: Extract requested symbols
    results = {}
    missing = []
    for symbol in symbol_list:
        if symbol in all_prices:
            results[symbol] = all_prices[symbol]
        else:
            missing.append(symbol)

    # Step 3: For symbols not on Futures, try Spot bulk (also cached)
    if missing:
        spot_cache_key = "lq:market:all-spot-prices"
        spot_prices = cache_get(spot_cache_key)

        if not spot_prices:
            client = get_binance_client()
            spot_prices = {}
            try:
                response = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/price")
                if response.status_code == 200:
                    for item in response.json():
                        spot_prices[item["symbol"]] = float(item["price"])
                    cache_set(spot_cache_key, spot_prices, ttl=5)
            except Exception:
                stale = cache_get_with_stale(spot_cache_key)
                if stale:
                    spot_prices = stale

        for symbol in missing:
            if symbol in spot_prices:
                results[symbol] = spot_prices[symbol]

    return results


# ============================================================
# KLINES PROXY - For frontend chart data
# ============================================================

@router.get("/klines")
async def get_klines(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 100):
    """Proxy Binance klines (OHLC data) through backend to avoid CORS."""
    try:
        client = get_binance_client()
        # Try Spot first (usually works even in Indonesia)
        response = await client.get(
            f"{BINANCE_SPOT_API}/api/v3/klines",
            params={"symbol": symbol.upper(), "interval": interval, "limit": min(limit, 500)}
        )
        if response.status_code == 200:
            return response.json()
        raise Exception(f"HTTP {response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Klines fetch failed: {str(e)}")


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
    btc_res = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol":"BTCUSDT"})
    btc_data = btc_res.json()
    btc_price = float(btc_data["lastPrice"])

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
    4. CHANGED: Stale fallback if all APIs fail
    """
    cached = cache_get("lq:market:overview")
    if cached:
        return cached

    client = get_binance_client()

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
        # CHANGED: stale fallback instead of immediate 502
        stale, _ = cache_get_with_stale("lq:market:overview")
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"All Binance APIs failed: {str(e)}")


# ============================================================
# SECTOR / CATEGORIES PERFORMANCE (CoinGecko)
# ============================================================

@router.get("/categories")
async def get_categories(limit: int = Query(10, ge=1, le=50)):
    """
    Top crypto sectors/narratives sorted by 24h market cap change.
    Cached 300s (5min).
    """
    cached = cache_get("lq:market:categories")
    if cached:
        return cached[:limit]

    try:
        client = get_coingecko_client()
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
                "volume_24h": cat.get("content", {}).get("total_volume", 0) if isinstance(cat.get("content"), dict) else (cat.get("total_volume", 0) or 0),
                "top_3_coins": cat.get("top_3_coins", [])[:3],
                "updated_at": cat.get("updated_at", ""),
            })

        categories.sort(key=lambda x: abs(x["market_cap_change_24h"]), reverse=True)
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
    """Trending searched categories on CoinGecko (last 24h)."""
    cached = cache_get("lq:market:trending")
    if cached:
        return cached

    try:
        client = get_coingecko_client()
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
    Aggregated derivatives data.
    CHANGED: stale fallback if Binance Futures fails.
    """
    cached = cache_get("lq:market:deriv-pulse")
    if cached:
        return cached

    try:
        client = get_binance_client()

        # 1. Get ALL premium index (funding rates for all symbols)
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
        # CHANGED: stale fallback — this was the #1 source of 502 errors
        stale, _ = cache_get_with_stale("lq:market:deriv-pulse")
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"Derivatives pulse error: {str(e)}")


# ============================================
# BITCOIN EXTENDED DATA (from cache worker)
# CHANGED: All endpoints now try stale fallback before returning error
# ============================================

@router.get("/bitcoin/technical")
async def get_btc_technical():
    """BTC technical indicators (RSI, MACD, BB, EMA) for multi-timeframes"""
    cached = cache_get("lq:bitcoin:technical")
    if cached:
        return cached
    stale, _ = cache_get_with_stale("lq:bitcoin:technical")
    if stale:
        return stale
    raise HTTPException(status_code=503, detail="Technical data not ready yet")


@router.get("/bitcoin/network")
async def get_btc_network():
    """Bitcoin network health (hashrate, fees, mempool, difficulty)"""
    cached = cache_get("lq:bitcoin:network")
    if cached:
        return cached
    stale, _ = cache_get_with_stale("lq:bitcoin:network")
    if stale:
        return stale
    raise HTTPException(status_code=503, detail="Network data not ready yet")


@router.get("/bitcoin/onchain")
async def get_btc_onchain():
    """Bitcoin on-chain metrics (MVRV, NVT, active addresses)"""
    cached = cache_get("lq:bitcoin:onchain")
    if cached:
        return cached
    stale, _ = cache_get_with_stale("lq:bitcoin:onchain")
    if stale:
        return stale
    raise HTTPException(status_code=503, detail="On-chain data not ready yet")


@router.get("/bitcoin/news")
async def get_btc_news():
    """Latest Bitcoin news from RSS feeds"""
    cached = cache_get("lq:bitcoin:news")
    if cached:
        return cached
    stale, _ = cache_get_with_stale("lq:bitcoin:news")
    if stale:
        return stale
    raise HTTPException(status_code=503, detail="News data not ready yet")


@router.get("/bitcoin/full")
async def get_btc_full():
    """All Bitcoin page data in one request with REAL API Fallbacks"""
    technical = cache_get("lq:bitcoin:technical")
    network = cache_get("lq:bitcoin:network")
    onchain = cache_get("lq:bitcoin:onchain")
    news = cache_get("lq:bitcoin:news") or cache_get("lq:mkt:crypto-news")

    # CHANGED: try stale for missing data before API fallback
    if not technical:
        technical, _ = cache_get_with_stale("lq:bitcoin:technical")
    if not onchain:
        onchain, _ = cache_get_with_stale("lq:bitcoin:onchain")
    if not news:
        news, _ = cache_get_with_stale("lq:bitcoin:news")

    # Network data fallback — fetch live from mempool.space if not cached
    if not network:
        # Try stale first
        network, _ = cache_get_with_stale("lq:bitcoin:network")

    if not network:
        try:
            client = get_general_client()
            f_res, d_res, h_res, m_res = await asyncio.gather(
                client.get("https://mempool.space/api/v1/fees/recommended"),
                client.get("https://mempool.space/api/v1/difficulty-adjustment"),
                client.get("https://mempool.space/api/v1/mining/hashrate/3d"),
                client.get("https://mempool.space/api/mempool"),
                return_exceptions=True
            )

            if not isinstance(f_res, Exception) and f_res.status_code == 200:
                fees = f_res.json()
                diff = d_res.json() if not isinstance(d_res, Exception) and d_res.status_code == 200 else {}
                hash_data = h_res.json() if not isinstance(h_res, Exception) and h_res.status_code == 200 else {}
                memp = m_res.json() if not isinstance(m_res, Exception) and m_res.status_code == 200 else {}

                network = {
                    "hashrate": hash_data.get("currentHashrate", 0),
                    "difficulty": diff.get("difficulty", 0),
                    "block_height": diff.get("previousRetargetHeight", 0),
                    "mempool": {"count": memp.get("count", 0)},
                    "fees": {
                        "fastest": fees.get("fastestFee", 0),
                        "half_hour": fees.get("halfHourFee", 0),
                        "hour": fees.get("hourFee", 0),
                        "economy": fees.get("economyFee", 0)
                    },
                    "difficulty_adjustment": {
                        "progress": round(diff.get("progressPercent", 0), 2),
                        "change": round(diff.get("difficultyChange", 0), 2),
                        "remaining_blocks": diff.get("remainingBlocks", 0)
                    }
                }
        except Exception as e:
            print(f"Mempool API fallback error: {e}")

    return {
        "technical": technical,
        "network": network,
        "onchain": onchain,
        "news": news,
    }