"""
LuxQuant Terminal - Signal Journey Worker
==========================================
Layer 4d: Main worker yang gabungin fetcher + calculator + persistor.

Modes:
  1. Real-time (default): LISTEN PostgreSQL channel 'signal_update',
     trigger recompute tiap TP/SL hit. Run forever via systemd.

  2. Backfill (--backfill-all): one-shot process semua signals existing.
     Skip yang udah ada journey row (kecuali --force-recompute).
     Resumable kalau interrupted.

  3. Refresh (--refresh-live): recompute signals yang status 'live' dan
     last_event_at < N hours ago. Capture silent moves antar TP.
     Designed buat dijalanin via systemd timer (cron-equivalent).

  4. Single signal (--signal-id X): debug/manual recompute 1 signal.
"""

import argparse
import logging
import select
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Set

import psycopg2
import psycopg2.extensions
from sqlalchemy import text

from app.core.database import SessionLocal
from app.config import settings
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
)


# ============================================================
# CONFIG
# ============================================================

DEFAULT_CHANNEL = 'signal_update'
DEFAULT_RATE_LIMIT_MS = 100
LISTEN_RECONNECT_DELAY = 5
PROGRESS_LOG_EVERY = 50
REFRESH_LIVE_HOURS = 6
REFRESH_MAX_AGE_DAYS = 14

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
)
log = logging.getLogger("journey_worker")


# ============================================================
# GRACEFUL SHUTDOWN
# ============================================================

class GracefulShutdown:
    shutdown_requested = False

    def __init__(self):
        signal.signal(signal.SIGTERM, self._handler)
        signal.signal(signal.SIGINT, self._handler)

    def _handler(self, signum, frame):
        log.info(f"Received signal {signum} — initiating graceful shutdown")
        self.shutdown_requested = True


# ============================================================
# CORE: process single signal
# ============================================================

def process_signal(signal_id: str, force_recompute: bool = False) -> str:
    """
    End-to-end process 1 signal: fetch data, compute journey, UPSERT.
    Returns: 'ok' | 'skipped' | 'unavailable' | 'no_signal' | 'no_events' | 'error:<reason>'
    """
    session = SessionLocal()
    try:
        signal_data = fetch_signal_for_journey(session, signal_id)
        if not signal_data:
            return 'no_signal'

        events = fetch_telegram_events(session, signal_id)
        if not events:
            return 'no_events'

        if not force_recompute:
            existing = fetch_existing_journey_meta(session, signal_id)
            if existing and existing.last_event_at:
                latest_event_at = max(e.at for e in events)
                if abs((existing.last_event_at - latest_event_at).total_seconds()) < 1:
                    return 'skipped'

        coverage_until, coverage_status = compute_coverage_until(
            last_event_type=events[-1].type,
            last_event_at=events[-1].at,
        )

        klines, source = fetch_klines_with_fallback(
            pair=signal_data.pair,
            start_time=signal_data.created_at,
            end_time=coverage_until,
            interval='1h',
        )

        journey = compute_journey(
            signal_id=signal_data.signal_id,
            pair=signal_data.pair,
            direction=signal_data.direction,
            entry=signal_data.entry,
            target1=signal_data.target1,
            target2=signal_data.target2,
            target3=signal_data.target3,
            target4=signal_data.target4,
            stop1=signal_data.stop1,
            created_at=signal_data.created_at,
            telegram_events=events,
            klines=klines,
            coverage_until=coverage_until,
            coverage_status=coverage_status,
            data_source=source,
        )

        upsert_journey(session, journey)
        session.commit()

        return 'unavailable' if source == 'unavailable' else 'ok'

    except Exception as e:
        session.rollback()
        log.exception(f"process_signal {signal_id} failed: {type(e).__name__}: {e}")
        return f'error:{type(e).__name__}'
    finally:
        session.close()


# ============================================================
# MODE 1: Real-time LISTEN
# ============================================================

def run_listen_mode(channel: str = DEFAULT_CHANNEL):
    shutdown = GracefulShutdown()
    log.info(f"Starting LISTEN mode on channel '{channel}'")

    while not shutdown.shutdown_requested:
        conn = None
        try:
            conn = psycopg2.connect(settings.DATABASE_URL)
            conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()
            cur.execute(f"LISTEN {channel};")
            log.info(f"Connected to DB & listening on '{channel}'")

            while not shutdown.shutdown_requested:
                if select.select([conn], [], [], 5.0) == ([], [], []):
                    continue

                conn.poll()
                processed_in_burst: Set[str] = set()
                while conn.notifies:
                    notify = conn.notifies.pop(0)
                    signal_id = notify.payload

                    if signal_id in processed_in_burst:
                        continue
                    processed_in_burst.add(signal_id)

                    if not signal_id:
                        log.warning(f"Empty payload from {notify.channel}")
                        continue

                    log.info(f"NOTIFY {notify.channel} -> processing {signal_id}")
                    status = process_signal(signal_id)
                    log.info(f"  {signal_id}: {status}")

        except psycopg2.OperationalError as e:
            log.error(f"DB connection lost: {e}. Reconnecting in {LISTEN_RECONNECT_DELAY}s...")
            time.sleep(LISTEN_RECONNECT_DELAY)
        except Exception as e:
            log.exception(f"Unexpected error in LISTEN loop: {e}")
            time.sleep(LISTEN_RECONNECT_DELAY)
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    log.info("LISTEN mode shut down cleanly")


