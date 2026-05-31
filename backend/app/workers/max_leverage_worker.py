#!/usr/bin/env python3
"""
LuxQuant Max Leverage Worker
============================
Computes the REAL Binance Futures max leverage per coin and persists it
to signals.max_leverage. Source of truth for PnL card + X poster leverage.

Source: Binance public web API (no API key required)
    POST https://www.binance.com/bapi/futures/v1/public/future/common/brackets
    body: {"symbol": "<PAIR>"}
    -> data.brackets[].riskBrackets[bracketSeq==1].maxOpenPosLeverage

Modes:
    --loop        LISTEN new_signal, compute on each new signal (default service mode)
    --backfill    Process all signals with max_leverage_status='pending', then exit
    --signal-id X Process a single signal by id, then exit

Standalone — does NOT touch autotrade.
"""
import os
import sys
import json
import asyncio
import logging
import argparse
from datetime import datetime, timezone

import asyncpg
import httpx

# ============================================================
# CONFIG
# ============================================================
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)
BRACKETS_URL = "https://www.binance.com/bapi/futures/v1/public/future/common/brackets"
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; LuxQuant/1.0)",
    "Content-Type": "application/json",
}
HTTP_TIMEOUT = 12
BACKFILL_BATCH = 50
BACKFILL_DELAY = 0.25  # seconds between symbol fetches — gentle on the public endpoint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("/var/log/luxquant-sync/max-leverage-worker.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("max-leverage-worker")


# ============================================================
# LEVERAGE FETCH
# ============================================================
async def fetch_max_leverage(client: httpx.AsyncClient, pair: str):
    """Return (max_leverage:int | None, status:str).

    status: 'done' | 'unsupported' | 'error'
    'unsupported' = symbol not found on Binance USDT-M futures.
    """
    try:
        resp = await client.post(BRACKETS_URL, json={"symbol": pair}, timeout=HTTP_TIMEOUT)
        if resp.status_code != 200:
            logger.warning(f"  {pair}: HTTP {resp.status_code}")
            return None, "error"

        body = resp.json()
        if body.get("code") != "000000" or not body.get("data"):
            return None, "error"

        brackets = body["data"].get("brackets", [])
        # Find the bracket entry matching our exact symbol
        target = next((b for b in brackets if b.get("symbol") == pair), None)
        if target is None:
            # Symbol not present on futures (e.g. spot-only or delisted)
            return None, "unsupported"

        risk = target.get("riskBrackets", [])
        # bracketSeq == 1 holds the highest (max) leverage tier
        tier1 = next((r for r in risk if r.get("bracketSeq") == 1), None)
        if tier1 is None or tier1.get("maxOpenPosLeverage") is None:
            return None, "error"

        max_lev = int(tier1["maxOpenPosLeverage"])
        return max_lev, "done"

    except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError) as e:
        logger.warning(f"  {pair}: fetch error {type(e).__name__}: {e}")
        return None, "error"


# ============================================================
# DB
# ============================================================
async def update_signal_leverage(conn, signal_id, max_lev, status):
    await conn.execute(
        """
        UPDATE signals
        SET max_leverage = $1,
            max_leverage_status = $2,
            max_leverage_at = $3
        WHERE signal_id = $4
        """,
        max_lev, status, datetime.now(timezone.utc), signal_id,
    )


async def get_signal_pair(conn, signal_id):
    row = await conn.fetchrow(
        "SELECT signal_id, pair FROM signals WHERE signal_id = $1", signal_id
    )
    return row


def parse_payload(payload: str):
    """Parse new_signal NOTIFY payload.

    Trigger emits JSON: {"signal_id":..., "pair":..., "entry":..., "created_at":...}
    Returns (signal_id, pair) or None. Falls back to raw payload as signal_id.
    """
    try:
        obj = json.loads(payload)
        sid = obj.get("signal_id")
        prr = obj.get("pair", "")
        if sid:
            return sid, prr
    except json.JSONDecodeError:
        if payload:
            return payload, ""
    return None


