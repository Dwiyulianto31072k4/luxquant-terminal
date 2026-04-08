"""
LuxQuant Enrichment Worker v3.0
================================
Worker yang menjalankan enrichment_service_v3.compute_snapshot() dan menyimpan
hasilnya ke database (entry_snapshot & live_snapshot JSONB columns).

Modes:
- entry: dipanggil saat signal baru masuk. Compute snapshot, simpan ke
         entry_snapshot (frozen selamanya) DAN live_snapshot (initial state).
- live:  dipanggil oleh live_refresher_v3.py untuk refresh signal aktif.
         Compute snapshot baru, overwrite live_snapshot, append ke
         signal_enrichment_history.

CLI Usage:
    # Test 1 signal specific (entry mode)
    python3 -m app.services.enrichment_worker_v3 --signal-id <uuid>

    # Process all pending signals (entry mode)
    python3 -m app.services.enrichment_worker_v3 --pending

    # Refresh all active signals (live mode) — biasanya dipanggil via cron
    python3 -m app.services.enrichment_worker_v3 --live-all

    # Dry run (compute tapi tidak write ke DB)
    python3 -m app.services.enrichment_worker_v3 --signal-id <uuid> --dry-run

Backward compat:
- Kolom legacy (confidence_score, rating, score_breakdown, dll) tetap diisi
  dengan default values supaya frontend lama tidak crash.
- Worker lama (v2.3.1) tetap bisa jalan paralel — tidak saling interfere.

Active signal scope (sesuai diskusi v3):
- status IN ('open', 'tp1', 'tp2', 'tp3')
- created_at >= NOW() - INTERVAL '7 days'

Author: LuxQuant Team
Version: v3.0
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import traceback
from datetime import datetime, timezone

from sqlalchemy import create_engine, text

# Reuse core enrichment logic
from app.services.enrichment_service_v3 import (
    compute_snapshot,
    get_redis_client,
    ENRICHMENT_VERSION,
)

# Reuse OHLCV fetchers from v2.3.1 (they still work)
from app.services.enrichment_worker import (
    fetch_ohlcv,
    fetch_24h_volume,
)


# ============================================================
# CONFIG
# ============================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)

OHLCV_LIMIT = 250  # increased from 150 to support EMA200
ACTIVE_STATUSES = ("open", "tp1", "tp2", "tp3")

LOG_DIR = os.getenv("LOG_DIR", "/var/log/luxquant-sync")
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "enrichment-worker-v3.log")),
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger("enrichment-worker-v3")

engine = create_engine(DATABASE_URL, future=True)


# ============================================================
# DATABASE QUERIES
# ============================================================

def get_signal_by_id(signal_id: str) -> dict:
    """Fetch single signal row by signal_id."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, stop2, status, risk_level, created_at
            FROM signals
            WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()
    return dict(row._mapping) if row else None


def get_pending_signals(limit: int = 50) -> list:
    """Get signals with enrichment_status = 'pending', oldest first."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, stop2, status, risk_level, created_at
            FROM signals
            WHERE enrichment_status = 'pending'
              AND pair IS NOT NULL
              AND entry IS NOT NULL
            ORDER BY created_at ASC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(r._mapping) for r in rows]


def get_active_signals_for_refresh() -> list:
    """
    Get signals that need live refresh:
    - status IN ('open', 'tp1', 'tp2', 'tp3')
    - created_at within last 7 days
    - already has entry_snapshot (enriched before)
    """
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT s.signal_id, s.pair, s.entry, s.target1, s.target2,
                   s.target3, s.target4, s.stop1, s.stop2, s.status,
                   s.risk_level, s.created_at
            FROM signals s
            INNER JOIN signal_enrichment e ON e.signal_id = s.signal_id
            WHERE s.status IN ('open', 'tp1', 'tp2', 'tp3')
              AND s.created_at::timestamptz >= NOW() - INTERVAL '7 days'
              AND s.pair IS NOT NULL
              AND s.entry IS NOT NULL
              AND e.entry_snapshot IS NOT NULL
              AND e.entry_snapshot::text != '{}'
            ORDER BY s.created_at DESC
        """)).fetchall()
    return [dict(r._mapping) for r in rows]


