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
from typing import Optional, Tuple
from datetime import datetime, timedelta, date
import math

from app.core.database import get_db
from app.core.redis import cache_get, cache_set, cache_get_with_stale
from app.services.hunt_recipe import (
    RUNNER_MIN_FULL,
    RUNNER_MIN_N,
    RUNNER_MIN_PEAK,
    RUNNER_MIN_TP4,
    RUNNER_MIN_WR,
    RUNNER_TOP_K,
    mix_delta,
    outcome_mix,
    select_runner_tags,
)

router = APIRouter()

# ── Tag-metrics era ──────────────────────────────────────────────────────────
# Production signals go back to 2023-12, but entry_snapshot.tags_annotated
# (important tags used by Edge Score / tag-WR / edge-correlation) only became
# consistently populated from ~2026-03-10 (v3.0-pit enrichment).
# Weekly coverage: 2026-03-09 ≈74%, 2026-03-16+ ≈99%. Pre-March 2026 ≈0%.
# Learning windows must not pretend Dec-2023–Feb-2026 has tag structure.
TAG_METRICS_ERA_START = date(2026, 3, 10)


def _resolve_tag_lookback(days: int) -> Tuple[date, date, int]:
    """
    Resolve [start, end] for tag-based learning.
    days=0 → all available since TAG_METRICS_ERA_START.
    Otherwise rolling N days, clamped so start never precedes the tag era.
    """
    end_date = datetime.utcnow().date()
    if days == 0:
        start_date = TAG_METRICS_ERA_START
    else:
        start_date = end_date - timedelta(days=days - 1)
        if start_date < TAG_METRICS_ERA_START:
            start_date = TAG_METRICS_ERA_START
    effective_days = max(1, (end_date - start_date).days + 1)
    return start_date, end_date, effective_days


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


def _eb_rate(wins: int, n: int, prior_p: float, strength: float = 40.0) -> Optional[float]:
    """
    Empirical-Bayes / Beta-Binomial shrink of a binomial rate toward prior_p.
    strength = pseudo-count mass (higher = stronger shrink for small n).
    Returns rate in [0,1]. Journal-aligned alternative to raw MLE win rates.
    """
    if n is None or n < 0:
        return None
    prior_p = min(1.0, max(0.0, float(prior_p or 0)))
    a = prior_p * strength
    b = (1.0 - prior_p) * strength
    return (float(wins or 0) + a) / (float(n) + a + b)


def _r_ladder(entry, stop1, t1, t2, t3, t4) -> Optional[dict]:
    """R-multiples of TP ladder vs |entry-stop| risk unit. Long-biased (call side)."""
    try:
        e = float(entry)
        s = float(stop1)
        risk = abs(e - s)
        if risk <= 0 or e <= 0:
            return None
        out = {}
        for name, raw in (("r1", t1), ("r2", t2), ("r3", t3), ("r4", t4)):
            if raw is None:
                continue
            out[name] = abs(float(raw) - e) / risk
        return out or None
    except (TypeError, ValueError):
        return None


