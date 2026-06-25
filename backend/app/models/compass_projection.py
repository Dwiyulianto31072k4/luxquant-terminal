"""SQLAlchemy models for Compass 2.0 target-first projections.

These tables are additive. They do not replace ai_arena_reports or the official
signals / signal_updates ledgers. Legacy horizon evaluation can remain visible
while new structured contracts accumulate target-first audit history.
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.core.database import Base


class CompassRead(Base):
    __tablename__ = "compass_reads"

    read_id = Column(String(48), primary_key=True)
    report_pk = Column(Integer, ForeignKey("ai_arena_reports.id", ondelete="SET NULL"), index=True)
    report_id = Column(String(40), index=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, index=True)
    btc_reference_price = Column(Numeric(30, 12), nullable=False)
    snapshot_hash = Column(String(80), nullable=True, index=True)
    schema_version = Column(String(20), nullable=False, default="compass_2.0")
    model_version = Column(String(80), nullable=True)
    prompt_version = Column(String(80), nullable=True)
    source_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CompassProjectionContract(Base):
    __tablename__ = "compass_projection_contracts"

    projection_id = Column(String(64), primary_key=True)
    read_id = Column(String(48), ForeignKey("compass_reads.read_id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(32), nullable=False, index=True, default="ACTIVE")
    primary_bias = Column(String(48), nullable=False)
    reference_price = Column(Numeric(30, 12), nullable=False)

    support_level = Column(Numeric(30, 12), nullable=False)
    support_trigger = Column(String(32), nullable=False)
    confirmation_level = Column(Numeric(30, 12), nullable=False)
    confirmation_trigger = Column(String(32), nullable=False)
    primary_touch_level = Column(Numeric(30, 12), nullable=False)
    primary_touch_trigger = Column(String(32), nullable=False)
    extension_low = Column(Numeric(30, 12), nullable=False)
    extension_high = Column(Numeric(30, 12), nullable=False)
    invalidation_level = Column(Numeric(30, 12), nullable=False)
    invalidation_trigger = Column(String(32), nullable=False)

    alternative_path = Column(JSON, nullable=False)
    market_mode = Column(String(48), nullable=False, index=True)
    expected_pace = Column(String(32), nullable=False)
    soft_review_after_minutes = Column(Integer, nullable=False)
    stale_after_minutes = Column(Integer, nullable=False)
    probabilities = Column(JSON, nullable=False)
    key_conditions = Column(JSON, nullable=False)
    key_risks = Column(JSON, nullable=False)
    contract_json = Column(JSON, nullable=False)

    active_from = Column(DateTime(timezone=True), nullable=False)
    superseded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("read_id", "version", name="uq_compass_projection_read_version"),
    )


class CompassProjectionEvent(Base):
    __tablename__ = "compass_projection_events"

    event_id = Column(BigInteger, primary_key=True, index=True)
    projection_id = Column(String(64), ForeignKey("compass_projection_contracts.projection_id", ondelete="CASCADE"), nullable=False, index=True)
    event_time = Column(DateTime(timezone=True), nullable=False, index=True)
    event_type = Column(String(48), nullable=False, index=True)
    price = Column(Numeric(30, 12), nullable=True)
    source = Column(String(80), nullable=True)
    evidence_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CompassProjectionResolution(Base):
    __tablename__ = "compass_projection_resolutions"

    resolution_id = Column(BigInteger, primary_key=True, index=True)
    projection_id = Column(String(64), ForeignKey("compass_projection_contracts.projection_id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    outcome = Column(String(48), nullable=False, index=True)
    first_barrier = Column(String(48), nullable=True)
    first_barrier_at = Column(DateTime(timezone=True), nullable=True)
    first_barrier_price = Column(Numeric(30, 12), nullable=True)
    max_favorable_excursion_pct = Column(Numeric(18, 8), nullable=True)
    max_adverse_excursion_pct = Column(Numeric(18, 8), nullable=True)
    time_to_confirmation_seconds = Column(Integer, nullable=True)
    time_to_target_seconds = Column(Integer, nullable=True)
    time_to_invalidation_seconds = Column(Integer, nullable=True)
    reason_codes = Column(JSON, nullable=False, default=list)
    observed_facts = Column(JSON, nullable=False, default=dict)
    interpretation = Column(Text, nullable=True)
    evaluator_version = Column(String(40), nullable=False)
    policy_version = Column(String(40), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BTCMarketContextSnapshot(Base):
    __tablename__ = "btc_market_context_snapshots"

    snapshot_id = Column(String(64), primary_key=True)
    captured_at = Column(DateTime(timezone=True), nullable=False, index=True)
    btc_price = Column(Numeric(30, 12), nullable=False)
    market_mode = Column(String(48), nullable=False, index=True)
    dominance_state = Column(String(48), nullable=True)
    breadth_state = Column(String(48), nullable=True)
    volatility_regime = Column(String(48), nullable=True)
    liquidity_state = Column(String(48), nullable=True)
    funding_state = Column(String(48), nullable=True)
    open_interest_state = Column(String(48), nullable=True)
    is_data_fresh = Column(Boolean, nullable=False, default=True)
    freshness_seconds = Column(Integer, nullable=True)
    snapshot_json = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SignalBTCAssessment(Base):
    __tablename__ = "signal_btc_assessments"

    assessment_id = Column(BigInteger, primary_key=True, index=True)
    signal_id = Column(String, ForeignKey("signals.signal_id", ondelete="CASCADE"), nullable=False, index=True)
    projection_id = Column(String(64), ForeignKey("compass_projection_contracts.projection_id", ondelete="SET NULL"), nullable=True, index=True)
    snapshot_id = Column(String(64), ForeignKey("btc_market_context_snapshots.snapshot_id", ondelete="SET NULL"), nullable=True, index=True)
    as_of = Column(DateTime(timezone=True), nullable=False, index=True)
    btc_impact = Column(String(32), nullable=False, index=True)
    entry_aggression = Column(String(32), nullable=False, index=True)
    holder_context = Column(String(40), nullable=False)
    btc_vulnerability_score = Column(Integer, nullable=True)
    reason_codes = Column(JSON, nullable=False, default=list)
    explanation = Column(Text, nullable=True)
    source_freshness_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
