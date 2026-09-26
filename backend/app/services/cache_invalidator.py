# backend/app/services/cache_invalidator.py
"""
Cache Invalidator — LISTEN new_signal & signal_update, flush lq:signals:* cache.

Kenapa ini ada:
  - Endpoint signals di-cache Redis (fresh TTL + stale fallback 10x TTL).
  - Tanpa invalidation, sinyal baru bisa "telat" muncul selama stale window.
  - DB sudah punya trigger pg_notify('new_signal') AFTER INSERT ON signals
    (migration-autotrade-v3.sql) dan pg_notify('signal_update') untuk update
    status (migration-signal-update-trigger.sql).
  - Modul ini LISTEN dua channel itu dan flush semua key lq:signals:* setiap
    ada event, sehingga request berikutnya langsung fresh dari DB.

Pola koneksi mirror app/services/autotrade/engine.py (asyncpg LISTEN,
auto-reconnect dengan keepalive).

Wiring: panggil `asyncio.create_task(cache_invalidator_loop())` di lifespan
FastAPI (app/main.py), berdampingan dengan signal_cache_loop / market_cache_loop.
"""
import asyncio
import logging

import asyncpg

from app.config import settings
from app.core.redis import invalidate_signals_cache

logger = logging.getLogger(__name__)

CHANNELS = ("new_signal", "signal_update")

# Coalesce a burst into ONE flush. The old rule — flush 0.5 s after the first
# event — cut a burst into pieces: on 25 Sep 2026, 77 of 302 flushes landed
# within 3 s of the previous one (14 in the single minute of 11:10), and every
# flush empties the signal caches the next readers then rebuild from the DB.
# Now: flush once the channel has been quiet for _QUIET_SECONDS, but never hold
# a flush longer than _MAX_DELAY_SECONDS, so a steady stream still lands. The
# site polls every 30 s, so 2 s later is invisible to a reader.
_QUIET_SECONDS = 2.0
_MAX_DELAY_SECONDS = 8.0
_pending_flush: asyncio.Task | None = None
_burst_started = 0.0
_last_event = 0.0


def _asyncpg_dsn() -> str:
    """SQLAlchemy DSN -> asyncpg DSN."""
    dsn = settings.DATABASE_URL
    return dsn.replace("postgresql+psycopg2://", "postgresql://").replace(
        "postgresql+asyncpg://", "postgresql://"
    )


def flush_wait(now: float, burst_started: float, last_event: float) -> float:
    """Seconds still to wait before flushing; 0 means flush now."""
    return max(0.0, min(last_event + _QUIET_SECONDS, burst_started + _MAX_DELAY_SECONDS) - now)


async def _flush_when_quiet():
    loop = asyncio.get_event_loop()
    while True:
        wait = flush_wait(loop.time(), _burst_started, _last_event)
        if wait <= 0:
            break
        await asyncio.sleep(wait)
    deleted = invalidate_signals_cache()
    print(f"⚡ [cache-invalidator] flushed {deleted} signal cache keys", flush=True)


def _on_notify(conn, pid, channel, payload):
    """Sync callback from asyncpg: note the event, start a flush if none is waiting."""
    global _pending_flush, _burst_started, _last_event
    loop = asyncio.get_event_loop()
    _last_event = loop.time()
    if _pending_flush is None or _pending_flush.done():
        _burst_started = _last_event
        _pending_flush = loop.create_task(_flush_when_quiet())


async def cache_invalidator_loop():
    """LISTEN forever; auto-reconnect on failure."""
    while True:
        conn = None
        try:
            conn = await asyncpg.connect(_asyncpg_dsn())
            for ch in CHANNELS:
                await conn.add_listener(ch, _on_notify)
            print(f"⚡ [cache-invalidator] listening on {CHANNELS}", flush=True)
            while True:
                await asyncio.sleep(30)
                # keepalive ping; raises kalau koneksi mati -> reconnect
                await conn.execute("SELECT 1")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"[cache-invalidator] connection lost: {e}; retry in 5s")
            await asyncio.sleep(5)
        finally:
            if conn:
                try:
                    await conn.close()
                except Exception:
                    pass