def update_enrichment_status(signal_id: str, status: str):
    """Update enrichment_status column on signals table."""
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE signals
            SET enrichment_status = :status
            WHERE signal_id = :sid
        """), {"status": status, "sid": signal_id})


def upsert_entry_snapshot(signal_id: str, pair: str, snapshot: dict,
                          signal_direction: str):
    """
    Save entry snapshot (frozen forever).
    Also initializes live_snapshot with the same value.
    Preserves legacy columns with default values for backward compat.
    
    NOTE: Uses CAST(:param AS jsonb) instead of :param::jsonb because
    SQLAlchemy's text() interprets :: as a nested bind-parameter delimiter.
    """
    snapshot_json = json.dumps(snapshot)
    now = datetime.now(timezone.utc)

    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO signal_enrichment (
                signal_id, pair,
                entry_snapshot, live_snapshot, live_updated_at,
                confidence_score, rating, regime,
                score_breakdown, weights_used,
                signal_direction, mtf_detail, patterns_detected, smc_detail,
                analyzed_at, enrichment_version
            ) VALUES (
                :signal_id, :pair,
                CAST(:entry_snapshot AS jsonb), CAST(:live_snapshot AS jsonb), :live_updated_at,
                0, 'N/A', 'normal',
                CAST('{}' AS jsonb), CAST('{}' AS jsonb),
                :signal_direction, CAST('{}' AS jsonb), CAST('[]' AS jsonb), CAST('{}' AS jsonb),
                :analyzed_at, :version
            )
            ON CONFLICT (signal_id) DO UPDATE SET
                entry_snapshot = EXCLUDED.entry_snapshot,
                live_snapshot = EXCLUDED.live_snapshot,
                live_updated_at = EXCLUDED.live_updated_at,
                signal_direction = EXCLUDED.signal_direction,
                analyzed_at = EXCLUDED.analyzed_at,
                enrichment_version = EXCLUDED.enrichment_version
        """), {
            "signal_id": signal_id,
            "pair": pair,
            "entry_snapshot": snapshot_json,
            "live_snapshot": snapshot_json,
            "live_updated_at": now,
            "signal_direction": signal_direction,
            "analyzed_at": now,
            "version": ENRICHMENT_VERSION,
        })


