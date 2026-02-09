"""
Market Data Router - Proxy for Binance & CoinGecko APIs (bypass CORS)
With in-memory caching to avoid rate limits
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any
import httpx
import json
import time
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(tags=["market"])

# ============ Simple In-Memory Cache ============
_cache: dict[str, dict] = {}

def cache_get(key: str, max_age: int = 120) -> Any:
    """Get from cache if not expired. max_age in seconds."""
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < max_age:
        return entry["data"]
    return None

def cache_set(key: str, data: Any):
    """Store data in cache with current timestamp."""
    _cache[key] = {"data": data, "ts": time.time()}

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
# COINGECKO PROXY ENDPOINTS (bypass CORS for frontend)
# ============================================================

@router.get("/bitcoin")
async def get_bitcoin_data():
    """
    Proxy for CoinGecko Bitcoin data + global data + Fear & Greed.
    Cached for 2 minutes to avoid rate limits.
    """
    # Check cache first (2 min TTL)
    cached = cache_get("bitcoin", max_age=120)
    if cached:
        return cached
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Fetch all data concurrently
            btc_task = client.get(
                f"{COINGECKO_API}/coins/bitcoin",
                params={
                    "localization": "false",
                    "tickers": "false",
                    "community_data": "false",
                    "developer_data": "false"
                }
            )
            global_task = client.get(f"{COINGECKO_API}/global")
            fg_task = client.get(f"{FEAR_GREED_API}/?limit=1")
            
            btc_res, global_res, fg_res = await btc_task, await global_task, await fg_task
            
            # Process BTC data
            btc_data = None
            if btc_res.status_code == 200:
                btc_data = btc_res.json()
            
            # Process global data
            global_data = None
            if global_res.status_code == 200:
                global_data = global_res.json().get("data")
            
            # Process Fear & Greed
            fear_greed = {"value": 50, "label": "Neutral"}
            if fg_res.status_code == 200:
                fg_json = fg_res.json()
                if fg_json.get("data") and len(fg_json["data"]) > 0:
                    fear_greed = {
                        "value": int(fg_json["data"][0]["value"]),
                        "label": fg_json["data"][0]["value_classification"]
                    }
            
            if not btc_data:
                raise HTTPException(status_code=502, detail="Failed to fetch Bitcoin data from CoinGecko")
            
            md = btc_data.get("market_data", {})
            
            result = {
                "price": md.get("current_price", {}).get("usd", 0),
                "priceChange24h": md.get("price_change_percentage_24h", 0),
                "priceChange7d": md.get("price_change_percentage_7d", 0),
                "priceChange30d": md.get("price_change_percentage_30d", 0),
                "high24h": md.get("high_24h", {}).get("usd", 0),
                "low24h": md.get("low_24h", {}).get("usd", 0),
                "ath": md.get("ath", {}).get("usd", 0),
                "athChange": md.get("ath_change_percentage", {}).get("usd", 0),
                "marketCap": md.get("market_cap", {}).get("usd", 0),
                "marketCapRank": btc_data.get("market_cap_rank", 1),
                "volume24h": md.get("total_volume", {}).get("usd", 0),
                "circulatingSupply": md.get("circulating_supply", 0),
                "maxSupply": md.get("max_supply") or 21000000,
                "dominance": global_data.get("market_cap_percentage", {}).get("btc", 0) if global_data else 0,
                "fearGreed": fear_greed,
            }
            
            cache_set("bitcoin", result)
            return result
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CoinGecko API error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.get("/coins")
async def get_coins_market(
    per_page: int = Query(100, ge=1, le=250),
    page: int = Query(1, ge=1),
    order: str = Query("market_cap_desc")
):
    """
    Proxy for CoinGecko coins/markets endpoint.
    Cached for 2 minutes to avoid rate limits.
    """
    cache_key = f"coins:{per_page}:{page}:{order}"
    cached = cache_get(cache_key, max_age=120)
    if cached:
        return cached
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{COINGECKO_API}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": order,
                    "per_page": per_page,
                    "page": page,
                    "sparkline": "false",
                    "price_change_percentage": "1h,24h,7d"
                }
            )
            
            if response.status_code == 429:
                # Return cached data if available (even if expired)
                expired = _cache.get(cache_key)
                if expired:
                    return expired["data"]
                raise HTTPException(status_code=429, detail="CoinGecko rate limit exceeded. Please try again in a minute.")
            
            response.raise_for_status()
            result = response.json()
            cache_set(cache_key, result)
            return result
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CoinGecko API error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.get("/global")
async def get_global_data():
    """
    Proxy for CoinGecko global market data.
    Cached for 2 minutes.
    """
    cached = cache_get("global", max_age=120)
    if cached:
        return cached
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Fetch global + fear & greed + top coins concurrently
            global_task = client.get(f"{COINGECKO_API}/global")
            coins_task = client.get(
                f"{COINGECKO_API}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": 20,
                    "page": 1,
                    "sparkline": "false",
                    "price_change_percentage": "24h,7d"
                }
            )
            fg_task = client.get(f"{FEAR_GREED_API}/?limit=7")
            
            global_res, coins_res, fg_res = await global_task, await coins_task, await fg_task
            
            global_data = None
            if global_res.status_code == 200:
                global_data = global_res.json().get("data")
            
            coins_data = []
            if coins_res.status_code == 200:
                coins_data = coins_res.json()
            
            fear_greed = {"value": 50, "label": "Neutral", "yesterday": 50, "lastWeek": 50}
            if fg_res.status_code == 200:
                fg_json = fg_res.json()
                if fg_json.get("data") and len(fg_json["data"]) > 0:
                    fear_greed = {
                        "value": int(fg_json["data"][0]["value"]),
                        "label": fg_json["data"][0]["value_classification"],
                        "yesterday": int(fg_json["data"][1]["value"]) if len(fg_json["data"]) > 1 else 50,
                        "lastWeek": int(fg_json["data"][6]["value"]) if len(fg_json["data"]) > 6 else 50,
                    }
            
            result = {
                "global": global_data,
                "coins": coins_data,
                "fearGreed": fear_greed,
            }
            
            cache_set("global", result)
            return result
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


# ============================================================
# BINANCE PROXY ENDPOINTS (existing)
# ============================================================

@router.get("/btc-ticker", response_model=BtcTickerResponse)
async def get_btc_ticker():
    """Get BTC/USDT 24hr ticker from Binance Spot"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_SPOT_API}/api/v3/ticker/24hr",
                params={"symbol": "BTCUSDT"}
            )
            response.raise_for_status()
            data = response.json()
            
            return BtcTickerResponse(
                price=float(data["lastPrice"]),
                high_24h=float(data["highPrice"]),
                low_24h=float(data["lowPrice"]),
                volume_24h=float(data["quoteVolume"]),
                price_change_24h=float(data["priceChange"]),
                price_change_pct=float(data["priceChangePercent"])
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/funding-rates", response_model=List[FundingRateItem])
async def get_funding_rates(symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"):
    """Get current funding rates for multiple symbols."""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = []
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for symbol in symbol_list:
            try:
                response = await client.get(
                    f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate",
                    params={"symbol": symbol, "limit": 1}
                )
                response.raise_for_status()
                data = response.json()
                
                if data and len(data) > 0:
                    results.append(FundingRateItem(
                        symbol=symbol.replace("USDT", ""),
                        rate=float(data[0]["fundingRate"]),
                        time=int(data[0]["fundingTime"])
                    ))
            except httpx.HTTPError:
                continue
    
    return results


@router.get("/funding-rate/{symbol}")
async def get_single_funding_rate(symbol: str = "BTCUSDT"):
    """Get funding rate for a single symbol"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate",
                params={"symbol": symbol.upper(), "limit": 1}
            )
            response.raise_for_status()
            data = response.json()
            
            if data and len(data) > 0:
                return {
                    "symbol": symbol.replace("USDT", ""),
                    "rate": float(data[0]["fundingRate"]),
                    "time": int(data[0]["fundingTime"])
                }
            return None
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/long-short-ratio", response_model=LongShortRatioResponse)
async def get_long_short_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """Get global long/short account ratio."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
                params={"symbol": symbol.upper(), "period": period, "limit": 1}
            )
            response.raise_for_status()
            data = response.json()
            
            if data and len(data) > 0:
                return LongShortRatioResponse(
                    symbol=symbol,
                    longAccount=float(data[0]["longAccount"]),
                    shortAccount=float(data[0]["shortAccount"]),
                    longShortRatio=float(data[0]["longShortRatio"]),
                    timestamp=int(data[0]["timestamp"])
                )
            raise HTTPException(status_code=404, detail="No data available")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/top-trader-ratio")
async def get_top_trader_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """Get top trader long/short position ratio"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/topLongShortPositionRatio",
                params={"symbol": symbol.upper(), "period": period, "limit": 1}
            )
            response.raise_for_status()
            data = response.json()
            
            if data and len(data) > 0:
                return {
                    "symbol": symbol,
                    "longAccount": float(data[0]["longAccount"]),
                    "shortAccount": float(data[0]["shortAccount"]),
                    "longShortRatio": float(data[0]["longShortRatio"]),
                    "timestamp": int(data[0]["timestamp"])
                }
            raise HTTPException(status_code=404, detail="No data available")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/open-interest", response_model=OpenInterestResponse)
async def get_open_interest(symbol: str = "BTCUSDT"):
    """Get current open interest for a symbol"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            oi_response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
                params={"symbol": symbol.upper()}
            )
            oi_response.raise_for_status()
            oi_data = oi_response.json()
            
            price_response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price",
                params={"symbol": symbol.upper()}
            )
            price_response.raise_for_status()
            price_data = price_response.json()
            
            oi = float(oi_data["openInterest"])
            price = float(price_data["price"])
            
            return OpenInterestResponse(
                symbol=symbol,
                openInterest=oi,
                openInterestUsd=oi * price
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/open-interest-history", response_model=List[OIHistoryItem])
async def get_open_interest_history(
    symbol: str = "BTCUSDT",
    period: str = "1h",
    limit: int = 24
):
    """Get open interest history."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/openInterestHist",
                params={
                    "symbol": symbol.upper(),
                    "period": period,
                    "limit": min(limit, 500)
                }
            )
            response.raise_for_status()
            data = response.json()
            
            return [
                OIHistoryItem(
                    timestamp=int(item["timestamp"]),
                    sumOpenInterest=float(item["sumOpenInterest"]),
                    sumOpenInterestValue=float(item["sumOpenInterestValue"])
                )
                for item in data
            ]
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/taker-volume")
async def get_taker_volume(
    symbol: str = "BTCUSDT",
    period: str = "5m",
    limit: int = 30
):
    """Get taker buy/sell volume ratio"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/takerlongshortRatio",
                params={
                    "symbol": symbol.upper(),
                    "period": period,
                    "limit": min(limit, 500)
                }
            )
            response.raise_for_status()
            data = response.json()
            
            return [
                {
                    "timestamp": int(item["timestamp"]),
                    "buyVol": float(item["buyVol"]),
                    "sellVol": float(item["sellVol"]),
                    "buySellRatio": float(item["buySellRatio"])
                }
                for item in data
            ]
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


