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
from app.services.verdict_schema import ReportBundleV6

logger = logging.getLogger(__name__)


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

        outcomes_to_create = [
            ("24h", verdict.tactical_24h.direction, verdict.tactical_24h.confidence),
            ("72h", verdict.secondary_7d.direction, verdict.secondary_7d.confidence),
            ("7d", verdict.secondary_7d.direction, verdict.secondary_7d.confidence),
            ("30d", verdict.primary_30d.direction, verdict.primary_30d.confidence),
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

        logger.info(
            f"Persisted v6 report {bundle.report_id} (pk={report_pk}) "
            f"+ 4 pending outcomes"
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


__all__ = ["persist_report_to_db", "get_previous_verdict_context"]
