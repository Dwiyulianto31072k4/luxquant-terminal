"""Phase 5 model calibration and shadow-validation audit.

This module compares the user-facing verdict with the deterministic shadow
model on the same resolved outcomes. It never activates deterministic direction
and never changes a report.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.models.ai_arena import AIArenaReport
from app.models.ai_arena_v6 import AIArenaVerdictOutcome

INITIAL_SAMPLE = 20
ROBUST_SAMPLE = 100
MIN_EDGE_PP = 3.0
MAX_CALIBRATION_GAP_PP = 10.0
MIN_SEGMENT_SAMPLE = 20

_SHADOW_KEY = {
    "24h": "tactical_24h",
    "72h": "secondary_7d",
}


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rate(hit: int, total: int) -> float | None:
    return round(hit / total, 3) if total else None


def _round_or_none(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def evaluate_direction_from_move(
    direction: str,
    move_pct: float,
    threshold_pct: float = 1.0,
    neutral_band_pct: float = 2.0,
) -> str:
    """Evaluate one direction against an already-computed price move."""
    normalized = str(direction or "").lower()
    if normalized == "bullish":
        return "hit" if move_pct >= threshold_pct else "miss"
    if normalized == "bearish":
        return "hit" if move_pct <= -threshold_pct else "miss"
    if normalized == "neutral":
        return "hit" if abs(move_pct) <= neutral_band_pct else "miss"
    return "expired"


def _confidence_bands(rows: list[dict], outcome_key: str, confidence_key: str) -> list[dict]:
    bands = (
        ("low", 0, 49),
        ("moderate", 50, 64),
        ("high", 65, 100),
    )
    result = []
    for label, low, high in bands:
        selected = [
            row for row in rows
            if row.get(confidence_key) is not None
            and low <= row[confidence_key] <= high
        ]
        total = len(selected)
        hit = sum(1 for row in selected if row.get(outcome_key) == "hit")
        mean_confidence = (
            sum(row[confidence_key] for row in selected) / total
            if total else None
        )
        hit_rate = hit / total if total else None
        gap = (
            mean_confidence - hit_rate * 100
            if mean_confidence is not None and hit_rate is not None
            else None
        )
        result.append({
            "band": label,
            "range": f"{low}-{high}",
            "total": total,
            "hit": hit,
            "hit_rate": _round_or_none(hit_rate, 3),
            "mean_confidence": _round_or_none(mean_confidence),
            "overconfidence_pp": _round_or_none(gap),
        })
    return result


def _model_stats(
    rows: list[dict],
    outcome_key: str,
    confidence_key: str,
) -> dict:
    eligible = [
        row for row in rows
        if row.get(outcome_key) in {"hit", "miss"}
    ]
    total = len(eligible)
    hit = sum(1 for row in eligible if row[outcome_key] == "hit")
    confidences = [
        row[confidence_key] for row in eligible
        if row.get(confidence_key) is not None
    ]
    mean_confidence = (
        sum(confidences) / len(confidences) if confidences else None
    )
    hit_rate_raw = hit / total if total else None
    overconfidence = (
        mean_confidence - hit_rate_raw * 100
        if mean_confidence is not None and hit_rate_raw is not None
        else None
    )
    brier_rows = [
        row for row in eligible if row.get(confidence_key) is not None
    ]
    brier = None
    if brier_rows:
        brier = sum(
            (
                row[confidence_key] / 100
                - (1.0 if row[outcome_key] == "hit" else 0.0)
            ) ** 2
            for row in brier_rows
        ) / len(brier_rows)

    return {
        "total": total,
        "hit": hit,
        "miss": total - hit,
        "hit_rate": _round_or_none(hit_rate_raw, 3),
        "mean_confidence": _round_or_none(mean_confidence),
        "overconfidence_pp": _round_or_none(overconfidence),
        "calibration_gap_pp": _round_or_none(
            abs(overconfidence) if overconfidence is not None else None
        ),
        "brier_score": _round_or_none(brier, 3),
        "confidence_bands": _confidence_bands(
            eligible, outcome_key, confidence_key
        ),
    }


def _liquidity_status(report: dict, shadow: dict) -> str:
    explicit = shadow.get("liquidity_status")
    if explicit:
        return str(explicit).lower()

    liquidity = report.get("liquidity") or {}
    if liquidity.get("status"):
        return str(liquidity["status"]).lower()

    matrix_rows = ((report.get("evidence_matrix") or {}).get("rows") or [])
    for row in matrix_rows:
        if row.get("key") == "liquidity":
            status = (row.get("source_health") or {}).get("status")
            if status:
                return str(status).lower()

    return "legacy_unknown"


def _coverage(report: dict, horizon: str) -> float | None:
    summary = (
        ((report.get("evidence_matrix") or {}).get("horizons") or {})
        .get(horizon)
        or {}
    )
    return _safe_float(summary.get("coverage"))


def _coverage_bucket(value: float | None) -> str:
    if value is None:
        return "not_recorded"
    if value < 0.6:
        return "low"
    if value < 0.8:
        return "medium"
    return "high"


def _normalize_record(record: dict) -> dict:
    report = record.get("report_json") or {}
    shadow = report.get("shadow_deterministic") or {}
    horizon = record["horizon"]
    shadow_payload = shadow.get(_SHADOW_KEY[horizon])
    explicitly_ineligible = shadow.get("eligible") is False
    shadow_eligible = (
        not explicitly_ineligible
        and isinstance(shadow_payload, dict)
        and shadow_payload.get("det") in {"bullish", "bearish", "neutral"}
    )
    move_pct = _safe_float(record.get("move_pct"))
    shadow_outcome = None
    if shadow_eligible and move_pct is not None:
        shadow_outcome = evaluate_direction_from_move(
            shadow_payload["det"],
            move_pct,
            _safe_float(record.get("threshold_pct")) or 1.0,
            _safe_float(record.get("neutral_band_pct")) or 2.0,
        )

    coverage = _coverage(report, horizon)
    return {
        "report_id": record.get("report_id"),
        "horizon": horizon,
        "baseline_outcome": record.get("outcome"),
        "baseline_direction": record.get("direction"),
        "baseline_confidence": record.get("confidence"),
        "move_pct": move_pct,
        "shadow_eligible": shadow_eligible,
        "shadow_outcome": shadow_outcome,
        "shadow_direction": (
            shadow_payload.get("det") if isinstance(shadow_payload, dict) else None
        ),
        "shadow_confidence": (
            shadow_payload.get("det_conf")
            if isinstance(shadow_payload, dict)
            else None
        ),
        "agree": (
            shadow_payload.get("agree")
            if isinstance(shadow_payload, dict)
            else None
        ),
        "ineligible_reason": (
            shadow.get("reason")
            if explicitly_ineligible
            else "shadow_not_recorded" if not shadow_eligible
            else None
        ),
        "liquidity_status": _liquidity_status(report, shadow),
        "evidence_coverage": coverage,
        "coverage_bucket": _coverage_bucket(coverage),
    }


def _segment_rows(rows: list[dict], key: str) -> list[dict]:
    segments = []
    values = sorted({str(row.get(key) or "unknown") for row in rows})
    for value in values:
        selected = [row for row in rows if str(row.get(key) or "unknown") == value]
        shadow_rows = [row for row in selected if row["shadow_eligible"]]
        baseline = _model_stats(
            shadow_rows, "baseline_outcome", "baseline_confidence"
        )
        shadow = _model_stats(
            shadow_rows, "shadow_outcome", "shadow_confidence"
        )
        delta = None
        if baseline["hit_rate"] is not None and shadow["hit_rate"] is not None:
            delta = (shadow["hit_rate"] - baseline["hit_rate"]) * 100
        segments.append({
            "segment": value,
            "resolved_total": len(selected),
            "shadow_eligible": len(shadow_rows),
            "baseline_hit_rate": baseline["hit_rate"],
            "shadow_hit_rate": shadow["hit_rate"],
            "shadow_edge_pp": _round_or_none(delta),
        })
    return segments


def _readiness(
    eligible_rows: list[dict],
    baseline: dict,
    shadow: dict,
    liquidity_segments: list[dict],
) -> dict:
    total = len(eligible_rows)
    delta = None
    if baseline["hit_rate"] is not None and shadow["hit_rate"] is not None:
        delta = (shadow["hit_rate"] - baseline["hit_rate"]) * 100

    observed_regimes = [
        segment for segment in liquidity_segments
        if segment["shadow_eligible"] >= MIN_SEGMENT_SAMPLE
        and segment["segment"] in {"fresh", "stale"}
    ]
    gates = [
        {
            "key": "initial_sample",
            "label": f"Initial sample ≥ {INITIAL_SAMPLE}",
            "passed": total >= INITIAL_SAMPLE,
            "value": total,
            "target": INITIAL_SAMPLE,
        },
        {
            "key": "robust_sample",
            "label": f"Robust sample ≥ {ROBUST_SAMPLE}",
            "passed": total >= ROBUST_SAMPLE,
            "value": total,
            "target": ROBUST_SAMPLE,
        },
        {
            "key": "baseline_edge",
            "label": f"Shadow edge ≥ {MIN_EDGE_PP:.0f} pp",
            "passed": delta is not None and delta >= MIN_EDGE_PP,
            "value": _round_or_none(delta),
            "target": MIN_EDGE_PP,
        },
        {
            "key": "calibration",
            "label": f"Calibration gap ≤ {MAX_CALIBRATION_GAP_PP:.0f} pp",
            "passed": (
                shadow["calibration_gap_pp"] is not None
                and shadow["calibration_gap_pp"] <= MAX_CALIBRATION_GAP_PP
            ),
            "value": shadow["calibration_gap_pp"],
            "target": MAX_CALIBRATION_GAP_PP,
        },
        {
            "key": "regime_stability",
            "label": "Fresh/stale regime evidence",
            "passed": len(observed_regimes) >= 2,
            "value": len(observed_regimes),
            "target": 2,
        },
    ]

    if total < INITIAL_SAMPLE:
        stage = "collecting"
    elif total < ROBUST_SAMPLE:
        stage = "initial_review"
    elif all(gate["passed"] for gate in gates):
        stage = "manual_review_ready"
    else:
        stage = "hold"

    return {
        "stage": stage,
        "activation_allowed": False,
        "manual_review_required": True,
        "eligible_sample": total,
        "initial_sample_target": INITIAL_SAMPLE,
        "robust_sample_target": ROBUST_SAMPLE,
        "progress_initial": round(min(total / INITIAL_SAMPLE, 1.0), 3),
        "progress_robust": round(min(total / ROBUST_SAMPLE, 1.0), 3),
        "gates": gates,
        "note": (
            "Deterministic direction remains shadow-only. Passing every gate "
            "starts a manual review; it never activates the model automatically."
        ),
    }


def build_calibration_report(
    records: Iterable[dict],
    *,
    days: int,
    generated_at: str | None = None,
) -> dict:
    """Build a transparent Phase 5 calibration report from resolved outcomes."""
    normalized = [
        _normalize_record(record)
        for record in records
        if record.get("horizon") in _SHADOW_KEY
        and record.get("outcome") in {"hit", "miss"}
    ]

    horizons = {}
    for horizon in ("24h", "72h"):
        rows = [row for row in normalized if row["horizon"] == horizon]
        eligible_rows = [row for row in rows if row["shadow_eligible"]]
        baseline_all = _model_stats(
            rows, "baseline_outcome", "baseline_confidence"
        )
        baseline_comparable = _model_stats(
            eligible_rows, "baseline_outcome", "baseline_confidence"
        )
        shadow = _model_stats(
            eligible_rows, "shadow_outcome", "shadow_confidence"
        )
        edge = None
        if (
            baseline_comparable["hit_rate"] is not None
            and shadow["hit_rate"] is not None
        ):
            edge = (
                shadow["hit_rate"] - baseline_comparable["hit_rate"]
            ) * 100

        ineligible_reasons = Counter(
            row["ineligible_reason"] or "unknown"
            for row in rows if not row["shadow_eligible"]
        )
        liquidity_segments = _segment_rows(rows, "liquidity_status")
        coverage_segments = _segment_rows(rows, "coverage_bucket")
        agreement_rows = [row for row in eligible_rows if row["agree"] is not None]
        agreements = [row for row in agreement_rows if row["agree"]]
        disagreements = [row for row in agreement_rows if not row["agree"]]

        horizons[horizon] = {
            "resolved_total": len(rows),
            "shadow_eligible": len(eligible_rows),
            "shadow_ineligible": len(rows) - len(eligible_rows),
            "ineligible_reasons": dict(sorted(ineligible_reasons.items())),
            "baseline_all": baseline_all,
            "comparable": {
                "baseline": baseline_comparable,
                "shadow": shadow,
                "shadow_edge_pp": _round_or_none(edge),
            },
            "agreement": {
                "total": len(agreement_rows),
                "agree": len(agreements),
                "disagree": len(disagreements),
                "agreement_rate": _rate(len(agreements), len(agreement_rows)),
                "baseline_wins_when_disagree": sum(
                    1 for row in disagreements
                    if row["baseline_outcome"] == "hit"
                    and row["shadow_outcome"] == "miss"
                ),
                "shadow_wins_when_disagree": sum(
                    1 for row in disagreements
                    if row["shadow_outcome"] == "hit"
                    and row["baseline_outcome"] == "miss"
                ),
            },
            "segments": {
                "liquidity_status": liquidity_segments,
                "evidence_coverage": coverage_segments,
            },
            "readiness": _readiness(
                eligible_rows,
                baseline_comparable,
                shadow,
                liquidity_segments,
            ),
        }

    all_ready = all(
        item["readiness"]["stage"] == "manual_review_ready"
        for item in horizons.values()
    )
    return {
        "phase": 5,
        "version": "model_calibration.v1",
        "purpose": "shadow_model_validation_and_confidence_calibration",
        "decision_authority": False,
        "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
        "window_days": days,
        "thresholds": {
            "initial_sample": INITIAL_SAMPLE,
            "robust_sample": ROBUST_SAMPLE,
            "minimum_shadow_edge_pp": MIN_EDGE_PP,
            "maximum_calibration_gap_pp": MAX_CALIBRATION_GAP_PP,
            "minimum_segment_sample": MIN_SEGMENT_SAMPLE,
        },
        "horizons": horizons,
        "overall": {
            "stage": (
                "manual_review_ready"
                if all_ready
                else "collecting_or_hold"
            ),
            "activation_allowed": False,
            "manual_review_required": True,
            "message": (
                "Shadow results are research metadata only. Deterministic "
                "direction stays disabled until both horizons pass every gate "
                "and a separate manual review approves activation."
            ),
        },
    }


def get_model_calibration(db: Session, days: int = 90) -> dict:
    """Load resolved production outcomes and return the Phase 5 audit."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pairs = (
        db.query(AIArenaVerdictOutcome, AIArenaReport)
        .join(AIArenaReport, AIArenaReport.id == AIArenaVerdictOutcome.report_id)
        .filter(
            AIArenaVerdictOutcome.called_at >= since,
            AIArenaVerdictOutcome.outcome.in_(["hit", "miss"]),
            AIArenaVerdictOutcome.horizon.in_(["24h", "72h"]),
        )
        .order_by(AIArenaVerdictOutcome.called_at.asc())
        .all()
    )
    records = []
    for outcome, report in pairs:
        records.append({
            "report_id": report.report_id,
            "horizon": outcome.horizon,
            "outcome": outcome.outcome,
            "direction": outcome.direction,
            "confidence": outcome.confidence,
            "move_pct": outcome.move_pct,
            "threshold_pct": outcome.threshold_pct,
            "neutral_band_pct": outcome.neutral_band_pct,
            "report_json": report.report_json or {},
        })
    return build_calibration_report(records, days=days)


__all__ = [
    "INITIAL_SAMPLE",
    "ROBUST_SAMPLE",
    "build_calibration_report",
    "evaluate_direction_from_move",
    "get_model_calibration",
]
