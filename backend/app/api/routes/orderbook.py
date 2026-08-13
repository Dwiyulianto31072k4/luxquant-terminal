"""
Order Book Imbalance API Routes
"""
from fastapi import APIRouter, Query

from app.services.orderbook_service import (
    get_orderbook_analysis,
    get_orderbook_comparison,
    get_orderbook_heatmap_overview,
    SUPPORTED_SYMBOLS,
)

router = APIRouter(prefix="/orderbook", tags=["orderbook"])


@router.get("/analysis")
async def orderbook_analysis(
    symbol: str = Query(default="BTCUSDT", description="Trading pair symbol"),
):
    """Get order book analysis for a symbol (depth, walls, imbalance, ladder)."""
    return await get_orderbook_analysis(symbol)


@router.get("/comparison")
async def orderbook_comparison():
    """Get BTC + ETH + SOL order book side by side."""
    return await get_orderbook_comparison()


@router.get("/overview")
async def orderbook_overview():
    """Live multi-pair imbalance from Binance WS worker blob (call-universe)."""
    return await get_orderbook_heatmap_overview()


@router.get("/symbols")
async def orderbook_symbols():
    """Supported default symbols for the UI picker."""
    return {
        "symbols": [
            {"key": k, "name": v.get("name"), "base": v.get("base")}
            for k, v in SUPPORTED_SYMBOLS.items()
        ]
    }
