"""
LuxQuant Terminal - Signals API Routes
OPTIMIZED VERSION - Uses pure SQL aggregation for performance
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, text
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel

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


# ============================================
# Pydantic Models for Analyze
# ============================================

class PairMetrics(BaseModel):
    pair: str
    total_signals: int
    closed_trades: int
    open_signals: int
    win_rate: float
    tp1_count: int
    tp2_count: int
    tp3_count: int
    tp4_count: int
    sl_count: int
    performance_score: float


class AnalyzeStats(BaseModel):
    total_signals: int
    closed_trades: int
    open_signals: int
    win_rate: float
    total_winners: int
    tp1_count: int
    tp2_count: int
    tp3_count: int
    tp4_count: int
    sl_count: int
    active_pairs: int


class AnalyzeResponse(BaseModel):
    stats: AnalyzeStats
    pair_metrics: List[PairMetrics]
    time_range: str


# ============================================
# OPTIMIZED Analyze Endpoint - Pure SQL
# ============================================

@router.get("/analyze", response_model=AnalyzeResponse)
async def get_analyze_data(
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    db: Session = Depends(get_db)
):
    """
    OPTIMIZED: Get comprehensive analysis using pure SQL aggregation
    """
    
    # Build date filter
    date_filter = ""
    if time_range != 'all':
        now = datetime.utcnow()
        
        if time_range == 'ytd':
            start_date = datetime(now.year, 1, 1)
        elif time_range == 'mtd':
            start_date = datetime(now.year, now.month, 1)
        elif time_range == '30d':
            start_date = now - timedelta(days=30)
        elif time_range == '7d':
            start_date = now - timedelta(days=7)
        else:
            start_date = None
        
        if start_date:
            date_filter = f"AND s.created_at >= '{start_date.strftime('%Y-%m-%d')}'"
    
    # ===== SINGLE OPTIMIZED QUERY FOR EVERYTHING =====
    analyze_query = text(f"""
        WITH 
        -- Step 1: Get final outcome per signal (highest TP level)
        signal_outcomes AS (
            SELECT 
                signal_id,
                outcome
            FROM (
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
                    END as rank,
                    ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY 
                        CASE 
                            WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 4
                            WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 3
                            WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 2
                            WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 1
                            WHEN LOWER(update_type) LIKE '%sl%' OR LOWER(update_type) LIKE '%stop%' THEN 0
                            ELSE -1
                        END DESC
                    ) as rn
                FROM signal_updates
                WHERE update_type IS NOT NULL
            ) ranked
            WHERE rn = 1 AND outcome IS NOT NULL
        ),
        
        -- Step 2: Join signals with outcomes and aggregate by pair
        pair_stats AS (
            SELECT 
                s.pair,
                COUNT(*) as total_signals,
                COUNT(so.outcome) as closed_trades,
                COUNT(*) - COUNT(so.outcome) as open_signals,
                SUM(CASE WHEN so.outcome = 'tp1' THEN 1 ELSE 0 END) as tp1_count,
                SUM(CASE WHEN so.outcome = 'tp2' THEN 1 ELSE 0 END) as tp2_count,
                SUM(CASE WHEN so.outcome = 'tp3' THEN 1 ELSE 0 END) as tp3_count,
                SUM(CASE WHEN so.outcome = 'tp4' THEN 1 ELSE 0 END) as tp4_count,
                SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as sl_count
            FROM signals s
            LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE s.pair IS NOT NULL {date_filter}
            GROUP BY s.pair
        )
        
        SELECT 
            pair,
            total_signals,
            closed_trades,
            open_signals,
            tp1_count,
            tp2_count,
            tp3_count,
            tp4_count,
            sl_count,
            CASE 
                WHEN closed_trades > 0 
                THEN ROUND((tp1_count + tp2_count + tp3_count + tp4_count)::numeric / closed_trades * 100, 2)
                ELSE 0 
            END as win_rate,
            -- Performance score: 40% WR + 30% volume + 30% TP weighted
            ROUND(
                CASE WHEN closed_trades > 0 
                    THEN (tp1_count + tp2_count + tp3_count + tp4_count)::numeric / closed_trades * 100 * 0.4
                    ELSE 0 
                END +
                LEAST(total_signals::numeric / 20 * 100, 100) * 0.3 +
                CASE WHEN closed_trades > 0 
                    THEN ((tp4_count * 4 + tp3_count * 3 + tp2_count * 2 + tp1_count * 1)::numeric / closed_trades * 25) * 0.3
                    ELSE 0 
                END
            , 2) as performance_score
        FROM pair_stats
        ORDER BY win_rate DESC, closed_trades DESC
    """)
    
    result = db.execute(analyze_query)
    rows = result.fetchall()
    
    if not rows:
        return AnalyzeResponse(
            stats=AnalyzeStats(
                total_signals=0, closed_trades=0, open_signals=0,
                win_rate=0, total_winners=0,
                tp1_count=0, tp2_count=0, tp3_count=0, tp4_count=0, sl_count=0,
                active_pairs=0
            ),
            pair_metrics=[],
            time_range=time_range
        )
    
    # Build pair metrics from SQL results
    pair_metrics = []
    total_signals = 0
    total_closed = 0
    total_open = 0
    total_tp1 = 0
    total_tp2 = 0
    total_tp3 = 0
    total_tp4 = 0
    total_sl = 0
    
    for row in rows:
        pair_metrics.append(PairMetrics(
            pair=row[0],
            total_signals=row[1],
            closed_trades=row[2],
            open_signals=row[3],
            tp1_count=row[4],
            tp2_count=row[5],
            tp3_count=row[6],
            tp4_count=row[7],
            sl_count=row[8],
            win_rate=float(row[9]) if row[9] else 0,
            performance_score=float(row[10]) if row[10] else 0
        ))
        
        # Aggregate totals
        total_signals += row[1]
        total_closed += row[2]
        total_open += row[3]
        total_tp1 += row[4]
        total_tp2 += row[5]
        total_tp3 += row[6]
        total_tp4 += row[7]
        total_sl += row[8]
    
    total_winners = total_tp1 + total_tp2 + total_tp3 + total_tp4
    overall_win_rate = (total_winners / total_closed * 100) if total_closed > 0 else 0
    
    return AnalyzeResponse(
        stats=AnalyzeStats(
            total_signals=total_signals,
            closed_trades=total_closed,
            open_signals=total_open,
            win_rate=round(overall_win_rate, 2),
            total_winners=total_winners,
            tp1_count=total_tp1,
            tp2_count=total_tp2,
            tp3_count=total_tp3,
            tp4_count=total_tp4,
            sl_count=total_sl,
            active_pairs=len(pair_metrics)
        ),
        pair_metrics=pair_metrics,
        time_range=time_range
    )


# ============================================
# Existing Endpoints
# ============================================

@router.get("/", response_model=SignalListResponse)
async def get_signals(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
    status: Optional[str] = None,
    pair: Optional[str] = None,
    risk_level: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db)
):
    """Get paginated list of signals with filtering and sorting"""
    query = db.query(Signal)
    
    # Filters
    if status:
        status_lower = status.lower()
        if status_lower == 'sl':
            query = query.filter(Signal.status == 'closed_loss')
        elif status_lower == 'closed_win':
            query = query.filter(Signal.status == 'closed_win')
        elif status_lower == 'closed_loss':
            query = query.filter(Signal.status == 'closed_loss')
        else:
            query = query.filter(Signal.status == status_lower)
    
    if pair:
        query = query.filter(Signal.pair.ilike(f"%{pair}%"))
    
    if risk_level:
        risk_lower = risk_level.lower()
        if risk_lower in ['med', 'medium']:
            query = query.filter(Signal.risk_level.ilike('med%'))
        else:
            query = query.filter(Signal.risk_level.ilike(f"{risk_lower}%"))
    
    if date_from:
        query = query.filter(Signal.created_at >= date_from)
    
    if date_to:
        query = query.filter(Signal.created_at <= f"{date_to} 23:59:59")
    
    # Sorting
    valid_sort_fields = ['created_at', 'pair', 'entry', 'risk_level', 'status', 'call_message_id']
    if sort_by not in valid_sort_fields:
        sort_by = 'created_at'
    
    if sort_by == 'risk_level':
        risk_order = func.case(
            (Signal.risk_level.ilike('low%'), 1),
            (Signal.risk_level.ilike('med%'), 2),
            (Signal.risk_level.ilike('high%'), 3),
            else_=4
        )
        query = query.order_by(desc(risk_order) if sort_order == 'desc' else asc(risk_order))
    elif sort_by == 'created_at':
        query = query.order_by(desc(Signal.call_message_id) if sort_order == 'desc' else asc(Signal.call_message_id))
    else:
        sort_column = getattr(Signal, sort_by, Signal.call_message_id)
        query = query.order_by(desc(sort_column) if sort_order == 'desc' else asc(sort_column))
    
    # Pagination
    total = query.count()
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    
    offset = (page - 1) * page_size
    signals = query.offset(offset).limit(page_size).all()
    
    return SignalListResponse(
        items=signals,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/active", response_model=List[SignalResponse])
async def get_active_signals(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get active/open signals only"""
    signals = db.query(Signal)\
        .filter(Signal.status == 'open')\
        .order_by(desc(Signal.call_message_id))\
        .limit(limit)\
        .all()
    return signals


