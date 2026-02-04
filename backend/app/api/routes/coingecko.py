"""
CoinGecko Proxy Router - with Demo API key support and caching
Free tier: 5-15 calls/min (unreliable)
Demo tier: 30 calls/min (free, more reliable)
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any
import httpx
from pydantic import BaseModel
from datetime import datetime, timedelta
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter()

# Try to import from config, fallback to env
try:
    from app.config import settings
    COINGECKO_API_KEY = getattr(settings, 'COINGECKO_API_KEY', '') or os.getenv('COINGECKO_API_KEY', '')
except:
    COINGECKO_API_KEY = os.getenv('COINGECKO_API_KEY', '')

# Use Demo API if key available, otherwise public
if COINGECKO_API_KEY:
    COINGECKO_API = "https://api.coingecko.com/api/v3"
    COINGECKO_HEADERS = {"x-cg-demo-api-key": COINGECKO_API_KEY}
    logger.info("Using CoinGecko Demo API")
else:
    COINGECKO_API = "https://api.coingecko.com/api/v3"
    COINGECKO_HEADERS = {}
    logger.info("Using CoinGecko Public API (limited)")

TIMEOUT = 15.0

# Cache - longer duration to avoid rate limits
_cache: Dict[str, Any] = {}
_cache_expiry: Dict[str, datetime] = {}
CACHE_DURATION = timedelta(minutes=5)  # 5 minutes cache


def get_cached(key: str) -> Optional[Any]:
    """Get data from cache if not expired"""
    if key in _cache and key in _cache_expiry:
        if datetime.utcnow() < _cache_expiry[key]:
            logger.debug(f"Cache hit: {key}")
            return _cache[key]
    return None


def set_cache(key: str, data: Any, duration: timedelta = None):
    """Set data in cache"""
    _cache[key] = data
    _cache_expiry[key] = datetime.utcnow() + (duration or CACHE_DURATION)


# ============ Response Models ============

class BitcoinData(BaseModel):
    price: float
    price_change_24h: float
    price_change_7d: float
    price_change_30d: float
    high_24h: float
    low_24h: float
    ath: float
    ath_change: float
    market_cap: float
    market_cap_rank: int
    volume_24h: float
    circulating_supply: float
    max_supply: float
    dominance: float
    fear_greed_value: int
    fear_greed_label: str
    timestamp: str


class GlobalData(BaseModel):
    total_market_cap: float
    total_volume: float
    btc_dominance: float
    eth_dominance: float
    market_cap_change_24h: float
    active_cryptocurrencies: int
    timestamp: str


class CoinMarketData(BaseModel):
    id: str
    symbol: str
    name: str
    price: float
    price_change_24h: float
    market_cap: float
    volume_24h: float
    image: Optional[str] = None


# ============ Bitcoin Data (Combined) ============

@router.get("/bitcoin", response_model=BitcoinData)
async def get_bitcoin_data():
    """
    Get Bitcoin data with caching.
    Combines: price, market data, global data, fear & greed.
    """
    cache_key = "bitcoin_data"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=COINGECKO_HEADERS) as client:
            # Fetch Bitcoin data (includes global stats)
            btc_response = await client.get(
                f"{COINGECKO_API}/coins/bitcoin",
                params={
                    "localization": "false",
                    "tickers": "false",
                    "community_data": "false",
                    "developer_data": "false"
                }
            )
            
            # Process Bitcoin data first
            if btc_response.status_code == 429:
                logger.warning("CoinGecko rate limited")
                if cache_key in _cache:
                    return _cache[cache_key]
                raise HTTPException(status_code=429, detail="Rate limited. Please wait.")
            
            if btc_response.status_code != 200:
                logger.warning(f"CoinGecko error: {btc_response.status_code}")
                if cache_key in _cache:
                    return _cache[cache_key]
                raise HTTPException(status_code=502, detail="CoinGecko API error")
            
            btc = btc_response.json()
            md = btc.get("market_data", {})
            
            # Fetch Global data for dominance (separate call)
            dominance = 0.0
            try:
                global_response = await client.get(f"{COINGECKO_API}/global")
                if global_response.status_code == 200:
                    global_data = global_response.json().get("data", {})
                    dominance = global_data.get("market_cap_percentage", {}).get("btc", 0)
                    logger.info(f"BTC Dominance fetched: {dominance}")
                else:
                    logger.warning(f"Global data fetch failed: {global_response.status_code}")
            except Exception as e:
                logger.warning(f"Global data error: {e}")
            
            # Fetch Fear & Greed (different API, no key needed)
            fg_response = await client.get(
                "https://api.alternative.me/fng/",
                params={"limit": 1}
            )
            
            # Process Fear & Greed
            fg_value = 50
            fg_label = "Neutral"
            if fg_response.status_code == 200:
                fg_data = fg_response.json()
                if fg_data.get("data") and len(fg_data["data"]) > 0:
                    fg_value = int(fg_data["data"][0].get("value", 50))
                    fg_label = fg_data["data"][0].get("value_classification", "Neutral")
            
            result = BitcoinData(
                price=md.get("current_price", {}).get("usd", 0),
                price_change_24h=md.get("price_change_percentage_24h", 0) or 0,
                price_change_7d=md.get("price_change_percentage_7d", 0) or 0,
                price_change_30d=md.get("price_change_percentage_30d", 0) or 0,
                high_24h=md.get("high_24h", {}).get("usd", 0),
                low_24h=md.get("low_24h", {}).get("usd", 0),
                ath=md.get("ath", {}).get("usd", 0),
                ath_change=md.get("ath_change_percentage", {}).get("usd", 0) or 0,
                market_cap=md.get("market_cap", {}).get("usd", 0),
                market_cap_rank=btc.get("market_cap_rank", 1),
                volume_24h=md.get("total_volume", {}).get("usd", 0),
                circulating_supply=md.get("circulating_supply", 0) or 0,
                max_supply=md.get("max_supply") or 21000000,
                dominance=dominance,
                fear_greed_value=fg_value,
                fear_greed_label=fg_label,
                timestamp=datetime.utcnow().isoformat()
            )
            
            set_cache(cache_key, result)
            return result
            
    except httpx.HTTPError as e:
        logger.error(f"CoinGecko request error: {e}")
        if cache_key in _cache:
            logger.info("Returning stale cache due to error")
            return _cache[cache_key]
        raise HTTPException(status_code=502, detail=f"CoinGecko API error: {str(e)}")


# ============ Global Market Data ============

@router.get("/global", response_model=GlobalData)
async def get_global_data():
    """Get global market data with caching"""
    cache_key = "global_data"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=COINGECKO_HEADERS) as client:
            response = await client.get(f"{COINGECKO_API}/global")
            
            if response.status_code == 429:
                if cache_key in _cache:
                    return _cache[cache_key]
                raise HTTPException(status_code=429, detail="Rate limited")
            
            if response.status_code != 200:
                if cache_key in _cache:
                    return _cache[cache_key]
                raise HTTPException(status_code=502, detail="CoinGecko API error")
            
            data = response.json().get("data", {})
            
            result = GlobalData(
                total_market_cap=data.get("total_market_cap", {}).get("usd", 0),
                total_volume=data.get("total_volume", {}).get("usd", 0),
                btc_dominance=data.get("market_cap_percentage", {}).get("btc", 0),
                eth_dominance=data.get("market_cap_percentage", {}).get("eth", 0),
                market_cap_change_24h=data.get("market_cap_change_percentage_24h_usd", 0),
                active_cryptocurrencies=data.get("active_cryptocurrencies", 0),
                timestamp=datetime.utcnow().isoformat()
            )
            
            set_cache(cache_key, result)
            return result
            
    except httpx.HTTPError as e:
        logger.error(f"CoinGecko error: {e}")
        if cache_key in _cache:
            return _cache[cache_key]
        raise HTTPException(status_code=502, detail=f"CoinGecko API error: {str(e)}")


# ============ Top Coins Market Data ============

@router.get("/coins")
async def get_coins_market(per_page: int = 100):
    """Get top coins market data with caching (10 min for this heavy endpoint)"""
    cache_key = f"coins_market_{per_page}"
    cached = get_cached(cache_key)
    if cached:
        logger.info(f"Returning cached coins data ({len(cached)} coins)")
        return cached
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=COINGECKO_HEADERS) as client:
            response = await client.get(
                f"{COINGECKO_API}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": min(per_page, 250),
                    "page": 1,
                    "sparkline": "false",
                    "price_change_percentage": "24h"
                }
            )
            
            if response.status_code == 429:
                logger.warning("CoinGecko rate limited on /coins")
                if cache_key in _cache:
                    logger.info("Returning stale cache due to rate limit")
                    return _cache[cache_key]
                raise HTTPException(status_code=429, detail="Rate limited. Please wait.")
            
            if response.status_code != 200:
                logger.warning(f"CoinGecko /coins error: {response.status_code}")
                if cache_key in _cache:
                    return _cache[cache_key]
                raise HTTPException(status_code=502, detail="CoinGecko API error")
            
            data = response.json()
            
            result = [
                CoinMarketData(
                    id=coin.get("id", ""),
                    symbol=coin.get("symbol", "").upper(),
                    name=coin.get("name", ""),
                    price=coin.get("current_price", 0) or 0,
                    price_change_24h=coin.get("price_change_percentage_24h", 0) or 0,
                    market_cap=coin.get("market_cap", 0) or 0,
                    volume_24h=coin.get("total_volume", 0) or 0,
                    image=coin.get("image")
                )
                for coin in data
            ]
            
            # Cache for 10 minutes (longer for this heavy endpoint)
            set_cache(cache_key, result, timedelta(minutes=10))
            logger.info(f"Cached {len(result)} coins for 10 minutes")
            return result
            
    except httpx.HTTPError as e:
        logger.error(f"CoinGecko /coins request error: {e}")
        if cache_key in _cache:
            logger.info("Returning stale cache due to error")
            return _cache[cache_key]
        raise HTTPException(status_code=502, detail=f"CoinGecko API error: {str(e)}")


# ============ Health Check ============

@router.get("/status")
async def check_status():
    """Check CoinGecko API status"""
    return {
        "api_key_configured": bool(COINGECKO_API_KEY),
        "cache_entries": len(_cache),
        "cache_keys": list(_cache.keys())
    }