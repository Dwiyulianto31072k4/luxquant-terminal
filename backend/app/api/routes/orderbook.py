"""
Order Book Imbalance API Routes
"""
from fastapi import APIRouter, Query

from app.services.orderbook_service import (
    get_orderbook_analysis,
    get_orderbook_comparison,
)

router = APIRouter(prefix="/orderbook", tags=["orderbook"])


@router.get("/analysis")
async def orderbook_analysis(
    symbol: str = Query(default="BTCUSDT", description="Trading pair symbol"),
):
    """Get order book analysis for a symbol."""
    return await get_orderbook_analysis(symbol)


@router.get("/comparison")
async def orderbook_comparison():
    """Get BTC + ETH order book side by side."""
    return await get_orderbook_comparison()