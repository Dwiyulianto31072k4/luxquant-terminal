"""
Market Data Router - Proxy for Binance & CoinGecko APIs (bypass CORS)
With Redis caching (pre-computed by background worker)
Falls back to direct API call if cache miss
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any
import httpx
import time
from pydantic import BaseModel
from datetime import datetime
from app.core.redis import cache_get, cache_set

router = APIRouter(tags=["market"])

# API endpoints
BINANCE_SPOT_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"
COINGECKO_API = "https://api.coingecko.com/api/v3"
FEAR_GREED_API = "https://api.alternative.me/fng"

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

    # Fallback: fetch directly
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            btc_res, global_res, fg_res = await btc_res, await global_res, await fg_res
            btc_task = client.get(f"{COINGECKO_API}/coins/bitcoin", params={"localization":"false","tickers":"false","community_data":"false","developer_data":"false"})
            global_task = client.get(f"{COINGECKO_API}/global")
            fg_task = client.get(f"{FEAR_GREED_API}/?limit=1")
            btc_res, global_res, fg_res = await btc_task, await global_task, await fg_task

            btc_data = btc_res.json() if btc_res.status_code == 200 else None
            global_data = global_res.json().get("data") if global_res.status_code == 200 else None
            fear_greed = {"value": 50, "label": "Neutral"}
            if fg_res.status_code == 200:
                fg = fg_res.json()
                if fg.get("data") and len(fg["data"]) > 0:
                    fear_greed = {"value": int(fg["data"][0]["value"]), "label": fg["data"][0]["value_classification"]}

            if not btc_data:
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
            })
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="CoinGecko rate limit exceeded")
            response.raise_for_status()
            result = response.json()
            cache_set(cache_key, result, ttl=120)
            return result
    except HTTPException:
        raise
    except Exception as e:
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
                client.get(f"{COINGECKO_API}/global"),
                client.get(f"{COINGECKO_API}/coins/markets", params={"vs_currency":"usd","order":"market_cap_desc","per_page":20,"page":1,"sparkline":"false","price_change_percentage":"24h,7d"}),
                client.get(f"{FEAR_GREED_API}/?limit=7"),
            )
            global_data = global_res.json().get("data") if global_res.status_code == 200 else None
            coins_data = coins_res.json() if coins_res.status_code == 200 else []
            fear_greed = {"value":50,"label":"Neutral","yesterday":50,"lastWeek":50}
            if fg_res.status_code == 200:
                fg = fg_res.json()
                if fg.get("data") and len(fg["data"])>0:
                    fear_greed = {"value":int(fg["data"][0]["value"]),"label":fg["data"][0]["value_classification"],
                        "yesterday":int(fg["data"][1]["value"]) if len(fg["data"])>1 else 50,
                        "lastWeek":int(fg["data"][6]["value"]) if len(fg["data"])>6 else 50}
            result = {"global": global_data, "coins": coins_data, "fearGreed": fear_greed}
            cache_set("lq:market:global", result, ttl=120)
            return result
    except Exception as e:
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
    """Batch prices from Binance Futures (not cached - real-time)"""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = {}
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for symbol in symbol_list:
            try:
                response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price", params={"symbol": symbol})
                if response.status_code == 200:
                    results[symbol] = float(response.json()["price"])
            except: continue
    return results


@router.get("/overview")
async def get_market_overview():
    """Complete market overview (cached 15s by worker)"""
    cached = cache_get("lq:market:overview")
    if cached:
        return cached

    # Fallback: direct fetch
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            btc_res = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol":"BTCUSDT"})
            btc_data = btc_res.json()
            btc_price = float(btc_data["lastPrice"])

            funding_rates = []
            for sym in ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]:
                try:
                    fr = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate", params={"symbol":sym,"limit":1})
                    d = fr.json()
                    if d: funding_rates.append({"symbol":sym.replace("USDT",""),"rate":float(d[0]["fundingRate"]),"time":int(d[0]["fundingTime"])})
                except: continue

            ls = await client.get(f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio", params={"symbol":"BTCUSDT","period":"5m","limit":1})
            ls_data = ls.json()
            long_short = {"symbol":"BTCUSDT","longAccount":float(ls_data[0]["longAccount"]),"shortAccount":float(ls_data[0]["shortAccount"]),"longShortRatio":float(ls_data[0]["longShortRatio"]),"timestamp":int(ls_data[0]["timestamp"])} if ls_data else None

            oi = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol":"BTCUSDT"})
            oi_val = float(oi.json()["openInterest"])

            oih = await client.get(f"{BINANCE_FUTURES_API}/futures/data/openInterestHist", params={"symbol":"BTCUSDT","period":"1h","limit":24})
            oi_hist = [{"timestamp":int(i["timestamp"]),"sumOpenInterestValue":float(i["sumOpenInterestValue"])} for i in oih.json()]

            result = {
                "btc": {"price":btc_price,"high_24h":float(btc_data["highPrice"]),"low_24h":float(btc_data["lowPrice"]),
                    "volume_24h":float(btc_data["quoteVolume"]),"price_change_24h":float(btc_data["priceChange"]),"price_change_pct":float(btc_data["priceChangePercent"])},
                "fundingRates": funding_rates, "longShortRatio": long_short,
                "openInterest": {"symbol":"BTCUSDT","openInterest":oi_val,"openInterestUsd":oi_val*btc_price},
                "oiHistory": oi_hist, "timestamp": datetime.utcnow().isoformat(),
            }
            cache_set("lq:market:overview", result, ttl=15)
            return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")