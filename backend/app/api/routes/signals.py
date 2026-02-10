"""
LuxQuant Terminal - Signals API Routes
OPTIMIZED VERSION - Uses pure SQL aggregation for performance
Includes: Win Rate Trend, Risk:Reward Ratio
UPDATED: 
- Fixed signal detail endpoint with dedup + market_cap/risk_reasons
- Date-aware cache keys so "Last 7 Days" requests hit pre-computed cache
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
from app.core.redis import (
    cache_get, cache_set, build_signals_page_key,
    is_redis_available
)

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
# Pydantic Models for Signal Detail
# ============================================

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
    market_cap: Optional[str] = None
    risk_reasons: Optional[str] = None
    updates: List[SignalUpdateItem] = []


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
    mapping = {
        'tp4': 'closed_win', 'tp3': 'tp3', 'tp2': 'tp2',
        'tp1': 'tp1', 'sl': 'closed_loss',
    }
    return mapping.get(outcome, 'open')

def status_to_filter(status_input: str) -> str:
    mapping = {
        'open': 'open', 'tp1': 'tp1', 'tp2': 'tp2', 'tp3': 'tp3',
        'closed_win': 'tp4', 'tp4': 'tp4', 'closed_loss': 'sl', 'sl': 'sl',
    }
    return mapping.get(status_input.lower(), status_input.lower())


# ============================================
# OPTIMIZED Analyze Endpoint
# ============================================

@router.get("/analyze", response_model=AnalyzeResponse)
async def get_analyze_data(
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    trend_mode: str = Query("weekly", description="Trend grouping: daily, weekly"),
    db: Session = Depends(get_db)
):
    # === TRY CACHE FIRST ===
    cache_key = f"lq:signals:analyze:{time_range}:{trend_mode}"
    cached = cache_get(cache_key)
    if cached:
        return AnalyzeResponse(**cached)
    
    # === FALLBACK TO DB (same as before) ===
    date_filter = ""
    if time_range != 'all':
        now = datetime.utcnow()
        if time_range == 'ytd': start_date = datetime(now.year, 1, 1)
        elif time_range == 'mtd': start_date = datetime(now.year, now.month, 1)
        elif time_range == '30d': start_date = now - timedelta(days=30)
        elif time_range == '7d': start_date = now - timedelta(days=7)
        else: start_date = None
        if start_date:
            date_filter = f"AND s.created_at >= '{start_date.strftime('%Y-%m-%d')}'"
    
    # Pair metrics query
    analyze_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE},
        pair_stats AS (
            SELECT 
                s.pair, COUNT(*) as total_signals, COUNT(so.outcome) as closed_trades,
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
        SELECT pair, total_signals, closed_trades, open_signals,
            tp1_count, tp2_count, tp3_count, tp4_count, sl_count,
            CASE WHEN closed_trades > 0 
                THEN ROUND((tp1_count + tp2_count + tp3_count + tp4_count)::numeric / closed_trades * 100, 2)
                ELSE 0 END as win_rate,
            ROUND(
                CASE WHEN closed_trades > 0 THEN (tp1_count+tp2_count+tp3_count+tp4_count)::numeric/closed_trades*100*0.4 ELSE 0 END +
                LEAST(total_signals::numeric/20*100,100)*0.3 +
                CASE WHEN closed_trades > 0 THEN ((tp4_count*4+tp3_count*3+tp2_count*2+tp1_count*1)::numeric/closed_trades*25)*0.3 ELSE 0 END
            , 2) as performance_score
        FROM pair_stats
        ORDER BY win_rate DESC, closed_trades DESC
    """)
    
    result = db.execute(analyze_query)
    rows = result.fetchall()
    
    pair_metrics = []
    total_signals = total_closed = total_open = 0
    total_tp1 = total_tp2 = total_tp3 = total_tp4 = total_sl = 0
    
    for row in rows:
        pair_metrics.append(PairMetrics(
            pair=row[0], total_signals=row[1], closed_trades=row[2], open_signals=row[3],
            tp1_count=row[4], tp2_count=row[5], tp3_count=row[6], tp4_count=row[7], sl_count=row[8],
            win_rate=float(row[9]) if row[9] else 0,
            performance_score=float(row[10]) if row[10] else 0
        ))
        total_signals += row[1]; total_closed += row[2]; total_open += row[3]
        total_tp1 += row[4]; total_tp2 += row[5]; total_tp3 += row[6]
        total_tp4 += row[7]; total_sl += row[8]
    
    total_winners = total_tp1 + total_tp2 + total_tp3 + total_tp4
    overall_win_rate = (total_winners / total_closed * 100) if total_closed > 0 else 0

    # Win Rate Trend
    dt = "DATE(s.created_at)" if trend_mode == 'daily' else "DATE(DATE_TRUNC('week', s.created_at::timestamp))"
    trend_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT {dt} as period, COUNT(so.outcome), 
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END),
            CASE WHEN COUNT(so.outcome)>0 THEN ROUND(SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric/COUNT(so.outcome)*100,2) ELSE 0 END
        FROM signals s INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE s.created_at IS NOT NULL {date_filter}
        GROUP BY {dt} HAVING COUNT(so.outcome) >= 3 ORDER BY period ASC
    """)
    
    win_rate_trend = [WinRateTrendItem(period=str(r[0]), total_closed=int(r[1]), winners=int(r[2]), losers=int(r[3]), win_rate=float(r[4]) if r[4] else 0) for r in db.execute(trend_query).fetchall()]

    # Risk:Reward
    rr_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT so.outcome, COUNT(*),
            AVG(CASE WHEN s.entry>0 AND s.stop1>0 AND ABS(s.entry-s.stop1)>0 THEN
                CASE so.outcome WHEN 'tp1' THEN ABS(s.target1-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'tp2' THEN ABS(s.target2-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'tp3' THEN ABS(s.target3-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'tp4' THEN ABS(s.target4-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'sl' THEN -1.0 ELSE 0 END ELSE NULL END)
        FROM signals s INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE s.entry>0 AND s.stop1>0 AND s.target1>0 {date_filter}
        GROUP BY so.outcome ORDER BY CASE so.outcome WHEN 'tp1' THEN 1 WHEN 'tp2' THEN 2 WHEN 'tp3' THEN 3 WHEN 'tp4' THEN 4 WHEN 'sl' THEN 5 END
    """)
    
    risk_reward = []
    trw = trc = 0
    for r in db.execute(rr_query).fetchall():
        lv=str(r[0]); cnt=int(r[1]); arr=float(r[2]) if r[2] else 0
        risk_reward.append(RiskRewardItem(level=lv.upper(), avg_rr=round(arr,2), count=cnt))
        if lv != 'sl': trw += arr*cnt; trc += cnt
    avg_risk_reward = round(trw/trc, 2) if trc > 0 else 0

    if not rows:
        return AnalyzeResponse(
            stats=AnalyzeStats(total_signals=0,closed_trades=0,open_signals=0,win_rate=0,total_winners=0,
                tp1_count=0,tp2_count=0,tp3_count=0,tp4_count=0,sl_count=0,active_pairs=0),
            pair_metrics=[], win_rate_trend=[], risk_reward=[], avg_risk_reward=0, time_range=time_range)
    
    return AnalyzeResponse(
        stats=AnalyzeStats(
            total_signals=total_signals, closed_trades=total_closed, open_signals=total_open,
            win_rate=round(overall_win_rate, 2), total_winners=total_winners,
            tp1_count=total_tp1, tp2_count=total_tp2, tp3_count=total_tp3,
            tp4_count=total_tp4, sl_count=total_sl, active_pairs=len(pair_metrics)),
        pair_metrics=pair_metrics, win_rate_trend=win_rate_trend,
        risk_reward=risk_reward, avg_risk_reward=avg_risk_reward, time_range=time_range)


