"""
LuxQuant Terminal - Coin Profile API Routes
Endpoint untuk Signal Modal "History" tab
Provides: past calls for a pair, win rate, TP breakdown, R:R stats
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.redis import cache_get, cache_set, cache_get_with_stale
from app.utils.chart_urls import chart_path_to_url
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()


# ============================================
# Pydantic Models
# ============================================

class PastCallItem(BaseModel):
    signal_id: str
    pair: Optional[str] = None
    entry: Optional[float] = None
    target1: Optional[float] = None
    target2: Optional[float] = None
    target3: Optional[float] = None
    target4: Optional[float] = None
    stop1: Optional[float] = None
    stop2: Optional[float] = None
    risk_level: Optional[str] = None
    market_cap: Optional[str] = None
    volume_rank_num: Optional[int] = None
    volume_rank_den: Optional[int] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    created_at: Optional[str] = None
    entry_chart_url: Optional[str] = None
    latest_chart_url: Optional[str] = None
    # Computed fields
    gain_pct: Optional[float] = None
    duration: Optional[str] = None


class TpBreakdown(BaseModel):
    tp1: int = 0
    tp2: int = 0
    tp3: int = 0
    tp4: int = 0
    sl: int = 0


class RiskDistribution(BaseModel):
    low: int = 0
    normal: int = 0
    medium: int = 0
    high: int = 0


class CoinProfileStats(BaseModel):
    total_signals: int = 0
    closed_trades: int = 0
    open_signals: int = 0
    win_rate: float = 0.0
    tp_breakdown: TpBreakdown = TpBreakdown()
    avg_rr: float = 0.0
    best_gain_pct: Optional[float] = None
    worst_loss_pct: Optional[float] = None
    avg_gain_pct: Optional[float] = None
    avg_duration: Optional[str] = None    # e.g. "2d 5h"
    risk_distribution: RiskDistribution = RiskDistribution()
    first_signal: Optional[str] = None
    last_signal: Optional[str] = None
    streak: Optional[int] = None          # current win/loss streak
    streak_type: Optional[str] = None     # "win" or "loss"


class CoinProfileResponse(BaseModel):
    pair: str
    stats: CoinProfileStats
    past_calls: List[PastCallItem]


# ============================================
# Common CTE for outcome resolution
# ============================================

OUTCOME_CTE = """
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
# GET /coin-profile/{pair}
# ============================================

