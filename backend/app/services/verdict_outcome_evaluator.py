"""
LuxQuant AI Arena v6.1 — Verdict Outcome Evaluator
====================================================
Hourly worker that evaluates pending verdict outcomes whose horizon has elapsed.

Workflow:
  1. Query ai_arena_verdict_outcomes WHERE outcome='pending' AND horizon_target_at <= NOW()
  2. For each pending outcome:
     - Fetch BTC price at horizon_target_at (use Bybit klines historical)
     - Compute move_pct
     - Determine hit/miss using evaluate_outcome()
     - Update row in DB

Run as systemd timer or APScheduler (existing pattern in v4 workers).

Manual run:
  python3 -m app.services.verdict_outcome_evaluator

Scheduled run (recommended):
  Every hour via APScheduler integrated into ai_arena_v6_worker.py main loop,
  OR via systemd timer (luxquant-v6-evaluator.timer).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from dotenv import load_dotenv
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.ai_arena_v6 import (
    AIArenaVerdictOutcome,
    DEFAULT_NEUTRAL_BAND_PCT,
    DEFAULT_THRESHOLD_PCT,
    evaluate_outcome,
)

load_dotenv()
logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════════
# Price fetch — historical BTC from Bybit klines
# ════════════════════════════════════════════════════════════════════════

BYBIT_KLINE_URL = "https://api.bybit.com/v5/market/kline"


async def fetch_btc_price_at(target_dt: datetime, max_retries: int = 3) -> Optional[float]:
    """
    Fetch BTC close price at the 1h candle that contains target_dt.
    Returns None if Bybit doesn't have data for that time (e.g. future).
    """
    if target_dt > datetime.now(timezone.utc):
        # Horizon hasn't elapsed yet
        return None

    # Get 1h kline at target — Bybit returns klines starting from 'start'
    # We want the candle that contains target_dt, so request a few candles around it
    start_ms = int(target_dt.timestamp() * 1000)
    end_ms = start_ms + 60 * 60 * 1000  # +1h

    params = {
        "category": "spot",
        "symbol": "BTCUSDT",
        "interval": "60",
        "start": start_ms,
        "end": end_ms,
        "limit": 2,
    }

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(BYBIT_KLINE_URL, params=params)
                data = r.json()

            if data.get("retCode") != 0:
                logger.warning(f"Bybit klines retCode={data.get('retCode')}: {data.get('retMsg')}")
                return None

            klines = data.get("result", {}).get("list", [])
            if not klines:
                logger.warning(f"No kline data for {target_dt.isoformat()}")
                return None

            # Bybit returns: [start, open, high, low, close, volume, turnover]
            # Take the closest candle's close price
            kline = klines[0]
            close_price = float(kline[4])
            return close_price

        except Exception as e:
            logger.warning(f"Bybit kline fetch attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)

    logger.error(f"All {max_retries} attempts failed for kline at {target_dt}")
    return None


# ════════════════════════════════════════════════════════════════════════
# Evaluator main
# ════════════════════════════════════════════════════════════════════════

async def evaluate_pending_outcomes(
    limit: int = 100,
    dry_run: bool = False,
) -> dict:
    """
    Evaluate all pending outcomes whose horizon has elapsed.

    Args:
        limit: max outcomes to evaluate per run (safety)
        dry_run: if True, don't write to DB

    Returns:
        {evaluated, hit, miss, expired, errors}
    """
    stats = {"evaluated": 0, "hit": 0, "miss": 0, "expired": 0, "errors": 0}

    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        pending = (
            db.query(AIArenaVerdictOutcome)
            .filter(
                AIArenaVerdictOutcome.outcome == "pending",
                AIArenaVerdictOutcome.horizon_target_at <= now,
            )
            .order_by(AIArenaVerdictOutcome.horizon_target_at.asc())
            .limit(limit)
            .all()
        )

        if not pending:
            logger.info("No pending outcomes to evaluate.")
            return stats

        logger.info(f"Evaluating {len(pending)} pending outcomes...")

        for row in pending:
            try:
                price_at_horizon = await fetch_btc_price_at(row.horizon_target_at)

                if price_at_horizon is None:
                    # Couldn't fetch — leave as pending, retry next run
                    logger.warning(
                        f"Skipping {row.report_uuid} {row.horizon} — no price data"
                    )
                    continue

                outcome, move_pct = evaluate_outcome(
                    direction=row.direction,
                    price_at_call=row.price_at_call,
                    price_at_horizon=price_at_horizon,
                    threshold_pct=row.threshold_pct or DEFAULT_THRESHOLD_PCT,
                    neutral_band_pct=row.neutral_band_pct or DEFAULT_NEUTRAL_BAND_PCT,
                )

                stats[outcome] = stats.get(outcome, 0) + 1
                stats["evaluated"] += 1

                logger.info(
                    f"  {row.report_uuid} {row.horizon} {row.direction.upper()}: "
                    f"${row.price_at_call:.0f} → ${price_at_horizon:.0f} "
                    f"({move_pct:+.2f}%) → {outcome.upper()}"
                )

                if not dry_run:
                    row.price_at_horizon = price_at_horizon
                    row.move_pct = move_pct
                    row.outcome = outcome
                    row.evaluated_at = now

            except Exception as e:
                logger.exception(f"Error evaluating outcome {row.id}: {e}")
                stats["errors"] += 1
                continue

        if not dry_run:
            db.commit()
            logger.info(f"Committed {stats['evaluated']} outcome updates.")

    finally:
        db.close()

    return stats


# ════════════════════════════════════════════════════════════════════════
# Track-record stats query
# ════════════════════════════════════════════════════════════════════════

def compute_track_record(
    db: Session,
    days: int = 30,
    horizon: Optional[str] = None,
) -> dict:
    """
    Compute hit-rate stats for last N days, optionally filtered by horizon.

    Returns:
      {
        "horizons": {
          "24h": {"total": 28, "hit": 22, "miss": 6, "hit_rate": 0.786},
          "72h": {...},
          "7d": {...},
          "30d": {...}
        },
        "overall": {"total": ..., "hit": ..., "miss": ..., "hit_rate": ...},
        "window_days": 30
      }
    """
    from datetime import timedelta

    since = datetime.now(timezone.utc) - timedelta(days=days)

    q = db.query(AIArenaVerdictOutcome).filter(
        AIArenaVerdictOutcome.called_at >= since,
        AIArenaVerdictOutcome.outcome.in_(["hit", "miss"]),
    )
    if horizon:
        q = q.filter(AIArenaVerdictOutcome.horizon == horizon)

    rows = q.all()

    horizons_stats = {}
    for h in ("24h", "72h", "7d", "30d"):
        h_rows = [r for r in rows if r.horizon == h]
        total = len(h_rows)
        hit_count = sum(1 for r in h_rows if r.outcome == "hit")
        horizons_stats[h] = {
            "total": total,
            "hit": hit_count,
            "miss": total - hit_count,
            "hit_rate": round(hit_count / total, 3) if total > 0 else None,
        }

    total_all = len(rows)
    hit_all = sum(1 for r in rows if r.outcome == "hit")

    return {
        "horizons": horizons_stats,
        "overall": {
            "total": total_all,
            "hit": hit_all,
            "miss": total_all - hit_all,
            "hit_rate": round(hit_all / total_all, 3) if total_all > 0 else None,
        },
        "window_days": days,
    }


# ════════════════════════════════════════════════════════════════════════
# CLI entry
# ════════════════════════════════════════════════════════════════════════

async def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    print("=== Verdict Outcome Evaluator ===")
    stats = await evaluate_pending_outcomes(dry_run=False)
    print(f"\nResults: {stats}")

    # Print track record
    db = SessionLocal()
    try:
        tr = compute_track_record(db, days=30)
        print("\n=== Track Record (last 30 days) ===")
        for h, s in tr["horizons"].items():
            rate = f"{s['hit_rate']*100:.1f}%" if s["hit_rate"] is not None else "n/a"
            print(f"  {h}: {s['hit']}/{s['total']} ({rate})")
        print(f"\n  OVERALL: {tr['overall']['hit']}/{tr['overall']['total']} "
              f"({(tr['overall']['hit_rate'] or 0)*100:.1f}%)")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
