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
