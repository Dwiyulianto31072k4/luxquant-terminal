"""
LuxQuant Terminal - Signals API Routes
OPTIMIZED VERSION - Uses pure SQL aggregation for performance
Includes: Win Rate Trend, Risk:Reward Ratio
UPDATED: 
- Fixed signal detail endpoint with dedup + market_cap/risk_reasons
- Date-aware cache keys so "Last 7 Days" requests hit pre-computed cache
- R:R now calculates per target level (potential R:R) instead of per outcome
- FIXED: R:R SL query now uses signal_updates table directly (no missing CTE)
- OPTIMIZED v3: stale cache fallback on all main endpoints
- NEW: last_update_at + last_update_type fields for "Recently Updated" filter/sort
- FIXED: LAST_UPDATE_CTE now returns highest level hit + its timestamp (synced with status)
- CHART UPDATES: Added entry and latest chart URLs to all endpoints
- TOP GAINERS v6: peak-based logic using peak_price column (filter by created_at)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, text
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import asyncio
import os
import re
from app.core.http_client import get_binance_client

from app.core.database import get_db
from app.models.signal import Signal, SignalUpdate
from app.models.user import User
from app.api.deps import require_subscription, get_admin_user, get_current_user_optional
from app.schemas.signal import (
    SignalResponse, 
    SignalListResponse,
    SignalStats,
    SignalStatus
)
from app.config import settings
from app.core.redis import (
    cache_get, cache_set, cache_get_with_stale,
    build_signals_page_key, is_redis_available, get_redis
)
from app.utils.chart_urls import chart_path_to_url
from app.services.coin_intel_worker import compute_daily_regimes, compute_coin_intel
from app.services.cache_worker import precompute_outcomes, ensure_outcomes_table
from app.core.database import SessionLocal

router = APIRouter()


# ============================================
# Helper: Check if user is active subscriber
# Used for conditional public/private endpoints (Opsi B)
# ============================================

def _user_is_active_subscriber(user: Optional[User]) -> bool:
    """
    Check if user may see full signal levels (no exception thrown).
    Returns False if user is None (anonymous) or not entitled.

    Delegates to User.has_active_access — the single definition of who is
    entitled. This function used to re-derive it locally with an admin-only
    bypass, which silently redacted every signal for co_admin and founder:
    view-only staff got the same "-" columns as a free user.
    """
    return bool(user is not None and user.has_active_access)


# ============================================
# Helper: Strict public-viewability check for signal status
# Returns True if status is "fully closed" (TP4 hit OR SL hit)
# Partial running statuses (open, tp1, tp2, tp3) are NOT public.
# ============================================

def _status_is_publicly_viewable(status: Optional[str]) -> bool:
    """
    Strict policy: only signals that have reached final outcome are public.
    - closed_win / tp4 = fully won, all targets hit
    - closed_loss / sl = fully lost, stop hit

    Anything else (open, tp1, tp2, tp3) is still actionable and protected.
    """
    if not status:
        return False
    s = status.lower()
    return s in ('closed_win', 'tp4', 'closed_loss', 'sl')


# Track-record window. The business model is time-based, not status-based:
# a call older than this is free to open in full (it's the public proof), while
# anything newer stays behind the paywall regardless of whether it closed —
# the exclusivity subscribers pay for. Mirrors signal_journey.PUBLIC_AFTER_DAYS.
PUBLIC_AFTER_DAYS = 7


def _is_recent_signal(created_at) -> bool:
    """True if the signal is younger than PUBLIC_AFTER_DAYS (still paywalled)."""
    if not created_at:
        return False  # unknown age → treat as old (fail open to track record)
    dt = created_at
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt > datetime.now(timezone.utc) - timedelta(days=PUBLIC_AFTER_DAYS)


def _peak_pct(entry: Optional[float], peak_price: Optional[float]) -> Optional[float]:
    """Best unrealized gain from entry to peak — the marketing hook, always
    safe to show (it proves the call worked without revealing the levels)."""
    try:
        if entry and peak_price and float(entry) > 0:
            return round((float(peak_price) - float(entry)) / float(entry) * 100, 2)
    except (TypeError, ValueError):
        pass
    return None


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


class RiskDistributionItem(BaseModel):
    risk_level: str
    total_signals: int
    closed_trades: int
    winners: int
    losers: int
    win_rate: float
    avg_rr: float


class RiskTrendItem(BaseModel):
    period: str
    low_wr: Optional[float] = None
    normal_wr: Optional[float] = None
    high_wr: Optional[float] = None
    low_count: int = 0
    normal_count: int = 0
    high_count: int = 0


class AnalyzeResponse(BaseModel):
    stats: AnalyzeStats
    pair_metrics: List[PairMetrics]
    win_rate_trend: List[WinRateTrendItem]
    risk_reward: List[RiskRewardItem]
    avg_risk_reward: float
    risk_distribution: List[RiskDistributionItem] = []
    risk_trend: List[RiskTrendItem] = []
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
    entry_chart_url: Optional[str] = None
    latest_chart_url: Optional[str] = None
    x_post_url: Optional[str] = None
    updates: List[SignalUpdateItem] = []
    enrichment: Optional[dict] = None
    # NEW: redact flag for non-subscriber accessing open signals (Opsi B)
    is_redacted: Optional[bool] = False
    # Peak is shown even when redacted — it proves the call worked (the hook)
    # without leaking the actionable levels. is_recent tells the UI whether the
    # lock is a "still active, subscribe" state vs an ordinary closed call.
    peak_price: Optional[float] = None
    peak_pct: Optional[float] = None
    is_recent: Optional[bool] = False

    class Config:
        # Allow extra fields for forward compatibility
        extra = "allow"


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

# ============================================
# Helper: CTE for last update per signal
# ============================================
LAST_UPDATE_CTE = """
    last_updates AS (
        -- Precomputed once per cache cycle in precompute_outcomes(); reading
        -- it here is 3.8ms against ~1.5s for the inline window-function scan
        -- this used to be (measured live: 26M rows read per 2 minutes across
        -- all consumers). Freshness contract matches _cache_outcomes, which
        -- every consumer of this CTE already also reads.
        SELECT signal_id, last_update_at, last_update_type
        FROM _cache_last_updates
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
# OPSI B: Fully public (data agregat saja, no actionable info)
# ============================================

@router.get("/analyze", response_model=AnalyzeResponse)
def get_analyze_data(
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    trend_mode: str = Query("weekly", description="Trend grouping: daily, weekly"),
    db: Session = Depends(get_db),
):
    cache_key = f"lq:signals:analyze:{time_range}:{trend_mode}"
    cached = cache_get(cache_key)
    if cached:
        return AnalyzeResponse(**cached)
    
    try:
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

        rr_query = text(f"""
            SELECT level, COUNT(*) as cnt, AVG(avg_rr) as avg_rr
            FROM (
                SELECT 
                    'TP1' as level,
                    CASE WHEN s.entry > 0 AND s.stop1 > 0 AND ABS(s.entry - s.stop1) > 0 AND s.target1 > 0
                        THEN ABS(s.target1 - s.entry) / ABS(s.entry - s.stop1)
                        ELSE NULL END as avg_rr
                FROM signals s
                WHERE s.entry > 0 AND s.stop1 > 0 AND s.target1 > 0 {date_filter}
                UNION ALL
                SELECT 
                    'TP2' as level,
                    CASE WHEN s.entry > 0 AND s.stop1 > 0 AND ABS(s.entry - s.stop1) > 0 AND s.target2 > 0
                        THEN ABS(s.target2 - s.entry) / ABS(s.entry - s.stop1)
                        ELSE NULL END as avg_rr
                FROM signals s
                WHERE s.entry > 0 AND s.stop1 > 0 AND s.target2 > 0 {date_filter}
                UNION ALL
                SELECT 
                    'TP3' as level,
                    CASE WHEN s.entry > 0 AND s.stop1 > 0 AND ABS(s.entry - s.stop1) > 0 AND s.target3 > 0
                        THEN ABS(s.target3 - s.entry) / ABS(s.entry - s.stop1)
                        ELSE NULL END as avg_rr
                FROM signals s
                WHERE s.entry > 0 AND s.stop1 > 0 AND s.target3 > 0 {date_filter}
                UNION ALL
                SELECT 
                    'TP4' as level,
                    CASE WHEN s.entry > 0 AND s.stop1 > 0 AND ABS(s.entry - s.stop1) > 0 AND s.target4 > 0
                        THEN ABS(s.target4 - s.entry) / ABS(s.entry - s.stop1)
                        ELSE NULL END as avg_rr
                FROM signals s
                WHERE s.entry > 0 AND s.stop1 > 0 AND s.target4 > 0 {date_filter}
                UNION ALL
                SELECT 
                    'SL' as level,
                    -1.0 as avg_rr
                FROM signals s
                WHERE s.entry > 0 AND s.stop1 > 0 {date_filter}
                    AND EXISTS (
                        SELECT 1 FROM signal_updates su
                        WHERE su.signal_id = s.signal_id
                        AND (LOWER(su.update_type) LIKE '%sl%' OR LOWER(su.update_type) LIKE '%stop%')
                    )
            ) sub
            WHERE avg_rr IS NOT NULL
            GROUP BY level
            ORDER BY CASE level WHEN 'TP1' THEN 1 WHEN 'TP2' THEN 2 WHEN 'TP3' THEN 3 WHEN 'TP4' THEN 4 WHEN 'SL' THEN 5 END
        """)
        
        risk_reward = []
        trw = trc = 0
        for r in db.execute(rr_query).fetchall():
            lv = str(r[0]); cnt = int(r[1]); arr = float(r[2]) if r[2] else 0
            risk_reward.append(RiskRewardItem(level=lv, avg_rr=round(arr, 2), count=cnt))
            if lv != 'SL': trw += arr * cnt; trc += cnt
        avg_risk_reward = round(trw / trc, 2) if trc > 0 else 0

        if not rows:
            return AnalyzeResponse(
                stats=AnalyzeStats(total_signals=0,closed_trades=0,open_signals=0,win_rate=0,total_winners=0,
                    tp1_count=0,tp2_count=0,tp3_count=0,tp4_count=0,sl_count=0,active_pairs=0),
                pair_metrics=[], win_rate_trend=[], risk_reward=[], avg_risk_reward=0,
                risk_distribution=[], risk_trend=[], time_range=time_range)

        risk_dist_query = text(f"""
            WITH {SIGNAL_OUTCOMES_CTE}
            SELECT 
                CASE 
                    WHEN LOWER(s.risk_level) LIKE 'low%' THEN 'Low'
                    WHEN LOWER(s.risk_level) LIKE 'nor%' OR LOWER(s.risk_level) LIKE 'med%' THEN 'Normal'
                    WHEN LOWER(s.risk_level) LIKE 'high%' THEN 'High'
                    ELSE 'Unknown'
                END as risk_group,
                COUNT(*) as total_signals,
                COUNT(so.outcome) as closed_trades,
                SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as winners,
                SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as losers,
                CASE WHEN COUNT(so.outcome) > 0 
                    THEN ROUND(SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric / COUNT(so.outcome) * 100, 2)
                    ELSE 0 END as win_rate,
                AVG(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') AND s.entry > 0 AND s.stop1 > 0 AND ABS(s.entry - s.stop1) > 0 THEN
                    ABS(COALESCE(s.target4, s.target3, s.target2, s.target1) - s.entry) / ABS(s.entry - s.stop1)
                    ELSE NULL END) as avg_rr
            FROM signals s
            LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE s.risk_level IS NOT NULL {date_filter}
            GROUP BY risk_group
            ORDER BY 1
        """)
        
        risk_distribution = []
        for r in db.execute(risk_dist_query).fetchall():
            if r[0] == 'Unknown': continue
            risk_distribution.append(RiskDistributionItem(
                risk_level=r[0], total_signals=int(r[1]), closed_trades=int(r[2]),
                winners=int(r[3]), losers=int(r[4]), win_rate=float(r[5]) if r[5] else 0,
                avg_rr=round(float(r[6]), 2) if r[6] else 0
            ))
        risk_order = {'Low': 0, 'Normal': 1, 'High': 2}
        risk_distribution.sort(key=lambda x: risk_order.get(x.risk_level, 9))

        risk_trend_dt = "DATE(DATE_TRUNC('week', s.created_at::timestamp))" if trend_mode == 'weekly' else "DATE(s.created_at)"
        risk_trend_query = text(f"""
            WITH {SIGNAL_OUTCOMES_CTE}
            SELECT 
                {risk_trend_dt} as period,
                CASE 
                    WHEN LOWER(s.risk_level) LIKE 'low%' THEN 'low'
                    WHEN LOWER(s.risk_level) LIKE 'nor%' OR LOWER(s.risk_level) LIKE 'med%' THEN 'normal'
                    WHEN LOWER(s.risk_level) LIKE 'high%' THEN 'high'
                END as risk_group,
                COUNT(so.outcome) as closed,
                SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as winners
            FROM signals s
            INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE s.risk_level IS NOT NULL AND LOWER(s.risk_level) NOT LIKE 'unk%' {date_filter}
            GROUP BY period, risk_group
            HAVING COUNT(so.outcome) >= 2
            ORDER BY period ASC
        """)

        risk_trend_raw = {}
        for r in db.execute(risk_trend_query).fetchall():
            p = str(r[0])
            if p not in risk_trend_raw:
                risk_trend_raw[p] = {"period": p, "low_wr": None, "normal_wr": None, "high_wr": None, "low_count": 0, "normal_count": 0, "high_count": 0}
            rg = r[1]
            closed = int(r[2])
            winners = int(r[3])
            wr = round(winners / closed * 100, 2) if closed > 0 else None
            if rg == 'low':
                risk_trend_raw[p]["low_wr"] = wr
                risk_trend_raw[p]["low_count"] = closed
            elif rg == 'normal':
                risk_trend_raw[p]["normal_wr"] = wr
                risk_trend_raw[p]["normal_count"] = closed
            elif rg == 'high':
                risk_trend_raw[p]["high_wr"] = wr
                risk_trend_raw[p]["high_count"] = closed

        risk_trend = [RiskTrendItem(**v) for v in sorted(risk_trend_raw.values(), key=lambda x: x["period"])]
        
        response = AnalyzeResponse(
            stats=AnalyzeStats(
                total_signals=total_signals, closed_trades=total_closed, open_signals=total_open,
                win_rate=round(overall_win_rate, 2), total_winners=total_winners,
                tp1_count=total_tp1, tp2_count=total_tp2, tp3_count=total_tp3,
                tp4_count=total_tp4, sl_count=total_sl, active_pairs=len(pair_metrics)),
            pair_metrics=pair_metrics, win_rate_trend=win_rate_trend,
            risk_reward=risk_reward, avg_risk_reward=avg_risk_reward,
            risk_distribution=risk_distribution, risk_trend=risk_trend,
            time_range=time_range)

        cache_set(cache_key, response.model_dump(), ttl=60)
        return response

    except Exception as e:
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            return AnalyzeResponse(**stale)
        raise HTTPException(status_code=500, detail=f"Analyze query error: {str(e)}")


# ============================================
# GET /signals/bulk-7d (PUBLIC)
# ============================================

@router.get("/bulk-7d")
def get_signals_bulk_7d(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    is_subscriber = _user_is_active_subscriber(current_user)
 
    # Cache dipisah: anonim/free TIDAK boleh share cache dengan subscriber.
    cache_key = "lq:signals:bulk-7d:sub" if is_subscriber else "lq:signals:bulk-7d:pub"
 
    cached = cache_get(cache_key)
    if cached:
        return cached
    # Rollover: serve recent stale instantly (the poller re-warms the fresh key)
    # so a burst of users can't all recompute at once when the TTL expires.
    stale, _ = cache_get_with_stale(cache_key)
    if stale:
        return stale

    try:
        from datetime import datetime, timedelta
        date_7d = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
 
        rows = db.execute(text(f"""
            WITH {SIGNAL_OUTCOMES_CTE},
            {LAST_UPDATE_CTE}
            SELECT s.signal_id, s.channel_id, s.call_message_id, s.message_link,
                s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
                s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den,
                s.created_at,
                CASE WHEN so.outcome = 'tp4' THEN 'closed_win' WHEN so.outcome = 'sl' THEN 'closed_loss'
                     WHEN so.outcome IS NOT NULL THEN so.outcome ELSE 'open' END as derived_status,
                s.market_cap,
                lu.last_update_at,
                lu.last_update_type,
                s.entry_chart_path, s.latest_chart_path,           -- r[20], r[21]
                bc.beta_30d, bc.corr_4h_30d,                       -- r[22], r[23]
                bc.is_decoupled, bc.is_extended,                   -- r[24], r[25]
                (bc.interpretation->>'alignment_score')::int,      -- r[26]
                bc.interpretation->>'risk_level',                  -- r[27]
                tg.important_tags                                  -- r[28]
            FROM signals s
            LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
            LEFT JOIN last_updates lu ON s.signal_id = lu.signal_id
            LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
            LEFT JOIN LATERAL (
                SELECT array_agg(t->>'name') AS important_tags
                FROM signal_enrichment e2,
                     jsonb_array_elements(e2.entry_snapshot->'tags_annotated') t
                WHERE e2.signal_id = s.signal_id
                  AND (t->>'important')::boolean = true
            ) tg ON true
            WHERE s.created_at >= :date_from
            ORDER BY s.call_message_id DESC
        """), {"date_from": date_7d}).fetchall()
 
        items = []
        for r in rows:
            if is_subscriber:
                # Full data — subscriber/admin
                items.append({
                    "signal_id": r[0], "channel_id": r[1], "call_message_id": r[2], "message_link": r[3],
                    "pair": r[4], "entry": r[5], "target1": r[6], "target2": r[7],
                    "target3": r[8], "target4": r[9], "stop1": r[10], "stop2": r[11],
                    "risk_level": r[12], "volume_rank_num": r[13], "volume_rank_den": r[14],
                    "created_at": r[15], "status": r[16], "market_cap": r[17],
                    "last_update_at": str(r[18]) if r[18] else None,
                    "last_update_type": r[19],
                    "entry_chart_url": chart_path_to_url(r[20]),
                    "latest_chart_url": chart_path_to_url(r[21]),
                    "btc_beta": float(r[22]) if r[22] is not None else None,
                    "btc_corr": float(r[23]) if r[23] is not None else None,
                    "btc_decoupled": bool(r[24]) if r[24] is not None else False,
                    "btc_extended": bool(r[25]) if r[25] is not None else False,
                    "btc_align_score": r[26],
                    "btc_risk": r[27],
                    "important_tags": list(r[28]) if r[28] else [],
                    "is_redacted": False,
                })
            else:
                # REDACTED — non-subscriber. Pilihan A: signal dalam 7 hari
                # masih "panas" → sembunyikan semua angka actionable + link telegram.
                # Yang tetap tampil: pair, status, created_at, risk_level, market_cap
                # (cukup buat teaser + soft-paywall di frontend).
                items.append({
                    "signal_id": r[0],
                    "channel_id": None,           # redacted (jangan bocorkan sumber)
                    "call_message_id": None,      # redacted
                    "message_link": None,         # redacted (link telegram)
                    "pair": r[4],
                    "entry": None,                # redacted
                    "target1": None, "target2": None, "target3": None, "target4": None,  # redacted
                    "stop1": None, "stop2": None, # redacted
                    "risk_level": r[12],
                    "volume_rank_num": r[13], "volume_rank_den": r[14],
                    "created_at": r[15], "status": r[16], "market_cap": r[17],
                    "last_update_at": str(r[18]) if r[18] else None,
                    "last_update_type": r[19],
                    "entry_chart_url": None,      # redacted
                    "latest_chart_url": None,     # redacted
                    "btc_beta": None, "btc_corr": None,
                    "btc_decoupled": False, "btc_extended": False,
                    "btc_align_score": None, "btc_risk": None,
                    "important_tags": list(r[28]) if r[28] else [],
                    "is_redacted": True,
                })
 
        result = {
            "items": items,
            "total": len(items),
            "date_from": date_7d,
            "is_subscriber": is_subscriber,
        }
        cache_set(cache_key, result, ttl=30)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk 7d query error: {str(e)}")
 


# ============================================
# GET /signals/
# OPSI B: Conditional - non-subscriber force filter to closed signals only
# ============================================

@router.get("/")
def get_signals(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
    status: Optional[str] = None,
    pair: Optional[str] = None,
    risk_level: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    is_subscriber = _user_is_active_subscriber(current_user)
    
    # OPSI B (STRICT): Non-subscriber can only see fully-closed signals
    # (closed_win = tp4 hit, closed_loss = sl hit)
    # Partial running signals (open, tp1, tp2, tp3) are subscriber-only
    PUBLIC_VIEWABLE_STATUSES = {'closed_win', 'tp4', 'closed_loss', 'sl'}
    
    if not is_subscriber:
        if status and status.lower() != 'all':
            # If they request a non-public status, return empty
            if status.lower() not in PUBLIC_VIEWABLE_STATUSES:
                return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 1}
    
    # Cache key includes subscriber flag so anonymous & subscriber don't share cache
    sub_flag = "sub" if is_subscriber else "pub"
    cache_key = f"lq:signals:{sub_flag}:page={page}:size={page_size}:st={status or 'all'}:pair={pair or 'all'}:risk={risk_level or 'all'}:sb={sort_by}:so={sort_order}:df={date_from or 'none'}:dt={date_to or 'none'}"
    
    cached = cache_get(cache_key)
    if cached:
        cached.pop("_cached_at", None)
        return cached
    
    try:
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
            params["date_from"] = f"{date_from} 00:00:00"
        if date_to:
            conditions.append("s.created_at <= :date_to")
            params["date_to"] = f"{date_to} 23:59:59"
            
        if status and status.lower() != 'all':
            mapped = status_to_filter(status)
            if mapped == 'open':
                # subscriber only path (already returned for non-sub above)
                conditions.append("so.outcome IS NULL")
            else:
                conditions.append("so.outcome = :status_filter")
                params["status_filter"] = mapped
        
        # OPSI B (STRICT): Non-subscriber force filter — only fully-closed signals
        # (tp4 = closed_win, sl = closed_loss). Partial running (tp1/tp2/tp3) hidden.
        if not is_subscriber and not (status and status.lower() != 'all'):
            conditions.append("so.outcome IN ('tp4', 'sl')")
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        valid_sorts = {
            'created_at': 's.call_message_id', 'pair': 's.pair', 'entry': 's.entry',
            'call_message_id': 's.call_message_id', 'status': "COALESCE(so.outcome, 'open')",
            'risk_level': """CASE WHEN LOWER(s.risk_level) LIKE 'low%' THEN 1
                WHEN LOWER(s.risk_level) LIKE 'med%' THEN 2
                WHEN LOWER(s.risk_level) LIKE 'high%' THEN 3 ELSE 4 END""",
            'market_cap': """CASE 
                WHEN s.market_cap IS NULL THEN 0
                WHEN UPPER(s.market_cap) LIKE '%T' THEN CAST(REGEXP_REPLACE(s.market_cap, '[^0-9.]', '', 'g') AS NUMERIC) * 1e12
                WHEN UPPER(s.market_cap) LIKE '%B' THEN CAST(REGEXP_REPLACE(s.market_cap, '[^0-9.]', '', 'g') AS NUMERIC) * 1e9
                WHEN UPPER(s.market_cap) LIKE '%M' THEN CAST(REGEXP_REPLACE(s.market_cap, '[^0-9.]', '', 'g') AS NUMERIC) * 1e6
                WHEN UPPER(s.market_cap) LIKE '%K' THEN CAST(REGEXP_REPLACE(s.market_cap, '[^0-9.]', '', 'g') AS NUMERIC) * 1e3
                ELSE CAST(REGEXP_REPLACE(s.market_cap, '[^0-9.]', '', 'g') AS NUMERIC)
                END""",
            'last_update': 'lu.last_update_at',
        }
        sort_col = valid_sorts.get(sort_by, 's.call_message_id')
        sort_dir = 'DESC' if sort_order == 'desc' else 'ASC'
        
        null_handling = ""
        if sort_by == 'last_update':
            null_handling = " NULLS LAST"
        
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
            WITH {SIGNAL_OUTCOMES_CTE},
            {LAST_UPDATE_CTE}
            SELECT 
                s.signal_id, s.channel_id, s.call_message_id, s.message_link,
                s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
                s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den,
                s.created_at,
                CASE WHEN so.outcome = 'tp4' THEN 'closed_win'
                     WHEN so.outcome = 'sl' THEN 'closed_loss'
                     WHEN so.outcome IS NOT NULL THEN so.outcome
                     ELSE 'open' END as derived_status,
                s.market_cap,
                lu.last_update_at,
                lu.last_update_type,
                s.entry_chart_path, s.latest_chart_path
            FROM signals s
            LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
            LEFT JOIN last_updates lu ON s.signal_id = lu.signal_id
            WHERE {where_clause}
            ORDER BY {sort_col} {sort_dir}{null_handling}
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
                "last_update_at": str(r[18]) if r[18] else None,
                "last_update_type": r[19],
                "entry_chart_url": chart_path_to_url(r[20]),
                "latest_chart_url": chart_path_to_url(r[21]),
            })
        
        result = {"items": items, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}
        cache_set(cache_key, result, ttl=40)
        return result

    except Exception as e:
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            stale.pop("_cached_at", None)
            return stale
        raise HTTPException(status_code=500, detail=f"Signals query error: {str(e)}")


