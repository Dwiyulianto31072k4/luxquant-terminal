"""
LuxQuant AI Arena v6.1 — Verdict Outcome Model
================================================
Adds AIArenaVerdictOutcome model for tracking hit/miss per horizon.
Existing AIArenaReport in app/models/ai_arena.py also gets new columns
(see v6_verdict_tracking.sql migration), reflected here as a thin
companion view — but we DO NOT modify the existing model file directly,
to avoid breaking v4 worker that imports it.

Pattern:
- This file declares AIArenaVerdictOutcome (new table)
- For accessing v6-specific columns on ai_arena_reports, use raw SQL
  or extend the existing model in a follow-up commit.

Horizon values: '24h', '72h', '7d', '30d'
Outcome values: 'pending', 'hit', 'miss', 'expired'

Threshold logic:
- bullish HIT if move > +1%
- bearish HIT if move < -1%
- neutral HIT if -2% <= move <= +2%
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Double,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.core.database import Base


class AIArenaVerdictOutcome(Base):
    __tablename__ = "ai_arena_verdict_outcomes"

    id = Column(BigInteger, primary_key=True, index=True)
    report_id = Column(
        Integer,
        ForeignKey("ai_arena_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_uuid = Column(String(40), nullable=False, index=True)  # e.g. v6_cc7bcc8f49

    horizon = Column(String(10), nullable=False)  # '24h' | '72h' | '7d' | '30d'

    # Verdict at call
    direction = Column(String(10), nullable=False)  # bullish | bearish | neutral
    confidence = Column(Integer, nullable=True)  # 0-100
    price_at_call = Column(Double, nullable=False)
    called_at = Column(DateTime(timezone=True), nullable=False)

    # Evaluation target
    horizon_target_at = Column(DateTime(timezone=True), nullable=False)
    price_at_horizon = Column(Double, nullable=True)
    move_pct = Column(Double, nullable=True)
    outcome = Column(String(15), nullable=False, default="pending")  # pending|hit|miss|expired

    # Threshold metadata (for transparency)
    threshold_pct = Column(Double, default=1.0)
    neutral_band_pct = Column(Double, default=2.0)

    evaluated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("report_id", "horizon", name="uq_outcome_report_horizon"),
    )

    def __repr__(self) -> str:
        return (
            f"<VerdictOutcome {self.report_uuid} {self.horizon} "
            f"{self.direction} {self.outcome} move={self.move_pct}>"
        )


# Horizon definitions (used by worker + evaluator)
HORIZONS_HOURS: dict[str, int] = {
    "24h": 24,
    "72h": 72,
    "7d": 24 * 7,
    "30d": 24 * 30,
}

# Threshold defaults (also stored per-row for reproducibility)
DEFAULT_THRESHOLD_PCT = 1.0      # bullish/bearish hit threshold
DEFAULT_NEUTRAL_BAND_PCT = 2.0   # neutral hit ±band


def evaluate_outcome(
    direction: str,
    price_at_call: float,
    price_at_horizon: float,
    threshold_pct: float = DEFAULT_THRESHOLD_PCT,
    neutral_band_pct: float = DEFAULT_NEUTRAL_BAND_PCT,
) -> tuple[str, float]:
    """
    Evaluate hit/miss given direction + prices.
    Returns (outcome, move_pct).

    Logic:
    - bullish HIT if move > +threshold_pct
    - bearish HIT if move < -threshold_pct
    - neutral HIT if abs(move) <= neutral_band_pct
    """
    if price_at_call <= 0:
        return "expired", 0.0

    move_pct = (price_at_horizon / price_at_call - 1.0) * 100.0

    direction_lower = (direction or "").lower()

    if direction_lower == "bullish":
        outcome = "hit" if move_pct >= threshold_pct else "miss"
    elif direction_lower == "bearish":
        outcome = "hit" if move_pct <= -threshold_pct else "miss"
    elif direction_lower == "neutral":
        outcome = "hit" if abs(move_pct) <= neutral_band_pct else "miss"
    else:
        outcome = "expired"

    return outcome, round(move_pct, 4)


__all__ = [
    "AIArenaVerdictOutcome",
    "HORIZONS_HOURS",
    "DEFAULT_THRESHOLD_PCT",
    "DEFAULT_NEUTRAL_BAND_PCT",
    "evaluate_outcome",
]
