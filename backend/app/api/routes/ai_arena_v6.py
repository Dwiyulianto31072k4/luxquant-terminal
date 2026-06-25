"""
LuxQuant AI Arena v6.1 — API Routes
======================================
Endpoints for v6 reports, Compass 2.0 scenario ledger, and archives.

Routes (mounted at /api/v1/ai-arena/v6):
  GET /latest         — most recent v6 report (full JSON)
  GET /scenario-ledger — Compass 2.0 target-first scenario contracts

Authentication: Reuses existing patterns. Latest is public-readable for now;
                evaluation/archive routes can be gated as needed.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.api.deps import require_subscription

router = APIRouter(prefix="/ai-arena/v6", tags=["AI Arena v6"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _as_report_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _iso_datetime(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _archive_item(row, pdf_status: dict[str, Any] | None = None, pdf_error: str | None = None) -> dict[str, Any]:
    report_json = _as_report_dict(row.report_json)
    verdict = report_json.get("verdict") or {}
    tactical = verdict.get("tactical_24h") or {}
    swing = verdict.get("secondary_7d") or {}
    holder = verdict.get("primary_30d") or {}
    event_risk = report_json.get("event_risk") or {}
    liquidity = report_json.get("liquidity") or {}
    magnets = liquidity.get("magnets") or {}
    critique = report_json.get("critique") or {}

    pdf_status = pdf_status or {}
    return {
        "id": row.id,
        "report_id": row.report_id,
        "timestamp": _iso_datetime(row.timestamp),
        "btc_price": row.btc_price,
        "headline": row.bluf_text or verdict.get("headline"),
        "summary": verdict.get("narrative"),
        "tactical_24h": {
            "direction": row.tactical_direction_24h or tactical.get("direction"),
            "confidence": row.tactical_confidence_24h or tactical.get("confidence"),
            "rationale": tactical.get("rationale"),
        },
        "swing_72h": {
            "direction": row.secondary_direction_7d or swing.get("direction"),
            "confidence": row.secondary_confidence_7d or swing.get("confidence"),
        },
        "holder_context": {
            "direction": row.primary_direction_30d or holder.get("direction"),
            "confidence": row.primary_confidence_30d or holder.get("confidence"),
        },
        "event_risk": event_risk.get("risk_level") or "unknown",
        "liquidity_status": liquidity.get("status") or ("available" if liquidity.get("available") else "unknown"),
        "nearest_magnet_above": (magnets.get("nearest_above") or {}).get("price") if isinstance(magnets.get("nearest_above"), dict) else magnets.get("nearest_above"),
        "nearest_magnet_below": (magnets.get("nearest_below") or {}).get("price") if isinstance(magnets.get("nearest_below"), dict) else magnets.get("nearest_below"),
        "critique_decision": row.critique_decision or critique.get("decision"),
        "is_anomaly_triggered": row.is_anomaly_triggered,
        "pdf_ready": bool(pdf_status.get("pdf_ready")),
        "pdf_size_bytes": pdf_status.get("pdf_size_bytes"),
        "pdf_filename": pdf_status.get("pdf_filename"),
        "pdf_error": pdf_error,
        "pdf_url": f"/api/v1/ai-arena/v6/reports/{row.report_id}/pdf",
    }



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

    from app.services.compass_dashboard_health import build_dashboard_health

    report_json = _as_report_dict(row.report_json)
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
        "dashboard_health": build_dashboard_health(
            report_json,
            report_timestamp=row.timestamp,
        ),
        "report": report_json,
    }




# ════════════════════════════════════════════════════════════════════════
# GET /report-archive + GET /reports/{report_id}/pdf
# ════════════════════════════════════════════════════════════════════════

@router.get("/report-archive")
def get_report_archive(
    limit: int = Query(18, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user=Depends(require_subscription),
) -> dict[str, Any]:
    """Return recent Compass reports and their archived PDF status."""
    sql = text("""
        SELECT
            id, report_id, timestamp, btc_price,
            primary_direction_30d, primary_confidence_30d,
            secondary_direction_7d, secondary_confidence_7d,
            tactical_direction_24h, tactical_confidence_24h,
            cycle_score, cycle_phase,
            critique_decision, bluf_text,
            is_anomaly_triggered, report_json
        FROM ai_arena_reports
        WHERE schema_version = 'v6.1'
        ORDER BY timestamp DESC
        LIMIT :limit
    """)
    rows = db.execute(sql, {"limit": limit}).all()

    items = []
    for row in rows:
        pdf_status = None
        pdf_error = None
        try:
            from app.services.compass_report_pdf import ensure_report_pdf, report_pdf_status

            ensure_report_pdf(row.report_id, row.report_json or {}, report_timestamp=row.timestamp)
            pdf_status = report_pdf_status(row.report_id)
        except Exception as exc:  # keep catalog usable even if PDF dependency is not installed yet
            pdf_error = type(exc).__name__
        items.append(_archive_item(row, pdf_status=pdf_status, pdf_error=pdf_error))

    return {
        "count": len(items),
        "limit": limit,
        "items": items,
    }


@router.get("/reports/{report_id}/pdf")
def get_report_pdf(
    report_id: str,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    _current_user=Depends(require_subscription),
):
    """Open one archived Compass report as an inline PDF."""
    sql = text("""
        SELECT id, report_id, timestamp, report_json
        FROM ai_arena_reports
        WHERE schema_version = 'v6.1'
          AND report_id = :report_id
        LIMIT 1
    """)
    row = db.execute(sql, {"report_id": report_id}).first()
    if not row:
        raise HTTPException(404, "Compass report not found")

    try:
        from app.services.compass_report_pdf import ensure_report_pdf

        path = ensure_report_pdf(
            row.report_id,
            row.report_json or {},
            report_timestamp=row.timestamp,
            force=force,
        )
    except Exception as exc:
        raise HTTPException(
            503,
            f"Compass PDF report is not ready yet: {type(exc).__name__}",
        ) from exc

    return FileResponse(
        path,
        media_type="application/pdf",
        filename=path.name,
        content_disposition_type="inline",
    )


# ════════════════════════════════════════════════════════════════════════
# GET /ledger?days=14&horizon=24h
# ════════════════════════════════════════════════════════════════════════

@router.get("/ledger")
def get_verdict_ledger(
    days: int = Query(14, ge=1, le=365),
    horizon: Optional[str] = Query(None, regex="^(24h|72h|7d|30d)$"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Retired legacy horizon ledger.

    Compass 2.0 evaluates target-first scenario contracts instead of fixed
    24h/72h/7d/30d outcome rows. Kept as a compatibility endpoint so older
    clients fail closed instead of rendering mixed-schema audit history.
    """
    return {
        "schema": "legacy_horizon_retired",
        "replacement": "/api/v1/ai-arena/v6/scenario-ledger",
        "window_days": days,
        "horizon_filter": horizon,
        "count": 0,
        "items": [],
    }


