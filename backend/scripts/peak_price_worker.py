"""
Peak Price Worker — compute & update highest price reached since signal call.

Logic:
- Peak = max(high) dari candle 1h sejak created_at signal
- peak_pct = (peak_price - entry) / entry * 100
- Semua signal LONG-only (buy, expect naik)
- Sumber data: Binance Futures → Binance Spot → Bybit (fallback chain, mirror frontend)

Modes:
  --active   : update signal status IN ('open','tp1','tp2','tp3') — cron tiap 5 menit
  --closed   : update signal status IN ('closed_win','closed_loss') yang peak_price IS NULL — cron tiap 1 jam
  --all      : backfill semua signal yang peak_price IS NULL (one-shot)
  --signal-id <id> : update satu signal specific (debug)
  --dry-run  : compute tapi gak update DB
  --limit N  : max signal per run (default 500)

Usage:
  python peak_price_worker.py --active
  python peak_price_worker.py --closed
  python peak_price_worker.py --all --limit 1000
  python peak_price_worker.py --signal-id eb006b66-... --dry-run
"""
import os
import sys
import time
import argparse
import logging
from datetime import datetime, timezone
from typing import Optional, List, Tuple

import requests
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ─── Config ───────────────────────────────────────────────────────────────
LOCK_FILE = "/tmp/peak_price_worker.lock"
LOG_FILE = "/root/luxquant-terminal/backend/peak_worker.log"
DB_URL = os.getenv("DATABASE_URL", "postgresql://luxq:CHANGEME@127.0.0.1:5432/luxquant")

BINANCE_FAPI = "https://fapi.binance.com/fapi/v1/klines"
BINANCE_SPOT = "https://api.binance.com/api/v3/klines"
BYBIT_V5 = "https://api.bybit.com/v5/market/kline"

REQUEST_TIMEOUT = 10
SLEEP_BETWEEN_CALLS = 0.15  # throttle biar gak kena rate limit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("peak_worker")


# ─── Lock file ────────────────────────────────────────────────────────────
def acquire_lock() -> bool:
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE) as f:
                pid = int(f.read().strip())
            os.kill(pid, 0)
            log.warning(f"Lock held by PID {pid}, exiting")
            return False
        except (ProcessLookupError, ValueError, PermissionError):
            log.info("Stale lock, removing")
            os.remove(LOCK_FILE)
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
    return True


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except FileNotFoundError:
        pass


# ─── Klines fetchers ──────────────────────────────────────────────────────
def _parse_iso(ts: str) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _fetch_binance(url: str, symbol: str, start_ms: int) -> Optional[List]:
    try:
        r = requests.get(
            url,
            params={"symbol": symbol, "interval": "1h", "startTime": start_ms, "limit": 1500},
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) > 0:
                return data
        return None
    except Exception as e:
        log.debug(f"Binance fetch failed {url} {symbol}: {e}")
        return None


def _fetch_bybit(category: str, symbol: str, start_ms: int) -> Optional[List]:
    try:
        r = requests.get(
            BYBIT_V5,
            params={
                "category": category,
                "symbol": symbol,
                "interval": "60",
                "start": start_ms,
                "limit": 1000,
            },
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code == 200:
            data = r.json()
            result = (data.get("result") or {}).get("list") or []
            if result:
                return result
        return None
    except Exception as e:
        log.debug(f"Bybit fetch failed {category} {symbol}: {e}")
        return None


def fetch_peak_since(symbol: str, start_dt: datetime) -> Optional[Tuple[float, datetime]]:
    """
    Return (peak_price, peak_timestamp) or None.
    Fallback chain: Binance Futures → Binance Spot → Bybit Linear → Bybit Spot.
    """
    start_ms = int(start_dt.timestamp() * 1000)

    # 1. Binance Futures — [openTime, open, high, low, close, volume, closeTime, ...]
    data = _fetch_binance(BINANCE_FAPI, symbol, start_ms)
    if data:
        peak_price = 0.0
        peak_ts = None
        for c in data:
            high = float(c[2])
            if high > peak_price:
                peak_price = high
                peak_ts = datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc)
        if peak_price > 0:
            return peak_price, peak_ts

    # 2. Binance Spot
    data = _fetch_binance(BINANCE_SPOT, symbol, start_ms)
    if data:
        peak_price = 0.0
        peak_ts = None
        for c in data:
            high = float(c[2])
            if high > peak_price:
                peak_price = high
                peak_ts = datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc)
        if peak_price > 0:
            return peak_price, peak_ts

    # 3. Bybit Linear (futures) — [startTime, open, high, low, close, volume, turnover]
    data = _fetch_bybit("linear", symbol, start_ms)
    if data:
        peak_price = 0.0
        peak_ts = None
        for c in data:
            high = float(c[2])
            if high > peak_price:
                peak_price = high
                peak_ts = datetime.fromtimestamp(int(c[0]) / 1000, tz=timezone.utc)
        if peak_price > 0:
            return peak_price, peak_ts

    # 4. Bybit Spot
    data = _fetch_bybit("spot", symbol, start_ms)
    if data:
        peak_price = 0.0
        peak_ts = None
        for c in data:
            high = float(c[2])
            if high > peak_price:
                peak_price = high
                peak_ts = datetime.fromtimestamp(int(c[0]) / 1000, tz=timezone.utc)
        if peak_price > 0:
            return peak_price, peak_ts

    return None


