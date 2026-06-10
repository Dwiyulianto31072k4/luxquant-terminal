#!/usr/bin/env python3
"""
rebackfill_pointintime.py
=========================
Re-compute entry_snapshot for STALE signals using point-in-time OHLCV
(candles ending at the signal's created_at) instead of latest candles.

WHY: ~48% of 90-day signals were enriched long after creation (multiple backfill
events: Mar 29, Apr 8-11, Jun 6-8). Their entry_snapshot reflects market
conditions AT BACKFILL TIME, not at entry. This corrupts any entry-based
analytics (Edge Lab pattern calibration, etc).

WHAT THIS FIXES (technical, OHLCV-derived -> becomes point-in-time):
  - RSI, MACD, trend/ADX, volume ratio, EMA distance
  - SMC patterns (FVG/OB/sweep), chart patterns, Fibonacci
  - entry_quality (last-N-candle gain, distance from EMA)

WHAT THIS DOES *NOT* FIX (Redis-derived -> stays "now", no historical source):
  - BTC dominance / BTC change  (tags: BTC_DOM_*, BTC_*)
  - Fear & Greed                (tags: FNG_*)
  - Funding rate                (tags: FUNDING_*)
  These context tags remain approximate. Treat Edge Lab's BTC-regime dimension
  as approximate for re-backfilled signals.

ANTI-LOOK-AHEAD: candles are truncated to open_time <= created_at BEFORE being
passed to compute_snapshot. Without this, SMC/pattern detection (which scans the
tail of the dataframe) would "see" candles AFTER entry = look-ahead bias, worse
than the stale problem it replaces.

SAFETY:
  - Touches ONLY entry_snapshot. live_snapshot is left untouched (it SHOULD be
    "now" -- refreshed hourly by the live worker).
  - analyzed_at is NOT reset to now (would keep signal looking "stale"); set to
    created_at so the stale query stops flagging it.
  - enrichment_version set to 'v3.0-pit' -> idempotent + trackable.
  - Old entry_snapshot backed up to a JSON file before overwrite (reversible).
  - Dry-run by default. --limit for staged testing. --apply to write.

USAGE (run ON THE VPS, inside backend dir, system python -- same as worker):
  cd ~/luxquant-terminal/backend
  /usr/bin/python3 rebackfill_pointintime.py --limit 3            # dry-run 3
  /usr/bin/python3 rebackfill_pointintime.py --limit 3 --apply    # write 3
  /usr/bin/python3 rebackfill_pointintime.py --apply              # write all stale
"""
import argparse
import asyncio
import json
import sys
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

# Import production logic (do NOT reimplement -- reuse exact functions)
from app.services.enrichment_worker import (
    _normalize_pair,
    _detect_multiplier,
    _OHLCV_EXCHANGES,
    INTERVAL_MAP,
    fetch_24h_volume,
)
from app.services.enrichment_worker_v3 import (
    engine,
    OHLCV_LIMIT,
    validate_ohlcv_data,
)
from app.services.enrichment_service_v3 import (
    compute_snapshot,
    get_redis_client,
    ENRICHMENT_VERSION,
)

PIT_VERSION = "v3.0-pit"  # 8 chars exactly (column limit)
BACKUP_DIR = Path("/root/luxquant-terminal/backend/rebackfill_backups")

INTERVAL_MS = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
}


# ════════════════════════════════════════════════════════════════
# Point-in-time fetch: mirrors fetch_ohlcv 3-pass logic, adds since + truncate
# ════════════════════════════════════════════════════════════════

async def _try_fetch_pit(symbol: str, tf: str, since: int, cutoff_ms: int) -> pd.DataFrame:
    """Iterate exchanges for `symbol`, fetch from `since`, truncate to <= cutoff."""
    for ExchangeClass in _OHLCV_EXCHANGES:
        exchange = ExchangeClass({"enableRateLimit": True})
        try:
            ohlcv = await exchange.fetch_ohlcv(symbol, tf, since=since, limit=OHLCV_LIMIT)
            if not ohlcv:
                continue
            df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
            # ANTI-LOOK-AHEAD: keep only candles at/ before the signal's created_at
            df = df[df["timestamp"] <= cutoff_ms].copy()
            df["open_time"] = pd.to_datetime(df["timestamp"], unit="ms")
            df = df[["open_time", "open", "high", "low", "close", "volume"]].copy()
            for col in ["open", "high", "low", "close", "volume"]:
                df[col] = pd.to_numeric(df[col], errors="coerce")
            df = df.dropna(subset=["close"])
            if len(df) >= 50:
                return df
        except Exception:
            pass
        finally:
            await exchange.close()
    return pd.DataFrame()


