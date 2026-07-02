"""
LuxQuant BTC Compass 2.0 — Reachability Calibration
=====================================================
Deterministic guardrail applied AFTER the LLM drafts a scenario contract and
BEFORE it is persisted. Based on the triple-barrier method (Lopez de Prado):
horizontal barriers (target / invalidation) must be sized relative to realized
volatility, and the vertical barrier (stale window) must give the market
enough time to plausibly reach them.

Empirical motivation (backfill audit, Jul 2026): 73/125 projections resolved
STALE_NO_TOUCH because targets averaged 2.4-3.4% away while realized BTC
movement was only ~0.5-0.6% x sqrt(hours). Several projections reached 85-99%
of the target and expired — right direction, wrong clock.

Policy (window adapts, levels never move — levels come from market structure):
  expected_move(T) = sigma_1h * sqrt(T_hours)
  score            = target_distance / expected_move
    score <= PASS_SCORE  -> unchanged
    score  > PASS_SCORE  -> extend window so score ~ TARGET_SCORE_AFTER_EXTEND
                            (capped at MAX_STALE_MINUTES)
    score at max window > HARD_SCORE -> flag "low_reachability"
  invalidation closer than MIN_INVALIDATION_RATIO x expected_move
                          -> flag "tight_invalidation" (noise stop-out risk)

Every adjustment is recorded in contract_json.calibration and as a
CALIBRATION_ADJUSTED event, so the audit trail shows what the model asked for
versus what the system enforced.
"""

from __future__ import annotations

import logging
import math
import statistics
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

CALIBRATION_VERSION = "reachability_v2"

BYBIT_KLINE_URL = "https://api.bybit.com/v5/market/kline"
SIGMA_LOOKBACK_HOURS = 72

PASS_SCORE = 1.25                 # target within 1.25 expected moves: leave as-is
TARGET_SCORE_AFTER_EXTEND = 1.0   # extend window so target sits ~1 expected move away
HARD_SCORE = 2.0                  # still beyond 2 expected moves at max window: flag
MAX_STALE_MINUTES = 1440
WINDOW_STEP_MINUTES = 30          # extended windows are rounded up to this step
MIN_INVALIDATION_RATIO = 0.75     # legacy flag threshold (kept for reference)

# ── v2 (backfill audit, Jul 2026) ──
# Contracts flagged tight_invalidation hit only 17% vs 54% without the flag,
# and 24/49 losses had already travelled >=50% toward target before being
# stopped inside noise. So the stop floor is now ENFORCED, not just flagged:
# an invalidation closer than INVAL_FLOOR_RATIO x expected_move is pushed out
# to the floor (side preserved, fully audit-logged).
INVAL_FLOOR_RATIO = 1.25
# Bearish continuation calls against a rising 72h tape hit 14% (6/43).
# Directional calls that fight the realized 72h trend by more than
# COUNTER_TREND_MIN_PCT are flagged counter_trend.
COUNTER_TREND_MIN_PCT = 1.0


def fetch_market_stats(timeout: float = 8.0) -> dict[str, Optional[float]]:
    """
    Realized market stats for BTCUSDT from the last SIGMA_LOOKBACK_HOURS
    hourly closes:
      sigma_1h_pct  — stdev of close-to-close 1h returns (percent)
      trend_72h_pct — total change over the lookback window (percent)
    Returns None values on any failure — calibration is then skipped,
    never blocks persistence.
    """
    out: dict[str, Optional[float]] = {"sigma_1h_pct": None, "trend_72h_pct": None}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(BYBIT_KLINE_URL, params={
                "category": "spot",
                "symbol": "BTCUSDT",
                "interval": "60",
                "limit": SIGMA_LOOKBACK_HOURS + 1,
            })
            resp.raise_for_status()
            data = resp.json()
        if data.get("retCode") != 0:
            logger.warning("Market stats fetch retCode=%s", data.get("retCode"))
            return out
        rows = data.get("result", {}).get("list", [])
        closes = [float(row[4]) for row in sorted(rows, key=lambda r: int(r[0]))]
        if len(closes) < 24:
            return out
        returns = [
            (closes[i] / closes[i - 1] - 1.0) * 100.0
            for i in range(1, len(closes))
            if closes[i - 1] > 0
        ]
        if len(returns) >= 12:
            sigma = statistics.pstdev(returns)
            out["sigma_1h_pct"] = round(sigma, 4) if sigma > 0 else None
        if closes[0] > 0:
            out["trend_72h_pct"] = round((closes[-1] / closes[0] - 1.0) * 100.0, 4)
        return out
    except Exception as exc:
        logger.warning("Market stats fetch failed (%s)", type(exc).__name__)
        return out


