"""
LuxQuant Terminal - Edge Lab (multi-day analytics)
====================================================
Endpoint for /daily-performance/edge-lab page.

Returns 5 aggregate analyses across a date range (7/30/90 days):
  1. pattern_btc_heatmap    : WR per (pattern, BTC context) combination
  2. pattern_ev             : Expected Value per pattern (WR × avgWin − lossRate × avgLoss)
  3. calendar_wr            : Daily WR per date for heatmap visualization
  4. confidence_calibration : WR per rating bucket (A/B/C/D from signal_enrichment)
  5. hour_dow_heatmap       : WR per (hour_utc, day_of_week) of signal CREATION
                              (used for entry-timing guidance)

Semantics:
  - All dates UTC
  - WR computed by HIT date (signal_updates.update_at)
  - Patterns from snapshot.tags_annotated[] where important=true and NOT 'BTC_*'
  - BTC context from same tags_annotated[] where name LIKE 'BTC_%' (BULLISH/RANGING/BEARISH)
  - sector='all' returns everything; specific sector filters via coins.sector
  - Redis cache 600s (10 min) — multi-day data doesn't need realtime freshness

Mount in main.py:
    from app.api.routes import edge_lab
    app.include_router(edge_lab.router, prefix="/api/v1", tags=["analytics"])
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.redis import cache_get, cache_set

router = APIRouter()


# Outcome resolution CTE — copied from daily_dashboard.py for consistency
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


def _wr(wins: int, total: int):
    return round(wins / total * 100, 2) if total else None


def _safe_float(v):
    return float(v) if v is not None else None


@router.get("/analytics/edge-lab")
async def get_edge_lab(
    days: int = Query(30, ge=7, le=90, description="7, 30, or 90"),
    sector: str = Query("all", description="'all' or specific sector name"),
    db: Session = Depends(get_db),
):
    """Edge Lab multi-day aggregates."""
    # Validate days to known presets (7/30/90)
    if days not in (7, 30, 90):
        raise HTTPException(status_code=400, detail="days must be 7, 30, or 90")

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    end_str = end_date.isoformat()
    start_str = start_date.isoformat()
    sector_filter = sector.lower().strip()

    cache_key = f"lq:edge-lab:v1:{days}:{sector_filter}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    # ─── Common params + sector WHERE clause helper ───
    sector_clause = "" if sector_filter == "all" else "AND COALESCE(c.sector, 'uncategorized') = :sector"
    params = {"start": start_str, "end": end_str}
    if sector_filter != "all":
        params["sector"] = sector_filter

    # ─── Q0: Totals & coverage ───
    totals_row = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, r.hit_date, s.pair
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        )
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE outcome = 'sl') AS losses,
            (SELECT COUNT(DISTINCT h.signal_id)
             FROM scoped sc
             JOIN signal_enrichment_history h ON h.signal_id = sc.signal_id) AS enriched,
            (SELECT COUNT(*)
             FROM scoped sc
             JOIN signal_btc_correlation bc ON bc.signal_id = sc.signal_id) AS with_corr
        FROM scoped
    """), params).fetchone()

    total = int(totals_row[0] or 0)
    wins = int(totals_row[1] or 0)
    losses = int(totals_row[2] or 0)
    enriched = int(totals_row[3] or 0)
    with_corr = int(totals_row[4] or 0)

    totals = {
        "signals_resolved": total,
        "wins": wins,
        "losses": losses,
        "win_rate": _wr(wins, total),
        "enrichment_pct": round(enriched / total * 100, 1) if total else None,
        "correlation_pct": round(with_corr / total * 100, 1) if total else None,
    }

    # ─── Q1: Pattern × BTC heatmap ───
    # For each signal in range, pull non-BTC important_tags as "pattern"
    # and BTC_* tag as "btc_context". Aggregate WR per (pattern, btc_context).
    heatmap_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        ),
        latest_snap AS (
            SELECT DISTINCT ON (h.signal_id) h.signal_id, h.snapshot
            FROM signal_enrichment_history h
            JOIN scoped sc ON sc.signal_id = h.signal_id
            ORDER BY h.signal_id, h.recorded_at DESC
        ),
        signal_patterns AS (
            SELECT
                sc.signal_id,
                sc.outcome,
                tag_obj->>'name' AS pattern
            FROM scoped sc
            JOIN latest_snap ls ON ls.signal_id = sc.signal_id,
            LATERAL jsonb_array_elements(COALESCE(ls.snapshot->'tags_annotated', '[]'::jsonb)) AS tag_obj
            WHERE (tag_obj->>'important')::boolean = true
              AND tag_obj->>'name' NOT LIKE 'BTC_%'
        ),
        signal_btc AS (
            SELECT
                sc.signal_id,
                CASE
                    WHEN btc_obj->>'name' = 'BTC_BULLISH' THEN 'BULLISH'
                    WHEN btc_obj->>'name' = 'BTC_RANGING' THEN 'RANGING'
                    WHEN btc_obj->>'name' = 'BTC_BEARISH' THEN 'BEARISH'
                END AS btc_context
            FROM scoped sc
            JOIN latest_snap ls ON ls.signal_id = sc.signal_id,
            LATERAL jsonb_array_elements(COALESCE(ls.snapshot->'tags_annotated', '[]'::jsonb)) AS btc_obj
            WHERE btc_obj->>'name' IN ('BTC_BULLISH', 'BTC_RANGING', 'BTC_BEARISH')
        )
        SELECT
            sp.pattern,
            COALESCE(sb.btc_context, 'UNKNOWN') AS btc_context,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE sp.outcome IN ('tp1','tp2','tp3','tp4')) AS wins
        FROM signal_patterns sp
        LEFT JOIN signal_btc sb ON sb.signal_id = sp.signal_id
        GROUP BY sp.pattern, COALESCE(sb.btc_context, 'UNKNOWN')
        HAVING COUNT(*) >= 3
        ORDER BY sp.pattern, btc_context
    """), params).fetchall()

    pattern_btc_heatmap = [{
        "pattern": r[0],
        "btc_context": r[1],
        "count": int(r[2]),
        "wins": int(r[3]),
        "win_rate": _wr(int(r[3]), int(r[2])),
    } for r in heatmap_rows]

    # ─── Q2: Expected Value per pattern ───
    # EV = (win_rate × avg_win_peak) − (loss_rate × abs(avg_loss_peak))
    # peak_pct on signals is the realized peak gain (signed)
    ev_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, s.peak_pct
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        ),
        latest_snap AS (
            SELECT DISTINCT ON (h.signal_id) h.signal_id, h.snapshot
            FROM signal_enrichment_history h
            JOIN scoped sc ON sc.signal_id = h.signal_id
            ORDER BY h.signal_id, h.recorded_at DESC
        ),
        signal_patterns AS (
            SELECT
                sc.signal_id,
                sc.outcome,
                sc.peak_pct,
                tag_obj->>'name' AS pattern
            FROM scoped sc
            JOIN latest_snap ls ON ls.signal_id = sc.signal_id,
            LATERAL jsonb_array_elements(COALESCE(ls.snapshot->'tags_annotated', '[]'::jsonb)) AS tag_obj
            WHERE (tag_obj->>'important')::boolean = true
              AND tag_obj->>'name' NOT LIKE 'BTC_%'
        )
        SELECT
            pattern,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE outcome = 'sl') AS losses,
            AVG(peak_pct) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4'))::float AS avg_win_peak,
            AVG(peak_pct) FILTER (WHERE outcome = 'sl')::float AS avg_loss_peak
        FROM signal_patterns
        GROUP BY pattern
        HAVING COUNT(*) >= 5
        ORDER BY COUNT(*) DESC
    """), params).fetchall()

    pattern_ev = []
    for r in ev_rows:
        cnt = int(r[1])
        w = int(r[2])
        l = int(r[3])
        avg_win = _safe_float(r[4])
        avg_loss = _safe_float(r[5])
        wr_pct = w / cnt if cnt else 0
        lr_pct = l / cnt if cnt else 0
        # EV per trade in % terms: (WR × avg_win) + (LR × avg_loss)  [avg_loss is negative already]
        # Non-resolved (neither tp* nor sl) treated as 0 contribution
        ev = None
        if avg_win is not None and avg_loss is not None:
            ev = round(wr_pct * avg_win + lr_pct * avg_loss, 3)
        elif avg_win is not None:
            ev = round(wr_pct * avg_win, 3)
        elif avg_loss is not None:
            ev = round(lr_pct * avg_loss, 3)

        pattern_ev.append({
            "pattern": r[0],
            "count": cnt,
            "wins": w,
            "losses": l,
            "win_rate": _wr(w, cnt),
            "avg_win_peak": round(avg_win, 3) if avg_win is not None else None,
            "avg_loss_peak": round(avg_loss, 3) if avg_loss is not None else None,
            "expected_value": ev,
        })

    # ─── Q3: Calendar WR (daily breakdown for heatmap) ───
    calendar_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.hit_date, r.outcome
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        )
        SELECT
            hit_date::text,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins
        FROM scoped
        GROUP BY hit_date
        ORDER BY hit_date
    """), params).fetchall()

    # Build full date series so frontend gets continuous data
    by_date = {r[0]: (int(r[1]), int(r[2])) for r in calendar_rows}
    calendar_wr = []
    cur = start_date
    while cur <= end_date:
        ds = cur.isoformat()
        t, w = by_date.get(ds, (0, 0))
        calendar_wr.append({
            "date": ds,
            "total": t,
            "wins": w,
            "win_rate": _wr(w, t),
        })
        cur += timedelta(days=1)

    # ─── Q4: Confidence calibration (rating bucket WR) ───
    calibration_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, e.rating
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            LEFT JOIN signal_enrichment e ON e.signal_id = r.signal_id
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
              AND e.rating IS NOT NULL
              AND e.rating <> 'N/A'
        )
        SELECT
            rating,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE outcome = 'sl') AS losses
        FROM scoped
        GROUP BY rating
        ORDER BY rating
    """), params).fetchall()

    confidence_calibration = [{
        "rating": r[0],
        "count": int(r[1]),
        "wins": int(r[2]),
        "losses": int(r[3]),
        "win_rate": _wr(int(r[2]), int(r[1])),
    } for r in calibration_rows]

    # ─── Q5: Hour × Day-of-Week heatmap (signal CREATION time) ───
    # Use signals.created_at parsed to timestamp; some rows have it as text — cast safely
    hour_dow_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT
                r.signal_id,
                r.outcome,
                NULLIF(s.created_at, '')::timestamptz AS created_ts
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        )
        SELECT
            EXTRACT(HOUR FROM created_ts AT TIME ZONE 'UTC')::int AS hour,
            EXTRACT(DOW FROM created_ts AT TIME ZONE 'UTC')::int AS dow,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins
        FROM scoped
        WHERE created_ts IS NOT NULL
        GROUP BY EXTRACT(HOUR FROM created_ts AT TIME ZONE 'UTC')::int,
                 EXTRACT(DOW FROM created_ts AT TIME ZONE 'UTC')::int
        ORDER BY dow, hour
    """), params).fetchall()

    hour_dow_heatmap = [{
        "hour": int(r[0]),  # 0-23 UTC
        "dow": int(r[1]),   # 0=Sun, 1=Mon, ..., 6=Sat (Postgres DOW)
        "count": int(r[2]),
        "wins": int(r[3]),
        "win_rate": _wr(int(r[3]), int(r[2])),
    } for r in hour_dow_rows]

    # ─── Assemble & cache ───
    response = {
        "date_range": {"start": start_str, "end": end_str, "days": days},
        "filters": {"sector": sector_filter},
        "totals": totals,
        "pattern_btc_heatmap": pattern_btc_heatmap,
        "pattern_ev": pattern_ev,
        "calendar_wr": calendar_wr,
        "confidence_calibration": confidence_calibration,
        "hour_dow_heatmap": hour_dow_heatmap,
    }

    cache_set(cache_key, response, ttl=600)
    return response