# ─── DB helpers ───────────────────────────────────────────────────────────
def get_signals_to_update(session, mode: str, limit: int, signal_id: Optional[str]) -> List[dict]:
    if signal_id:
        sql = text("""
            SELECT signal_id, pair, entry, status, created_at
            FROM signals
            WHERE signal_id = :sid AND entry > 0
        """)
        rows = session.execute(sql, {"sid": signal_id}).fetchall()

    elif mode == "active":
        sql = text("""
            SELECT signal_id, pair, entry, status, created_at
            FROM signals
            WHERE status IN ('open', 'tp1', 'tp2', 'tp3')
              AND entry > 0
              AND pair IS NOT NULL
            ORDER BY peak_updated_at NULLS FIRST, created_at DESC
            LIMIT :lim
        """)
        rows = session.execute(sql, {"lim": limit}).fetchall()

    elif mode == "closed":
        sql = text("""
            SELECT signal_id, pair, entry, status, created_at
            FROM signals
            WHERE status IN ('closed_win', 'closed_loss')
              AND entry > 0
              AND pair IS NOT NULL
              AND peak_price IS NULL
            ORDER BY created_at DESC
            LIMIT :lim
        """)
        rows = session.execute(sql, {"lim": limit}).fetchall()

    elif mode == "all":
        sql = text("""
            SELECT signal_id, pair, entry, status, created_at
            FROM signals
            WHERE entry > 0
              AND pair IS NOT NULL
              AND peak_price IS NULL
            ORDER BY created_at DESC
            LIMIT :lim
        """)
        rows = session.execute(sql, {"lim": limit}).fetchall()
    else:
        return []

    return [
        {
            "signal_id": r[0],
            "pair": r[1],
            "entry": float(r[2]),
            "status": r[3],
            "created_at": r[4],
        }
        for r in rows
    ]


def update_peak(session, signal_id: str, peak_price: float, peak_pct: float, peak_at: Optional[datetime]):
    sql = text("""
        UPDATE signals
        SET peak_price = :pp,
            peak_pct = :ppct,
            peak_at = :pat,
            peak_updated_at = NOW()
        WHERE signal_id = :sid
    """)
    session.execute(sql, {
        "pp": peak_price,
        "ppct": peak_pct,
        "pat": peak_at,
        "sid": signal_id,
    })


def touch_peak_updated(session, signal_id: str):
    """Kalau fetch gagal, tetep update peak_updated_at biar gak di-retry terus."""
    sql = text("UPDATE signals SET peak_updated_at = NOW() WHERE signal_id = :sid")
    session.execute(sql, {"sid": signal_id})


# ─── Main ─────────────────────────────────────────────────────────────────
def run(mode: str, limit: int, signal_id: Optional[str], dry_run: bool):
    engine = create_engine(DB_URL, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        signals = get_signals_to_update(session, mode, limit, signal_id)
        log.info(f"Mode={mode} limit={limit} dry_run={dry_run} → {len(signals)} signals to process")

        updated = 0
        skipped = 0
        failed = 0

        for i, s in enumerate(signals, 1):
            sid = s["signal_id"]
            pair = s["pair"]
            entry = s["entry"]
            created = _parse_iso(s["created_at"])

            if not created:
                log.warning(f"[{i}/{len(signals)}] {sid} {pair}: invalid created_at, skip")
                skipped += 1
                continue

            if entry <= 0:
                skipped += 1
                continue

            try:
                result = fetch_peak_since(pair, created)
            except Exception as e:
                log.error(f"[{i}/{len(signals)}] {sid} {pair}: fetch error {e}")
                failed += 1
                if not dry_run:
                    touch_peak_updated(session, sid)
                    session.commit()
                time.sleep(SLEEP_BETWEEN_CALLS)
                continue

            if result is None:
                log.warning(f"[{i}/{len(signals)}] {sid} {pair}: no klines data (all sources failed)")
                failed += 1
                if not dry_run:
                    touch_peak_updated(session, sid)
                    session.commit()
                time.sleep(SLEEP_BETWEEN_CALLS)
                continue

            peak_price, peak_ts = result

            if peak_price <= entry:
                log.info(f"[{i}/{len(signals)}] {sid} {pair}: peak {peak_price} <= entry {entry}, set 0%")
                peak_pct = 0.0
            else:
                peak_pct = round((peak_price - entry) / entry * 100, 2)

            log.info(
                f"[{i}/{len(signals)}] {sid} {pair}: entry={entry} peak={peak_price} "
                f"(+{peak_pct}%) at {peak_ts}"
            )

            if not dry_run:
                update_peak(session, sid, peak_price, peak_pct, peak_ts)
                session.commit()
            updated += 1

            time.sleep(SLEEP_BETWEEN_CALLS)

        log.info(f"Done. updated={updated} skipped={skipped} failed={failed}")

    finally:
        session.close()
        engine.dispose()


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--active", action="store_true", help="Update active signals (open/tp1-3)")
    group.add_argument("--closed", action="store_true", help="Update closed signals w/ NULL peak")
    group.add_argument("--all", action="store_true", help="Backfill all NULL peak signals")
    group.add_argument("--signal-id", type=str, help="Update single signal")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.active:
        mode = "active"
    elif args.closed:
        mode = "closed"
    elif args.all:
        mode = "all"
    else:
        mode = "single"

    if not acquire_lock():
        sys.exit(0)

    try:
        run(mode, args.limit, args.signal_id, args.dry_run)
    finally:
        release_lock()


if __name__ == "__main__":
    main()
