"""
Market Data Router - Multi-source with fallbacks
Binance (primary) -> Bybit (fallback) for derivatives data
Indonesia is restricted from Binance Futures, so we use Bybit as fallback
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict
import httpx
from pydantic import BaseModel
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])

# API endpoints
BINANCE_SPOT_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"
BYBIT_API = "https://api.bybit.com"

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


class BatchPricesResponse(BaseModel):
    prices: Dict[str, float]
    failed: List[str]
    source: str
    timestamp: datetime


# ============ Helper: Get BTC Price (multiple sources) ============

async def get_btc_price_multi(client: httpx.AsyncClient) -> float:
    """Get BTC price from multiple sources with fallback"""
    
    # Try Binance Spot first (usually works everywhere)
    try:
        response = await client.get(
            f"{BINANCE_SPOT_API}/api/v3/ticker/price",
            params={"symbol": "BTCUSDT"},
            timeout=5.0
        )
        if response.status_code == 200:
            return float(response.json()["price"])
    except Exception as e:
        logger.warning(f"Binance Spot price failed: {e}")
    
    # Fallback to Bybit
    try:
        response = await client.get(
            f"{BYBIT_API}/v5/market/tickers",
            params={"category": "linear", "symbol": "BTCUSDT"},
            timeout=5.0
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("result", {}).get("list"):
                return float(data["result"]["list"][0]["lastPrice"])
    except Exception as e:
        logger.warning(f"Bybit price failed: {e}")
    
    return 0.0


# ============ BTC Ticker ============

@router.get("/btc-ticker", response_model=BtcTickerResponse)
async def get_btc_ticker():
    """Get BTC/USDT 24hr ticker"""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Binance Spot
        try:
            response = await client.get(
                f"{BINANCE_SPOT_API}/api/v3/ticker/24hr",
                params={"symbol": "BTCUSDT"}
            )
            if response.status_code == 200:
                data = response.json()
                return BtcTickerResponse(
                    price=float(data["lastPrice"]),
                    high_24h=float(data["highPrice"]),
                    low_24h=float(data["lowPrice"]),
                    volume_24h=float(data["quoteVolume"]),
                    price_change_24h=float(data["priceChange"]),
                    price_change_pct=float(data["priceChangePercent"])
                )
        except Exception as e:
            logger.warning(f"Binance ticker failed: {e}")
        
        # Fallback to Bybit
        try:
            response = await client.get(
                f"{BYBIT_API}/v5/market/tickers",
                params={"category": "spot", "symbol": "BTCUSDT"}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("result", {}).get("list"):
                    item = data["result"]["list"][0]
                    return BtcTickerResponse(
                        price=float(item["lastPrice"]),
                        high_24h=float(item["highPrice24h"]),
                        low_24h=float(item["lowPrice24h"]),
                        volume_24h=float(item["turnover24h"]),
                        price_change_24h=float(item["lastPrice"]) - float(item["prevPrice24h"]),
                        price_change_pct=float(item["price24hPcnt"]) * 100
                    )
        except Exception as e:
            logger.warning(f"Bybit ticker failed: {e}")
    
    raise HTTPException(status_code=502, detail="All price sources failed")


# ============ BATCH PRICES ============

@router.get("/prices", response_model=BatchPricesResponse)
async def get_batch_prices(
    symbols: str = Query(..., description="Comma-separated symbols")
):
    """Get prices for multiple symbols"""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    prices = {}
    failed = []
    source = "binance"
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Binance Spot (usually works in Indonesia)
        try:
            response = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/price")
            if response.status_code == 200:
                spot_prices = {item["symbol"]: float(item["price"]) for item in response.json()}
                for symbol in symbol_list:
                    if symbol in spot_prices:
                        prices[symbol] = spot_prices[symbol]
                    else:
                        failed.append(symbol)
        except Exception as e:
            logger.warning(f"Binance prices failed: {e}")
            failed = symbol_list
            source = "bybit"
            
            # Fallback to Bybit
            try:
                response = await client.get(
                    f"{BYBIT_API}/v5/market/tickers",
                    params={"category": "spot"}
                )
                if response.status_code == 200:
                    data = response.json()
                    bybit_prices = {
                        item["symbol"]: float(item["lastPrice"]) 
                        for item in data.get("result", {}).get("list", [])
                    }
                    failed = []
                    for symbol in symbol_list:
                        if symbol in bybit_prices:
                            prices[symbol] = bybit_prices[symbol]
                        else:
                            failed.append(symbol)
            except Exception as e2:
                logger.warning(f"Bybit prices also failed: {e2}")
    
    return BatchPricesResponse(
        prices=prices,
        failed=failed,
        source=source,
        timestamp=datetime.utcnow()
    )


@router.get("/price/{symbol}")
async def get_single_price(symbol: str):
    """Get price for a single symbol"""
    symbol = symbol.upper()
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Binance Spot
        try:
            response = await client.get(
                f"{BINANCE_SPOT_API}/api/v3/ticker/price",
                params={"symbol": symbol}
            )
            if response.status_code == 200:
                return {
                    "symbol": symbol,
                    "price": float(response.json()["price"]),
                    "source": "binance_spot"
                }
        except:
            pass
        
        # Fallback Bybit
        try:
            response = await client.get(
                f"{BYBIT_API}/v5/market/tickers",
                params={"category": "spot", "symbol": symbol}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("result", {}).get("list"):
                    return {
                        "symbol": symbol,
                        "price": float(data["result"]["list"][0]["lastPrice"]),
                        "source": "bybit"
                    }
        except:
            pass
    
    raise HTTPException(status_code=404, detail=f"Price not found for {symbol}")


# ============ Funding Rates ============

@router.get("/funding-rates", response_model=List[FundingRateItem])
async def get_funding_rates(symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"):
    """Get funding rates - tries Binance then Bybit"""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    result = []
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Binance Futures
        try:
            response = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex")
            if response.status_code == 200:
                data = response.json()
                for item in data:
                    if item["symbol"] in symbol_list:
                        result.append(FundingRateItem(
                            symbol=item["symbol"],
                            rate=float(item["lastFundingRate"]) * 100,
                            time=int(item["nextFundingTime"])
                        ))
                if result:
                    return result
        except Exception as e:
            logger.warning(f"Binance funding failed: {e}")
        
        # Fallback to Bybit
        try:
            response = await client.get(
                f"{BYBIT_API}/v5/market/tickers",
                params={"category": "linear"}
            )
            if response.status_code == 200:
                data = response.json()
                for item in data.get("result", {}).get("list", []):
                    if item["symbol"] in symbol_list:
                        result.append(FundingRateItem(
                            symbol=item["symbol"],
                            rate=float(item.get("fundingRate", 0)) * 100,
                            time=int(datetime.utcnow().timestamp() * 1000)
                        ))
        except Exception as e:
            logger.warning(f"Bybit funding failed: {e}")
    
    return result


# ============ Long/Short Ratio ============

@router.get("/long-short-ratio", response_model=LongShortRatioResponse)
async def get_long_short_ratio(symbol: str = "BTCUSDT", period: str = "5m"):
    """Get long/short ratio - Binance then Bybit"""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Binance
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
                params={"symbol": symbol.upper(), "period": period, "limit": 1}
            )
            if response.status_code == 200:
                data = response.json()
                if data:
                    latest = data[0]
                    return LongShortRatioResponse(
                        symbol=latest["symbol"],
                        longAccount=float(latest["longAccount"]) * 100,
                        shortAccount=float(latest["shortAccount"]) * 100,
                        longShortRatio=float(latest["longShortRatio"]),
                        timestamp=int(latest["timestamp"])
                    )
        except Exception as e:
            logger.warning(f"Binance L/S ratio failed: {e}")
        
        # Fallback Bybit (account ratio)
        try:
            response = await client.get(
                f"{BYBIT_API}/v5/market/account-ratio",
                params={"category": "linear", "symbol": symbol.upper(), "period": "1d", "limit": 1}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("result", {}).get("list"):
                    item = data["result"]["list"][0]
                    buy_ratio = float(item.get("buyRatio", 0.5))
                    sell_ratio = float(item.get("sellRatio", 0.5))
                    return LongShortRatioResponse(
                        symbol=symbol.upper(),
                        longAccount=buy_ratio * 100,
                        shortAccount=sell_ratio * 100,
                        longShortRatio=buy_ratio / sell_ratio if sell_ratio > 0 else 1,
                        timestamp=int(item.get("timestamp", datetime.utcnow().timestamp() * 1000))
                    )
        except Exception as e:
            logger.warning(f"Bybit L/S ratio failed: {e}")
    
    raise HTTPException(status_code=502, detail="Long/short ratio unavailable")


# ============ Open Interest ============

@router.get("/open-interest", response_model=OpenInterestResponse)
async def get_open_interest(symbol: str = "BTCUSDT"):
    """Get open interest - Binance then Bybit"""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        btc_price = await get_btc_price_multi(client)
        
        # Try Binance Futures
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
                params={"symbol": symbol.upper()}
            )
            if response.status_code == 200:
                data = response.json()
                oi = float(data["openInterest"])
                return OpenInterestResponse(
                    symbol=symbol.upper(),
                    openInterest=oi,
                    openInterestUsd=oi * btc_price
                )
        except Exception as e:
            logger.warning(f"Binance OI failed: {e}")
        
        # Fallback Bybit
        try:
            response = await client.get(
                f"{BYBIT_API}/v5/market/open-interest",
                params={"category": "linear", "symbol": symbol.upper()}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("result", {}).get("list"):
                    item = data["result"]["list"][0]
                    oi = float(item.get("openInterest", 0))
                    return OpenInterestResponse(
                        symbol=symbol.upper(),
                        openInterest=oi,
                        openInterestUsd=oi * btc_price
                    )
        except Exception as e:
            logger.warning(f"Bybit OI failed: {e}")
    
    raise HTTPException(status_code=502, detail="Open interest unavailable")


# ============ OI History ============

@router.get("/open-interest-history", response_model=List[OIHistoryItem])
async def get_oi_history(symbol: str = "BTCUSDT", period: str = "5m", limit: int = 30):
    """Get OI history"""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Try Binance
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/openInterestHist",
                params={"symbol": symbol.upper(), "period": period, "limit": min(limit, 500)}
            )
            if response.status_code == 200:
                data = response.json()
                return [
                    OIHistoryItem(
                        timestamp=int(item["timestamp"]),
                        sumOpenInterest=float(item["sumOpenInterest"]),
                        sumOpenInterestValue=float(item["sumOpenInterestValue"])
                    )
                    for item in data
                ]
        except Exception as e:
            logger.warning(f"Binance OI history failed: {e}")
        
        # Bybit doesn't have easy OI history, return empty
        return []


# ============ Taker Volume ============

@router.get("/taker-volume")
async def get_taker_volume(symbol: str = "BTCUSDT", period: str = "5m", limit: int = 30):
    """Get taker buy/sell volume"""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/futures/data/takerlongshortRatio",
                params={"symbol": symbol.upper(), "period": period, "limit": min(limit, 500)}
            )
            if response.status_code == 200:
                return [
                    {
                        "timestamp": int(item["timestamp"]),
                        "buyVol": float(item["buyVol"]),
                        "sellVol": float(item["sellVol"]),
                        "buySellRatio": float(item["buySellRatio"])
                    }
                    for item in response.json()
                ]
        except Exception as e:
            logger.warning(f"Taker volume failed: {e}")
    
    return []


# ============ MARKET OVERVIEW (Main endpoint) ============

@router.get("/overview")
async def get_market_overview():
    """
    Get complete market overview - uses Bybit as fallback for derivatives data
    Indonesia is restricted from Binance Futures, so Bybit is used automatically
    """
    result = {}
    btc_price = 0.0
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # STEP 1: Get BTC Price first
        btc_price = await get_btc_price_multi(client)
        
        # BTC Ticker (24h data) - Binance Spot usually works
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
                if btc_price == 0:
                    btc_price = float(data["lastPrice"])
        except Exception as e:
            logger.warning(f"BTC ticker failed: {e}")
        
        # STEP 2: Derivatives data - Try Binance, fallback Bybit
        
        # Funding Rate
        funding_success = False
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
                funding_success = True
                logger.info("Using Binance for funding rate")
        except Exception as e:
            logger.warning(f"Binance funding failed: {e}")
        
        if not funding_success:
            # Bybit fallback
            try:
                response = await client.get(
                    f"{BYBIT_API}/v5/market/tickers",
                    params={"category": "linear", "symbol": "BTCUSDT"}
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get("result", {}).get("list"):
                        item = data["result"]["list"][0]
                        result["funding"] = {
                            "rate": float(item.get("fundingRate", 0)) * 100,
                            "next_time": int(datetime.utcnow().timestamp() * 1000)
                        }
                        logger.info("Using Bybit for funding rate")
            except Exception as e:
                logger.warning(f"Bybit funding also failed: {e}")
        
        # Open Interest
        oi_success = False
        try:
            response = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
                params={"symbol": "BTCUSDT"}
            )
            if response.status_code == 200:
                data = response.json()
                oi_btc = float(data["openInterest"])
                result["open_interest"] = {
                    "btc": oi_btc,
                    "usd": oi_btc * btc_price
                }
                oi_success = True
                logger.info("Using Binance for OI")
        except Exception as e:
            logger.warning(f"Binance OI failed: {e}")
        
        if not oi_success:
            # Bybit fallback
            try:
                response = await client.get(
                    f"{BYBIT_API}/v5/market/open-interest",
                    params={"category": "linear", "symbol": "BTCUSDT"}
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get("result", {}).get("list"):
                        item = data["result"]["list"][0]
                        oi_btc = float(item.get("openInterest", 0))
                        result["open_interest"] = {
                            "btc": oi_btc,
                            "usd": oi_btc * btc_price
                        }
                        logger.info("Using Bybit for OI")
            except Exception as e:
                logger.warning(f"Bybit OI also failed: {e}")
        
        # Long/Short Ratio
        ls_success = False
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
                    ls_success = True
                    logger.info("Using Binance for L/S ratio")
        except Exception as e:
            logger.warning(f"Binance L/S failed: {e}")
        
        if not ls_success:
            # Bybit fallback
            try:
                response = await client.get(
                    f"{BYBIT_API}/v5/market/account-ratio",
                    params={"category": "linear", "symbol": "BTCUSDT", "period": "1d", "limit": 1}
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get("result", {}).get("list"):
                        item = data["result"]["list"][0]
                        buy_ratio = float(item.get("buyRatio", 0.5))
                        sell_ratio = float(item.get("sellRatio", 0.5))
                        result["long_short"] = {
                            "long_pct": buy_ratio * 100,
                            "short_pct": sell_ratio * 100,
                            "ratio": buy_ratio / sell_ratio if sell_ratio > 0 else 1
                        }
                        logger.info("Using Bybit for L/S ratio")
            except Exception as e:
                logger.warning(f"Bybit L/S also failed: {e}")
    
    result["timestamp"] = datetime.utcnow().isoformat()
    return result