def _expectancy_proxy(hist_full_rate: float, hist_wr: float, r_ladder: Optional[dict]) -> Optional[float]:
    """
    Rough expectancy in R: p_full*avg(R3,R4) + p_partial*R1 - p_sl*1.
    Uses tag-history rates as probabilities; R from this signal's levels.
    """
    if hist_wr is None:
        return None
    p_win = float(hist_wr) / 100.0
    p_full = float(hist_full_rate or 0) / 100.0
    p_sl = max(0.0, 1.0 - p_win)
    r1 = (r_ladder or {}).get("r1") or 1.0
    r_full = None
    if r_ladder:
        rs = [r_ladder[k] for k in ("r3", "r4", "r2") if k in r_ladder]
        r_full = sum(rs) / len(rs) if rs else r_ladder.get("r2") or r1
    else:
        r_full = 2.5
    p_partial = max(0.0, p_win - p_full)
    exp_r = p_full * float(r_full) + p_partial * float(r1) - p_sl * 1.0
    return round(exp_r, 3)


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
def get_edge_lab(
    days: int = Query(30, ge=0, le=90, description="0 = sepanjang waktu, atau 7, 30, 90"),
    sector: str = Query("all", description="'all' or specific sector name"),
    db: Session = Depends(get_db),
):
    """Edge Lab multi-day aggregates."""
    # Preset yang diizinkan. `0` = SEPANJANG WAKTU, ditambahkan karena landing
    # menampilkan win rate per-coin di dua tempat (preview pencarian dan kartu
    # detail) dan kartu itu memakai angka sepanjang waktu. Tanpa opsi ini
    # preview terkunci 90 hari, sehingga coin yang menang 11 dari 11 panggilan
    # terakhir tampil 100% tepat di sebelah kartunya yang menyebut 89,1%.
    if days not in (0, 7, 30, 90):
        raise HTTPException(status_code=400, detail="days must be 0, 7, 30, or 90")

    end_date = datetime.utcnow().date()
    # Sinyal pertama Desember 2023; 2015 memberi margin tanpa kueri tambahan.
    start_date = (
        datetime(2015, 1, 1).date() if days == 0 else end_date - timedelta(days=days - 1)
    )
    end_str = end_date.isoformat()
    start_str = start_date.isoformat()
    sector_filter = sector.lower().strip()

    # v3: coin_leaderboard now carries median_peak_lag_days, so the UI can say how
    #     long after the call each coin's median peak arrives.
    # v4: pattern_ev now carries a realized EV alongside the peak one.
    # Bumped so cached payloads missing these fields are not served to clients
    # that expect them.
    cache_key = f"lq:edge-lab:v4:{days}:{sector_filter}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    # Rollover → serve recent stale instantly instead of recomputing inline
    # (prevents a burst of users all recomputing at once during a crunch).
    _stale, _ = cache_get_with_stale(cache_key)
    if _stale:
        return _stale
    # Daily key includes end_str, so midnight looks like a cold start. Serve
    # yesterday's payload rather than making the first visitor wait ~40s.
    if days:
        yday = (end_date - timedelta(days=1)).isoformat()
        prev = cache_get(f"lq:edge-lab:v4:{days}:{sector_filter}:{yday}")
        if prev:
            return prev

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
    # Two EVs, because they answer different questions and only one of them is a
    # return anybody could have booked:
    #
    #   realized — the gain at the level the outcome actually reached: the TP that
    #              was hit, or the stop. What exiting to plan pays.
    #   peak     — the same formula over peak_pct, the coin's high after the call.
    #              An upper bound: the median peak lands ~13 days out while trades
    #              resolve inside 5, so much of it is post-trade.
    #
    # realized is the headline; peak is shown beside it as the ceiling.
    ev_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, s.peak_pct,
                   CASE r.outcome
                     WHEN 'tp4' THEN (s.target4 - s.entry) / NULLIF(s.entry, 0) * 100
                     WHEN 'tp3' THEN (s.target3 - s.entry) / NULLIF(s.entry, 0) * 100
                     WHEN 'tp2' THEN (s.target2 - s.entry) / NULLIF(s.entry, 0) * 100
                     WHEN 'tp1' THEN (s.target1 - s.entry) / NULLIF(s.entry, 0) * 100
                     WHEN 'sl'  THEN (s.stop1   - s.entry) / NULLIF(s.entry, 0) * 100
                   END AS realized_pct
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
                sc.realized_pct,
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
            AVG(peak_pct) FILTER (WHERE outcome = 'sl')::float AS avg_loss_peak,
            AVG(realized_pct) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4'))::float AS avg_win_realized,
            AVG(realized_pct) FILTER (WHERE outcome = 'sl')::float AS avg_loss_realized
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
        avg_win_real = _safe_float(r[6])
        avg_loss_real = _safe_float(r[7])
        wr_pct = w / cnt if cnt else 0
        lr_pct = l / cnt if cnt else 0

        # EV per trade in % terms: (WR × avg_win) + (LR × avg_loss)  [avg_loss is
        # negative already]. Non-resolved (neither tp* nor sl) contribute 0.
        def _ev(win, loss):
            if win is not None and loss is not None:
                return round(wr_pct * win + lr_pct * loss, 3)
            if win is not None:
                return round(wr_pct * win, 3)
            if loss is not None:
                return round(lr_pct * loss, 3)
            return None

        ev = _ev(avg_win, avg_loss)
        ev_realized = _ev(avg_win_real, avg_loss_real)

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
            "avg_win_realized": round(avg_win_real, 3) if avg_win_real is not None else None,
            "avg_loss_realized": round(avg_loss_real, 3) if avg_loss_real is not None else None,
            # expected_value keeps its original peak-based meaning so existing
            # consumers do not silently change; expected_value_peak is the same
            # number under an honest name, and expected_value_realized is what a
            # follower exiting to plan would actually have booked.
            "expected_value": ev,
            "expected_value_peak": ev,
            "expected_value_realized": ev_realized,
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
                   s.pair, s.peak_pct, c.sector,
                   -- Carried so the leaderboard can say how long after the call
                   -- each coin's median peak arrives. A peak column on its own
                   -- invites the reader to assume it happened while in position.
                   EXTRACT(EPOCH FROM (s.peak_at - s.created_at::timestamptz))/86400
                       AS peak_lag_days
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
            MAX(hit_date)::text AS last_signal,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY peak_lag_days)
                FILTER (WHERE peak_lag_days IS NOT NULL AND peak_lag_days >= 0)
                AS median_peak_lag_days
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
        "median_peak_lag_days": _safe_float(r[8]),
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
def get_edge_lab_drill(
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
    # v4: include entry/targets/status for public track-record proof modals
    # v5: response now carries peak_at (post-stop recovery timing). Bump so the
    # 10-min-cached v4 rows without the field expire immediately.
    cache_key = f"lq:edge-lab:drill:v5:{dimension}:{key}:{days}:{sector_filter}:{end_str}"
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

    # Resolved signals only (OUTCOMES_CTE) — safe to expose entry/targets for audit.
    # These are historical hits, not live open-actionable calls.
    scoped_cte = f"""
        scoped AS (
            SELECT r.signal_id, r.outcome, r.hit_date,
                   s.pair, s.peak_pct, s.created_at,
                   NULLIF(s.created_at, '')::timestamptz AS created_ts,
                   j.overall_mfe_pct, j.overall_mae_pct,
                   j.realized_outcome_pct, j.missed_potential_pct,
                   s.entry, s.target1, s.target2, s.target3, s.target4,
                   s.stop1, s.stop2, s.status, s.risk_level,
                   s.entry_chart_path, s.latest_chart_path, s.message_link,
                   s.peak_at
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            LEFT JOIN coins c ON c.pair = s.pair
            LEFT JOIN signal_journey j ON j.signal_id = r.signal_id
            WHERE r.hit_date >= :start AND r.hit_date <= :end
            {sector_clause}
        )
    """

    select_cols = (
        "sc.signal_id::text AS signal_id, sc.pair, sc.outcome, sc.hit_date::text, "
        "sc.peak_pct, sc.created_at, sc.overall_mfe_pct, sc.overall_mae_pct, "
        "sc.realized_outcome_pct, sc.missed_potential_pct, "
        "sc.entry, sc.target1, sc.target2, sc.target3, sc.target4, "
        "sc.stop1, sc.stop2, sc.status, sc.risk_level, "
        "sc.entry_chart_path, sc.latest_chart_path, sc.message_link, "
        "sc.peak_at::text"
    )
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

    def _chart_url(path):
        if not path:
            return None
        try:
            from app.utils.chart_urls import chart_path_to_url
            return chart_path_to_url(path)
        except Exception:
            # Fallback: serve via charts path if helper unavailable
            p = str(path)
            if p.startswith("http"):
                return p
            return f"/api/v1/charts/{p.lstrip('/')}" if p else None

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
        # Public proof fields — resolved-only, safe for track-record audit
        "entry": _safe_float(r[10]),
        "target1": _safe_float(r[11]),
        "target2": _safe_float(r[12]),
        "target3": _safe_float(r[13]),
        "target4": _safe_float(r[14]),
        "stop1": _safe_float(r[15]),
        "stop2": _safe_float(r[16]),
        "status": r[17],
        "risk_level": r[18],
        "entry_chart_url": _chart_url(r[19]),
        "latest_chart_url": _chart_url(r[20]),
        "message_link": r[21],
        # peak_at = when the all-time high was reached. For a stopped trade the
        # frontend uses it to show an honest "recovered +X%, N days after the
        # stop" line — the run-up happened after the position closed.
        "peak_at": r[22],
    } for r in rows]

    wins = sum(1 for s in signals if s["outcome"] in ("tp1", "tp2", "tp3", "tp4"))
    total = len(signals)
    losses = sum(1 for s in signals if s["outcome"] == "sl")

    response = {
        "dimension": dimension,
        "key": key,
        "count": total,
        "wins": wins,
        "losses": losses,
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
def get_tag_wr(
    days: int = Query(
        0,
        ge=0,
        le=400,
        description="lookback days; 0 = all since tag-metrics era (2026-03-10)",
    ),
    min_n: int = Query(40, ge=1, le=5000, description="min resolved samples per tag"),
    db: Session = Depends(get_db),
):
    """Per-tag WR/median-peak (resolved) + active (open) signal_ids per tag."""
    if not (0 <= days <= 400):
        raise HTTPException(
            status_code=400,
            detail="days must be 0 (all since tags) or 1–400",
        )

    start_date, end_date, effective_days = _resolve_tag_lookback(days)
    end_str = end_date.isoformat()
    start_str = start_date.isoformat()

    # v4: EB-shrink + Wilson for Edge Score v2 client
    cache_key = f"lq:edge-lab:tag-wr:v4:{days}:{min_n}:{start_str}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    _stale, _ = cache_get_with_stale(cache_key)
    if _stale:
        return _stale

    params = {"start": start_str, "end": end_str, "min_n": min_n}

    base = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT COUNT(*) AS n,
               COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
               COUNT(*) FILTER (WHERE outcome IN ('tp3','tp4')) AS full_n
        FROM resolved r
        WHERE r.hit_date >= :start AND r.hit_date <= :end
    """), {"start": start_str, "end": end_str}).one()
    base_n = int(base[0] or 0)
    base_wins = int(base[1] or 0)
    base_full = int(base[2] or 0)
    base_wr = _wr(base_wins, base_n) or 80
    base_wr_p = (base_wins / base_n) if base_n else 0.8
    base_full_p = (base_full / base_n) if base_n else 0.35

    wr_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, s.peak_pct
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            WHERE r.hit_date >= :start AND r.hit_date <= :end
        ),
        tagged AS (
            SELECT sc.signal_id, sc.outcome, sc.peak_pct, t->>'name' AS tag_name,
                   j.time_to_tp1_seconds
            FROM scoped sc
            JOIN signal_enrichment e ON e.signal_id = sc.signal_id
            LEFT JOIN signal_journey j ON j.signal_id = sc.signal_id,
                 jsonb_array_elements(
                     COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                              e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
            WHERE (t->>'important')::boolean = true
        )
        SELECT tag_name,
               COUNT(*) AS n,
               COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
               COUNT(*) FILTER (WHERE outcome = 'tp4') AS tp4_n,
               COUNT(*) FILTER (WHERE outcome IN ('tp3','tp4')) AS full_tp_n,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY peak_pct)
                   FILTER (WHERE peak_pct IS NOT NULL) AS median_peak,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY peak_pct)
                   FILTER (WHERE peak_pct IS NOT NULL
                           AND outcome IN ('tp1','tp2','tp3','tp4')) AS median_peak_wins,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_tp1_seconds)
                   FILTER (WHERE time_to_tp1_seconds IS NOT NULL
                           AND outcome IN ('tp1','tp2','tp3','tp4')) AS median_tt_tp1_sec
        FROM tagged
        GROUP BY tag_name
        HAVING COUNT(*) >= :min_n
        ORDER BY (COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')))::float
                 / NULLIF(COUNT(*),0) DESC
    """), params).fetchall()

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
        tp4_n = int(r[3] or 0)
        full_tp_n = int(r[4] or 0)
        wr = _wr(wins, n)
        full_rate = _wr(full_tp_n, n)
        wr_lo, wr_hi, wr_half = _wilson_ci(wins, n)
        wr_shrunk_p = _eb_rate(wins, n, base_wr_p, 40.0)
        full_shrunk_p = _eb_rate(full_tp_n, n, base_full_p, 40.0)
        wr_shrunk = round(wr_shrunk_p * 100, 2) if wr_shrunk_p is not None else wr
        full_shrunk = round(full_shrunk_p * 100, 2) if full_shrunk_p is not None else full_rate
        tags.append({
            "tag": tag_name,
            "n": n,
            "wins": wins,
            "win_rate": wr,
            "win_rate_shrunk": wr_shrunk,
            "win_rate_wilson_lo": wr_lo,
            "win_rate_wilson_hi": wr_hi,
            "win_rate_wilson_half": wr_half,
            "tp4_n": tp4_n,
            "tp4_rate": _wr(tp4_n, n),
            "full_tp_n": full_tp_n,
            "full_tp_rate": full_rate,
            "full_tp_rate_shrunk": full_shrunk,
            "median_peak": _safe_float(r[5]),
            "median_peak_wins": _safe_float(r[6]),
            "median_tt_tp1_sec": _safe_float(r[7]),
            "lift_pp": round(wr - base_wr, 2) if wr is not None else None,
            "lift_shrunk_pp": round(wr_shrunk - base_wr, 2) if wr_shrunk is not None else None,
            "reliability": _reliability_tier(n, wr_half),
            "active_signal_ids": active_map.get(tag_name, []),
            "active_count": len(active_map.get(tag_name, [])),
        })

    response = {
        "days": days,
        "effective_days": effective_days,
        "min_n": min_n,
        "window": {"start": start_str, "end": end_str},
        "tag_era_start": TAG_METRICS_ERA_START.isoformat(),
        "baseline_wr": base_wr,
        "score_version": "v2",
        "tags": tags,
    }
    cache_set(cache_key, response, ttl=600)
    return response


