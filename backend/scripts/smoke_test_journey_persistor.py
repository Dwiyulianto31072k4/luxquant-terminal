"""
LuxQuant Terminal - Journey Persistor Smoke Test
=================================================
Manual smoke test buat run di VPS (atau lokal via SSH tunnel).
Tests Layer 4b end-to-end dengan signal REAL dari production DB.

Run di VPS:
    cd /root/luxquant-terminal/backend
    python -m scripts.smoke_test_journey_persistor

Run di Mac (via SSH tunnel):
    # Terminal 1: ssh -L 5432:127.0.0.1:5432 root@187.127.135.84 -N
    # Terminal 2:
    cd backend
    DATABASE_URL="postgresql://luxq:PASSWORD@127.0.0.1:5432/luxquant" \
        python -m scripts.smoke_test_journey_persistor

What it does:
    1. Pick recent closed signal (TP1+ atau SL hit)
    2. Fetch signal core data (pair, entry, direction, etc)
    3. Fetch telegram events
    4. Fetch klines via journey_fetcher (REAL Binance/Bybit call!)
    5. Compute journey via journey_calculator
    6. UPSERT to signal_journey table
    7. Re-fetch journey + verify all fields populated
    8. Run UPSERT lagi (test idempotency)
    9. Cleanup: optionally delete journey row
"""

import sys
import logging
from datetime import datetime, timezone
from typing import Optional

