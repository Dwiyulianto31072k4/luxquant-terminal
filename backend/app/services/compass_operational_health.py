"""Operational health contract for BTC Compass Phase 7.

This layer watches the Compass runtime. It does not score the market and does
not alter any report output; it only turns runtime facts into checks, alerts,
and runbook hints.
"""

from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.redis import get_cache_info
from app.services.compass_dashboard_health import build_dashboard_health


VERSION = "operational_health.v1"
REPORT_STALE_SECONDS = 8 * 60 * 60
REPORT_EXPIRED_SECONDS = 24 * 60 * 60
SYSTEMD_UNITS = {
    "backend": "luxquant-backend.service",
    "arena_timer": "luxquant-arena-v6.timer",
    "evaluator_timer": "luxquant-arena-v6-evaluator.timer",
    "resolver_timer": "luxquant-compass-resolver.timer",
    "liquidation_stream": "luxquant-binance-liquidation-stream.service",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _check(
    *,
    key: str,
    label: str,
    status: str,
    detail: str,
    severity: str = "info",
    runbook: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "severity": severity,
        "detail": detail,
        "runbook": runbook,
        "metadata": metadata or {},
    }


def _alert_from_check(check: dict[str, Any]) -> Optional[dict[str, Any]]:
    if check["status"] == "healthy":
        return None
    return {
        "key": check["key"],
        "severity": check["severity"],
        "title": check["label"],
        "detail": check["detail"],
        "runbook": check.get("runbook"),
    }


def _overall_status(checks: list[dict[str, Any]]) -> str:
    if any(item["severity"] == "critical" and item["status"] != "healthy" for item in checks):
        return "critical"
    if any(item["status"] != "healthy" for item in checks):
        return "degraded"
    return "healthy"


def _systemd_is_active(unit: str) -> dict[str, Any]:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", unit],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except Exception as exc:
        return {
            "unit": unit,
            "active_state": "unknown",
            "available": False,
            "error": f"{type(exc).__name__}: {exc}",
        }
    return {
        "unit": unit,
        "active_state": (result.stdout or result.stderr or "").strip() or "unknown",
        "available": True,
        "returncode": result.returncode,
    }


def _status_check_for_unit(
    key: str,
    label: str,
    unit_state: dict[str, Any],
    *,
    runbook: str,
    missing_is_critical: bool,
) -> dict[str, Any]:
    active_state = unit_state.get("active_state")
    if active_state == "active":
        return _check(
            key=key,
            label=label,
            status="healthy",
            severity="info",
            detail=f"{unit_state.get('unit')} is active.",
            runbook=runbook,
            metadata=unit_state,
        )
    if active_state == "unknown" and not unit_state.get("available", True):
        return _check(
            key=key,
            label=label,
            status="unknown",
            severity="warning",
            detail=f"Could not inspect {unit_state.get('unit')} from this runtime.",
            runbook=runbook,
            metadata=unit_state,
        )
    return _check(
        key=key,
        label=label,
        status="critical" if missing_is_critical else "degraded",
        severity="critical" if missing_is_critical else "warning",
        detail=f"{unit_state.get('unit')} is {active_state or 'not active'}.",
        runbook=runbook,
        metadata=unit_state,
    )


def _redis_check(redis_info: dict[str, Any]) -> dict[str, Any]:
    if redis_info.get("connected"):
        return _check(
            key="redis",
            label="Redis cache",
            status="healthy",
            severity="info",
            detail=(
                f"Redis connected; {redis_info.get('total_keys', 0)} LuxQuant keys, "
                f"{redis_info.get('memory_used', 'memory unknown')} memory."
            ),
            runbook="redis",
            metadata=redis_info,
        )
    return _check(
        key="redis",
        label="Redis cache",
        status="critical",
        severity="critical",
        detail=redis_info.get("error") or "Redis is not responding.",
        runbook="redis",
        metadata=redis_info,
    )


def _latest_report_check(dashboard_health: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not dashboard_health:
        return _check(
            key="latest_report",
            label="Latest Compass report",
            status="critical",
            severity="critical",
            detail="No v6 Compass report is available.",
            runbook="latest_report",
        )
    report = dashboard_health.get("report") or {}
    status = report.get("status") or "unavailable"
    age_seconds = report.get("age_seconds")
    age_text = "age unknown" if age_seconds is None else f"{round(age_seconds / 3600, 2)}h old"
    if status == "fresh":
        return _check(
            key="latest_report",
            label="Latest Compass report",
            status="healthy",
            severity="info",
            detail=f"Latest report is fresh ({age_text}).",
            runbook="latest_report",
            metadata=report,
        )
    if status == "stale":
        return _check(
            key="latest_report",
            label="Latest Compass report",
            status="degraded",
            severity="warning",
            detail=f"Latest report is stale ({age_text}).",
            runbook="latest_report",
            metadata=report,
        )
    return _check(
        key="latest_report",
        label="Latest Compass report",
        status="critical",
        severity="critical",
        detail=f"Latest report is unavailable or expired ({age_text}).",
        runbook="latest_report",
        metadata=report,
    )


def _dashboard_health_check(dashboard_health: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not dashboard_health:
        return _check(
            key="dashboard_health",
            label="Evidence dashboard health",
            status="critical",
            severity="critical",
            detail="Dashboard health could not be built from the latest report.",
            runbook="dashboard_health",
        )
    status = dashboard_health.get("status") or "unavailable"
    if status == "healthy":
        return _check(
            key="dashboard_health",
            label="Evidence dashboard health",
            status="healthy",
            severity="info",
            detail=dashboard_health.get("summary") or "Evidence dashboard is healthy.",
            runbook="dashboard_health",
            metadata=dashboard_health,
        )
    return _check(
        key="dashboard_health",
        label="Evidence dashboard health",
        status="critical" if status == "unavailable" else "degraded",
        severity="critical" if status == "unavailable" else "warning",
        detail=dashboard_health.get("summary") or f"Dashboard health is {status}.",
        runbook="dashboard_health",
        metadata=dashboard_health,
    )


def _source_health_check(dashboard_health: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not dashboard_health:
        return _check(
            key="source_health",
            label="Compass source health",
            status="critical",
            severity="critical",
            detail="Source health is unavailable because dashboard health is missing.",
            runbook="source_health",
        )
    counts = dashboard_health.get("source_counts") or {}
    stale = int(counts.get("stale") or 0)
    unavailable = int(counts.get("unavailable") or 0)
    total = int(counts.get("total") or 0)
    if unavailable == 0 and stale == 0:
        return _check(
            key="source_health",
            label="Compass source health",
            status="healthy",
            severity="info",
            detail=f"All {total} Compass sources are fresh.",
            runbook="source_health",
            metadata=counts,
        )
    return _check(
        key="source_health",
        label="Compass source health",
        status="degraded",
        severity="warning",
        detail=f"{unavailable} unavailable and {stale} stale source(s) out of {total}.",
        runbook="source_health",
        metadata=counts,
    )


# Recent window: is this metric contributing *now*?
FEATURE_WINDOW = 120
# Long window: has it EVER contributed? The difference between the two is the
# difference between "never wired" and "died when the regime moved", which are
# different faults with different fixes.
FEATURE_WINDOW_LONG = 900
FEATURE_MIN_SAMPLES = 40


def _feature_scoreboard(db, window: int) -> dict[str, dict]:
    rows = db.execute(text("""
        SELECT m->>'key' AS metric_key,
               COUNT(*)                                             AS n,
               COUNT(*) FILTER (WHERE (m->>'score')::numeric > 0)   AS pos,
               COUNT(*) FILTER (WHERE (m->>'score')::numeric < 0)   AS neg,
               COUNT(*) FILTER (WHERE COALESCE((m->>'available')::boolean, TRUE)) AS avail
        FROM (
            SELECT report_json FROM ai_arena_reports
            WHERE report_json IS NOT NULL
            ORDER BY created_at DESC LIMIT :w
        ) r,
        LATERAL jsonb_each(r.report_json::jsonb->'confluence'->'layers') AS l(layer, body),
        LATERAL jsonb_array_elements(l.body->'metrics') AS m
        WHERE m->>'key' IS NOT NULL
        GROUP BY 1
    """), {"w": window}).mappings().all()
    return {r["metric_key"]: dict(r) for r in rows}


def _feature_health_check() -> dict[str, Any]:
    """Flag scoring metrics that have stopped contributing.

    This exists because two of them had, and nothing could see it. A hard-coded
    threshold does not raise, does not log, and does not visibly dent the hit
    rate — it just quietly stops contributing, and the model is dumber than
    anyone believes:

      · `funding_rate` scored 0 in 494 consecutive reports. Its bullish test was
        `> 0.01%`, and 0.01%/8h is the baseline rate perpetual exchanges clamp
        toward — the threshold sat on the modal value of its own input. Over the
        full history it *does* fire, so this one did not arrive broken: it died
        when funding stopped going negative. That is the case a short window
        catches and a long one hides.
      · `basis` can score 0 or −1 but never +1: bullish test `> +50`, observed
        range −60.96 to −1.45.
      · `taker_volume` was never fed at all — `compute_all()` was called without
        `external`, so the parameter existed and the data never arrived.

    Silent is the operative word in all three. So: dead in the recent window but
    alive historically is **degraded** (a threshold that outlived its regime);
    dead in both, or never available, is **critical** (never worked). One-sided
    metrics are reported as metadata but do not move the status — over any
    window short enough to be timely, a genuinely slow series can sit on one
    side honestly, and a check that cries wolf gets ignored.
    """
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        recent = _feature_scoreboard(db, FEATURE_WINDOW)
        ever = _feature_scoreboard(db, FEATURE_WINDOW_LONG)
    except Exception as e:  # a diagnostic must never take down the endpoint
        return _check(
            key="feature_health", label="Scoring feature health", status="unknown",
            severity="info", detail=f"Could not inspect metric history: {e}",
            runbook="feature_health",
        )
    finally:
        db.close()

    never_worked, stopped_working, one_sided = [], [], []
    for key, r in recent.items():
        if r["n"] < FEATURE_MIN_SAMPLES:
            continue
        if r["avail"] == 0:
            never_worked.append(key)
            continue
        silent_now = r["pos"] == 0 and r["neg"] == 0
        e = ever.get(key) or {}
        silent_ever = (e.get("pos", 0) == 0 and e.get("neg", 0) == 0)
        if silent_now and silent_ever:
            never_worked.append(key)
        elif silent_now:
            stopped_working.append(key)
        elif r["pos"] == 0 or r["neg"] == 0:
            one_sided.append(key)

    meta = {"never_worked": sorted(never_worked),
            "stopped_working": sorted(stopped_working),
            "one_sided": sorted(one_sided),
            "window": FEATURE_WINDOW, "long_window": FEATURE_WINDOW_LONG}

    if never_worked:
        return _check(
            key="feature_health", label="Scoring feature health", status="critical",
            severity="critical",
            detail=("never contributes: " + ", ".join(sorted(never_worked))
                    + " — threshold set outside the data's range, or the input was never wired."),
            runbook="feature_health", metadata=meta,
        )
    if stopped_working:
        return _check(
            key="feature_health", label="Scoring feature health", status="degraded",
            severity="warning",
            detail=("stopped contributing: " + ", ".join(sorted(stopped_working))
                    + f" — silent for {FEATURE_WINDOW} reports but alive earlier, so its "
                      "threshold has outlived the regime it was written for."),
            runbook="feature_health", metadata=meta,
        )
    return _check(
        key="feature_health", label="Scoring feature health", status="healthy",
        severity="info",
        detail=f"Every scoring metric contributed within the last {FEATURE_WINDOW} reports.",
        runbook="feature_health", metadata=meta,
    )


def build_operational_health_from_report(
    report_row: Optional[dict[str, Any]],
    *,
    now: Optional[datetime] = None,
    redis_info: Optional[dict[str, Any]] = None,
    systemd_status: Optional[dict[str, dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Build the Phase 7 operational health contract from loaded facts."""
    now = (now or _utc_now()).astimezone(timezone.utc)
    dashboard_health = None
    report_id = None
    report_timestamp = None
    if report_row:
        report_id = report_row.get("report_id")
        report_timestamp = report_row.get("timestamp")
        dashboard_health = build_dashboard_health(
            report_row.get("report_json") or {},
            report_timestamp=report_timestamp,
            now=now,
        )

    redis_info = redis_info if redis_info is not None else get_cache_info()
    systemd_status = systemd_status or {
        key: _systemd_is_active(unit)
        for key, unit in SYSTEMD_UNITS.items()
    }

    checks = [
        _check(
            key="api",
            label="Backend API",
            status="healthy",
            severity="info",
            detail="Operational-health endpoint executed successfully.",
            runbook="api",
        ),
        _redis_check(redis_info),
        _latest_report_check(dashboard_health),
        _dashboard_health_check(dashboard_health),
        _source_health_check(dashboard_health),
        _feature_health_check(),
        _status_check_for_unit(
            "backend_service",
            "Backend systemd service",
            systemd_status.get("backend") or {"unit": SYSTEMD_UNITS["backend"], "active_state": "unknown", "available": False},
            runbook="backend_service",
            missing_is_critical=True,
        ),
        _status_check_for_unit(
            "arena_timer",
            "AI Arena v6 timer",
            systemd_status.get("arena_timer") or {"unit": SYSTEMD_UNITS["arena_timer"], "active_state": "unknown", "available": False},
            runbook="arena_timer",
            missing_is_critical=True,
        ),
        _status_check_for_unit(
            "evaluator_timer",
            "AI Arena outcome evaluator timer",
            systemd_status.get("evaluator_timer") or {"unit": SYSTEMD_UNITS["evaluator_timer"], "active_state": "unknown", "available": False},
            runbook="evaluator_timer",
            missing_is_critical=True,
        ),
        _status_check_for_unit(
            "resolver_timer",
            "Compass projection resolver timer",
            systemd_status.get("resolver_timer") or {"unit": SYSTEMD_UNITS["resolver_timer"], "active_state": "unknown", "available": False},
            runbook="resolver_timer",
            missing_is_critical=True,
        ),
        _status_check_for_unit(
            "liquidation_stream",
            "Liquidation validation stream",
            systemd_status.get("liquidation_stream") or {"unit": SYSTEMD_UNITS["liquidation_stream"], "active_state": "unknown", "available": False},
            runbook="liquidation_stream",
            missing_is_critical=True,
        ),
    ]
    alerts = [
        alert
        for alert in (_alert_from_check(item) for item in checks)
        if alert is not None
    ]
    status = _overall_status(checks)
    return {
        "phase": 7,
        "version": VERSION,
        "purpose": "alerts_monitoring_runbook",
        "decision_authority": False,
        "generated_at": now.isoformat(),
        "status": status,
        "summary": (
            "Compass runtime is healthy."
            if status == "healthy"
            else "Compass runtime needs attention before trusting fresh reads."
            if status == "degraded"
            else "Compass runtime has a critical operational issue."
        ),
        "thresholds": {
            "report_stale_seconds": REPORT_STALE_SECONDS,
            "report_expired_seconds": REPORT_EXPIRED_SECONDS,
        },
        "latest_report": {
            "report_id": report_id,
            "timestamp": report_timestamp.isoformat()
            if hasattr(report_timestamp, "isoformat")
            else report_timestamp,
            "dashboard_health_status": (
                dashboard_health or {}
            ).get("status"),
        },
        "checks": checks,
        "alerts": alerts,
        "runbook": {
            "doc": "docs/compass-operational-runbook.md",
            "keys": sorted({item.get("runbook") for item in checks if item.get("runbook")}),
        },
    }


def get_operational_health(
    db: Session,
    *,
    redis_info_provider: Callable[[], dict[str, Any]] = get_cache_info,
    systemd_provider: Callable[[str], dict[str, Any]] = _systemd_is_active,
) -> dict[str, Any]:
    """Load current runtime facts and build Phase 7 operational health."""
    row = db.execute(text("""
        SELECT report_id, timestamp, report_json
        FROM ai_arena_reports
        WHERE schema_version = 'v6.1'
        ORDER BY timestamp DESC
        LIMIT 1
    """)).first()
    report_row = None
    if row:
        report_row = {
            "report_id": row.report_id,
            "timestamp": row.timestamp,
            "report_json": row.report_json,
        }
    return build_operational_health_from_report(
        report_row,
        redis_info=redis_info_provider(),
        systemd_status={
            key: systemd_provider(unit)
            for key, unit in SYSTEMD_UNITS.items()
        },
    )


__all__ = [
    "SYSTEMD_UNITS",
    "build_operational_health_from_report",
    "get_operational_health",
]
