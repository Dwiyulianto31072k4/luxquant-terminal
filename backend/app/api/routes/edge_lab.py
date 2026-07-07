"""
LuxQuant Terminal - Edge Lab (multi-day analytics)
====================================================
Endpoint for /daily-performance/edge-lab page.

Returns 5 aggregate analyses across a date range (7/30/90 days):
  1. pattern_btc_heatmap    : WR per (pattern, BTC context) combination
  2. pattern_ev             : Expected Value per pattern (WR × avgWin − lossRate × avgLoss)
                              Each entry includes Wilson 95% CI bounds + reliability tier
  3. calendar_wr            : Daily WR per date for heatmap visualization
  4. pattern_calibration    : Per-pattern reliability — Wilson CI on WR, sample-size aware
                              (replaces legacy confidence_calibration which depended on
                              signal_enrichment.rating, which v3 worker no longer computes)
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
import math

from app.core.database import get_db
from app.core.redis import cache_get, cache_set, cache_get_with_stale

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


def _wilson_ci(wins: int, total: int, z: float = 1.96):
    """
    Wilson score interval for binomial proportion.
    Returns (lower_pct, upper_pct, half_width_pct) in percentage units.
    z=1.96 corresponds to 95% confidence interval.

    More accurate than naive ±sqrt(p(1-p)/n) especially for small n
    or extreme proportions (p near 0 or 1).
    Reference: https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval
    """
    if total <= 0:
        return (None, None, None)
    p = wins / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    margin = (z / denom) * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))
    lo = max(0.0, center - margin) * 100
    hi = min(1.0, center + margin) * 100
    half = (hi - lo) / 2
    return (round(lo, 2), round(hi, 2), round(half, 2))


def _reliability_tier(total: int, ci_half_width: Optional[float]) -> str:
    """
    Classify pattern reliability based on sample size and CI tightness.
      reliable   : n >= 30 AND CI half-width <= 5pp  → narrow band, robust evidence
      moderate   : n >= 10 AND CI half-width <= 12pp → directional signal, take with care
      unreliable : everything else                   → sample too small / CI too wide
    """
    if total < 10 or ci_half_width is None:
        return "unreliable"
    if total >= 30 and ci_half_width <= 5:
        return "reliable"
    if total >= 10 and ci_half_width <= 12:
        return "moderate"
    return "unreliable"


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

    cache_key = f"lq:edge-lab:v2:{days}:{sector_filter}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    # Rollover → serve recent stale instantly instead of recomputing inline
    # (prevents a burst of users all recomputing at once during a crunch).
    _stale, _ = cache_get_with_stale(cache_key)
    if _stale:
        return _stale

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

        # Wilson 95% CI on win rate
        ci_lo, ci_hi, ci_half = _wilson_ci(w, cnt)
        reliability = _reliability_tier(cnt, ci_half)

        pattern_ev.append({
            "pattern": r[0],
            "count": cnt,
            "wins": w,
            "losses": l,
            "win_rate": _wr(w, cnt),
            "win_rate_ci_lower": ci_lo,
            "win_rate_ci_upper": ci_hi,
            "win_rate_ci_half_width": ci_half,
            "reliability": reliability,
            "avg_win_peak": round(avg_win, 3) if avg_win is not None else None,
            "avg_loss_peak": round(avg_loss, 3) if avg_loss is not None else None,
            "expected_value": ev,
        })

    # ─── Q2b: Pattern Calibration (subset of pattern_ev for reliability-focused UI) ───
    # Replaces legacy confidence_calibration. Sorted by reliability tier then count.
    _tier_order = {"reliable": 0, "moderate": 1, "unreliable": 2}
    pattern_calibration = sorted(
        [{
            "pattern": p["pattern"],
            "count": p["count"],
            "win_rate": p["win_rate"],
            "win_rate_ci_lower": p["win_rate_ci_lower"],
            "win_rate_ci_upper": p["win_rate_ci_upper"],
            "win_rate_ci_half_width": p["win_rate_ci_half_width"],
            "reliability": p["reliability"],
        } for p in pattern_ev],
        key=lambda p: (_tier_order.get(p["reliability"], 99), -p["count"]),
    )

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

    # ─── Q4 (REMOVED): Confidence calibration via signal_enrichment.rating ───
    # The v3 enrichment worker no longer computes the legacy `rating` column —
    # it inserts 'N/A' as a placeholder. So we dropped that panel and built
    # `pattern_calibration` above instead, derived from pattern_ev with
    # Wilson 95% CI bounds on each pattern's win rate.

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

    # ─── Q6: Coin leaderboard — per-coin WR + peak-potential (n >= 10) ───
    coin_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, r.hit_date,
                   s.pair, s.peak_pct, c.sector
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        )
        SELECT
            pair,
            MAX(sector) AS sector,
            COUNT(*) AS n,
            COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY peak_pct)
                FILTER (WHERE peak_pct IS NOT NULL) AS median_peak,
            AVG(peak_pct) FILTER (WHERE peak_pct IS NOT NULL) AS avg_peak,
            MAX(peak_pct) AS best_peak,
            MAX(hit_date)::text AS last_signal
        FROM scoped
        GROUP BY pair
        HAVING COUNT(*) >= 10
        ORDER BY median_peak DESC NULLS LAST
        LIMIT 250
    """), params).fetchall()
    coin_leaderboard = [{
        "pair": r[0],
        "sector": r[1] or "uncategorized",
        "count": int(r[2]),
        "wins": int(r[3]),
        "win_rate": _wr(int(r[3]), int(r[2])),
        "median_peak": _safe_float(r[4]),
        "avg_peak": _safe_float(r[5]),
        "best_peak": _safe_float(r[6]),
        "last_signal": r[7],
    } for r in coin_rows]

    # ─── Assemble & cache ───
    response = {
        "date_range": {"start": start_str, "end": end_str, "days": days},
        "filters": {"sector": sector_filter},
        "totals": totals,
        "pattern_btc_heatmap": pattern_btc_heatmap,
        "pattern_ev": pattern_ev,
        "calendar_wr": calendar_wr,
        "pattern_calibration": pattern_calibration,
        "hour_dow_heatmap": hour_dow_heatmap,
        "coin_leaderboard": coin_leaderboard,
    }

    cache_set(cache_key, response, ttl=600)
    return response