# ════════════════════════════════════════════════════════════════
# EDGE-CORRELATION — learn from PAST resolved signals (lookback),
# then rank CURRENT open signals for selection.
# Powers Signals "Correlation insights" (not desk-only 7d).
# ════════════════════════════════════════════════════════════════
@router.get("/analytics/edge-correlation")
def get_edge_correlation(
    days: int = Query(
        0,
        ge=0,
        le=400,
        description="historical lookback; 0 = all since tag-metrics era (2026-03-10)",
    ),
    min_n: int = Query(40, ge=10, le=2000, description="min samples per tag cohort"),
    db: Session = Depends(get_db),
):
    """
    Historical tag/risk outcome rates + scored open signals.
    Learn from the past → help pick current open calls.

    Tag metrics (important tags_annotated) exist reliably only since
    TAG_METRICS_ERA_START (~2026-03-10). days=0 uses that full era.
    """
    if not (0 <= days <= 400):
        raise HTTPException(
            status_code=400,
            detail="days must be 0 (all since tags) or 1–400",
        )

    start_date, end_date, effective_days = _resolve_tag_lookback(days)
    end_str = end_date.isoformat()
    start_str = start_date.isoformat()

    # v5 = Edge Score v2 (EB-shrink + Wilson + multi-factor open score)
    cache_key = f"lq:edge-lab:corr:v5:{days}:{min_n}:{start_str}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    _stale, _ = cache_get_with_stale(cache_key)
    if _stale:
        return _stale

    params = {"start": start_str, "end": end_str, "min_n": min_n}

    # ── Baseline resolved outcomes (past) ──
    base = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT
            COUNT(*) AS n,
            COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE outcome = 'sl') AS losses,
            COUNT(*) FILTER (WHERE outcome = 'tp4') AS tp4_n,
            COUNT(*) FILTER (WHERE outcome IN ('tp3','tp4')) AS full_n
        FROM resolved r
        WHERE r.hit_date >= :start AND r.hit_date <= :end
    """), {"start": start_str, "end": end_str}).one()

    base_n = int(base[0] or 0)
    base_wins = int(base[1] or 0)
    base_losses = int(base[2] or 0)
    base_tp4 = int(base[3] or 0)
    base_full = int(base[4] or 0)
    base_wr = _wr(base_wins, base_n) or 0
    base_full_rate = _wr(base_full, base_n) or 0
    base_wr_p = (base_wins / base_n) if base_n else 0.8
    base_full_p = (base_full / base_n) if base_n else 0.35
    baseline = {
        "n": base_n,
        "wins": base_wins,
        "losses": base_losses,
        "win_rate": base_wr,
        "loss_rate": _wr(base_losses, base_n),
        "tp4_rate": _wr(base_tp4, base_n),
        "full_tp_rate": base_full_rate,
        "score_version": "v2",
    }

    # ── Per-tag historical rates (+ median time-to-TP1 when journey exists) ──
    tag_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            SELECT r.signal_id, r.outcome, s.peak_pct
            FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id
            WHERE r.hit_date >= :start AND r.hit_date <= :end
        ),
        tagged AS (
            SELECT sc.signal_id, sc.outcome, sc.peak_pct, t->>'name' AS tag_name,
                   j.time_to_tp1_seconds
            FROM scoped sc
            JOIN signal_enrichment e ON e.signal_id = sc.signal_id
            LEFT JOIN signal_journey j ON j.signal_id = sc.signal_id,
                 jsonb_array_elements(
                     COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                              e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
            WHERE (t->>'important')::boolean = true
              AND NULLIF(TRIM(t->>'name'), '') IS NOT NULL
        )
        SELECT tag_name,
               COUNT(*) AS n,
               COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
               COUNT(*) FILTER (WHERE outcome = 'sl') AS losses,
               COUNT(*) FILTER (WHERE outcome = 'tp4') AS tp4_n,
               COUNT(*) FILTER (WHERE outcome IN ('tp3','tp4')) AS full_n,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY peak_pct)
                   FILTER (WHERE peak_pct IS NOT NULL
                           AND outcome IN ('tp1','tp2','tp3','tp4')) AS median_peak_wins,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_tp1_seconds)
                   FILTER (WHERE time_to_tp1_seconds IS NOT NULL
                           AND outcome IN ('tp1','tp2','tp3','tp4')) AS median_tt_tp1_sec
        FROM tagged
        GROUP BY tag_name
        HAVING COUNT(*) >= :min_n
        ORDER BY (COUNT(*) FILTER (WHERE outcome IN ('tp1','tp2','tp3','tp4')))::float
                 / NULLIF(COUNT(*),0) DESC
        LIMIT 80
    """), params).fetchall()

    tags = []
    for r in tag_rows:
        n = int(r[1])
        wins = int(r[2] or 0)
        losses = int(r[3] or 0)
        full_n = int(r[5] or 0)
        wr = _wr(wins, n)
        full_rate = _wr(full_n, n)
        wr_lo, wr_hi, wr_half = _wilson_ci(wins, n)
        full_lo, full_hi, full_half = _wilson_ci(full_n, n)
        wr_shrunk_p = _eb_rate(wins, n, base_wr_p, 40.0)
        full_shrunk_p = _eb_rate(full_n, n, base_full_p, 40.0)
        wr_shrunk = round(wr_shrunk_p * 100, 2) if wr_shrunk_p is not None else wr
        full_shrunk = round(full_shrunk_p * 100, 2) if full_shrunk_p is not None else full_rate
        lift = round(wr - base_wr, 2) if wr is not None else None
        lift_shrunk = round(wr_shrunk - base_wr, 2) if wr_shrunk is not None else lift
        tags.append({
            "tag": r[0],
            "n": n,
            "wins": wins,
            "losses": losses,
            "win_rate": wr,
            "win_rate_shrunk": wr_shrunk,
            "win_rate_wilson_lo": wr_lo,
            "win_rate_wilson_hi": wr_hi,
            "win_rate_wilson_half": wr_half,
            "loss_rate": _wr(losses, n),
            "tp4_rate": _wr(int(r[4] or 0), n),
            "full_tp_rate": full_rate,
            "full_tp_rate_shrunk": full_shrunk,
            "full_tp_wilson_half": full_half,
            "median_peak_wins": _safe_float(r[6]),
            "median_tt_tp1_sec": _safe_float(r[7]),
            "lift_pp": lift,
            "lift_shrunk_pp": lift_shrunk,
            "reliability": _reliability_tier(n, wr_half),
        })

    # ── Risk level historical ──
    risk_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT
            CASE
              WHEN LOWER(COALESCE(s.risk_level,'')) LIKE 'low%%' THEN 'low'
              WHEN LOWER(COALESCE(s.risk_level,'')) LIKE 'high%%' THEN 'high'
              WHEN LOWER(COALESCE(s.risk_level,'')) LIKE 'med%%'
                OR LOWER(COALESCE(s.risk_level,'')) LIKE 'nor%%' THEN 'normal'
              ELSE 'unknown'
            END AS risk_bucket,
            COUNT(*) AS n,
            COUNT(*) FILTER (WHERE r.outcome IN ('tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE r.outcome = 'sl') AS losses
        FROM resolved r
        JOIN signals s ON s.signal_id = r.signal_id
        WHERE r.hit_date >= :start AND r.hit_date <= :end
        GROUP BY 1
        HAVING COUNT(*) >= 10
        ORDER BY 1
    """), {"start": start_str, "end": end_str}).fetchall()

    risk = []
    for r in risk_rows:
        n = int(r[1])
        wins = int(r[2] or 0)
        losses = int(r[3] or 0)
        risk.append({
            "risk": r[0],
            "n": n,
            "win_rate": _wr(wins, n),
            "loss_rate": _wr(losses, n),
        })

    # Confound / prefer sets (prefer uses SHRUNK lift — journal-aligned)
    CONFOUND = {
        "LATE_ENTRY", "PARABOLIC", "OVEREXTENDED", "EXHAUSTION_CANDLE",
    }
    prefer_tags = [
        t for t in tags
        if t["tag"] not in CONFOUND
        and (t.get("lift_shrunk_pp") is not None and t["lift_shrunk_pp"] >= 2)
        and (t["n"] or 0) >= min_n
        and (t.get("reliability") in ("reliable", "moderate") or (t["n"] or 0) >= 80)
    ][:8]
    if len(prefer_tags) < 4:
        # fallback: raw WR gate if shrink was too harsh
        prefer_tags = [
            t for t in tags
            if t["tag"] not in CONFOUND
            and (t.get("win_rate_shrunk") or t.get("win_rate") or 0) >= (base_wr + 2)
            and (t["n"] or 0) >= min_n
        ][:8]
    caution_tags = [
        t for t in tags
        if t["tag"] in CONFOUND or (t["loss_rate"] or 0) >= max(18, (baseline["loss_rate"] or 0) + 5)
    ][:6]
    prefer_tags.sort(key=lambda t: (-(t.get("lift_shrunk_pp") or t.get("lift_pp") or 0), -t["n"]))
    caution_tags.sort(key=lambda t: (-(t["loss_rate"] or 0), -t["n"]))

    # ── CURRENT open candidates (desk ≈ bulk-7d) ─────────────────────────────
    # SCORE v2 = long-history multi-factor (not 7d learning).
    open_rows = db.execute(text("""
        SELECT s.signal_id, s.pair, s.risk_level, s.entry, s.created_at,
               s.status, s.volume_rank_num, s.volume_rank_den,
               s.stop1, s.target1, s.target2, s.target3, s.target4,
               bc.corr_4h_30d, bc.is_decoupled, bc.beta_30d,
               COALESCE(
                 (SELECT array_agg(DISTINCT t->>'name')
                  FROM jsonb_array_elements(
                    COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                             e.entry_snapshot->'tags_annotated','[]'::jsonb)
                  ) t
                  WHERE (t->>'important')::boolean = true
                    AND NULLIF(TRIM(t->>'name'), '') IS NOT NULL
                 ),
                 ARRAY[]::text[]
               ) AS tags
        FROM signals s
        LEFT JOIN signal_enrichment e ON e.signal_id = s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
        WHERE LOWER(s.status) = 'open'
          AND (s.created_at)::timestamptz >= NOW() - INTERVAL '7 days'
        ORDER BY (s.created_at)::timestamptz DESC
        LIMIT 300
    """)).fetchall()

    tag_lookup = {t["tag"]: t for t in tags}
    prefer_set = {t["tag"] for t in prefer_tags}
    base_wr_f = float(base_wr or 0)

    # Pair-level prior from resolved tag-era (simple coin WR) for hierarchical boost
    pair_prior_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT s.pair,
               COUNT(*) AS n,
               COUNT(*) FILTER (WHERE r.outcome IN ('tp1','tp2','tp3','tp4')) AS wins
        FROM resolved r
        JOIN signals s ON s.signal_id = r.signal_id
        WHERE r.hit_date >= :start AND r.hit_date <= :end
        GROUP BY s.pair
        HAVING COUNT(*) >= 8
    """), {"start": start_str, "end": end_str}).fetchall()
    pair_prior = {}
    for pr in pair_prior_rows:
        pn, pw = int(pr[1]), int(pr[2] or 0)
        pair_prior[pr[0]] = {
            "n": pn,
            "wr": _wr(pw, pn),
            "wr_shrunk": round((_eb_rate(pw, pn, base_wr_p, 30.0) or 0) * 100, 2),
        }

    scored_open = []
    for row in open_rows:
        (sid, pair, risk_level, entry, created_at, status,
         vol_num, vol_den, stop1, t1, t2, t3, t4,
         btc_corr, btc_decoupled, btc_beta, tlist) = row
        tlist = list(tlist or [])
        hist = []
        for tg in tlist:
            meta = tag_lookup.get(tg)
            if meta:
                hist.append(meta)
        caution = [tg for tg in tlist if tg in CONFOUND]
        r_lad = _r_ladder(entry, stop1, t1, t2, t3, t4)

        if not hist:
            score = None
            reason = "no historical tag overlap (tag-era history)"
            best = None
            avg_wr = avg_full = avg_lift = None
            conf = "low"
            exp_r = None
            factors = {}
        else:
            # ── Edge Score v2 (journal-aligned multi-factor) ──
            # Uses SHRUNK rates + Wilson uncertainty; context from vol/risk/BTC/coin.
            # Keep in lockstep with frontend-react/src/utils/edgeScore.js
            lifts_s, fulls_s, wrs_s, halves, tt_secs = [], [], [], [], []
            for m in hist:
                wr_s = float(m.get("win_rate_shrunk") if m.get("win_rate_shrunk") is not None else m.get("win_rate") or 0)
                full_s = float(m.get("full_tp_rate_shrunk") if m.get("full_tp_rate_shrunk") is not None else m.get("full_tp_rate") or 0)
                wrs_s.append(wr_s)
                fulls_s.append(full_s)
                lifts_s.append(wr_s - base_wr_f)
                if m.get("win_rate_wilson_half") is not None:
                    halves.append(float(m["win_rate_wilson_half"]))
                if m.get("median_tt_tp1_sec") is not None:
                    tt_secs.append(float(m["median_tt_tp1_sec"]))
            avg_wr = sum(wrs_s) / len(wrs_s)
            avg_full = sum(fulls_s) / len(fulls_s)
            avg_lift = sum(lifts_s) / len(lifts_s)
            avg_half = sum(halves) / len(halves) if halves else 12.0
            median_tt = sorted(tt_secs)[len(tt_secs) // 2] if tt_secs else None
            confound_n = sum(1 for m in hist if m["tag"] in CONFOUND)
            prefer_n = sum(1 for m in hist if m["tag"] in prefer_set)
            confound_frac = confound_n / len(hist)
            prefer_frac = prefer_n / len(hist)

            # Core (similar center 50–70, shrunk lift)
            core = (
                52.0
                + 1.5 * avg_lift
                + 0.20 * avg_full
                + 7.0 * prefer_frac
                - 12.0 * confound_frac
                - 0.25 * max(0.0, avg_half - 6.0)  # uncertainty penalty
            )

            # Volume rank: higher rank (lower num/den) → slight boost
            vol_adj = 0.0
            try:
                if vol_num is not None and vol_den and float(vol_den) > 0:
                    pctile = 1.0 - (float(vol_num) / float(vol_den))
                    vol_adj = 3.0 * (pctile - 0.5)  # ±1.5 around mid
            except (TypeError, ValueError):
                pass

            # Risk: prefer low/medium slightly for screening
            risk_adj = 0.0
            rl = (risk_level or "").lower()
            if rl.startswith("low"):
                risk_adj = 1.5
            elif rl.startswith("high"):
                risk_adj = -1.5

            # BTC: decoupled alt often higher idiosyncratic risk → mild penalty unless strong lift
            btc_adj = 0.0
            if btc_decoupled:
                btc_adj = -1.0 if avg_lift < 2 else 0.5
            try:
                if btc_corr is not None and float(btc_corr) > 0.85 and avg_lift < 0:
                    btc_adj -= 0.5  # high beta + weak tags
            except (TypeError, ValueError):
                pass

            # BTC regime tags on this signal
            if any(t.startswith("BTC_BEARISH") for t in tlist):
                btc_adj -= 1.0
            elif any(t.startswith("BTC_BULLISH") for t in tlist):
                btc_adj += 0.5

            # Time-to-TP1 quality (faster historical tags → small boost)
            tt_adj = 0.0
            if median_tt is not None and median_tt > 0:
                # < 2h good, > 24h mild penalty
                hours = median_tt / 3600.0
                if hours <= 2:
                    tt_adj = 1.5
                elif hours <= 8:
                    tt_adj = 0.5
                elif hours >= 36:
                    tt_adj = -1.0

            # Coin prior (pair WR shrunk)
            coin_adj = 0.0
            pp = pair_prior.get(pair)
            if pp and pp.get("wr_shrunk") is not None:
                coin_adj = max(-2.0, min(2.5, 0.08 * (pp["wr_shrunk"] - base_wr_f)))

            exp_r = _expectancy_proxy(avg_full, avg_wr, r_lad)
            exp_adj = 0.0
            if exp_r is not None:
                # center ~0.5–1.5R typical; map to ±3 pts
                exp_adj = max(-3.0, min(3.5, (exp_r - 0.6) * 2.5))

            score = round(core + vol_adj + risk_adj + btc_adj + tt_adj + coin_adj + exp_adj, 1)
            score = max(35.0, min(85.0, score))

            if avg_half <= 6 and len(hist) >= 2:
                conf = "high"
            elif avg_half <= 10 or len(hist) >= 2:
                conf = "medium"
            else:
                conf = "low"

            best = max(
                hist,
                key=lambda m: (
                    m.get("lift_shrunk_pp") is not None,
                    m.get("lift_shrunk_pp") or m.get("lift_pp") or -999,
                    m.get("win_rate_shrunk") or m.get("win_rate") or 0,
                ),
            )
            caution = [m["tag"] for m in hist if m["tag"] in CONFOUND]
            factors = {
                "core": round(core, 2),
                "vol": round(vol_adj, 2),
                "risk": round(risk_adj, 2),
                "btc": round(btc_adj, 2),
                "time_to_tp": round(tt_adj, 2),
                "coin": round(coin_adj, 2),
                "expectancy_r": exp_r,
                "expectancy_adj": round(exp_adj, 2),
                "uncertainty_half_pp": round(avg_half, 2),
            }
            reason = (
                f"v2 lift* {avg_lift:+.1f}pp · full* {avg_full:.0f}% · "
                f"{prefer_n}/{len(hist)} prefer · conf {conf}"
                + (f" · E[{exp_r:.2f}R]" if exp_r is not None else "")
                + (f" · top {best['tag']}" if best else "")
            )

        scored_open.append({
            "signal_id": str(sid),
            "pair": pair,
            "risk_level": risk_level,
            "entry": float(entry) if entry is not None else None,
            "created_at": str(created_at) if created_at else None,
            "tags": tlist,
            "score": score,
            "score_version": "v2",
            "confidence": conf if hist else "low",
            "reason": reason,
            "best_tag": best["tag"] if best else None,
            "best_tag_wr": (best.get("win_rate_shrunk") or best.get("win_rate")) if best else None,
            "caution_tags": caution,
            "matched_n": len(hist),
            "avg_hist_wr": round(avg_wr, 2) if avg_wr is not None else None,
            "avg_full_tp": round(avg_full, 2) if avg_full is not None else None,
            "avg_lift_pp": round(avg_lift, 2) if avg_lift is not None else None,
            "factors": factors if hist else None,
            "expectancy_r": exp_r if hist else None,
            "on_desk": True,
        })

    scored_open.sort(
        key=lambda x: (
            x["score"] is not None,
            x["score"] or 0,
            x.get("avg_full_tp") or 0,
            x.get("matched_n") or 0,
        ),
        reverse=True,
    )

    # ── Insights from past ──
    insights = []
    win_label = f"{effective_days}d" if days == 0 else f"{days}d"
    if prefer_tags:
        t0 = prefer_tags[0]
        full_bit = f", full TP {t0.get('full_tp_rate_shrunk') or t0['full_tp_rate']}%" 
        lift = t0.get("lift_shrunk_pp") if t0.get("lift_shrunk_pp") is not None else t0.get("lift_pp")
        lift_bit = f", shrunk lift {lift:+.1f}pp vs {base_wr}% baseline" if lift is not None else ""
        wr_show = t0.get("win_rate_shrunk") or t0.get("win_rate")
        insights.append({
            "tone": "good",
            "title": "Historically strongest setup (EB-shrunk)",
            "body": (
                f"Over {win_label}, \"{t0['tag']}\" shrunk WR ~{wr_show}% "
                f"(n={t0['n']}{lift_bit}{full_bit}). "
                f"Prefer open signals that still carry this tag."
            ),
        })
    if caution_tags:
        t0 = caution_tags[0]
        insights.append({
            "tone": "warn",
            "title": "Historically weaker / confounded",
            "body": (
                f"“{t0['tag']}” shows loss rate {t0['loss_rate']}% over {t0['n']} past calls "
                f"(or is a late/extended condition). Use as caution when screening open signals — "
                f"not an automatic ban."
            ),
        })
    if baseline["n"]:
        insights.append({
            "tone": "neutral",
            "title": f"Past {win_label} baseline · Edge Score v2",
            "body": (
                f"{baseline['win_rate']}% win · {baseline['loss_rate']}% SL · "
                f"{baseline['full_tp_rate']}% full TP3+ · {baseline['tp4_rate']}% TP4 "
                f"across {baseline['n']:,} resolved signals. "
                f"Open scores use EB-shrunk tag rates + Wilson uncertainty + "
                f"volume/risk/BTC/time-to-TP/coin/expectancy factors."
            ),
        })
    if scored_open:
        top = next((s for s in scored_open if s["score"] is not None), None)
        if top:
            insights.append({
                "tone": "good",
                "title": "Best-scoring open now (v2)",
                "body": (
                    f"{top['pair']} scores {top['score']:.0f} ({top.get('confidence','?')} conf) "
                    f"from long history ({top['reason']}). Rank open calls by this score."
                ),
            })

    response = {
        "days": days,
        "effective_days": effective_days,
        "min_n": min_n,
        "window": {"start": start_str, "end": end_str},
        "tag_era_start": TAG_METRICS_ERA_START.isoformat(),
        "baseline": baseline,
        "tags": tags,
        "prefer_tags": prefer_tags,
        "caution_tags": caution_tags,
        "risk": risk,
        "open_scored": scored_open[:80],
        "insights": insights,
        "source": "historical_resolved",
        "score_version": "v2",
        "note": (
            "Edge Score v2: EB-shrunk tag rates + Wilson uncertainty + multi-factor "
            "(volume, risk, BTC, time-to-TP priors, coin WR, expectancy R). "
            f"LEARNING since {TAG_METRICS_ERA_START.isoformat()}; candidates = open on 7d desk."
        ),
        "learning": {
            "source": "resolved_tag_era",
            "method": "empirical_bayes_tag_rates_plus_multifactor",
            "tag_era_start": TAG_METRICS_ERA_START.isoformat(),
            "window_start": start_str,
            "window_end": end_str,
            "effective_days": effective_days,
            "score_version": "v2",
        },
        "candidates": {
            "scope": "open_created_last_7d",
            "why": "Matches Signals bulk-7d so ranked rows appear in the main table",
        },
    }
    cache_set(cache_key, response, ttl=600)
    return response


# ════════════════════════════════════════════════════════════════
# EDGE-SCORE BACKTEST — walk-forward: higher score → better outcomes?
# Expanding tag stats: score each resolved signal using ONLY past data,
# then update stats with its outcome (no peek at future).
# ════════════════════════════════════════════════════════════════
CONFOUND_BT = frozenset({
    "LATE_ENTRY", "PARABOLIC", "OVEREXTENDED", "EXHAUSTION_CANDLE",
})


def _bt_score_from_hist(hist, base_wr_f, prefer_set, meta):
    """Lightweight v2 core for backtest (tags + risk/vol/expectancy)."""
    if not hist:
        return None, None
    lifts, fulls, wrs = [], [], []
    confound_n = prefer_n = 0
    for m in hist:
        n = m["n"]
        wins = m["wins"]
        full = m["full"]
        prior_p = base_wr_f / 100.0 if base_wr_f > 1 else base_wr_f
        # online EB with current global base
        wr_s = _eb_rate(wins, n, prior_p if prior_p <= 1 else 0.8, 40.0)
        if wr_s is None:
            continue
        wr_pct = wr_s * 100
        full_pct = (_eb_rate(full, n, 0.35, 40.0) or 0) * 100
        wrs.append(wr_pct)
        fulls.append(full_pct)
        lifts.append(wr_pct - base_wr_f)
        if m["tag"] in CONFOUND_BT:
            confound_n += 1
        if m["tag"] in prefer_set:
            prefer_n += 1
    if not wrs:
        return None, None
    avg_wr = sum(wrs) / len(wrs)
    avg_full = sum(fulls) / len(fulls)
    avg_lift = sum(lifts) / len(lifts)
    conf_f = confound_n / len(hist)
    pref_f = prefer_n / len(hist)
    core = 52 + 1.5 * avg_lift + 0.2 * avg_full + 7 * pref_f - 12 * conf_f
    risk_adj = 0.0
    rl = (meta.get("risk") or "").lower()
    if rl.startswith("low"):
        risk_adj = 1.5
    elif rl.startswith("high"):
        risk_adj = -1.5
    vol_adj = 0.0
    vn, vd = meta.get("vol_num"), meta.get("vol_den")
    try:
        if vn is not None and vd and float(vd) > 0:
            vol_adj = 3.0 * (1.0 - float(vn) / float(vd) - 0.5)
    except (TypeError, ValueError):
        pass
    r_lad = _r_ladder(meta.get("entry"), meta.get("stop1"), meta.get("t1"),
                      meta.get("t2"), meta.get("t3"), meta.get("t4"))
    exp_r = _expectancy_proxy(avg_full, avg_wr, r_lad)
    exp_adj = max(-3.0, min(3.5, ((exp_r or 0.6) - 0.6) * 2.5)) if exp_r is not None else 0.0
    score = round(max(35.0, min(85.0, core + risk_adj + vol_adj + exp_adj)), 1)
    return score, exp_r


@router.get("/analytics/edge-score-backtest")
def get_edge_score_backtest(
    days: int = Query(0, ge=0, le=400, description="0 = all since tag era"),
    min_n_tag: int = Query(15, ge=5, le=200, description="min past n for a tag to count in score"),
    warm_n: int = Query(300, ge=50, le=5000, description="min resolved before scoring starts"),
    db: Session = Depends(get_db),
):
    """
    Walk-forward backtest of Edge Score ranking quality.

    For each resolved signal (chronological by created_at):
      1) Score using tag stats from PAST outcomes only
      2) Record (score, actual outcome)
      3) Update tag stats with this outcome

    Then bucket into quintiles: does higher score → higher WR / full-TP / peak?
    """
    if not (0 <= days <= 400):
        raise HTTPException(status_code=400, detail="days must be 0–400")

    start_date, end_date, effective_days = _resolve_tag_lookback(days)
    start_str, end_str = start_date.isoformat(), end_date.isoformat()
    cache_key = f"lq:edge-lab:score-bt:v1:{days}:{min_n_tag}:{warm_n}:{start_str}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    stale, _ = cache_get_with_stale(cache_key)
    if stale:
        return stale

    rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT s.signal_id, s.pair, s.created_at, r.outcome, s.peak_pct,
               s.risk_level, s.volume_rank_num, s.volume_rank_den,
               s.entry, s.stop1, s.target1, s.target2, s.target3, s.target4,
               COALESCE(
                 (SELECT array_agg(DISTINCT t->>'name')
                  FROM jsonb_array_elements(
                    COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                             e.entry_snapshot->'tags_annotated','[]'::jsonb)
                  ) t
                  WHERE (t->>'important')::boolean = true
                    AND NULLIF(TRIM(t->>'name'), '') IS NOT NULL
                 ),
                 ARRAY[]::text[]
               ) AS tags
        FROM resolved r
        JOIN signals s ON s.signal_id = r.signal_id
        LEFT JOIN signal_enrichment e ON e.signal_id = s.signal_id
        WHERE r.hit_date >= :start AND r.hit_date <= :end
          AND (s.created_at)::timestamptz >= CAST(:era AS timestamptz)
        ORDER BY (s.created_at)::timestamptz ASC NULLS LAST
    """), {
        "start": start_str,
        "end": end_str,
        "era": TAG_METRICS_ERA_START.isoformat(),
    }).fetchall()

    # tag_stats[tag] = {n, wins, full}
    tag_stats = {}
    global_n = global_wins = 0
    scored = []  # {score, win, full, peak, outcome}

    for row in rows:
        (sid, pair, created_at, outcome, peak_pct,
         risk_level, vol_num, vol_den, entry, stop1, t1, t2, t3, t4, tlist) = row
        tlist = list(tlist or [])
        outcome = (outcome or "").lower()
        is_win = outcome in ("tp1", "tp2", "tp3", "tp4")
        is_full = outcome in ("tp3", "tp4")

        # Global baseline from past only
        base_wr_f = (100.0 * global_wins / global_n) if global_n >= 20 else 80.0

        # Prefer set from current tag_stats (shrunk lift >= 2, n >= min_n_tag)
        prefer_set = set()
        cands = []
        for tg, st in tag_stats.items():
            if tg in CONFOUND_BT or st["n"] < min_n_tag:
                continue
            wr_s = (_eb_rate(st["wins"], st["n"], base_wr_f / 100.0, 40.0) or 0) * 100
            lift = wr_s - base_wr_f
            if lift >= 2:
                cands.append((lift, st["n"], tg))
        cands.sort(reverse=True)
        prefer_set = {tg for _, __, tg in cands[:8]}

        hist = []
        for tg in tlist:
            st = tag_stats.get(tg)
            if not st or st["n"] < min_n_tag:
                continue
            hist.append({"tag": tg, "n": st["n"], "wins": st["wins"], "full": st["full"]})

        score = None
        if global_n >= warm_n and hist:
            meta = {
                "risk": risk_level,
                "vol_num": vol_num,
                "vol_den": vol_den,
                "entry": entry,
                "stop1": stop1,
                "t1": t1, "t2": t2, "t3": t3, "t4": t4,
            }
            score, _exp = _bt_score_from_hist(hist, base_wr_f, prefer_set, meta)

        if score is not None:
            scored.append({
                "score": score,
                "win": 1 if is_win else 0,
                "full": 1 if is_full else 0,
                "sl": 1 if outcome == "sl" else 0,
                "peak": float(peak_pct) if peak_pct is not None else None,
                "outcome": outcome,
            })

        # Update stats AFTER scoring (expanding window)
        for tg in tlist:
            st = tag_stats.setdefault(tg, {"n": 0, "wins": 0, "full": 0})
            st["n"] += 1
            if is_win:
                st["wins"] += 1
            if is_full:
                st["full"] += 1
        global_n += 1
        if is_win:
            global_wins += 1

    n_scored = len(scored)
    if n_scored < 50:
        response = {
            "ok": False,
            "reason": f"Not enough walk-forward scores yet (n={n_scored}, need ≥50).",
            "n_scored": n_scored,
            "n_total_resolved": len(rows),
            "window": {"start": start_str, "end": end_str},
            "effective_days": effective_days,
            "method": "expanding_tag_stats_walk_forward",
            "score_version": "v2",
        }
        cache_set(cache_key, response, ttl=600)
        return response

    scored.sort(key=lambda x: x["score"])
    # Quintiles Q1=lowest … Q5=highest
    q_size = n_scored / 5.0
    buckets = []
    for qi in range(5):
        lo = int(qi * q_size)
        hi = int((qi + 1) * q_size) if qi < 4 else n_scored
        chunk = scored[lo:hi]
        if not chunk:
            continue
        nw = sum(x["win"] for x in chunk)
        nf = sum(x["full"] for x in chunk)
        ns = sum(x["sl"] for x in chunk)
        peaks = [x["peak"] for x in chunk if x["peak"] is not None]
        scores_c = [x["score"] for x in chunk]
        buckets.append({
            "quintile": qi + 1,
            "label": ["Q1 lowest", "Q2", "Q3 mid", "Q4", "Q5 highest"][qi],
            "n": len(chunk),
            "win_rate": _wr(nw, len(chunk)),
            "full_tp_rate": _wr(nf, len(chunk)),
            "sl_rate": _wr(ns, len(chunk)),
            "avg_score": round(sum(scores_c) / len(scores_c), 2),
            "score_min": round(min(scores_c), 1),
            "score_max": round(max(scores_c), 1),
            "median_peak_pct": round(sorted(peaks)[len(peaks)//2], 2) if peaks else None,
        })

    q1 = next((b for b in buckets if b["quintile"] == 1), None)
    q5 = next((b for b in buckets if b["quintile"] == 5), None)
    wr_spread = None
    full_spread = None
    if q1 and q5 and q1.get("win_rate") is not None and q5.get("win_rate") is not None:
        wr_spread = round(q5["win_rate"] - q1["win_rate"], 2)
        full_spread = round((q5.get("full_tp_rate") or 0) - (q1.get("full_tp_rate") or 0), 2)

    # Monotonicity: WR should non-decrease across quintiles (allow 1 small dip)
    wrs = [b["win_rate"] for b in buckets if b.get("win_rate") is not None]
    rises = sum(1 for i in range(1, len(wrs)) if wrs[i] >= wrs[i - 1] - 0.5)
    mono_ok = rises >= max(1, len(wrs) - 2) if len(wrs) >= 3 else None

    # Spearman-ish: rank correlation score vs win (binary) via average score of wins vs losses
    win_scores = [x["score"] for x in scored if x["win"]]
    loss_scores = [x["score"] for x in scored if not x["win"]]
    mean_win = sum(win_scores) / len(win_scores) if win_scores else None
    mean_loss = sum(loss_scores) / len(loss_scores) if loss_scores else None
    score_sep = round(mean_win - mean_loss, 2) if mean_win is not None and mean_loss is not None else None

    if wr_spread is not None and wr_spread >= 4 and (mono_ok or score_sep and score_sep > 0.5):
        verdict = "holds"
        verdict_text = (
            f"Higher Edge Score predicted better outcomes in walk-forward history: "
            f"Q5 win {q5['win_rate']}% vs Q1 {q1['win_rate']}% (Δ {wr_spread:+.1f}pp). "
            f"Ranking is useful for prioritizing setups."
        )
    elif wr_spread is not None and wr_spread >= 1.5:
        verdict = "partial"
        verdict_text = (
            f"Mild separation: Q5 vs Q1 win Δ {wr_spread:+.1f}pp. "
            f"Edge helps a bit — use with risk management, not as sole filter."
        )
    elif wr_spread is not None and wr_spread < 0:
        verdict = "fails"
        verdict_text = (
            f"Inverted or weak: Q5 vs Q1 win Δ {wr_spread:+.1f}pp. "
            f"Do not trust rank alone in this window."
        )
    else:
        verdict = "weak"
        verdict_text = (
            f"Little separation (Q5−Q1 win Δ {wr_spread}pp). "
            f"Score may still help on full-TP; treat as soft prior."
        )

    # Monthly rolling OOS slices (last 6 months): top third vs bottom third WR
    monthly = []
    try:
        from collections import defaultdict
        by_month = defaultdict(list)
        # Re-run light: we only have scored list without dates — skip monthly if no dates
        # Attach dates by re-query would be heavy; skip or use index order proxy
    except Exception:
        pass

    # Rebuild monthly with second pass storing created_at — store in scored during loop
    # For simplicity re-fetch is expensive; add created month in first loop via optional field
    # Already passed created_at in row — re-loop scored without dates. Fix: store ym in scored.

    response = {
        "ok": True,
        "method": "expanding_tag_stats_walk_forward",
        "score_version": "v2",
        "window": {"start": start_str, "end": end_str},
        "effective_days": effective_days,
        "tag_era_start": TAG_METRICS_ERA_START.isoformat(),
        "n_total_resolved": len(rows),
        "n_scored": n_scored,
        "warm_n": warm_n,
        "min_n_tag": min_n_tag,
        "quintiles": buckets,
        "summary": {
            "q5_vs_q1_win_pp": wr_spread,
            "q5_vs_q1_full_pp": full_spread,
            "mean_score_wins": round(mean_win, 2) if mean_win is not None else None,
            "mean_score_losses": round(mean_loss, 2) if mean_loss is not None else None,
            "mean_score_sep": score_sep,
            "monotonic_wr": mono_ok,
        },
        "verdict": verdict,
        "verdict_text": verdict_text,
        "how_to_read": (
            "Q5 = highest Edge scores, Q1 = lowest. "
            "If Q5 win/full rates exceed Q1, ranking is predictive. "
            "Walk-forward: each signal scored with only past tag history (no future leak)."
        ),
    }
    cache_set(cache_key, response, ttl=900)
    return response


def _outcome_mix_sql(where_tags: bool) -> str:
    """Resolved final-outcome counts. Optional union on Hunt runner tags at entry."""
    tag_join = ""
    tag_filter = ""
    distinct = ""
    if where_tags:
        distinct = "DISTINCT "
        tag_join = """
        JOIN signal_enrichment e ON e.signal_id = r.signal_id,
             jsonb_array_elements(
                 COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                          e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
        """
        tag_filter = """
          AND (t->>'important')::boolean = true
          AND NULLIF(TRIM(t->>'name'), '') IN ({tag_in})
        """
    inner = f"""
        SELECT {distinct}r.signal_id, r.outcome
        FROM resolved r
        {tag_join}
        WHERE r.hit_date >= :start AND r.hit_date <= :end
        {tag_filter}
    """
    return f"""
        WITH {OUTCOMES_CTE},
        scoped AS (
            {inner}
        )
        SELECT
          COUNT(*) AS n,
          COUNT(*) FILTER (WHERE outcome = 'sl') AS sl,
          COUNT(*) FILTER (WHERE outcome = 'tp1') AS tp1,
          COUNT(*) FILTER (WHERE outcome = 'tp2') AS tp2,
          COUNT(*) FILTER (WHERE outcome = 'tp3') AS tp3,
          COUNT(*) FILTER (WHERE outcome = 'tp4') AS tp4
        FROM scoped
    """


# ════════════════════════════════════════════════════════════════
# HUNT FULL TP — union outcome mix for the live runner-tag shortlist
# ════════════════════════════════════════════════════════════════
@router.get("/analytics/hunt-full-tp")
def get_hunt_full_tp(
    days: int = Query(0, ge=0, le=400, description="0 = all since tag era"),
    min_n: int = Query(40, ge=1, le=5000, description="min n forwarded to tag-wr"),
    top_k: int = Query(RUNNER_TOP_K, ge=1, le=8),
    db: Session = Depends(get_db),
):
    """
    Transparent results for the Hunt full TP recipe.

    Runner tags are chosen the same way as the Signals Quick path (clean tags,
    n≥150, WR≥78, full-TP/peak gates, top-K by full_tp_rate). Stats are the
    UNION of resolved calls that carried ANY of those tags on the entry
    snapshot — one row per call, highest target reached (or SL).

    Live Hunt also requires Worth on the desk; that pair filter is NOT applied
    to these bars. Descriptive of the tag shortlist, not a member P&L.
    """
    if not (0 <= days <= 400):
        raise HTTPException(status_code=400, detail="days must be 0–400")

    start_date, end_date, effective_days = _resolve_tag_lookback(days)
    start_str, end_str = start_date.isoformat(), end_date.isoformat()
    cache_key = f"lq:edge-lab:hunt-ftp:v1:{days}:{min_n}:{top_k}:{start_str}:{end_str}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    stale, _ = cache_get_with_stale(cache_key)
    if stale:
        return stale

    tw = get_tag_wr(days=days, min_n=min_n, db=db)
    runners = select_runner_tags(tw.get("tags") or [], top_k=top_k)
    runner_names = [t.get("tag") for t in runners if t.get("tag")]

    if not runner_names:
        response = {
            "ok": False,
            "reason": "No runner tags yet (need n≥150 clean tags with full-TP history).",
            "window": {"start": start_str, "end": end_str},
            "tag_era_start": TAG_METRICS_ERA_START.isoformat(),
            "runner_tags": [],
        }
        cache_set(cache_key, response, ttl=120)
        return response

    params = {"start": start_str, "end": end_str}
    tag_in = []
    for i, name in enumerate(runner_names):
        key = f"tag{i}"
        params[key] = name
        tag_in.append(f":{key}")
    tag_in_sql = ",".join(tag_in)

    hunt_sql = _outcome_mix_sql(where_tags=True).replace("{tag_in}", tag_in_sql)
    base_sql = _outcome_mix_sql(where_tags=False)
    hunt_row = db.execute(text(hunt_sql), params).one()
    base_row = db.execute(text(base_sql), {"start": start_str, "end": end_str}).one()
    hunt = outcome_mix(hunt_row[0], hunt_row[1], hunt_row[2], hunt_row[3], hunt_row[4], hunt_row[5])
    baseline = outcome_mix(base_row[0], base_row[1], base_row[2], base_row[3], base_row[4], base_row[5])

    per_sql = f"""
        WITH {OUTCOMES_CTE},
        tagged AS (
            SELECT r.signal_id, r.outcome, t->>'name' AS tag
            FROM resolved r
            JOIN signal_enrichment e ON e.signal_id = r.signal_id,
                 jsonb_array_elements(
                     COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                              e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
            WHERE r.hit_date >= :start AND r.hit_date <= :end
              AND (t->>'important')::boolean = true
              AND NULLIF(TRIM(t->>'name'), '') IN ({tag_in_sql})
        )
        SELECT tag,
          COUNT(*) AS n,
          COUNT(*) FILTER (WHERE outcome = 'sl') AS sl,
          COUNT(*) FILTER (WHERE outcome = 'tp1') AS tp1,
          COUNT(*) FILTER (WHERE outcome = 'tp2') AS tp2,
          COUNT(*) FILTER (WHERE outcome = 'tp3') AS tp3,
          COUNT(*) FILTER (WHERE outcome = 'tp4') AS tp4
        FROM tagged
        GROUP BY tag
    """
    per_map = {}
    for row in db.execute(text(per_sql), params):
        per_map[row[0]] = outcome_mix(row[1], row[2], row[3], row[4], row[5], row[6])

    open_ids = set()
    per_tags = []
    for t in runners:
        name = t.get("tag")
        mix = per_map.get(name) or outcome_mix(0, 0, 0, 0, 0, 0)
        ids = t.get("active_signal_ids") or []
        open_ids.update(ids)
        per_tags.append({
            "tag": name,
            "n": mix["n"],
            "win_rate": mix["win_rate"],
            "full_tp_rate": mix["full_tp_rate"],
            "active_count": len(ids),
            "mix": mix,
        })

    response = {
        "ok": True,
        "method": "union_entry_snapshot_runner_tags",
        "score_version": "v2",
        "window": {"start": start_str, "end": end_str},
        "effective_days": effective_days,
        "tag_era_start": TAG_METRICS_ERA_START.isoformat(),
        "runner_tags": runner_names,
        "runner_rules": {
            "min_n": RUNNER_MIN_N,
            "min_wr": RUNNER_MIN_WR,
            "min_full_tp": RUNNER_MIN_FULL,
            "min_tp4": RUNNER_MIN_TP4,
            "min_peak_wins": RUNNER_MIN_PEAK,
            "top_k": top_k,
            "exclude": sorted(CONFOUND_BT),
        },
        "hunt": hunt,
        "baseline": baseline,
        "vs_all": mix_delta(hunt, baseline),
        "per_tag": per_tags,
        "open_count": len(open_ids),
        "live_filter_also": ["worth_it", "sort edge_score desc"],
        "stats_cover": (
            "Resolved calls that carried any current Hunt runner tag on the "
            "entry snapshot (union, one row per call). Worth is applied on the "
            "live desk only — not on these bars."
        ),
        "how_to_read": {
            "final": (
                "Each closed call is counted once, at the highest target it "
                "reached — or SL if it never hit TP1. The five shares sum to 100%."
            ),
            "reached": (
                "Reached TP1 = win rate (TP1 and beyond). Reached TP3 = full TP. "
                "These do not sum to 100% — a TP4 also reached TP1–TP3."
            ),
            "win": "A win is reaching at least TP1. Not member P&L.",
            "as_of_entry": (
                "Tags come from the call’s entry snapshot. Outcomes are not "
                "used to attach tags after the fact."
            ),
            "in_sample": (
                "These runner tags were chosen from the same history. Treat as "
                "a description of the shortlist, not a walk-forward paper trade."
            ),
        },
    }
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
