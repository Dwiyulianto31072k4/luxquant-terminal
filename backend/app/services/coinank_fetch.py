"""
CoinAnk liquidation-heatmap fetcher (Apify).
============================================
Pulls fresh heatmap JSON each cycle via the Apify run-sync endpoint, so the
worker no longer needs a manual "Start" click.

Actor: api_merge/coinank-liquidation-heatmap  (id 5sxBkcaleZAxHRPWB)
Input:  {"symbol": "BTCUSDT", "interval": "12h"}
Output: a list whose [0] is {tickSize, chartInterval, start, end, liqHeatMap{...}}
        -> feed directly into parse_liq_heatmap().

Env required:
    APIFY_TOKEN   your Apify personal API token (Settings -> API & Integrations)

Design:
- run-sync-get-dataset-items: one call runs the actor and returns dataset items.
- Hard timeout so a slow Apify run can never hang the worker.
- Never raises: on any failure returns None, logs a warning. The liquidity layer
  then degrades gracefully (evaluate_liquidity(None) -> NEUTRAL, available=False),
  exactly like any other missing BG metric. The rest of the report is unaffected.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# api_merge/coinank-liquidation-heatmap  (slug form uses ~ instead of /)
APIFY_ACTOR = "api_merge~coinank-liquidation-heatmap"
APIFY_RUN_SYNC_URL = (
    f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"
)


async def fetch_coinank_heatmap(
    symbol: str = "BTCUSDT",
    interval: str = "12h",
    *,
    timeout_s: float = 90.0,
) -> Any | None:
    """
    Run the CoinAnk actor synchronously and return its dataset items.

    Returns the raw payload (a list; [0] holds the heatmap record) ready for
    parse_liq_heatmap(), or None on any error/timeout.
    """
    token = os.getenv("APIFY_TOKEN")
    if not token:
        logger.warning("fetch_coinank_heatmap: APIFY_TOKEN not set — skipping liquidity layer")
        return None

    payload = {"symbol": symbol, "interval": interval}

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            resp = await client.post(
                APIFY_RUN_SYNC_URL,
                params={"token": token},
                json=payload,
            )
        if resp.status_code >= 400:
            logger.warning(
                "fetch_coinank_heatmap: Apify HTTP %s — %s",
                resp.status_code, resp.text[:200],
            )
            return None

        data = resp.json()
        # run-sync-get-dataset-items returns the dataset items array directly.
        if not data:
            logger.warning("fetch_coinank_heatmap: empty dataset returned")
            return None

        # sanity check: the record we need must carry liqHeatMap
        rec = data[0] if isinstance(data, list) else data
        if not isinstance(rec, dict) or "liqHeatMap" not in rec:
            logger.warning("fetch_coinank_heatmap: unexpected shape (no liqHeatMap)")
            return None

        return data

    except httpx.TimeoutException:
        logger.warning("fetch_coinank_heatmap: Apify run timed out after %ss", timeout_s)
        return None
    except Exception as exc:  # never let the fetcher kill the worker
        logger.warning("fetch_coinank_heatmap: %s", exc, exc_info=False)
        return None
