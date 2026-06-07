"""
LuxQuant Terminal - GeckoTerminal DEX Service (Step 3a)
=======================================================
Live DEX buy/sell pressure dari GeckoTerminal Public API (free, no key).
Inti buat tab "Coins" — jawab "koin mana yang lagi diakumulasi" lewat
FAKTA on-chain: berapa buys vs sells, volume, likuiditas. Bukan judgment.

Sumber: https://api.geckoterminal.com/api/v2  (Beta, 30 calls/min, free)
Coverage: 1jt+ token DEX termasuk meme/alt yang nggak listing CoinGecko.

Caching: Redis stale-while-revalidate (pola yang sama kayak whale_service).
Rate-limit aware: trending butuh CUMA 1 call → murah, aman di TTL pendek.

Prinsip "inform, don't decide":
  - Service ini cuma normalisasi angka mentah dari API.
  - Tag "akumulasi/distribusi" TIDAK dihitung di sini — itu di router,
    dan tetap deskriptif (turunan transparan dari buys vs sells).
"""
import json
import logging
from datetime import datetime, timezone

import httpx

from app.core.redis import get_redis

log = logging.getLogger("gecko-dex")

GT_BASE = "https://api.geckoterminal.com/api/v2"
GT_HEADERS = {"accept": "application/json;version=20230302"}  # pin version (Beta)
TIMEOUT = 15.0

# Cache keys
TRENDING_KEY = "lq:dex:trending"
TRENDING_TTL = 300          # 5 min — trending bergerak pelan
TRENDING_STALE_TTL = 1800   # 30 min — safety net stale-while-revalidate

# Guard: pool di bawah ini di-skip (anti-spam / likuiditas tipis nggak informatif)
MIN_RESERVE_USD = 50_000     # likuiditas minimum
MIN_VOLUME_24H_USD = 25_000  # volume 24h minimum


def _f(v, default=0.0):
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _normalize_pool(p: dict) -> dict | None:
    """Ubah 1 pool GeckoTerminal jadi bentuk flat berisi FAKTA aja.
    Return None kalau di bawah guard likuiditas/volume."""
    attr = p.get("attributes", {}) or {}

    reserve = _f(attr.get("reserve_in_usd"))
    vol = attr.get("volume_usd", {}) or {}
    vol_24h = _f(vol.get("h24"))

    if reserve < MIN_RESERVE_USD or vol_24h < MIN_VOLUME_24H_USD:
        return None

    tx = attr.get("transactions", {}) or {}
    h1 = tx.get("h1", {}) or {}
    h24 = tx.get("h24", {}) or {}

    buys_1h = int(h1.get("buys", 0) or 0)
    sells_1h = int(h1.get("sells", 0) or 0)
    buys_24h = int(h24.get("buys", 0) or 0)
    sells_24h = int(h24.get("sells", 0) or 0)

    pc = attr.get("price_change_percentage", {}) or {}

    return {
        "pool_address": attr.get("address", ""),
        "name": attr.get("name", ""),               # e.g. "PEPE / WETH"
        "base_symbol": attr.get("name", "").split(" / ")[0] if attr.get("name") else "",
        "price_usd": _f(attr.get("base_token_price_usd")),
        "fdv_usd": _f(attr.get("fdv_usd")),
        "market_cap_usd": _f(attr.get("market_cap_usd")) or None,
        "reserve_usd": reserve,            # likuiditas
        "volume_24h_usd": vol_24h,
        "volume_1h_usd": _f(vol.get("h1")),
        "price_change_1h": _f(pc.get("h1")),
        "price_change_24h": _f(pc.get("h24")),
        # FAKTA buy/sell — angka mentah, user yang nyimpulin
        "buys_1h": buys_1h,
        "sells_1h": sells_1h,
        "buys_24h": buys_24h,
        "sells_24h": sells_24h,
        # Rasio sebagai konteks (bukan label). 1.0 = seimbang.
        "buy_sell_ratio_1h": round(buys_1h / sells_1h, 2) if sells_1h else None,
        "buy_sell_ratio_24h": round(buys_24h / sells_24h, 2) if sells_24h else None,
    }


async def _fetch_trending_pools() -> dict:
    """1 API call → trending pools lintas network. Murah (hemat rate limit)."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(
            f"{GT_BASE}/networks/trending_pools",
            params={"include": "base_token", "page": 1},
            headers=GT_HEADERS,
        )
        res.raise_for_status()
        data = res.json()

    pools = []
    for p in data.get("data", []):
        norm = _normalize_pool(p)
        if norm:
            pools.append(norm)

    payload = {
        "pools": pools,
        "count": len(pools),
        "source": "geckoterminal",
        "attribution": "Data: GeckoTerminal",  # syarat free API
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }
    return payload


async def get_dex_trending(force: bool = False) -> dict:
    """Trending DEX pools dengan buy/sell pressure (fakta).
    Stale-while-revalidate: kalau cache warm, langsung serve.
    """
    redis = get_redis()

    # 1. Cache hit (fresh)
    if redis and not force:
        try:
            cached = redis.get(TRENDING_KEY)
            if cached:
                return json.loads(cached)
        except Exception as e:
            log.warning(f"DEX cache read error: {e}")

    # 2. Fetch fresh
    try:
        payload = await _fetch_trending_pools()
        if redis:
            try:
                # tulis 2x: fresh (TTL pendek) + stale (TTL panjang)
                redis.setex(TRENDING_KEY, TRENDING_TTL, json.dumps(payload, default=str))
                redis.setex(TRENDING_KEY + ":stale", TRENDING_STALE_TTL,
                            json.dumps(payload, default=str))
            except Exception as e:
                log.warning(f"DEX cache write error: {e}")
        return payload
    except Exception as e:
        log.error(f"DEX trending fetch failed: {e}")
        # 3. Stale fallback — jangan kosong cuma gara-gara upstream hiccup
        if redis:
            try:
                stale = redis.get(TRENDING_KEY + ":stale")
                if stale:
                    out = json.loads(stale)
                    out["stale"] = True
                    return out
            except Exception:
                pass
        return {
            "pools": [], "count": 0, "source": "geckoterminal",
            "error": "DEX data temporarily unavailable",
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }
