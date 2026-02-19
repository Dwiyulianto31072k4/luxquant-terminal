# backend/app/api/routes/coingecko.py
"""
LuxQuant Terminal - CoinGecko Routes
API endpoints untuk data dari CoinGecko
UPDATED: Trimmed file, removed duplicates. Only /coin-info/{symbol} kept for SignalModal Research tab.
"""
from fastapi import APIRouter
import httpx
import re

from app.config import settings
from app.core.redis import cache_get, cache_set

router = APIRouter(tags=["coingecko"])

# CoinGecko configuration
COINGECKO_API_KEY = settings.COINGECKO_API_KEY

# ============================================
# GET /coin-info/{symbol} — For SignalModal Research Tab
# ============================================

@router.get("/coin-info/{symbol}")
async def get_coin_info(symbol: str):
    symbol_upper = symbol.upper().strip()
    cache_key = f"lq:coingecko:coin-info:{symbol_upper}"

    cached = cache_get(cache_key)
    if cached:
        return cached

    # Always use free API — demo key doesn't work with pro-api.coingecko.com
    FREE_URL = "https://api.coingecko.com/api/v3"
    headers = {"accept": "application/json"}
    if COINGECKO_API_KEY:
        headers["x-cg-demo-api-key"] = COINGECKO_API_KEY

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            search_res = await client.get(f"{FREE_URL}/search", headers=headers, params={"query": symbol_upper})
            if search_res.status_code != 200:
                return {"error": f"search_failed_{search_res.status_code}", "symbol": symbol_upper}

            coins = search_res.json().get("coins", [])

            coin_id = None
            for c in coins:
                if (c.get("symbol") or "").upper() == symbol_upper:
                    coin_id = c.get("id")
                    break
            if not coin_id and coins:
                coin_id = coins[0].get("id")
            if not coin_id:
                return {"error": "not_found", "symbol": symbol_upper}

            coin_res = await client.get(
                f"{FREE_URL}/coins/{coin_id}",
                headers=headers,
                params={"localization": "false", "tickers": "false", "community_data": "false", "developer_data": "false", "sparkline": "false"}
            )
            if coin_res.status_code != 200:
                return {"error": f"coin_failed_{coin_res.status_code}", "symbol": symbol_upper}

            data = coin_res.json()
            md = data.get("market_data", {})

            desc_raw = (data.get("description", {}).get("en") or "")
            desc_clean = re.sub(r'<[^>]+>', '', desc_raw).strip()
            if len(desc_clean) > 500:
                desc_clean = desc_clean[:497] + "..."

            links = data.get("links", {})
            homepage_list = links.get("homepage") or []
            homepage = homepage_list[0] if homepage_list and homepage_list[0] else None
            github_repos = links.get("repos_url", {}).get("github", [])
            subreddit = links.get("subreddit_url")

            result = {
                "id": data.get("id"),
                "symbol": (data.get("symbol") or "").upper(),
                "name": data.get("name"),
                "description": desc_clean or None,
                "image_thumb": data.get("image", {}).get("thumb"),
                "image_small": data.get("image", {}).get("small"),
                "image_large": data.get("image", {}).get("large"),
                "categories": [c for c in (data.get("categories") or []) if c],
                "market_data": {
                    "current_price": md.get("current_price", {}).get("usd"),
                    "market_cap": md.get("market_cap", {}).get("usd"),
                    "market_cap_rank": md.get("market_cap_rank") or data.get("market_cap_rank"),
                    "total_volume": md.get("total_volume", {}).get("usd"),
                    "price_change_24h_pct": md.get("price_change_percentage_24h"),
                    "price_change_7d_pct": md.get("price_change_percentage_7d"),
                    "price_change_30d_pct": md.get("price_change_percentage_30d"),
                    "ath": md.get("ath", {}).get("usd"),
                    "ath_change_pct": md.get("ath_change_percentage", {}).get("usd"),
                    "ath_date": md.get("ath_date", {}).get("usd"),
                    "atl": md.get("atl", {}).get("usd"),
                    "circulating_supply": md.get("circulating_supply"),
                    "total_supply": md.get("total_supply"),
                    "max_supply": md.get("max_supply"),
                    "fully_diluted_valuation": md.get("fully_diluted_valuation", {}).get("usd"),
                    "high_24h": md.get("high_24h", {}).get("usd"),
                    "low_24h": md.get("low_24h", {}).get("usd"),
                },
                "links": {
                    "homepage": homepage,
                    "twitter": links.get("twitter_screen_name") or None,
                    "telegram": links.get("telegram_channel_identifier") or None,
                    "subreddit": subreddit if subreddit and subreddit != "https://www.reddit.com" else None,
                    "github": github_repos[0] if github_repos else None,
                },
                "genesis_date": data.get("genesis_date"),
                "sentiment_votes_up_percentage": data.get("sentiment_votes_up_percentage"),
                "sentiment_votes_down_percentage": data.get("sentiment_votes_down_percentage"),
            }

            cache_set(cache_key, result, ttl=600)
            return result

    except Exception as e:
        return {"error": str(e), "symbol": symbol_upper}