# ════════════════════════════════════════════════════════════════
# DRILL — individual signals behind an aggregate bucket
# Mirrors get_edge_lab scoping (OUTCOMES_CTE + sector) so counts match.
# ════════════════════════════════════════════════════════════════
@router.get("/analytics/edge-lab/drill")
async def get_edge_lab_drill(
    dimension: str = Query(..., description="calendar_day | timing_cell | pattern | pattern_btc"),
    key: str = Query(..., description="bucket key (see edgeLabApi.getDrill)"),
    days: int = Query(30, ge=7, le=90),
    sector: str = Query("all", description="'all' or specific sector name"),
    limit: int = Query(300, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Return the individual signals inside one Edge Lab bucket."""
    if days not in (7, 30, 90):
        raise HTTPException(status_code=400, detail="days must be 7, 30, or 90")
    if dimension not in ("calendar_day", "created_day", "timing_cell", "pattern", "pattern_btc", "coin"):
        raise HTTPException(status_code=400, detail="invalid dimension")

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    end_str = end_date.isoformat()
    start_str = start_date.isoformat()
    sector_filter = sector.lower().strip()

    # Exact-day drills (chart candle clicks) may target dates far older than
    # the rolling window — widen scope start so they stay drillable.
    if dimension in ("calendar_day", "created_day"):
        try:
            key_date = datetime.strptime(key, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="key must be an ISO date (YYYY-MM-DD)")
        if key_date < start_date:
            start_date = key_date
            start_str = start_date.isoformat()
    cache_key = f"lq:edge-lab:drill:v3:{dimension}:{key}:{days}:{sector_filter}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    # Rollover → serve recent stale instantly instead of recomputing inline
    # (prevents a burst of users all recomputing at once during a crunch).
    _stale, _ = cache_get_with_stale(cache_key)
    if _stale:
        return _stale

    sector_clause = "" if sector_filter == "all" else "AND COALESCE(c.sector, 'uncategorized') = :sector"
    params = {"start": start_str, "end": end_str, "limit": limit}
    if sector_filter != "all":
        params["sector"] = sector_filter

    scoped_cte = f"""
        scoped AS (
            SELECT r.signal_id, r.outcome, r.hit_date,
                   s.pair, s.peak_pct, s.created_at,
                   NULLIF(s.created_at, '')::timestamptz AS created_ts,
                   j.overall_mfe_pct, j.overall_mae_pct,
                   j.realized_outcome_pct, j.missed_potential_pct
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            LEFT JOIN signal_journey j ON j.signal_id = r.signal_id
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        )
    """

    select_cols = "sc.signal_id::text AS signal_id, sc.pair, sc.outcome, sc.hit_date::text, sc.peak_pct, sc.created_at, sc.overall_mfe_pct, sc.overall_mae_pct, sc.realized_outcome_pct, sc.missed_potential_pct"
    order_by = (
        "ORDER BY (sc.outcome = 'sl') ASC, sc.peak_pct DESC NULLS LAST, sc.hit_date DESC "
        "LIMIT :limit"
    )

    if dimension == "coin":
        params["pair"] = key
        sql = f"""
            WITH {OUTCOMES_CTE},
            {scoped_cte}
            SELECT {select_cols}
            FROM scoped sc
            WHERE sc.pair = :pair
            {order_by}
        """
    elif dimension == "calendar_day":
        params["day"] = key
        sql = f"""
            WITH {OUTCOMES_CTE},
            {scoped_cte}
            SELECT {select_cols}
            FROM scoped sc
            WHERE sc.hit_date = CAST(:day AS date)
            {order_by}
        """
    elif dimension == "created_day":
        params["day"] = key
        sql = f"""
            WITH {OUTCOMES_CTE},
            {scoped_cte}
            SELECT {select_cols}
            FROM scoped sc
            WHERE sc.created_ts IS NOT NULL
              AND (sc.created_ts AT TIME ZONE 'UTC')::date = CAST(:day AS date)
            {order_by}
        """
    elif dimension == "timing_cell":
        try:
            hour_s, dow_s = key.split("|")
            params["hour"] = int(hour_s)
            params["dow"] = int(dow_s)
        except Exception:
            raise HTTPException(status_code=400, detail="timing_cell key must be 'HOUR|DOW'")
        sql = f"""
            WITH {OUTCOMES_CTE},
            {scoped_cte}
            SELECT {select_cols}
            FROM scoped sc
            WHERE sc.created_ts IS NOT NULL
              AND EXTRACT(HOUR FROM sc.created_ts AT TIME ZONE 'UTC')::int = :hour
              AND EXTRACT(DOW FROM sc.created_ts AT TIME ZONE 'UTC')::int = :dow
            {order_by}
        """
    else:
        # pattern dims need latest snapshot tags
        if dimension == "pattern":
            params["pattern"] = key
            btc_clause = ""
        else:  # pattern_btc -> 'PATTERN|CONTEXT'
            try:
                pat, ctx = key.rsplit("|", 1)
            except ValueError:
                raise HTTPException(status_code=400, detail="pattern_btc key must be 'PATTERN|CONTEXT'")
            params["pattern"] = pat
            ctx = ctx.upper()
            if ctx == "UNKNOWN":
                btc_clause = """
                  AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(
                        COALESCE(ls.snapshot->'tags_annotated','[]'::jsonb)) bt
                    WHERE bt->>'name' IN ('BTC_BULLISH','BTC_RANGING','BTC_BEARISH')
                  )
                """
            else:
                params["btc_name"] = f"BTC_{ctx}"
                btc_clause = """
                  AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(
                        COALESCE(ls.snapshot->'tags_annotated','[]'::jsonb)) bt
                    WHERE bt->>'name' = :btc_name
                  )
                """
        sql = f"""
            WITH {OUTCOMES_CTE},
            {scoped_cte},
            latest_snap AS (
                SELECT DISTINCT ON (h.signal_id) h.signal_id, h.snapshot
                FROM signal_enrichment_history h
                JOIN scoped sc ON sc.signal_id = h.signal_id
                ORDER BY h.signal_id, h.recorded_at DESC
            )
            SELECT {select_cols}
            FROM scoped sc
            JOIN latest_snap ls ON ls.signal_id = sc.signal_id
            WHERE EXISTS (
                SELECT 1 FROM jsonb_array_elements(
                    COALESCE(ls.snapshot->'tags_annotated','[]'::jsonb)) t
                WHERE (t->>'important')::boolean = true
                  AND t->>'name' = :pattern
            )
            {btc_clause}
            {order_by}
        """

    rows = db.execute(text(sql), params).fetchall()
    signals = [{
        "signal_id": r[0],
        "pair": r[1],
        "outcome": r[2],
        "hit_date": r[3],
        "peak_pct": _safe_float(r[4]),
        "created_at": r[5],
        "mfe_pct": _safe_float(r[6]),
        "mae_pct": _safe_float(r[7]),
        "realized_pct": _safe_float(r[8]),
        "missed_pct": _safe_float(r[9]),
    } for r in rows]

    wins = sum(1 for s in signals if s["outcome"] in ("tp1", "tp2", "tp3", "tp4"))
    total = len(signals)

    response = {
        "dimension": dimension,
        "key": key,
        "count": total,
        "wins": wins,
        "win_rate": _wr(wins, total),
        "signals": signals,
    }
    cache_set(cache_key, response, ttl=600)
    return response



# ════════════════════════════════════════════════════════════════
# TAG-WR — per-(important)-tag historical win rate + active signal map
# Descriptive only (tags overlap; not a standalone predictive signal).
# Powers Signals page: tag filter (A) + per-signal tag badges (C).
# ════════════════════════════════════════════════════════════════
@router.get("/analytics/tag-wr")
async def get_tag_wr(
    days: int = Query(90, ge=7, le=90, description="lookback for WR basis (7/30/90)"),
    min_n: int = Query(200, ge=1, le=5000, description="min resolved samples per tag"),
    db: Session = Depends(get_db),
):
    """Per-tag WR/median-peak (resolved) + active (open) signal_ids per tag."""
    if days not in (7, 30, 90):
        raise HTTPException(status_code=400, detail="days must be 7, 30, or 90")

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    end_str = end_date.isoformat()
    start_str = start_date.isoformat()

    cache_key = f"lq:edge-lab:tag-wr:v1:{days}:{min_n}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    # Rollover → serve recent stale instantly instead of recomputing inline
    # (prevents a burst of users all recomputing at once during a crunch).
    _stale, _ = cache_get_with_stale(cache_key)
    if _stale:
        return _stale

    params = {"start": start_str, "end": end_str, "min_n": min_n}

    # ─── Per-tag WR + median peak from RESOLVED signals ───
    wr_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, s.peak_pct
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            WHERE r.hit_date >= :start AND r.hit_date <= :end
        ),
        tagged AS (
            SELECT sc.signal_id, sc.outcome, sc.peak_pct, t->>'name' AS tag_name
            FROM scoped sc
            JOIN signal_enrichment e ON e.signal_id = sc.signal_id,
                 jsonb_array_elements(
                     COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                              e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
            WHERE (t->>'important')::boolean = true
        )
        SELECT tag_name,
               COUNT(*) AS n,
               COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY peak_pct)
                   FILTER (WHERE peak_pct IS NOT NULL) AS median_peak
        FROM tagged
        GROUP BY tag_name
        HAVING COUNT(*) >= :min_n
        ORDER BY (COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')))::float / NULLIF(COUNT(*),0) DESC
    """), params).fetchall()

    # ─── Active (open) signal_ids per tag ───
    active_rows = db.execute(text("""
        SELECT t->>'name' AS tag_name, s.signal_id
        FROM signals s
        JOIN signal_enrichment e ON e.signal_id = s.signal_id,
             jsonb_array_elements(
                 COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                          e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
        WHERE s.status = 'open'
          AND (t->>'important')::boolean = true
    """)).fetchall()

    active_map = {}
    for tag_name, sid in active_rows:
        active_map.setdefault(tag_name, []).append(sid)

    tags = []
    for r in wr_rows:
        tag_name = r[0]
        n = int(r[1])
        wins = int(r[2])
        tags.append({
            "tag": tag_name,
            "n": n,
            "win_rate": _wr(wins, n),
            "median_peak": _safe_float(r[3]),
            "active_signal_ids": active_map.get(tag_name, []),
            "active_count": len(active_map.get(tag_name, [])),
        })

    response = {"days": days, "min_n": min_n, "tags": tags}
    cache_set(cache_key, response, ttl=600)
    return response


