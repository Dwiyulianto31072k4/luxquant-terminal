"""Keep the Runners results (/analytics/hunt-full-tp) warm for all three windows.

Each window is eight scans of the outcomes CTE — tens of seconds, more under
load, past the gateway's 30s. Computed on a click it 504'd, was never cached,
and every retry started another scan (2026-09-19). This oneshot recomputes 7d,
30d and all-time every ten minutes at idle priority and writes the same keys
the route reads, so a member opening Results reads a finished answer.

    python -m app.workers.hunt_stats_warmer
"""

from __future__ import annotations

import time

from app.core.database import SessionLocal
from app.core.redis import cache_set

WINDOWS = (0, 7, 30)
MIN_N = 40


def _log(msg: str) -> None:
    print(f"[hunt-stats-warmer] {msg}", flush=True)


def run() -> None:
    from app.api.routes.edge_lab import HUNT_FTP_TTL, hunt_full_tp_key, hunt_full_tp_payload
    from app.services.hunt_recipe import RUNNER_TOP_K

    db = SessionLocal()
    try:
        for days in WINDOWS:
            t0 = time.time()
            try:
                payload = hunt_full_tp_payload(days, MIN_N, RUNNER_TOP_K, db)
                if payload.get("ok"):
                    cache_set(hunt_full_tp_key(days, MIN_N, RUNNER_TOP_K), payload, HUNT_FTP_TTL)
                _log(f"days={days} ok={payload.get('ok')} ({time.time() - t0:.1f}s)")
            except Exception as exc:  # one window failing must not stop the others
                db.rollback()
                _log(f"days={days} failed: {exc}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