def fetch_hourly_sigma_pct(timeout: float = 8.0) -> Optional[float]:
    """Back-compat wrapper: sigma only."""
    return fetch_market_stats(timeout=timeout)["sigma_1h_pct"]


@dataclass
class CalibrationResult:
    applied: bool
    sigma_1h_pct: Optional[float]
    target_dist_pct: Optional[float] = None
    invalidation_dist_pct: Optional[float] = None
    expected_move_pct: Optional[float] = None       # at the ORIGINAL window
    reachability_score: Optional[float] = None      # at the ORIGINAL window
    original_stale_minutes: int = 0
    stale_minutes: int = 0                          # final (possibly extended)
    final_score: Optional[float] = None             # at the FINAL window
    original_invalidation_level: Optional[float] = None
    invalidation_level: Optional[float] = None      # final (possibly widened)
    trend_72h_pct: Optional[float] = None
    flags: list = field(default_factory=list)
    notes: list = field(default_factory=list)

    @property
    def window_extended(self) -> bool:
        return self.stale_minutes > self.original_stale_minutes

    @property
    def invalidation_widened(self) -> bool:
        return (
            self.invalidation_level is not None
            and self.original_invalidation_level is not None
            and abs(self.invalidation_level - self.original_invalidation_level) > 1e-9
        )

    @property
    def has_findings(self) -> bool:
        return self.window_extended or self.invalidation_widened or bool(self.flags)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": CALIBRATION_VERSION,
            "applied": self.applied,
            "sigma_1h_pct": self.sigma_1h_pct,
            "target_dist_pct": self.target_dist_pct,
            "invalidation_dist_pct": self.invalidation_dist_pct,
            "expected_move_pct": self.expected_move_pct,
            "reachability_score": self.reachability_score,
            "original_stale_minutes": self.original_stale_minutes,
            "stale_minutes": self.stale_minutes,
            "final_score": self.final_score,
            "window_extended": self.window_extended,
            "original_invalidation_level": self.original_invalidation_level,
            "invalidation_level": self.invalidation_level,
            "invalidation_widened": self.invalidation_widened,
            "trend_72h_pct": self.trend_72h_pct,
            "flags": list(self.flags),
            "notes": list(self.notes),
        }


