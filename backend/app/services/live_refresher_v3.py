"""
LuxQuant Live Refresher v3.0
============================
Cron entry point untuk hourly refresh live_snapshot pada signal aktif.
Dipanggil oleh crontab tiap jam.

Yang dilakukan:
1. Acquire lock file (prevent double-run jika refresh sebelumnya belum selesai)
2. Call enrichment_worker_v3.run_live_refresh_all()
3. Release lock

Scope refresh (sesuai diskusi):
- status IN ('open', 'tp1', 'tp2', 'tp3')
- created_at within last 7 days
- already has entry_snapshot (enriched before)

Crontab setup:
    # Hourly live refresh
    0 * * * * cd /root/luxquant-terminal/backend && python3 -m app.services.live_refresher_v3 >> /var/log/luxquant-sync/live-refresher.log 2>&1

    # Daily history cleanup (optional — also runs inside run_live_refresh_all)
    0 3 * * * cd /root/luxquant-terminal/backend && python3 -m app.services.live_refresher_v3 --cleanup-only >> /var/log/luxquant-sync/live-refresher.log 2>&1

Author: LuxQuant Team
Version: v3.0
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timezone

from app.services.enrichment_worker_v3 import (
    run_live_refresh_all,
    cleanup_old_history,
)

# ============================================================
# CONFIG
# ============================================================

LOCK_FILE = "/tmp/luxquant-live-refresher.lock"
LOCK_STALE_MINUTES = 30  # if lock is older than this, treat as stale

LOG_DIR = os.getenv("LOG_DIR", "/var/log/luxquant-sync")
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "live-refresher-v3.log")),
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger("live-refresher-v3")


# ============================================================
# LOCK FILE MANAGEMENT
# ============================================================

def acquire_lock() -> bool:
    """
    Try to acquire lock file. Returns True on success.
    If lock exists but is stale (>30 min old), remove and acquire.
    """
    if os.path.exists(LOCK_FILE):
        try:
            mtime = os.path.getmtime(LOCK_FILE)
            age_min = (time.time() - mtime) / 60

            if age_min > LOCK_STALE_MINUTES:
                logger.warning(
                    f"Stale lock detected (age {age_min:.0f}min). Removing."
                )
                os.remove(LOCK_FILE)
            else:
                # Read PID from lock
                try:
                    with open(LOCK_FILE) as f:
                        pid = f.read().strip()
                    logger.warning(
                        f"Lock file exists (pid={pid}, age {age_min:.1f}min). "
                        f"Another refresh is running. Skipping."
                    )
                except Exception:
                    logger.warning("Lock file exists but unreadable. Skipping.")
                return False
        except Exception as e:
            logger.warning(f"Error checking lock: {e}. Attempting to acquire.")

    try:
        with open(LOCK_FILE, "w") as f:
            f.write(str(os.getpid()))
        return True
    except Exception as e:
        logger.error(f"Failed to create lock file: {e}")
        return False


def release_lock():
    """Release lock file."""
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
    except Exception as e:
        logger.warning(f"Failed to release lock: {e}")


# ============================================================
# MAIN ENTRY POINTS
# ============================================================

async def run_refresh():
    """Main refresh routine."""
    start = datetime.now(timezone.utc)
    logger.info("=" * 60)
    logger.info(f"Live refresh started at {start.isoformat()}")
    logger.info("=" * 60)

    try:
        await run_live_refresh_all(dry_run=False)
    except Exception as e:
        logger.error(f"Refresh failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

    end = datetime.now(timezone.utc)
    duration = (end - start).total_seconds()
    logger.info(f"Live refresh completed in {duration:.1f}s")
    return True


def run_cleanup_only():
    """Only run history cleanup (no refresh)."""
    logger.info("Running history cleanup only")
    try:
        deleted = cleanup_old_history(retention_days=7)
        logger.info(f"Cleanup done: {deleted} rows deleted")
        return True
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="LuxQuant Live Refresher v3 (cron entry point)"
    )
    parser.add_argument(
        "--cleanup-only",
        action="store_true",
        help="Only run history cleanup, skip refresh"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore lock file (dangerous, use only for manual runs)"
    )
    args = parser.parse_args()

    # Cleanup-only mode doesn't need lock
    if args.cleanup_only:
        success = run_cleanup_only()
        sys.exit(0 if success else 1)

    # Normal refresh mode — acquire lock
    if not args.force:
        if not acquire_lock():
            sys.exit(0)  # Not an error, just skip this cycle
    else:
        logger.warning("--force flag: skipping lock check")

    try:
        success = asyncio.run(run_refresh())
    finally:
        if not args.force:
            release_lock()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()