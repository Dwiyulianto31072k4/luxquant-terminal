"""
LuxQuant Terminal - Signal Journey Pydantic Schemas
====================================================
Layer 5 schemas: response models untuk GET /api/v1/signals/journey/{id}.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field


# ============================================================
# SECTION 1: Entry Stats
# ============================================================

class EntryStats(BaseModel):
    initial_drawdown_pct: Optional[float] = Field(
        None,
        description="Worst drawdown sebelum TP1 (atau sebelum SL kalau gak ada TP). Always <= 0."
    )
    initial_drawdown_at: Optional[datetime] = None
    initial_mae_before: Optional[str] = Field(
        None,
        description="'tp1' | 'sl' | 'none'"
    )
    time_to_tp1_seconds: Optional[int] = None
    time_to_tp1_human: Optional[str] = Field(
        None,
        description="Pre-formatted: '2m 8s', '1h 12m', etc"
    )


# ============================================================
# SECTION 2: Timeline Event
# ============================================================

class TimelineEvent(BaseModel):
    # Raw fields
    type: str = Field(
        description="'entry' | 'tp1' | 'tp2' | 'tp3' | 'tp4' | 'sl' | 'swing_high' | 'swing_low'"
    )
    at: Optional[datetime] = None
    price: Optional[float] = None
    pct: Optional[float] = Field(
        None,
        description="Sign-normalized: positive = profit for trader (regardless of long/short)"
    )
    confirmed: bool = Field(
        description="True kalau dari signal_updates (Telegram), False kalau swing detection"
    )

    # Display helpers (computed by view_builder)
    label: str = Field(description="Display name, e.g. 'TP1 Hit', 'Market Peak'")
    context: str = Field(description="Short context line, e.g. 'First profit target reached'")
    time_main: str = Field(description="Absolute time format, e.g. 'T+15m', 'T+0'")
    time_delta: str = Field(description="Relative time format, e.g. '+13m from TP2', 'start'")
    color_token: str = Field(
        description="Color name for frontend mapping: 'gold'|'green'|'lime'|'amber'|'orange'|'cyan'|'purple'|'red'"
    )
    is_highlighted: bool = Field(
        default=False,
        description="True for swing events (peak/pullback) — frontend renders with highlight bg"
    )


# ============================================================
# SECTION 3: Outcome
# ============================================================

class OutcomeSection(BaseModel):
    summary_sentence: str = Field(
        description="Template-based, factual summary"
    )

    realized_pct: Optional[float] = None
    realized_via: Optional[str] = Field(
        None,
        description="Last announced TP/SL: 'TP1'|'TP2'|'TP3'|'TP4'|'SL'"
    )

    # Renamed from "missed_potential" to "peak_excursion" (neutral framing)
    peak_excursion_pct: Optional[float] = None
    peak_excursion_at: Optional[datetime] = None
    peak_excursion_delta_text: str = Field(
        default='',
        description="Pre-formatted relative time, e.g. 'at T+15m'"
    )

    # Bottom stats
    pct_time_above_entry: Optional[float] = Field(
        None,
        description="0-100, fraction of coverage time price above entry"
    )
    worst_drawdown_pct: Optional[float] = None
    worst_drawdown_at: Optional[datetime] = None
    worst_drawdown_context: Optional[str] = Field(
        None,
        description="'Pre-TP1' | 'Post-TP1' | 'Throughout'"
    )

    # TP-then-SL warning
    tp_then_sl: bool = False
    tps_hit_before_sl: Optional[List[str]] = None


# ============================================================
# LEGEND (static reference)
# ============================================================

class JourneyLegend(BaseModel):
    confirmed: str
    detected: str


# ============================================================
# MAIN RESPONSE
# ============================================================

class SignalJourneyResponse(BaseModel):
    # Identity & metadata
    signal_id: str
    pair: Optional[str] = None
    direction: str
    coverage_status: str = Field(
        description="'live' | 'frozen' | 'sl_truncated' | 'unavailable'"
    )
    coverage_from: datetime
    coverage_until: datetime
    duration_seconds: int
    duration_human: str
    data_source: str = Field(
        description="'binance_futures' | 'binance_spot' | 'bybit_linear' | 'bybit_spot' | 'unavailable'"
    )
    is_live: bool
    computed_at: Optional[datetime] = None

    # 3-section breakdown
    entry_stats: EntryStats
    events: List[TimelineEvent]
    outcome: OutcomeSection

    # Reference
    legend: JourneyLegend


# ============================================================
# ERROR / EMPTY RESPONSE
# ============================================================

class JourneyNotAvailableResponse(BaseModel):
    """
    Response untuk signal yang gak punya journey row (open signal, atau pair unavailable).
    Frontend bisa render fallback / hide section.
    """
    signal_id: str
    available: bool = False
    reason: str = Field(
        description="'no_journey_yet' | 'unavailable_pair' | 'requires_subscription'"
    )
    message: Optional[str] = None
