"""Proof that a worker's loop is turning, not just that its process exists.

systemd calls a unit "active" for as long as the process lives. That says
nothing about a loop that has stalled: a LISTEN connection that died without
raising, an HTTP call that never returns, a client that gave up reconnecting
while the process kept running (the DRC forwarder sat "active" and silent for
12 h on 2026-09-01). Each long-running worker calls `beat()` once per turn of
its loop; `app.workers.liveness_watchdog` alerts when a beat goes stale while
systemd still reports the unit active.

A beat is a Redis key, `lq:alive:<name>`, holding when the loop last turned.
Writes are throttled per worker, and a Redis failure is swallowed: a heartbeat
must never cost the worker a turn.
"""
from __future__ import annotations

import json
import os
import time
from typing import Optional

PREFIX = "lq:alive:"
MIN_WRITE_GAP_S = 30  # a loop turning every 5 s still writes twice a minute

_last_write: dict[str, float] = {}


def beat(name: str, every_s: float) -> None:
    """Record one turn of `name`'s loop, which turns roughly every `every_s`."""
    now = time.time()
    if now - _last_write.get(name, 0.0) < MIN_WRITE_GAP_S:
        return
    try:
        from app.core.redis import get_redis

        get_redis().set(
            PREFIX + name,
            json.dumps({"ts": int(now), "every": int(every_s), "pid": os.getpid()}),
            ex=int(max(every_s * 6, 900)),
        )
        _last_write[name] = now
    except Exception:
        pass


def last_beat(name: str, redis_client=None) -> Optional[dict]:
    """The last beat `name` recorded, or None if there is none."""
    try:
        if redis_client is None:
            from app.core.redis import get_redis

            redis_client = get_redis()
        raw = redis_client.get(PREFIX + name)
        return json.loads(raw) if raw else None
    except Exception:
        return None
