"""
LuxQuant AI Arena v6 — Verdict Schema
======================================
Pydantic models for strict validation of AI pipeline output.
Used by ai_arena_v6_worker.py to ensure each stage returns valid structured data
(prevents hallucination, missing fields, malformed responses).

Pipeline:
  Stage 1 (GPT-4o-mini)  → LayerBriefBundle      (compressed data per layer)
  Stage 2 (DeepSeek R1)  → CompleteVerdict        (verdict + reasoning chain)
  Stage 3 (GPT-4o)       → SelfCritique           (audit + warnings)

Final report stored in DB combines all three stages plus raw inputs.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ════════════════════════════════════════════════════════════════════════
# Stage 1 — Layer Briefs (GPT-4o-mini compresses raw data into narratives)
# ════════════════════════════════════════════════════════════════════════

class LayerBrief(BaseModel):
    """One compressed brief per confluence layer."""
    layer: Literal["macro", "smart_money", "onchain"]
    direction: Literal["bullish", "bearish", "neutral"]
    strength: float = Field(ge=0.0, le=1.0)
    headline: str = Field(max_length=140, description="Single-sentence summary")
    key_points: list[str] = Field(min_length=2, max_length=5)
    notable_metrics: list[str] = Field(
        default_factory=list,
        max_length=4,
        description="2-4 most important metrics with values, e.g. 'M2 +6.93% YoY'",
    )

    @field_validator("key_points")
    @classmethod
    def _trim_points(cls, v: list[str]) -> list[str]:
        return [p.strip() for p in v if p and p.strip()]


class CycleBrief(BaseModel):
    """Cycle position interpretation."""
    score: float = Field(ge=0.0, le=100.0)
    phase: Literal[
        "DEEP_BOTTOM", "ACCUMULATION", "EARLY_BULL",
        "MID_BULL", "LATE_BULL", "DISTRIBUTION", "TOP",
    ]
    confidence: Literal["low", "medium", "high"]
    interpretation: str = Field(max_length=240)


class LayerBriefBundle(BaseModel):
    """Full Stage 1 output — all layer briefs + cycle brief."""
    macro: LayerBrief
    smart_money: LayerBrief
    onchain: LayerBrief
    cycle: CycleBrief
    overall_setup: str = Field(
        max_length=280,
        description="One-paragraph synthesis of the market backdrop",
    )


# ════════════════════════════════════════════════════════════════════════
# Stage 2 — Complete Verdict (DeepSeek R1 reasons + decides)
# ════════════════════════════════════════════════════════════════════════

class ReasoningStep(BaseModel):
    """One step in the AI's chain-of-thought."""
    step: int = Field(ge=1, le=8)
    title: str = Field(max_length=80)
    observation: str = Field(max_length=260)
    interpretation: str = Field(max_length=260)
    implication: str = Field(max_length=200)


class HorizonVerdict(BaseModel):
    """Verdict for a single time horizon."""
    direction: Literal["bullish", "bearish", "neutral"]
    confidence: int = Field(ge=0, le=100)
    rationale: str = Field(max_length=180)


class InvalidationLevel(BaseModel):
    """Specific price level that would flip the verdict."""
    direction: Literal["bullish_invalidated", "bearish_invalidated"]
    price: float
    reason: str = Field(max_length=140)


class TacticalZone(BaseModel):
    """Demand/Supply/Fair zone with reasoning."""
    kind: Literal["demand", "fair_value", "supply"]
    price_low: float
    price_high: float
    why: str = Field(max_length=180)
    liquidity_note: Optional[str] = Field(default=None, max_length=140)


class TripleScreenItem(BaseModel):
    """One timeframe of the triple-screen."""
    timeframe: Literal["1D", "4H", "1H"]
    state: Literal["UPTREND", "DOWNTREND", "BULLISH", "BEARISH", "NEUTRAL", "MIXED"]
    note: str = Field(max_length=120)


