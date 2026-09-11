"""Read-only exchange proxy. Only fixed public market paths are reachable."""
import asyncio
import hashlib
import json
import re

from fastapi import HTTPException
from app.core.http_client import get_general_client
from app.core.redis import cache_get, cache_set

HOSTS = {
    "binance-futures": "https://fapi.binance.com",
    "binance-spot": "https://api.binance.com",
    "bybit": "https://api.bybit.com",
    "bybit-id": "https://api.bybit.id",
}
PATHS = {
    "binance-futures": {
        "/fapi/v1/premiumIndex", "/fapi/v1/openInterest", "/fapi/v1/klines",
        "/fapi/v1/ticker/24hr", "/fapi/v1/fundingRate", "/fapi/v1/depth",
        "/futures/data/topLongShortPositionRatio", "/futures/data/topLongShortAccountRatio",
        "/futures/data/globalLongShortAccountRatio", "/futures/data/openInterestHist",
        "/futures/data/takerlongshortRatio",
    },
    "binance-spot": {"/api/v3/klines", "/api/v3/ticker/24hr"},
    "bybit": {"/v5/market/tickers", "/v5/market/kline", "/v5/market/open-interest",
              "/v5/market/account-ratio", "/v5/market/funding/history"},
}
PATHS["bybit-id"] = PATHS["bybit"]
PARAMS = {"symbol", "interval", "intervalTime", "period", "limit", "startTime",
          "endTime", "start", "end", "category"}
_pending = {}


def validate_request(provider, path, params):
    if path not in PATHS.get(provider, set()) or set(params) - PARAMS:
        raise HTTPException(400, "Unsupported market request")
    # Unicode symbols are real Binance instruments. Forbid separators and URLs.
    symbol = params.get("symbol", "")
    if not symbol or len(symbol) > 50 or not re.fullmatch(r"[\w]+", symbol):
        raise HTTPException(400, "A valid symbol is required")
    if any(len(str(v)) > 64 for v in params.values()):
        raise HTTPException(400, "Invalid market parameter")
    if "limit" in params:
        try:
            valid = 1 <= int(params["limit"]) <= 1000
        except (ValueError, TypeError):
            valid = False
        if not valid:
            raise HTTPException(400, "Invalid limit")
    if params.get("category", "linear") not in {"linear", "spot"}:
        raise HTTPException(400, "Unsupported market category")


async def exchange_data(provider, path, params):
    validate_request(provider, path, params)
    digest = hashlib.sha256(json.dumps([provider, path, params], sort_keys=True).encode()).hexdigest()
    key = "lq:public-market:" + digest
    cached = cache_get(key)
    if cached is not None:
        return cached
    if key in _pending:
        return await asyncio.shield(_pending[key])

    async def load():
        try:
            client = get_general_client()
            response = await client.get(HOSTS[provider] + path, params=params, timeout=8)
            if response.status_code != 200:
                raise HTTPException(502, "Market provider unavailable")
            data = response.json()
            if isinstance(data, dict) and (data.get("retCode", 0) != 0 or data.get("code", 0) < 0):
                raise HTTPException(502, "Market instrument unavailable")
            cache_set(key, data, ttl=15)
            return data
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, "Market data temporarily unavailable")
        finally:
            _pending.pop(key, None)

    task = asyncio.create_task(load())
    _pending[key] = task
    return await asyncio.shield(task)
