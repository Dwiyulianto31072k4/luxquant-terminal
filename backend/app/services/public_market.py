"""Read-only exchange proxy. Only fixed public market paths are reachable."""
import asyncio
import hashlib
import json
import re

from fastapi import HTTPException
from app.core.http_client import get_general_client
from app.core.redis import cache_get, cache_set, cache_get_with_stale

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


# Listings change on the scale of weeks, so a "not listed" answer is worth
# holding on to for an hour rather than re-asking the exchange every 15 seconds.
_NOT_LISTED_FLAG = "__not_listed__"
_NOT_LISTED = {_NOT_LISTED_FLAG: True}
NOT_LISTED_TTL = 3600


def _json_or_none(response):
    try:
        return response.json()
    except Exception:
        return None


def _is_not_listed(status: int, body) -> bool:
    """Every venue says it differently, and Bybit says it with a 200."""
    if not isinstance(body, dict):
        return False
    # Binance: HTTP 400 {"code":-1121,"msg":"Invalid symbol."}
    if status == 400 and body.get("code") == -1121:
        return True
    # Bybit: HTTP 200 {"retCode":10001,"retMsg":"params error: symbol invalid"}
    if body.get("retCode") == 10001 and "symbol" in str(body.get("retMsg", "")).lower():
        return True
    return False


def _last_good(key):
    """The previous answer for this exact call, or None.

    Prefer it over a 502 when a venue wobbles: 35 of today's 39 5xx were
    Binance/Bybit failing during the nightly backup window, each one a blank
    field in someone's signal modal. cache_set keeps a stale copy at 10x the
    TTL, so this is seconds-to-minutes old; a venue down longer than that still
    falls through to the error.
    """
    stale, _ = cache_get_with_stale(key)
    if stale is None or (isinstance(stale, dict) and stale.get(_NOT_LISTED_FLAG)):
        return None
    return stale


def _binance_futures_ok() -> bool:
    try:
        from app.services.terminal_worker import _fapi_ok
    except Exception:
        return True
    return _fapi_ok()


def _note_binance_ban(response) -> None:
    """Publish the ban so every caller on this IP backs off, not just us."""
    try:
        from app.services.terminal_worker import _note_ban

        _note_ban(response, 600 if response.status_code == 418 else 120)
    except Exception:
        pass


async def exchange_data(provider, path, params):
    validate_request(provider, path, params)
    digest = hashlib.sha256(json.dumps([provider, path, params], sort_keys=True).encode()).hexdigest()
    key = "lq:public-market:" + digest
    cached = cache_get(key)
    if cached is not None:
        if isinstance(cached, dict) and cached.get(_NOT_LISTED_FLAG):
            raise HTTPException(404, "Symbol not listed on this venue")
        return cached
    if key in _pending:
        return await asyncio.shield(_pending[key])

    async def load():
        try:
            # Binance escalates an IP ban (2 min up to 3 days) every time it is
            # hit DURING one, and this proxy used to keep calling straight
            # through the shared ban every other caller respects — 33 of the
            # day's 502s on 26 Sep were binance-futures here. Serve the last
            # good copy, or say plainly that it is a rate limit (503), without
            # calling; the modal already falls back to Bybit.
            if provider == "binance-futures" and not _binance_futures_ok():
                fallback = _last_good(key)
                if fallback is not None:
                    return fallback
                raise HTTPException(503, "Binance rate limit — retry shortly", headers={"Retry-After": "60"})
            client = get_general_client()
            response = await client.get(HOSTS[provider] + path, params=params, timeout=8)
            if provider == "binance-futures" and response.status_code in (418, 429):
                _note_binance_ban(response)
            body = _json_or_none(response)

            # "That pair is not listed here" is an ANSWER, not a gateway
            # failure, and it was being reported as 502. Measured 2026-09-13:
            # 785 502s in a day, 587 of them one call — the spot 24h ticker that
            # SignalModal fires unconditionally alongside the futures ones. Most
            # signalled pairs are perp-only, so for them that call can never
            # succeed. The UI was fine (Promise.allSettled, spot volume simply
            # absent); what was not fine is that a real gateway problem looked
            # identical to a pair that was never on spot, so the 502 count meant
            # nothing.
            #
            # Cached hard, because listings do not change by the minute: we
            # stop re-asking Binance the same doomed question on every modal
            # open, which is where the wasted rate-limit budget went.
            if _is_not_listed(response.status_code, body):
                cache_set(key, _NOT_LISTED, ttl=NOT_LISTED_TTL)
                raise HTTPException(404, "Symbol not listed on this venue")

            if response.status_code != 200:
                fallback = _last_good(key)
                if fallback is not None:
                    return fallback
                raise HTTPException(502, "Market provider unavailable")
            data = body if body is not None else response.json()
            if isinstance(data, dict) and (data.get("retCode", 0) != 0 or data.get("code", 0) < 0):
                fallback = _last_good(key)
                if fallback is not None:
                    return fallback
                raise HTTPException(502, "Market instrument unavailable")
            cache_set(key, data, ttl=15)
            return data
        except HTTPException:
            raise
        except Exception:
            fallback = _last_good(key)
            if fallback is not None:
                return fallback
            raise HTTPException(502, "Market data temporarily unavailable")
        finally:
            _pending.pop(key, None)

    task = asyncio.create_task(load())
    _pending[key] = task
    return await asyncio.shield(task)
