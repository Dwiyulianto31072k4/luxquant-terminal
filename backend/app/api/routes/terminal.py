"""
LuxQuant Terminal - Deep Signal Screener API
=============================================
GET /api/v1/terminal/screener

ONE row per signal with EVERY intelligence layer joined by signal_id:
  · signals               — entry / targets / stop / risk / mcap / created_at
  · signal_updates        — derived status + last update (CTE, same as signals.py)
  · signal_enrichment     — confidence, rating, regime, MTF trends, SMC, F&G, ATR
  · signal_btc_correlation— beta, decoupled, downside beta, lead-lag, alignment
  · coins                 — sector, token_type, market_cap_rank

Design (follows codebase rules):
  - plain `def` endpoint (threadpool — never async def with sync DB)
  - ONE raw-SQL query, LEFT JOINs (no N+1)
  - Redis cache + SERVE-STALE fallback; small key space (days × scope)
  - deep multi-facet filtering happens CLIENT-side (dataset is ~1 week of
    signals ≈ several hundred rows — same approach as /signals/bulk-7d)
  - risk_level normalized in SQL (high/High, med/Medium/Normal, low → enum)
  - created_at is TEXT ISO — filtered by string prefix comparison, the same
    proven pattern used by /signals (avoids ::timestamptz cast blowups)

Mount in main.py:
    from app.api.routes import terminal
    app.include_router(terminal.router, prefix="/api/v1/terminal", tags=["terminal"])
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis import cache_get, cache_set, cache_get_with_stale
from app.api.deps import require_subscription
from app.models.user import User

log = logging.getLogger(__name__)

router = APIRouter()

CACHE_TTL = 60  # seconds — poller-friendly; serve-stale covers outages

# Outcome CTE — identical semantics to signals.py SIGNAL_OUTCOMES_CTE
_OUTCOMES_CTE = """
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
                    WHEN LOWER(update_type) LIKE '%sl%'  OR LOWER(update_type) LIKE '%stop%'     THEN 'sl'
                    ELSE NULL
                END AS outcome,
                ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY
                    CASE
                        WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 4
                        WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 3
                        WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 2
                        WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 1
                        WHEN LOWER(update_type) LIKE '%sl%'  OR LOWER(update_type) LIKE '%stop%'     THEN 0
                        ELSE -1
                    END DESC
                ) AS rn
            FROM signal_updates
            WHERE update_type IS NOT NULL
        ) ranked
        WHERE rn = 1 AND outcome IS NOT NULL
    ),
    last_updates AS (
        SELECT signal_id, last_update_at, last_update_type
        FROM (
            SELECT
                signal_id,
                update_at AS last_update_at,
                update_type AS last_update_type,
                ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY update_at DESC) AS rn
            FROM signal_updates
            WHERE update_type IS NOT NULL
        ) ranked
        WHERE rn = 1
    )
