"""Tests for the Phase 6 evidence-first dashboard summary."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone

from app.services.compass_dashboard_health import build_dashboard_health


NOW = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)


def _report() -> dict:
    generated_at = (NOW - timedelta(minutes=10)).isoformat()
    rows = []
    for key, label, source in (
        ("price_action", "Price action", "Bybit spot"),
        ("liquidity", "Liquidation liquidity", "Binance estimated map"),
        ("derivatives", "Derivatives", "BGeometrics derivatives"),
    ):
        rows.append({
            "key": key,
            "label": label,
            "source": source,
            "role": "directional_evidence",
            "source_health": {"status": "fresh", "age_seconds": 30},
            "horizons": {
                "24h": {"direction": "bullish"},
                "72h": {"direction": "bullish"},
            },
            "changes": {
                "changed": False,
                "source_status_from": "fresh",
                "horizons": {
                    "24h": {"changed": False},
                    "72h": {"changed": False},
                },
            },
        })
    return {
        "generated_at": generated_at,
        "verdict": {
            "tactical_24h": {"direction": "bullish", "confidence": 64},
            "secondary_7d": {"direction": "bullish", "confidence": 61},
        },
        "liquidity": {
            "status": "fresh",
            "available": True,
        },
        "event_risk": {
            "risk_level": "low",
            "summary": "No scheduled high-impact event is inside the next 72 hours.",
            "source_health": {
                "news": {"status": "fresh", "age_seconds": 20},
                "calendar": {"status": "fresh", "age_seconds": 10},
            },
        },
        "evidence_matrix": {
            "horizons": {
                horizon: {
                    "bias": "bullish",
                    "score": 0.35,
                    "coverage": 0.9,
                    "conflict_count": 0,
                    "conflicts": [],
                    "unavailable_rows": 0,
                    "stale_rows": 0,
                    "verdict_comparison": "aligned",
                }
                for horizon in ("24h", "72h")
            },
            "rows": rows,
            "changes": {"has_previous": True, "changed_rows": 0},
        },
    }


def test_phase6_healthy_summary_preserves_verdict_authority_boundary():
    summary = build_dashboard_health(_report(), now=NOW)

    assert summary["phase"] == 6
    assert summary["status"] == "healthy"
    assert summary["decision_authority"] is False
    assert summary["snapshot_consistency"] == "single_report_cycle"
    assert summary["source_counts"] == {
        "fresh": 5,
        "stale": 0,
        "unavailable": 0,
        "total": 5,
    }
    assert summary["horizons"]["24h"]["support"] == "supported"
    assert summary["horizons"]["24h"]["verdict_confidence"] == 64


def test_phase6_unavailable_liquidity_degrades_but_does_not_hide_verdict():
    report = _report()
    liquidity_row = report["evidence_matrix"]["rows"][1]
    liquidity_row["source_health"] = {
        "status": "unavailable",
        "age_seconds": None,
    }
    report["liquidity"] = {
        "status": "unavailable",
        "available": False,
        "reason": "binance_http_418",
    }
    for horizon in ("24h", "72h"):
        report["evidence_matrix"]["horizons"][horizon].update({
            "coverage": 0.77,
            "unavailable_rows": 1,
            "conflict_count": 1,
            "conflicts": [{
                "key": "derivatives",
                "label": "Derivatives",
                "direction": "bearish",
            }],
        })

    summary = build_dashboard_health(report, now=NOW)

    assert summary["status"] == "degraded"
    assert summary["horizons"]["24h"]["support"] == "guarded"
    assert summary["horizons"]["24h"]["verdict_direction"] == "bullish"
    assert summary["source_counts"]["unavailable"] == 1
    liquidity_source = next(
        source for source in summary["sources"]
        if source["key"] == "liquidity"
    )
    assert liquidity_source["age_seconds"] is None
    liquidity_issue = next(
        issue for issue in summary["issues"]
        if issue["key"] == "source_liquidity"
    )
    assert "binance_http_418" in liquidity_issue["detail"]


def test_phase6_report_age_downgrades_effective_source_health():
    report = _report()
    report["generated_at"] = (NOW - timedelta(hours=10)).isoformat()

    summary = build_dashboard_health(report, now=NOW)

    assert summary["report"]["status"] == "stale"
    assert summary["status"] == "degraded"
    assert summary["source_counts"]["stale"] == 5
    assert all(source["captured_status"] == "fresh" for source in summary["sources"])
    assert all(source["status"] == "stale" for source in summary["sources"])


def test_phase6_conflicted_read_keeps_data_health_when_sources_are_fresh():
    report = deepcopy(_report())
    report["evidence_matrix"]["horizons"]["24h"].update({
        "bias": "bearish",
        "score": -0.22,
        "coverage": 1.0,
        "verdict_comparison": "conflict",
    })

    summary = build_dashboard_health(report, now=NOW)

    assert summary["status"] == "healthy"
    assert summary["source_counts"] == {
        "fresh": 5,
        "stale": 0,
        "unavailable": 0,
        "total": 5,
    }
    assert summary["horizons"]["24h"]["support"] == "conflicted"
    assert any(issue["key"] == "verdict_conflict_24h" for issue in summary["issues"])


def test_phase6_low_coverage_and_conflicting_verdict_are_explicit():
    report = deepcopy(_report())
    report["evidence_matrix"]["horizons"]["24h"].update({
        "bias": "bearish",
        "coverage": 0.42,
        "verdict_comparison": "conflict",
    })

    summary = build_dashboard_health(report, now=NOW)

    assert summary["status"] == "limited"
    assert summary["horizons"]["24h"]["support"] == "limited"
    conflict = next(
        issue for issue in summary["issues"]
        if issue["key"] == "verdict_conflict_24h"
    )
    assert conflict["severity"] == "high"
    assert "bullish" in conflict["detail"]
    assert "bearish" in conflict["detail"]


def test_phase6_expired_report_is_unavailable():
    report = _report()
    report["generated_at"] = (NOW - timedelta(hours=25)).isoformat()

    summary = build_dashboard_health(report, now=NOW)

    assert summary["report"]["status"] == "unavailable"
    assert summary["status"] == "unavailable"
    assert summary["horizons"]["72h"]["support"] == "unavailable"
    assert summary["source_counts"]["unavailable"] == 5
