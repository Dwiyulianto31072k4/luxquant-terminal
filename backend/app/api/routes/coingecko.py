# backend/app/api/routes/coingecko.py
"""
LuxQuant Terminal - CoinGecko Routes
API endpoints untuk data dari CoinGecko
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
import httpx
import re

from app.config import settings
from app.core.redis import cache_get, cache_set, is_redis_available

router = APIRouter()

# CoinGecko configuration
COINGECKO_API_KEY = settings.COINGECKO_API_KEY
BASE_URL = "https://pro-api.coingecko.com/api/v3" if COINGECKO_API_KEY else "https://api.coingecko.com/api/v3"


# Headers dengan API key jika ada
def get_headers():
    headers = {"accept": "application/json"}
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


# ============================================================
# COIN INFO — Description, market data, links from CoinGecko
# Used by SignalModal Research tab
# ============================================================

@router.get("/coin-info/{symbol}")
async def get_coin_info(symbol: str):
    """
    Get coin description, market data, and social links from CoinGecko.
    
    Args:
        symbol: Coin symbol e.g. 'BTC', 'ETH', 'MYX', 'SOL'
    
    Returns:
        Coin name, description (cleaned, max 500 chars), categories,
        market data (price, mcap, volume, ATH, supply), social links.
    
    Cached 1 hour in Redis.
    """
    symbol_clean = symbol.strip().upper()
    symbol_lower = symbol_clean.lower()
    cache_key = f"lq:coin_info:{symbol_lower}"

    # Check Redis cache
    if is_redis_available():
        cached = cache_get(cache_key)
        if cached:
            return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Step 1: Search CoinGecko to find coin ID from symbol
            search_res = await client.get(
                f"{BASE_URL}/search",
                headers=get_headers(),
                params={"query": symbol_lower}
            )

            coin_id = None
            if search_res.status_code == 200:
                search_data = search_res.json()
                coins = search_data.get("coins", [])
                # Exact symbol match first
                for c in coins:
                    if (c.get("symbol") or "").lower() == symbol_lower:
                        coin_id = c.get("id")
                        break
                # Fallback: first result
                if not coin_id and coins:
                    coin_id = coins[0].get("id")

            if not coin_id:
                return {
                    "error": "not_found",
                    "message": f"Coin '{symbol_clean}' not found on CoinGecko",
                    "symbol": symbol_clean,
                }

            # Step 2: Fetch full coin data
            coin_res = await client.get(
                f"{BASE_URL}/coins/{coin_id}",
                headers=get_headers(),
                params={
                    "localization": "false",
                    "tickers": "false",
                    "market_data": "true",
                    "community_data": "false",
                    "developer_data": "false",
                    "sparkline": "false",
                },
            )

            if coin_res.status_code == 429:
                return {
                    "error": "rate_limited",
                    "message": "CoinGecko rate limited, try again later",
                    "symbol": symbol_clean,
                }

            if coin_res.status_code != 200:
                return {
                    "error": "api_error",
                    "message": f"CoinGecko returned {coin_res.status_code}",
                    "symbol": symbol_clean,
                }

            data = coin_res.json()

            # Clean description (strip HTML tags, truncate)
            desc_raw = data.get("description", {}).get("en", "") or ""
            desc_clean = re.sub(r"<[^>]+>", "", desc_raw).strip()
            if len(desc_clean) > 500:
                # Truncate at last space before 500 chars
                truncated = desc_clean[:500]
                last_space = truncated.rfind(" ")
                if last_space > 400:
                    desc_clean = truncated[:last_space] + "..."
                else:
                    desc_clean = truncated + "..."

            # Extract market data safely
            md = data.get("market_data") or {}

            def safe_usd(obj, key="usd"):
                """Safely get USD value from nested dict."""
                if not obj:
                    return None
                if isinstance(obj, dict):
                    return obj.get(key)
                return obj

            # Extract links safely
            links = data.get("links") or {}
            homepage_list = links.get("homepage") or []
            github_list = (links.get("repos_url") or {}).get("github") or []

            result = {
                "id": coin_id,
                "symbol": (data.get("symbol") or "").upper(),
                "name": data.get("name", ""),
                "description": desc_clean,
                "image": (data.get("image") or {}).get("large", ""),
                "image_thumb": (data.get("image") or {}).get("thumb", ""),
                "categories": [
                    c for c in (data.get("categories") or []) if c
                ][:3],
                "links": {
                    "homepage": homepage_list[0] if homepage_list else "",
                    "twitter": links.get("twitter_screen_name", ""),
                    "telegram": links.get("telegram_channel_identifier", ""),
                    "github": github_list[0] if github_list else "",
                    "subreddit": links.get("subreddit_url", ""),
                },
                "market_data": {
                    "current_price": safe_usd(md.get("current_price")),
                    "market_cap": safe_usd(md.get("market_cap")),
                    "market_cap_rank": md.get("market_cap_rank"),
                    "total_volume": safe_usd(md.get("total_volume")),
                    "price_change_24h_pct": md.get("price_change_percentage_24h"),
                    "price_change_7d_pct": md.get("price_change_percentage_7d"),
                    "price_change_30d_pct": md.get("price_change_percentage_30d"),
                    "ath": safe_usd(md.get("ath")),
                    "ath_change_pct": safe_usd(md.get("ath_change_percentage")),
                    "ath_date": safe_usd(md.get("ath_date")),
                    "atl": safe_usd(md.get("atl")),
                    "circulating_supply": md.get("circulating_supply"),
                    "total_supply": md.get("total_supply"),
                    "max_supply": md.get("max_supply"),
                    "fully_diluted_valuation": safe_usd(
                        md.get("fully_diluted_valuation")
                    ),
                },
                "sentiment_votes_up_percentage": data.get(
                    "sentiment_votes_up_percentage"
                ),
                "watchlist_portfolio_users": data.get("watchlist_portfolio_users"),
                "genesis_date": data.get("genesis_date"),
            }

            # Cache 1 hour
            if is_redis_available():
                cache_set(cache_key, result, ttl=3600)

            return result

    except httpx.TimeoutException:
        return {
            "error": "timeout",
            "message": "CoinGecko request timed out",
            "symbol": symbol_clean,
        }
    except Exception as e:
        return {
            "error": "internal",
            "message": str(e),
            "symbol": symbol_clean,
        }