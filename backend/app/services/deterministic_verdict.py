"""
Deterministic verdict direction (Phase 3).
==========================================
Locks verdict DIRECTION in code from liquidity + confluence + cycle, weighted
per horizon. The LLM may only LOWER confidence and narrate — never flip direction.

Gated by env flag COMPASS_DETERMINISTIC_VERDICT ("true"/"1"/"yes" = on).
When off, the worker keeps the old LLM-led behavior untouched.

Inputs (all already produced elsewhere):
- price_context: recent BTC change / range. This is the tactical anchor.
- liquidity LayerVerdict.to_dict(): {"verdict": "BULLISH/BEARISH/NEUTRAL", "strength": 0..1}
- confluence dict: full confluence payload. Only fast derivatives / top-trader
  metrics are allowed to influence 24h. Macro/on-chain/cycle are context only.
- cycle dict: {"score": 0..100, "phase": "..."}  (daily backdrop only)
"""

from __future__ import annotations

import os
from typing import Any

# weights per horizon. 24h is a tactical tape read; slow macro/on-chain/cycle
# must not average away price/liquidity stress. 72h can listen to positioning
# more, but still does not let macro/cycle own direction.
_W_24H = {"price": 0.45, "liquidity": 0.35, "derivatives": 0.20}
_W_72H = {"price": 0.35, "liquidity": 0.25, "derivatives": 0.20, "positioning": 0.20}
_THRESHOLD = 0.15             # |score| below this => neutral
_CONF_CAP = 90                # deterministic confidence ceiling (before ledger clamp)

_STRENGTH_WORD = {"WEAK": 0.3, "MODERATE": 0.6, "STRONG": 0.9}
_DERIVATIVE_KEYS = {"funding_rate", "basis", "taker_volume"}
_POSITIONING_KEYS = {"top_trader_position", "top_trader_account"}


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


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _price_signal(price_context: dict | None, horizon: str) -> float:
    """Normalize recent BTC tape into -1..+1."""
    ctx = price_context or {}
    if horizon == "24h":
        change = _safe_float(ctx.get("change_24h_pct"))
        threshold = 0.75
        scale = 3.0
    else:
        change = _safe_float(ctx.get("change_72h_pct"))
        if change is None:
            change = _safe_float(ctx.get("change_7d_pct"))
        threshold = 1.5
        scale = 6.0
    if change is None:
        return 0.0
    if abs(change) < threshold:
        return 0.0
    return max(-1.0, min(1.0, change / scale))


def _metric_signal(confluence: dict | None, keys: set[str]) -> float:
    """Average only selected fast metrics from the smart-money layer."""
    layer = (((confluence or {}).get("layers") or {}).get("smart_money") or {})
    selected = [
        metric for metric in (layer.get("metrics") or [])
        if metric.get("key") in keys and metric.get("available", True)
    ]
    if not selected:
        return 0.0
    scores = []
    for metric in selected:
        try:
            scores.append(max(-1.0, min(1.0, float(metric.get("score") or 0))))
        except (TypeError, ValueError):
            continue
    if not scores:
        return 0.0
    return max(-1.0, min(1.0, sum(scores) / len(scores)))


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
    price_context: dict | None = None,
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
    cyc = cycle or {}

    liq_s = _sign(liq.get("verdict")) * _strength(liq.get("strength"))
    price_24_s = _price_signal(price_context, "24h")
    price_72_s = _price_signal(price_context, "72h")
    deriv_s = _metric_signal(confluence, _DERIVATIVE_KEYS)
    pos_s = _metric_signal(confluence, _POSITIONING_KEYS)
    cyc_s = _cycle_bias(cyc.get("score"))  # logged only; not directional owner

    s24 = (
        _W_24H["price"] * price_24_s
        + _W_24H["liquidity"] * liq_s
        + _W_24H["derivatives"] * deriv_s
    )
    s72 = (
        _W_72H["price"] * price_72_s
        + _W_72H["liquidity"] * liq_s
        + _W_72H["derivatives"] * deriv_s
        + _W_72H["positioning"] * pos_s
    )

    return {
        "tactical_24h": {"direction": _direction(s24), "confidence": _confidence(s24), "score": round(s24, 3)},
        "secondary_7d": {"direction": _direction(s72), "confidence": _confidence(s72), "score": round(s72, 3)},
        "cycle_context": {"score": cyc.get("score"), "phase": cyc.get("phase")},
        "inputs": {
            "price_24_s": round(price_24_s, 3),
            "price_72_s": round(price_72_s, 3),
            "liq_s": round(liq_s, 3),
            "deriv_s": round(deriv_s, 3),
            "positioning_s": round(pos_s, 3),
            "cycle_context_s": round(cyc_s, 3),
        },
    }
