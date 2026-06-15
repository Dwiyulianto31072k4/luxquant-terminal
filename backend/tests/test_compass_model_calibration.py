"""Tests for the Phase 5 Compass model-calibration audit."""

from app.services.compass_model_calibration import (
    build_calibration_report,
    evaluate_direction_from_move,
)


def _record(
    *,
    report_id: str,
    horizon: str = "24h",
    outcome: str = "hit",
    direction: str = "bullish",
    confidence: int = 60,
    move_pct: float = 2.0,
    shadow_direction: str | None = "bullish",
    shadow_confidence: int = 60,
    shadow_eligible: bool | None = True,
    liquidity_status: str = "fresh",
    coverage: float = 0.85,
) -> dict:
    shadow = {}
    if shadow_eligible is False:
        shadow = {
            "eligible": False,
            "reason": "liquidity_unavailable",
            "liquidity_status": liquidity_status,
        }
    elif shadow_direction is not None:
        key = "tactical_24h" if horizon == "24h" else "secondary_7d"
        shadow = {
            "eligible": shadow_eligible,
            "liquidity_status": liquidity_status,
            key: {
                "llm": direction,
                "det": shadow_direction,
                "det_conf": shadow_confidence,
                "agree": direction == shadow_direction,
            },
        }

    return {
        "report_id": report_id,
        "horizon": horizon,
        "outcome": outcome,
        "direction": direction,
        "confidence": confidence,
        "move_pct": move_pct,
        "threshold_pct": 1.0,
        "neutral_band_pct": 2.0,
        "report_json": {
            "shadow_deterministic": shadow,
            "liquidity": {"status": liquidity_status},
            "evidence_matrix": {
                "horizons": {
                    horizon: {"coverage": coverage},
                },
            },
        },
    }


def test_direction_outcome_uses_existing_threshold_contract():
    assert evaluate_direction_from_move("bullish", 1.0) == "hit"
    assert evaluate_direction_from_move("bearish", -1.0) == "hit"
    assert evaluate_direction_from_move("neutral", 2.0) == "hit"
    assert evaluate_direction_from_move("neutral", 2.01) == "miss"


def test_thin_shadow_sample_stays_collecting_and_excludes_ineligible_rows():
    records = [
        _record(report_id="a", outcome="hit", move_pct=2.0),
        _record(
            report_id="b",
            outcome="miss",
            direction="neutral",
            move_pct=3.0,
            shadow_direction="bullish",
        ),
        _record(
            report_id="c",
            outcome="hit",
            shadow_eligible=False,
            liquidity_status="unavailable",
        ),
        _record(
            report_id="d",
            outcome="miss",
            shadow_direction=None,
            shadow_eligible=None,
            liquidity_status="legacy_unknown",
        ),
    ]

    report = build_calibration_report(
        records,
        days=90,
        generated_at="2026-06-15T00:00:00+00:00",
    )
    horizon = report["horizons"]["24h"]

    assert report["decision_authority"] is False
    assert horizon["resolved_total"] == 4
    assert horizon["shadow_eligible"] == 2
    assert horizon["shadow_ineligible"] == 2
    assert horizon["readiness"]["stage"] == "collecting"
    assert horizon["readiness"]["activation_allowed"] is False
    assert horizon["ineligible_reasons"] == {
        "liquidity_unavailable": 1,
        "shadow_not_recorded": 1,
    }
    segments = {
        item["segment"]: item
        for item in horizon["segments"]["liquidity_status"]
    }
    assert segments["unavailable"]["shadow_eligible"] == 0


def test_robust_stable_sample_reaches_manual_review_only():
    records = []
    for index in range(100):
        move_pct = 2.0 if index < 80 else -2.0
        shadow_outcome = "hit" if index < 80 else "miss"

        if index < 60:
            baseline_direction = "bullish"
            baseline_outcome = "hit"
        elif index < 80:
            baseline_direction = "bearish"
            baseline_outcome = "miss"
        else:
            baseline_direction = "bullish"
            baseline_outcome = "miss"

        records.append(_record(
            report_id=f"report-{index}",
            outcome=baseline_outcome,
            direction=baseline_direction,
            confidence=60,
            move_pct=move_pct,
            shadow_direction="bullish",
            shadow_confidence=80,
            liquidity_status="fresh" if index < 50 else "stale",
            coverage=0.9,
        ))
        assert shadow_outcome == (
            "hit" if index < 80 else "miss"
        )

    report = build_calibration_report(records, days=180)
    horizon = report["horizons"]["24h"]

    assert horizon["comparable"]["baseline"]["hit_rate"] == 0.6
    assert horizon["comparable"]["shadow"]["hit_rate"] == 0.8
    assert horizon["comparable"]["shadow_edge_pp"] == 20.0
    assert horizon["comparable"]["shadow"]["calibration_gap_pp"] == 0.0
    assert horizon["readiness"]["stage"] == "manual_review_ready"
    assert all(gate["passed"] for gate in horizon["readiness"]["gates"])
    assert horizon["readiness"]["activation_allowed"] is False
