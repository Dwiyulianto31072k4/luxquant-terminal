# backend/app/api/routes/calendar.py
"""
Macro Economic Calendar Routes
Data source: ForexFactory (free, no API key)
"""
from fastapi import APIRouter, Query
from typing import Optional

from app.services.calendar_service import get_calendar, get_upcoming_high_impact

router = APIRouter(prefix="/calendar", tags=["Calendar"])


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