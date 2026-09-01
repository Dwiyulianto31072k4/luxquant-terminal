"""
Ledger-calibrated confidence.
=============================
Clamps LLM-invented horizon confidence to the system's *actual* historical
hit-rate, so a horizon can never advertise more confidence than its track
record earns.

Why clamp (not replace/blend):
- Safe in all data regimes. With thin data the clamp simply doesn't bite.
- The LLM may still be MORE cautious than the ledger (that's fine, kept).
  It just can't be MORE optimistic than reality (that's the dangerous case).

Rule per horizon:
- if evaluated sample >= MIN_SAMPLE:
      final = min(llm_confidence, round(hit_rate * 100))
      provisional = False
- else (not enough data to trust the rate):
      final = llm_confidence  (unchanged)
      provisional = True
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

MIN_SAMPLE = 20  # below this, the hit-rate isn't trustworthy enough to clamp

# maps CompleteVerdict horizon attribute -> track_record horizon key
_HORIZON_MAP = {
    # Only the projected horizons get ledger-calibrated confidence.
    # primary_30d is cycle context now (not clamped).
    "tactical_24h": "24h",
    "secondary_7d": "72h",
}


# ─── Live ledger ──────────────────────────────────────────────────────
#
# compute_track_record() in verdict_outcome_evaluator reads
# ai_arena_verdict_outcomes, which Compass 2.0 retired: the table has never held
# a row, so every report has calibrated its confidence against an empty ledger
# and the clamp has never once fired. The real record lives in
# compass_projection_resolutions — 526 resolutions since 1 July.
#
# Directional outcomes only. RANGE_HELD and RANGE_BREAK_* answer a different
# question (did the range hold), and folding them in would score a read for
# something it did not claim.
#
# Split by market_mode because that is where the record actually separates:
# SELECTIVE_RISK_ON hits 72.0% (n=161, CI 64.7-78.4) against DEFENSIVE's 46.7%
# (n=107, CI 37.6-56.1) — 25.3pp, z=4.18, intervals disjoint. A single blended
# number would let a defensive read borrow a risk-on read's credibility.
_HIT = ("CLEAN_HIT", "LATE_HIT")
_MISS = ("INVALIDATED_FIRST",)


def compute_projection_track_record(db, days: int = 90, market_mode: str | None = None) -> dict:
    """Directional hit-rate from the live projection ledger, shaped for
    apply_ledger_confidence(). Never raises — an empty dict simply means no clamp."""
    from sqlalchemy import text as _text
    try:
        rows = db.execute(_text("""
            SELECT r.outcome
              FROM compass_projection_resolutions r
              JOIN compass_projection_contracts c USING (projection_id)
             WHERE r.created_at >= NOW() - make_interval(days => :d)
               AND r.outcome = ANY(:outcomes)
               AND (:mode IS NULL OR c.market_mode = :mode)
        """), {"d": int(days), "outcomes": list(_HIT + _MISS),
               "mode": market_mode}).fetchall()
    except Exception as exc:
        # Say so. An empty dict here means "no clamp", which is exactly what a
        # broken query looks like from the outside — the failure mode this whole
        # calibration path has been sitting in for months.
        logger.warning("projection ledger unavailable (%s): %s", type(exc).__name__, exc)
        return {}

    total = len(rows)
    if not total:
        return {}
    hit = sum(1 for r in rows if r[0] in _HIT)
    stats = {"total": total, "hit": hit, "miss": total - hit,
             "hit_rate": round(hit / total, 4)}
    # The projections ARE the 24h tactical read; 72h has no separate ledger yet,
    # so it is left absent rather than given the 24h number.
    return {"horizons": {"24h": stats}, "overall": dict(stats),
            "window_days": int(days), "market_mode": market_mode}


def apply_ledger_confidence(verdict: Any, track_record: dict | None) -> list[dict]:
    """
    Mutate verdict.{primary_30d, secondary_7d, tactical_24h}.confidence in place,
    clamping each to its ledger hit-rate when the sample is large enough.

    Returns an audit list (what changed) for logging / storage. Never raises.
    """
    audit: list[dict] = []
    if not track_record:
        return audit

    horizons = track_record.get("horizons", {}) or {}

    for attr, key in _HORIZON_MAP.items():
        hv = getattr(verdict, attr, None)
        if hv is None:
            continue
        stats = horizons.get(key) or {}
        total = stats.get("total") or 0
        hit_rate = stats.get("hit_rate")  # 0..1 or None

        before = hv.confidence
        if total >= MIN_SAMPLE and hit_rate is not None:
            ceiling = round(hit_rate * 100)
            if before > ceiling:
                hv.confidence = ceiling
                audit.append({
                    "horizon": key, "action": "clamped",
                    "from": before, "to": ceiling,
                    "hit_rate": hit_rate, "n": total,
                })
            else:
                audit.append({
                    "horizon": key, "action": "kept",
                    "value": before, "ceiling": ceiling, "n": total,
                })
        else:
            audit.append({
                "horizon": key, "action": "provisional",
                "value": before, "n": total,
                "reason": f"sample<{MIN_SAMPLE}",
            })

    return audit