@router.get("/stats", response_model=SignalStats)
async def get_signal_stats(db: Session = Depends(get_db)):
    """Get signal statistics - OPTIMIZED"""
    
    stats_query = text("""
        WITH signal_outcomes AS (
            SELECT signal_id, outcome
            FROM (
                SELECT 
                    signal_id,
                    CASE 
                        WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 'tp4'
                        WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 'tp3'
                        WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 'tp2'
                        WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 'tp1'
                        WHEN LOWER(update_type) LIKE '%sl%' OR LOWER(update_type) LIKE '%stop%' THEN 'sl'
                    END as outcome,
                    ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY 
                        CASE 
                            WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 4
                            WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 3
                            WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 2
                            WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 1
                            ELSE 0
                        END DESC
                    ) as rn
                FROM signal_updates WHERE update_type IS NOT NULL
            ) t WHERE rn = 1 AND outcome IS NOT NULL
        )
        SELECT 
            (SELECT COUNT(*) FROM signals) as total,
            COALESCE(SUM(CASE WHEN outcome = 'tp1' THEN 1 ELSE 0 END), 0) as tp1,
            COALESCE(SUM(CASE WHEN outcome = 'tp2' THEN 1 ELSE 0 END), 0) as tp2,
            COALESCE(SUM(CASE WHEN outcome = 'tp3' THEN 1 ELSE 0 END), 0) as tp3,
            COALESCE(SUM(CASE WHEN outcome = 'tp4' THEN 1 ELSE 0 END), 0) as tp4,
            COALESCE(SUM(CASE WHEN outcome = 'sl' THEN 1 ELSE 0 END), 0) as sl
        FROM signal_outcomes
    """)
    
    result = db.execute(stats_query).fetchone()
    
    total = result[0] or 0
    tp1 = result[1] or 0
    tp2 = result[2] or 0
    tp3 = result[3] or 0
    tp4 = result[4] or 0
    sl = result[5] or 0
    
    total_winners = tp1 + tp2 + tp3 + tp4
    total_closed = total_winners + sl
    open_count = total - total_closed
    win_rate = (total_winners / total_closed * 100) if total_closed > 0 else 0
    
    return SignalStats(
        total_signals=total,
        open_signals=open_count,
        tp1_signals=tp1,
        tp2_signals=tp2,
        tp3_signals=tp3,
        closed_win=tp4,
        closed_loss=sl,
        win_rate=round(win_rate, 2)
    )


