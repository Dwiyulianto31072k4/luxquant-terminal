"""Keep the BGeometrics cache warm a few endpoints at a time.

The account dropped to the free tier's 10 requests an hour when the plan lapsed
on 2026-08-30. Six metrics moved to Binance, which leaves sixteen on the quota.
A report needs all sixteen at once, so any run starting more than six hours
after the last one — when every entry has aged past the fresh window — asks for
sixteen live fetches against a ceiling of ten, and fails outright.

That is exactly what happened at 04:54 on 2026-09-09. The twelve-hour staleness
guard fired, the run asked for the full backdrop, fifteen of twenty-three
metrics resolved against a floor of eighteen, and the read stayed thirteen hours
old while every service still reported healthy.

Holding all sixteen inside their six-hour window costs 2.7 fetches an hour. This
refreshes the stalest few per run; on a twenty-minute timer that is six an hour,
a full cycle every 2.7 hours, and four an hour still free for the reports
themselves. It never fetches while the rate-limit breaker is cooling, so it
cannot be the thing that empties the window a report was about to use.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time

from app.services import bg_advanced

logger = logging.getLogger("bg-cache-warmer")

# Two per run against a twenty-minute timer is six an hour. Raising either
# without redoing the arithmetic above is how the quota gets emptied under a
# report instead of ahead of it.
BATCH = int(os.getenv("BG_WARM_BATCH", "2"))

# Refresh once an entry is two-thirds through its fresh window, so a metric is
# never handed to a report already stale.
REFRESH_AFTER = bg_advanced.CACHE_TTL_FRESH * 2 // 3

# Hourly series need an hourly cadence. The six-hour window is right for cycle
# and macro metrics that move on a daily print, but basis is published every
# hour and a four-hour-old value is simply the wrong number — which is what the
# dashboard was calling a stale derivatives source. The other intraday inputs
# come from Binance for free; this is the only one left on the quota, so the
# whole correction costs one request an hour out of ten.
INTRADAY = frozenset({"btc-derivatives-basis-1h"})
INTRADAY_REFRESH_AFTER = 3600

# The Binance-backed metrics cost nothing, so they are refreshed on every run
# rather than rationed. Nothing else was doing it: the warmer only ever looked
# at quota endpoints, and the report path refreshes them only when it reuses a
# daily snapshot. top-trader-account-1h sat 138 minutes old with no one due to
# touch it, which is what kept smart_money reading stale after the breaker fix
# had already freed it.
FREE_REFRESH_AFTER = 900


def _quota_endpoints() -> list[str]:
    """Endpoints that actually spend BG quota — the Binance-backed ones are free."""
    return [e for e in bg_advanced.ALL_ENDPOINTS if e not in bg_advanced.BINANCE_BACKED]


async def _age_of(endpoint: str) -> float:
    """Seconds since this endpoint was last fetched; inf when absent.

    Freshness lives in `fetched_at` inside the value, not in the Redis TTL —
    every key is written with the 24h stale TTL regardless of age.
    """
    try:
        raw = await bg_advanced._redis("get", bg_advanced._cache_key(endpoint))
        if not raw:
            return float("inf")
        return time.time() - json.loads(raw).get("fetched_at", 0)
    except Exception as e:
        logger.warning("cache read failed for %s: %s", endpoint, e)
        return float("inf")


async def warm_once() -> dict:
    cooling = await bg_advanced._cooldown_left()
    if cooling > 0:
        logger.info("breaker cooling for %ss — skipping this run", cooling)
        return {"skipped": "cooling", "cooldown_left": cooling}

    endpoints = _quota_endpoints()
    ages = await asyncio.gather(*(_age_of(e) for e in endpoints))

    def _due(ep: str) -> int:
        return INTRADAY_REFRESH_AFTER if ep in INTRADAY else REFRESH_AFTER

    # Sorted by how far past due, not by raw age, so an hourly metric two hours
    # old outranks a daily one three hours old.
    stale = sorted(
        ((_due(ep) - age, ep) for age, ep in zip(ages, endpoints) if age >= _due(ep))
    )
    free_ages = await asyncio.gather(
        *(_age_of(e) for e in sorted(bg_advanced.BINANCE_BACKED))
    )
    free_due = [e for e, a in zip(sorted(bg_advanced.BINANCE_BACKED), free_ages)
                if a >= FREE_REFRESH_AFTER]

    if not stale and not free_due:
        youngest_gap = min(_due(ep) - a for a, ep in zip(ages, endpoints))
        logger.info(
            "all %d endpoints inside the fresh window; next due in %dm",
            len(endpoints), youngest_gap // 60,
        )
        return {"refreshed": [], "stale": 0}

    picked = [ep for _, ep in stale[:BATCH]]

    # Free endpoints ride along outside the batch — they spend no quota, so the
    # cap that protects it does not apply to them.
    picked += free_due

    client = bg_advanced.get_client()
    results = await asyncio.gather(
        *(client.fetch(ep, force_refresh=True) for ep in picked),
        return_exceptions=True,
    )

    ok, failed = [], []
    for ep, res in zip(picked, results):
        if isinstance(res, Exception) or not getattr(res, "ok", False):
            failed.append(ep)
        else:
            ok.append(ep)

    logger.info(
        "%d stale of %d; refreshed %s%s",
        len(stale), len(endpoints), ok or "nothing",
        f"; failed {failed}" if failed else "",
    )
    return {"refreshed": ok, "failed": failed, "stale": len(stale)}


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    # The BGeometrics token rides in the query string, and httpx logs the whole
    # URL at INFO — which put the credential in journald on every refresh.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    asyncio.run(warm_once())


if __name__ == "__main__":
    main()
