# backend/app/api/routes/fx.py
"""
FX Rates Router — exposes USDT-to-fiat conversion rates.

Pattern follows market.py:
  - Primary: read from Redis cache (populated by fx_worker)
  - Fallback: stale cache if worker hasn't run or API failed
  - Last resort: direct fetch (rare — worker should keep cache fresh)

Endpoints:
  GET /api/v1/fx/rates              → all USDT-to-fiat rates
  GET /api/v1/fx/rates/{currency}   → single currency rate
  GET /api/v1/fx/supported          → list of supported currency codes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional

from app.core.redis import cache_get, cache_get_with_stale, cache_set
from app.services.fx_worker import (
    fetch_fx_rates,
    FX_RATES_KEY,
    FX_CACHE_TTL,
)
from app.services.currency_mapping import SUPPORTED_CURRENCIES

router = APIRouter(tags=["fx"])


# ============ Response Models ============

class FxRatesResponse(BaseModel):
    base: str
    rates: Dict[str, float]
    updated_at: int
    source: str
    count: int
    is_stale: bool = False


class FxSingleRateResponse(BaseModel):
    base: str
    currency: str
    rate: float
    updated_at: int
    is_stale: bool = False


class FxSupportedResponse(BaseModel):
    supported: list[str]
    count: int


# ============ Endpoints ============

@router.get("/rates", response_model=FxRatesResponse)
async def get_fx_rates():
    """
    All USDT-to-fiat conversion rates.

    Returns rates for ~46 currencies. Use this in CurrencyContext to convert
    any USDT price to user's preferred display currency:

        local_price = usdt_price * rates[user.currency_code]
    """
    # Fresh cache (populated by fx_worker)
    cached = cache_get(FX_RATES_KEY)
    if cached:
        return FxRatesResponse(**cached, is_stale=False)

    # Stale cache (worker failed or expired)
    stale, _ = cache_get_with_stale(FX_RATES_KEY)
    if stale:
        return FxRatesResponse(**stale, is_stale=True)

    # Last resort: direct fetch (shouldn't normally happen)
    result = await fetch_fx_rates()
    if result:
        cache_set(FX_RATES_KEY, result, ttl=FX_CACHE_TTL)
        return FxRatesResponse(**result, is_stale=False)

    raise HTTPException(
        status_code=503,
        detail="FX rates temporarily unavailable. Please try again in a moment."
    )


@router.get("/rates/{currency}", response_model=FxSingleRateResponse)
async def get_fx_single_rate(currency: str):
    """
    Single currency rate. Convenience endpoint for direct conversion.
    Returns 404 if currency not supported.
    """
    currency_upper = currency.strip().upper()

    if currency_upper not in SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=404,
            detail=f"Currency '{currency_upper}' not supported. "
                   f"Use GET /api/v1/fx/supported to list available currencies."
        )

    # Read from cache
    cached = cache_get(FX_RATES_KEY)
    is_stale = False

    if not cached:
        stale, _ = cache_get_with_stale(FX_RATES_KEY)
        if stale:
            cached = stale
            is_stale = True

    if not cached:
        raise HTTPException(
            status_code=503,
            detail="FX rates temporarily unavailable."
        )

    rate = cached.get("rates", {}).get(currency_upper)
    if rate is None:
        raise HTTPException(
            status_code=503,
            detail=f"Rate for {currency_upper} not in current FX cache. "
                   f"Worker may be initializing."
        )

    return FxSingleRateResponse(
        base=cached.get("base", "USDT"),
        currency=currency_upper,
        rate=rate,
        updated_at=cached.get("updated_at", 0),
        is_stale=is_stale,
    )


@router.get("/supported", response_model=FxSupportedResponse)
async def get_supported_currencies():
    """List of supported currency codes (ISO 4217)."""
    sorted_currencies = sorted(SUPPORTED_CURRENCIES)
    return FxSupportedResponse(
        supported=sorted_currencies,
        count=len(sorted_currencies),
    )