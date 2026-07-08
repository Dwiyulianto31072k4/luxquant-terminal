"""
LuxQuant dedicated background-poller process.

Runs every external-API poller / cache worker in ONE place instead of inside
the 4 gunicorn API request-workers. Combined with LUXQUANT_POLLER_ELIGIBLE=0 on
the API service, this gives:
  • API workers serve HTTP only — no N× CoinGecko/Binance calls, no 12s cache
    builds stalling request handling, lower memory / fewer OOM kills.
  • This process is the sole poller "leader" — no leader flapping between the
    4 API workers (which was causing the duplicate 429/418 bursts).

Run via luxquant-poller.service:
    LUXQUANT_POLLER_ELIGIBLE=1 python -m app.workers.poller_main
"""
from __future__ import annotations

import asyncio
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# This process MUST be allowed to lead — force it on before importing leader,
# whose eligibility flag is read at import time.
os.environ.setdefault("LUXQUANT_POLLER_ELIGIBLE", "1")

from app.core.database import SessionLocal, engine
from app.core.redis import is_redis_available
from app.core.http_client import init_clients, close_clients
from app.core.leader import start_leader_election
from app.services.cache_worker import start_cache_workers, precompute_outcomes
from app.services.overview_worker import start_overview_workers
from app.services.notification_worker import start_notification_worker
from app.services.fx_worker import start_fx_worker
from app.services.whale_worker import start_whale_worker
from app.services.subscription_worker import start_subscription_worker


async def _amain() -> None:
    print("🛰️  LuxQuant poller starting...")
    init_clients()
    start_leader_election()

    # Pre-create _cache_outcomes table BEFORE the cache workers use it.
    try:
        db = SessionLocal()
        precompute_outcomes(db)
        db.close()
        print("📋 Cache outcomes table initialized")
    except Exception as e:
        print(f"⚠️ Could not pre-create outcomes table: {e}")

    if is_redis_available():
        print("🟢 Redis connected — starting cache/overview/fx/whale/notification workers")
        # Stagger the FIRST warm of each subsystem. If every worker fires its
        # cold-warm cycle at t=0 (what happens on `systemctl restart`), the
        # heavy Postgres tasks (Signal-cache CTE ~7s + notification batch ~12s)
        # and the slow external fetches (Whale ~18s, CoinGecko ~20s) all land at
        # once and peg the shared 2-core box → burst WORKER TIMEOUTs on the API
        # workers. Phasing the starts apart keeps them from colliding on restart
        # (and, since intervals match, keeps them phase-separated afterwards).
        async def _staggered_start():
            start_cache_workers()          # signal cache (heavy Postgres CTE)
            await asyncio.sleep(8)
            start_overview_workers()       # market / overview / coingecko / bitcoin
            await asyncio.sleep(8)
            start_notification_worker()    # notification batch (heavy Postgres writes)
            await asyncio.sleep(6)
            start_fx_worker()
            await asyncio.sleep(4)
            start_whale_worker()           # slow external fetch
        asyncio.create_task(_staggered_start())
        from app.services.cache_invalidator import cache_invalidator_loop
        asyncio.create_task(cache_invalidator_loop())
        print("⚡ Signal cache invalidator started (LISTEN new_signal)")
    else:
        print("🟡 Redis not available — notification worker only")
        start_notification_worker()

    start_subscription_worker()

    try:
        from app.services.journey_aggregate import start_journey_aggregate_worker
        start_journey_aggregate_worker()
        print("📊 Journey aggregate worker started (incremental hourly)")
    except Exception as e:
        print(f"⚠️ Journey aggregate worker failed to start: {e}")

    print("✅ LuxQuant poller: all background workers running")

    # Idle forever; systemd SIGTERM cancels this and we clean up below.
    stop = asyncio.Event()
    try:
        await stop.wait()
    finally:
        print("👋 LuxQuant poller shutting down...")
        try:
            await close_clients()
        except Exception:
            pass
        pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        for t in pending:
            t.cancel()
        if pending:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*pending, return_exceptions=True), timeout=5
                )
            except asyncio.TimeoutError:
                pass
        try:
            engine.dispose()  # release pooled DB connections on shutdown
        except Exception:
            pass


def main() -> None:
    try:
        asyncio.run(_amain())
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()
