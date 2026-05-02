"""
Cycle Position Composite — computes BTC's position in the 4-year cycle.

Synthesizes MVRV-Z, Puell Multiple, Mayer Multiple, and Reserve Risk into a
single 0-100 score with phase classification (Bottom / Accumulation / Early
Bull / Late Bull / Distribution / Top).

Pi-Cycle acts as a binary OVERRIDE: if signaled, phase forces to TOP regardless
of other metrics (it's a famously reliable cycle-top indicator historically).

Used by:
- AI Arena worker (Stage 1 data compression)
- Frontend Cycle Compass component
- Confluence engine (Cycle layer verdict)
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from typing import Any

logger = logging.getLogger(__name__)


# ─── Per-metric normalization tables ──────────────────────────────────
# Each entry: (raw_value_threshold, normalized_score_0_to_100)
# Linear interpolation between adjacent thresholds.

_MVRV_Z_TABLE: list[tuple[float, float]] = [
    (-1.0, 0),    # extreme capitulation
    (0.0, 15),    # bottom zone
    (2.0, 40),    # accumulation done
    (5.0, 70),    # late bull
    (7.0, 90),    # distribution
    (10.0, 100),  # historical top
]

_PUELL_TABLE: list[tuple[float, float]] = [
    (0.3, 0),
    (0.5, 15),
    (1.0, 40),
    (2.0, 70),
    (4.0, 90),
    (6.0, 100),
]

_MAYER_TABLE: list[tuple[float, float]] = [
    (0.5, 0),
    (0.8, 30),
    (1.2, 50),
    (2.0, 75),
    (2.4, 85),
    (3.0, 100),
]

_RESERVE_RISK_TABLE: list[tuple[float, float]] = [
    (0.0, 0),
    (0.002, 25),
    (0.005, 50),
    (0.02, 80),
    (0.05, 100),
]

# Component weights — must sum to 1.0
_WEIGHTS = {
    "mvrv_zscore": 0.35,
    "puell_multiple": 0.20,
    "mayer_multiple": 0.20,
    "reserve_risk": 0.25,
}

# Phase boundaries (composite_score → phase_name)
_PHASE_BOUNDARIES: list[tuple[float, str]] = [
    (20, "BOTTOM"),
    (40, "ACCUMULATION"),
    (60, "EARLY_BULL"),
    (80, "LATE_BULL"),
    (95, "DISTRIBUTION"),
    (101, "TOP"),  # 101 because <= comparison
]

_PHASE_LABELS = {
    "BOTTOM": "Cycle Bottom",
    "ACCUMULATION": "Accumulation",
    "EARLY_BULL": "Early Bull",
    "LATE_BULL": "Late Bull",
    "DISTRIBUTION": "Distribution",
    "TOP": "Cycle Top",
}


# ─── Data structures ──────────────────────────────────────────────────
@dataclass
class CycleComponent:
    """Single component of the composite cycle score."""
    key: str
    raw_value: float | None
    normalized: float | None      # 0-100
    weight: float
    zone: str                      # human label e.g. "neutral", "undervalued"
    available: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CyclePosition:
    """Complete cycle position output."""
    score: float                   # 0-100 composite
    phase: str                     # enum: BOTTOM | ACCUMULATION | ...
    phase_label: str               # human label
    components: list[CycleComponent]
    pi_cycle_triggered: bool
    confidence: str                # "high" | "medium" | "low" — based on data completeness
    notes: list[str]               # human-readable observations

    def to_dict(self) -> dict:
        return {
            "score": round(self.score, 1),
            "phase": self.phase,
            "phase_label": self.phase_label,
            "pi_cycle_triggered": self.pi_cycle_triggered,
            "confidence": self.confidence,
            "components": [c.to_dict() for c in self.components],
            "notes": self.notes,
        }


# ─── Normalization helpers ────────────────────────────────────────────
def _interpolate(value: float, table: list[tuple[float, float]]) -> float:
    """Piecewise-linear interpolation. Clamps to [0, 100]."""
    if value <= table[0][0]:
        return table[0][1]
    if value >= table[-1][0]:
        return table[-1][1]

    for i in range(len(table) - 1):
        x0, y0 = table[i]
        x1, y1 = table[i + 1]
        if x0 <= value <= x1:
            if x1 == x0:
                return y0
            t = (value - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return 50.0  # unreachable but defensive


def _zone_for_normalized(score: float) -> str:
    """Human label for a 0-100 normalized score."""
    if score < 20:
        return "extreme_low"
    if score < 40:
        return "undervalued"
    if score < 60:
        return "neutral"
    if score < 80:
        return "elevated"
    if score < 95:
        return "overheated"
    return "extreme_high"


def _safe_float(value: Any) -> float | None:
    """Best-effort cast to float. Returns None if cannot convert."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ─── Pi-Cycle detection ───────────────────────────────────────────────
def _is_pi_cycle_triggered(raw: Any) -> bool:
    """
    Pi-Cycle signals top when 111-day SMA crosses above 350-day SMA × 2.
    BGeometrics returns either:
        {"signal": 1} or {"value": 1} → triggered
        {"signal": 0} or {"value": 0} → not triggered
    Sometimes a date string or boolean is returned. Be lenient.
    """
    if raw is None:
        return False
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return raw >= 1
    if isinstance(raw, str):
        return raw.lower() in ("1", "true", "triggered", "yes", "top")
    return False


