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

@router.get("/overview", response_model=MarketOverview)
async def get_market_overview():
    """
    Get market overview data.
    Ini bisa di-integrate dengan CoinGecko/Binance API nanti.
    Untuk sekarang return dummy data dulu.
    """
    # TODO: Integrate dengan real API
    # - CoinGecko untuk price
    # - Coinglass untuk OI, liquidations, funding
    # - Alternative.me untuk fear & greed
    
    return MarketOverview(
        btc_price=93001.30,
        btc_change_24h=-2.08,
        open_interest=61.92e9,
        volume_24h=59.62e9,
        liquidation_24h=233.78e6,
        fear_greed_index=43,
        btc_dominance=59.12,
        funding_rate=0.0042
    )

@router.get("/btc-price")
async def get_btc_price():
    """Get current BTC price from CoinGecko"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={
                    "ids": "bitcoin",
                    "vs_currencies": "usd",
                    "include_24hr_change": "true"
                },
                timeout=10.0
            )
            data = response.json()
            return {
                "price": data["bitcoin"]["usd"],
                "change_24h": data["bitcoin"]["usd_24h_change"]
            }
    except Exception as e:
        # Fallback ke dummy data
        return {
            "price": 93001.30,
            "change_24h": -2.08,
            "error": str(e)
        }