# ============================================
# GET /signals/ — with date-aware cache key
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
    
    # === TRY CACHE FIRST (now includes date params) ===
    cache_key = build_signals_page_key(
        page=page, page_size=page_size,
        status=status or "", pair=pair or "",
        risk=risk_level or "", sort_by=sort_by, sort_order=sort_order,
        date_from=date_from or "", date_to=date_to or ""
    )
    cached = cache_get(cache_key)
    if cached:
        cached.pop("_cached_at", None)
        return cached
    
    # === FALLBACK TO DB ===
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
    if status:
        mapped = status_to_filter(status)
        if mapped == 'open':
            conditions.append("so.outcome IS NULL")
        else:
            conditions.append("so.outcome = :status_filter")
            params["status_filter"] = mapped
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    valid_sorts = {
        'created_at': 's.call_message_id', 'pair': 's.pair', 'entry': 's.entry',
        'call_message_id': 's.call_message_id', 'status': "COALESCE(so.outcome, 'open')",
        'risk_level': """CASE WHEN LOWER(s.risk_level) LIKE 'low%' THEN 1
            WHEN LOWER(s.risk_level) LIKE 'med%' THEN 2
            WHEN LOWER(s.risk_level) LIKE 'high%' THEN 3 ELSE 4 END""",
    }
    sort_col = valid_sorts.get(sort_by, 's.call_message_id')
    sort_dir = 'DESC' if sort_order == 'desc' else 'ASC'
    
    count_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT COUNT(*) FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE {where_clause}
    """)
    total = db.execute(count_query, params).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    offset = (page - 1) * page_size
    
    data_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT 
            s.signal_id, s.channel_id, s.call_message_id, s.message_link,
            s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
            s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den,
            s.created_at,
            CASE WHEN so.outcome = 'tp4' THEN 'closed_win'
                 WHEN so.outcome = 'sl' THEN 'closed_loss'
                 WHEN so.outcome IS NOT NULL THEN so.outcome
                 ELSE 'open' END as derived_status,
            s.market_cap
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
            "signal_id": r[0], "channel_id": r[1], "call_message_id": r[2], "message_link": r[3],
            "pair": r[4], "entry": r[5], "target1": r[6], "target2": r[7],
            "target3": r[8], "target4": r[9], "stop1": r[10], "stop2": r[11],
            "risk_level": r[12], "volume_rank_num": r[13], "volume_rank_den": r[14],
            "created_at": r[15], "status": r[16], "market_cap": r[17],
        })
    
    result = {"items": items, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}
    
    # Cache this result for next time (short TTL since worker will refresh)
    cache_set(cache_key, result, ttl=40)
    
    return result


# ============================================
# GET /signals/active
# ============================================

@router.get("/active")
async def get_active_signals(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    cached = cache_get(f"lq:signals:active:{limit}")
    if cached and "items" in cached:
        return cached["items"]
    
    query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT s.signal_id, s.channel_id, s.call_message_id, s.message_link,
            s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
            s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den, s.created_at
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE so.outcome IS NULL
        ORDER BY s.call_message_id DESC LIMIT :limit
    """)
    
    rows = db.execute(query, {"limit": limit}).fetchall()
    return [{
        "signal_id": r[0], "channel_id": r[1], "call_message_id": r[2], "message_link": r[3],
        "pair": r[4], "entry": r[5], "target1": r[6], "target2": r[7], "target3": r[8], "target4": r[9],
        "stop1": r[10], "stop2": r[11], "risk_level": r[12], "volume_rank_num": r[13],
        "volume_rank_den": r[14], "created_at": r[15], "status": "open",
    } for r in rows]


