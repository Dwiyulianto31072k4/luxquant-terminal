"""
LuxQuant Terminal - CoinGecko Category Coins Service
====================================================
Drill-down buat "Sector Rotation": ambil SEMUA koin yang tergolong dalam
satu naratif/kategori CoinGecko (bukan cuma top-3 logo yang disimpan di
snapshot). Dipakai waktu user klik satu baris sektor di Money Flow.

Sumber: CoinGecko /coins/markets?category=<id> (fakta pasar, live).
Caching: Redis stale-while-revalidate (pola sama kayak gecko_dex_service),
per-category key, TTL pendek — komposisi kategori gerak pelan, harga lebih
cepat tapi ini drill-down jadi 10 menit masih relevan.

Prinsip "inform, don't decide": service ini cuma normalisasi angka mentah.
"""
import logging
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.core.redis import cache_get_with_stale, cache_set

log = logging.getLogger("gecko-category")

COINGECKO_API = "https://api.coingecko.com/api/v3"
TIMEOUT = 15.0

CACHE_TTL = 600           # 10 menit fresh (cache_set nulis stale 10x otomatis)
DEFAULT_LIMIT = 100       # cukup buat sebagian besar naratif


def _cg_headers() -> dict:
    """Header CoinGecko sesuai tipe API key (demo/pro). Selaras dgn worker lain."""
    headers = {"accept": "application/json"}
    key = getattr(settings, "COINGECKO_API_KEY", "") or ""
    if not key:
        return headers
    # Key demo diawali "CG-"; sisanya diperlakukan pro.
    if key.startswith("CG-"):
        headers["x-cg-demo-api-key"] = key
    else:
        headers["x-cg-pro-api-key"] = key
    return headers


def _num(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _normalize_coin(c: dict) -> dict:
    """1 koin dari /coins/markets → bentuk flat berisi fakta pasar."""
    return {
        "coin_id": c.get("id", ""),
        "symbol": (c.get("symbol") or "").upper(),
        "name": c.get("name", ""),
        "image": c.get("image", ""),
        "price": _num(c.get("current_price")),
        "market_cap": _num(c.get("market_cap")),
        "market_cap_rank": c.get("market_cap_rank"),
        "volume_24h": _num(c.get("total_volume")),
        "price_change_24h": _num(c.get("price_change_percentage_24h")),
    }


async def _fetch_category_coins(category_id: str, limit: int) -> dict:
    params = {
        "vs_currency": "usd",
        "category": category_id,
        "order": "market_cap_desc",
        "per_page": min(max(limit, 1), 250),
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(
            f"{COINGECKO_API}/coins/markets",
            params=params,
            headers=_cg_headers(),
        )
        res.raise_for_status()
        rows = res.json()

    coins = [_normalize_coin(c) for c in rows if c.get("id")]
    return {
        "category_id": category_id,
        "coins": coins,
        "count": len(coins),
        "source": "coingecko",
        "attribution": "Data: CoinGecko",
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_category_coins(category_id: str, limit: int = DEFAULT_LIMIT) -> dict:
    """Semua koin dalam satu kategori CoinGecko, diurut market cap desc.
    Stale-while-revalidate: cache warm → langsung serve."""
    if not category_id:
        return {"category_id": category_id, "coins": [], "count": 0,
                "error": "missing category_id"}

    cache_key = f"lq:mf:category_coins:{category_id}:{limit}"

    # 1. Cache fresh
    cached, is_stale = cache_get_with_stale(cache_key)
    if cached and not is_stale:
        return cached

    # 2. Fetch fresh
    try:
        payload = await _fetch_category_coins(category_id, limit)
        cache_set(cache_key, payload, ttl=CACHE_TTL)
        return payload
    except Exception as e:
        log.error(f"category coins fetch failed for '{category_id}': {e}")
        # 3. Stale fallback — jangan kosong gara-gara upstream hiccup
        if cached:
            cached["stale"] = True
            return cached
        return {
            "category_id": category_id, "coins": [], "count": 0,
            "source": "coingecko",
            "error": "category coins temporarily unavailable",
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }
