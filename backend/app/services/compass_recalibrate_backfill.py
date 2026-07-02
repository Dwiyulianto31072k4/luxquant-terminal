"""
LuxQuant BTC Compass 2.0 — Backfill Window Recalibration
==========================================================
One-time helper: applies the reachability calibration (compass_reachability)
RETROACTIVELY to historical projection contracts, so a fresh resolver backfill
judges them with properly sized stale windows.

Honest-history rule: sigma is measured from the 72 hourly closes BEFORE each
contract's active_from — the window each contract gets is the one the guardrail
WOULD have assigned at publication time. Levels are never moved.

Intended sequence (see COMPASS_RESOLVER_RUNBOOK.md):
  1. Reset previous resolutions (SQL below)
  2. python3 -m app.services.compass_recalibrate_backfill --dry-run   # review
     python3 -m app.services.compass_recalibrate_backfill             # apply
  3. python3 -m app.services.compass_projection_resolver --backfill --verbose

Reset SQL (step 1):
  DELETE FROM compass_projection_events WHERE source = 'compass_projection_resolver';
  DELETE FROM compass_projection_resolutions;
  UPDATE compass_projection_contracts SET status = 'SUPERSEDED' WHERE status IN ('RESOLVED','STALE');
  UPDATE compass_projection_contracts SET status = 'ACTIVE', superseded_at = NULL
   WHERE projection_id = (SELECT projection_id FROM compass_projection_contracts ORDER BY active_from DESC LIMIT 1);
"""

from __future__ import annotations

import argparse
import json
import logging
import statistics
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.compass_reachability import (
    SIGMA_LOOKBACK_HOURS,
    calibrate_contract,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BYBIT_KLINE_URL = "https://api.bybit.com/v5/market/kline"
MAX_AGE_DAYS = 30


def _fetch_hourly_closes(start: datetime, end: datetime) -> dict[int, float]:
    """Hourly BTCUSDT closes keyed by epoch-ms. Backward pagination (Bybit
    anchors responses to `end`)."""
    closes: dict[int, float] = {}
    start_ms = int(start.timestamp() * 1000)
    cursor_end_ms = int(end.timestamp() * 1000)
    with httpx.Client(timeout=15) as client:
        while cursor_end_ms >= start_ms:
            resp = client.get(BYBIT_KLINE_URL, params={
                "category": "spot",
                "symbol": "BTCUSDT",
                "interval": "60",
                "start": start_ms,
                "end": cursor_end_ms,
                "limit": 1000,
            })
            resp.raise_for_status()
            data = resp.json()
            if data.get("retCode") != 0:
                raise RuntimeError(f"Bybit kline error: {data.get('retMsg')}")
            rows = data.get("result", {}).get("list", [])
            if not rows:
                break
            for row in rows:
                closes[int(row[0])] = float(row[4])
            oldest_ms = min(int(row[0]) for row in rows)
            if oldest_ms <= start_ms:
                break
            cursor_end_ms = oldest_ms - 3_600_000
    logger.info("Fetched %d hourly closes", len(closes))
    return closes


def _sigma_at(closes_sorted: list[tuple[int, float]], at: datetime) -> float | None:
    """Stdev (pct) of hourly returns over the SIGMA_LOOKBACK_HOURS closes
    strictly before `at`."""
    at_ms = int(at.timestamp() * 1000)
    window = [c for ts, c in closes_sorted if ts < at_ms][-(SIGMA_LOOKBACK_HOURS + 1):]
    if len(window) < 24:
        return None
    returns = [
        (window[i] / window[i - 1] - 1.0) * 100.0
        for i in range(1, len(window))
        if window[i - 1] > 0
    ]
    if len(returns) < 12:
        return None
    sigma = statistics.pstdev(returns)
    return round(sigma, 4) if sigma > 0 else None


def recalibrate(dry_run: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    summary = {"checked": 0, "extended": 0, "flagged_only": 0, "unchanged": 0, "no_sigma": 0}
    try:
        contracts = db.execute(text("""
            SELECT projection_id, reference_price, primary_touch_level,
                   invalidation_level, stale_after_minutes, active_from
            FROM compass_projection_contracts
            WHERE active_from >= NOW() - (:days || ' days')::interval
            ORDER BY active_from ASC
        """), {"days": MAX_AGE_DAYS}).mappings().all()
        summary["checked"] = len(contracts)
        if not contracts:
            return summary

        earliest = min(c["active_from"] for c in contracts)
        if earliest.tzinfo is None:
            earliest = earliest.replace(tzinfo=timezone.utc)
        closes = _fetch_hourly_closes(earliest - timedelta(hours=SIGMA_LOOKBACK_HOURS + 2), now)
        closes_sorted = sorted(closes.items())

        for c in contracts:
            active_from = c["active_from"]
            if active_from.tzinfo is None:
                active_from = active_from.replace(tzinfo=timezone.utc)
            sigma = _sigma_at(closes_sorted, active_from)
            result = calibrate_contract(
                reference_price=float(c["reference_price"]),
                target_level=float(c["primary_touch_level"]),
                invalidation_level=float(c["invalidation_level"]),
                stale_after_minutes=int(c["stale_after_minutes"]),
                sigma_1h_pct=sigma,
            )
            if not result.applied:
                summary["no_sigma"] += 1
                continue
            if not result.has_findings:
                summary["unchanged"] += 1
                continue

            if result.window_extended:
                summary["extended"] += 1
            else:
                summary["flagged_only"] += 1

            logger.info(
                "%s %s: window %sm -> %sm (score %.2f -> %.2f) flags=%s",
                "DRY-RUN" if dry_run else "APPLY",
                c["projection_id"],
                result.original_stale_minutes,
                result.stale_minutes,
                result.reachability_score or 0,
                result.final_score or 0,
                result.flags,
            )
            if dry_run:
                continue

            payload = json.dumps(result.to_dict(), sort_keys=True, default=str)
            db.execute(text("""
                UPDATE compass_projection_contracts
                SET stale_after_minutes = :stale,
                    contract_json = jsonb_set(contract_json, '{calibration}', CAST(:calib AS JSONB), true)
                WHERE projection_id = :pid
            """), {"stale": result.stale_minutes, "calib": payload, "pid": c["projection_id"]})
            db.execute(text("""
                INSERT INTO compass_projection_events (
                    projection_id, event_time, event_type, price, source, evidence_json
                )
                SELECT :pid, :ts, 'CALIBRATION_ADJUSTED', :price,
                       'compass_recalibrate_backfill', CAST(:calib AS JSONB)
                WHERE NOT EXISTS (
                    SELECT 1 FROM compass_projection_events
                    WHERE projection_id = :pid AND event_type = 'CALIBRATION_ADJUSTED'
                )
            """), {
                "pid": c["projection_id"],
                "ts": active_from,
                "price": c["reference_price"],
                "calib": payload,
            })

        if not dry_run:
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("Recalibration failed")
        raise
    finally:
        db.close()

    logger.info("Recalibration summary: %s", summary)
    return summary


def cli() -> None:
    parser = argparse.ArgumentParser(description="Retroactive reachability recalibration for backfill")
    parser.add_argument("--dry-run", action="store_true", help="Show adjustments without writing.")
    args = parser.parse_args()
    summary = recalibrate(dry_run=args.dry_run)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    cli()
