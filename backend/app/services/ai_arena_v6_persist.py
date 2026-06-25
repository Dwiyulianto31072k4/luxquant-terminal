"""
LuxQuant AI Arena v6.1 — Worker DB Persistence
================================================
Helper functions for persisting v6 reports to DB and creating pending outcomes.

This is a SEPARATE FILE so it doesn't bloat ai_arena_v6_worker.py.
Import from worker via:

    from app.services.ai_arena_v6_persist import persist_report_to_db, get_previous_verdict_context

Pattern matches existing v4 worker (ai_arena_worker.py uses SessionLocal directly).
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.ai_arena_v6 import (
    AIArenaVerdictOutcome,
    DEFAULT_NEUTRAL_BAND_PCT,
    DEFAULT_THRESHOLD_PCT,
    HORIZONS_HOURS,
)
from app.services.compass_contract import ContractValidationError, validate_dynamic_scenario_contract
from app.services.verdict_schema import ReportBundleV6

logger = logging.getLogger(__name__)


def _stable_json_dumps(value: object) -> str:
    """Compact JSON for SQL JSON/JSONB parameters."""
    return json.dumps(value, default=str, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _persist_dynamic_scenario_contract(
    db: Session,
    bundle: ReportBundleV6,
    report_pk: int,
    called_at: datetime,
) -> None:
    """
    Persist Compass 2.0 target-first contract and seed its event timeline.

    Legacy/backfilled reports can still exist without scenario_contract. New
    worker output should already validate before persistence.
    """
    try:
        contract = validate_dynamic_scenario_contract(bundle.verdict.scenario_contract)
    except ContractValidationError as exc:
        logger.warning("Compass 2.0 contract skipped for %s: %s", bundle.report_id, exc)
        return

    contract_json = contract.model_dump(mode="json")
    source_json = {
        "report_id": bundle.report_id,
        "schema_version": bundle.schema_version,
        "generated_at": bundle.generated_at,
        "critique_decision": bundle.critique.decision,
        "cycle_position": bundle.cycle_position,
        "liquidity": bundle.liquidity,
        "event_risk": bundle.event_risk,
        "evidence_matrix": bundle.evidence_matrix,
    }
    source_json_text = _stable_json_dumps(source_json)
    snapshot_hash = hashlib.sha256(source_json_text.encode("utf-8")).hexdigest()

    read_id = f"read_{bundle.report_id}"
    projection_id = f"cmp_{bundle.report_id}_v1"
    review_policy = contract.review_policy

    db.execute(text("""
        INSERT INTO compass_reads (
            read_id,
            report_pk,
            report_id,
            issued_at,
            btc_reference_price,
            snapshot_hash,
            schema_version,
            model_version,
            prompt_version,
            source_json
        ) VALUES (
            :read_id,
            :report_pk,
            :report_id,
            :issued_at,
            :btc_reference_price,
            :snapshot_hash,
            :schema_version,
            :model_version,
            :prompt_version,
            CAST(:source_json AS JSONB)
        )
        ON CONFLICT (read_id) DO UPDATE SET
            report_pk = EXCLUDED.report_pk,
            report_id = EXCLUDED.report_id,
            btc_reference_price = EXCLUDED.btc_reference_price,
            snapshot_hash = EXCLUDED.snapshot_hash,
            schema_version = EXCLUDED.schema_version,
            model_version = EXCLUDED.model_version,
            prompt_version = EXCLUDED.prompt_version,
            source_json = EXCLUDED.source_json
    """), {
        "read_id": read_id,
        "report_pk": report_pk,
        "report_id": bundle.report_id,
        "issued_at": called_at,
        "btc_reference_price": contract.reference_price,
        "snapshot_hash": snapshot_hash,
        "schema_version": bundle.schema_version,
        "model_version": bundle.cost_breakdown.get("stage2", {}).get("model", "unknown"),
        "prompt_version": "compass_2_target_first_v1",
        "source_json": source_json_text,
    })

    db.execute(text("""
        INSERT INTO compass_projection_contracts (
            projection_id,
            read_id,
            version,
            status,
            primary_bias,
            reference_price,
            support_level,
            support_trigger,
            confirmation_level,
            confirmation_trigger,
            primary_touch_level,
            primary_touch_trigger,
            extension_low,
            extension_high,
            invalidation_level,
            invalidation_trigger,
            alternative_path,
            market_mode,
            expected_pace,
            soft_review_after_minutes,
            stale_after_minutes,
            probabilities,
            key_conditions,
            key_risks,
            contract_json,
            active_from
        ) VALUES (
            :projection_id,
            :read_id,
            1,
            'ACTIVE',
            :primary_bias,
            :reference_price,
            :support_level,
            :support_trigger,
            :confirmation_level,
            :confirmation_trigger,
            :primary_touch_level,
            :primary_touch_trigger,
            :extension_low,
            :extension_high,
            :invalidation_level,
            :invalidation_trigger,
            CAST(:alternative_path AS JSONB),
            :market_mode,
            :expected_pace,
            :soft_review_after_minutes,
            :stale_after_minutes,
            CAST(:probabilities AS JSONB),
            CAST(:key_conditions AS JSONB),
            CAST(:key_risks AS JSONB),
            CAST(:contract_json AS JSONB),
            :active_from
        )
        ON CONFLICT (projection_id) DO UPDATE SET
            status = EXCLUDED.status,
            primary_bias = EXCLUDED.primary_bias,
            reference_price = EXCLUDED.reference_price,
            support_level = EXCLUDED.support_level,
            support_trigger = EXCLUDED.support_trigger,
            confirmation_level = EXCLUDED.confirmation_level,
            confirmation_trigger = EXCLUDED.confirmation_trigger,
            primary_touch_level = EXCLUDED.primary_touch_level,
            primary_touch_trigger = EXCLUDED.primary_touch_trigger,
            extension_low = EXCLUDED.extension_low,
            extension_high = EXCLUDED.extension_high,
            invalidation_level = EXCLUDED.invalidation_level,
            invalidation_trigger = EXCLUDED.invalidation_trigger,
            alternative_path = EXCLUDED.alternative_path,
            market_mode = EXCLUDED.market_mode,
            expected_pace = EXCLUDED.expected_pace,
            soft_review_after_minutes = EXCLUDED.soft_review_after_minutes,
            stale_after_minutes = EXCLUDED.stale_after_minutes,
            probabilities = EXCLUDED.probabilities,
            key_conditions = EXCLUDED.key_conditions,
            key_risks = EXCLUDED.key_risks,
            contract_json = EXCLUDED.contract_json
    """), {
        "projection_id": projection_id,
        "read_id": read_id,
        "primary_bias": contract.primary_bias,
        "reference_price": contract.reference_price,
        "support_level": contract.support.level,
        "support_trigger": contract.support.trigger,
        "confirmation_level": contract.confirmation.level,
        "confirmation_trigger": contract.confirmation.trigger,
        "primary_touch_level": contract.primary_touch.level,
        "primary_touch_trigger": contract.primary_touch.trigger,
        "extension_low": contract.extension_zone.price_low,
        "extension_high": contract.extension_zone.price_high,
        "invalidation_level": contract.invalidation.level,
        "invalidation_trigger": contract.invalidation.trigger,
        "alternative_path": _stable_json_dumps(contract.alternative_path),
        "market_mode": contract.market_mode,
        "expected_pace": review_policy.expected_pace,
        "soft_review_after_minutes": review_policy.soft_review_after_minutes,
        "stale_after_minutes": review_policy.stale_after_minutes,
        "probabilities": _stable_json_dumps(contract.probabilities.model_dump(mode="json")),
        "key_conditions": _stable_json_dumps(contract.key_conditions),
        "key_risks": _stable_json_dumps(contract.key_risks),
        "contract_json": _stable_json_dumps(contract_json),
        "active_from": called_at,
    })

    event_json = {
        "primary_bias": contract.primary_bias,
        "reference_price": contract.reference_price,
        "support": contract.support.model_dump(mode="json"),
        "confirmation": contract.confirmation.model_dump(mode="json"),
        "primary_touch": contract.primary_touch.model_dump(mode="json"),
        "invalidation": contract.invalidation.model_dump(mode="json"),
        "market_mode": contract.market_mode,
        "review_policy": review_policy.model_dump(mode="json"),
    }
    db.execute(text("""
        INSERT INTO compass_projection_events (
            projection_id,
            event_time,
            event_type,
            price,
            source,
            evidence_json
        )
        SELECT
            :projection_id,
            :event_time,
            'FORECAST_ISSUED',
            :price,
            'ai_arena_v6_worker',
            CAST(:evidence_json AS JSONB)
        WHERE NOT EXISTS (
            SELECT 1
            FROM compass_projection_events
            WHERE projection_id = :projection_id
              AND event_type = 'FORECAST_ISSUED'
        )
    """), {
        "projection_id": projection_id,
        "event_time": called_at,
        "price": contract.reference_price,
        "evidence_json": _stable_json_dumps(event_json),
    })

    logger.info("Persisted Compass 2.0 contract %s for report %s", projection_id, bundle.report_id)


def persist_report_to_db(bundle: ReportBundleV6) -> int:
    """
    Insert v6 report into ai_arena_reports + create 4 pending outcome rows.

    Returns the new ai_arena_reports.id (PK).

    Uses raw SQL for ai_arena_reports to avoid touching the existing
    AIArenaReport SQLAlchemy model (which v4 worker still uses).
    """
    db: Session = SessionLocal()
    try:
        verdict = bundle.verdict
        critique = bundle.critique
        cycle = bundle.cycle_position

        # Insert into ai_arena_reports
        sql = text("""
            INSERT INTO ai_arena_reports (
                report_id, timestamp, generated_in_seconds, data_sources_count,
                btc_price, fear_greed, sentiment, confidence, bias_direction,
                report_json, schema_version,
                primary_direction_30d, primary_confidence_30d,
                secondary_direction_7d, secondary_confidence_7d,
                tactical_direction_24h, tactical_confidence_24h,
                cycle_score, cycle_phase,
                critique_decision, total_cost_usd,
                bluf_text, is_anomaly_triggered, anomaly_reason
            ) VALUES (
                :report_id, NOW(), :gen_secs, :sources,
                :btc_price, :fear_greed, :sentiment, :confidence, :bias,
                CAST(:report_json AS JSON), :schema_version,
                :p30d_dir, :p30d_conf,
                :s7d_dir, :s7d_conf,
                :t24h_dir, :t24h_conf,
                :cycle_score, :cycle_phase,
                :critique, :cost,
                :bluf, :is_anomaly, :anomaly_reason
            )
            RETURNING id
        """)

        # Map verdict.primary_30d to v4 columns for backward compat with existing UI
        # (sentiment/confidence/bias_direction expected by v4 endpoints)
        sentiment_map = {"bullish": "bullish", "bearish": "bearish", "neutral": "cautious"}
        bias_map = {"bullish": "LONG", "bearish": "SHORT", "neutral": "NEUTRAL"}

        # Compute total elapsed
        total_cost = bundle.cost_breakdown.get("total_usd", 0.0)
        elapsed = sum(
            bundle.cost_breakdown.get(s, {}).get("elapsed_s", 0.0)
            for s in ("stage1", "stage2", "stage3")
        )

        ok_sources = sum(
            1 for v in bundle.bg_snapshot_summary.values() if v.get("ok")
        )

        # Pull fear_greed from BG snapshot
        fg_metric = bundle.bg_snapshot_summary.get("fear-greed", {})
        fear_greed_value = (
            int(fg_metric.get("value")) if fg_metric.get("ok") and fg_metric.get("value") is not None
            else None
        )

        result = db.execute(sql, {
            "report_id": bundle.report_id,
            "gen_secs": elapsed,
            "sources": ok_sources,
            "btc_price": bundle.btc_price,
            "fear_greed": fear_greed_value,
            "sentiment": sentiment_map.get(verdict.primary_30d.direction, "cautious"),
            "confidence": verdict.primary_30d.confidence,
            "bias": bias_map.get(verdict.primary_30d.direction, "NEUTRAL"),
            "report_json": bundle.model_dump_json(),
            "schema_version": bundle.schema_version,
            "p30d_dir": verdict.primary_30d.direction,
            "p30d_conf": verdict.primary_30d.confidence,
            "s7d_dir": verdict.secondary_7d.direction,
            "s7d_conf": verdict.secondary_7d.confidence,
            "t24h_dir": verdict.tactical_24h.direction,
            "t24h_conf": verdict.tactical_24h.confidence,
            "cycle_score": cycle.get("score"),
            "cycle_phase": cycle.get("phase"),
            "critique": critique.decision,
            "cost": total_cost,
            "bluf": verdict.headline,
            "is_anomaly": bundle.is_anomaly_triggered,
            "anomaly_reason": bundle.anomaly_reason,
        })
        report_pk = result.scalar()

        # Create 4 pending outcome rows (one per horizon)
        # Use 30d horizon's verdict as the canonical "verdict" for outcome tracking
        # Logic: each horizon evaluates the verdict APPROPRIATE for that horizon
        called_at = datetime.now(timezone.utc)

        try:
            _persist_dynamic_scenario_contract(db, bundle, report_pk, called_at)
        except Exception as exc:
            logger.warning(
                "Compass 2.0 contract persistence skipped for %s (%s)",
                bundle.report_id,
                type(exc).__name__,
            )

        # Reframe: only the edge-proven horizons are projected & evaluated.
        # 7d/30d dropped as directional predictions (see ledger: 7d ~26%).
        outcomes_to_create = [
            ("24h", verdict.tactical_24h.direction, verdict.tactical_24h.confidence),
            ("72h", verdict.secondary_7d.direction, verdict.secondary_7d.confidence),
        ]

        for horizon, direction, confidence in outcomes_to_create:
            target_at = called_at + timedelta(hours=HORIZONS_HOURS[horizon])
            outcome_row = AIArenaVerdictOutcome(
                report_id=report_pk,
                report_uuid=bundle.report_id,
                horizon=horizon,
                direction=direction,
                confidence=confidence,
                price_at_call=bundle.btc_price,
                called_at=called_at,
                horizon_target_at=target_at,
                outcome="pending",
                threshold_pct=DEFAULT_THRESHOLD_PCT,
                neutral_band_pct=DEFAULT_NEUTRAL_BAND_PCT,
            )
            db.add(outcome_row)

        db.commit()

        try:
            from app.services.compass_report_pdf import ensure_report_pdf

            ensure_report_pdf(
                bundle.report_id,
                bundle.model_dump(mode="json"),
                report_timestamp=called_at,
            )
        except Exception as exc:
            logger.warning(
                "Compass PDF archive generation skipped for %s (%s)",
                bundle.report_id,
                type(exc).__name__,
            )

        logger.info(
            f"Persisted v6 report {bundle.report_id} (pk={report_pk}) "
            f"+ {len(outcomes_to_create)} pending outcomes; Compass 2.0 contract attempted"
        )
        return report_pk

    except Exception:
        db.rollback()
        logger.exception("Failed to persist v6 report")
        raise
    finally:
        db.close()


def get_previous_verdict_context() -> Optional[dict]:
    """
    Pull last v6 report from DB to provide continuity context for next Stage 2.

    Returns dict with shape expected by ai_arena_v6_worker:
      {
        headline, primary_direction, primary_confidence,
        tactical_direction, btc_price, age_hours
      }
    Or None if no prior v6 report exists.
    """
    db: Session = SessionLocal()
    try:
        sql = text("""
            SELECT
                report_id, btc_price, timestamp,
                primary_direction_30d, primary_confidence_30d,
                tactical_direction_24h, bluf_text
            FROM ai_arena_reports
            WHERE schema_version = 'v6.1'
            ORDER BY timestamp DESC
            LIMIT 1
        """)
        row = db.execute(sql).first()
        if not row:
            return None

        ts = row.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600

        return {
            "report_id": row.report_id,
            "headline": row.bluf_text,
            "primary_direction": row.primary_direction_30d,
            "primary_confidence": row.primary_confidence_30d,
            "tactical_direction": row.tactical_direction_24h,
            "btc_price": row.btc_price,
            "age_hours": round(age_hours, 1),
        }
    finally:
        db.close()


def get_previous_evidence_matrix() -> Optional[dict]:
    """Return the most recent persisted evidence matrix, if one exists."""
    db: Session = SessionLocal()
    try:
        row = db.execute(text("""
            SELECT report_json
            FROM ai_arena_reports
            WHERE schema_version = 'v6.1'
            ORDER BY timestamp DESC
            LIMIT 1
        """)).first()
        if not row or not isinstance(row.report_json, dict):
            return None
        matrix = row.report_json.get("evidence_matrix")
        return matrix if isinstance(matrix, dict) else None
    finally:
        db.close()


__all__ = [
    "persist_report_to_db",
    "get_previous_verdict_context",
    "get_previous_evidence_matrix",
]