# ============================================================
# MODE 2: Backfill
# ============================================================

def _list_signals_with_filters(
    session,
    *,
    backfill_from: Optional[str] = None,
    backfill_to: Optional[str] = None,
    limit: Optional[int] = None,
    skip_existing: bool = True,
) -> List[str]:
    where_parts = [
        "s.pair IS NOT NULL",
        "s.entry IS NOT NULL AND s.entry > 0",
        "s.target1 IS NOT NULL AND s.target1 > 0",
        "s.created_at IS NOT NULL",
    ]
    params = {}

    if backfill_from:
        where_parts.append("s.created_at >= :from_str")
        params['from_str'] = backfill_from

    if backfill_to:
        where_parts.append("s.created_at <= :to_str")
        params['to_str'] = backfill_to

    if skip_existing:
        where_parts.append("s.signal_id NOT IN (SELECT signal_id FROM signal_journey)")

    limit_clause = f"LIMIT {int(limit)}" if limit else ""

    sql = text(f"""
        SELECT DISTINCT s.signal_id
        FROM signals s
        INNER JOIN signal_updates u ON u.signal_id = s.signal_id
        WHERE {' AND '.join(where_parts)}
        ORDER BY s.created_at DESC NULLS LAST
        {limit_clause}
    """)

    rows = session.execute(sql, params).mappings().all()
    return [r["signal_id"] for r in rows]


def run_backfill_mode(
    *,
    backfill_from: Optional[str] = None,
    backfill_to: Optional[str] = None,
    backfill_limit: Optional[int] = None,
    skip_existing: bool = True,
    force_recompute: bool = False,
    rate_limit_ms: int = DEFAULT_RATE_LIMIT_MS,
):
    shutdown = GracefulShutdown()

    log.info("=" * 60)
    log.info("Starting BACKFILL mode")
    log.info(f"  date range: {backfill_from or '(any)'} -> {backfill_to or '(any)'}")
    log.info(f"  limit: {backfill_limit or '(none)'}")
    log.info(f"  skip_existing: {skip_existing} | force_recompute: {force_recompute}")
    log.info(f"  rate_limit: {rate_limit_ms}ms between signals")
    log.info("=" * 60)

    session = SessionLocal()
    try:
        signal_ids = _list_signals_with_filters(
            session,
            backfill_from=backfill_from,
            backfill_to=backfill_to,
            limit=backfill_limit,
            skip_existing=skip_existing,
        )
    finally:
        session.close()

    total = len(signal_ids)
    if total == 0:
        log.info("No signals to backfill")
        return

    log.info(f"Backfill plan: {total} signals")

    counters = {
        'ok': 0, 'skipped': 0, 'unavailable': 0,
        'no_signal': 0, 'no_events': 0, 'error': 0,
    }
    start_ts = time.time()

    for i, signal_id in enumerate(signal_ids, start=1):
        if shutdown.shutdown_requested:
            log.info(f"Shutdown requested at {i}/{total}, exiting cleanly")
            break

        status = process_signal(signal_id, force_recompute=force_recompute)
        bucket = status.split(':', 1)[0] if ':' in status else status
        counters[bucket] = counters.get(bucket, 0) + 1

        if status.startswith('error') or status == 'unavailable':
            log.warning(f"[{i}/{total}] {signal_id}: {status}")

        if i % PROGRESS_LOG_EVERY == 0:
            elapsed = time.time() - start_ts
            eta_sec = elapsed / i * (total - i)
            eta_str = str(timedelta(seconds=int(eta_sec)))
            rate = i / elapsed
            log.info(
                f"Progress: {i}/{total} ({i/total*100:.1f}%) | "
                f"rate: {rate:.1f} sig/s | ETA: {eta_str} | "
                f"ok={counters['ok']} skip={counters['skipped']} "
                f"unav={counters['unavailable']} err={counters['error']}"
            )

        if status in ('ok', 'unavailable') and rate_limit_ms > 0:
            time.sleep(rate_limit_ms / 1000.0)

    elapsed_total = time.time() - start_ts
    log.info("=" * 60)
    log.info(f"Backfill complete in {timedelta(seconds=int(elapsed_total))}")
    for k, v in counters.items():
        log.info(f"  {k}: {v}")
    log.info("=" * 60)


