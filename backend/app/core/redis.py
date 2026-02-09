# backend/app/core/redis.py
"""
LuxQuant Terminal - Redis Connection & Cache Helpers
Provides fast cached access to pre-computed signal data and market data.
"""
import json
import redis
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
    """Set value in cache with TTL (seconds)"""
    try:
        client = get_redis()
        client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        print(f"⚠️ Redis SET error: {e}")
        return False


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
    sort_order: str = "desc"
) -> str:
    """Build cache key for signals page query"""
    return f"lq:signals:page:{page}:{page_size}:{status or 'all'}:{pair or 'all'}:{risk or 'all'}:{sort_by}:{sort_order}"


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