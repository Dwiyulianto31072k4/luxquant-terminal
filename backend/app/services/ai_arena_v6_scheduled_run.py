"""
LuxQuant AI Arena v6.1 — Scheduled Worker Entry
=================================================
Wrapper invoked by systemd timer (luxquant-arena-v6.timer) at:
  00:00 / 06:00 / 12:00 / 18:00 UTC (every 6 hours).

Plus optional anomaly mode (tightened threshold + 30-min cooldown):
  - Triggered by separate hourly check
  - Uses --anomaly flag to mark report as anomaly-triggered

Exit codes:
  0  = success (report generated and persisted)
  1  = soft fail (e.g., insufficient BG data, AI API timeout) — log but don't crash timer
  2  = hard fail (config error, DB unreachable) — investigate

Usage:
  python3 -m app.services.ai_arena_v6_scheduled_run [--anomaly REASON]

Environment:
  Reads .env via load_dotenv() in worker module.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

from app.services.ai_arena_v6_worker import generate_v6_report

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════════
# Price context fetcher
# ════════════════════════════════════════════════════════════════════════

async def fetch_price_context() -> tuple[float, dict]:
    """Fetch BTC price + 24h context from Bybit."""
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            "https://api.bybit.com/v5/market/tickers",
            params={"category": "spot", "symbol": "BTCUSDT"},
        )
        ticker = r.json()["result"]["list"][0]

    btc_price = float(ticker["lastPrice"])
    change_24h = float(ticker["price24hPcnt"]) * 100
    high_24h = float(ticker["highPrice24h"])
    low_24h = float(ticker["lowPrice24h"])

    # Try to get 7d change from klines (1d interval, last 8 candles)
    change_7d = None
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                "https://api.bybit.com/v5/market/kline",
                params={
                    "category": "spot",
                    "symbol": "BTCUSDT",
                    "interval": "D",
                    "limit": 8,
                },
            )
            klines = r.json()["result"]["list"]
            if len(klines) >= 7:
                # Bybit returns newest first
                price_7d_ago = float(klines[6][4])  # close of 7 days ago
                change_7d = round((btc_price / price_7d_ago - 1) * 100, 2)
    except Exception as e:
        logger.warning(f"Could not fetch 7d change: {e}")

    price_context = {
        "change_24h_pct": round(change_24h, 2),
        "change_7d_pct": change_7d,
        "high_24h": high_24h,
        "low_24h": low_24h,
    }

    return btc_price, price_context


# ════════════════════════════════════════════════════════════════════════
# Main entry
# ════════════════════════════════════════════════════════════════════════

async def main(is_anomaly: bool = False, anomaly_reason: str | None = None) -> int:
    started_at = datetime.now(timezone.utc)
    mode = "ANOMALY" if is_anomaly else "SCHEDULED"
    logger.info(f"=== AI Arena v6 {mode} run started at {started_at.isoformat()} ===")

    try:
        btc_price, price_context = await fetch_price_context()
        logger.info(
            f"BTC: ${btc_price:,.0f} "
            f"({price_context['change_24h_pct']:+.2f}% 24h)"
        )
    except Exception as e:
        logger.exception(f"Failed to fetch BTC price: {e}")
        return 1

    try:
        bundle = await generate_v6_report(
            btc_price=btc_price,
            price_context=price_context,
            is_anomaly=is_anomaly,
            anomaly_reason=anomaly_reason,
        )
    except Exception as e:
        logger.exception(f"Pipeline failed: {e}")
        return 1

    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
    logger.info(
        f"=== Run complete | {bundle.report_id} | "
        f"verdict: {bundle.verdict.headline} ({bundle.verdict.primary_30d.confidence}%) | "
        f"cost: ${bundle.cost_breakdown['total_usd']:.4f} | "
        f"elapsed: {elapsed:.1f}s ==="
    )

    return 0


def cli():
    parser = argparse.ArgumentParser(
        description="Scheduled v6 AI Arena worker runner"
    )
    parser.add_argument(
        "--anomaly",
        type=str,
        default=None,
        metavar="REASON",
        help="Mark this run as anomaly-triggered (e.g., 'price_dump_3.2%%_60min')",
    )
    args = parser.parse_args()

    is_anomaly = args.anomaly is not None
    exit_code = asyncio.run(main(is_anomaly=is_anomaly, anomaly_reason=args.anomaly))
    sys.exit(exit_code)


if __name__ == "__main__":
    cli()
