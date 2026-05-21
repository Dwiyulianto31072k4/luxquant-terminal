"""
Daily Performance Dashboard endpoint (v5).

What changed in v5:
- Fixed BTC trend/dominance mode lookup: read from snapshot.tags_annotated[]
  (path snapshot->context->btc was wrong; that path doesn't exist in v3.0).
- Added `daily_regime` field sourced from daily_market_regime table — always
  populated regardless of enrichment coverage, used as universal fallback
  for historical dates before v3.0 worker launched (2026-05-14).
- Cache key bumped to v5 to force fresh data.
"""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.redis import cache_get, cache_set

router = APIRouter()


# ─── Shared CTE: outcome resolution from signal_updates ──────────

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
    if total == 0:
        return "no_data"
    if wr >= 75:
        return "strong"
    if wr >= 50:
        return "neutral"
    return "weak"


def _fear_greed_label(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    if value < 25:
        return "Extreme Fear"
    if value < 45:
        return "Fear"
    if value < 55:
        return "Neutral"
    if value < 75:
        return "Greed"
    return "Extreme Greed"


@router.get("/daily/dashboard")
async def get_daily_dashboard(
    date: Optional[str] = Query(None, description="YYYY-MM-DD UTC. Default = today UTC"),
    db: Session = Depends(get_db),
):
    """
    Daily Performance dashboard bundled in one round-trip.
    All dates in UTC. WR computed by hit date (signal_updates.update_at).
    """
    # Parse target date
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    else:
        target_date = datetime.utcnow().date()

    cache_key = f"lq:daily-dashboard:v5:{target_date.isoformat()}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    yesterday = target_date - timedelta(days=1)
    trend_start = target_date - timedelta(days=13)
    target_str = target_date.isoformat()
    trend_start_str = trend_start.isoformat()

    # ─── Q1: 14-day trend ───
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
    yesterday_data = trend_14d[-2] if len(trend_14d) >= 2 else {"win_rate": 0}

    # ─── Q2: Day signals (resolved on target_date) ───
    signal_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        latest_enrichment AS (
            SELECT DISTINCT ON (h.signal_id) h.signal_id, h.snapshot
            FROM signal_enrichment_history h
            JOIN resolved r ON r.signal_id = h.signal_id
            WHERE r.hit_date = :d
            ORDER BY h.signal_id, h.recorded_at DESC
        )
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
            COALESCE(array_length(e.warnings, 1), 0),
            le.snapshot->>'signal_direction' AS direction_v3,
            (le.snapshot->'metadata'->>'important_tag_count')::int AS imp_count_v3,
            COALESCE(
                (SELECT array_agg(tag->>'name')
                 FROM jsonb_array_elements(COALESCE(le.snapshot->'tags_annotated', '[]'::jsonb)) AS tag
                 WHERE (tag->>'important')::boolean = true),
                ARRAY[]::text[]
            ) AS important_tags
        FROM resolved r
        JOIN signals s ON s.signal_id = r.signal_id
        LEFT JOIN signal_enrichment e ON e.signal_id = s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
        LEFT JOIN coins c ON c.pair = s.pair
        LEFT JOIN latest_enrichment le ON le.signal_id = s.signal_id
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
        "signal_direction": r[13],
        "important_tag_count": int(r[14]) if r[14] is not None else None,
        "important_tags": list(r[15]) if r[15] else [],
    } for r in signal_rows]

    # ─── Q3: BTC context from tags_annotated (FIXED — was reading wrong path) ───
    # BTC trend tags: BTC_BULLISH / BTC_RANGING / BTC_BEARISH (strip BTC_ prefix)
    # BTC dom tags: BTC_DOM_FLAT / BTC_DOM_UNKNOWN / BTC_DOM_RISING / BTC_DOM_FALLING
    btc_ctx = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target_signals AS (
            SELECT s.signal_id FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        ),
        latest_snap AS (
            SELECT DISTINCT ON (h.signal_id) h.signal_id, h.snapshot
            FROM signal_enrichment_history h
            JOIN target_signals t ON t.signal_id = h.signal_id
            ORDER BY h.signal_id, h.recorded_at DESC
        ),
        flat_tags AS (
            SELECT tag->>'name' AS tag_name
            FROM latest_snap ls,
                 LATERAL jsonb_array_elements(COALESCE(ls.snapshot->'tags_annotated', '[]'::jsonb)) AS tag
            WHERE tag->>'name' LIKE 'BTC_%'
        )
        SELECT
            -- BTC trend distribution (raw counts)
            COUNT(*) FILTER (WHERE tag_name = 'BTC_BULLISH') AS bullish,
            COUNT(*) FILTER (WHERE tag_name = 'BTC_RANGING') AS ranging,
            COUNT(*) FILTER (WHERE tag_name = 'BTC_BEARISH') AS bearish,
            -- BTC dominance distribution
            COUNT(*) FILTER (WHERE tag_name = 'BTC_DOM_RISING') AS dom_rising,
            COUNT(*) FILTER (WHERE tag_name = 'BTC_DOM_FALLING') AS dom_falling,
            COUNT(*) FILTER (WHERE tag_name = 'BTC_DOM_FLAT') AS dom_flat,
            COUNT(*) FILTER (WHERE tag_name = 'BTC_DOM_UNKNOWN') AS dom_unknown
        FROM flat_tags
    """), {"d": target_str}).fetchone()

    btc_trend_dist = {
        "BULLISH": int(btc_ctx[0] or 0),
        "RANGING": int(btc_ctx[1] or 0),
        "BEARISH": int(btc_ctx[2] or 0),
    }
    btc_dom_dist = {
        "RISING": int(btc_ctx[3] or 0),
        "FALLING": int(btc_ctx[4] or 0),
        "FLAT": int(btc_ctx[5] or 0),
        "UNKNOWN": int(btc_ctx[6] or 0),
    }

    # Compute mode (most common) — None if no enrichment
    def _mode(dist: dict) -> Optional[str]:
        non_zero = {k: v for k, v in dist.items() if v > 0}
        if not non_zero:
            return None
        return max(non_zero, key=non_zero.get)

    btc_trend_mode = _mode(btc_trend_dist)
    btc_dom_trend_mode = _mode(btc_dom_dist)

    # ─── Q3b: F&G + decoupled/extended from existing tables ───
    extra_ctx = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.signal_id FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        )
        SELECT
            (SELECT ROUND(AVG(e.fear_greed))::int FROM target t
             JOIN signal_enrichment e ON e.signal_id = t.signal_id WHERE e.fear_greed IS NOT NULL),
            (SELECT COUNT(*) FROM target t
             JOIN signal_btc_correlation bc ON bc.signal_id = t.signal_id WHERE bc.is_decoupled = true),
            (SELECT COUNT(*) FROM target t
             JOIN signal_btc_correlation bc ON bc.signal_id = t.signal_id WHERE bc.is_extended = true)
    """), {"d": target_str}).fetchone()

    fear_greed_avg = int(extra_ctx[0]) if extra_ctx[0] is not None else None
    decoupled_count = int(extra_ctx[1] or 0)
    extended_count = int(extra_ctx[2] or 0)

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

    # ─── Q5: Important tags aggregate (NOT BTC tags) ───
    tag_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.signal_id FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        ),
        latest_snap AS (
            SELECT DISTINCT ON (h.signal_id) h.signal_id, h.snapshot
            FROM signal_enrichment_history h
            JOIN target t ON t.signal_id = h.signal_id
            ORDER BY h.signal_id, h.recorded_at DESC
        )
        SELECT tag->>'name' AS tag_name, COUNT(*)
        FROM latest_snap ls,
             LATERAL jsonb_array_elements(COALESCE(ls.snapshot->'tags_annotated', '[]'::jsonb)) AS tag
        WHERE (tag->>'important')::boolean = true
          AND tag->>'name' NOT LIKE 'BTC_%'
        GROUP BY tag->>'name'
        ORDER BY COUNT(*) DESC
        LIMIT 10
    """), {"d": target_str}).fetchall()
    important_tags = [{"tag": r[0], "count": int(r[1])} for r in tag_rows]

    # ─── Q6: Enrichment coverage ───
    coverage_row = db.execute(text(f"""
        WITH {OUTCOMES_CTE},
        target AS (
            SELECT s.signal_id FROM resolved r
            JOIN signals s ON s.signal_id = r.signal_id WHERE r.hit_date = :d
        )
        SELECT
            (SELECT COUNT(*) FROM target),
            (SELECT COUNT(DISTINCT h.signal_id) FROM target t
             JOIN signal_enrichment_history h ON h.signal_id = t.signal_id)
    """), {"d": target_str}).fetchone()
    enrichment_total = int(coverage_row[0] or 0)
    enrichment_coverage = int(coverage_row[1] or 0)

    # ─── Q7: Daily regime fallback (always populated from daily_market_regime) ───
    # NEW in v5: universal context fallback for historical dates pre-v3.0
    regime_row = db.execute(text("""
        SELECT regime, total_closed, wins, losses, win_rate
        FROM daily_market_regime
        WHERE date = :d
        LIMIT 1
    """), {"d": target_str}).fetchone()

    daily_regime = None
    if regime_row:
        daily_regime = {
            "regime": regime_row[0],
            "total_closed": int(regime_row[1]) if regime_row[1] is not None else 0,
            "wins": int(regime_row[2]) if regime_row[2] is not None else 0,
            "losses": int(regime_row[3]) if regime_row[3] is not None else 0,
            "win_rate": float(regime_row[4]) if regime_row[4] is not None else 0.0,
        }

    # ─── Assemble ───
    response = {
        "selected_date": target_str,
        "today_summary": {
            "total_resolved": today_data["total"],
            "wins": today_data["wins"],
            "losses": today_data["losses"],
            "win_rate": today_data["win_rate"],
            "yesterday_win_rate": yesterday_data["win_rate"],
            "delta_vs_yesterday": round(today_data["win_rate"] - yesterday_data["win_rate"], 2),
            "regime_label": today_data["regime"],
            "btc_trend_mode": btc_trend_mode,
            "btc_dom_trend_mode": btc_dom_trend_mode,
            "fear_greed_avg": fear_greed_avg,
            "fear_greed_label": _fear_greed_label(fear_greed_avg),
            "hot_sector": hot_sector,
            "daily_regime": daily_regime,
        },
        "day_detail": {
            "signals": day_signals,
            "context": {
                "btc_trend_distribution": btc_trend_dist,
                "btc_dom_distribution": btc_dom_dist,
                "btc_dom_trend_mode": btc_dom_trend_mode,
                "fear_greed_avg": fear_greed_avg,
                "fear_greed_label": _fear_greed_label(fear_greed_avg),
                "sector_breakdown": sectors,
                "important_tags": important_tags,
                "decoupled_count": decoupled_count,
                "extended_count": extended_count,
                "enrichment_coverage": enrichment_coverage,
                "enrichment_total": enrichment_total,
                "daily_regime": daily_regime,
            },
        },
        "trend_14d": trend_14d,
    }

    cache_set(cache_key, response, ttl=120)
    return response
