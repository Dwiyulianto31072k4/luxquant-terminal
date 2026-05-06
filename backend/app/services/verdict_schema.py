"""
LuxQuant AI Arena v6 — Verdict Schema (v6.2 — relaxed)
=========================================================
Pydantic models for strict validation of AI pipeline output.
Used by ai_arena_v6_worker.py to ensure each stage returns valid structured data
(prevents hallucination, missing fields, malformed responses).

Pipeline:
  Stage 1 (GPT-4o-mini)  → LayerBriefBundle      (compressed data per layer)
  Stage 2 (DeepSeek R1)  → CompleteVerdict        (verdict + reasoning chain)
  Stage 3 (GPT-4o)       → SelfCritique           (audit + warnings)

Final report stored in DB combines all three stages plus raw inputs.

CHANGELOG (v6.2):
- Relaxed all max_length by 30-70% to accommodate LLM verbosity
- Added auto-truncation validators (degrade gracefully instead of raise)
- Made risk_scenarios.why_matters optional with default fallback
- Widened reasoning_chain count (3-8 instead of 4-7)
- Widened risk_scenarios count (2-6 instead of 3-6)
- Loosened triple_screen state enum (added MIXED variants)
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ════════════════════════════════════════════════════════════════════════
# Truncation helper — used in field_validators for graceful degradation
# ════════════════════════════════════════════════════════════════════════

def _truncate(value: Optional[str], limit: int) -> Optional[str]:
    """Truncate string to limit, adding ellipsis if cut. None passes through."""
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    if len(value) <= limit:
        return value
    # Cut at last sentence boundary if possible, else hard cut
    cut = value[: limit - 1]
    last_period = cut.rfind(". ")
    if last_period > limit * 0.6:  # if at least 60% of content fits cleanly
        return cut[: last_period + 1].rstrip()
    return cut.rstrip() + "…"


# ════════════════════════════════════════════════════════════════════════
# Stage 1 — Layer Briefs (GPT-4o-mini compresses raw data into narratives)
# ════════════════════════════════════════════════════════════════════════

class LayerBrief(BaseModel):
    """One compressed brief per confluence layer."""
    layer: Literal["macro", "smart_money", "onchain"]
    direction: Literal["bullish", "bearish", "neutral"]
    strength: float = Field(ge=0.0, le=1.0)
    headline: str = Field(max_length=200, description="Single-sentence summary")
    key_points: list[str] = Field(min_length=2, max_length=6)
    notable_metrics: list[str] = Field(
        default_factory=list,
        max_length=6,
        description="2-4 most important metrics with values, e.g. 'M2 +6.93% YoY'",
    )

    @field_validator("headline", mode="before")
    @classmethod
    def _trim_headline(cls, v):
        return _truncate(v, 200)

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
    interpretation: str = Field(max_length=360)

    @field_validator("interpretation", mode="before")
    @classmethod
    def _trim_interp(cls, v):
        return _truncate(v, 360)


class LayerBriefBundle(BaseModel):
    """Full Stage 1 output — all layer briefs + cycle brief."""
    macro: LayerBrief
    smart_money: LayerBrief
    onchain: LayerBrief
    cycle: CycleBrief
    overall_setup: str = Field(
        max_length=480,
        description="One-paragraph synthesis of the market backdrop",
    )

    @field_validator("overall_setup", mode="before")
    @classmethod
    def _trim_setup(cls, v):
        return _truncate(v, 480)


# ════════════════════════════════════════════════════════════════════════
# Stage 2 — Complete Verdict (DeepSeek R1 reasons + decides)
# ════════════════════════════════════════════════════════════════════════

class ReasoningStep(BaseModel):
    """One step in the AI's chain-of-thought."""
    step: int = Field(ge=1, le=10)
    title: str = Field(max_length=120)
    observation: str = Field(max_length=400)
    interpretation: str = Field(max_length=400)
    implication: str = Field(max_length=320)

    @field_validator("title", mode="before")
    @classmethod
    def _trim_title(cls, v):
        return _truncate(v, 120)

    @field_validator("observation", mode="before")
    @classmethod
    def _trim_obs(cls, v):
        return _truncate(v, 400)

    @field_validator("interpretation", mode="before")
    @classmethod
    def _trim_interp(cls, v):
        return _truncate(v, 400)

    @field_validator("implication", mode="before")
    @classmethod
    def _trim_impl(cls, v):
        return _truncate(v, 320)


class HorizonVerdict(BaseModel):
    """Verdict for a single time horizon."""
    direction: Literal["bullish", "bearish", "neutral"]
    confidence: int = Field(ge=0, le=100)
    rationale: str = Field(max_length=280)

    @field_validator("rationale", mode="before")
    @classmethod
    def _trim_rationale(cls, v):
        return _truncate(v, 280)


class InvalidationLevel(BaseModel):
    """Specific price level that would flip the verdict."""
    direction: Literal["bullish_invalidated", "bearish_invalidated"]
    price: float
    reason: str = Field(max_length=220)

    @field_validator("reason", mode="before")
    @classmethod
    def _trim_reason(cls, v):
        return _truncate(v, 220)


