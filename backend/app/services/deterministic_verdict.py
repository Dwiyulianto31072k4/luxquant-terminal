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
# `taker_volume` is deliberately absent. It is now wired and recorded — the
# evidence matrix and the narrative see it — but it does not get a vote in the
# direction until it earns one. Measured against real forward returns it scored
# 53.5% alone at ±5% (p=0.20), and as a confirmation filter on momentum it
# looked strong on the full sample (+0.0816% vs +0.0610% aligned return) and
# then failed out of sample: July 56.2%, *worse* than momentum's own 58.3%.
# Add it here the day it replicates, not before.
_DERIVATIVE_KEYS = {"funding_rate", "basis"}
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


def _price_signal(price_context: dict | None, horizon: str) -> float | None:
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
        return None          # no data — NOT the same claim as "neutral"
    if abs(change) < threshold:
        return 0.0           # genuinely inside the noise band
    return max(-1.0, min(1.0, change / scale))


def _metric_signal(confluence: dict | None, keys: set[str]) -> float | None:
    """Average only selected fast metrics from the smart-money layer."""
    layer = (((confluence or {}).get("layers") or {}).get("smart_money") or {})
    selected = [
        metric for metric in (layer.get("metrics") or [])
        if metric.get("key") in keys and metric.get("available", True)
    ]
    if not selected:
        return None          # nothing reported in — say so, do not invent a zero
    scores = []
    for metric in selected:
        try:
            scores.append(max(-1.0, min(1.0, float(metric.get("score") or 0))))
        except (TypeError, ValueError):
            continue
    if not scores:
        return None
    return max(-1.0, min(1.0, sum(scores) / len(scores)))


# What to do when the score says bearish.
#   "suppress" — publish neutral instead, but keep scoring the bearish call
#                behind the scenes so we can see when it starts working again.
#   "publish"  — the old behaviour.
_BEARISH_POLICY = os.getenv("COMPASS_BEARISH_POLICY", "suppress").lower()


def _raw_direction(score: float) -> str:
    """Direction before any policy is applied. This is what gets recorded."""
    if score >= _THRESHOLD:
        return "bullish"
    if score <= -_THRESHOLD:
        return "bearish"
    return "neutral"


def _direction(score: float) -> str:
    """Direction as published.

    Bearish calls are withheld by default, and that is a measured decision, not
    a hunch. Across 106 resolved bearish contracts the expected value per call
    was **negative in both halves of the sample** — July −0.611% (n=73), August
    −0.467% (n=33) — while bullish ran +0.963%. The geometry made it worse: a
    bearish contract needed a 63.6% hit rate to break even and delivered 46.7%,
    so it demanded *more* accuracy than bullish while running on a weaker
    signal.

    The mechanism is visible in the raw data. This is a momentum score, and at
    the horizon these contracts actually resolve over — median 2-4 hours — BTC's
    response to downward momentum is not symmetric with its response to upward
    momentum. Following up-momentum was right 60.5% of the time (p=0.002);
    following down-momentum was right 58.6% (p=0.063) with an average forward
    return of −0.002%, i.e. nothing. And the *strongest* down signals inverted
    outright: below −0.60 the average forward return was **+0.107%**. A sharp
    drop was, on average, followed by a rise. That is the intraday reversal
    documented for crypto and attributed to overreaction to non-fundamental
    news — and the symmetric ±0.15 threshold above treats it identically to the
    momentum that does persist.

    Six alternative rules were backtested against the same 469 contracts.
    Filtering bearish by strength, by liquidity agreement, by an asymmetric
    threshold, and by a 72h-trend regime switch **all still lost money in July**.
    The regime switch was the worst of them: the calls it dropped had +0.958% EV
    that month. Withholding bearish entirely was the only rule positive in both
    halves. Rules that also filtered *bullish* looked better on the full sample
    but collapsed out of sample (one showed −2.314% in July on n=5) and were
    rejected as overfitting.

    IMPORTANT: the sample is a +28.7% bull run, so this asymmetry may be regime
    rather than law. That is exactly why the bearish score keeps being computed
    and recorded below instead of being deleted — `suppressed_bearish` in the
    output is the running record of what the withheld call would have said, and
    it is what should be re-measured before flipping the policy back.
    """
    raw = _raw_direction(score)
    if raw == "bearish" and _BEARISH_POLICY == "suppress":
        return "neutral"
    return raw


