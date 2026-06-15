"""Evidence-first dashboard health summary for BTC Compass Phase 6.

The summary is derived from one persisted report snapshot. It describes how
usable the report is now without changing confidence, direction, or verdict
authority.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional


REPORT_FRESH_SECONDS = 8 * 60 * 60
REPORT_MAX_AGE_SECONDS = 24 * 60 * 60
HORIZONS = ("24h", "72h")
HORIZON_VERDICT_KEYS = {
    "24h": "tactical_24h",
    "72h": "secondary_7d",
}
STATUS_RANK = {"fresh": 0, "stale": 1, "unavailable": 2}


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _status(value: Any) -> str:
    token = str(value or "unavailable").lower()
    return token if token in STATUS_RANK else "unavailable"


def _report_freshness(
    generated_at: Any,
    *,
    now: datetime,
) -> dict[str, Any]:
    generated = _parse_datetime(generated_at)
    age_seconds = (
        max(0.0, (now - generated).total_seconds())
        if generated is not None
        else None
    )
    if age_seconds is None or age_seconds > REPORT_MAX_AGE_SECONDS:
        status = "unavailable"
    elif age_seconds > REPORT_FRESH_SECONDS:
        status = "stale"
    else:
        status = "fresh"
    return {
        "status": status,
        "generated_at": generated.isoformat() if generated else None,
        "age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
        "fresh_for_seconds": REPORT_FRESH_SECONDS,
        "maximum_age_seconds": REPORT_MAX_AGE_SECONDS,
    }


def _effective_status(captured_status: str, report_status: str) -> str:
    if captured_status == "unavailable" or report_status == "unavailable":
        return "unavailable"
    if captured_status == "stale" or report_status == "stale":
        return "stale"
    return "fresh"


def _source_item(
    *,
    key: str,
    label: str,
    provider: str,
    role: str,
    health: Optional[dict],
    report_freshness: dict,
) -> dict[str, Any]:
    health = health or {}
    captured_status = _status(health.get("status"))
    effective_status = _effective_status(
        captured_status,
        report_freshness["status"],
    )
    captured_age = _safe_float(health.get("age_seconds"))
    report_age = _safe_float(report_freshness.get("age_seconds"))
    if captured_age is not None and report_age is not None:
        current_age = captured_age + report_age
    elif captured_age is not None:
        current_age = captured_age
    elif captured_status != "unavailable":
        current_age = report_age
    else:
        current_age = None
    return {
        "key": key,
        "label": label,
        "provider": provider,
        "role": role,
        "captured_status": captured_status,
        "status": effective_status,
        "captured_age_seconds": (
            round(captured_age, 1) if captured_age is not None else None
        ),
        "age_seconds": round(current_age, 1) if current_age is not None else None,
        "available_count": health.get("available_count"),
        "total_count": health.get("total_count"),
    }


def _build_sources(report: dict, report_freshness: dict) -> list[dict]:
    matrix = report.get("evidence_matrix") or {}
    sources = []
    for row in matrix.get("rows") or []:
        if row.get("key") == "news_event_risk":
            continue
        sources.append(_source_item(
            key=str(row.get("key") or "unknown"),
            label=str(row.get("label") or row.get("key") or "Unknown source"),
            provider=str(row.get("source") or "Unknown"),
            role=str(row.get("role") or "evidence"),
            health=row.get("source_health"),
            report_freshness=report_freshness,
        ))

    event_risk = report.get("event_risk") or {}
    event_health = event_risk.get("source_health") or {}
    for key, label, provider in (
        ("news", "News feed", "RSS news"),
        ("calendar", "Economic calendar", "ForexFactory"),
    ):
        sources.append(_source_item(
            key=key,
            label=label,
            provider=provider,
            role="confidence_guardrail",
            health=event_health.get(key),
            report_freshness=report_freshness,
        ))
    return sources


def _support_state(
    *,
    coverage: Optional[float],
    comparison: str,
    conflict_count: int,
    unavailable_rows: int,
    stale_rows: int,
    report_status: str,
) -> str:
    if coverage is None or report_status == "unavailable":
        return "unavailable"
    if coverage < 0.5 or unavailable_rows >= 3:
        return "limited"
    if comparison == "conflict":
        return "conflicted"
    if (
        report_status == "stale"
        or coverage < 0.8
        or unavailable_rows > 0
        or stale_rows > 0
        or conflict_count > 0
    ):
        return "guarded"
    return "supported"


def _build_horizons(report: dict, report_status: str) -> dict[str, dict]:
    matrix_horizons = ((report.get("evidence_matrix") or {}).get("horizons") or {})
    verdict = report.get("verdict") or {}
    result = {}
    for horizon in HORIZONS:
        summary = matrix_horizons.get(horizon) or {}
        verdict_item = verdict.get(HORIZON_VERDICT_KEYS[horizon]) or {}
        coverage = _safe_float(summary.get("coverage"))
        comparison = str(summary.get("verdict_comparison") or "unavailable")
        conflict_count = int(summary.get("conflict_count") or 0)
        unavailable_rows = int(summary.get("unavailable_rows") or 0)
        stale_rows = int(summary.get("stale_rows") or 0)
        result[horizon] = {
            "verdict_direction": verdict_item.get("direction"),
            "verdict_confidence": verdict_item.get("confidence"),
            "evidence_bias": summary.get("bias"),
            "evidence_score": summary.get("score"),
            "coverage": coverage,
            "comparison": comparison,
            "conflict_count": conflict_count,
            "conflicts": summary.get("conflicts") or [],
            "unavailable_rows": unavailable_rows,
            "stale_rows": stale_rows,
            "support": _support_state(
                coverage=coverage,
                comparison=comparison,
                conflict_count=conflict_count,
                unavailable_rows=unavailable_rows,
                stale_rows=stale_rows,
                report_status=report_status,
            ),
        }
    return result


def _build_changes(report: dict) -> list[dict]:
    matrix = report.get("evidence_matrix") or {}
    changes = []
    for row in matrix.get("rows") or []:
        row_changes = row.get("changes") or {}
        if not row_changes.get("changed"):
            continue
        horizons = {}
        for horizon in HORIZONS:
            detail = (row_changes.get("horizons") or {}).get(horizon) or {}
            if detail.get("changed"):
                horizons[horizon] = {
                    "direction_from": detail.get("direction_from"),
                    "direction_to": (
                        (row.get("horizons") or {}).get(horizon) or {}
                    ).get("direction"),
                    "strength_delta": detail.get("strength_delta"),
                }
        changes.append({
            "key": row.get("key"),
            "label": row.get("label"),
            "source_status_from": row_changes.get("source_status_from"),
            "source_status_to": (row.get("source_health") or {}).get("status"),
            "horizons": horizons,
        })
    return changes


def _build_issues(
    *,
    report: dict,
    freshness: dict,
    sources: list[dict],
    horizons: dict[str, dict],
) -> list[dict]:
    issues = []
    if freshness["status"] != "fresh":
        issues.append({
            "key": "report_freshness",
            "severity": "high" if freshness["status"] == "unavailable" else "medium",
            "title": (
                "Report snapshot is too old"
                if freshness["status"] == "unavailable"
                else "Report snapshot is stale"
            ),
            "detail": "Current source status may have changed since this report was captured.",
        })

    liquidity = report.get("liquidity") or {}
    for source in sources:
        if source["status"] == "fresh":
            continue
        detail = (
            "No usable payload was captured for this report."
            if source["status"] == "unavailable"
            else "The most recent usable payload is outside its fresh window."
        )
        if source["key"] == "liquidity" and liquidity.get("reason"):
            detail = f"Liquidity source reason: {liquidity['reason']}."
        issues.append({
            "key": f"source_{source['key']}",
            "severity": "high" if source["status"] == "unavailable" else "medium",
            "title": f"{source['label']} is {source['status']}",
            "detail": detail,
        })

    for horizon, item in horizons.items():
        if item["comparison"] == "conflict":
            issues.append({
                "key": f"verdict_conflict_{horizon}",
                "severity": "high",
                "title": f"{horizon} verdict conflicts with weighted evidence",
                "detail": (
                    f"Verdict is {item['verdict_direction']}; evidence bias is "
                    f"{item['evidence_bias']}."
                ),
            })
        elif item["conflict_count"]:
            labels = ", ".join(
                conflict.get("label") or conflict.get("key") or "unknown"
                for conflict in item["conflicts"][:3]
            )
            issues.append({
                "key": f"layer_conflict_{horizon}",
                "severity": "medium",
                "title": f"{item['conflict_count']} layer conflict(s) in {horizon}",
                "detail": f"Opposing evidence: {labels}.",
            })

    event_risk = report.get("event_risk") or {}
    if event_risk.get("risk_level") in {"elevated", "high"}:
        issues.append({
            "key": "event_risk",
            "severity": (
                "high" if event_risk.get("risk_level") == "high" else "medium"
            ),
            "title": f"{str(event_risk['risk_level']).title()} event risk",
            "detail": event_risk.get("summary") or "Event-risk guardrail is active.",
        })

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda item: (severity_rank[item["severity"]], item["key"]))
    return issues


def _overall_status(
    *,
    matrix_available: bool,
    freshness: dict,
    sources: list[dict],
    horizons: dict[str, dict],
) -> str:
    coverages = [
        item["coverage"]
        for item in horizons.values()
        if item["coverage"] is not None
    ]
    minimum_coverage = min(coverages) if coverages else None
    unavailable = sum(source["status"] == "unavailable" for source in sources)
    stale = sum(source["status"] == "stale" for source in sources)
    conflicts = any(item["comparison"] == "conflict" for item in horizons.values())
    if (
        not matrix_available
        or freshness["status"] == "unavailable"
        or minimum_coverage is None
    ):
        return "unavailable"
    if minimum_coverage < 0.5 or unavailable >= 3:
        return "limited"
    if (
        freshness["status"] == "stale"
        or unavailable > 0
        or stale > 0
        or conflicts
        or minimum_coverage < 0.8
    ):
        return "degraded"
    return "healthy"


def build_dashboard_health(
    report_json: Any,
    *,
    report_timestamp: Any = None,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Build the Phase 6 dashboard summary from one report-cycle snapshot."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if isinstance(report_json, str):
        try:
            report = json.loads(report_json)
        except json.JSONDecodeError:
            report = {}
    else:
        report = report_json if isinstance(report_json, dict) else {}

    generated_at = report.get("generated_at") or report_timestamp
    freshness = _report_freshness(generated_at, now=now)
    sources = _build_sources(report, freshness)
    horizons = _build_horizons(report, freshness["status"])
    changes = _build_changes(report)
    matrix_available = bool((report.get("evidence_matrix") or {}).get("rows"))
    status = _overall_status(
        matrix_available=matrix_available,
        freshness=freshness,
        sources=sources,
        horizons=horizons,
    )
    counts = {
        key: sum(source["status"] == key for source in sources)
        for key in STATUS_RANK
    }
    issues = _build_issues(
        report=report,
        freshness=freshness,
        sources=sources,
        horizons=horizons,
    )
    summaries = {
        "healthy": "The report is fresh and its evidence coverage is strong.",
        "degraded": (
            "The verdict remains visible, but missing, stale, or conflicting "
            "evidence requires caution."
        ),
        "limited": (
            "Evidence coverage is too thin for a high-confidence reading. "
            "Treat the verdict as limited context."
        ),
        "unavailable": (
            "The report or evidence matrix is too old or unavailable for a "
            "current market reading."
        ),
    }
    return {
        "phase": 6,
        "version": "dashboard_health.v1",
        "purpose": "evidence_first_decision_context",
        "decision_authority": False,
        "snapshot_consistency": "single_report_cycle",
        "status": status,
        "summary": summaries[status],
        "report": freshness,
        "source_counts": {
            **counts,
            "total": len(sources),
        },
        "sources": sources,
        "horizons": horizons,
        "issues": issues,
        "changes": {
            "has_previous": bool(
                ((report.get("evidence_matrix") or {}).get("changes") or {}).get(
                    "has_previous"
                )
            ),
            "count": len(changes),
            "items": changes,
        },
    }


__all__ = ["build_dashboard_health"]
