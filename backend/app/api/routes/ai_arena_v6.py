"""
LuxQuant AI Arena v6.1 — API Routes
======================================
Endpoints for v6 reports, verdict ledger, and track record.

Routes (mounted at /api/v1/ai-arena/v6):
  GET /latest         — most recent v6 report (full JSON)
  GET /ledger         — list of recent verdicts with outcomes (Verdict Ledger UI)
  GET /track-record   — accuracy stats per horizon + overall

Authentication: Reuses existing patterns. Latest is public-readable for now;
                ledger/track-record can be gated as needed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.ai_arena_v6 import AIArenaVerdictOutcome
from app.services.verdict_outcome_evaluator import compute_track_record

router = APIRouter(prefix="/ai-arena/v6", tags=["AI Arena v6"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════════
# GET /latest
# ════════════════════════════════════════════════════════════════════════

@router.get("/latest")
def get_latest_report(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Return the most recent v6 report (full report_json)."""
    sql = text("""
        SELECT
            id, report_id, timestamp, btc_price, generated_in_seconds,
            primary_direction_30d, primary_confidence_30d,
            secondary_direction_7d, secondary_confidence_7d,
            tactical_direction_24h, tactical_confidence_24h,
            cycle_score, cycle_phase,
            critique_decision, total_cost_usd,
            is_anomaly_triggered, anomaly_reason,
            report_json
        FROM ai_arena_reports
        WHERE schema_version = 'v6.1'
        ORDER BY timestamp DESC
        LIMIT 1
    """)
    row = db.execute(sql).first()
    if not row:
        raise HTTPException(404, "No v6 report available yet")

    return {
        "id": row.id,
        "report_id": row.report_id,
        "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        "btc_price": row.btc_price,
        "generated_in_seconds": row.generated_in_seconds,
        "verdict_summary": {
            "primary_30d": {
                "direction": row.primary_direction_30d,
                "confidence": row.primary_confidence_30d,
            },
            "secondary_7d": {
                "direction": row.secondary_direction_7d,
                "confidence": row.secondary_confidence_7d,
            },
            "tactical_24h": {
                "direction": row.tactical_direction_24h,
                "confidence": row.tactical_confidence_24h,
            },
        },
        "cycle": {"score": row.cycle_score, "phase": row.cycle_phase},
        "critique_decision": row.critique_decision,
        "cost_usd": row.total_cost_usd,
        "is_anomaly_triggered": row.is_anomaly_triggered,
        "anomaly_reason": row.anomaly_reason,
        "report": row.report_json,
    }


# ════════════════════════════════════════════════════════════════════════
# GET /ledger?days=14&horizon=24h
# ════════════════════════════════════════════════════════════════════════

@router.get("/ledger")
def get_verdict_ledger(
    days: int = Query(14, ge=1, le=90),
    horizon: Optional[str] = Query(None, regex="^(24h|72h|7d|30d)$"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Return verdict ledger for last N days.

    Each row = one verdict with all 4 horizon outcomes joined.
    Used to render the Verdict Ledger UI table.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    sql = text("""
        SELECT
            r.id, r.report_id, r.timestamp, r.btc_price,
            r.primary_direction_30d, r.primary_confidence_30d,
            r.secondary_direction_7d, r.tactical_direction_24h,
            r.is_anomaly_triggered,
            r.bluf_text,
            -- Aggregate outcomes via JSON
            (
              SELECT json_agg(json_build_object(
                'horizon', vo.horizon,
                'direction', vo.direction,
                'price_at_horizon', vo.price_at_horizon,
                'move_pct', vo.move_pct,
                'outcome', vo.outcome,
                'evaluated_at', vo.evaluated_at
              ) ORDER BY
                CASE vo.horizon
                  WHEN '24h' THEN 1
                  WHEN '72h' THEN 2
                  WHEN '7d' THEN 3
                  WHEN '30d' THEN 4
                END
              )
              FROM ai_arena_verdict_outcomes vo
              WHERE vo.report_id = r.id
            ) AS outcomes
        FROM ai_arena_reports r
        WHERE r.schema_version = 'v6.1'
          AND r.timestamp >= :since
        ORDER BY r.timestamp DESC
    """)
    rows = db.execute(sql, {"since": since}).all()

    # Optional horizon filter (filter outcomes array client-side; or filter rows)
    items = []
    for r in rows:
        outcomes = r.outcomes or []
        if horizon:
            outcomes = [o for o in outcomes if o["horizon"] == horizon]
        items.append({
            "id": r.id,
            "report_id": r.report_id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "btc_price": r.btc_price,
            "headline": r.bluf_text,
            "primary_direction": r.primary_direction_30d,
            "primary_confidence": r.primary_confidence_30d,
            "secondary_direction": r.secondary_direction_7d,
            "tactical_direction": r.tactical_direction_24h,
            "is_anomaly": r.is_anomaly_triggered,
            "outcomes": outcomes,
        })

    return {
        "window_days": days,
        "horizon_filter": horizon,
        "count": len(items),
        "items": items,
    }


# ════════════════════════════════════════════════════════════════════════
# GET /track-record
# ════════════════════════════════════════════════════════════════════════

@router.get("/track-record")
def get_track_record(
    days: int = Query(30, ge=7, le=180),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Compute hit-rate stats per horizon over last N days."""
    return compute_track_record(db, days=days)
