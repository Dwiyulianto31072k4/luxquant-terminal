"""
Whale Alert API Routes
Endpoints for whale transaction tracking and exchange flow analysis
"""
from fastapi import APIRouter, Query
from typing import Optional

from app.services.whale_service import (
    get_whale_transactions,
    get_whale_stats,
    get_exchange_flows,
)

router = APIRouter(prefix="/whale", tags=["Whale Alert"])


@router.get("/transactions")
async def whale_transactions(
    blockchain: Optional[str] = Query(None, description="Filter: bitcoin, ethereum, solana, etc"),
    min_usd: int = Query(500000, ge=10000, description="Min transaction value in USD"),
    transfer_type: Optional[str] = Query(None, description="Filter: exchange_inflow, exchange_outflow, wallet_to_wallet, exchange_to_exchange"),
    size: int = Query(50, ge=1, le=100, description="Number of transactions"),
):
    """Get recent whale transactions across blockchains."""
    return await get_whale_transactions(
        blockchain=blockchain,
        min_usd=min_usd,
        transfer_type=transfer_type,
        size=size,
    )


@router.get("/stats")
async def whale_stats():
    """Get aggregated whale activity statistics."""
    return await get_whale_stats()


@router.get("/flows")
async def exchange_flows():
    """Get exchange inflow/outflow analysis with sentiment."""
    return await get_exchange_flows()