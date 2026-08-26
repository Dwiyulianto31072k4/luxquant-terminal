# backend/app/services/arena_breaker.py
"""
Circuit breaker for failures that retrying cannot fix.

Why this exists
---------------
On 2026-08-22 the OpenAI credit balance hit zero. The monitor timer, which fires
every two minutes and was working perfectly, kept doing exactly what it was
built to do: detect that price had moved, fetch the full daily backdrop — **23
BGeometrics endpoints** — hand it to Stage 1, and receive
`429 credit_balance_exhausted`. Then two minutes later, again.

It did that for four days. About 16,000 upstream calls a day, against a provider
this pipeline has already rate-limited to zero once, to reach an error whose own
message says a human has to go and pay something.

A rate limit is worth retrying. A billing wall is not. The difference is the
whole of this module.

Design
------
Deliberately a file and not a table: the breaker has to work when the pipeline
is already failing, so it must not depend on anything that can also be down.

The cooldown is 30 minutes rather than something longer. Recovery here is a
person adding credit, and they should not have to wait an hour to see the
product come back — 30 minutes cuts the wasted calls by ~93% while still
picking the balance up promptly. Each probe after that costs one full attempt,
which is the price of noticing recovery without a billing API to ask.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

# Substrings that mean "stop trying until a human intervenes". Matched against
# the string form of the exception, so they survive whichever SDK wrapper the
# provider error arrives in.
_TERMINAL_MARKERS = (
    "credit_balance_exhausted",
    "insufficient_quota",
    "no credits remaining",
    "billing_hard_limit_reached",
    "exceeded your current quota",
)

COOLDOWN_SECONDS = int(os.getenv("ARENA_BREAKER_COOLDOWN", "1800"))

_STATE = Path(os.getenv("ARENA_BREAKER_PATH", "/opt/luxquant/state/arena-breaker.json"))


def classify(exc: BaseException) -> Optional[str]:
    """Return a reason key when the failure is terminal, else None."""
    blob = f"{type(exc).__name__}: {exc}".lower()
    for marker in _TERMINAL_MARKERS:
        if marker in blob:
            return marker
    return None


def _read() -> dict:
    try:
        return json.loads(_STATE.read_text())
    except (OSError, ValueError):
        return {}


def state() -> dict:
    """Current breaker state, for health endpoints and logs."""
    d = _read()
    if not d.get("tripped_at"):
        return {"open": False}
    age = time.time() - float(d["tripped_at"])
    return {
        "open": age < COOLDOWN_SECONDS,
        "reason": d.get("reason"),
        "tripped_at": d.get("tripped_at"),
        "seconds_since": round(age),
        "seconds_remaining": max(0, round(COOLDOWN_SECONDS - age)),
        "consecutive": d.get("consecutive", 1),
    }


def is_open() -> tuple[bool, str]:
    s = state()
    if not s.get("open"):
        return False, ""
    return True, (
        f"{s['reason']} — tripped {s['seconds_since']}s ago, "
        f"retrying in {s['seconds_remaining']}s"
    )


def trip(reason: str) -> dict:
    """Open the breaker. Returns the new state.

    `consecutive` counts how many cooldowns have expired only to fail again —
    a run of them is the signal that nobody has acted yet, and it is what an
    alert should escalate on rather than the first failure.
    """
    prev = _read()
    consecutive = int(prev.get("consecutive", 0)) + 1 if prev.get("tripped_at") else 1
    payload = {"tripped_at": time.time(), "reason": reason, "consecutive": consecutive}
    try:
        _STATE.parent.mkdir(parents=True, exist_ok=True)
        _STATE.write_text(json.dumps(payload))
    except OSError:
        # An unwritable state file must not become a second outage. Losing the
        # breaker costs wasted calls; raising here would cost the pipeline.
        pass
    return payload


def reset() -> None:
    try:
        _STATE.unlink()
    except OSError:
        pass