# ============================================
# GET /signals/stats
# ============================================

@router.get("/stats", response_model=SignalStats)
async def get_signal_stats(db: Session = Depends(get_db)):
    cached = cache_get("lq:signals:stats")
    if cached:
        cached.pop("_cached_at", None)
        return SignalStats(**cached)
    
    stats_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT COUNT(*), COUNT(CASE WHEN so.outcome IS NULL THEN 1 END),
            SUM(CASE WHEN so.outcome='tp1' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='tp2' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='tp3' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='tp4' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='sl' THEN 1 ELSE 0 END)
        FROM signals s LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
    """)
    
    row = db.execute(stats_query).fetchone()
    if not row:
        return SignalStats(total_signals=0,open_signals=0,tp1_signals=0,tp2_signals=0,tp3_signals=0,closed_win=0,closed_loss=0,win_rate=0)
    
    t,o,t1,t2,t3,cw,cl = [int(x or 0) for x in row]
    tc = t1+t2+t3+cw+cl; tw = t1+t2+t3+cw
    wr = (tw/tc*100) if tc>0 else 0
    return SignalStats(total_signals=t,open_signals=o,tp1_signals=t1,tp2_signals=t2,tp3_signals=t3,closed_win=cw,closed_loss=cl,win_rate=round(wr,2))


# ============================================
# POST /signals/sync-status
# ============================================

@router.post("/sync-status")
async def sync_signal_status(db: Session = Depends(get_db)):
    sync_query = text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        UPDATE signals s
        SET status = CASE WHEN so.outcome = 'tp4' THEN 'closed_win'
            WHEN so.outcome = 'sl' THEN 'closed_loss'
            WHEN so.outcome IS NOT NULL THEN so.outcome ELSE 'open' END
        FROM signal_outcomes so
        WHERE s.signal_id = so.signal_id
        AND s.status != CASE WHEN so.outcome = 'tp4' THEN 'closed_win'
            WHEN so.outcome = 'sl' THEN 'closed_loss'
            WHEN so.outcome IS NOT NULL THEN so.outcome ELSE 'open' END
    """)
    result = db.execute(sync_query)
    db.commit()
    return {"message": "Status sync completed", "updated": result.rowcount}


