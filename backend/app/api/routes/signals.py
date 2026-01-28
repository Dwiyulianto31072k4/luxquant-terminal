"""
LuxQuant Terminal - Signals API Routes
Win Rate calculation matching luxquant-analyze-app logic
OPTIMIZED VERSION - uses efficient SQL aggregation
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text
from typing import Optional, List

from app.core.database import get_db
from app.models.signal import Signal, SignalUpdate
from app.schemas.signal import (
    SignalResponse, 
    SignalListResponse,
    SignalStats,
    SignalStatus
)
from app.config import settings

router = APIRouter()


@router.get("/", response_model=SignalListResponse)
async def get_signals(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
    status: Optional[str] = None,
    pair: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get paginated list of signals with filters"""
    query = db.query(Signal)
    
    # Filters
    if status:
        query = query.filter(Signal.status == status)
    if pair:
        query = query.filter(Signal.pair.ilike(f"%{pair}%"))
    
    # Total count
    total = query.count()
    
    # Pagination - order by call_message_id desc (newest first)
    offset = (page - 1) * page_size
    signals = query.order_by(desc(Signal.call_message_id)).offset(offset).limit(page_size).all()
    
    return SignalListResponse(
        items=signals,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


@router.get("/active", response_model=List[SignalResponse])
async def get_active_signals(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get active/open signals only - for dashboard display"""
    signals = db.query(Signal)\
        .filter(Signal.status == 'open')\
        .order_by(desc(Signal.call_message_id))\
        .limit(limit)\
        .all()
    return signals


@router.get("/stats", response_model=SignalStats)
async def get_signal_stats(db: Session = Depends(get_db)):
    """
    Get signal statistics - OPTIMIZED SQL VERSION
    
    Win Rate Calculation (matching luxquant-analyze-app):
    1. Get final outcome for each signal from signal_updates (highest TP level achieved)
    2. Winners = tp1 + tp2 + tp3 + tp4
    3. Losers = sl
    4. Win Rate = Winners / (Winners + Losers) * 100
    """
    
    # Total signals
    total = db.query(func.count(Signal.signal_id)).scalar() or 0
    
    # OPTIMIZED: Use raw SQL to calculate outcomes efficiently
    # This query finds the highest update_type per signal_id
    outcome_query = text("""
        WITH normalized_updates AS (
            SELECT 
                signal_id,
                CASE 
                    WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 'tp4'
                    WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 'tp3'
                    WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 'tp2'
                    WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 'tp1'
                    WHEN LOWER(update_type) LIKE '%sl%' OR LOWER(update_type) LIKE '%stop%' THEN 'sl'
                    ELSE NULL
                END as outcome,
                CASE 
                    WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 4
                    WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 3
                    WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 2
                    WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 1
                    WHEN LOWER(update_type) LIKE '%sl%' OR LOWER(update_type) LIKE '%stop%' THEN 0
                    ELSE -1
                END as rank
            FROM signal_updates
            WHERE update_type IS NOT NULL
        ),
        final_outcomes AS (
            SELECT 
                signal_id,
                outcome,
                rank,
                ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY rank DESC) as rn
            FROM normalized_updates
            WHERE outcome IS NOT NULL
        )
        SELECT 
            outcome,
            COUNT(*) as count
        FROM final_outcomes
        WHERE rn = 1
        GROUP BY outcome
    """)
    
    result = db.execute(outcome_query)
    outcome_counts = {row[0]: row[1] for row in result}
    
    # Extract counts
    tp1_count = outcome_counts.get('tp1', 0)
    tp2_count = outcome_counts.get('tp2', 0)
    tp3_count = outcome_counts.get('tp3', 0)
    tp4_count = outcome_counts.get('tp4', 0)
    sl_count = outcome_counts.get('sl', 0)
    
    # Calculate totals
    total_winners = tp1_count + tp2_count + tp3_count + tp4_count
    total_losers = sl_count
    total_closed = total_winners + total_losers
    
    # Open signals = total - closed
    open_count = total - total_closed
    
    # Win Rate
    win_rate = (total_winners / total_closed * 100) if total_closed > 0 else 0
    
    return SignalStats(
        total_signals=total,
        open_signals=open_count,
        tp1_signals=tp1_count,
        tp2_signals=tp2_count,
        tp3_signals=tp3_count,
        closed_win=tp4_count,
        closed_loss=total_losers,
        win_rate=round(win_rate, 2)
    )


@router.get("/{signal_id}", response_model=SignalResponse)
async def get_signal(signal_id: str, db: Session = Depends(get_db)):
    """Get single signal by ID"""
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return signal