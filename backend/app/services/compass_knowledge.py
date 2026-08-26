"""
LuxQuant BTC Compass 2.0 — Knowledge / Calibration Context
============================================================
Builds the CALIBRATION_CONTEXT block injected into the Stage-2 prompt.
This is the "self-awareness" layer: the model sees measured market physics
(realized volatility, expected moves, the 72h tape) and its OWN audited
track record (first-barrier scoring from compass_projection_resolutions),
so barrier sizing and probabilities are grounded in reality instead of vibes.

Everything here is deterministic and fail-safe: any error returns an empty
string and the report generation proceeds without the block.
"""

from __future__ import annotations

import logging
import random
import os
import math
from typing import Optional

from sqlalchemy import text

logger = logging.getLogger(__name__)

TRACK_RECORD_DAYS = 14
HIT_OUTCOMES = ("CLEAN_HIT", "LATE_HIT")
MISS_OUTCOMES = ("INVALIDATED_FIRST",)


def _expected_move_line(sigma_1h: float) -> str:
    parts = []
    for hours in (2, 4, 8, 24):
        parts.append(f"{sigma_1h * math.sqrt(hours):.2f}% ({hours}h)")
    return " / ".join(parts)


def _track_record_lines() -> list[str]:
    """Per-bias first-barrier scoreboard over the last TRACK_RECORD_DAYS."""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT
                c.primary_bias,
                COUNT(*) FILTER (WHERE r.outcome IN ('CLEAN_HIT','LATE_HIT'))   AS wins,
                COUNT(*) FILTER (WHERE r.outcome = 'INVALIDATED_FIRST')          AS losses
            FROM compass_projection_resolutions r
            JOIN compass_projection_contracts c USING (projection_id)
            WHERE r.outcome IN ('CLEAN_HIT','LATE_HIT','INVALIDATED_FIRST')
              AND c.active_from >= NOW() - INTERVAL '%s days'
            GROUP BY c.primary_bias
            ORDER BY (COUNT(*)) DESC
        """ % TRACK_RECORD_DAYS)).all()
    finally:
        db.close()

    lines: list[str] = []
    total_w = total_l = 0
    for bias, wins, losses in rows:
        wins, losses = int(wins or 0), int(losses or 0)
        scored = wins + losses
        if scored == 0:
            continue
        total_w += wins
        total_l += losses
        lines.append(f"    - {bias}: {wins}W/{losses}L ({round(100 * wins / scored)}% hit)")
    if total_w + total_l:
        lines.append(
            f"    - OVERALL directional: {total_w}W/{total_l}L "
            f"({round(100 * total_w / (total_w + total_l))}% hit) — "
            f"your probabilities.primary must stay consistent with this reality."
        )
    return lines


def build_calibration_context(
    sigma_1h_pct: Optional[float] = None,
    trend_72h_pct: Optional[float] = None,
) -> str:
    """
    Returns the CALIBRATION_CONTEXT prompt block, or "" on any failure.
    Market stats can be passed in (already fetched by the caller) or will be
    fetched here as a fallback.
    """
    try:
        if sigma_1h_pct is None or trend_72h_pct is None:
            from app.services.compass_reachability import fetch_market_stats

            stats = fetch_market_stats()
            sigma_1h_pct = sigma_1h_pct or stats.get("sigma_1h_pct")
            trend_72h_pct = trend_72h_pct if trend_72h_pct is not None else stats.get("trend_72h_pct")

        lines: list[str] = ["CALIBRATION_CONTEXT (measured reality — size every level against this):"]

        if sigma_1h_pct:
            lines.append(f"  Realized 1h volatility: {sigma_1h_pct:.2f}%")
            lines.append(f"  Expected move (1 sigma * sqrt(T)): {_expected_move_line(sigma_1h_pct)}")
        if trend_72h_pct is not None:
            tape = "RISING" if trend_72h_pct > 1.0 else "FALLING" if trend_72h_pct < -1.0 else "FLAT"
            lines.append(f"  Realized 72h tape: {trend_72h_pct:+.2f}% ({tape})")

        lines.append("  HARD-EARNED RULES from your own audited history:")
        lines.append(
            "    - invalidation must sit >= 1.25x expected move from reference_price. "
            "Closer stops hit only 17% historically; the system will widen them anyway, "
            "so choose a structural level beyond the noise floor yourself."
        )
        lines.append(
            "    - primary_touch should sit within ~1.0x expected move of your chosen "
            "stale window. Further targets historically resolve LATE or expire."
        )
        # A hard-coded hit rate used to sit here — "counter-trend continuation
        # calls hit 14% historically". It was measured once, written into the
        # source, and then went stale exactly the way the funding threshold did:
        # over the labelled set that cohort now runs 69.2% (n=13, p=0.382).
        #
        # Worse, it ended up contradicting the vault. The same prompt was
        # telling the model that BEARISH_CONTINUATION into a rising tape hits
        # 14% AND that it is "your strongest cohort at 82% — lean on it",
        # because a hand-written constant and an auto-learned lesson were both
        # writing into this block with nothing reconciling them.
        #
        # Removed rather than updated. Any number typed in here is a number that
        # will be wrong later and will not announce it. Cohort statistics belong
        # in the vault, where they are re-measured daily and now have to clear a
        # confidence interval before they may claim to be a rule.

        track = _track_record_lines()
        if track:
            lines.append(f"  YOUR AUDITED TRACK RECORD (last {TRACK_RECORD_DAYS}d, first-barrier scoring):")
            lines.extend(track)

        # ── Brain vault lessons (Fase 3 retrieval) ──
        lessons = get_active_lessons(trend_72h_pct)
        if lessons:
            lines.append("  LESSONS FROM YOUR BRAIN VAULT (obey unless data clearly contradicts):")
            for lesson in lessons:
                lines.append(f"    - [{lesson.get('status')}] {lesson.get('prompt_line')}")

        return "\n".join(lines)
    except Exception as exc:
        logger.warning("Calibration context skipped (%s)", type(exc).__name__)
        return ""


# Share of runs each lesson is deliberately withheld from, to turn the
# reflection worker's "A/B" into an actual experiment. See below.
LESSON_HOLDOUT_RATE = float(os.getenv("COMPASS_LESSON_HOLDOUT", "0.25"))

# Decided ONCE per process. Each report is its own systemd-timer run, so a
# module-level memo is exactly one report — and it has to be memoised, because
# `build_calibration_context()` (what goes in the prompt) and
# `get_active_lesson_ids()` (what gets recorded on the contract) are separate
# calls. Randomising without this would let them disagree, and the attribution
# key would then be a record of lessons that were never in the prompt.
# A single slot, not one per regime. Within a report the regime is fixed, so a
# second regime appearing in the same process means the two callers were handed
# different market stats — and the failure mode there is silent: the prompt gets
# one draw, the contract records another, and the attribution key becomes a lie
# that still parses. One slot makes that impossible and logs it instead.
_HOLDOUT_MEMO: dict[str, list[dict]] = {}
_HOLDOUT_REGIME: list = []


def get_active_lessons(trend_72h_pct: Optional[float] = None) -> list[dict]:
    """Lessons eligible for the current regime, minus a random holdout.

    Why a holdout at all: `compass_reflection._lesson_ab` scores each lesson by
    comparing contracts that carried it against contracts that did not — and
    calls the result an A/B. It is not one. A lesson only exists after it was
    written, and it was written because its cohort was winning, so "with the
    lesson" is by construction the period the cohort was already doing well.
    Both validated lessons scored +22pp and +26pp under that method, and every
    retired one scored negative — status and score computed from the same
    outcomes, which is a mirror, not a measurement.

    Withholding each lesson from a random share of runs breaks that. Assignment
    stops being "before vs after" and becomes a coin flip, so the comparison can
    finally say something about the lesson rather than about the fortnight.

    The cost is that a quarter of runs go without a rule believed to be useful.
    That is the price of finding out whether it is, and at ~5.5 directional
    calls a day it is the only affordable way to ask.
    """
    try:
        from app.services import compass_brain as brain

        regime = brain.classify_regime(trend_72h_pct)
        if _HOLDOUT_REGIME:
            if _HOLDOUT_REGIME[0] != regime:
                logger.warning(
                    "Lesson holdout asked for regime %r after %r in the same run — "
                    "callers disagree on the market stats; reusing the first draw so "
                    "the prompt and the recorded attribution cannot diverge.",
                    regime, _HOLDOUT_REGIME[0],
                )
            return _HOLDOUT_MEMO["run"]

        eligible = brain.active_lessons(regime=regime)
        kept = [m for m in eligible if random.random() >= LESSON_HOLDOUT_RATE]
        held = len(eligible) - len(kept)
        if held:
            logger.info("Lesson holdout: withheld %d of %d for this run", held, len(eligible))
        _HOLDOUT_MEMO["run"] = kept
        _HOLDOUT_REGIME.append(regime)
        return kept
    except Exception:
        return []


def get_active_lesson_ids(trend_72h_pct: Optional[float] = None) -> list[str]:
    return [str(m.get("id")) for m in get_active_lessons(trend_72h_pct) if m.get("id")]


__all__ = ["build_calibration_context", "get_active_lessons", "get_active_lesson_ids"]
