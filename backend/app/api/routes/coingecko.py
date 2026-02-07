# backend/app/api/routes/coingecko.py
"""
LuxQuant Terminal - CoinGecko Routes
API endpoints untuk data dari CoinGecko
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
import httpx

from app.config import settings

router = APIRouter()

# CoinGecko configuration
COINGECKO_API_KEY = settings.COINGECKO_API_KEY
BASE_URL = "https://pro-api.coingecko.com/api/v3" if COINGECKO_API_KEY else "https://api.coingecko.com/api/v3"

# Headers dengan API key jika ada
def get_headers():
    headers = {}
    if COINGECKO_API_KEY:
        headers["x-cg-pro-api-key"] = COINGECKO_API_KEY
    return headers


@router.get("/bitcoin")
async def get_bitcoin_data():
    """
    Get Bitcoin data dari CoinGecko
    Returns: Bitcoin market data lengkap
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{BASE_URL}/coins/bitcoin",
                headers=get_headers(),
                params={
                    "localization": "false",
                    "tickers": "false",
                    "community_data": "false",
                    "developer_data": "false"
                }
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Bitcoin data: {str(e)}")


@router.get("/global")
async def get_global_data():
    """
    Get global market data dari CoinGecko
    Returns: Total market cap, BTC dominance, etc
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{BASE_URL}/global",
                headers=get_headers()
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch global data: {str(e)}")


@router.get("/markets")
async def get_markets_data(
    vs_currency: str = "usd",
    per_page: int = 100,
    page: int = 1
):
    """
    Get markets data dari CoinGecko
    Returns: List of coins dengan market data
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{BASE_URL}/coins/markets",
                headers=get_headers(),
                params={
                    "vs_currency": vs_currency,
                    "order": "market_cap_desc",
                    "per_page": per_page,
                    "page": page,
                    "sparkline": "false",
                    "price_change_percentage": "1h,24h,7d"
                }
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch markets data: {str(e)}")


@router.get("/fear-greed")
async def get_fear_greed_index():
    """
    Get Fear & Greed Index dari Alternative.me
    Returns: Current fear & greed index value
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://api.alternative.me/fng/?limit=1")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch fear & greed index: {str(e)}")