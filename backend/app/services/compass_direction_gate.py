"""Second gate — spend an LLM run only when the deterministic read would move.

Measured over 60 days of production reports: in 551 of 551 runs where the
direction lock was active, the published direction matched the deterministic
direction. Not once has the LLM disagreed. Direction is therefore already
decided, for free, before any tokens are spent; what the LLM run buys is prose
and refreshed levels.

Across 147 consecutive report pairs the contingency table was exact:

    deterministic changed & published changed :  34
    deterministic changed & published same    :   0
    deterministic same    & published changed :   0
    deterministic same    & published same    : 113

So gating on "did the deterministic direction move" keeps every direction
change and drops 77% of the runs. That is structural rather than statistical:
the lock is handed to Stage 2 with an instruction to match it, so the direction
being gated IS the direction that gets published.

A price filter cannot do this job. A CUSUM filter (k=0.5, h=4) backtested over
21 days of 5m bars produced 2.0 events/day but caught only 6 of 36 direction
changes — the verdict turns on derivatives, positioning, liquidity and event
risk, none of which a price series can see.

The score threshold is measured, not guessed. Among pairs where direction did
NOT change, |Δscore| has median 0.119 and p90 0.238, with a clear knee at 0.25:
admitting >=0.20 lets 25.7% of them through, >=0.25 only 8.0%. Expected result
at the default: ~7.4 runs/day falls to ~2.1, with all 36 direction changes kept.

FAIL-OPEN BY DESIGN. Every error path, missing input, and disabled flag returns
proceed=True. A broken gate must only ever cost money — never silence the read.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


def _env_float(name: str, default: float) -> float:
    try:
        raw = os.getenv(name, "")
        return float(raw) if raw else default
    except (TypeError, ValueError):
        return default


# "enforce" skips the run, "shadow" logs what it would have done and always
# proceeds, "off" disables the gate entirely.
def _mode() -> str:
    value = (os.getenv("COMPASS_GATE_MODE", "enforce") or "").strip().lower()
    return value if value in ("enforce", "shadow", "off") else "enforce"


SCORE_DELTA = _env_float("COMPASS_GATE_SCORE_DELTA", 0.25)
BAND_BUFFER_PCT = _env_float("COMPASS_GATE_BAND_BUFFER_PCT", 0.15)

_BIAS_TO_DIRECTION = {
    "BULLISH_CONTINUATION": "bullish",
    "BEARISH_CONTINUATION": "bearish",
    "NEUTRAL_RANGE": "neutral",
}

# A barrier event is about levels, not direction, so the gate must never hold
# one back: the read that named the level has to be refreshed once price gets
# there. Same for the bootstrap case, which has no contract to compare against.
_BYPASS_MARKERS = (
    "level_touched",
    "invalidation",
    "confirmation",
    "bootstrap",
    "barrier",
)


@dataclass
class GateDecision:
    proceed: bool
    reason: str
    details: dict[str, Any] = field(default_factory=dict)


def bypasses_gate(reason: str | None, is_critical: bool) -> bool:
    if is_critical:
        return True
    lowered = (reason or "").lower()
    return any(marker in lowered for marker in _BYPASS_MARKERS)


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _outside_contract_band(price: float, contract: dict) -> str | None:
    """True once price has left the band the active read described.

    Direction can hold while price walks out of the levels that were published
    with it. That read is stale even though its thesis is intact, so it is
    refreshed regardless of what the deterministic score says.
    """
    buffer = BAND_BUFFER_PCT / 100.0
    target = _safe_float(contract.get("primary_touch_level"))
    invalid = _safe_float(contract.get("invalidation_level"))

    if target and invalid:
        high, low = (target, invalid) if target >= invalid else (invalid, target)
        if price > high * (1.0 + buffer):
            return f"price_above_band_{round(high)}"
        if price < low * (1.0 - buffer):
            return f"price_below_band_{round(low)}"
    return None


async def evaluate(
    price: float,
    latest_report: dict | None,
    active_contract: dict | None,
) -> GateDecision:
    """Decide whether a triggered run is worth its tokens.

    Returns proceed=True on anything it cannot answer confidently.
    """
    mode = _mode()
    details: dict[str, Any] = {"gate_mode": mode, "gate_score_delta": SCORE_DELTA}

    if mode == "off":
        return GateDecision(True, "gate_off", details)

    try:
        from app.services.deterministic_verdict import (
            compute_deterministic_direction,
            flag_enabled,
        )

        if not flag_enabled():
            return GateDecision(True, "gate_skipped_flag_off", details)

        if not latest_report or not active_contract:
            return GateDecision(True, "gate_skipped_no_baseline", details)

        report_json = latest_report.get("report_json") or {}
        if isinstance(report_json, str):
            import json

            report_json = json.loads(report_json)

        current_bias = active_contract.get("primary_bias")
        current_direction = _BIAS_TO_DIRECTION.get(current_bias)
        if not current_direction:
            return GateDecision(True, "gate_skipped_unknown_bias", details)

        # Price walking out of the published band retires the read on its own.
        band_exit = _outside_contract_band(price, active_contract)
        if band_exit:
            details["band_exit"] = band_exit
            return GateDecision(True, f"gate_pass_{band_exit}", details)

        # Rebuild the fast tape exactly the way a real run would: the daily
        # backdrop is reused from the last report (that is what it is for) and
        # only the intraday tiers are refetched. Costs ~8 BGeometrics calls,
        # and only on a trigger — roughly 8 times a day, not every 2 minutes.
        from app.services import bg_advanced, confluence_engine
        from app.services.ai_arena_v6_scheduled_run import fetch_price_context
        from app.services.ai_arena_v6_worker import (
            _fetch_intraday_bg,
            _fetch_liquidity_doc,
            _snapshot_from_summary,
        )

        bg_snapshot = _snapshot_from_summary(report_json.get("bg_snapshot_summary"))
        if not bg_snapshot:
            return GateDecision(True, "gate_skipped_no_daily_snapshot", details)

        client = bg_advanced.BGClient()
        bg_snapshot.update(await _fetch_intraday_bg(client))

        confluence_dict = confluence_engine.compute_all(
            bg_snapshot=bg_snapshot, external={}
        ).to_dict()
        cycle_dict = report_json.get("cycle_position") or {}

        liquidity_doc = await _fetch_liquidity_doc(price)
        if not (liquidity_doc or {}).get("decision_eligible"):
            # The real run refuses to lock direction without eligible
            # liquidity, so the gate has nothing trustworthy to compare.
            return GateDecision(True, "gate_skipped_liquidity_ineligible", details)

        _, price_context = await fetch_price_context()

        lock = compute_deterministic_direction(
            (liquidity_doc or {}).get("layer"),
            confluence_dict,
            cycle_dict,
            price_context=price_context,
        )
        tactical = (lock or {}).get("tactical_24h") or {}
        new_direction = tactical.get("direction")
        new_score = _safe_float(tactical.get("score"))

        prev = ((report_json.get("shadow_deterministic") or {}).get("tactical_24h") or {})
        prev_score = _safe_float(prev.get("det_score"))

        details.update({
            "gate_direction_now": new_direction,
            "gate_direction_contract": current_direction,
            "gate_score_now": new_score,
            "gate_score_prev": prev_score,
        })

        if not new_direction:
            return GateDecision(True, "gate_skipped_no_direction", details)

        if new_direction != current_direction:
            return GateDecision(
                True,
                f"gate_pass_direction_{current_direction}_to_{new_direction}",
                details,
            )

        if new_score is not None and prev_score is not None:
            delta = abs(new_score - prev_score)
            details["gate_score_delta"] = round(delta, 4)
            if delta >= SCORE_DELTA:
                return GateDecision(True, f"gate_pass_score_delta_{delta:.2f}", details)
        else:
            # No previous score to compare — do not suppress on a blind guess.
            return GateDecision(True, "gate_pass_no_previous_score", details)

        hold_reason = f"gate_hold_same_direction_{new_direction}"
        if mode == "shadow":
            logger.warning("SHADOW direction gate would have held: %s", hold_reason)
            return GateDecision(True, f"shadow_{hold_reason}", details)

        return GateDecision(False, hold_reason, details)

    except Exception as exc:  # fail-open, always
        logger.warning("Direction gate unavailable (non-fatal): %s", exc)
        details["gate_error"] = str(exc)[:200]
        return GateDecision(True, "gate_error_fail_open", details)
