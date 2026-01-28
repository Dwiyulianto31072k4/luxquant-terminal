"""
Market API Routes - Real-time BTC Price
Tries multiple APIs: Binance -> CoinGecko -> CoinCap
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import httpx

router = APIRouter()


class MarketOverview(BaseModel):
    btc_price: float
    btc_change_24h: float
    open_interest: Optional[float] = None
    volume_24h: Optional[float] = None
    liquidation_24h: Optional[float] = None
    fear_greed_index: Optional[int] = None
    btc_dominance: Optional[float] = None
    funding_rate: Optional[float] = None


async def fetch_from_binance(client: httpx.AsyncClient):
    """Try Binance API"""
    response = await client.get(
        "https://api.binance.com/api/v3/ticker/24hr",
        params={"symbol": "BTCUSDT"},
        timeout=5.0
    )
    if response.status_code == 200:
        data = response.json()
        return {
            "price": float(data["lastPrice"]),
            "change_24h": float(data["priceChangePercent"]),
            "volume_24h": float(data["quoteVolume"]),
            "source": "binance"
        }
    return None


async def fetch_from_coingecko(client: httpx.AsyncClient):
    """Try CoinGecko API (free, no key needed)"""
    response = await client.get(
        "https://api.coingecko.com/api/v3/simple/price",
        params={
            "ids": "bitcoin",
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_24hr_vol": "true"
        },
        timeout=5.0
    )
    if response.status_code == 200:
        data = response.json()
        if "bitcoin" in data:
            return {
                "price": float(data["bitcoin"]["usd"]),
                "change_24h": float(data["bitcoin"].get("usd_24h_change", 0)),
                "volume_24h": float(data["bitcoin"].get("usd_24h_vol", 0)),
                "source": "coingecko"
            }
    return None


async def fetch_from_coincap(client: httpx.AsyncClient):
    """Try CoinCap API (free, no key needed)"""
    response = await client.get(
        "https://api.coincap.io/v2/assets/bitcoin",
        timeout=5.0
    )
    if response.status_code == 200:
        data = response.json()
        if "data" in data:
            btc = data["data"]
            return {
                "price": float(btc["priceUsd"]),
                "change_24h": float(btc.get("changePercent24Hr", 0)),
                "volume_24h": float(btc.get("volumeUsd24Hr", 0)),
                "source": "coincap"
            }
    return None


async def get_btc_data():
    """Try multiple APIs in sequence"""
    async with httpx.AsyncClient() as client:
        # Try Binance first
        try:
            result = await fetch_from_binance(client)
            if result:
                return result
        except Exception as e:
            print(f"Binance failed: {e}")
        
        # Try CoinGecko
        try:
            result = await fetch_from_coingecko(client)
            if result:
                return result
        except Exception as e:
            print(f"CoinGecko failed: {e}")
        
        # Try CoinCap
        try:
            result = await fetch_from_coincap(client)
            if result:
                return result
        except Exception as e:
            print(f"CoinCap failed: {e}")
    
    # All failed - return fallback
    return {
        "price": 104000.0,
        "change_24h": 0.0,
        "volume_24h": 0.0,
        "source": "fallback"
    }


@router.get("/overview", response_model=MarketOverview)
async def get_market_overview():
    """Get market overview with real BTC price"""
    
    btc_data = await get_btc_data()
    
    return MarketOverview(
        btc_price=btc_data["price"],
        btc_change_24h=btc_data["change_24h"],
        open_interest=61.92e9,
        volume_24h=btc_data["volume_24h"],
        liquidation_24h=233.78e6,
        fear_greed_index=43,
        btc_dominance=59.12,
        funding_rate=0.0042
    )


@router.get("/btc-price")
async def get_btc_price():
    """Get current BTC price"""
    return await get_btc_data()