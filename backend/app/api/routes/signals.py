from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional, List

from app.core.database import get_db
from app.models.signal import Signal
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
    """Get signal statistics"""
    
    total = db.query(Signal).count()
    open_count = db.query(Signal).filter(Signal.status == 'open').count()
    tp1_count = db.query(Signal).filter(Signal.status == 'tp1').count()
    tp2_count = db.query(Signal).filter(Signal.status == 'tp2').count()
    tp3_count = db.query(Signal).filter(Signal.status == 'tp3').count()
    closed_win = db.query(Signal).filter(Signal.status == 'closed_win').count()
    closed_loss = db.query(Signal).filter(Signal.status == 'closed_loss').count()
    
    # Win rate = closed_win / (closed_win + closed_loss)
    total_closed = closed_win + closed_loss
    win_rate = (closed_win / total_closed * 100) if total_closed > 0 else 0
    
    return SignalStats(
        total_signals=total,
        open_signals=open_count,
        tp1_signals=tp1_count,
        tp2_signals=tp2_count,
        tp3_signals=tp3_count,
        closed_win=closed_win,
        closed_loss=closed_loss,
        win_rate=round(win_rate, 2)
    )

@router.get("/{signal_id}", response_model=SignalResponse)
async def get_signal(signal_id: str, db: Session = Depends(get_db)):
    """Get single signal by ID"""
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return signal