# ============================================================
# MODE 3: Refresh live signals (silent moves)
# ============================================================

def run_refresh_mode(
    *,
    older_than_hours: int = REFRESH_LIVE_HOURS,
    max_age_days: int = REFRESH_MAX_AGE_DAYS,
    rate_limit_ms: int = DEFAULT_RATE_LIMIT_MS,
):
    shutdown = GracefulShutdown()

    cutoff_event = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
    cutoff_age = datetime.now(timezone.utc) - timedelta(days=max_age_days)

    log.info("=" * 60)
    log.info("Starting REFRESH mode")
    log.info(f"  recompute live signals where last_event_at < {cutoff_event.isoformat()}")
    log.info(f"  signal age >= {cutoff_age.isoformat()} (skip older than {max_age_days}d)")
    log.info("=" * 60)

    session = SessionLocal()
    try:
        rows = session.execute(text("""
            SELECT j.signal_id
            FROM signal_journey j
            INNER JOIN signals s ON s.signal_id = j.signal_id
            WHERE j.coverage_status = 'live'
              AND j.last_event_at < :cutoff_event
              AND s.created_at >= :cutoff_age_str
            ORDER BY j.last_event_at ASC
        """), {
            "cutoff_event": cutoff_event,
            "cutoff_age_str": cutoff_age.isoformat(),
        }).mappings().all()
    finally:
        session.close()

    signal_ids = [r["signal_id"] for r in rows]
    total = len(signal_ids)
    log.info(f"Refresh plan: {total} signals")

    if total == 0:
        return

    counters = {'ok': 0, 'skipped': 0, 'unavailable': 0, 'error': 0}
    start_ts = time.time()

    for i, signal_id in enumerate(signal_ids, start=1):
        if shutdown.shutdown_requested:
            log.info(f"Shutdown requested at {i}/{total}, exiting cleanly")
            break

        status = process_signal(signal_id, force_recompute=True)
        bucket = status.split(':', 1)[0] if ':' in status else status
        counters[bucket] = counters.get(bucket, 0) + 1

        if i % PROGRESS_LOG_EVERY == 0:
            log.info(f"Progress: {i}/{total} ({i/total*100:.1f}%)")

        if rate_limit_ms > 0:
            time.sleep(rate_limit_ms / 1000.0)

    elapsed = time.time() - start_ts
    log.info(f"Refresh complete in {timedelta(seconds=int(elapsed))}: {counters}")


# ============================================================
# MODE 4: Single signal
# ============================================================

def run_single_mode(signal_id: str, force_recompute: bool = True) -> int:
    log.info(f"Processing single signal: {signal_id} (force={force_recompute})")
    status = process_signal(signal_id, force_recompute=force_recompute)
    log.info(f"Result: {status}")
    return 0 if status in ('ok', 'unavailable', 'skipped') else 1


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="LuxQuant Signal Journey Worker")

    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument('--backfill-all', action='store_true',
                            help="One-shot: process all eligible signals")
    mode_group.add_argument('--refresh-live', action='store_true',
                            help="Recompute live signals with stale last_event_at")
    mode_group.add_argument('--signal-id', type=str,
                            help="Process single signal (debug mode)")

    parser.add_argument('--backfill-from', type=str)
    parser.add_argument('--backfill-to', type=str)
    parser.add_argument('--backfill-limit', type=int)
    parser.add_argument('--no-skip-existing', action='store_true')
    parser.add_argument('--force-recompute', action='store_true')

    parser.add_argument('--refresh-older-than-hours', type=int, default=REFRESH_LIVE_HOURS)
    parser.add_argument('--refresh-max-age-days', type=int, default=REFRESH_MAX_AGE_DAYS)

    parser.add_argument('--rate-limit-ms', type=int, default=DEFAULT_RATE_LIMIT_MS)
    parser.add_argument('--channel', type=str, default=DEFAULT_CHANNEL)
    parser.add_argument('--log-level', type=str, default='INFO',
                        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'])

    args = parser.parse_args()
    logging.getLogger().setLevel(args.log_level)

    if args.signal_id:
        return run_single_mode(args.signal_id, force_recompute=args.force_recompute)

    if args.backfill_all:
        run_backfill_mode(
            backfill_from=args.backfill_from,
            backfill_to=args.backfill_to,
            backfill_limit=args.backfill_limit,
            skip_existing=not args.no_skip_existing,
            force_recompute=args.force_recompute,
            rate_limit_ms=args.rate_limit_ms,
        )
        return 0

    if args.refresh_live:
        run_refresh_mode(
            older_than_hours=args.refresh_older_than_hours,
            max_age_days=args.refresh_max_age_days,
            rate_limit_ms=args.rate_limit_ms,
        )
        return 0

    run_listen_mode(channel=args.channel)
    return 0


if __name__ == "__main__":
    sys.exit(main())