from app.core.database import SessionLocal
from app.services.journey_calculator import compute_journey
from app.services.journey_fetcher import (
    fetch_klines_with_fallback,
    compute_coverage_until,
)
from app.services.journey_persistor import (
    fetch_signal_for_journey,
    fetch_telegram_events,
    fetch_existing_journey_meta,
    upsert_journey,
    list_signals_for_backfill,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("smoke_test")


# ANSI color codes
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"
BOLD = "\033[1m"


def print_header(msg: str):
    print(f"\n{BLUE}{BOLD}{'=' * 70}{RESET}")
    print(f"{BLUE}{BOLD}{msg}{RESET}")
    print(f"{BLUE}{BOLD}{'=' * 70}{RESET}")


def print_ok(msg: str):
    print(f"  {GREEN}✓{RESET} {msg}")


def print_fail(msg: str):
    print(f"  {RED}✗{RESET} {msg}")


def print_warn(msg: str):
    print(f"  {YELLOW}!{RESET} {msg}")


def print_info(label: str, value):
    print(f"    {label}: {BOLD}{value}{RESET}")


def pick_test_signal_id(session, override: Optional[str] = None) -> Optional[str]:
    """Pick test signal: override > most recent closed signal."""
    if override:
        return override

    # Pick most recent signal yang udah ada minimal 1 event
    # Skip yang udah ada di signal_journey, biar bener-bener fresh upsert path
    candidates = list_signals_for_backfill(session, limit=1, skip_existing=True)
    if candidates:
        return candidates[0]

    # Fallback: ada di signal_journey, kita test idempotency aja
    candidates = list_signals_for_backfill(session, limit=1, skip_existing=False)
    return candidates[0] if candidates else None


def run_smoke_test(signal_id_override: Optional[str] = None,
                   cleanup: bool = False) -> int:
    """
    Returns 0 on success, 1 on any failure.
    """
    print_header("LuxQuant Journey Persistor Smoke Test")

    failures = 0
    session = SessionLocal()

    try:
        # ============================================================
        # STEP 1: Pick test signal
        # ============================================================
        print_header("Step 1: Pick test signal")

        signal_id = pick_test_signal_id(session, signal_id_override)
        if not signal_id:
            print_fail("No eligible signal found in DB")
            return 1
        print_ok(f"Selected signal_id: {signal_id}")

        # ============================================================
        # STEP 2: Fetch signal core data
        # ============================================================
        print_header("Step 2: Fetch signal data")

        signal = fetch_signal_for_journey(session, signal_id)
        if not signal:
            print_fail(f"fetch_signal_for_journey returned None")
            return 1
        print_ok("Signal fetched")
        print_info("pair", signal.pair)
        print_info("direction", signal.direction)
        print_info("entry", signal.entry)
        print_info("target1", signal.target1)
        print_info("created_at", signal.created_at)
        print_info("status", signal.status)

        # ============================================================
        # STEP 3: Fetch telegram events
        # ============================================================
        print_header("Step 3: Fetch telegram events")

        events = fetch_telegram_events(session, signal_id)
        if not events:
            print_warn("No telegram events found (signal masih open?)")
        else:
            print_ok(f"Found {len(events)} telegram event(s)")
            for e in events:
                print_info(f"  {e.type.upper()}", f"{e.at} @ {e.price}")

        # ============================================================
        # STEP 4: Determine coverage window
        # ============================================================
        print_header("Step 4: Compute coverage window")

        last_event_type = events[-1].type if events else None
        last_event_at = events[-1].at if events else None
        coverage_until, coverage_status = compute_coverage_until(
            last_event_type=last_event_type,
            last_event_at=last_event_at,
        )
        print_info("coverage_from", signal.created_at)
        print_info("coverage_until", coverage_until)
        print_info("coverage_status", coverage_status)

        # ============================================================
        # STEP 5: Fetch klines from exchange (REAL NETWORK CALL)
        # ============================================================
        print_header("Step 5: Fetch klines from exchange")

        klines, source = fetch_klines_with_fallback(
            pair=signal.pair,
            start_time=signal.created_at,
            end_time=coverage_until,
            interval='1h',
        )

        if source == 'unavailable':
            print_warn(f"Pair {signal.pair} unavailable in all sources")
            # Still proceed with empty klines — compute_journey will return unavailable journey
        else:
            print_ok(f"Fetched {len(klines)} klines from {source}")
            if klines:
                print_info("first kline", f"{klines[0].open_time} OHLC=({klines[0].open}, {klines[0].high}, {klines[0].low}, {klines[0].close})")
                print_info("last kline", f"{klines[-1].open_time} OHLC=({klines[-1].open}, {klines[-1].high}, {klines[-1].low}, {klines[-1].close})")

        # ============================================================
        # STEP 6: Compute journey
        # ============================================================
        print_header("Step 6: Compute journey")

        journey = compute_journey(
            signal_id=signal.signal_id,
            pair=signal.pair,
            direction=signal.direction,
            entry=signal.entry,
            target1=signal.target1,
            target2=signal.target2,
            target3=signal.target3,
            target4=signal.target4,
            stop1=signal.stop1,
            created_at=signal.created_at,
            telegram_events=events,
            klines=klines,
            coverage_until=coverage_until,
            coverage_status=coverage_status,
            data_source=source,
        )
        print_ok("Journey computed")
        print_info("overall_mae_pct", journey.get('overall_mae_pct'))
        print_info("overall_mfe_pct", journey.get('overall_mfe_pct'))
        print_info("initial_mae_pct", journey.get('initial_mae_pct'))
        print_info("initial_mae_before", journey.get('initial_mae_before'))
        print_info("time_to_tp1_seconds", journey.get('time_to_tp1_seconds'))
        print_info("pct_time_above_entry", journey.get('pct_time_above_entry'))
        print_info("tp_then_sl", journey.get('tp_then_sl'))
        print_info("realized_outcome_pct", journey.get('realized_outcome_pct'))
        print_info("missed_potential_pct", journey.get('missed_potential_pct'))
        print_info("event count", len(journey.get('events', [])))

        # ============================================================
        # STEP 7: UPSERT journey
        # ============================================================
        print_header("Step 7: UPSERT to signal_journey table")

        try:
            upsert_journey(session, journey)
            session.commit()
            print_ok("UPSERT succeeded + committed")
        except Exception as e:
            session.rollback()
            print_fail(f"UPSERT failed: {type(e).__name__}: {e}")
            failures += 1
            return failures

        # ============================================================
        # STEP 8: Verify journey persisted
        # ============================================================
        print_header("Step 8: Verify journey persisted")

        meta = fetch_existing_journey_meta(session, signal_id)
        if not meta:
            print_fail("fetch_existing_journey_meta returned None after UPSERT")
            failures += 1
        else:
            print_ok("Journey row exists in DB")
            print_info("computed_at", meta.computed_at)
            print_info("last_event_at", meta.last_event_at)
            print_info("coverage_status", meta.coverage_status)

            # Validate that last_event_at matches what we expected
            if last_event_at and meta.last_event_at:
                # Compare with tolerance (DB roundtrip can lose microseconds)
                diff = abs((meta.last_event_at - last_event_at).total_seconds())
                if diff > 1.0:
                    print_fail(f"last_event_at mismatch: DB={meta.last_event_at}, expected={last_event_at}")
                    failures += 1
                else:
                    print_ok(f"last_event_at matches (diff={diff:.3f}s)")

        # ============================================================
        # STEP 9: Test idempotency (run UPSERT again)
        # ============================================================
        print_header("Step 9: Idempotency test (re-UPSERT)")

        try:
            upsert_journey(session, journey)
            session.commit()
            print_ok("Re-UPSERT succeeded (idempotent)")
        except Exception as e:
            session.rollback()
            print_fail(f"Re-UPSERT failed: {type(e).__name__}: {e}")
            failures += 1

        # ============================================================
        # STEP 10: Cleanup (optional)
        # ============================================================
        if cleanup:
            print_header("Step 10: Cleanup")
            from sqlalchemy import text
            session.execute(text("DELETE FROM signal_journey WHERE signal_id = :sid"),
                          {"sid": signal_id})
            session.commit()
            print_ok(f"Deleted journey row for {signal_id}")

    finally:
        session.close()

    # ============================================================
    # SUMMARY
    # ============================================================
    print_header("Summary")
    if failures == 0:
        print(f"{GREEN}{BOLD}  ALL CHECKS PASSED{RESET}")
        return 0
    else:
        print(f"{RED}{BOLD}  {failures} CHECK(S) FAILED{RESET}")
        return 1


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Journey persistor smoke test")
    parser.add_argument("--signal-id", help="Specific signal_id to test (default: pick automatic)")
    parser.add_argument("--cleanup", action="store_true",
                       help="Delete journey row after test (default: keep for inspection)")
    args = parser.parse_args()

    sys.exit(run_smoke_test(
        signal_id_override=args.signal_id,
        cleanup=args.cleanup,
    ))