async def fetch_ohlcv_pit(pair: str, interval: str, created_at_ms: int) -> pd.DataFrame:
    """
    Point-in-time variant of fetch_ohlcv. Same 3-pass fallback (spot -> perp ->
    multiplier), but pulls candles ending at created_at_ms.
    """
    tf = INTERVAL_MAP.get(interval, interval)
    # Pull OHLCV_LIMIT candles BEFORE created_at so indicators have lookback.
    since = created_at_ms - (OHLCV_LIMIT * INTERVAL_MS[tf])
    spot_symbol = _normalize_pair(pair)

    # Pass 1: spot
    df = await _try_fetch_pit(spot_symbol, tf, since, created_at_ms)
    if not df.empty:
        return df

    # Pass 2: perp
    df = await _try_fetch_pit(f"{spot_symbol}:USDT", tf, since, created_at_ms)
    if not df.empty:
        return df

    # Pass 3: multiplier-prefix fallback
    base_pair, multiplier = _detect_multiplier(pair)
    if multiplier > 1:
        base_spot = _normalize_pair(base_pair)
        df = await _try_fetch_pit(base_spot, tf, since, created_at_ms)
        if not df.empty:
            for col in ["open", "high", "low", "close"]:
                df[col] = df[col] * multiplier
            return df

    return pd.DataFrame()


async def fetch_all_ohlcv_pit(pair: str, created_at_ms: int) -> dict:
    """Fetch M15, H1, H4 point-in-time in parallel."""
    m15, h1, h4 = await asyncio.gather(
        fetch_ohlcv_pit(pair, "15m", created_at_ms),
        fetch_ohlcv_pit(pair, "1h", created_at_ms),
        fetch_ohlcv_pit(pair, "4h", created_at_ms),
    )
    return {"m15": m15, "h1": h1, "h4": h4}


# ════════════════════════════════════════════════════════════════
# DB helpers
# ════════════════════════════════════════════════════════════════

def get_stale_signals(limit: int = None) -> list:
    """
    ALL signals in the 90-day window that haven't been point-in-time
    re-backfilled yet.

    Scope widened from stale-only: the SMC bug (FVG/OB/sweep always 0) hit EVERY
    signal regardless of enrichment freshness, and structure only gets fixed by
    recompute. So fresh signals (technicals accurate) also need recompute to fix
    their structure. Re-backfilling a fresh signal is harmless: since=created_at
    keeps technicals accurate AND fixes structure.

    The :pit_version filter makes this idempotent and resumable -- already-done
    signals are skipped, so the script can be re-run / paginated safely.
    """
    sql = """
        SELECT s.signal_id, s.pair, s.entry, s.target1, s.target2, s.target3,
               s.target4, s.stop1, s.stop2, s.status, s.risk_level, s.created_at,
               e.enrichment_version AS cur_version
        FROM signals s
        JOIN signal_enrichment e ON e.signal_id = s.signal_id
        WHERE s.created_at::timestamptz >= NOW() - INTERVAL '90 days'
          AND e.enrichment_version != :pit_version
        ORDER BY s.created_at ASC
    """
    if limit:
        sql += " LIMIT :limit"
    with engine.connect() as conn:
        params = {"pit_version": PIT_VERSION}
        if limit:
            params["limit"] = limit
        rows = conn.execute(text(sql), params).fetchall()
    return [dict(r._mapping) for r in rows]


def get_existing_entry_snapshot(signal_id: str) -> dict:
    """Fetch current entry_snapshot for backup before overwrite."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT entry_snapshot FROM signal_enrichment WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()
    if row and row[0]:
        return row[0] if isinstance(row[0], dict) else json.loads(row[0])
    return {}


def update_entry_snapshot_only(signal_id: str, snapshot: dict, created_at_ts):
    """
    Update ONLY entry_snapshot. Does NOT touch live_snapshot.
    Sets analyzed_at = created_at (so stale query stops flagging it) and
    enrichment_version = PIT_VERSION (idempotent marker).
    """
    snapshot_json = json.dumps(snapshot)
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE signal_enrichment
            SET entry_snapshot = CAST(:snap AS jsonb),
                analyzed_at = :analyzed_at,
                enrichment_version = :version
            WHERE signal_id = :sid
        """), {
            "snap": snapshot_json,
            "analyzed_at": created_at_ts,
            "version": PIT_VERSION,
            "sid": signal_id,
        })


