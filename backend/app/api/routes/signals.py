"""
LuxQuant Terminal - Signals API Routes
OPTIMIZED VERSION - Uses pure SQL aggregation for performance
Includes: Win Rate Trend, Risk:Reward Ratio
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


class WinRateTrendItem(BaseModel):
    period: str
    win_rate: float
    total_closed: int
    winners: int
    losers: int


class RiskRewardItem(BaseModel):
    level: str
    avg_rr: float
    count: int


class AnalyzeResponse(BaseModel):
    stats: AnalyzeStats
    pair_metrics: List[PairMetrics]
    win_rate_trend: List[WinRateTrendItem]
    risk_reward: List[RiskRewardItem]
    avg_risk_reward: float
    time_range: str


# ============================================
# OPTIMIZED Analyze Endpoint - Pure SQL
# ============================================

@router.get("/analyze", response_model=AnalyzeResponse)
async def get_analyze_data(
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    trend_mode: str = Query("weekly", description="Trend grouping: daily, weekly"),
    db: Session = Depends(get_db)
):
    """
    OPTIMIZED: Get comprehensive analysis using pure SQL aggregation
    Includes: win_rate_trend (daily/weekly), risk_reward ratio per TP level
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
    
    # ===== QUERY 1: Pair metrics (existing) =====
    analyze_query = text(f"""
        WITH 
        signal_outcomes AS (
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
                        ELSE NULL
                    END as outcome,
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
    
    # Build pair metrics
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

    # ===== QUERY 2: Win Rate Trend (daily or weekly) =====
    if trend_mode == 'daily':
        date_trunc = "DATE(s.created_at)"
    else:
        # Weekly: truncate to Monday of each week
        date_trunc = "DATE(DATE_TRUNC('week', s.created_at::timestamp))"
    
    trend_query = text(f"""
        WITH 
        signal_outcomes AS (
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
                        ELSE NULL
                    END as outcome,
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
        )
        SELECT 
            {date_trunc} as period,
            COUNT(so.outcome) as total_closed,
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as winners,
            SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as losers,
            CASE 
                WHEN COUNT(so.outcome) > 0 
                THEN ROUND(
                    SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric 
                    / COUNT(so.outcome) * 100, 2
                )
                ELSE 0 
            END as win_rate
        FROM signals s
        INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE s.created_at IS NOT NULL {date_filter}
        GROUP BY {date_trunc}
        HAVING COUNT(so.outcome) >= 3
        ORDER BY period ASC
    """)
    
    trend_result = db.execute(trend_query)
    trend_rows = trend_result.fetchall()
    
    win_rate_trend = []
    for row in trend_rows:
        period_str = str(row[0]) if row[0] else ""
        win_rate_trend.append(WinRateTrendItem(
            period=period_str,
            total_closed=int(row[1]),
            winners=int(row[2]),
            losers=int(row[3]),
            win_rate=float(row[4]) if row[4] else 0
        ))

    # ===== QUERY 3: Risk:Reward Ratio per TP level =====
    rr_query = text(f"""
        WITH 
        signal_outcomes AS (
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
                        ELSE NULL
                    END as outcome,
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
        )
        SELECT 
            so.outcome as level,
            COUNT(*) as cnt,
            AVG(
                CASE 
                    WHEN s.entry > 0 AND s.stop1 > 0 AND ABS(s.entry - s.stop1) > 0 THEN
                        CASE so.outcome
                            WHEN 'tp1' THEN ABS(s.target1 - s.entry) / ABS(s.entry - s.stop1)
                            WHEN 'tp2' THEN ABS(s.target2 - s.entry) / ABS(s.entry - s.stop1)
                            WHEN 'tp3' THEN ABS(s.target3 - s.entry) / ABS(s.entry - s.stop1)
                            WHEN 'tp4' THEN ABS(s.target4 - s.entry) / ABS(s.entry - s.stop1)
                            WHEN 'sl' THEN -1.0
                            ELSE 0
                        END
                    ELSE NULL
                END
            ) as avg_rr
        FROM signals s
        INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE s.entry > 0 AND s.stop1 > 0 
            AND s.target1 > 0 {date_filter}
        GROUP BY so.outcome
        ORDER BY 
            CASE so.outcome
                WHEN 'tp1' THEN 1
                WHEN 'tp2' THEN 2
                WHEN 'tp3' THEN 3
                WHEN 'tp4' THEN 4
                WHEN 'sl' THEN 5
            END
    """)
    
    rr_result = db.execute(rr_query)
    rr_rows = rr_result.fetchall()
    
    risk_reward = []
    total_rr_weighted = 0
    total_rr_count = 0
    
    for row in rr_rows:
        level = str(row[0])
        count = int(row[1])
        avg_rr = float(row[2]) if row[2] else 0
        
        risk_reward.append(RiskRewardItem(
            level=level.upper(),
            avg_rr=round(avg_rr, 2),
            count=count
        ))
        
        if level != 'sl':
            total_rr_weighted += avg_rr * count
            total_rr_count += count
    
    avg_risk_reward = round(total_rr_weighted / total_rr_count, 2) if total_rr_count > 0 else 0

    # ===== BUILD RESPONSE =====
    if not rows:
        return AnalyzeResponse(
            stats=AnalyzeStats(
                total_signals=0, closed_trades=0, open_signals=0,
                win_rate=0, total_winners=0,
                tp1_count=0, tp2_count=0, tp3_count=0, tp4_count=0, sl_count=0,
                active_pairs=0
            ),
            pair_metrics=[],
            win_rate_trend=[],
            risk_reward=[],
            avg_risk_reward=0,
            time_range=time_range
        )
    
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
        win_rate_trend=win_rate_trend,
        risk_reward=risk_reward,
        avg_risk_reward=avg_risk_reward,
        time_range=time_range
    )


# ============================================
# Helper: CTE for deriving status from signal_updates
# ============================================
SIGNAL_OUTCOMES_CTE = """
    signal_outcomes AS (
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
                    ELSE NULL
                END as outcome,
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
    )
"""

def outcome_to_status(outcome: str) -> str:
    """Convert signal_updates outcome to signals.status value"""
    mapping = {
        'tp4': 'closed_win',
        'tp3': 'tp3',
        'tp2': 'tp2',
        'tp1': 'tp1',
        'sl': 'closed_loss',
    }
    return mapping.get(outcome, 'open')

def status_to_filter(status_input: str) -> str:
    """Map user filter input to outcome values for WHERE clause"""
    mapping = {
        'open': 'open',
        'tp1': 'tp1',
        'tp2': 'tp2',
        'tp3': 'tp3',
        'closed_win': 'tp4',
        'tp4': 'tp4',
        'closed_loss': 'sl',
        'sl': 'sl',
    }
    return mapping.get(status_input.lower(), status_input.lower())


# ============================================
# GET /signals/ — Derived status from signal_updates
# ============================================

@router.get("/")
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
    """Get paginated signals with DERIVED status from signal_updates"""
    
    # Build WHERE conditions
    conditions = []
    params = {}
    
    if pair:
        conditions.append("UPPER(s.pair) LIKE :pair")
        params["pair"] = f"%{pair.upper()}%"
    
    if risk_level:
        risk_lower = risk_level.lower()
        if risk_lower in ['med', 'medium']:
            conditions.append("LOWER(s.risk_level) LIKE 'med%'")
        else:
            conditions.append("LOWER(s.risk_level) LIKE :risk")
            params["risk"] = f"{risk_lower}%"
    
    if date_from:
        conditions.append("s.created_at >= :date_from")
        params["date_from"] = date_from
    
    if date_to:
        conditions.append("s.created_at <= :date_to")
        params["date_to"] = f"{date_to} 23:59:59"
    
    # Status filter based on derived outcome
    if status:
        mapped = status_to_filter(status)
        if mapped == 'open':
            conditions.append("so.outcome IS NULL")
        else:
            conditions.append("so.outcome = :status_filter")
            params["status_filter"] = mapped
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # Sort mapping
    valid_sorts = {
        'created_at': 's.call_message_id',
        'pair': 's.pair',
        'entry': 's.entry',
        'call_message_id': 's.call_message_id',
        'status': "COALESCE(so.outcome, 'open')",
        'risk_level': """CASE 
            WHEN LOWER(s.risk_level) LIKE 'low%' THEN 1
            WHEN LOWER(s.risk_level) LIKE 'med%' THEN 2
            WHEN LOWER(s.risk_level) LIKE 'high%' THEN 3
            ELSE 4 END""",
    }
    sort_col = valid_sorts.get(sort_by, 's.call_message_id')
    sort_dir = 'DESC' if sort_order == 'desc' else 'ASC'
    
    # Count query
    count_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT COUNT(*) FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE {where_clause}
    """)
    total = db.execute(count_query, params).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    
    offset = (page - 1) * page_size
    
    # Data query — derive status from signal_updates
    data_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT 
            s.signal_id, s.channel_id, s.call_message_id, s.message_link,
            s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
            s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den,
            s.created_at,
            CASE 
                WHEN so.outcome = 'tp4' THEN 'closed_win'
                WHEN so.outcome = 'sl' THEN 'closed_loss'
                WHEN so.outcome IS NOT NULL THEN so.outcome
                ELSE 'open'
            END as derived_status
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE {where_clause}
        ORDER BY {sort_col} {sort_dir}
        LIMIT :limit OFFSET :offset
    """)
    params["limit"] = page_size
    params["offset"] = offset
    
    rows = db.execute(data_query, params).fetchall()
    
    items = []
    for r in rows:
        items.append({
            "signal_id": r[0],
            "channel_id": r[1],
            "call_message_id": r[2],
            "message_link": r[3],
            "pair": r[4],
            "entry": r[5],
            "target1": r[6],
            "target2": r[7],
            "target3": r[8],
            "target4": r[9],
            "stop1": r[10],
            "stop2": r[11],
            "risk_level": r[12],
            "volume_rank_num": r[13],
            "volume_rank_den": r[14],
            "created_at": r[15],
            "status": r[16],  # derived from signal_updates!
        })
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


# ============================================
# GET /signals/active — Truly open (no updates)
# ============================================

@router.get("/active")
async def get_active_signals(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get truly active/open signals — those with NO entries in signal_updates"""
    
    query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT 
            s.signal_id, s.channel_id, s.call_message_id, s.message_link,
            s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
            s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den,
            s.created_at
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE so.outcome IS NULL
        ORDER BY s.call_message_id DESC
        LIMIT :limit
    """)
    
    rows = db.execute(query, {"limit": limit}).fetchall()
    
    return [
        {
            "signal_id": r[0], "channel_id": r[1], "call_message_id": r[2],
            "message_link": r[3], "pair": r[4], "entry": r[5],
            "target1": r[6], "target2": r[7], "target3": r[8], "target4": r[9],
            "stop1": r[10], "stop2": r[11], "risk_level": r[12],
            "volume_rank_num": r[13], "volume_rank_den": r[14],
            "created_at": r[15], "status": "open",
        }
        for r in rows
    ]


# ============================================
# GET /signals/stats — Derived from signal_updates
# ============================================

@router.get("/stats", response_model=SignalStats)
async def get_signal_stats(db: Session = Depends(get_db)):
    """Get signal statistics derived from signal_updates"""
    
    stats_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT 
            COUNT(*) as total_signals,
            COUNT(CASE WHEN so.outcome IS NULL THEN 1 END) as open_signals,
            SUM(CASE WHEN so.outcome = 'tp1' THEN 1 ELSE 0 END) as tp1_signals,
            SUM(CASE WHEN so.outcome = 'tp2' THEN 1 ELSE 0 END) as tp2_signals,
            SUM(CASE WHEN so.outcome = 'tp3' THEN 1 ELSE 0 END) as tp3_signals,
            SUM(CASE WHEN so.outcome = 'tp4' THEN 1 ELSE 0 END) as closed_win,
            SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as closed_loss
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
    """)
    
    row = db.execute(stats_query).fetchone()
    
    if not row:
        return SignalStats(
            total_signals=0, open_signals=0,
            tp1_signals=0, tp2_signals=0, tp3_signals=0,
            closed_win=0, closed_loss=0, win_rate=0
        )
    
    total = int(row[0] or 0)
    open_s = int(row[1] or 0)
    tp1 = int(row[2] or 0)
    tp2 = int(row[3] or 0)
    tp3 = int(row[4] or 0)
    closed_win = int(row[5] or 0)
    closed_loss = int(row[6] or 0)
    
    total_closed = tp1 + tp2 + tp3 + closed_win + closed_loss
    total_winners = tp1 + tp2 + tp3 + closed_win
    win_rate = (total_winners / total_closed * 100) if total_closed > 0 else 0
    
    return SignalStats(
        total_signals=total,
        open_signals=open_s,
        tp1_signals=tp1,
        tp2_signals=tp2,
        tp3_signals=tp3,
        closed_win=closed_win,
        closed_loss=closed_loss,
        win_rate=round(win_rate, 2)
    )