class RiskScenario(BaseModel):
    """One specific risk-watch scenario."""
    title: str = Field(max_length=80)
    severity: Literal["low", "medium", "high"]
    threshold: str = Field(max_length=120, description="e.g. 'BTC closes < $72,500'")
    why_matters: str = Field(max_length=200)


class CompleteVerdict(BaseModel):
    """Full Stage 2 output — verdict + reasoning + invalidation + zones."""
    headline: str = Field(max_length=120, description="One-line BLUF, e.g. 'Cautiously Bullish'")
    narrative: str = Field(
        max_length=480,
        description="2-3 sentence narrative of the current setup",
    )

    # Multi-horizon verdicts
    primary_30d: HorizonVerdict
    secondary_7d: HorizonVerdict
    tactical_24h: HorizonVerdict

    # Reasoning chain (5-7 steps)
    reasoning_chain: list[ReasoningStep] = Field(min_length=4, max_length=7)

    # Risk & levels
    invalidation_levels: list[InvalidationLevel] = Field(min_length=2, max_length=2)
    zones_to_watch: list[TacticalZone] = Field(min_length=3, max_length=3)
    triple_screen: list[TripleScreenItem] = Field(min_length=3, max_length=3)
    risk_scenarios: list[RiskScenario] = Field(min_length=3, max_length=6)

    # What changed (vs previous verdict)
    what_changed: Optional[str] = Field(
        default=None,
        max_length=600,
        description="Why this verdict differs from previous",
    )


# ════════════════════════════════════════════════════════════════════════
# Stage 3 — Self-Critique (GPT-4o audits Stage 2)
# ════════════════════════════════════════════════════════════════════════

class SelfCritique(BaseModel):
    """Stage 3 output — audit of the Stage 2 verdict."""
    decision: Literal["approved", "approved_with_caveat", "needs_revision"]
    overall_assessment: str = Field(max_length=280)
    strengths: list[str] = Field(default_factory=list, max_length=4)
    concerns: list[str] = Field(default_factory=list, max_length=4)
    overconfidence_flag: bool = Field(
        default=False,
        description="True if verdict confidence seems unwarranted by data",
    )
    contradictions_found: list[str] = Field(default_factory=list, max_length=3)
    suggested_caveat: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Disclaimer to surface alongside verdict if needed",
    )


# ════════════════════════════════════════════════════════════════════════
# Final Report Bundle (what gets stored in DB.report_json)
# ════════════════════════════════════════════════════════════════════════

class ReportBundleV6(BaseModel):
    """
    Complete v6 report — combines all three AI stages plus raw inputs.
    Stored as report_json in ai_arena_reports table.
    """
    schema_version: Literal["v6.1"] = "v6.1"
    report_id: str
    generated_at: str  # ISO timestamp
    btc_price: float

    # Stage outputs
    layer_briefs: LayerBriefBundle
    verdict: CompleteVerdict
    critique: SelfCritique

    # Confluence engine raw output (from Phase 1)
    confluence: dict  # ConfluenceResult.to_dict()
    cycle_position: dict  # CyclePositionResult.to_dict()
    bg_snapshot_summary: dict  # {endpoint: {value, ok}}

    # Cost tracking
    cost_breakdown: dict  # {stage1: usd, stage2: usd, stage3: usd, total: usd}

    # Anomaly metadata (if applicable)
    is_anomaly_triggered: bool = False
    anomaly_reason: Optional[str] = None


# ════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════

def _safe_parse[T: BaseModel](model: type[T], data: dict | str) -> T:
    """Parse dict or JSON string into model with helpful errors."""
    import json as _json

    if isinstance(data, str):
        try:
            data = _json.loads(data)
        except _json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}") from e

    return model.model_validate(data)


__all__ = [
    "LayerBrief",
    "CycleBrief",
    "LayerBriefBundle",
    "ReasoningStep",
    "HorizonVerdict",
    "InvalidationLevel",
    "TacticalZone",
    "TripleScreenItem",
    "RiskScenario",
    "CompleteVerdict",
    "SelfCritique",
    "ReportBundleV6",
]
