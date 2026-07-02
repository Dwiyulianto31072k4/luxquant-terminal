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
        lines.append(
            "    - counter-trend continuation calls (e.g. BEARISH_CONTINUATION while the "
            "72h tape is rising >1%) hit 14% historically. Against the tape, prefer "
            "NEUTRAL_RANGE or demand overwhelming multi-layer evidence."
        )

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


def get_active_lessons(trend_72h_pct: Optional[float] = None) -> list[dict]:
    """Lessons eligible for the current regime. Fail-safe: empty list."""
    try:
        from app.services import compass_brain as brain

        regime = brain.classify_regime(trend_72h_pct)
        return brain.active_lessons(regime=regime)
    except Exception:
        return []


def get_active_lesson_ids(trend_72h_pct: Optional[float] = None) -> list[str]:
    return [str(m.get("id")) for m in get_active_lessons(trend_72h_pct) if m.get("id")]


__all__ = ["build_calibration_context", "get_active_lessons", "get_active_lesson_ids"]