async def process_one(conn, client, signal_id, pair):
    if not pair:
        await update_signal_leverage(conn, signal_id, None, "unsupported")
        logger.info(f"[skip] {signal_id} has no pair")
        return
    max_lev, status = await fetch_max_leverage(client, pair)
    await update_signal_leverage(conn, signal_id, max_lev, status)
    logger.info(f"[{status}] {pair} {signal_id} -> max_leverage={max_lev}x")


# ============================================================
# MODES
# ============================================================
async def run_backfill(days=None):
    conn = await asyncpg.connect(DATABASE_URL)
    client = httpx.AsyncClient(headers=HTTP_HEADERS)
    try:
        # created_at is stored as TEXT — cast to timestamptz for date filtering.
        day_filter = ""
        if days is not None:
            day_filter = f"AND created_at::timestamptz >= NOW() - INTERVAL '{int(days)} days'"
        total = 0
        while True:
            rows = await conn.fetch(
                f"""
                SELECT signal_id, pair FROM signals
                WHERE max_leverage_status = 'pending'
                {day_filter}
                ORDER BY created_at DESC
                LIMIT $1
                """,
                BACKFILL_BATCH,
            )
            if not rows:
                break
            for r in rows:
                await process_one(conn, client, r["signal_id"], r["pair"])
                total += 1
                await asyncio.sleep(BACKFILL_DELAY)
            logger.info(f"... backfilled {total} so far")
        scope = f"last {days} days" if days is not None else "all pending"
        logger.info(f"✅ Backfill complete ({scope}): {total} signals processed")
    finally:
        await client.aclose()
        await conn.close()


async def run_single(signal_id):
    conn = await asyncpg.connect(DATABASE_URL)
    client = httpx.AsyncClient(headers=HTTP_HEADERS)
    try:
        row = await get_signal_pair(conn, signal_id)
        if not row:
            logger.error(f"Signal {signal_id} not found")
            return
        await process_one(conn, client, row["signal_id"], row["pair"])
    finally:
        await client.aclose()
        await conn.close()


async def run_loop():
    """LISTEN new_signal — compute leverage as signals arrive."""
    conn = await asyncpg.connect(DATABASE_URL)
    client = httpx.AsyncClient(headers=HTTP_HEADERS)

    queue: asyncio.Queue = asyncio.Queue()

    def on_notify(connection, pid, channel, payload):
        # payload is JSON: {"signal_id":..., "pair":..., ...}
        parsed = parse_payload(payload)
        if parsed:
            queue.put_nowait(parsed)  # (signal_id, pair)

    await conn.add_listener("new_signal", on_notify)
    logger.info("🔄 Max Leverage Worker started — LISTEN new_signal")

    # Process any pending leftovers on startup (e.g. signals missed while down)
    pending = await conn.fetch(
        "SELECT signal_id, pair FROM signals WHERE max_leverage_status = 'pending' "
        "ORDER BY created_at DESC LIMIT 20"
    )
    for r in pending:
        await process_one(conn, client, r["signal_id"], r["pair"])

    try:
        while True:
            signal_id, pair = await queue.get()
            try:
                # pair comes straight from the trigger payload — no extra query needed.
                # Fall back to a lookup only if payload lacked it.
                if not pair:
                    row = await get_signal_pair(conn, signal_id)
                    pair = row["pair"] if row else None
                    if row is None:
                        logger.warning(f"NOTIFY for unknown signal_id={signal_id}")
                        continue
                await process_one(conn, client, signal_id, pair)
            except Exception as e:
                logger.error(f"Error processing {signal_id}: {type(e).__name__}: {e}")
    finally:
        await client.aclose()
        await conn.close()


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--loop", action="store_true", help="LISTEN new_signal (service mode)")
    g.add_argument("--backfill", action="store_true", help="Process all pending signals then exit")
    g.add_argument("--signal-id", type=str, help="Process a single signal id then exit")
    ap.add_argument("--days", type=int, default=None,
                    help="With --backfill: only signals from the last N days")
    args = ap.parse_args()

    if args.backfill:
        asyncio.run(run_backfill(days=args.days))
    elif args.signal_id:
        asyncio.run(run_single(args.signal_id))
    else:
        asyncio.run(run_loop())


if __name__ == "__main__":
    main()