# ============================================
# GET /signals/active (SUBSCRIBER ONLY)
# ============================================

@router.get("/active")
def get_active_signals(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_subscription),
):
    # NOTE: plain `def` (not async) on purpose — FastAPI runs it in a threadpool
    # so the synchronous DB query below can never block the event loop / freeze
    # a worker when Postgres is slow during a peak-load crunch.
    cached = cache_get(f"lq:signals:active:{limit}")
    if cached and "items" in cached:
        return cached["items"]
    
    try:
        query = text(f"""
            WITH {SIGNAL_OUTCOMES_CTE}
            SELECT s.signal_id, s.channel_id, s.call_message_id, s.message_link,
                s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
                s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den, s.created_at,
                s.entry_chart_path, s.latest_chart_path
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
            "entry_chart_url": chart_path_to_url(r[16]),
            "latest_chart_url": chart_path_to_url(r[17])
        } for r in rows]

    except Exception as e:
        stale, _ = cache_get_with_stale(f"lq:signals:active:{limit}")
        if stale and "items" in stale:
            return stale["items"]
        raise HTTPException(status_code=500, detail=f"Active signals error: {str(e)}")


# ============================================
# GET /signals/stats (PUBLIC)
# ============================================

@router.get("/stats", response_model=SignalStats)
def get_signal_stats(db: Session = Depends(get_db)):
    cached = cache_get("lq:signals:stats")
    if cached:
        cached.pop("_cached_at", None)
        return SignalStats(**cached)
    # Rollover → serve recent stale instantly (poller re-warms) instead of
    # recomputing inline on the event loop.
    stale, _ = cache_get_with_stale("lq:signals:stats")
    if stale:
        stale.pop("_cached_at", None)
        return SignalStats(**stale)

    try:
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

    except Exception as e:
        stale, _ = cache_get_with_stale("lq:signals:stats")
        if stale:
            stale.pop("_cached_at", None)
            return SignalStats(**stale)
        raise HTTPException(status_code=500, detail=f"Stats query error: {str(e)}")


# ============================================
# POST /signals/sync-status (ADMIN ONLY)
# ============================================

@router.post("/sync-status")
def sync_signal_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
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
# GET /signals/top-performers (PUBLIC)
# UPDATED v8: + price sparkline (call -> peak) for MEXC-style leaderboard
# ============================================

def _spark_symbol(pair: str) -> str:
    """Normalize a stored pair into a Binance symbol (e.g. '3ABEUSDT' -> 'BEUSDT')."""
    s = re.sub(r'[^A-Z0-9]', '', (pair or '').upper())
    if s.startswith('3A'):
        s = s[2:]
    if not s.endswith('USDT'):
        s = s + 'USDT'
    return s


def _spark_interval(duration_seconds) -> str:
    """Pick a kline interval so the call->peak span yields a readable sparkline."""
    d = float(duration_seconds or 0)
    if d <= 6 * 3600:
        return '5m'
    if d <= 2 * 86400:
        return '1h'
    if d <= 10 * 86400:
        return '4h'
    return '1d'


def _to_ms(ts):
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts)).timestamp() * 1000
    except Exception:
        return None


def _downsample(arr, n=24):
    if not arr:
        return None
    if len(arr) <= n:
        return [round(float(x), 10) for x in arr]
    step = len(arr) / n
    return [round(float(arr[int(i * step)]), 10) for i in range(n)]


async def _fetch_sparkline(client, symbol, start_ms, end_ms, interval):
    """Closing-price series from Binance (futures, then spot). Returns ~24 points or None."""
    params = {"symbol": symbol, "interval": interval, "startTime": int(start_ms), "limit": 80}
    if end_ms:
        params["endTime"] = int(end_ms)
    for base in ("https://fapi.binance.com/fapi/v1/klines",
                 "https://api.binance.com/api/v3/klines"):
        try:
            r = await client.get(base, params=params)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list) and len(data) >= 2:
                    return _downsample([c[4] for c in data], 24)
        except Exception:
            continue
    return None


async def _enrich_sparklines(items):
    """Attach `sparkline` (call->peak price path) to each gainer, concurrently."""
    try:
        client = get_binance_client()
    except Exception:
        return

    async def _one(item):
        try:
            start_ms = _to_ms(item.get("signal_time"))
            if not start_ms:
                return
            end_ms = _to_ms(item.get("hit_time"))
            spark = await _fetch_sparkline(
                client,
                _spark_symbol(item.get("pair")),
                start_ms,
                end_ms,
                _spark_interval(item.get("duration_seconds")),
            )
            if spark:
                item["sparkline"] = spark
        except Exception:
            pass

    await asyncio.gather(*[_one(it) for it in items])


@router.get("/top-performers")
async def get_top_performers(
    days: Optional[int] = Query(7, ge=1, le=90),
    limit: int = Query(5, ge=1, le=20),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Top Gainers (peak-based) & Fastest Hits — deduplicated per pair."""
    if date_from and date_to:
        actual_from = date_from
        actual_to = date_to
        cache_key = f"lq:signals:top-performers:v9:custom:{date_from}:{date_to}:{limit}"
    elif date_from:
        actual_from = date_from
        actual_to = datetime.utcnow().strftime('%Y-%m-%d')
        cache_key = f"lq:signals:top-performers:v9:from:{date_from}:{limit}"
    else:
        actual_from = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')
        actual_to = None
        cache_key = f"lq:signals:top-performers:v9:{days}:{limit}"

    cached = cache_get(cache_key)
    if cached:
        return cached

    # Fresh cache expired → serve the recent stale copy INSTANTLY instead of
    # recomputing inline. The poller re-warms the fresh key every cycle; this
    # stops a burst of users from all recomputing at once (cache stampede) when
    # the 5-min TTL rolls over — which is what produced the slow top-performers
    # spikes. (Threadpool offload below still makes any true cold-start non-fatal.)
    stale, _ = cache_get_with_stale(cache_key)
    if stale:
        return stale

    date_conditions_hit = "AND su.update_at >= :date_from"
    params = {"date_from": actual_from, "limit": limit}
    if actual_to:
        date_conditions_hit += " AND su.update_at <= :date_to"
        params["date_to"] = f"{actual_to}T23:59:59"

    date_to_clause_gainers = "AND CAST(s.created_at AS timestamptz) <= CAST(:date_to AS timestamptz)" if actual_to else ""
    date_to_clause_tp = "AND CAST(su.update_at AS timestamptz) <= CAST(:date_to AS timestamptz)" if actual_to else ""

    gainers_sql = text(f"""
        WITH qualified_signals AS (
            SELECT DISTINCT
                s.signal_id,
                UPPER(s.pair) as pair,
                s.entry,
                s.peak_price,
                s.peak_at,
                s.created_at as signal_time
            FROM signals s
            WHERE s.entry > 0
              AND s.pair IS NOT NULL
              AND s.peak_price IS NOT NULL
              AND (
                  CAST(s.created_at AS timestamptz) >= CAST(:date_from AS timestamptz)
                  OR EXISTS (
                      SELECT 1 FROM signal_updates su
                      WHERE su.signal_id = s.signal_id
                        AND su.update_type IN ('tp1','tp2','tp3','tp4')
                        AND CAST(su.update_at AS timestamptz) >= CAST(:date_from AS timestamptz)
                        {date_to_clause_tp}
                  )
              )
              {date_to_clause_gainers}
        ),
        signal_gains AS (
            SELECT
                pair,
                signal_id,
                entry,
                peak_price,
                peak_at,
                signal_time,
                (peak_price - entry) / NULLIF(entry, 0) as gain_ratio
            FROM qualified_signals
            WHERE entry > 0 AND peak_price > entry
        ),
        pair_agg AS (
            SELECT
                pair,
                (ARRAY_AGG(signal_time ORDER BY gain_ratio DESC NULLS LAST))[1] as first_signal_time,
                (ARRAY_AGG(signal_id ORDER BY gain_ratio DESC NULLS LAST))[1] as first_signal_id,
                (ARRAY_AGG(entry ORDER BY gain_ratio DESC NULLS LAST))[1] as first_entry,
                (ARRAY_AGG(peak_price ORDER BY gain_ratio DESC NULLS LAST))[1] as best_peak_price,
                (ARRAY_AGG(peak_at ORDER BY gain_ratio DESC NULLS LAST))[1] as best_peak_at,
                (ARRAY_AGG(signal_id ORDER BY gain_ratio DESC NULLS LAST))[1] as best_peak_signal_id,
                COUNT(DISTINCT signal_id) as signal_count,
                ARRAY_AGG(DISTINCT signal_id ORDER BY signal_id) as all_signal_ids
            FROM signal_gains
            GROUP BY pair
        )
        SELECT
            pa.best_peak_signal_id as signal_id,
            pa.pair,
            pa.first_entry as entry,
            pa.best_peak_price as tp_price,
            'PEAK' as tp_level,
            ROUND(((pa.best_peak_price - pa.first_entry) / NULLIF(pa.first_entry, 0) * 100)::numeric, 2) as gain_pct,
            EXTRACT(EPOCH FROM (pa.best_peak_at - pa.first_signal_time::timestamptz)) as duration_seconds,
            pa.first_signal_time as signal_time,
            pa.best_peak_at as hit_time,
            pa.signal_count,
            pa.all_signal_ids,
            sig.latest_chart_path,
            sig.pnl_leverage,
            sig.target1,
            sig.target2,
            sig.target3,
            sig.target4
        FROM pair_agg pa
        JOIN signals sig ON sig.signal_id = pa.best_peak_signal_id
        WHERE pa.best_peak_price > pa.first_entry
          AND pa.first_entry > 0
        ORDER BY gain_pct DESC
        LIMIT :limit
    """)

    fastest_sql = text(f"""
        WITH first_tp_per_signal AS (
            SELECT DISTINCT ON (s.signal_id)
                s.signal_id,
                UPPER(s.pair) as pair,
                s.entry,
                su.update_type as tp_level,
                CASE su.update_type
                    WHEN 'tp1' THEN s.target1
                    WHEN 'tp2' THEN s.target2
                    WHEN 'tp3' THEN s.target3
                    WHEN 'tp4' THEN s.target4
                END as tp_price,
                s.created_at as signal_time,
                su.update_at as hit_time,
                EXTRACT(EPOCH FROM (su.update_at::timestamptz - s.created_at::timestamptz)) as duration_seconds
            FROM signals s
            INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                AND su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4')
            WHERE 1=1 {date_conditions_hit} AND s.entry > 0
            ORDER BY s.signal_id, su.update_at ASC
        ),
        pair_fastest AS (
            SELECT DISTINCT ON (pair) *
            FROM first_tp_per_signal
            WHERE tp_price IS NOT NULL AND tp_price > 0 AND duration_seconds > 0
            ORDER BY pair, duration_seconds ASC
        ),
        pair_ids AS (
            SELECT
                UPPER(s.pair) as pair,
                ARRAY_AGG(DISTINCT s.signal_id ORDER BY s.signal_id) as all_signal_ids,
                COUNT(DISTINCT s.signal_id) as signal_count
            FROM signals s
            INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                AND su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4')
            WHERE 1=1 {date_conditions_hit} AND s.entry > 0
            GROUP BY UPPER(s.pair)
        )
        SELECT
            f.signal_id, f.pair, f.entry, f.tp_price, f.tp_level,
            ROUND((ABS(f.tp_price - f.entry) / NULLIF(f.entry, 0) * 100)::numeric, 2) as gain_pct,
            f.duration_seconds, f.signal_time, f.hit_time,
            p.signal_count,
            p.all_signal_ids
        FROM pair_fastest f
        JOIN pair_ids p ON f.pair = p.pair
        ORDER BY f.duration_seconds ASC
        LIMIT :limit
    """)

    try:
        # Offload the heavy CTE queries off the event loop (this endpoint must
        # stay async for the awaited sparkline fetch below).
        gainers_rows = await run_in_threadpool(lambda: db.execute(gainers_sql, params).fetchall())
        fastest_rows = await run_in_threadpool(lambda: db.execute(fastest_sql, params).fetchall())

        def fmt_dur(sec):
            if not sec or sec <= 0: return "N/A"
            sec = float(sec)
            d = int(sec // 86400)
            h = int((sec % 86400) // 3600)
            m = int((sec % 3600) // 60)
            s = int(sec % 60)
            if d > 0: return f"{d}d {h}h {m}m"
            if h > 0: return f"{h}h {m}m"
            if m > 0: return f"{m}m {s}s"
            return f"{s}s"

        def row_to_dict(r):
            all_ids = r[10]
            if isinstance(all_ids, str):
                all_ids = [x.strip() for x in all_ids.strip('{}').split(',') if x.strip()]
            elif all_ids is None:
                all_ids = [r[0]]

            entry_val = float(r[2] or 0)
            d = {
                "signal_id": r[0],
                "pair": r[1],
                "entry": entry_val,
                "tp_price": float(r[3] or 0),
                "tp_level": (r[4] or "").upper().replace("TP", "TP "),
                "gain_pct": float(r[5] or 0),
                "duration_seconds": float(r[6] or 0),
                "duration_display": fmt_dur(r[6]),
                "signal_time": str(r[7]) if r[7] else None,
                "hit_time": str(r[8]) if r[8] else None,
                "signal_count": int(r[9]) if r[9] else 1,
                "all_signal_ids": all_ids,
            }

            # Enrichment for gainers rows (fastest rows are shorter → guarded).
            # Adds: PnL-card image (latest_chart_url), per-signal leverage, and
            # realized % (gain to the highest TP the card was rendered at).
            # gain_pct above is the PEAK gain; realized_pct is the TP gain.
            if len(r) > 12:
                import re as _re
                latest_path = r[11]
                lev = r[12]
                targets = [
                    r[13] if len(r) > 13 else None,
                    r[14] if len(r) > 14 else None,
                    r[15] if len(r) > 15 else None,
                    r[16] if len(r) > 16 else None,
                ]
                realized_pct = None
                if latest_path and entry_val > 0:
                    m = _re.search(r'_tp(\d)_', str(latest_path))
                    if m:
                        idx = int(m.group(1)) - 1
                        if 0 <= idx < 4 and targets[idx]:
                            try:
                                realized_pct = round(
                                    (float(targets[idx]) - entry_val) / entry_val * 100, 2
                                )
                            except Exception:
                                realized_pct = None
                d["latest_chart_url"] = chart_path_to_url(latest_path)
                d["pnl_leverage"] = int(lev) if lev else None
                d["realized_pct"] = realized_pct

            return d

        period_end = actual_to or datetime.utcnow().strftime('%B %d, %Y')
        period_start = actual_from
        try:
            from datetime import datetime as dt2
            ps = dt2.strptime(period_start, '%Y-%m-%d').strftime('%B %d, %Y')
            pe = dt2.strptime(period_end, '%Y-%m-%d').strftime('%B %d, %Y') if len(period_end) == 10 else period_end
            period_start = ps
            period_end = pe
        except:
            pass

        count_sql = text(f"""
            SELECT COUNT(DISTINCT s.signal_id) FROM signals s
            INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                AND su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4')
            WHERE 1=1 {date_conditions_hit} AND s.entry > 0
        """)
        total_count = (await run_in_threadpool(lambda: db.execute(count_sql, params).scalar())) or 0

        unique_pairs_sql = text(f"""
            SELECT COUNT(DISTINCT UPPER(s.pair)) FROM signals s
            INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                AND su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4')
            WHERE 1=1 {date_conditions_hit} AND s.entry > 0
        """)
        unique_pairs = (await run_in_threadpool(lambda: db.execute(unique_pairs_sql, params).scalar())) or 0

        gainers_list = [row_to_dict(r) for r in gainers_rows]
        fastest_list = [row_to_dict(r) for r in fastest_rows]

        # Opsi B — attach price sparkline (call -> peak/hit) for the MEXC-style table.
        # Concurrent Binance kline fetches; failures degrade gracefully (no sparkline).
        try:
            await _enrich_sparklines(gainers_list + fastest_list)
        except Exception as _spark_err:
            print(f"⚠️ sparkline enrich skipped: {_spark_err}")

        result = {
            "period": f"{period_start} - {period_end}",
            "days": days,
            "total_tp4": total_count,
            "total_tp_hits": total_count,
            "unique_pairs": unique_pairs,
            "top_gainers": gainers_list,
            "fastest_hits": fastest_list,
        }
        # 5-min TTL: the poller pre-warms the common variants every cycle, so
        # users read this cache instead of ever triggering the heavy compute.
        # The long TTL keeps last-good data serving even if the poller falls
        # behind during a peak-load crunch.
        cache_set(cache_key, result, ttl=300)
        return result
    except Exception as e:
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            return stale
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")
    
    
# ============================================
# GET /signals/coin-intel (SUBSCRIBER ONLY)
# ============================================

def _compute_coin_intel_once():
    """
    Heavy coin-intel compute — MUST run in a threadpool, never in the async
    event loop (it does synchronous DB work for many seconds). Single-flight
    across workers via a Redis SETNX lock so a cold cache + traffic burst can't
    make every worker compute at once (that was the WORKER TIMEOUT cause).
    """
    # Someone may have just filled the cache while we were queued.
    cached = cache_get("lq:signals:coin-intel")
    if cached:
        return cached

    r = None
    lock_ok = False
    try:
        r = get_redis()
        # Only ONE worker computes at a time; lock auto-expires in 90s.
        lock_ok = bool(r and r.set("lock:coin-intel:compute", "1", nx=True, ex=90))
    except Exception:
        lock_ok = True  # Redis unavailable → fall back to computing directly

    if not lock_ok:
        # Another worker is already computing — hand back stale data if we have it.
        stale, _ = cache_get_with_stale("lq:signals:coin-intel")
        return stale

    try:
        db = SessionLocal()
        try:
            if not ensure_outcomes_table(db):
                precompute_outcomes(db)
            compute_daily_regimes(db)
            result = compute_coin_intel(db)
            cache_set("lq:signals:coin-intel", result, ttl=120)
            return result
        finally:
            db.close()
    finally:
        try:
            if r and lock_ok:
                r.delete("lock:coin-intel:compute")
        except Exception:
            pass


@router.get("/coin-intel")
async def get_coin_intel(
    current_user: User = Depends(require_subscription),
):
    # 1) Fresh cache — the normal path (poller keeps this warm).
    cached = cache_get("lq:signals:coin-intel")
    if cached:
        return cached

    # 2) Cache expired but a recent stale copy exists → serve it instantly.
    #    NEVER block the event loop just because the poller is mid-refresh.
    stale, _ = cache_get_with_stale("lq:signals:coin-intel")
    if stale:
        return stale

    # 3) Truly cold cache: compute OFF the event loop (threadpool) + single-flight.
    try:
        result = await run_in_threadpool(_compute_coin_intel_once)
    except Exception:
        result = None
    if not result:
        raise HTTPException(
            status_code=503,
            detail="Coin intelligence not yet available. Ready after first cache cycle (~90s)."
        )
    return result


# ============================================
# Helper: LuxQuant X (Twitter) deep-link for a signal
# The x-poster service (luxquant-x-poster) records signal_id → tweet_id in the
# shared `x_posts` table. We surface the canonical tweet URL so the UI can link
# straight to the original LuxQuant post (and drive traffic back to X).
# ============================================
_X_ACCOUNT_HANDLE = (os.getenv("X_ACCOUNT_HANDLE", "luxquantcrypto") or "luxquantcrypto").lstrip("@") or "luxquantcrypto"


def _tweet_url_for_signal(db: Session, signal_id: str) -> Optional[str]:
    # Latest milestone tweet (TP2 → TP3 → TP4/closed_win): as the signal
    # progresses the poster tweets each milestone, so the newest row is the
    # highest / most impressive result. created_at DESC tracks that automatically.
    try:
        row = db.execute(text(
            "SELECT tweet_id FROM x_posts "
            "WHERE signal_id = :sid AND tweet_id IS NOT NULL "
            "ORDER BY created_at DESC LIMIT 1"
        ), {"sid": signal_id}).fetchone()
        if row and row[0]:
            return f"https://x.com/{_X_ACCOUNT_HANDLE}/status/{row[0]}"
    except Exception:
        pass
    return None


# ============================================
# Helper: Redact sensitive fields for non-subscriber on open signals
# ============================================
def _build_redacted_detail_response(
    signal: Signal,
    market_cap: Optional[str],
    risk_reasons: Optional[str],
    updates: List[SignalUpdateItem],
    peak_price: Optional[float] = None,
    peak_pct: Optional[float] = None,
) -> SignalDetailResponse:
    """Non-subscriber view of a recent call: peak shown, levels blurred.

    Entry/TP/SL/charts are withheld — those are the actionable alpha. Peak (how
    far it ran) is kept: it's the proof that makes the lock worth unlocking.
    """
    return SignalDetailResponse(
        signal_id=signal.signal_id,
        channel_id=signal.channel_id,
        call_message_id=signal.call_message_id,
        message_link=None,  # hide telegram link too
        pair=signal.pair,
        entry=None,  # redacted
        target1=None, target2=None, target3=None, target4=None,  # redacted
        stop1=None, stop2=None,  # redacted
        risk_level=signal.risk_level,
        volume_rank_num=signal.volume_rank_num,
        volume_rank_den=signal.volume_rank_den,
        status=signal.status,
        created_at=signal.created_at,
        market_cap=market_cap,
        risk_reasons=risk_reasons,
        entry_chart_url=None,  # redacted
        latest_chart_url=None,  # redacted
        updates=updates,  # safe, just shows what TP got hit (history)
        enrichment=None,  # redacted (deep analysis is paid)
        is_redacted=True,
        peak_price=peak_price,
        peak_pct=peak_pct,
        is_recent=True,
    )


# ============================================
# GET /signals/detail/{signal_id}
# OPSI B: Conditional - redact entry/TP/SL for non-subscriber on open signals
# ============================================

@router.get("/detail/{signal_id}", response_model=SignalDetailResponse)
def get_signal_detail_v2(
    signal_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    is_subscriber = _user_is_active_subscriber(current_user)
    
    # Get updates (history) - always returned, no redact
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
            # STRICT: only show update prices to subscribers OR when signal is fully closed
            price = row[1] if (is_subscriber or _status_is_publicly_viewable(signal.status)) else None
            updates.append(SignalUpdateItem(update_type=normalized_type, price=price, update_at=row[2]))
    
    market_cap = risk_reasons = entry_chart_path = latest_chart_path = peak_price = None
    try:
        extra = db.execute(text("SELECT market_cap, risk_reasons, entry_chart_path, latest_chart_path, peak_price FROM signals WHERE signal_id = :sid"), {"sid": signal_id}).fetchone()
        if extra:
            market_cap = extra[0]; risk_reasons = extra[1]; entry_chart_path = extra[2]; latest_chart_path = extra[3]; peak_price = extra[4]
    except: pass

    peak_pct = _peak_pct(signal.entry, peak_price)

    # Deep-link to the LuxQuant X post for this signal. The x-poster service
    # (luxquant-x-poster) records signal_id → tweet_id in the shared `x_posts`
    # table; we build the canonical tweet URL from the earliest tweet.
    x_post_url = _tweet_url_for_signal(db, signal_id)
    
    # Time-based gate (business model): anything older than PUBLIC_AFTER_DAYS is
    # free to open in full — that's the public track record. Newer calls stay
    # redacted for non-subscribers (peak shown, levels blurred), whether or not
    # they've closed: recency is the exclusivity subscribers pay for. Replaces
    # the old status-based rule, which leaked every recent closed call for free.
    if not is_subscriber and _is_recent_signal(signal.created_at):
        return _build_redacted_detail_response(
            signal, market_cap, risk_reasons, updates, peak_price, peak_pct
        )
    
    # Full response (closed signal OR subscriber)
    enrichment_data = None
    # Only attach enrichment for subscribers (Deep Analysis is paid)
    if is_subscriber:
        try:
            enr = db.execute(text("""
                SELECT confidence_score, rating, regime, score_breakdown, weights_used,
                       mtf_h4_trend, mtf_h1_trend, mtf_m15_trend, signal_direction, mtf_detail,
                       patterns_detected,
                       smc_fvg_count, smc_ob_count, smc_sweep_count, smc_golden_setup, smc_detail,
                       btc_trend, btc_dom_trend, fear_greed, atr_percentile,
                       confluence_notes, warnings, analyzed_at, enrichment_version
                FROM signal_enrichment WHERE signal_id = :sid
            """), {"sid": signal_id}).fetchone()
            if enr:
                enrichment_data = {
                    "confidence_score": enr[0],
                    "rating": enr[1],
                    "regime": enr[2],
                    "score_breakdown": enr[3] if isinstance(enr[3], dict) else {},
                    "weights_used": enr[4] if isinstance(enr[4], dict) else {},
                    "mtf_h4_trend": enr[5],
                    "mtf_h1_trend": enr[6],
                    "mtf_m15_trend": enr[7],
                    "signal_direction": enr[8],
                    "mtf_detail": enr[9] if isinstance(enr[9], dict) else {},
                    "patterns_detected": enr[10] if isinstance(enr[10], list) else [],
                    "smc_fvg_count": enr[11],
                    "smc_ob_count": enr[12],
                    "smc_sweep_count": enr[13],
                    "smc_golden_setup": enr[14],
                    "smc_detail": enr[15] if isinstance(enr[15], dict) else {},
                    "btc_trend": enr[16],
                    "btc_dom_trend": enr[17],
                    "fear_greed": enr[18],
                    "atr_percentile": enr[19],
                    "confluence_notes": enr[20],
                    "warnings": enr[21] if isinstance(enr[21], list) else [],
                    "analyzed_at": str(enr[22]) if enr[22] else None,
                    "enrichment_version": enr[23],
                }
        except Exception:
            pass
    
    return SignalDetailResponse(
        signal_id=signal.signal_id, channel_id=signal.channel_id,
        call_message_id=signal.call_message_id, message_link=signal.message_link,
        pair=signal.pair, entry=signal.entry,
        target1=signal.target1, target2=signal.target2, target3=signal.target3, target4=signal.target4,
        stop1=signal.stop1, stop2=signal.stop2,
        risk_level=signal.risk_level, volume_rank_num=signal.volume_rank_num, volume_rank_den=signal.volume_rank_den,
        status=signal.status, created_at=signal.created_at,
        market_cap=market_cap, risk_reasons=risk_reasons, 
        entry_chart_url=chart_path_to_url(entry_chart_path),
        latest_chart_url=chart_path_to_url(latest_chart_path),
        x_post_url=x_post_url,
        updates=updates,
        enrichment=enrichment_data,
        is_redacted=False,
        peak_price=peak_price,
        peak_pct=peak_pct,
        is_recent=_is_recent_signal(signal.created_at),
    )


# ============================================
# GET /signals/{signal_id} — Legacy
# OPSI B: Conditional same as /detail/{id}
# ============================================

@router.get("/{signal_id}")
def get_signal_detail(
    signal_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    signal = db.query(Signal).filter(Signal.signal_id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    is_subscriber = _user_is_active_subscriber(current_user)
    
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
    
    # Time-based gate (see get_signal_detail_v2): recent calls redacted for
    # non-subscribers with peak shown, older calls fully public.
    _peak = None
    try:
        _peak = db.execute(text("SELECT peak_price FROM signals WHERE signal_id = :sid"), {"sid": signal_id}).scalar()
    except Exception:
        pass
    _peak_pct_val = _peak_pct(signal.entry, _peak)
    if not is_subscriber and _is_recent_signal(signal.created_at):
        return {
            "signal_id": signal.signal_id, "channel_id": signal.channel_id,
            "call_message_id": signal.call_message_id, "message_link": None,
            "pair": signal.pair,
            "entry": None,  # redacted
            "target1": None, "target2": None, "target3": None, "target4": None,  # redacted
            "stop1": None, "stop2": None,  # redacted
            "risk_level": signal.risk_level,
            "volume_rank_num": signal.volume_rank_num, "volume_rank_den": signal.volume_rank_den,
            "status": derived_status, "created_at": signal.created_at,
            "entry_chart_url": None,  # redacted
            "latest_chart_url": None,  # redacted
            "updates": [{"update_type": u.update_type, "price": None, "update_at": u.update_at, "message_link": None} for u in updates],
            "is_redacted": True,
            "peak_price": _peak, "peak_pct": _peak_pct_val, "is_recent": True,
        }
    
    # Full response
    return {
        "signal_id": signal.signal_id, "channel_id": signal.channel_id,
        "call_message_id": signal.call_message_id, "message_link": signal.message_link,
        "pair": signal.pair, "entry": signal.entry,
        "target1": signal.target1, "target2": signal.target2, "target3": signal.target3, "target4": signal.target4,
        "stop1": signal.stop1, "stop2": signal.stop2,
        "risk_level": signal.risk_level, "volume_rank_num": signal.volume_rank_num, "volume_rank_den": signal.volume_rank_den,
        "status": derived_status, "created_at": signal.created_at,
        "entry_chart_url": chart_path_to_url(signal.entry_chart_path),
        "latest_chart_url": chart_path_to_url(signal.latest_chart_path),
        "updates": [{"update_type": u.update_type, "price": u.price, "update_at": u.update_at, "message_link": u.message_link} for u in updates],
        "is_redacted": False,
        "peak_price": _peak, "peak_pct": _peak_pct_val,
        "is_recent": _is_recent_signal(signal.created_at),
    }
