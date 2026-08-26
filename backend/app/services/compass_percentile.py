# backend/app/services/compass_percentile.py
"""
Percentile scoring for Compass features.

Why this replaces the constants
-------------------------------
The direction score used hand-written absolute thresholds — `score = 1 if
funding_pct > 0.01`, `score = 1 if basis > 50`. Two of them had gone silently
dead by the time anyone looked:

  · **funding-rate**: 0.01%/8h is the *baseline* perpetual funding rate that
    exchanges clamp toward, so a `> 0.01%` test was set at the most common value
    in the data. It fired **0 times in 494 reports**, and the strict `>` meant
    the modal value — 16% of all observations, sitting exactly on the boundary —
    always scored zero.
  · **basis**: the bullish test was `> +50`. Observed range over 795 stored
    observations since May: **−60.96 to −1.45**. Never once approached it, so
    basis could only ever score 0 or −1 and the derivatives input became
    structurally incapable of contributing a bullish signal.

A constant cannot know the regime moved. A percentile against a trailing window
knows by construction, and it costs one query.

Guarantees
----------
* **Causal.** Only observations strictly older than the one being scored are
  used. A percentile that can see its own future turns a backtest into fiction.
* **Magnitude preserved.** Returns a continuous −1..+1 rather than the previous
  ternary {−1, 0, +1}, which made funding at +0.5% and +0.011% identical.
* **Missing is None, never 0.0.** "No data" and "neutral" are different claims
  and the caller has to be able to tell them apart — see `_metric_signal` in
  deterministic_verdict.py for what conflating them costs.
* **Fails safe.** Any error returns None and the caller falls back.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import text

logger = logging.getLogger(__name__)

# Trailing observations used for the rank. ~60 reports is roughly 3-6 days at
# this pipeline's cadence — long enough to describe the current regime, short
# enough to follow it when it turns.
WINDOW = 60

# Below this the rank is too coarse to mean anything: with 15 samples a single
# observation moves the percentile by 6.7pp.
MIN_SAMPLES = 20


def record(feature: str, value: float, observed_at=None) -> None:
    """Append one raw observation. Safe to call repeatedly."""
    from datetime import datetime, timezone

    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        db.execute(
            text("""
                INSERT INTO compass_feature_history (feature, observed_at, raw_value)
                VALUES (:f, :t, :v)
                ON CONFLICT DO NOTHING
            """),
            {"f": feature, "t": observed_at or datetime.now(timezone.utc), "v": float(value)},
        )
        db.commit()
    except Exception as e:  # bookkeeping must never break a report
        logger.warning("feature history write failed for %s: %s", feature, e)
        db.rollback()
    finally:
        db.close()


def score(feature: str, value: Optional[float]) -> Optional[float]:
    """Percentile rank of `value` against the trailing window, mapped to −1..+1.

    Returns None when the value is absent or there is not yet enough history —
    the caller must treat that as "unknown", not as "neutral".
    """
    if value is None:
        return None

    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        rows = db.execute(
            text("""
                SELECT raw_value FROM compass_feature_history
                WHERE feature = :f
                ORDER BY observed_at DESC
                LIMIT :n
            """),
            {"f": feature, "n": WINDOW},
        ).scalars().all()
    except Exception as e:
        logger.warning("feature history read failed for %s: %s", feature, e)
        return None
    finally:
        db.close()

    if len(rows) < MIN_SAMPLES:
        return None

    below = sum(1 for r in rows if r < value)
    ties = sum(1 for r in rows if r == value)
    # Midrank for ties, so a value sitting exactly on a common level lands in the
    # middle of that level rather than at its edge. This is precisely the bug
    # that killed funding: the modal value fell on a strict `>` boundary.
    pct = (below + 0.5 * ties) / len(rows)
    return max(-1.0, min(1.0, 2.0 * (pct - 0.5)))


def describe(feature: str) -> dict:
    """Window state, for health endpoints and for asserting a feature is alive."""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        row = db.execute(
            text("""
                SELECT count(*) AS n, min(raw_value) AS lo, max(raw_value) AS hi
                FROM (SELECT raw_value FROM compass_feature_history
                      WHERE feature = :f ORDER BY observed_at DESC LIMIT :n) s
            """),
            {"f": feature, "n": WINDOW},
        ).one()
        return {"feature": feature, "samples": int(row.n or 0),
                "min": row.lo, "max": row.hi, "ready": (row.n or 0) >= MIN_SAMPLES}
    except Exception:
        return {"feature": feature, "samples": 0, "ready": False}
    finally:
        db.close()