def calibrate_contract(
    *,
    reference_price: float,
    target_level: float,
    invalidation_level: float,
    stale_after_minutes: int,
    sigma_1h_pct: Optional[float],
    primary_bias: Optional[str] = None,
    trend_72h_pct: Optional[float] = None,
    enforce_invalidation_floor: bool = False,
) -> CalibrationResult:
    """Pure function — no I/O. See module docstring for the policy.

    v2 additions:
      enforce_invalidation_floor — push a too-tight invalidation OUT to
        INVAL_FLOOR_RATIO x expected_move (side preserved). Off by default
        so historical recalibration never rewrites levels.
      primary_bias + trend_72h_pct — flag `counter_trend` when a directional
        call fights the realized 72h tape by > COUNTER_TREND_MIN_PCT.
    """
    original = int(stale_after_minutes or 0) or 60
    result = CalibrationResult(
        applied=False,
        sigma_1h_pct=sigma_1h_pct,
        original_stale_minutes=original,
        stale_minutes=original,
        original_invalidation_level=float(invalidation_level) if invalidation_level else None,
        invalidation_level=float(invalidation_level) if invalidation_level else None,
        trend_72h_pct=trend_72h_pct,
    )

    if not sigma_1h_pct or sigma_1h_pct <= 0:
        result.flags.append("sigma_unavailable")
        result.notes.append("Realized volatility could not be measured; contract left unchanged.")
        return result

    ref = float(reference_price or 0)
    if ref <= 0 or not target_level or not invalidation_level:
        result.flags.append("levels_missing")
        return result

    target_dist = abs(float(target_level) - ref) / ref * 100.0
    inval_dist = abs(float(invalidation_level) - ref) / ref * 100.0
    t_hours = original / 60.0
    expected_move = sigma_1h_pct * math.sqrt(t_hours)
    score = target_dist / expected_move if expected_move > 0 else None

    result.applied = True
    result.target_dist_pct = round(target_dist, 4)
    result.invalidation_dist_pct = round(inval_dist, 4)
    result.expected_move_pct = round(expected_move, 4)
    result.reachability_score = round(score, 3) if score is not None else None

    final_minutes = original
    if score is not None and score > PASS_SCORE:
        # Window where the target sits ~TARGET_SCORE_AFTER_EXTEND expected moves away.
        required_hours = (target_dist / (TARGET_SCORE_AFTER_EXTEND * sigma_1h_pct)) ** 2
        required_minutes = int(math.ceil(required_hours * 60.0 / WINDOW_STEP_MINUTES) * WINDOW_STEP_MINUTES)
        final_minutes = max(original, min(MAX_STALE_MINUTES, required_minutes))
        if final_minutes > original:
            result.notes.append(
                f"Stale window extended {original}m -> {final_minutes}m: target sits "
                f"{target_dist:.2f}% away but the market's expected move in {original}m "
                f"is only {expected_move:.2f}% (score {score:.2f})."
            )

    final_expected = sigma_1h_pct * math.sqrt(final_minutes / 60.0)
    final_score = target_dist / final_expected if final_expected > 0 else None
    result.stale_minutes = final_minutes
    result.final_score = round(final_score, 3) if final_score is not None else None

    if final_score is not None and final_score > HARD_SCORE:
        result.flags.append("low_reachability")
        result.notes.append(
            f"Even at the {final_minutes}m window the target is {final_score:.2f} "
            f"expected moves away — statistically unlikely to be touched."
        )

    # ── Invalidation noise floor ──
    # Backfill evidence: tight stops hit 17% vs 54% without; half of all
    # losses had already travelled >=50% toward target before the stop.
    inval_floor = INVAL_FLOOR_RATIO * final_expected
    if inval_dist < inval_floor:
        result.flags.append("tight_invalidation")
        if enforce_invalidation_floor:
            side = 1.0 if float(invalidation_level) >= ref else -1.0
            widened = round(ref * (1.0 + side * inval_floor / 100.0), 2)
            result.invalidation_level = widened
            result.flags.append("invalidation_widened")
            result.notes.append(
                f"Invalidation widened {float(invalidation_level):,.0f} -> {widened:,.0f}: "
                f"model placed it {inval_dist:.2f}% away, inside the noise floor "
                f"({inval_floor:.2f}% = {INVAL_FLOOR_RATIO} x expected move)."
            )
        else:
            result.notes.append(
                f"Invalidation is {inval_dist:.2f}% away, below the noise floor "
                f"({inval_floor:.2f}% = {INVAL_FLOOR_RATIO} x expected move) — "
                f"elevated risk of a noise stop-out."
            )

    # ── Counter-trend gate ──
    # Bearish continuation against a rising 72h tape hit 14% in the audit.
    if primary_bias and trend_72h_pct is not None:
        bias_up = str(primary_bias).upper().startswith(("BULLISH", "RISK_ON"))
        bias_down = str(primary_bias).upper().startswith(("BEARISH", "RISK_OFF"))
        if (bias_down and trend_72h_pct > COUNTER_TREND_MIN_PCT) or (
            bias_up and trend_72h_pct < -COUNTER_TREND_MIN_PCT
        ):
            result.flags.append("counter_trend")
            result.notes.append(
                f"{primary_bias} called against a {trend_72h_pct:+.2f}% realized 72h "
                f"trend — historically the weakest cohort (14% hit rate)."
            )

    return result


__all__ = [
    "CALIBRATION_VERSION",
    "CalibrationResult",
    "calibrate_contract",
    "fetch_hourly_sigma_pct",
    "fetch_market_stats",
]
