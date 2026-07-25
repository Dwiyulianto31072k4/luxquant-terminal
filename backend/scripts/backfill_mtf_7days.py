import asyncio
import argparse
import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, text

from app.services.enrichment_worker import fetch_ohlcv, fetch_24h_volume
from app.services.enrichment_service_v3 import compute_snapshot, get_redis_client

# Load backend/.env so manual runs get the real DATABASE_URL (cron env still wins —
# load_dotenv does not override variables already present in the environment).
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except Exception:
    pass

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://luxq:CHANGEME@127.0.0.1:5432/luxquant")
engine = create_engine(DATABASE_URL, future=True)
OHLCV_LIMIT = 250

def get_active_signals_last_7days():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, stop2, status, created_at
            FROM signals
            WHERE status IN ('open', 'tp1', 'tp2', 'tp3')
              AND created_at::timestamptz >= NOW() - INTERVAL '7 days'
              AND pair IS NOT NULL AND entry IS NOT NULL
            ORDER BY created_at DESC
        """)).fetchall()
    return [dict(r._mapping) for r in rows]

async def process_signal(signal, dry_run=False):
    sid = signal["signal_id"]
    pair = signal["pair"]
    print(f"Processing {pair} ({sid[:8]})...")

    try:
        m15 = await fetch_ohlcv(pair, "15m", OHLCV_LIMIT)
        h1  = await fetch_ohlcv(pair, "1h", OHLCV_LIMIT)
        h4  = await fetch_ohlcv(pair, "4h", OHLCV_LIMIT)
        vol = await fetch_24h_volume(pair)
    except Exception as e:
        print(f"  [ERROR] OHLCV failed: {e}")
        return False

    if len(m15) < 50 or len(h1) < 50 or len(h4) < 50:
        print(f"  [SKIP] Insufficient data for {pair}")
        return False

    try:
        snapshot = compute_snapshot(
            signal=signal,
            m15_df=m15,
            h1_df=h1,
            h4_df=h4,
            vol_24h=vol,
            mode="live",
            redis_client=get_redis_client()
        )
    except Exception as e:
        print(f"  [ERROR] compute_snapshot failed: {e}")
        return False

    if dry_run:
        print(f"  [DRY-RUN] MTF: {snapshot.get('legacy_mtf', {})}")
        return True

    legacy = snapshot.get("legacy_mtf", {}) or {}
    now = datetime.now(timezone.utc)

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE signal_enrichment SET
                mtf_h4_trend = :h4,
                mtf_h1_trend = :h1,
                mtf_m15_trend = :m15,
                signal_direction = :dir,
                mtf_detail = CAST(:detail AS jsonb),
                live_snapshot = CAST(:snapshot AS jsonb),
                live_updated_at = :now
            WHERE signal_id = :sid
        """), {
            "sid": sid,
            "h4": legacy.get("mtf_h4_trend"),
            "h1": legacy.get("mtf_h1_trend"),
            "m15": legacy.get("mtf_m15_trend"),
            "dir": legacy.get("signal_direction") or snapshot.get("signal_direction"),
            "detail": legacy.get("mtf_detail", {}),
            "snapshot": snapshot,
            "now": now
        })
    print(f"  [OK] Updated MTF for {pair}")
    return True

async def main(dry_run=False):
    signals = get_active_signals_last_7days()
    print(f"Found {len(signals)} active signals in last 7 days\n")

    success = failed = 0
    for i, sig in enumerate(signals, 1):
        print(f"[{i}/{len(signals)}]", end=" ")
        if await process_signal(sig, dry_run):
            success += 1
        else:
            failed += 1
        await asyncio.sleep(1)

    print(f"\n\nDone. Success: {success}, Failed: {failed}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))