# ════════════════════════════════════════════════════════════════
# WR-VS-BTC — daily LuxQuant win rate overlaid with BTC daily close
# WR source : daily_market_regime (precomputed daily by coin_intel_worker)
# BTC source: Binance spot 1d klines, Redis-cached until UTC day change
# ════════════════════════════════════════════════════════════════
@router.get("/analytics/wr-vs-btc")
async def get_wr_vs_btc(
    range: str = Query("90", description="30 | 90 | 365 | all"),
    db: Session = Depends(get_db),
):
    """Daily series: [{date, win_rate, total_closed, regime, btc_close}]."""
    if range not in ("30", "90", "365", "all"):
        raise HTTPException(status_code=400, detail="range must be 30, 90, 365, or all")

    today_str = datetime.utcnow().date().isoformat()
    cache_key = f"lq:edge-lab:wr-vs-btc:v3:{range}:{today_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    # Rollover → serve recent stale instantly instead of recomputing inline
    # (prevents a burst of users all recomputing at once during a crunch).
    _stale, _ = cache_get_with_stale(cache_key)
    if _stale:
        return _stale

    # ─── 1. WR series from daily_market_regime ───
    if range == "all":
        wr_rows = db.execute(text("""
            SELECT date, win_rate, total_closed, regime
            FROM daily_market_regime ORDER BY date ASC
        """)).fetchall()
    else:
        wr_rows = db.execute(text("""
            SELECT date, win_rate, total_closed, regime
            FROM daily_market_regime
            WHERE date >= (CURRENT_DATE - CAST(:days AS int))
            ORDER BY date ASC
        """), {"days": int(range)}).fetchall()

    wr_series = {
        r[0].isoformat(): {
            "win_rate": _safe_float(r[1]),
            "total_closed": int(r[2] or 0),
            "regime": r[3],
        } for r in wr_rows
    }

    # ─── 2. BTC daily closes from Binance (cached separately, refreshes per UTC day) ───
    btc_cache_key = f"lq:edge-lab:btc-daily:v2:{today_str}"
    btc_closes = cache_get(btc_cache_key)
    if not btc_closes:
        import httpx
        btc_closes = {}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://api.binance.com/api/v3/klines",
                    params={"symbol": "BTCUSDT", "interval": "1d", "limit": 1000},
                )
                if resp.status_code == 200:
                    for k in resp.json():
                        # k[0]=open time ms, k[1]=open, k[2]=high, k[3]=low, k[4]=close
                        day = datetime.utcfromtimestamp(k[0] / 1000).date().isoformat()
                        btc_closes[day] = {
                            "o": float(k[1]),
                            "h": float(k[2]),
                            "l": float(k[3]),
                            "c": float(k[4]),
                        }
        except Exception:
            btc_closes = {}
        if btc_closes:
            cache_set(btc_cache_key, btc_closes, ttl=86400)

    # ─── 2b. Capture rate per CREATED day (median realized / median MFE) ───
    # Same population as daily_market_regime: resolved via OUTCOMES_CTE
    # (signal_updates), grouped by created day. signal_journey LEFT JOINed
    # so journeyless rows just drop out of the medians.
    cap_series = {}
    try:
        cap_rows = db.execute(text(f"""
            WITH {OUTCOMES_CTE}
            SELECT
                (NULLIF(s.created_at, '')::timestamptz AT TIME ZONE 'UTC')::date AS d,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY j.realized_outcome_pct)
                    FILTER (WHERE j.realized_outcome_pct IS NOT NULL) AS med_realized,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY j.overall_mfe_pct)
                    FILTER (WHERE j.overall_mfe_pct > 0) AS med_mfe
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN signal_journey j ON j.signal_id = r.signal_id
            WHERE NULLIF(s.created_at, '') IS NOT NULL
            GROUP BY 1
        """)).fetchall()
        for cr in cap_rows:
            if cr[0] is None:
                continue
            cap_series[cr[0].isoformat()] = {
                "med_realized": _safe_float(cr[1]),
                "med_mfe": _safe_float(cr[2]),
            }
    except Exception:
        cap_series = {}

    # ─── 3. Merge by date (WR drives the axis; BTC may be null on gap days) ───
    series = []
    for day in sorted(wr_series.keys()):
        w = wr_series[day]
        b = btc_closes.get(day) or {}
        cap = cap_series.get(day) or {}
        series.append({
            "date": day,
            "win_rate": w["win_rate"],
            "total_closed": w["total_closed"],
            "regime": w["regime"],
            "btc_open": b.get("o"),
            "btc_high": b.get("h"),
            "btc_low": b.get("l"),
            "btc_close": b.get("c"),
            "med_mfe": cap.get("med_mfe"),
            "med_realized": cap.get("med_realized"),
        })

    response = {
        "range": range,
        "count": len(series),
        "btc_available": bool(btc_closes),
        "series": series,
    }
    cache_set(cache_key, response, ttl=21600)  # 6h; key already rotates daily
    return response
