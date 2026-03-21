# backend/app/api/routes/calendar.py
"""
Macro Economic Calendar & Crypto Calendar Routes
Data sources:
  - Macro: ForexFactory (free, no API key)
  - Token Unlocks: DefiLlama (free, public endpoints)
  - Crypto Events: CoinMarketCap (scrape)
  - News: RSS feeds (CoinTelegraph, CoinDesk, Decrypt)
"""
from fastapi import APIRouter, Query
from typing import Optional

from app.services.calendar_service import get_calendar, get_upcoming_high_impact
from app.services.macro_news_service import get_macro_news
from app.services.crypto_calendar_service import (
    get_token_unlocks,
    get_crypto_events,
    get_unified_calendar,
)

router = APIRouter(prefix="/calendar", tags=["Calendar"])


# ════════════════════════════════════════════
# EXISTING — Macro Economic Calendar
# ════════════════════════════════════════════

@router.get("/events")
async def get_events(
    impact: Optional[str] = Query(None, description="Filter: High,Medium,Low,Holiday"),
    country: Optional[str] = Query(None, description="Filter: USD,EUR,GBP,JPY etc"),
    include_next_week: bool = Query(False, description="Include next week data"),
):
    """Get macro economic calendar events"""
    events = await get_calendar(
        impact=impact,
        country=country,
        include_next_week=include_next_week,
    )
    return {"events": events, "total": len(events)}


@router.get("/upcoming")
async def get_upcoming(
    limit: int = Query(5, ge=1, le=20),
):
    """Get next upcoming high-impact events (for widgets)"""
    events = await get_upcoming_high_impact(limit=limit)
    return {"events": events, "total": len(events)}


@router.get("/news")
async def get_news(
    limit: int = Query(15, ge=1, le=30),
):
    """Get macro & crypto news from RSS feeds"""
    return await get_macro_news(limit=limit)


# ════════════════════════════════════════════
# NEW — Token Unlocks
# ════════════════════════════════════════════

@router.get("/unlocks")
async def get_unlocks():
    """Get upcoming token unlock events from DefiLlama"""
    events = await get_token_unlocks()
    return {
        "events": events,
        "total": len(events),
        "source": "defillama",
    }


# ════════════════════════════════════════════
# NEW — Crypto Events
# ════════════════════════════════════════════

@router.get("/crypto-events")
async def get_crypto_events_endpoint():
    """Get upcoming crypto events (airdrops, forks, listings, etc.)"""
    events = await get_crypto_events()
    return {
        "events": events,
        "total": len(events),
        "source": "coinmarketcap",
    }


# ════════════════════════════════════════════
# NEW — Unified Calendar (all sources merged)
# ════════════════════════════════════════════

@router.get("/unified")
async def get_unified(
    event_type: Optional[str] = Query(None, description="Filter: all, macro, unlock, crypto_event"),
    impact: Optional[str] = Query(None, description="Filter: High, Medium, Low, Holiday"),
    symbol: Optional[str] = Query(None, description="Filter by coin/country symbol"),
):
    """
    Get unified calendar merging all sources:
    - Macro economic events (ForexFactory)
    - Token unlocks (DefiLlama)
    - Crypto events (CoinMarketCap)
    
    Returns events sorted by date with stats.
    """
    return await get_unified_calendar(
        event_type=event_type,
        impact=impact,
        symbol=symbol,
    )