@router.get("/{pair}", response_model=CoinProfileResponse)
async def get_coin_profile(
    pair: str,
    limit: int = Query(5, ge=1, le=10000, description="Number of past calls to return"),
    exclude: Optional[str] = Query(None, description="Signal ID to exclude (current signal)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get coin profile for SignalModal History tab.
    Returns aggregated stats + past N calls with outcomes.
    """
    pair_upper = pair.upper()
    
    # === Cache ===
    cache_key = f"lq:coin-profile:{pair_upper}:l{limit}:ex{exclude or 'none'}"
    cached = cache_get(cache_key)
    if cached:
        cached.pop("_cached_at", None)
        return CoinProfileResponse(**cached)

    try:
        # ─────────────────────────────────
        # 1. Aggregated Stats (ALL signals for this pair)
        # ─────────────────────────────────
        stats_query = text(f"""
            WITH {OUTCOME_CTE}
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
            WHERE UPPER(s.pair) = :pair
        """)
        
        sr = db.execute(stats_query, {"pair": pair_upper}).fetchone()
        
        if not sr or sr[0] == 0:
            raise HTTPException(status_code=404, detail=f"No signals found for {pair_upper}")

        total_signals = sr[0]
        closed_trades = sr[1]
        open_signals = sr[2]
        tp1 = sr[3] or 0
        tp2 = sr[4] or 0
        tp3 = sr[5] or 0
        tp4 = sr[6] or 0
        sl = sr[7] or 0
        first_signal = sr[8]
        last_signal = sr[9]

        total_wins = tp1 + tp2 + tp3 + tp4
        win_rate = (total_wins / closed_trades * 100) if closed_trades > 0 else 0.0

        # ─────────────────────────────────
        # 2. Avg R:R (entry→target2 / entry→stop1)
        # ─────────────────────────────────
        rr_query = text("""
            SELECT AVG(
                CASE 
                    WHEN s.entry > 0 AND s.stop1 > 0 AND s.target2 > 0 
                    THEN ABS(s.target2 - s.entry) / NULLIF(ABS(s.entry - s.stop1), 0)
                    ELSE NULL 
                END
            ) as avg_rr
            FROM signals s
            WHERE UPPER(s.pair) = :pair AND s.entry > 0 AND s.stop1 > 0
        """)
        rr_row = db.execute(rr_query, {"pair": pair_upper}).fetchone()
        avg_rr = float(rr_row[0]) if rr_row and rr_row[0] else 0.0

        # ─────────────────────────────────
        # 3. Best/Worst/Avg gain % (based on outcome)
        # ─────────────────────────────────
        gains_query = text(f"""
            WITH {OUTCOME_CTE}
            SELECT 
                so.outcome,
                s.entry,
                s.target1, s.target2, s.target3, s.target4,
                s.stop1
            FROM signals s
            INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE UPPER(s.pair) = :pair AND s.entry > 0
        """)
        gains_rows = db.execute(gains_query, {"pair": pair_upper}).fetchall()

        gain_pcts = []
        for row in gains_rows:
            outcome, entry = row[0], float(row[1])
            if entry <= 0:
                continue
            # Determine the price at outcome
            target_map = {"tp1": row[2], "tp2": row[3], "tp3": row[4], "tp4": row[5], "sl": row[6]}
            target_price = target_map.get(outcome)
            if target_price and float(target_price) > 0:
                pct = ((float(target_price) - entry) / entry) * 100
                gain_pcts.append(round(pct, 2))

        best_gain = max(gain_pcts) if gain_pcts else None
        worst_loss = min(gain_pcts) if gain_pcts else None
        avg_gain = round(sum(gain_pcts) / len(gain_pcts), 2) if gain_pcts else None

        # ─────────────────────────────────
        # 4. Current Streak (win/loss)
        # ─────────────────────────────────
        streak_query = text(f"""
            WITH {OUTCOME_CTE}
            SELECT so.outcome
            FROM signals s
            INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE UPPER(s.pair) = :pair
            ORDER BY s.created_at DESC
            LIMIT 20
        """)
        streak_rows = db.execute(streak_query, {"pair": pair_upper}).fetchall()
        
        streak = 0
        streak_type = None
        for row in streak_rows:
            is_win = row[0] in ("tp1", "tp2", "tp3", "tp4")
            current_type = "win" if is_win else "loss"
            if streak == 0:
                streak_type = current_type
                streak = 1
            elif current_type == streak_type:
                streak += 1
            else:
                break

        # ─────────────────────────────────
        # 5. Avg Duration (created_at → last update_at for closed trades)
        # ─────────────────────────────────
        # ─────────────────────────────────
        # 5. Avg Duration (created_at → last update_at for closed trades)
        # ─────────────────────────────────
        avg_duration = None
        try:
            duration_query = text(f"""
                WITH {OUTCOME_CTE}
                SELECT AVG(dur_secs) FROM (
                    SELECT 
                        EXTRACT(EPOCH FROM (
                            MAX(su.update_at::timestamptz) - s.created_at::timestamptz
                        )) as dur_secs
                    FROM signals s
                    INNER JOIN signal_outcomes so ON s.signal_id = so.signal_id
                    INNER JOIN signal_updates su ON s.signal_id = su.signal_id
                    WHERE UPPER(s.pair) = :pair
                      AND s.created_at IS NOT NULL
                      AND su.update_at IS NOT NULL
                    GROUP BY s.signal_id, s.created_at
                    HAVING EXTRACT(EPOCH FROM (
                        MAX(su.update_at::timestamptz) - s.created_at::timestamptz
                    )) > 0
                ) sub
            """)
            dur_row = db.execute(duration_query, {"pair": pair_upper}).fetchone()
            if dur_row and dur_row[0]:
                total_mins = int(float(dur_row[0]) / 60)
                if total_mins < 60:
                    avg_duration = f"{total_mins}m"
                elif total_mins < 1440:
                    h = total_mins // 60
                    m = total_mins % 60
                    avg_duration = f"{h}h {m}m" if m > 0 else f"{h}h"
                else:
                    d = total_mins // 1440
                    h = (total_mins % 1440) // 60
                    avg_duration = f"{d}d {h}h" if h > 0 else f"{d}d"
        except Exception:
            db.rollback()
            avg_duration = None

        # ─────────────────────────────────
        # 6. Risk Distribution
        # ─────────────────────────────────
        risk_query = text("""
            SELECT 
                LOWER(risk_level) as rl,
                COUNT(*) as cnt
            FROM signals
            WHERE UPPER(pair) = :pair AND risk_level IS NOT NULL
            GROUP BY LOWER(risk_level)
        """)
        risk_rows = db.execute(risk_query, {"pair": pair_upper}).fetchall()
        risk_dist = {"low": 0, "normal": 0, "medium": 0, "high": 0}
        for row in risk_rows:
            rl = row[0].strip().lower()
            cnt = row[1]
            if rl in risk_dist:
                risk_dist[rl] += cnt
            elif rl in ("med", "mid"):
                risk_dist["medium"] += cnt
            else:
                risk_dist["normal"] += cnt

        # ─────────────────────────────────
        # 7. Past N Calls (with exclude option)
        # ─────────────────────────────────
        exclude_clause = "AND s.signal_id != :exclude" if exclude else ""
        
        calls_query = text(f"""
            WITH {OUTCOME_CTE},
            last_update AS (
                SELECT 
                    signal_id,
                    MAX(update_at) as last_update_at
                FROM signal_updates
                GROUP BY signal_id
            )
            SELECT 
                s.signal_id,
                s.pair,
                s.entry,
                s.target1, s.target2, s.target3, s.target4,
                s.stop1, s.stop2,
                s.risk_level,
                s.market_cap,
                s.volume_rank_num, s.volume_rank_den,
                s.status,
                so.outcome,
                s.created_at,
                s.entry_chart_path,
                s.latest_chart_path,
                lu.last_update_at
            FROM signals s
            LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
            LEFT JOIN last_update lu ON s.signal_id = lu.signal_id
            WHERE UPPER(s.pair) = :pair {exclude_clause}
            ORDER BY s.created_at DESC
            LIMIT :limit
        """)
        
        params = {"pair": pair_upper, "limit": limit}
        if exclude:
            params["exclude"] = exclude
        
        call_rows = db.execute(calls_query, params).fetchall()

        past_calls = []
        for r in call_rows:
            entry_val = float(r[2]) if r[2] else 0
            outcome = r[14]
            
            # Calculate gain % for this signal
            gain_pct = None
            if entry_val > 0 and outcome:
                target_map = {"tp1": r[3], "tp2": r[4], "tp3": r[5], "tp4": r[6], "sl": r[7]}
                tp = target_map.get(outcome)
                if tp and float(tp) > 0:
                    gain_pct = round(((float(tp) - entry_val) / entry_val) * 100, 2)

            # Calculate duration
            duration = None
            created = r[15]
            last_upd = r[18]
            if created and last_upd and outcome:
                try:
                    from datetime import datetime
                    t1 = datetime.fromisoformat(str(created).replace("Z", "+00:00").replace("+00:00", ""))
                    t2 = datetime.fromisoformat(str(last_upd).replace("Z", "+00:00").replace("+00:00", ""))
                    diff = t2 - t1
                    total_mins = int(diff.total_seconds() / 60)
                    if total_mins < 0:
                        duration = None
                    elif total_mins < 60:
                        duration = f"{total_mins}m"
                    elif total_mins < 1440:
                        h = total_mins // 60
                        m = total_mins % 60
                        duration = f"{h}h {m}m" if m > 0 else f"{h}h"
                    else:
                        d = total_mins // 1440
                        h = (total_mins % 1440) // 60
                        duration = f"{d}d {h}h" if h > 0 else f"{d}d"
                except:
                    duration = None

            past_calls.append(PastCallItem(
                signal_id=r[0],
                pair=r[1],
                entry=r[2],
                target1=r[3],
                target2=r[4],
                target3=r[5],
                target4=r[6],
                stop1=r[7],
                stop2=r[8],
                risk_level=r[9],
                market_cap=r[10],
                volume_rank_num=r[11],
                volume_rank_den=r[12],
                status=r[13],
                outcome=outcome,
                created_at=r[15],
                entry_chart_url=chart_path_to_url(r[16]),
                latest_chart_url=chart_path_to_url(r[17]),
                gain_pct=gain_pct,
                duration=duration,
            ))

        # ─────────────────────────────────
        # Build Response
        # ─────────────────────────────────
        stats = CoinProfileStats(
            total_signals=total_signals,
            closed_trades=closed_trades,
            open_signals=open_signals,
            win_rate=round(win_rate, 2),
            tp_breakdown=TpBreakdown(tp1=tp1, tp2=tp2, tp3=tp3, tp4=tp4, sl=sl),
            avg_rr=round(avg_rr, 2),
            best_gain_pct=best_gain,
            worst_loss_pct=worst_loss,
            avg_gain_pct=avg_gain,
            avg_duration=avg_duration,
            risk_distribution=RiskDistribution(**risk_dist),
            first_signal=first_signal,
            last_signal=last_signal,
            streak=streak if streak > 0 else None,
            streak_type=streak_type,
        )

        result = CoinProfileResponse(
            pair=pair_upper,
            stats=stats,
            past_calls=past_calls,
        )

        # Cache for 60 seconds
        cache_set(cache_key, result.model_dump(), ttl=60)
        return result

    except HTTPException:
        raise
    except Exception as e:
        # Stale cache fallback
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            stale.pop("_cached_at", None)
            return CoinProfileResponse(**stale)
        raise HTTPException(status_code=500, detail=f"Coin profile error: {str(e)}")