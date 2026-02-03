"""
Market Data Router - Proxy for Binance Futures API (bypass CORS)
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
import httpx
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/market", tags=["market"])

# Binance API endpoints
BINANCE_SPOT_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"

# Timeout for external API calls
TIMEOUT = 10.0


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


# ============ BTC Price (Spot - no CORS issue, but proxy anyway) ============

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


# ============ Funding Rates (Futures) ============

@router.get("/funding-rates", response_model=List[FundingRateItem])
async def get_funding_rates(symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"):
    """
    Get current funding rates for multiple symbols.
    Default: BTC, ETH, SOL, BNB
    """
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
                # Skip failed symbols
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


# ============ Long/Short Ratio (Futures) ============

@router.get("/long-short-ratio", response_model=LongShortRatioResponse)
async def get_long_short_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """
    Get global long/short account ratio.
    Periods: 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d
    """
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


# ============ Open Interest (Futures) ============

@router.get("/open-interest", response_model=OpenInterestResponse)
async def get_open_interest(symbol: str = "BTCUSDT"):
    """Get current open interest for a symbol"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Get OI
            oi_response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
                params={"symbol": symbol.upper()}
            )
            oi_response.raise_for_status()
            oi_data = oi_response.json()
            
            # Get current price for USD value
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
    """
    Get open interest history.
    Periods: 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/openInterestHist",
                params={
                    "symbol": symbol.upper(),
                    "period": period,
                    "limit": min(limit, 500)  # Max 500
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


# ============ Taker Buy/Sell Volume (Futures) ============

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


# ============ Aggregated Market Data ============

@router.get("/overview")
async def get_market_overview():
    """
    Get complete market overview in one call.
    Aggregates: BTC ticker, funding rates, long/short ratio, open interest
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Fetch all data concurrently
            btc_task = client.get(
                f"{BINANCE_SPOT_API}/api/v3/ticker/24hr",
                params={"symbol": "BTCUSDT"}
            )
            
            funding_symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
            
            # Execute BTC ticker request
            btc_response = await btc_task
            btc_response.raise_for_status()
            btc_data = btc_response.json()
            
            # Fetch funding rates
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
            
            # Fetch long/short ratio
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
            
            # Fetch open interest
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
            
            # Fetch OI history
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