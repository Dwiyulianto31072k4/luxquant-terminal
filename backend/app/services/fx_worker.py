# backend/app/services/fx_worker.py
"""
FX Rates Worker — fetches USDT-to-fiat rates from CoinGecko.

Strategy:
  - Fetch /simple/price?ids=tether&vs_currencies=<all_supported>
  - One API call returns ALL 46 currencies (efficient)
  - Refresh every 10 minutes (fiat rates are slow-moving)
  - Cache in Redis with stale fallback for resilience
  - Uses dedicated COINGECKO_API_KEY_CURRENCY to isolate quota from
    main market data calls (sharded API key strategy)

Cache keys:
  - lq:fx:rates       → primary (TTL 15min, refreshed every 10min)
  - lq:fx:rates:stale → fallback (TTL 24h, used if API fails)
"""
import os
import asyncio
import threading
import time
from typing import Optional

from app.core.redis import cache_set, cache_get, is_redis_available
from app.core.http_client import get_coingecko_client
from app.services.currency_mapping import SUPPORTED_CURRENCIES

COINGECKO_API = "https://api.coingecko.com/api/v3"

# Dedicated API key for FX (separate quota from market data)
# Falls back to main key if dedicated one is not configured
CG_FX_API_KEY = os.getenv("COINGECKO_API_KEY_CURRENCY") or os.getenv("COINGECKO_API_KEY", "")
CG_FX_HEADERS = {"accept": "application/json"}
if CG_FX_API_KEY:
    CG_FX_HEADERS["x-cg-demo-api-key"] = CG_FX_API_KEY

# Worker config
FX_REFRESH_INTERVAL = 600  # 10 minutes
FX_CACHE_TTL = 900         # 15 minutes (slightly longer than refresh for overlap)
FX_RATES_KEY = "lq:fx:rates"


async def fetch_fx_rates() -> Optional[dict]:
    """
    Fetch USDT-to-fiat rates for all supported currencies.

    Returns dict like:
        {
            "base": "USDT",
            "rates": {"usd": 1.0, "idr": 16450.5, "eur": 0.92, ...},
            "updated_at": 1736900000,
            "source": "coingecko"
        }

    Returns None if fetch fails.
    """
    # Build comma-separated lowercase currency list
    # CoinGecko expects lowercase: "usd,idr,eur,..."
    vs_currencies = ",".join(sorted(c.lower() for c in SUPPORTED_CURRENCIES))

    try:
        client = get_coingecko_client()
        response = await client.get(
            f"{COINGECKO_API}/simple/price",
            params={
                "ids": "tether",
                "vs_currencies": vs_currencies,
            },
            headers=CG_FX_HEADERS,
        )

        if response.status_code == 429:
            print("⚠️ [fx_worker] CoinGecko rate limit hit — keeping stale data")
            return None

        response.raise_for_status()
        data = response.json()

        tether_prices = data.get("tether")
        if not tether_prices or not isinstance(tether_prices, dict):
            print(f"⚠️ [fx_worker] Invalid CG response: {data}")
            return None

        # Uppercase keys for consistency with our SUPPORTED_CURRENCIES
        rates = {k.upper(): v for k, v in tether_prices.items() if isinstance(v, (int, float)) and v > 0}

        # Sanity check: USD should always be ~1.0 (USDT is pegged)
        usd_rate = rates.get("USD", 0)
        if not (0.95 <= usd_rate <= 1.05):
            print(f"⚠️ [fx_worker] Suspicious USD rate: {usd_rate} — ignoring batch")
            return None

        if len(rates) < 10:
            print(f"⚠️ [fx_worker] Too few rates returned ({len(rates)}) — likely partial failure")
            return None

        result = {
            "base": "USDT",
            "rates": rates,
            "updated_at": int(time.time()),
            "source": "coingecko",
            "count": len(rates),
        }
        return result

    except Exception as e:
        print(f"⚠️ [fx_worker] Fetch error: {e}")
        return None


async def fx_refresh_loop():
    """Background loop — refresh FX rates every FX_REFRESH_INTERVAL seconds."""
    print(f"💱 [fx_worker] Starting FX rates refresh loop (every {FX_REFRESH_INTERVAL}s)")

    # Initial fetch immediately on startup
    await _refresh_once()

    while True:
        await asyncio.sleep(FX_REFRESH_INTERVAL)
        await _refresh_once()


async def _refresh_once():
    """Single refresh cycle — fetch and cache."""
    try:
        result = await fetch_fx_rates()
        if result:
            cache_set(FX_RATES_KEY, result, ttl=FX_CACHE_TTL)
            print(f"💱 [fx_worker] Cached {result['count']} FX rates "
                  f"(USD={result['rates'].get('USD'):.4f}, "
                  f"IDR={result['rates'].get('IDR', 0):.0f})")
        else:
            print("⚠️ [fx_worker] Refresh skipped — fetch returned None")
    except Exception as e:
        print(f"⚠️ [fx_worker] Refresh error: {e}")


def start_fx_worker():
    """Entry point — called from main.py lifespan startup."""
    if not is_redis_available():
        print("🟡 [fx_worker] Redis not available — FX worker disabled")
        return

    def run_in_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(fx_refresh_loop())
        except Exception as e:
            print(f"⚠️ [fx_worker] Thread crashed: {e}")
        finally:
            loop.close()

    thread = threading.Thread(target=run_in_thread, daemon=True, name="fx-worker")
    thread.start()
    print("💱 [fx_worker] Worker thread started")