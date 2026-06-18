"""Tests for the Phase 7 Compass operational health contract."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone

from app.services.compass_operational_health import (
    SYSTEMD_UNITS,
    build_operational_health_from_report,
)


NOW = datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc)


def _systemd(active: bool = True) -> dict[str, dict]:
    return {
        key: {
            "unit": unit,
            "active_state": "active" if active else "inactive",
            "available": True,
            "returncode": 0 if active else 3,
        }
        for key, unit in SYSTEMD_UNITS.items()
    }


def _report(*, generated_delta: timedelta = timedelta(minutes=20)) -> dict:
    generated_at = (NOW - generated_delta).isoformat()
    return {
        "report_id": "v6_test",
        "timestamp": NOW - generated_delta,
        "report_json": {
            "generated_at": generated_at,
            "verdict": {
                "tactical_24h": {"direction": "neutral", "confidence": 55},
                "secondary_7d": {"direction": "bullish", "confidence": 48},
            },
            "event_risk": {
                "risk_level": "low",
                "summary": "No scheduled high-impact event is inside the next 72 hours.",
                "source_health": {
                    "news": {"status": "fresh", "age_seconds": 120},
                    "calendar": {"status": "fresh", "age_seconds": 90},
                },
            },
            "evidence_matrix": {
                "horizons": {
                    horizon: {
                        "bias": "neutral",
                        "score": 0.05,
                        "coverage": 1.0,
                        "conflict_count": 0,
                        "conflicts": [],
                        "unavailable_rows": 0,
                        "stale_rows": 0,
                        "verdict_comparison": "neutral_evidence",
                    }
                    for horizon in ("24h", "72h")
                },
                "rows": [
                    {
                        "key": "price_action",
                        "label": "Price action",
                        "source": "Bybit spot",
                        "role": "directional_evidence",
                        "source_health": {"status": "fresh", "age_seconds": 30},
                        "horizons": {
                            "24h": {"direction": "neutral"},
                            "72h": {"direction": "neutral"},
                        },
                        "changes": {"changed": False, "horizons": {}},
                    },
                    {
                        "key": "liquidity",
                        "label": "Liquidation liquidity",
                        "source": "Binance estimated map",
                        "role": "directional_evidence",
                        "source_health": {"status": "fresh", "age_seconds": 30},
                        "horizons": {
                            "24h": {"direction": "neutral"},
                            "72h": {"direction": "neutral"},
                        },
                        "changes": {"changed": False, "horizons": {}},
                    },
                ],
                "changes": {"has_previous": True, "changed_rows": 0},
            },
        },
    }


def _redis(connected: bool = True) -> dict:
    if connected:
        return {
            "connected": True,
            "total_keys": 42,
            "memory_used": "2M",
            "signal_keys": 10,
            "market_keys": 5,
        }
    return {"connected": False, "error": "connection refused"}


def test_phase7_reports_healthy_runtime_without_decision_authority():
    health = build_operational_health_from_report(
        _report(),
        now=NOW,
        redis_info=_redis(True),
        systemd_status=_systemd(True),
    )

    assert health["phase"] == 7
    assert health["status"] == "healthy"
    assert health["decision_authority"] is False
    assert health["latest_report"]["report_id"] == "v6_test"
    assert health["alerts"] == []
    assert {check["key"] for check in health["checks"]} >= {
        "api",
        "redis",
        "latest_report",
        "dashboard_health",
        "source_health",
        "backend_service",
        "arena_timer",
        "evaluator_timer",
        "liquidation_stream",
    }


def test_phase7_stale_report_creates_warning_alert():
    health = build_operational_health_from_report(
        _report(generated_delta=timedelta(hours=10)),
        now=NOW,
        redis_info=_redis(True),
        systemd_status=_systemd(True),
    )

    assert health["status"] == "degraded"
    latest = next(item for item in health["checks"] if item["key"] == "latest_report")
    assert latest["severity"] == "warning"
    assert "stale" in latest["detail"]
    assert any(alert["key"] == "latest_report" for alert in health["alerts"])


def test_phase7_expired_report_is_critical():
    health = build_operational_health_from_report(
        _report(generated_delta=timedelta(hours=30)),
        now=NOW,
        redis_info=_redis(True),
        systemd_status=_systemd(True),
    )

    assert health["status"] == "critical"
    latest = next(item for item in health["checks"] if item["key"] == "latest_report")
    assert latest["severity"] == "critical"
    assert latest["runbook"] == "latest_report"


def test_phase7_inactive_timer_is_critical_with_runbook_key():
    systemd = _systemd(True)
    systemd["arena_timer"] = {
        "unit": SYSTEMD_UNITS["arena_timer"],
        "active_state": "inactive",
        "available": True,
        "returncode": 3,
    }

    health = build_operational_health_from_report(
        _report(),
        now=NOW,
        redis_info=_redis(True),
        systemd_status=systemd,
    )

    assert health["status"] == "critical"
    alert = next(item for item in health["alerts"] if item["key"] == "arena_timer")
    assert alert["severity"] == "critical"
    assert alert["runbook"] == "arena_timer"


def test_phase7_redis_failure_is_critical():
    health = build_operational_health_from_report(
        _report(),
        now=NOW,
        redis_info=_redis(False),
        systemd_status=_systemd(True),
    )

    assert health["status"] == "critical"
    redis = next(item for item in health["checks"] if item["key"] == "redis")
    assert redis["severity"] == "critical"
    assert "connection refused" in redis["detail"]


def test_phase7_source_unavailable_degrades_runtime():
    report = _report()
    report = deepcopy(report)
    row = report["report_json"]["evidence_matrix"]["rows"][1]
    row["source_health"] = {"status": "unavailable", "age_seconds": None}
    for horizon in ("24h", "72h"):
        report["report_json"]["evidence_matrix"]["horizons"][horizon]["coverage"] = 0.75
        report["report_json"]["evidence_matrix"]["horizons"][horizon]["unavailable_rows"] = 1

    health = build_operational_health_from_report(
        report,
        now=NOW,
        redis_info=_redis(True),
        systemd_status=_systemd(True),
    )

    assert health["status"] == "degraded"
    source = next(item for item in health["checks"] if item["key"] == "source_health")
    assert source["severity"] == "warning"
    assert "1 unavailable" in source["detail"]