def update_live_snapshot(signal_id: str, snapshot: dict):
    """
    Overwrite live_snapshot with fresh data AND append to history.
    Does NOT touch entry_snapshot.
    """
    snapshot_json = json.dumps(snapshot)
    now = datetime.now(timezone.utc)

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE signal_enrichment
            SET live_snapshot = CAST(:snapshot AS jsonb),
                live_updated_at = :now
            WHERE signal_id = :sid
        """), {
            "snapshot": snapshot_json,
            "now": now,
            "sid": signal_id,
        })

        conn.execute(text("""
            INSERT INTO signal_enrichment_history (signal_id, snapshot, recorded_at)
            VALUES (:sid, CAST(:snapshot AS jsonb), :now)
        """), {
            "sid": signal_id,
            "snapshot": snapshot_json,
            "now": now,
        })


def cleanup_old_history(retention_days: int = 7) -> int:
    """Delete history rows older than retention_days. Returns count deleted."""
    with engine.begin() as conn:
        result = conn.execute(text("""
            DELETE FROM signal_enrichment_history
            WHERE recorded_at < NOW() - (:days || ' days')::interval
        """), {"days": retention_days})
    return result.rowcount if result.rowcount else 0


# ============================================================
# OHLCV FETCH WRAPPER
# ============================================================

async def fetch_all_ohlcv(pair: str) -> dict:
    """Fetch M15, H1, H4 OHLCV in parallel."""
    m15, h1, h4 = await asyncio.gather(
        fetch_ohlcv(pair, "15m", OHLCV_LIMIT),
        fetch_ohlcv(pair, "1h", OHLCV_LIMIT),
        fetch_ohlcv(pair, "4h", OHLCV_LIMIT),
    )
    return {"m15": m15, "h1": h1, "h4": h4}


def validate_ohlcv_data(data: dict) -> tuple:
    """Validate OHLCV data. Returns (is_valid, error_message)."""
    for tf, df in data.items():
        if df is None or len(df) == 0:
            return False, f"{tf.upper()} empty"
        if len(df) < 50:
            return False, f"{tf.upper()} insufficient ({len(df)} candles)"
    return True, None


# ============================================================
# PROCESS SINGLE SIGNAL
# ============================================================

async def process_signal_entry(signal: dict, dry_run: bool = False) -> dict:
    """Process signal in ENTRY mode (first time enrichment)."""
    sid = signal["signal_id"]
    pair = signal["pair"]
    short_id = sid[:8]

    logger.info(f"[ENTRY {short_id}] Start — {pair}")

    try:
        ohlcv = await fetch_all_ohlcv(pair)
    except Exception as e:
        return {"success": False, "error": f"OHLCV fetch failed: {e}"}

    is_valid, err = validate_ohlcv_data(ohlcv)
    if not is_valid:
        return {"success": False, "error": err}

    try:
        vol_24h = await fetch_24h_volume(pair)
    except Exception as e:
        logger.warning(f"[ENTRY {short_id}] volume fetch failed: {e}")
        vol_24h = 0

    try:
        redis_client = get_redis_client()
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
        logger.error(f"[ENTRY {short_id}] compute_snapshot failed: {e}")
        traceback.print_exc()
        return {"success": False, "error": f"Snapshot compute failed: {e}"}

    signal_dir = snapshot.get("signal_direction", "BULLISH")
    tag_count = snapshot.get("metadata", {}).get("tag_count", 0)
    important_count = snapshot.get("metadata", {}).get("important_tag_count", 0)

    logger.info(
        f"[ENTRY {short_id}] Computed — {signal_dir}, "
        f"{tag_count} tags ({important_count} important)"
    )

    if not dry_run:
        try:
            upsert_entry_snapshot(sid, pair, snapshot, signal_dir)
            update_enrichment_status(sid, "done")
            logger.info(f"[ENTRY {short_id}] Saved to DB")
        except Exception as e:
            logger.error(f"[ENTRY {short_id}] DB write failed: {e}")
            traceback.print_exc()
            return {"success": False, "error": f"DB write failed: {e}"}
    else:
        logger.info(f"[ENTRY {short_id}] DRY-RUN — not saved")

    return {"success": True, "snapshot": snapshot, "error": None}


async def process_signal_live(signal: dict, dry_run: bool = False) -> dict:
    """Process signal in LIVE mode (refresh active signal)."""
    sid = signal["signal_id"]
    pair = signal["pair"]
    short_id = sid[:8]

    logger.info(f"[LIVE  {short_id}] Start — {pair}")

    try:
        ohlcv = await fetch_all_ohlcv(pair)
    except Exception as e:
        return {"success": False, "error": f"OHLCV fetch failed: {e}"}

    is_valid, err = validate_ohlcv_data(ohlcv)
    if not is_valid:
        return {"success": False, "error": err}

    try:
        vol_24h = await fetch_24h_volume(pair)
    except Exception:
        vol_24h = 0

    try:
        redis_client = get_redis_client()
        snapshot = compute_snapshot(
            signal=signal,
            m15_df=ohlcv["m15"],
            h1_df=ohlcv["h1"],
            h4_df=ohlcv["h4"],
            vol_24h=vol_24h,
            mode="live",
            redis_client=redis_client,
        )
    except Exception as e:
        logger.error(f"[LIVE  {short_id}] compute_snapshot failed: {e}")
        return {"success": False, "error": f"Snapshot compute failed: {e}"}

    tag_count = snapshot.get("metadata", {}).get("tag_count", 0)
    logger.info(f"[LIVE  {short_id}] Refreshed — {tag_count} tags")

    if not dry_run:
        try:
            update_live_snapshot(sid, snapshot)
        except Exception as e:
            logger.error(f"[LIVE  {short_id}] DB write failed: {e}")
            return {"success": False, "error": f"DB write failed: {e}"}

    return {"success": True, "snapshot": snapshot, "error": None}


# ============================================================
# BATCH PROCESSORS
# ============================================================

async def run_pending_batch(dry_run: bool = False):
    """Process all pending signals (entry mode)."""
    signals = get_pending_signals(limit=50)
    if not signals:
        logger.info("No pending signals")
        return

    logger.info(f"Processing {len(signals)} pending signals")

    stats = {"success": 0, "failed": 0}
    for sig in signals:
        sid = sig["signal_id"]
        if not dry_run:
            update_enrichment_status(sid, "processing")

        result = await process_signal_entry(sig, dry_run=dry_run)

        if result["success"]:
            stats["success"] += 1
        else:
            stats["failed"] += 1
            logger.error(f"[ENTRY {sid[:8]}] FAILED: {result['error']}")
            if not dry_run:
                update_enrichment_status(sid, "error")

        await asyncio.sleep(1)

    logger.info(f"Batch done — {stats['success']} success, {stats['failed']} failed")


async def run_live_refresh_all(dry_run: bool = False):
    """Refresh all active signals (live mode). Called by cron."""
    signals = get_active_signals_for_refresh()
    if not signals:
        logger.info("No active signals to refresh")
        return

    logger.info(f"Live refresh: {len(signals)} active signals")

    stats = {"success": 0, "failed": 0}
    for sig in signals:
        sid = sig["signal_id"]
        result = await process_signal_live(sig, dry_run=dry_run)

        if result["success"]:
            stats["success"] += 1
        else:
            stats["failed"] += 1
            logger.warning(f"[LIVE  {sid[:8]}] skip: {result['error']}")

        await asyncio.sleep(0.5)

    if not dry_run:
        try:
            deleted = cleanup_old_history(retention_days=7)
            if deleted > 0:
                logger.info(f"History cleanup: {deleted} old rows deleted")
        except Exception as e:
            logger.warning(f"History cleanup failed: {e}")

    logger.info(f"Live refresh done — {stats['success']} success, {stats['failed']} failed")


async def run_single(signal_id: str, mode: str = "entry", dry_run: bool = False):
    """Run enrichment on a single signal (for testing)."""
    sig = get_signal_by_id(signal_id)
    if not sig:
        logger.error(f"Signal {signal_id} not found")
        return None

    logger.info(f"Single signal test — {sig['pair']} ({mode} mode)")

    if mode == "entry":
        result = await process_signal_entry(sig, dry_run=dry_run)
    else:
        result = await process_signal_live(sig, dry_run=dry_run)

    if result["success"]:
        snapshot = result["snapshot"]
        print("\n" + "=" * 60)
        print(f"SNAPSHOT — {sig['pair']} {snapshot['signal_direction']} ({mode})")
        print("=" * 60)

        tags = snapshot.get("tags", [])
        important = set()
        for t in snapshot.get("tags_annotated", []):
            if t.get("important"):
                important.add(t["name"])

        meta = snapshot.get("metadata", {})
        print(f"Total tags: {meta.get('tag_count', 0)}")
        print(f"Important:  {meta.get('important_tag_count', 0)}")
        print(f"Structure:  {'available' if meta.get('structure_available') else 'N/A'}")

        print("\n--- IMPORTANT TAGS ---")
        for t in tags:
            if t in important:
                print(f"  • {t}")

        print("\n--- DETAIL TAGS ---")
        for t in tags:
            if t not in important:
                print(f"  · {t}")

        print("\n--- KEY FACTS ---")
        facts = snapshot.get("facts", {})
        h1 = facts.get("by_timeframe", {}).get("h1", {})
        h1_t = h1.get("trend", {})
        h1_m = h1.get("momentum", {})
        h1_v = h1.get("volume", {})
        eq = facts.get("entry_quality", {})
        ctx = facts.get("context", {})

        print(f"H1 trend:       {h1_t.get('trend')} "
              f"(ADX {h1_t.get('adx')}, {h1_t.get('trend_strength')})")
        print(f"H1 RSI:         {h1_m.get('rsi')} ({h1_m.get('rsi_state')})")
        print(f"H1 MACD:        {h1_m.get('macd_hist')} ({h1_m.get('macd_direction')})")
        print(f"H1 Volume:      {h1_v.get('ratio')}x ({h1_v.get('state')})")
        print(f"Last 3c gain:   {eq.get('last_3_candles_gain_pct')}%")
        print(f"Dist EMA20 H1:  {eq.get('distance_from_ema20_h1_pct')}%")

        btc = ctx.get("btc", {})
        fng = ctx.get("fng", {})
        env = ctx.get("environment", {})
        print(f"BTC change:     {btc.get('price_change_pct')}%")
        print(f"BTC dominance:  {btc.get('dominance')}% "
              f"(trend: {btc.get('dominance_trend')})")
        print(f"Fear & Greed:   {fng.get('value')} ({fng.get('classification')})")

        vol_24h = env.get('vol_24h_usd') or 0
        print(f"Liquidity:      ${vol_24h:,.0f} ({env.get('liquidity_tier')})")
        print(f"Vol regime:     {env.get('volatility_regime')} "
              f"(ATR pct {env.get('atr_percentile_h4')})")

        if mode == "entry" and not dry_run:
            print(f"\nDB: entry_snapshot + live_snapshot saved")
        elif mode == "live" and not dry_run:
            print(f"\nDB: live_snapshot updated + history appended")
    else:
        logger.error(f"FAILED: {result['error']}")

    return result


# ============================================================
# MAIN CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="LuxQuant Enrichment Worker v3")
    parser.add_argument("--signal-id", type=str, help="Process specific signal by ID")
    parser.add_argument("--pending", action="store_true",
                        help="Process all pending signals (entry mode)")
    parser.add_argument("--live-all", action="store_true",
                        help="Refresh all active signals (live mode)")
    parser.add_argument("--mode", type=str, default="entry",
                        choices=["entry", "live"],
                        help="Mode when using --signal-id (default: entry)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Don't write to DB")
    args = parser.parse_args()

    if args.signal_id:
        asyncio.run(run_single(args.signal_id, mode=args.mode, dry_run=args.dry_run))
    elif args.pending:
        asyncio.run(run_pending_batch(dry_run=args.dry_run))
    elif args.live_all:
        asyncio.run(run_live_refresh_all(dry_run=args.dry_run))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()