class TacticalZone(BaseModel):
    """Demand/Supply/Fair zone with reasoning."""
    kind: Literal["demand", "fair_value", "supply"]
    price_low: float
    price_high: float
    why: str = Field(max_length=280)
    liquidity_note: Optional[str] = Field(default=None, max_length=220)

    @field_validator("why", mode="before")
    @classmethod
    def _trim_why(cls, v):
        return _truncate(v, 280)

    @field_validator("liquidity_note", mode="before")
    @classmethod
    def _trim_liq(cls, v):
        return _truncate(v, 220)


class TripleScreenItem(BaseModel):
    """One timeframe of the triple-screen."""
    timeframe: Literal["1D", "4H", "1H"]
    state: Literal[
        "UPTREND", "DOWNTREND", "BULLISH", "BEARISH",
        "NEUTRAL", "MIXED", "RANGING", "CONSOLIDATING",
    ]
    note: str = Field(max_length=200)

    @field_validator("note", mode="before")
    @classmethod
    def _trim_note(cls, v):
        return _truncate(v, 200)


class RiskScenario(BaseModel):
    """One specific risk-watch scenario."""
    title: str = Field(max_length=120)
    severity: Literal["low", "medium", "high"]
    threshold: str = Field(max_length=200, description="e.g. 'BTC closes < $72,500'")
    why_matters: Optional[str] = Field(
        default="Watch for material impact on verdict thesis.",
        max_length=320,
        description="Why this scenario matters (optional — has fallback default)",
    )

    @field_validator("title", mode="before")
    @classmethod
    def _trim_title(cls, v):
        return _truncate(v, 120)

    @field_validator("threshold", mode="before")
    @classmethod
    def _trim_threshold(cls, v):
        return _truncate(v, 200)

    @field_validator("why_matters", mode="before")
    @classmethod
    def _trim_why(cls, v):
        # Defensive: if LLM omits this field entirely, the default kicks in via Field()
        # If LLM provides it but too long, truncate
        if v is None or v == "":
            return "Watch for material impact on verdict thesis."
        return _truncate(v, 320)


class CompleteVerdict(BaseModel):
    """Full Stage 2 output — verdict + reasoning + invalidation + zones."""
    headline: str = Field(max_length=200, description="One-line BLUF, e.g. 'Cautiously Bullish'")
    narrative: str = Field(
        max_length=720,
        description="2-3 sentence narrative of the current setup",
    )

    # Multi-horizon verdicts
    primary_30d: HorizonVerdict
    secondary_7d: HorizonVerdict
    tactical_24h: HorizonVerdict

    # Reasoning chain (3-8 steps — relaxed from 4-7)
    reasoning_chain: list[ReasoningStep] = Field(min_length=3, max_length=8)

    # Risk & levels
    invalidation_levels: list[InvalidationLevel] = Field(min_length=2, max_length=2)
    zones_to_watch: list[TacticalZone] = Field(min_length=3, max_length=3)
    triple_screen: list[TripleScreenItem] = Field(min_length=3, max_length=3)
    risk_scenarios: list[RiskScenario] = Field(min_length=2, max_length=6)

    # What changed (vs previous verdict)
    what_changed: Optional[str] = Field(
        default=None,
        max_length=600,
        description="Why this verdict differs from previous",
    )

    @field_validator("headline", mode="before")
    @classmethod
    def _trim_headline(cls, v):
        return _truncate(v, 200)

    @field_validator("narrative", mode="before")
    @classmethod
    def _trim_narrative(cls, v):
        return _truncate(v, 720)

    @field_validator("what_changed", mode="before")
    @classmethod
    def _trim_what_changed(cls, v):
        return _truncate(v, 600)


# ════════════════════════════════════════════════════════════════════════
# Stage 3 — Self-Critique (GPT-4o audits Stage 2)
# ════════════════════════════════════════════════════════════════════════

class SelfCritique(BaseModel):
    """Stage 3 output — audit of the Stage 2 verdict."""
    decision: Literal["approved", "approved_with_caveat", "needs_revision"]
    overall_assessment: str = Field(max_length=480)
    strengths: list[str] = Field(default_factory=list, max_length=6)
    concerns: list[str] = Field(default_factory=list, max_length=6)
    overconfidence_flag: bool = Field(
        default=False,
        description="True if verdict confidence seems unwarranted by data",
    )
    contradictions_found: list[str] = Field(default_factory=list, max_length=5)
    suggested_caveat: Optional[str] = Field(
        default=None,
        max_length=320,
        description="Disclaimer to surface alongside verdict if needed",
    )

    @field_validator("overall_assessment", mode="before")
    @classmethod
    def _trim_assessment(cls, v):
        return _truncate(v, 480)

    @field_validator("suggested_caveat", mode="before")
    @classmethod
    def _trim_caveat(cls, v):
        return _truncate(v, 320)


# ════════════════════════════════════════════════════════════════════════
# Final Report Bundle (what gets stored in DB.report_json)
# ════════════════════════════════════════════════════════════════════════

class ReportBundleV6(BaseModel):
    """
    Complete v6 report — combines all three AI stages plus raw inputs.
    Stored as report_json in ai_arena_reports table.
    """
    schema_version: Literal["v6.1", "v6.2"] = "v6.2"
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
