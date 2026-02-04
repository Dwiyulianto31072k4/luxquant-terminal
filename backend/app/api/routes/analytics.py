"""
LuxQuant Terminal - Analytics API Routes
Endpoints untuk Performance Analytics page
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter()


# ============================================
# Pydantic Models
# ============================================

# Daily Win Rate
class DailyWinRateItem(BaseModel):
    date: str
    total_signals: int
    wins: int
    losses: int
    win_rate: float
    

class DailyWinRateResponse(BaseModel):
    data: List[DailyWinRateItem]
    summary: dict
    time_range: str


# Risk Reward
class RiskRewardItem(BaseModel):
    tp_level: str
    avg_reward_pct: float
    avg_risk_pct: float
    risk_reward_ratio: float
    total_hits: int


class RiskRewardResponse(BaseModel):
    items: List[RiskRewardItem]
    overall_avg_rr: float
    time_range: str


# Coin Detail
class CoinSignalItem(BaseModel):
    signal_id: str
    entry: Optional[float] = None
    target1: Optional[float] = None
    target2: Optional[float] = None
    target3: Optional[float] = None
    target4: Optional[float] = None
    stop1: Optional[float] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    created_at: Optional[str] = None


class CoinDetailResponse(BaseModel):
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
    avg_risk_reward: float
    first_signal: Optional[str] = None
    last_signal: Optional[str] = None
    signals: List[CoinSignalItem]
    daily_performance: List[DailyWinRateItem]


# ============================================
# Helper: Build date filter
# ============================================

def get_date_filter(time_range: str) -> tuple:
    """Return (start_date, date_filter_sql)"""
    if time_range == 'all':
        return None, ""
    
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
        return None, ""
    
    return start_date, f"AND s.created_at >= '{start_date.strftime('%Y-%m-%d')}'"


# ============================================
# 1. Daily Win Rate Trend
# ============================================

@router.get("/daily-winrate", response_model=DailyWinRateResponse)
async def get_daily_winrate(
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    period: str = Query("daily", description="Aggregation period: daily, weekly"),
    db: Session = Depends(get_db)
):
    """
    Get daily/weekly win rate trend for chart visualization
    """
    start_date, date_filter = get_date_filter(time_range)
    
    # Date truncation based on period
    if period == "weekly":
        date_trunc = "DATE_TRUNC('week', s.created_at::timestamp)"
    else:
        date_trunc = "DATE(s.created_at)"
    
    query = text(f"""
        WITH signal_outcomes AS (
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
            {date_trunc} as date,
            COUNT(*) as total_signals,
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as losses
        FROM signals s
        INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE 1=1 {date_filter}
        GROUP BY {date_trunc}
        ORDER BY date ASC
    """)
    
    result = db.execute(query)
    rows = result.fetchall()
    
    data = []
    total_wins = 0
    total_losses = 0
    
    for row in rows:
        date_str = row[0].strftime('%Y-%m-%d') if hasattr(row[0], 'strftime') else str(row[0])
        total = row[1] or 0
        wins = row[2] or 0
        losses = row[3] or 0
        win_rate = (wins / total * 100) if total > 0 else 0
        
        data.append(DailyWinRateItem(
            date=date_str,
            total_signals=total,
            wins=wins,
            losses=losses,
            win_rate=round(win_rate, 2)
        ))
        
        total_wins += wins
        total_losses += losses
    
    total_closed = total_wins + total_losses
    overall_wr = (total_wins / total_closed * 100) if total_closed > 0 else 0
    
    return DailyWinRateResponse(
        data=data,
        summary={
            "total_periods": len(data),
            "total_wins": total_wins,
            "total_losses": total_losses,
            "overall_win_rate": round(overall_wr, 2),
            "avg_daily_signals": round(total_closed / len(data), 1) if data else 0
        },
        time_range=time_range
    )


# ============================================
# 2. Risk Reward Ratio
# ============================================

@router.get("/risk-reward", response_model=RiskRewardResponse)
async def get_risk_reward(
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    db: Session = Depends(get_db)
):
    """
    Calculate average Risk:Reward ratio per TP level
    R:R = (TP - Entry) / (Entry - SL)
    """
    start_date, date_filter = get_date_filter(time_range)
    
    query = text(f"""
        WITH signal_outcomes AS (
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
        rr_calc AS (
            SELECT 
                so.outcome,
                s.entry,
                s.target1,
                s.target2,
                s.target3,
                s.target4,
                s.stop1,
                -- Calculate reward % for each TP level
                CASE WHEN s.entry > 0 AND s.target1 > 0 THEN ((s.target1 - s.entry) / s.entry * 100) ELSE NULL END as tp1_reward_pct,
                CASE WHEN s.entry > 0 AND s.target2 > 0 THEN ((s.target2 - s.entry) / s.entry * 100) ELSE NULL END as tp2_reward_pct,
                CASE WHEN s.entry > 0 AND s.target3 > 0 THEN ((s.target3 - s.entry) / s.entry * 100) ELSE NULL END as tp3_reward_pct,
                CASE WHEN s.entry > 0 AND s.target4 > 0 THEN ((s.target4 - s.entry) / s.entry * 100) ELSE NULL END as tp4_reward_pct,
                -- Calculate risk % (distance to SL)
                CASE WHEN s.entry > 0 AND s.stop1 > 0 THEN ((s.entry - s.stop1) / s.entry * 100) ELSE NULL END as risk_pct
            FROM signals s
            INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE s.entry > 0 AND s.stop1 > 0 {date_filter}
        )
        SELECT 
            'TP1' as tp_level,
            AVG(tp1_reward_pct) as avg_reward_pct,
            AVG(risk_pct) as avg_risk_pct,
            AVG(tp1_reward_pct / NULLIF(risk_pct, 0)) as avg_rr,
            COUNT(CASE WHEN outcome = 'tp1' THEN 1 END) as hits
        FROM rr_calc
        WHERE tp1_reward_pct IS NOT NULL
        UNION ALL
        SELECT 
            'TP2' as tp_level,
            AVG(tp2_reward_pct) as avg_reward_pct,
            AVG(risk_pct) as avg_risk_pct,
            AVG(tp2_reward_pct / NULLIF(risk_pct, 0)) as avg_rr,
            COUNT(CASE WHEN outcome IN ('tp2','tp3','tp4') THEN 1 END) as hits
        FROM rr_calc
        WHERE tp2_reward_pct IS NOT NULL
        UNION ALL
        SELECT 
            'TP3' as tp_level,
            AVG(tp3_reward_pct) as avg_reward_pct,
            AVG(risk_pct) as avg_risk_pct,
            AVG(tp3_reward_pct / NULLIF(risk_pct, 0)) as avg_rr,
            COUNT(CASE WHEN outcome IN ('tp3','tp4') THEN 1 END) as hits
        FROM rr_calc
        WHERE tp3_reward_pct IS NOT NULL
        UNION ALL
        SELECT 
            'TP4' as tp_level,
            AVG(tp4_reward_pct) as avg_reward_pct,
            AVG(risk_pct) as avg_risk_pct,
            AVG(tp4_reward_pct / NULLIF(risk_pct, 0)) as avg_rr,
            COUNT(CASE WHEN outcome = 'tp4' THEN 1 END) as hits
        FROM rr_calc
        WHERE tp4_reward_pct IS NOT NULL
        ORDER BY tp_level
    """)
    
    result = db.execute(query)
    rows = result.fetchall()
    
    items = []
    total_rr = 0
    count = 0
    
    for row in rows:
        avg_rr = float(row[3]) if row[3] else 0
        items.append(RiskRewardItem(
            tp_level=row[0],
            avg_reward_pct=round(float(row[1]) if row[1] else 0, 2),
            avg_risk_pct=round(float(row[2]) if row[2] else 0, 2),
            risk_reward_ratio=round(avg_rr, 2),
            total_hits=row[4] or 0
        ))
        if avg_rr > 0:
            total_rr += avg_rr
            count += 1
    
    overall_avg = total_rr / count if count > 0 else 0
    
    return RiskRewardResponse(
        items=items,
        overall_avg_rr=round(overall_avg, 2),
        time_range=time_range
    )


# ============================================
# 3. Coin Detail (for Modal)
# ============================================

@router.get("/coin/{pair}", response_model=CoinDetailResponse)
async def get_coin_detail(
    pair: str,
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    limit: int = Query(50, ge=1, le=200, description="Max signals to return"),
    db: Session = Depends(get_db)
):
    """
    Get detailed analytics for a specific coin/pair
    Used for modal popup in Top Performers
    """
    pair_upper = pair.upper()
    start_date, date_filter = get_date_filter(time_range)
    
    # 1. Get summary stats
    stats_query = text(f"""
        WITH signal_outcomes AS (
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
            COUNT(*) as total_signals,
            COUNT(so.outcome) as closed_trades,
            COUNT(*) - COUNT(so.outcome) as open_signals,
            SUM(CASE WHEN so.outcome = 'tp1' THEN 1 ELSE 0 END) as tp1_count,
            SUM(CASE WHEN so.outcome = 'tp2' THEN 1 ELSE 0 END) as tp2_count,
            SUM(CASE WHEN so.outcome = 'tp3' THEN 1 ELSE 0 END) as tp3_count,
            SUM(CASE WHEN so.outcome = 'tp4' THEN 1 ELSE 0 END) as tp4_count,
            SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as sl_count,
            MIN(s.created_at) as first_signal,
            MAX(s.created_at) as last_signal
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE UPPER(s.pair) = :pair {date_filter}
    """)
    
    stats_result = db.execute(stats_query, {"pair": pair_upper}).fetchone()
    
    if not stats_result or stats_result[0] == 0:
        raise HTTPException(status_code=404, detail=f"No signals found for {pair_upper}")
    
    total_signals = stats_result[0]
    closed_trades = stats_result[1]
    open_signals = stats_result[2]
    tp1_count = stats_result[3] or 0
    tp2_count = stats_result[4] or 0
    tp3_count = stats_result[5] or 0
    tp4_count = stats_result[6] or 0
    sl_count = stats_result[7] or 0
    first_signal = stats_result[8]
    last_signal = stats_result[9]
    
    total_wins = tp1_count + tp2_count + tp3_count + tp4_count
    win_rate = (total_wins / closed_trades * 100) if closed_trades > 0 else 0
    
    # 2. Get average R:R for this coin
    rr_query = text(f"""
        SELECT 
            AVG(
                CASE 
                    WHEN s.entry > 0 AND s.stop1 > 0 AND s.target2 > 0 
                    THEN (s.target2 - s.entry) / NULLIF(s.entry - s.stop1, 0)
                    ELSE NULL 
                END
            ) as avg_rr
        FROM signals s
        WHERE UPPER(s.pair) = :pair AND s.entry > 0 AND s.stop1 > 0 {date_filter}
    """)
    
    rr_result = db.execute(rr_query, {"pair": pair_upper}).fetchone()
    avg_rr = float(rr_result[0]) if rr_result and rr_result[0] else 0
    
    # 3. Get signal history
    signals_query = text(f"""
        WITH signal_outcomes AS (
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
            s.signal_id,
            s.entry,
            s.target1,
            s.target2,
            s.target3,
            s.target4,
            s.stop1,
            s.status,
            so.outcome,
            s.created_at
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE UPPER(s.pair) = :pair {date_filter}
        ORDER BY s.created_at DESC
        LIMIT :limit
    """)
    
    signals_result = db.execute(signals_query, {"pair": pair_upper, "limit": limit})
    
    signals = []
    for row in signals_result.fetchall():
        signals.append(CoinSignalItem(
            signal_id=row[0],
            entry=row[1],
            target1=row[2],
            target2=row[3],
            target3=row[4],
            target4=row[5],
            stop1=row[6],
            status=row[7],
            outcome=row[8],
            created_at=row[9]
        ))
    
    # 4. Get daily performance for this coin
    daily_query = text(f"""
        WITH signal_outcomes AS (
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
            DATE(s.created_at) as date,
            COUNT(*) as total_signals,
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as losses
        FROM signals s
        INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE UPPER(s.pair) = :pair {date_filter}
        GROUP BY DATE(s.created_at)
        ORDER BY date DESC
        LIMIT 30
    """)
    
    daily_result = db.execute(daily_query, {"pair": pair_upper})
    
    daily_performance = []
    for row in daily_result.fetchall():
        date_str = row[0].strftime('%Y-%m-%d') if hasattr(row[0], 'strftime') else str(row[0])
        total = row[1] or 0
        wins = row[2] or 0
        losses = row[3] or 0
        wr = (wins / total * 100) if total > 0 else 0
        
        daily_performance.append(DailyWinRateItem(
            date=date_str,
            total_signals=total,
            wins=wins,
            losses=losses,
            win_rate=round(wr, 2)
        ))
    
    return CoinDetailResponse(
        pair=pair_upper,
        total_signals=total_signals,
        closed_trades=closed_trades,
        open_signals=open_signals,
        win_rate=round(win_rate, 2),
        tp1_count=tp1_count,
        tp2_count=tp2_count,
        tp3_count=tp3_count,
        tp4_count=tp4_count,
        sl_count=sl_count,
        avg_risk_reward=round(avg_rr, 2),
        first_signal=first_signal,
        last_signal=last_signal,
        signals=signals,
        daily_performance=daily_performance
    )