# ════════════════════════════════════════════════════════════════
# Per-signal processing
# ════════════════════════════════════════════════════════════════

async def process_one(signal: dict, apply: bool, redis_client) -> dict:
    sid = signal["signal_id"]
    pair = signal["pair"]
    short = sid[:8]

    # created_at is TEXT in DB -> parse to aware datetime
    created_raw = signal["created_at"]
    if isinstance(created_raw, str):
        created_dt = datetime.fromisoformat(created_raw)
    else:
        created_dt = created_raw
    if created_dt.tzinfo is None:
        created_dt = created_dt.replace(tzinfo=timezone.utc)
    created_ms = int(created_dt.timestamp() * 1000)

    # Fetch point-in-time OHLCV
    try:
        ohlcv = await fetch_all_ohlcv_pit(pair, created_ms)
    except Exception as e:
        return {"sid": short, "pair": pair, "ok": False, "reason": f"fetch error: {e}"}

    is_valid, err = validate_ohlcv_data(ohlcv)
    if not is_valid:
        return {"sid": short, "pair": pair, "ok": False, "reason": f"invalid OHLCV: {err}"}

    # Verification: last candle date per timeframe (should be ~created_at)
    last_dates = {tf: str(ohlcv[tf]["open_time"].iloc[-1]) for tf in ("m15", "h1", "h4")}

    # 24h volume -- NOTE: this is "now" volume, not historical (ticker has no since).
    # Acceptable: volume only affects liquidity bucket, not the technical tags.
    try:
        vol_24h = await fetch_24h_volume(pair)
    except Exception:
        vol_24h = 0

    # Recompute snapshot with point-in-time dataframes
    try:
        snapshot = compute_snapshot(
            signal=signal,
            m15_df=ohlcv["m15"],
            h1_df=ohlcv["h1"],
            h4_df=ohlcv["h4"],
            vol_24h=vol_24h,
            mode="entry",
            redis_client=redis_client,
        )
    except Exception as e:
        traceback.print_exc()
        return {"sid": short, "pair": pair, "ok": False, "reason": f"compute error: {e}"}

    signal_dir = snapshot.get("signal_direction", "BULLISH")
    tag_count = snapshot.get("metadata", {}).get("tag_count", 0)

    if apply:
        # Backup old snapshot
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        old = get_existing_entry_snapshot(sid)
        (BACKUP_DIR / f"{sid}.json").write_text(json.dumps(old))
        # Write new (entry_snapshot only)
        update_entry_snapshot_only(sid, snapshot, created_dt)

    return {
        "sid": short, "pair": pair, "ok": True, "dir": signal_dir,
        "tags": tag_count, "created": created_dt.strftime("%Y-%m-%d %H:%M"),
        "last_candle_h1": last_dates["h1"],
    }


async def main_async(args):
    print(f"=== Point-in-time re-backfill [{'APPLY' if args.apply else 'DRY-RUN'}] ===")
    print(f"NOTE: fixes technical tags only. BTC/F&G/funding context tags stay 'now'.\n")

    signals = get_stale_signals(limit=args.limit)
    print(f"Stale signals to process: {len(signals)}\n")
    if not signals:
        print("Nothing to do.")
        return

    redis_client = get_redis_client()
    ok = fail = 0
    for i, sig in enumerate(signals, 1):
        res = await process_one(sig, args.apply, redis_client)
        if res["ok"]:
            ok += 1
            print(f"[{i}/{len(signals)}] OK   {res['pair']:<16} "
                  f"created={res['created']}  last_H1_candle={res['last_candle_h1']}  "
                  f"{res['dir']} {res['tags']}tags")
        else:
            fail += 1
            print(f"[{i}/{len(signals)}] FAIL {res['pair']:<16} {res['reason']}")

    print(f"\n=== Done: {ok} ok, {fail} failed "
          f"({'written' if args.apply else 'dry-run, nothing written'}) ===")
    if not args.apply and ok > 0:
        print("VERIFY: check that last_H1_candle is close to each signal's created date.")
        print("If dates match -> window is correct -> re-run with --apply.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="Process only N signals")
    ap.add_argument("--apply", action="store_true", help="Write to DB (default: dry-run)")
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
