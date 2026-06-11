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

# Debounce: burst update (mis. 3 NOTIFY beruntun saat TP1+TP2+TP3 sekaligus)
# cukup 1 flush. 0.5s tidak terasa oleh user tapi memangkas flush berlebih.
_DEBOUNCE_SECONDS = 0.5
_pending_flush: asyncio.Task | None = None


def _asyncpg_dsn() -> str:
    """SQLAlchemy DSN -> asyncpg DSN."""
    dsn = settings.DATABASE_URL
    return dsn.replace("postgresql+psycopg2://", "postgresql://").replace(
        "postgresql+asyncpg://", "postgresql://"
    )


async def _flush_after_debounce():
    await asyncio.sleep(_DEBOUNCE_SECONDS)
    deleted = invalidate_signals_cache()
    logger.info(f"[cache-invalidator] flushed {deleted} signal cache keys")


def _on_notify(conn, pid, channel, payload):
    """Sync callback dari asyncpg — schedule debounced flush."""
    global _pending_flush
    if _pending_flush is None or _pending_flush.done():
        _pending_flush = asyncio.get_event_loop().create_task(_flush_after_debounce())


async def cache_invalidator_loop():
    """LISTEN forever; auto-reconnect on failure."""
    while True:
        conn = None
        try:
            conn = await asyncpg.connect(_asyncpg_dsn())
            for ch in CHANNELS:
                await conn.add_listener(ch, _on_notify)
            logger.info(f"[cache-invalidator] listening on {CHANNELS}")
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