"""

_SCREENER_SQL = f"""
    WITH {_OUTCOMES_CTE}
    SELECT
        s.signal_id,
        s.pair,
        s.entry, s.target1, s.target2, s.target3, s.target4, s.stop1,
        s.created_at,
        s.market_cap,
        s.peak_pct,
        s.volume_rank_num, s.volume_rank_den,
        -- normalized risk (raw column is dirty: high/High, med/Medium/Normal, low)
        CASE
            WHEN LOWER(s.risk_level) LIKE 'low%'  THEN 'LOW'
            WHEN LOWER(s.risk_level) LIKE 'high%' THEN 'HIGH'
            WHEN LOWER(s.risk_level) LIKE 'med%'
              OR LOWER(s.risk_level) LIKE 'nor%'  THEN 'NORMAL'
            ELSE NULL
        END AS risk_norm,
        CASE WHEN so.outcome = 'tp4' THEN 'closed_win'
             WHEN so.outcome = 'sl'  THEN 'closed_loss'
             WHEN so.outcome IS NOT NULL THEN so.outcome
             ELSE 'open' END AS status,
        lu.last_update_at,

        -- enrichment (v3 intel; NULLs for old signals → has_intel=false)
        e.confidence_score,
        e.rating,
        e.regime,
        e.mtf_h4_trend, e.mtf_h1_trend, e.mtf_m15_trend,
        e.signal_direction,
        e.smc_fvg_count, e.smc_ob_count, e.smc_sweep_count,
        e.smc_golden_setup,
        e.btc_trend,
        e.fear_greed,
        e.atr_percentile,
        e.patterns_detected,
        e.warnings,
        e.enrichment_version,
        (e.signal_id IS NOT NULL) AS has_intel,

        -- BTC correlation layer
        c.beta_30d,
        c.downside_beta,
        c.is_decoupled,
        c.is_extended,
        c.lead_lag_hours,
        c.volatility_ratio,
        c.corr_4h_30d,
        (c.interpretation ->> 'alignment_score') AS alignment_score,
        c.confidence AS corr_confidence,

        -- coin fundamentals
        co.sector,
        co.token_type,
        co.market_cap_rank,
        co.has_utility,

        -- journey excursions (precomputed by journey worker)
        j.time_to_tp1_seconds,
        j.initial_mae_pct,

        -- v3 CONFLUENCE facts — live JSONB snapshot (columns are legacy/empty
        -- in v3; the real facts live in live_snapshot/entry_snapshot)
        sn.snap->>'signal_direction'                                    AS v3_direction,
        sn.snap->'facts'->'by_timeframe'->'h4'->'trend'->>'trend'          AS v3_h4,
        sn.snap->'facts'->'by_timeframe'->'h4'->'trend'->>'trend_strength' AS v3_h4_strength,
        sn.snap->'facts'->'by_timeframe'->'h1'->'trend'->>'trend'          AS v3_h1,
        sn.snap->'facts'->'by_timeframe'->'m15'->'trend'->>'trend'         AS v3_m15,
        sn.snap->'tags'                                                 AS v3_tags
    FROM signals s
    LEFT JOIN signal_outcomes so      ON so.signal_id = s.signal_id
    LEFT JOIN last_updates lu         ON lu.signal_id = s.signal_id
    LEFT JOIN signal_enrichment e     ON e.signal_id  = s.signal_id
    LEFT JOIN signal_btc_correlation c ON c.signal_id = s.signal_id
    LEFT JOIN signal_journey j        ON j.signal_id  = s.signal_id
    LEFT JOIN LATERAL (
        SELECT COALESCE(e.live_snapshot, e.entry_snapshot) AS snap
    ) sn ON true
    LEFT JOIN coins co                ON co.pair      = s.pair
    WHERE s.created_at >= :cutoff
      {{scope_clause}}
    ORDER BY s.call_message_id DESC
