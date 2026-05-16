"""
LuxQuant Terminal - Daily Performance Dashboard
================================================
Bundled endpoint for the Daily Performance section.

Semantics:
  - All dates in UTC
  - WR computed by HIT date (signal_updates.update_at), NOT created_at
  - Bypasses daily_market_regime table (semantically different from hit-date)
  - BTC context aggregated from signal_enrichment (per-signal snapshot)
  - Sector data joined from coins table
  - Redis cache 120s per date

Mount in main.py:
    from app.api.routes.daily_dashboard import router as daily_dashboard_router
    app.include_router(daily_dashboard_router, prefix="/api/v1", tags=["analytics"])
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.redis import cache_get, cache_set

router = APIRouter()


# CTE: derive final outcome per signal from signal_updates (by HIT date, UTC)
OUTCOMES_CTE = """
final_outcomes AS (
    SELECT signal_id, update_at,
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
            END DESC,
            update_at DESC
        ) as rn
    FROM signal_updates
    WHERE update_type IS NOT NULL
),
resolved AS (
    SELECT signal_id, outcome, update_at, DATE(update_at) as hit_date
    FROM final_outcomes
    WHERE rn = 1 AND outcome IS NOT NULL
)
"""


def _regime_label(wr: float, total: int) -> str:
    """Map win rate to regime bucket."""
    if total == 0:
        return "no_data"
    if wr >= 75:
        return "strong"
    if wr >= 50:
        return "neutral"
    return "weak"


@router.get("/analytics/daily/dashboard")
async def get_daily_dashboard(
    date: Optional[str] = Query(None, description="YYYY-MM-DD UTC. Default = today UTC"),
    db: Session = Depends(get_db),
):
    """Daily Performance dashboard — bundled in one round-trip."""
    # ─── Parse target date ───
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    else:
        target_date = datetime.utcnow().date()

    cache_key = f"lq:daily-dashboard:{target_date.isoformat()}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    trend_start = target_date - timedelta(days=13)
    target_str = target_date.isoformat()
    trend_start_str = trend_start.isoformat()

    # ─── Q1: 14-day trend (bars + regime overlay) ───
    trend_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT hit_date::text, COUNT(*),
            SUM(CASE WHEN outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END),
            SUM(CASE WHEN outcome = 'sl' THEN 1 ELSE 0 END)
        FROM resolved
        WHERE hit_date >= :start AND hit_date <= :end
        GROUP BY hit_date
    """), {"start": trend_start_str, "end": target_str}).fetchall()

    by_date = {r[0]: (int(r[1]), int(r[2]), int(r[3])) for r in trend_rows}
    trend_14d = []
    for i in range(14):
        d = trend_start + timedelta(days=i)
        d_str = d.isoformat()
        t, w, l = by_date.get(d_str, (0, 0, 0))
        wr = round(w / t * 100, 2) if t else 0.0
        trend_14d.append({
            "date": d_str, "total": t, "wins": w, "losses": l,
            "win_rate": wr, "regime": _regime_label(wr, t),
        })

    today_data = trend_14d[-1]
    yesterday_data = trend_14d[-2] if len(trend_14d) >= 2 else {"win_rate": 0.0}

    # ─── Q2: Day signals (resolved on target_date) + enrichment + correlation + coin sector ───
    signal_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT 
            s.signal_id, s.pair, r.outcome, r.update_at,
            s.peak_pct,
            COALESCE(e.rating, 'N/A'),
            COALESCE(e.confidence_score, 0),
            COALESCE(c.sector, 'uncategorized'),
            COALESCE(c.token_type, 'unknown'),
            COALESCE(bc.is_decoupled, false),
            COALESCE(bc.is_extended, false),
            CASE WHEN bc.interpretation->>'alignment_score' ~ '^-?[0-9]+$'
                 THEN (bc.interpretation->>'alignment_score')::int
                 ELSE NULL END,
            COALESCE(array_length(e.warnings, 1), 0)
        FROM resolved r
        JOIN signals s ON s.signal_id = r.signal_id
        LEFT JOIN signal_enrichment e ON e.signal_id = s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
        LEFT JOIN coins c ON c.pair = s.pair
        WHERE r.hit_date = :d
        ORDER BY 
            CASE r.outcome WHEN 'tp4' THEN 4 WHEN 'tp3' THEN 3 
                          WHEN 'tp2' THEN 2 WHEN 'tp1' THEN 1 WHEN 'sl' THEN 0 END DESC,
            r.update_at DESC
    """), {"d": target_str}).fetchall()

    day_signals = [{
        "signal_id": r[0], "pair": r[1], "outcome": r[2],
        "outcome_at": str(r[3]) if r[3] else None,
        "peak_pct": float(r[4]) if r[4] is not None else None,
        "rating": r[5], "confidence_score": int(r[6]),
        "sector": r[7], "token_type": r[8],
        "is_decoupled": bool(r[9]), "is_extended": bool(r[10]),
        "alignment_score": int(r[11]) if r[11] is not None else None,
        "warnings_count": int(r[12]),
    } for r in signal_rows]

    # ─── Q3: Day aggregates (BTC mode, F&G, decoupled/extended counts) ───
    ctx = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.signal_id, s.pair FROM resolved r 
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        )
        SELECT
            (SELECT MODE() WITHIN GROUP (ORDER BY e.btc_trend) FROM target t
             JOIN signal_enrichment e ON e.signal_id = t.signal_id WHERE e.btc_trend IS NOT NULL),
            (SELECT MODE() WITHIN GROUP (ORDER BY e.btc_dom_trend) FROM target t
             JOIN signal_enrichment e ON e.signal_id = t.signal_id WHERE e.btc_dom_trend IS NOT NULL),
            (SELECT ROUND(AVG(e.fear_greed))::int FROM target t
             JOIN signal_enrichment e ON e.signal_id = t.signal_id WHERE e.fear_greed IS NOT NULL),
            (SELECT COUNT(*) FROM target t
             JOIN signal_btc_correlation bc ON bc.signal_id = t.signal_id WHERE bc.is_decoupled = true),
            (SELECT COUNT(*) FROM target t
             JOIN signal_btc_correlation bc ON bc.signal_id = t.signal_id WHERE bc.is_extended = true)
    """), {"d": target_str}).fetchone()

    btc_trend_mode = ctx[0]
    btc_dom_trend_mode = ctx[1]
    fear_greed_avg = int(ctx[2]) if ctx[2] is not None else None
    decoupled_count = int(ctx[3] or 0)
    extended_count = int(ctx[4] or 0)

    # ─── Q4: Sector breakdown ───
    sector_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.pair, r.outcome FROM resolved r 
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        )
        SELECT COALESCE(c.sector, 'uncategorized'),
            COUNT(*),
            SUM(CASE WHEN t.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END),
            SUM(CASE WHEN t.outcome = 'sl' THEN 1 ELSE 0 END)
        FROM target t LEFT JOIN coins c ON c.pair = t.pair
        GROUP BY COALESCE(c.sector, 'uncategorized')
        ORDER BY COUNT(*) DESC
    """), {"d": target_str}).fetchall()

    sectors = [{
        "sector": r[0], "total": int(r[1]), "wins": int(r[2]), "losses": int(r[3]),
        "win_rate": round(int(r[2]) / int(r[1]) * 100, 2) if r[1] else 0.0
    } for r in sector_rows]

    hot_sector = max(
        (s for s in sectors if s["total"] >= 2),
        key=lambda x: (x["win_rate"], x["total"]),
        default=None,
    )

    # ─── Q5: Top patterns ───
    pattern_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.signal_id FROM resolved r 
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        )
        SELECT pattern, COUNT(*) FROM target t
        JOIN signal_enrichment e ON e.signal_id = t.signal_id,
        LATERAL jsonb_array_elements_text(e.patterns_detected) AS pattern
        GROUP BY pattern ORDER BY COUNT(*) DESC LIMIT 5
    """), {"d": target_str}).fetchall()
    top_patterns = [{"name": r[0], "count": int(r[1])} for r in pattern_rows]

    # ─── Q6: Top warnings ───
    warning_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.signal_id FROM resolved r 
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        )
        SELECT warning, COUNT(*) FROM target t
        JOIN signal_enrichment e ON e.signal_id = t.signal_id,
        LATERAL unnest(e.warnings) AS warning
        WHERE e.warnings IS NOT NULL
        GROUP BY warning ORDER BY COUNT(*) DESC LIMIT 10
    """), {"d": target_str}).fetchall()
    warnings_agg = [{"warning": r[0], "count": int(r[1])} for r in warning_rows]

    # ─── Q7: BTC trend distribution ───
    dist_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.signal_id FROM resolved r 
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        )
        SELECT e.btc_trend, COUNT(*) FROM target t
        JOIN signal_enrichment e ON e.signal_id = t.signal_id
        WHERE e.btc_trend IS NOT NULL
        GROUP BY e.btc_trend
    """), {"d": target_str}).fetchall()
    btc_trend_dist = {r[0]: int(r[1]) for r in dist_rows}

    # ─── Assemble response ───
    response = {
        "selected_date": target_str,
        "today_summary": {
            "total_resolved": today_data["total"],
            "wins": today_data["wins"],
            "losses": today_data["losses"],
            "win_rate": today_data["win_rate"],
            "yesterday_win_rate": yesterday_data["win_rate"],
            "delta_vs_yesterday": round(
                today_data["win_rate"] - yesterday_data["win_rate"], 2
            ),
            "regime_label": today_data["regime"],
            "btc_trend_mode": btc_trend_mode,
            "btc_dom_trend_mode": btc_dom_trend_mode,
            "fear_greed_avg": fear_greed_avg,
            "hot_sector": hot_sector,
        },
        "day_detail": {
            "signals": day_signals,
            "context": {
                "btc_trend_distribution": btc_trend_dist,
                "btc_dom_trend_mode": btc_dom_trend_mode,
                "fear_greed_avg": fear_greed_avg,
                "sector_breakdown": sectors,
                "top_patterns": top_patterns,
                "warnings": warnings_agg,
                "decoupled_count": decoupled_count,
                "extended_count": extended_count,
            },
        },
        "trend_14d": trend_14d,
    }

    cache_set(cache_key, response, ttl=120)
    return response