# ─── Component computation ────────────────────────────────────────────
def _build_component(
    key: str,
    raw: Any,
    table: list[tuple[float, float]],
) -> CycleComponent:
    weight = _WEIGHTS[key]
    raw_float = _safe_float(raw)
    if raw_float is None:
        return CycleComponent(
            key=key, raw_value=None, normalized=None,
            weight=weight, zone="unavailable", available=False,
        )
    normalized = _interpolate(raw_float, table)
    zone = _zone_for_normalized(normalized)
    return CycleComponent(
        key=key, raw_value=raw_float, normalized=round(normalized, 1),
        weight=weight, zone=zone, available=True,
    )


def _phase_for_score(score: float) -> str:
    for boundary, phase in _PHASE_BOUNDARIES:
        if score < boundary:
            return phase
    return "TOP"


# ─── Public API ───────────────────────────────────────────────────────
def compute(
    mvrv_zscore: Any = None,
    puell_multiple: Any = None,
    mayer_multiple: Any = None,
    reserve_risk: Any = None,
    pi_cycle: Any = None,
) -> CyclePosition:
    """
    Compute composite cycle position from 5 raw inputs.

    Accepts raw values (float | str | None) or BGMetric.value-style data.
    Missing components are excluded — weights are renormalized over available.

    If 2+ components missing → confidence = "low"
    If pi-cycle triggered → phase forced to TOP (phase override flag in output)

    Returns CyclePosition dataclass. Use .to_dict() for JSON serialization.
    """
    # Build all 4 components
    components = [
        _build_component("mvrv_zscore", mvrv_zscore, _MVRV_Z_TABLE),
        _build_component("puell_multiple", puell_multiple, _PUELL_TABLE),
        _build_component("mayer_multiple", mayer_multiple, _MAYER_TABLE),
        _build_component("reserve_risk", reserve_risk, _RESERVE_RISK_TABLE),
    ]

    available = [c for c in components if c.available]
    pi_triggered = _is_pi_cycle_triggered(pi_cycle)

    # Confidence based on data completeness
    if len(available) >= 4:
        confidence = "high"
    elif len(available) == 3:
        confidence = "medium"
    elif len(available) >= 2:
        confidence = "low"
    else:
        # Insufficient data — return defensive default
        return CyclePosition(
            score=50.0,
            phase="EARLY_BULL",
            phase_label="Insufficient data",
            components=components,
            pi_cycle_triggered=pi_triggered,
            confidence="insufficient",
            notes=["Not enough components available to compute reliable cycle score"],
        )

    # Weighted composite (renormalize weights over available components)
    total_weight = sum(c.weight for c in available)
    weighted_sum = sum(c.normalized * c.weight for c in available)  # type: ignore[arg-type]
    score = weighted_sum / total_weight if total_weight > 0 else 50.0

    # Pi-Cycle override
    if pi_triggered:
        phase = "TOP"
        score = max(score, 95.0)
    else:
        phase = _phase_for_score(score)

    phase_label = _PHASE_LABELS.get(phase, phase)

    # Generate notes
    notes: list[str] = []
    if pi_triggered:
        notes.append("Pi-Cycle indicator triggered — historical cycle top signal")
    missing = [c.key for c in components if not c.available]
    if missing:
        notes.append(f"Missing data for: {', '.join(missing)}")
    if confidence == "low":
        notes.append("Score has reduced confidence due to limited inputs")

    # Phase-specific narrative hint
    if phase == "BOTTOM":
        notes.append("Historical pattern: capitulation phase, risk/reward favorable for accumulation")
    elif phase == "ACCUMULATION":
        notes.append("Historical pattern: smart money accumulating, downside limited")
    elif phase == "EARLY_BULL":
        notes.append("Historical pattern: trend established, momentum building")
    elif phase == "LATE_BULL":
        notes.append("Historical pattern: euphoria building, watch for distribution signals")
    elif phase == "DISTRIBUTION":
        notes.append("Historical pattern: smart money exiting, retail euphoric")
    elif phase == "TOP":
        notes.append("Historical pattern: cycle top zone, defensive positioning prudent")

    return CyclePosition(
        score=score,
        phase=phase,
        phase_label=phase_label,
        components=components,
        pi_cycle_triggered=pi_triggered,
        confidence=confidence,
        notes=notes,
    )


def from_bg_snapshot(snapshot: dict) -> CyclePosition:
    """
    Convenience wrapper — accepts a BGClient.fetch_all() snapshot directly.

    snapshot is dict[str, BGMetric] from bg_advanced.BGClient.fetch_all().
    """
    def get(key: str) -> Any:
        m = snapshot.get(key)
        return m.value if m and m.ok else None

    return compute(
        mvrv_zscore=get("mvrv-zscore"),
        puell_multiple=get("puell-multiple"),
        mayer_multiple=get("mayer-multiple"),
        reserve_risk=get("reserve-risk"),
        pi_cycle=get("pi-cycle"),
    )
