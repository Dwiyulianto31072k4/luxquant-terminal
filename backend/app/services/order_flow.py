# backend/app/services/order_flow.py
"""
Order-flow imbalance for BTC, from Binance klines.

Why this exists
---------------
`confluence_engine.evaluate_smart_money` has accepted `taker_vol_buy` /
`taker_vol_sell` since it was written, and the worker calls
`compute_all(bg_snapshot=...)` — **without `external`**. So those parameters, and
`etf_flow_today_usd` and `coinbase_premium_pct` beside them, have been `None` on
every run. `taker_volume` was recorded `available: False` in all 494 reports
audited. A feature was wired to an interface that nothing ever fed.

BGeometrics' `taker-vol-1h` cannot fix it: it returns one aggregate number, and
an imbalance needs the buy and sell sides separately. Binance klines carry
`takerBuyBaseVolume` alongside total volume, so sell = volume − takerBuy, which
is the standard construction.

What this is NOT yet
--------------------
This records only. It is deliberately kept out of the direction score, because
the score was tested against it and it did not earn a place:

  · OFI alone predicts nothing here — 53.5% at ±5% (p=0.20), 55.0% at ±10%
    (p=0.12), 52.7% at ±20% (p=0.60), against 59.8% (p=0.0004) for price
    momentum alone.
  · As a confirmation filter on momentum it looked good on the full sample
    (+0.0816% vs +0.0610% aligned return) and then **failed out of sample**:
    July 56.2% *worse* than the 58.3% of momentum alone, August 67.2% better.
    It did not replicate, so it is not a rule.

Recording it starts the clock on the honest evaluation instead. Nothing can be
judged on data that was never collected, and this data was never collected.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

KLINES = "https://api.binance.com/api/v3/klines"


async def fetch_taker_split(symbol: str = "BTCUSDT", interval: str = "1h") -> Optional[dict]:
    """Buy/sell taker volume for the last CLOSED candle, plus the imbalance.

    The last closed candle, never the one in progress: a partially formed bar
    would make the value depend on when the run happened to fire, and would let
    a backtest see part of its own future.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(KLINES, params={"symbol": symbol, "interval": interval, "limit": 2})
            r.raise_for_status()
            ks = r.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("order flow fetch failed: %s", e)
        return None

    if not isinstance(ks, list) or len(ks) < 2:
        return None

    k = ks[0]  # index 1 is the candle still forming
    try:
        volume = float(k[5])
        taker_buy = float(k[9])
    except (TypeError, ValueError, IndexError):
        return None
    if volume <= 0:
        return None

    taker_sell = volume - taker_buy
    return {
        "taker_vol_buy": taker_buy,
        "taker_vol_sell": taker_sell,
        "imbalance_pct": (taker_buy - taker_sell) / volume * 100,
        "open_time": int(k[0]),
    }
