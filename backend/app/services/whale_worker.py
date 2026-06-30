"""
LuxQuant Terminal — Whale Alert Background Worker

Keeps the whale raw pool (Redis: whale:raw:all) warm so the API never blocks
on an upstream call (blockchain.com is rate-limited 1 req/10s; Etherscan adds
latency). With the pool warm, /whale/transactions, /whale/stats and
/whale/flows all serve instantly by filtering the pool in-memory.

Runs in-process as an asyncio task — same pattern as cache_worker /
overview_worker / subscription_worker. Registered at app startup.

INTERVAL (90s) must stay below RAW_CACHE_TTL (600s in whale_service) so the
pool never expires under normal operation; the 600s TTL is the
stale-while-revalidate safety net if the worker hiccups.
"""
import asyncio
import time
import traceback

from app.core.redis import is_redis_available
from app.core.leader import is_leader  # single-leader gate (avoid N× duplicate API calls)
from app.services.whale_service import refresh_whale_cache

INTERVAL = 90  # seconds — MUST stay below RAW_CACHE_TTL (600s)


async def whale_cache_loop():
    """Refresh the whale raw pool on a short interval."""
    print(f"🔄 Whale cache worker started (interval: {INTERVAL}s)")
    await asyncio.sleep(7)  # let the app finish booting before first fetch

    while True:
        if not is_leader():
            await asyncio.sleep(15)   # standby — re-check leadership quickly
            continue
        try:
            if not is_redis_available():
                await asyncio.sleep(INTERVAL)
                continue

            start = time.time()
            payload = await refresh_whale_cache()
            n = len(payload.get("transactions", []))
            elapsed = round((time.time() - start) * 1000)
            print(f"✅ Whale cache: {n} raw txs in {elapsed}ms")

        except Exception as e:
            print(f"❌ Whale cache worker error: {type(e).__name__}: {e}")
            traceback.print_exc()

        await asyncio.sleep(INTERVAL)


def start_whale_worker():
    """Register the whale cache background task."""
    loop = asyncio.get_event_loop()
    loop.create_task(whale_cache_loop())
    print("🐋 Whale worker registered (interval: 90s)")
