"""
Deterministic verdict direction (Phase 3).
==========================================
Locks verdict DIRECTION in code from liquidity + confluence + cycle, weighted
per horizon. The LLM may only LOWER confidence and narrate — never flip direction.

Gated by env flag COMPASS_DETERMINISTIC_VERDICT ("true"/"1"/"yes" = on).
When off, the worker keeps the old LLM-led behavior untouched.

Inputs (all already produced elsewhere):
- liquidity LayerVerdict.to_dict(): {"verdict": "BULLISH/BEARISH/NEUTRAL", "strength": 0..1}
- confluence dict: {"dominant_direction": "...", "strength": "WEAK/MODERATE/STRONG" or 0..1}
- cycle dict: {"score": 0..100, "phase": "..."}  (no direction — backdrop only)
"""

from __future__ import annotations

import os
from typing import Any

# weights per horizon: (liquidity, confluence, cycle)
_W_24H = (0.65, 0.30, 0.05)   # liquidity leads intraday
_W_72H = (0.40, 0.40, 0.20)   # balanced for swing
_THRESHOLD = 0.15             # |score| below this => neutral
_CONF_CAP = 90                # deterministic confidence ceiling (before ledger clamp)

_STRENGTH_WORD = {"WEAK": 0.3, "MODERATE": 0.6, "STRONG": 0.9}


def flag_enabled() -> bool:
    return os.getenv("COMPASS_DETERMINISTIC_VERDICT", "").lower() in ("1", "true", "yes", "on")


def _sign(verdict: str | None) -> int:
    v = (verdict or "").upper()
    if v.startswith("BULL"):
        return 1
    if v.startswith("BEAR"):
        return -1
    return 0


def _strength(val: Any) -> float:
    if isinstance(val, (int, float)):
        return max(0.0, min(1.0, float(val)))
    if isinstance(val, str):
        return _STRENGTH_WORD.get(val.upper(), 0.3)
    return 0.0


def _cycle_bias(score: Any) -> float:
    """score<40 => +0.5 (bull backdrop), >60 => -0.5 (bear), else 0. Deliberately weak."""
    try:
        s = float(score)
    except (TypeError, ValueError):
        return 0.0
    if s < 40:
        return 0.5
    if s > 60:
        return -0.5
    return 0.0


def _direction(score: float) -> str:
    if score >= _THRESHOLD:
        return "bullish"
    if score <= -_THRESHOLD:
        return "bearish"
    return "neutral"


def _confidence(score: float) -> int:
    return int(max(0, min(_CONF_CAP, round(50 + 40 * abs(score)))))


def compute_deterministic_direction(
    liquidity: dict | None,
    confluence: dict | None,
    cycle: dict | None,
) -> dict:
    """
    Returns:
      {
        "tactical_24h": {"direction": str, "confidence": int, "score": float},
        "secondary_7d": {"direction": str, "confidence": int, "score": float},  # 72h swing
        "cycle_context": {"score": float, "phase": str},  # backdrop, not a direction
        "inputs": {...}  # for logging/audit
      }
    """
    liq = liquidity or {}
    conf = confluence or {}
    cyc = cycle or {}

    liq_s = _sign(liq.get("verdict")) * _strength(liq.get("strength"))
    conf_s = _sign(conf.get("dominant_direction")) * _strength(conf.get("strength"))
    cyc_s = _cycle_bias(cyc.get("score"))

    s24 = _W_24H[0]*liq_s + _W_24H[1]*conf_s + _W_24H[2]*cyc_s
    s72 = _W_72H[0]*liq_s + _W_72H[1]*conf_s + _W_72H[2]*cyc_s

    return {
        "tactical_24h": {"direction": _direction(s24), "confidence": _confidence(s24), "score": round(s24, 3)},
        "secondary_7d": {"direction": _direction(s72), "confidence": _confidence(s72), "score": round(s72, 3)},
        "cycle_context": {"score": cyc.get("score"), "phase": cyc.get("phase")},
        "inputs": {"liq_s": round(liq_s, 3), "conf_s": round(conf_s, 3), "cyc_s": round(cyc_s, 3)},
    }