@router.get("/prices")
async def get_batch_prices(symbols: str = "BTCUSDT,ETHUSDT"):
    """Get batch prices from Binance Futures"""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = {}
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for symbol in symbol_list:
            try:
                response = await client.get(
                    f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price",
                    params={"symbol": symbol}
                )
                if response.status_code == 200:
                    data = response.json()
                    results[symbol] = float(data["price"])
            except:
                continue
    
    return results


@router.get("/overview")
async def get_market_overview():
    """Get complete market overview in one call."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            btc_task = client.get(
                f"{BINANCE_SPOT_API}/api/v3/ticker/24hr",
                params={"symbol": "BTCUSDT"}
            )
            
            funding_symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
            
            btc_response = await btc_task
            btc_response.raise_for_status()
            btc_data = btc_response.json()
            
            # Funding rates
            funding_rates = []
            for symbol in funding_symbols:
                try:
                    fr_response = await client.get(
                        f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate",
                        params={"symbol": symbol, "limit": 1}
                    )
                    fr_data = fr_response.json()
                    if fr_data:
                        funding_rates.append({
                            "symbol": symbol.replace("USDT", ""),
                            "rate": float(fr_data[0]["fundingRate"]),
                            "time": int(fr_data[0]["fundingTime"])
                        })
                except:
                    continue
            
            # Long/short ratio
            ls_response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
                params={"symbol": "BTCUSDT", "period": "5m", "limit": 1}
            )
            ls_data = ls_response.json()
            long_short = None
            if ls_data:
                long_short = {
                    "symbol": "BTCUSDT",
                    "longAccount": float(ls_data[0]["longAccount"]),
                    "shortAccount": float(ls_data[0]["shortAccount"]),
                    "longShortRatio": float(ls_data[0]["longShortRatio"]),
                    "timestamp": int(ls_data[0]["timestamp"])
                }
            
            # Open interest
            oi_response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
                params={"symbol": "BTCUSDT"}
            )
            oi_data = oi_response.json()
            
            btc_price = float(btc_data["lastPrice"])
            oi = float(oi_data["openInterest"])
            
            open_interest = {
                "symbol": "BTCUSDT",
                "openInterest": oi,
                "openInterestUsd": oi * btc_price
            }
            
            # OI history
            oi_hist_response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/openInterestHist",
                params={"symbol": "BTCUSDT", "period": "1h", "limit": 24}
            )
            oi_hist_data = oi_hist_response.json()
            oi_history = [
                {
                    "timestamp": int(item["timestamp"]),
                    "sumOpenInterestValue": float(item["sumOpenInterestValue"])
                }
                for item in oi_hist_data
            ]
            
            return {
                "btc": {
                    "price": float(btc_data["lastPrice"]),
                    "high_24h": float(btc_data["highPrice"]),
                    "low_24h": float(btc_data["lowPrice"]),
                    "volume_24h": float(btc_data["quoteVolume"]),
                    "price_change_24h": float(btc_data["priceChange"]),
                    "price_change_pct": float(btc_data["priceChangePercent"])
                },
                "fundingRates": funding_rates,
                "longShortRatio": long_short,
                "openInterest": open_interest,
                "oiHistory": oi_history,
                "timestamp": datetime.utcnow().isoformat()
            }
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")