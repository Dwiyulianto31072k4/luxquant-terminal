# backend/app/services/fx_worker.py
"""
FX Rates Worker — fetches USDT-to-fiat rates from CoinGecko.

Strategy:
  - Fetch /simple/price?ids=tether&vs_currencies=<all_supported>
  - One API call returns ALL 46 currencies (efficient)
  - Refresh every 10 minutes (fiat rates are slow-moving)
  - Cache in Redis with stale fallback for resilience
  - Uses dedicated COINGECKO_API_KEY_CURRENCY via shared client to isolate
    quota from main market data calls (sharded API key strategy)

Architecture:
  - Runs as asyncio.Task in main FastAPI event loop (NOT a separate thread)
  - Shares httpx client lifecycle with uvicorn (via init_clients in lifespan)
  - This fixes the "Event bound to different event loop" bug from threading
"""
import asyncio
import time
from typing import Optional

from app.core.redis import cache_set, is_redis_available
from app.core.http_client import get_coingecko_currency_client
from app.services.currency_mapping import SUPPORTED_CURRENCIES

COINGECKO_API = "https://api.coingecko.com/api/v3"

# Worker config
FX_REFRESH_INTERVAL = 600  # 10 minutes
FX_CACHE_TTL = 900         # 15 minutes (slightly longer than refresh for overlap)
FX_RATES_KEY = "lq:fx:rates"

# Track running task to prevent duplicate spawns across uvicorn workers
_fx_task: Optional[asyncio.Task] = None


async def fetch_fx_rates() -> Optional[dict]:
    """
    Fetch USDT-to-fiat rates for all supported currencies.

    Uses shared coingecko_currency_client which has the dedicated
    COINGECKO_API_KEY_CURRENCY header pre-configured.
    """
    vs_currencies = ",".join(sorted(c.lower() for c in SUPPORTED_CURRENCIES))

    try:
        client = get_coingecko_currency_client()
        response = await client.get(
            f"{COINGECKO_API}/simple/price",
            params={
                "ids": "tether",
                "vs_currencies": vs_currencies,
            },
            # No manual headers — client has them already
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


async def fx_refresh_loop():
    """Background loop — refresh FX rates every FX_REFRESH_INTERVAL seconds."""
    print(f"💱 [fx_worker] Starting FX rates refresh loop (every {FX_REFRESH_INTERVAL}s)")

    # Initial fetch immediately on startup (small delay to let server settle)
    await asyncio.sleep(2)
    await _refresh_once()

    while True:
        await asyncio.sleep(FX_REFRESH_INTERVAL)
        await _refresh_once()


def start_fx_worker():
    """
    Entry point — called from main.py lifespan startup.

    Spawns fx_refresh_loop as asyncio.Task in CURRENT event loop
    (the uvicorn worker's loop). This shares lifecycle with httpx
    clients initialized in init_clients(), avoiding the
    "Event bound to different event loop" bug.

    Multi-worker note: each uvicorn worker will spawn its own task.
    To prevent 4x API calls, consider gating with worker_id check
    or moving to a dedicated systemd service in the future.
    """
    global _fx_task

    if not is_redis_available():
        print("🟡 [fx_worker] Redis not available — FX worker disabled")
        return

    # Get current event loop (the one uvicorn worker is using)
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        # No running loop in this context — caller must be in async context
        print("⚠️ [fx_worker] No event loop available — worker disabled")
        return

    # Spawn as task in current loop (shares lifecycle with httpx clients)
    _fx_task = loop.create_task(fx_refresh_loop())
    print("💱 [fx_worker] Worker task scheduled in main event loop")