"""


def _to_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@router.get("/screener")
def get_deep_screener(
    days: int = Query(7, ge=1, le=30, description="Lookback window on signal creation"),
    scope: str = Query("active", description="'active' (open/tp1-3 only) or 'all'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_subscription),
):
    """Deep screener rows: every signal in window + all intel layers joined."""
    scope = scope if scope in ("active", "all") else "active"
    cache_key = f"lq:terminal:screener:d{days}:{scope}"

    cached = cache_get(cache_key)
    if cached:
        return cached

    # active = final outcome not reached yet (tp4/sl close the trade)
    scope_clause = (
        "AND (so.outcome IS NULL OR so.outcome IN ('tp1','tp2','tp3'))"
        if scope == "active"
        else ""
    )
    # TEXT ISO created_at → string prefix comparison (same as signals.py)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    try:
        rows = (
            db.execute(
                text(_SCREENER_SQL.format(scope_clause=scope_clause)),
                {"cutoff": cutoff},
            )
            .mappings()
            .fetchall()
        )

        items = []
        for r in rows:
            entry = _to_float(r["entry"])
            targets = [
                _to_float(r["target1"]), _to_float(r["target2"]),
                _to_float(r["target3"]), _to_float(r["target4"]),
            ]
            max_target_pct = None
            if entry and entry > 0:
                tvals = [t for t in targets if t]
                if tvals:
                    max_target_pct = round((max(tvals) - entry) / entry * 100, 2)

            items.append({
                "signal_id": r["signal_id"],
                "pair": r["pair"],
                "entry": entry,
                "targets": targets,
                "stop1": _to_float(r["stop1"]),
                "max_target_pct": max_target_pct,
                "created_at": r["created_at"],
                "status": r["status"],
                "last_update_at": str(r["last_update_at"]) if r["last_update_at"] else None,
                "risk_norm": r["risk_norm"],
                "market_cap": r["market_cap"],
                "peak_pct": _to_float(r["peak_pct"]),
                "volume_rank_num": r["volume_rank_num"],
                "volume_rank_den": r["volume_rank_den"],
                # intel
                "has_intel": bool(r["has_intel"]),
                "confidence_score": r["confidence_score"],
                "rating": r["rating"],
                "regime": r["regime"],
                "mtf": {
                    "h4": r["mtf_h4_trend"],
                    "h1": r["mtf_h1_trend"],
                    "m15": r["mtf_m15_trend"],
                },
                "signal_direction": r["signal_direction"],
                "smc": {
                    "fvg": r["smc_fvg_count"],
                    "ob": r["smc_ob_count"],
                    "sweep": r["smc_sweep_count"],
                    "golden": bool(r["smc_golden_setup"]) if r["smc_golden_setup"] is not None else False,
                },
                "btc_trend": r["btc_trend"],
                "fear_greed": r["fear_greed"],
                "atr_percentile": _to_float(r["atr_percentile"]),
                "patterns": r["patterns_detected"] or [],
                "warnings": r["warnings"] or [],
                "enrichment_version": r["enrichment_version"],
                # correlation
                "beta_30d": _to_float(r["beta_30d"]),
                "downside_beta": _to_float(r["downside_beta"]),
                "is_decoupled": bool(r["is_decoupled"]) if r["is_decoupled"] is not None else False,
                "is_extended": bool(r["is_extended"]) if r["is_extended"] is not None else False,
                "lead_lag_hours": r["lead_lag_hours"],
                "volatility_ratio": _to_float(r["volatility_ratio"]),
                "corr_4h_30d": _to_float(r["corr_4h_30d"]),
                "alignment_score": int(r["alignment_score"]) if r["alignment_score"] not in (None, "") else None,
                "corr_confidence": r["corr_confidence"],
                # fundamentals
                "sector": r["sector"],
                "token_type": r["token_type"],
                "market_cap_rank": r["market_cap_rank"],
                "has_utility": r["has_utility"],
                # journey
                "time_to_tp1_seconds": r["time_to_tp1_seconds"],
                "initial_mae_pct": _to_float(r["initial_mae_pct"]),
                # v3 confluence facts (from JSONB snapshot)
                "v3": {
                    "direction": r["v3_direction"],
                    "h4": r["v3_h4"],
                    "h4_strength": r["v3_h4_strength"],
                    "h1": r["v3_h1"],
                    "m15": r["v3_m15"],
                    "tags": r["v3_tags"] or [],
                },
            })

        result = {
            "items": items,
            "total": len(items),
            "days": days,
            "scope": scope,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        cache_set(cache_key, result, ttl=CACHE_TTL)
        return result

    except Exception as e:
        log.exception(f"terminal screener query failed: {e}")
        stale, _ = cache_get_with_stale(cache_key)
        if stale:
            return stale
        raise HTTPException(status_code=500, detail="Screener query failed")


# ============================================================
# DERIVATIVES BLOB — precomputed by app/services/terminal_worker.py
# ============================================================

DERIV_BLOB_KEY = "lq:terminal:deriv"


@router.get("/derivatives")
def get_derivatives(current_user: User = Depends(require_subscription)):
    """Funding / OI / long-short / taker / RSI / volume-change per pair.

    READ-ONLY from Redis (worker precomputes in background):
      fresh → return · expired → serve STALE copy (never empty) ·
      cold boot only → {"warming": true} so the UI shows a warm-up notice
      instead of an error. NO computation ever happens in the request path.
    """
    cached = cache_get(DERIV_BLOB_KEY)
    if cached:
        cached["stale"] = False
        return cached
    stale, _ = cache_get_with_stale(DERIV_BLOB_KEY)
    if stale:
        stale["stale"] = True
        return stale
    return {"warming": True, "pairs": {}, "generated_at": None}


# ============================================================
# POST-SIGNAL STATS — historical avg movement per pair, from
# signal_journey.events. Precomputed by terminal_worker (~6h).
# ============================================================

POSTSIGNAL_BLOB_KEY = "lq:terminal:postsignal"


@router.get("/postsignal")
def get_postsignal(current_user: User = Depends(require_subscription)):
    """Per-pair historical post-signal behavior:
    {pairs: {PAIR: {avg_24h, avg_48h, avg_7d, avg_peak, avg_mae, tp1_rate, n}}}

    READ-ONLY from Redis — worker computes it in background (fresh →
    stale → warming). Never computed in the request path.
    """
    cached = cache_get(POSTSIGNAL_BLOB_KEY)
    if cached:
        cached["stale"] = False
        return cached
    stale, _ = cache_get_with_stale(POSTSIGNAL_BLOB_KEY)
    if stale:
        stale["stale"] = True
        return stale
    return {"warming": True, "pairs": {}, "generated_at": None}


# ============================================================
# LIQUIDATIONS — live forced-liquidation tape (Bybit WS worker)
# ============================================================

LIQ_BLOB_KEY = "lq:terminal:liq"


@router.get("/liquidations")
def get_liquidations(current_user: User = Depends(require_subscription)):
    """Recent forced liquidations (newest first) + 5m long/short USD totals.
    READ-ONLY from Redis; the Bybit WS worker fills it in background."""
    cached = cache_get(LIQ_BLOB_KEY)
    if cached:
        cached["stale"] = False
        return cached
    stale, _ = cache_get_with_stale(LIQ_BLOB_KEY)
    if stale:
        stale["stale"] = True
        return stale
    return {"warming": True, "events": [], "long_usd_5m": 0, "short_usd_5m": 0, "generated_at": None}
