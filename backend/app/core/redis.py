# backend/app/core/redis.py
"""
LuxQuant Terminal - Redis Connection & Cache Helpers
Provides fast cached access to pre-computed signal data and market data.
"""
import json
import redis
from datetime import datetime, timedelta
from typing import Optional, Any
from app.config import settings

# Redis client (singleton)
_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """Get or create Redis connection"""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
    return _redis_client


def is_redis_available() -> bool:
    """Check if Redis is connected and responding"""
    try:
        client = get_redis()
        return client.ping()
    except Exception:
        return False


# ============================================
# Cache Read/Write Helpers
# ============================================

def cache_get(key: str) -> Optional[Any]:
    """Get value from cache, return None if miss or error"""
    try:
        client = get_redis()
        data = client.get(key)
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        print(f"⚠️ Redis GET error: {e}")
        return None


def cache_set(key: str, value: Any, ttl: int = 30) -> bool:
    """Set value in cache with TTL (seconds).
    Also stores a stale copy with 10x TTL as fallback."""
    try:
        client = get_redis()
        data = json.dumps(value, default=str)
        client.setex(key, ttl, data)
        # Stale fallback — 10x TTL (min 600s = 10min, max 3600s = 1hr)
        stale_ttl = max(min(ttl * 10, 3600), 600)
        client.setex(f"{key}:stale", stale_ttl, data)
        return True
    except Exception as e:
        print(f"⚠️ Redis SET error: {e}")
        return False


def cache_get_with_stale(key: str) -> tuple[Optional[Any], bool]:
    """Get value from cache. Returns (data, is_stale).
    First tries fresh cache, then stale fallback."""
    try:
        client = get_redis()
        data = client.get(key)
        if data:
            return json.loads(data), False
        # Try stale fallback
        stale = client.get(f"{key}:stale")
        if stale:
            return json.loads(stale), True
        return None, False
    except Exception as e:
        print(f"⚠️ Redis GET error: {e}")
        return None, False


def cache_single_flight(key: str, ttl: int, compute, keep=None, wait_s: float = 20.0) -> Any:
    """Serve `key` from cache; on a miss, let ONE caller compute it.

    Without this every request that misses runs the same heavy query at once,
    and when those queries outlast the gateway (504) nothing is ever cached, so
    each retry adds another — on 2026-09-19 nineteen identical outcome scans
    ran together and the box sat at load 27. Now:
      * fresh copy            -> return it;
      * someone is computing  -> return the stale copy if there is one, else
                                 wait (up to `wait_s`) for their result;
      * otherwise             -> take the lock, compute, cache, release.
    `keep(value)` can refuse to cache a result (e.g. {"ok": False}).
    """
    import time

    fresh = cache_get(key)
    if fresh is not None:
        return fresh
    stale, _ = cache_get_with_stale(key)
    lock = f"{key}:lock"
    try:
        got = bool(get_redis().set(lock, "1", nx=True, ex=max(60, int(wait_s * 6))))
    except Exception:
        got = True  # no Redis: nothing to coordinate with, just compute
    if not got:
        if stale is not None:
            return stale
        deadline = time.monotonic() + wait_s
        while time.monotonic() < deadline:
            time.sleep(0.5)
            fresh = cache_get(key)
            if fresh is not None:
                return fresh
    try:
        value = compute()
        if keep is None or keep(value):
            cache_set(key, value, ttl)
        return value
    finally:
        if got:
            try:
                get_redis().delete(lock)
            except Exception:
                pass


def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching pattern"""
    try:
        client = get_redis()
        keys = client.keys(pattern)
        if keys:
            return client.delete(*keys)
        return 0
    except Exception as e:
        print(f"⚠️ Redis DELETE error: {e}")
        return 0


def invalidate_signals_cache() -> int:
    """Invalidate all signals-related cache"""
    try:
        client = get_redis()
        keys = client.keys("lq:signals:*")
        if keys:
            return client.delete(*keys)
        return 0
    except Exception as e:
        print(f"⚠️ Redis invalidate error: {e}")
        return 0


def build_signals_page_key(
    page: int = 1,
    page_size: int = 20,
    status: str = "",
    pair: str = "",
    risk: str = "",
    sort_by: str = "created_at",
    sort_order: str = "desc",
    date_from: str = "",
    date_to: str = "",
) -> str:
    """
    Build cache key for signals page query.
    
    For "Last 7 Days" requests, normalize to "7d:<date>" format
    so it matches the pre-computed cache from the worker.
    """
    # Detect "Last 7 Days" pattern: date_from is ~7 days ago, no date_to
    date_suffix = ""
    if date_from and not date_to:
        try:
            df = datetime.strptime(date_from, '%Y-%m-%d')
            days_ago = (datetime.utcnow() - df).days
            if 6 <= days_ago <= 8:  # fuzzy match for "7 days ago"
                date_suffix = f":7d:{date_from}"
            else:
                date_suffix = f":df:{date_from}"
        except ValueError:
            date_suffix = f":df:{date_from}"
    elif date_from and date_to:
        date_suffix = f":df:{date_from}:dt:{date_to}"

    return f"lq:signals:page:{page}:{page_size}:{status or 'all'}:{pair or 'all'}:{risk or 'all'}:{sort_by}:{sort_order}{date_suffix}"


# ============================================
# Cache Stats (for monitoring)
# ============================================

def get_cache_info() -> dict:
    """Get cache statistics"""
    try:
        client = get_redis()
        info = client.info("memory")
        keys = client.keys("lq:*")
        return {
            "connected": True,
            "total_keys": len(keys),
            "memory_used": info.get("used_memory_human", "unknown"),
            "signal_keys": len([k for k in keys if "signals" in k]),
            "market_keys": len([k for k in keys if "market" in k]),
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}