# ════════════════════════════════════════════════════════════════════════
# GET /scenario-ledger
# ════════════════════════════════════════════════════════════════════════

def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@router.get("/scenario-ledger")
def get_scenario_ledger(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _current_user=Depends(require_subscription),
) -> dict[str, Any]:
    """
    Compass 2.0 target-first ledger.

    This intentionally excludes legacy horizon outcomes. Each row is one
    structured scenario contract and, when available, its first-barrier
    resolution.
    """
    sql = text("""
        WITH event_summary AS (
            SELECT
                projection_id,
                COUNT(*) AS event_count,
                MAX(event_time) AS last_event_time
            FROM compass_projection_events
            GROUP BY projection_id
        )
        SELECT
            c.projection_id,
            c.read_id,
            c.status,
            c.primary_bias,
            c.reference_price,
            c.support_level,
            c.support_trigger,
            c.confirmation_level,
            c.confirmation_trigger,
            c.primary_touch_level,
            c.primary_touch_trigger,
            c.extension_low,
            c.extension_high,
            c.invalidation_level,
            c.invalidation_trigger,
            c.alternative_path,
            c.market_mode,
            c.expected_pace,
            c.soft_review_after_minutes,
            c.stale_after_minutes,
            c.probabilities,
            c.key_conditions,
            c.key_risks,
            c.active_from,
            c.contract_json,
            cr.report_id,
            cr.issued_at,
            r.bluf_text,
            r.btc_price,
            res.outcome,
            res.first_barrier,
            res.first_barrier_at,
            res.first_barrier_price,
            res.max_favorable_excursion_pct,
            res.max_adverse_excursion_pct,
            res.reason_codes,
            res.interpretation,
            res.resolved_at,
            COALESCE(es.event_count, 0) AS event_count,
            es.last_event_time
        FROM compass_projection_contracts c
        JOIN compass_reads cr ON cr.read_id = c.read_id
        LEFT JOIN ai_arena_reports r ON r.id = cr.report_pk
        LEFT JOIN compass_projection_resolutions res ON res.projection_id = c.projection_id
        LEFT JOIN event_summary es ON es.projection_id = c.projection_id
        ORDER BY c.active_from DESC
        LIMIT :limit
    """)
    rows = db.execute(sql, {"limit": limit}).all()

    items: list[dict[str, Any]] = []
    for row in rows:
        contract_json = _as_report_dict(row.contract_json)
        items.append({
            "projection_id": row.projection_id,
            "read_id": row.read_id,
            "report_id": row.report_id,
            "issued_at": _iso_datetime(row.issued_at or row.active_from),
            "headline": row.bluf_text or contract_json.get("user_explanation"),
            "status": row.status,
            "primary_bias": row.primary_bias,
            "market_mode": row.market_mode,
            "reference_price": _num(row.reference_price),
            "btc_price": _num(row.btc_price or row.reference_price),
            "support": {
                "level": _num(row.support_level),
                "trigger": row.support_trigger,
            },
            "confirmation": {
                "level": _num(row.confirmation_level),
                "trigger": row.confirmation_trigger,
            },
            "primary_touch": {
                "level": _num(row.primary_touch_level),
                "trigger": row.primary_touch_trigger,
            },
            "extension_zone": {
                "price_low": _num(row.extension_low),
                "price_high": _num(row.extension_high),
            },
            "invalidation": {
                "level": _num(row.invalidation_level),
                "trigger": row.invalidation_trigger,
            },
            "alternative_path": row.alternative_path or [],
            "probabilities": row.probabilities or {},
            "key_conditions": row.key_conditions or [],
            "key_risks": row.key_risks or [],
            "review_policy": {
                "expected_pace": row.expected_pace,
                "soft_review_after_minutes": row.soft_review_after_minutes,
                "stale_after_minutes": row.stale_after_minutes,
            },
            "events": {
                "count": int(row.event_count or 0),
                "last_event_time": _iso_datetime(row.last_event_time),
            },
            "resolution": {
                "outcome": row.outcome,
                "first_barrier": row.first_barrier,
                "first_barrier_at": _iso_datetime(row.first_barrier_at),
                "first_barrier_price": _num(row.first_barrier_price),
                "mfe_pct": _num(row.max_favorable_excursion_pct),
                "mae_pct": _num(row.max_adverse_excursion_pct),
                "reason_codes": row.reason_codes or [],
                "interpretation": row.interpretation,
                "resolved_at": _iso_datetime(row.resolved_at),
            } if row.outcome else None,
        })

    resolved = [item for item in items if item["resolution"]]
    clean_hits = sum(1 for item in resolved if item["resolution"]["outcome"] in {"CLEAN_HIT", "RANGE_HELD"})
    invalidated = sum(1 for item in resolved if item["resolution"]["outcome"] == "INVALIDATED_FIRST")

    return {
        "schema": "compass_2_target_first",
        "legacy_horizon_history": "retired",
        "count": len(items),
        "stats": {
            "active": sum(1 for item in items if item["status"] == "ACTIVE"),
            "resolved": len(resolved),
            "pending": len(items) - len(resolved),
            "clean_hits": clean_hits,
            "invalidated_first": invalidated,
            "hit_rate": clean_hits / len(resolved) if resolved else None,
        },
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
    """Retired fixed-horizon track record."""
    return {
        "schema": "legacy_horizon_retired",
        "replacement": "/api/v1/ai-arena/v6/scenario-ledger",
        "days": days,
        "overall": {"hit_rate": None, "hits": 0, "misses": 0, "pending": 0},
        "by_horizon": {},
    }


# ════════════════════════════════════════════════════════════════════════
# GET /model-calibration
# ════════════════════════════════════════════════════════════════════════

@router.get("/model-calibration")
def get_compass_model_calibration(
    days: int = Query(90, ge=30, le=365),
    db: Session = Depends(get_db),
    _current_user=Depends(require_subscription),
) -> dict[str, Any]:
    """Return Phase 5 shadow-model validation and confidence calibration."""
    from app.services.compass_model_calibration import get_model_calibration

    return get_model_calibration(db, days=days)


# ════════════════════════════════════════════════════════════════════════
# GET /liquidity-validation
# ════════════════════════════════════════════════════════════════════════

@router.get("/liquidity-validation")
def get_liquidity_validation(
    limit: int = Query(25, ge=1, le=100),
    _current_user=Depends(require_subscription),
) -> dict[str, Any]:
    """Return Phase 2 liquidation-model health and calibration progress."""
    from app.services.binance_liquidation_validation import get_validation_monitor

    return get_validation_monitor(limit=limit)


# ════════════════════════════════════════════════════════════════════════
# GET /event-risk
# ════════════════════════════════════════════════════════════════════════

@router.get("/event-risk")
async def get_event_risk(
    _current_user=Depends(require_subscription),
) -> dict[str, Any]:
    """Return structured news and economic-event context for Compass."""
    from app.services.compass_event_risk import get_event_risk_snapshot

    return await get_event_risk_snapshot()

# ════════════════════════════════════════════════════════════════════════
# GET /operational-health
# ════════════════════════════════════════════════════════════════════════

@router.get("/operational-health")
def get_compass_operational_health(
    db: Session = Depends(get_db),
    _current_user=Depends(require_subscription),
) -> dict[str, Any]:
    """Return Phase 7 runtime health, alerts, and runbook references."""
    from app.services.compass_operational_health import get_operational_health

    return get_operational_health(db)