def _confidence(score: float, coverage: float = 1.0) -> int:
    """Confidence, scaled down by how much of the evidence actually arrived.

    Renormalising the score over present inputs was necessary — padding it with
    imaginary zeros understated whatever did report in — but it has a sharp
    edge: a single surviving input now reaches full strength, so a partial read
    crosses the threshold as easily as a complete one. A 2% price move with
    liquidity and derivatives both silent scores -0.667 where it used to score
    -0.300.

    The score should say that; the confidence should say the evidence was thin.
    Coverage is the fraction of intended weight that reported in, and it is
    applied here rather than gating the direction, because withholding the call
    entirely would trade one silent distortion for another.
    """
    base = 50 + 40 * abs(score)
    return int(max(0, min(_CONF_CAP, round(base * max(0.0, min(1.0, coverage))))))


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

    # Absent liquidity is unknown, not neutral — the doc either arrived or it
    # did not, and a missing one must not vote.
    liq_s = (
        _sign(liq.get("verdict")) * _strength(liq.get("strength"))
        if liq.get("verdict") is not None else None
    )
    price_24_s = _price_signal(price_context, "24h")
    price_72_s = _price_signal(price_context, "72h")
    deriv_s = _metric_signal(confluence, _DERIVATIVE_KEYS)
    pos_s = _metric_signal(confluence, _POSITIONING_KEYS)
    cyc_s = _cycle_bias(cyc.get("score"))  # logged only; not directional owner

    def _blend(weights: dict, parts: dict) -> tuple[float, float]:
        """Weighted score over the inputs that are actually present.

        `_price_signal`, `_metric_signal` and `_strength` all used to return
        0.0 when their data was missing, which quietly claimed "neutral" on
        behalf of an input nobody had heard from. The score then came out
        diluted toward zero and indistinguishable from a genuinely balanced
        one — the same number meaning either "three sources agreed on nothing"
        or "two of them never answered".

        Renormalising over the present weights keeps a partial read at its own
        strength instead of shrinking it, and the returned coverage says how
        much of the intended evidence actually arrived.
        """
        live = {k: v for k, v in parts.items() if v is not None}
        total_w = sum(weights[k] for k in live) or 0.0
        if total_w <= 0:
            return 0.0, 0.0
        raw = sum(weights[k] * live[k] for k in live)
        return raw / total_w, total_w / sum(weights.values())

    s24, cov24 = _blend(_W_24H, {
        "price": price_24_s, "liquidity": liq_s, "derivatives": deriv_s,
    })
    s72, cov72 = _blend(_W_72H, {
        "price": price_72_s, "liquidity": liq_s,
        "derivatives": deriv_s, "positioning": pos_s,
    })

    # Recorded whether or not it is published — this is the evidence that lets
    # the policy be revisited rather than becoming permanent by forgetting.
    suppressed = {
        h: {"would_be": raw, "score": round(sc, 3), "confidence": _confidence(sc, cov)}
        for h, raw, sc, cov in (("tactical_24h", _raw_direction(s24), s24, cov24),
                                ("secondary_7d", _raw_direction(s72), s72, cov72))
        if raw != _direction(sc)
    }

    return {
        "tactical_24h": {"direction": _direction(s24), "confidence": _confidence(s24, cov24), "score": round(s24, 3)},
        "secondary_7d": {"direction": _direction(s72), "confidence": _confidence(s72, cov72), "score": round(s72, 3)},
        "coverage": {"tactical_24h": round(cov24, 3), "secondary_7d": round(cov72, 3)},
        "bearish_policy": _BEARISH_POLICY,
        "suppressed_bearish": suppressed or None,
        "cycle_context": {"score": cyc.get("score"), "phase": cyc.get("phase")},
        "inputs": {
            # None is recorded as None, never coerced to 0.0 — the whole point.
            "price_24_s": None if price_24_s is None else round(price_24_s, 3),
            "price_72_s": None if price_72_s is None else round(price_72_s, 3),
            "liq_s": None if liq_s is None else round(liq_s, 3),
            "deriv_s": None if deriv_s is None else round(deriv_s, 3),
            "positioning_s": None if pos_s is None else round(pos_s, 3),
            "cycle_context_s": round(cyc_s, 3),
        },
    }