# ============================================
# POST /signals/sync-status — Sync status column from signal_updates
# ============================================

@router.post("/sync-status")
async def sync_signal_status(db: Session = Depends(get_db)):
    """
    Sync signals.status column based on signal_updates.
    Call this after importing new updates to keep the status column accurate.
    """
    
    sync_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        UPDATE signals s
        SET status = CASE 
            WHEN so.outcome = 'tp4' THEN 'closed_win'
            WHEN so.outcome = 'sl' THEN 'closed_loss'
            WHEN so.outcome IS NOT NULL THEN so.outcome
            ELSE 'open'
        END
        FROM signal_outcomes so
        WHERE s.signal_id = so.signal_id
        AND s.status != CASE 
            WHEN so.outcome = 'tp4' THEN 'closed_win'
            WHEN so.outcome = 'sl' THEN 'closed_loss'
            WHEN so.outcome IS NOT NULL THEN so.outcome
            ELSE 'open'
        END
    """)
    
    result = db.execute(sync_query)
    db.commit()
    
    return {
        "message": "Status sync completed",
        "updated": result.rowcount
    }


# ============================================
# GET /signals/{signal_id} — With derived status + update history
# ============================================

@router.get("/{signal_id}")
async def get_signal_detail(signal_id: str, db: Session = Depends(get_db)):
    """Get single signal with derived status and update history"""
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    # Get updates
    updates = db.query(SignalUpdate)\
        .filter(SignalUpdate.signal_id == signal_id)\
        .order_by(asc(SignalUpdate.update_at))\
        .all()
    
    # Derive status from updates (highest TP or SL)
    derived_status = "open"
    if updates:
        best_level = -1
        for u in updates:
            ut = (u.update_type or "").lower()
            if 'tp4' in ut or 'target 4' in ut:
                if 4 > best_level: best_level = 4; derived_status = "closed_win"
            elif 'tp3' in ut or 'target 3' in ut:
                if 3 > best_level: best_level = 3; derived_status = "tp3"
            elif 'tp2' in ut or 'target 2' in ut:
                if 2 > best_level: best_level = 2; derived_status = "tp2"
            elif 'tp1' in ut or 'target 1' in ut:
                if 1 > best_level: best_level = 1; derived_status = "tp1"
            elif 'sl' in ut or 'stop' in ut:
                if 0 > best_level: best_level = 0; derived_status = "closed_loss"
    
    signal_dict = {
        "signal_id": signal.signal_id,
        "channel_id": signal.channel_id,
        "call_message_id": signal.call_message_id,
        "message_link": signal.message_link,
        "pair": signal.pair,
        "entry": signal.entry,
        "target1": signal.target1,
        "target2": signal.target2,
        "target3": signal.target3,
        "target4": signal.target4,
        "stop1": signal.stop1,
        "stop2": signal.stop2,
        "risk_level": signal.risk_level,
        "volume_rank_num": signal.volume_rank_num,
        "volume_rank_den": signal.volume_rank_den,
        "status": derived_status,
        "created_at": signal.created_at,
        "updates": [
            {
                "update_type": u.update_type,
                "price": u.price,
                "update_at": u.update_at,
                "message_link": u.message_link
            }
            for u in updates
        ]
    }
    
    return signal_dict