"""
Market Data Router - Proxy for Binance Futures API (bypass CORS)
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict
import httpx
from pydantic import BaseModel
from datetime import datetime
import logging

# Setup logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])

# Binance API endpoints
BINANCE_SPOT_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"

# Timeout for external API calls
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


class PriceItem(BaseModel):
    symbol: str
    price: float
    source: str


class BatchPricesResponse(BaseModel):
    prices: Dict[str, float]
    failed: List[str]
    source: str
    timestamp: datetime


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


# ============ BATCH PRICES - For Watchlist ============

@router.get("/prices", response_model=BatchPricesResponse)
async def get_batch_prices(
    symbols: str = Query(..., description="Comma-separated symbols, e.g., BTCUSDT,ETHUSDT,AGTUSDT")
):
    """
    Get current prices for multiple symbols.
    Tries Binance Futures first (has more altcoins), then falls back to Spot.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    
    if not symbol_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    
    if len(symbol_list) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 symbols allowed")
    
    prices = {}
    failed = []
    source = "none"
    
    logger.info(f"Fetching prices for symbols: {symbol_list}")
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Strategy 1: Try to fetch all from Binance Futures (most altcoins are here)
        try:
            logger.info("Attempting to fetch from Binance Futures...")
            response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price")
            response.raise_for_status()
            futures_data = response.json()
            
            logger.info(f"Binance Futures returned {len(futures_data)} symbols")
            
            # Create lookup dict
            futures_prices = {item["symbol"]: float(item["price"]) for item in futures_data}
            
            for symbol in symbol_list:
                if symbol in futures_prices:
                    prices[symbol] = futures_prices[symbol]
                    logger.info(f"Found {symbol} in Futures: {futures_prices[symbol]}")
            
            source = "binance_futures"
                    
        except httpx.HTTPError as e:
            logger.error(f"Binance Futures bulk fetch failed: {e}")
        except Exception as e:
            logger.error(f"Binance Futures unexpected error: {e}")
        
        # Strategy 2: For symbols not found in futures, try Spot
        remaining = [s for s in symbol_list if s not in prices]
        
        if remaining:
            logger.info(f"Trying Binance Spot for remaining symbols: {remaining}")
            try:
                response = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/price")
                response.raise_for_status()
                spot_data = response.json()
                
                logger.info(f"Binance Spot returned {len(spot_data)} symbols")
                
                # Create lookup dict
                spot_prices = {item["symbol"]: float(item["price"]) for item in spot_data}
                
                for symbol in remaining:
                    if symbol in spot_prices:
                        prices[symbol] = spot_prices[symbol]
                        logger.info(f"Found {symbol} in Spot: {spot_prices[symbol]}")
                    else:
                        failed.append(symbol)
                        logger.warning(f"Symbol {symbol} not found in Futures or Spot")
                
                if source == "binance_futures":
                    source = "binance_futures+spot"
                else:
                    source = "binance_spot"
                        
            except httpx.HTTPError as e:
                logger.error(f"Binance Spot bulk fetch failed: {e}")
                failed.extend(remaining)
            except Exception as e:
                logger.error(f"Binance Spot unexpected error: {e}")
                failed.extend(remaining)
    
    logger.info(f"Final result - prices: {len(prices)}, failed: {len(failed)}")
    
    return BatchPricesResponse(
        prices=prices,
        failed=failed,
        source=source,
        timestamp=datetime.utcnow()
    )


@router.get("/price/{symbol}")
async def get_single_price(symbol: str):
    """
    Get price for a single symbol.
    Tries Futures first, then Spot.
    """
    symbol = symbol.upper()
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Futures first
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/ticker/price",
                params={"symbol": symbol}
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    "symbol": symbol,
                    "price": float(data["price"]),
                    "source": "binance_futures"
                }
        except:
            pass
        
        # Try Spot
        try:
            response = await client.get(
                f"{BINANCE_SPOT_API}/api/v3/ticker/price",
                params={"symbol": symbol}
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    "symbol": symbol,
                    "price": float(data["price"]),
                    "source": "binance_spot"
                }
        except:
            pass
    
    raise HTTPException(status_code=404, detail=f"Price not found for {symbol}")


# ============ Funding Rates (Futures) ============

@router.get("/funding-rates", response_model=List[FundingRateItem])
async def get_funding_rates(symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"):
    """
    Get current funding rates for multiple symbols.
    Pass comma-separated symbols.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Fetch all funding rates
            response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex")
            response.raise_for_status()
            data = response.json()
            
            # Filter for requested symbols
            result = []
            for item in data:
                if item["symbol"] in symbol_list:
                    result.append(FundingRateItem(
                        symbol=item["symbol"],
                        rate=float(item["lastFundingRate"]) * 100,  # Convert to percentage
                        time=int(item["nextFundingTime"])
                    ))
            
            return result
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Binance API error: {str(e)}")


# ============ Long/Short Ratio (Futures Data) ============

@router.get("/long-short-ratio", response_model=LongShortRatioResponse)
async def get_long_short_ratio(
    symbol: str = "BTCUSDT",
    period: str = "5m"
):
    """
    Get long/short account ratio.
    Periods: 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
                params={
                    "symbol": symbol.upper(),
                    "period": period,
                    "limit": 1
                }
            )
            response.raise_for_status()
            data = response.json()
            
            if data:
                latest = data[0]
                return LongShortRatioResponse(
                    symbol=symbol,
                    longAccount=float(latest["longAccount"]) * 100,
                    shortAccount=float(latest["shortAccount"]) * 100,
                    longShortRatio=float(latest["longShortRatio"]),
                    timestamp=int(latest["timestamp"])
                )
            
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
    Combines BTC price, funding rate, open interest, and long/short ratio.
    """
    result = {}
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # BTC Ticker
        try:
            response = await client.get(
                f"{BINANCE_SPOT_API}/api/v3/ticker/24hr",
                params={"symbol": "BTCUSDT"}
            )
            if response.status_code == 200:
                data = response.json()
                result["btc"] = {
                    "price": float(data["lastPrice"]),
                    "high_24h": float(data["highPrice"]),
                    "low_24h": float(data["lowPrice"]),
                    "volume_24h": float(data["quoteVolume"]),
                    "price_change_pct": float(data["priceChangePercent"])
                }
        except:
            pass
        
        # Funding Rate
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex",
                params={"symbol": "BTCUSDT"}
            )
            if response.status_code == 200:
                data = response.json()
                result["funding"] = {
                    "rate": float(data["lastFundingRate"]) * 100,
                    "next_time": int(data["nextFundingTime"])
                }
        except:
            pass
        
        # Open Interest
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
                params={"symbol": "BTCUSDT"}
            )
            if response.status_code == 200:
                data = response.json()
                oi = float(data["openInterest"])
                btc_price = result.get("btc", {}).get("price", 0)
                result["open_interest"] = {
                    "btc": oi,
                    "usd": oi * btc_price
                }
        except:
            pass
        
        # Long/Short Ratio
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
                params={"symbol": "BTCUSDT", "period": "5m", "limit": 1}
            )
            if response.status_code == 200:
                data = response.json()
                if data:
                    latest = data[0]
                    result["long_short"] = {
                        "long_pct": float(latest["longAccount"]) * 100,
                        "short_pct": float(latest["shortAccount"]) * 100,
                        "ratio": float(latest["longShortRatio"])
                    }
        except:
            pass
    
    result["timestamp"] = datetime.utcnow().isoformat()
    return result