@router.get("/pair/{pair}", response_model=List[SignalResponse])
async def get_signals_by_pair(
    pair: str,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """Get signals for a specific pair"""
    signals = db.query(Signal)\
        .filter(Signal.pair.ilike(f"%{pair}%"))\
        .order_by(desc(Signal.call_message_id))\
        .limit(limit)\
        .all()
    return signals


# Tambahkan endpoint ini ke backend/app/api/routes/signals.py
# Letakkan sebelum endpoint @router.get("/{signal_id}")

# ============ Signal Detail with Updates Timeline ============

class SignalUpdateItem(BaseModel):
    update_type: str
    price: Optional[float] = None
    update_at: Optional[str] = None


class SignalDetailResponse(BaseModel):
    signal_id: str
    channel_id: Optional[int] = None
    call_message_id: Optional[int] = None
    message_link: Optional[str] = None
    pair: Optional[str] = None
    entry: Optional[float] = None
    target1: Optional[float] = None
    target2: Optional[float] = None
    target3: Optional[float] = None
    target4: Optional[float] = None
    stop1: Optional[float] = None
    stop2: Optional[float] = None
    risk_level: Optional[str] = None
    volume_rank_num: Optional[int] = None
    volume_rank_den: Optional[int] = None
    status: Optional[str] = None
    created_at: Optional[str] = None
    # Updates timeline
    updates: List[SignalUpdateItem] = []


@router.get("/detail/{signal_id}", response_model=SignalDetailResponse)
async def get_signal_detail(signal_id: str, db: Session = Depends(get_db)):
    """
    Get signal detail with updates timeline (TP/SL reached times)
    """
    # Get signal
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    # Get updates for this signal
    updates_result = db.execute(
        text("""
            SELECT 
                update_type,
                price,
                update_at
            FROM signal_updates
            WHERE signal_id = :signal_id
            ORDER BY update_at ASC
        """),
        {"signal_id": signal_id}
    )
    
    updates = []
    for row in updates_result.fetchall():
        # Normalize update_type to tp1, tp2, tp3, tp4, sl
        update_type = row[0].lower() if row[0] else ''
        normalized_type = None
        
        if 'tp4' in update_type or 'target 4' in update_type:
            normalized_type = 'tp4'
        elif 'tp3' in update_type or 'target 3' in update_type:
            normalized_type = 'tp3'
        elif 'tp2' in update_type or 'target 2' in update_type:
            normalized_type = 'tp2'
        elif 'tp1' in update_type or 'target 1' in update_type:
            normalized_type = 'tp1'
        elif 'sl' in update_type or 'stop' in update_type:
            normalized_type = 'sl'
        
        if normalized_type:
            updates.append(SignalUpdateItem(
                update_type=normalized_type,
                price=row[1],
                update_at=row[2]
            ))
    
    return SignalDetailResponse(
        signal_id=signal.signal_id,
        channel_id=signal.channel_id,
        call_message_id=signal.call_message_id,
        message_link=signal.message_link,
        pair=signal.pair,
        entry=signal.entry,
        target1=signal.target1,
        target2=signal.target2,
        target3=signal.target3,
        target4=signal.target4,
        stop1=signal.stop1,
        stop2=signal.stop2,
        risk_level=signal.risk_level,
        volume_rank_num=signal.volume_rank_num,
        volume_rank_den=signal.volume_rank_den,
        status=signal.status,
        created_at=signal.created_at,
        updates=updates
    )


@router.get("/{signal_id}", response_model=SignalResponse)
async def get_signal(signal_id: str, db: Session = Depends(get_db)):
    """Get single signal by ID"""
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return signal