# ============================================
# GET /signals/top-performers
# ============================================

@router.get("/top-performers")
async def get_top_performers(
    days: Optional[int] = Query(7, ge=1, le=90),
    limit: int = Query(5, ge=1, le=20),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Top Gainers (highest gain %) and Fastest Hits (shortest time to TP max)
    from signals that hit TP4 (closed_win).
    Supports: days=N (preset) OR date_from/date_to (custom range).
    """
    # Determine date range
    if date_from and date_to:
        # Custom range
        actual_from = date_from
        actual_to = date_to
        cache_key = f"lq:signals:top-performers:custom:{date_from}:{date_to}:{limit}"
    elif date_from:
        actual_from = date_from
        actual_to = datetime.utcnow().strftime('%Y-%m-%d')
        cache_key = f"lq:signals:top-performers:from:{date_from}:{limit}"
    else:
        # Preset days
        actual_from = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')
        actual_to = None
        cache_key = f"lq:signals:top-performers:{days}:{limit}"

    cached = cache_get(cache_key)
    if cached:
        return cached

    date_conditions = "AND s.created_at >= :date_from"
    params = {"date_from": actual_from, "limit": limit}
    if actual_to:
        date_conditions += " AND s.created_at <= :date_to"
        params["date_to"] = f"{actual_to} 23:59:59"

    # Logic: find highest TP level reached per signal, calc gain from entry to that TP price
    # Supports tp1, tp2, tp3, tp4 - picks the highest one reached
    gainers_sql = text(f"""
        WITH highest_tp AS (
            SELECT DISTINCT ON (s.signal_id)
                s.signal_id, s.pair, s.entry,
                su.update_type as tp_level,
                CASE su.update_type
                    WHEN 'tp1' THEN s.tp1
                    WHEN 'tp2' THEN s.tp2
                    WHEN 'tp3' THEN s.tp3
                    WHEN 'tp4' THEN s.tp4
                END as tp_price,
                s.created_at as signal_time,
                su.created_at as hit_time,
                EXTRACT(EPOCH FROM (su.created_at - s.created_at)) as duration_seconds
            FROM signals s
            INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                AND su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4')
            WHERE s.status IN ('closed_win', 'closed_loss', 'open')
                {date_conditions}
                AND s.entry > 0
            ORDER BY s.signal_id,
                CASE su.update_type
                    WHEN 'tp4' THEN 4 WHEN 'tp3' THEN 3
                    WHEN 'tp2' THEN 2 WHEN 'tp1' THEN 1
                END DESC
        )
        SELECT pair, entry, tp_price, tp_level,
            ROUND(ABS(tp_price - entry) / entry * 100, 2) as gain_pct,
            duration_seconds, signal_time, hit_time
        FROM highest_tp
        WHERE tp_price > 0
        ORDER BY gain_pct DESC
        LIMIT :limit
    """)

    fastest_sql = text(f"""
        WITH highest_tp AS (
            SELECT DISTINCT ON (s.signal_id)
                s.signal_id, s.pair, s.entry,
                su.update_type as tp_level,
                CASE su.update_type
                    WHEN 'tp1' THEN s.tp1
                    WHEN 'tp2' THEN s.tp2
                    WHEN 'tp3' THEN s.tp3
                    WHEN 'tp4' THEN s.tp4
                END as tp_price,
                s.created_at as signal_time,
                su.created_at as hit_time,
                EXTRACT(EPOCH FROM (su.created_at - s.created_at)) as duration_seconds
            FROM signals s
            INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                AND su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4')
            WHERE s.status IN ('closed_win', 'closed_loss', 'open')
                {date_conditions}
                AND s.entry > 0
            ORDER BY s.signal_id,
                CASE su.update_type
                    WHEN 'tp4' THEN 4 WHEN 'tp3' THEN 3
                    WHEN 'tp2' THEN 2 WHEN 'tp1' THEN 1
                END DESC
        )
        SELECT pair, entry, tp_price, tp_level,
            ROUND(ABS(tp_price - entry) / entry * 100, 2) as gain_pct,
            duration_seconds, signal_time, hit_time
        FROM highest_tp
        WHERE tp_price > 0 AND duration_seconds > 0
        ORDER BY duration_seconds ASC
        LIMIT :limit
    """)

    try:
        gainers_rows = db.execute(gainers_sql, params).fetchall()
        fastest_rows = db.execute(fastest_sql, params).fetchall()

        def fmt_dur(sec):
            if not sec or sec <= 0: return "N/A"
            h, m = int(sec // 3600), int((sec % 3600) // 60)
            return f"{h}h {m}m" if h > 0 else f"{m}m"

        def row_to_dict(r):
            return {
                "pair": r[0], "entry": float(r[1] or 0), "tp_price": float(r[2] or 0),
                "tp_level": (r[3] or "").upper().replace("TP", "TP "),  # "tp3" -> "TP 3"
                "gain_pct": float(r[4] or 0), "duration_seconds": float(r[5] or 0),
                "duration_display": fmt_dur(r[5]),
                "signal_time": r[6].isoformat() if r[6] else None,
                "hit_time": r[7].isoformat() if r[7] else None,
            }

        period_end = actual_to or datetime.utcnow().strftime('%B %d, %Y')
        period_start = actual_from
        # Try to format nicely
        try:
            from datetime import datetime as dt2
            ps = dt2.strptime(period_start, '%Y-%m-%d').strftime('%B %d, %Y')
            pe = dt2.strptime(period_end, '%Y-%m-%d').strftime('%B %d, %Y') if len(period_end) == 10 else period_end
            period_start = ps
            period_end = pe
        except: pass

        # Count total signals with any TP hit in this period
        count_sql = text(f"""
            SELECT COUNT(DISTINCT s.signal_id) FROM signals s
            INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                AND su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4')
            WHERE 1=1 {date_conditions} AND s.entry > 0
        """)
        total_count = db.execute(count_sql, params).scalar() or 0

        result = {
            "period": f"{period_start} - {period_end}",
            "days": days,
            "total_tp4": total_count,
            "top_gainers": [row_to_dict(r) for r in gainers_rows],
            "fastest_hits": [row_to_dict(r) for r in fastest_rows],
        }
        cache_set(cache_key, result, ttl=60)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")


# ============================================
# GET /signals/detail/{signal_id}
# ============================================

@router.get("/detail/{signal_id}", response_model=SignalDetailResponse)
async def get_signal_detail_v2(signal_id: str, db: Session = Depends(get_db)):
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    updates_result = db.execute(
        text("""
            SELECT update_type, price, MIN(update_at) as update_at
            FROM signal_updates
            WHERE signal_id = :signal_id
            GROUP BY update_type, price
            ORDER BY MIN(update_at) ASC
        """),
        {"signal_id": signal_id}
    )
    
    updates = []
    seen_types = set()
    for row in updates_result.fetchall():
        update_type = row[0].lower() if row[0] else ''
        normalized_type = None
        if 'tp4' in update_type or 'target 4' in update_type: normalized_type = 'tp4'
        elif 'tp3' in update_type or 'target 3' in update_type: normalized_type = 'tp3'
        elif 'tp2' in update_type or 'target 2' in update_type: normalized_type = 'tp2'
        elif 'tp1' in update_type or 'target 1' in update_type: normalized_type = 'tp1'
        elif 'sl' in update_type or 'stop' in update_type: normalized_type = 'sl'
        
        if normalized_type and normalized_type not in seen_types:
            seen_types.add(normalized_type)
            updates.append(SignalUpdateItem(update_type=normalized_type, price=row[1], update_at=row[2]))
    
    market_cap = risk_reasons = None
    try:
        extra = db.execute(text("SELECT market_cap, risk_reasons FROM signals WHERE signal_id = :sid"), {"sid": signal_id}).fetchone()
        if extra: market_cap = extra[0]; risk_reasons = extra[1]
    except: pass
    
    return SignalDetailResponse(
        signal_id=signal.signal_id, channel_id=signal.channel_id,
        call_message_id=signal.call_message_id, message_link=signal.message_link,
        pair=signal.pair, entry=signal.entry,
        target1=signal.target1, target2=signal.target2, target3=signal.target3, target4=signal.target4,
        stop1=signal.stop1, stop2=signal.stop2,
        risk_level=signal.risk_level, volume_rank_num=signal.volume_rank_num, volume_rank_den=signal.volume_rank_den,
        status=signal.status, created_at=signal.created_at,
        market_cap=market_cap, risk_reasons=risk_reasons, updates=updates)


# ============================================
# GET /signals/{signal_id} — Legacy
# ============================================

@router.get("/{signal_id}")
async def get_signal_detail(signal_id: str, db: Session = Depends(get_db)):
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    updates = db.query(SignalUpdate).filter(SignalUpdate.signal_id == signal_id).order_by(asc(SignalUpdate.update_at)).all()
    
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
    
    return {
        "signal_id": signal.signal_id, "channel_id": signal.channel_id,
        "call_message_id": signal.call_message_id, "message_link": signal.message_link,
        "pair": signal.pair, "entry": signal.entry,
        "target1": signal.target1, "target2": signal.target2, "target3": signal.target3, "target4": signal.target4,
        "stop1": signal.stop1, "stop2": signal.stop2,
        "risk_level": signal.risk_level, "volume_rank_num": signal.volume_rank_num, "volume_rank_den": signal.volume_rank_den,
        "status": derived_status, "created_at": signal.created_at,
        "updates": [{"update_type": u.update_type, "price": u.price, "update_at": u.update_at, "message_link": u.message_link} for u in updates]
    }