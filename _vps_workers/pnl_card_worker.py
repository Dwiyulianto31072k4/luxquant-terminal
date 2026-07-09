"""
LuxQuant PnL Card Worker
=========================
Renders a Binance-style PnL card PNG for each signal lifecycle event
(entry, TP hits, SL), then writes the path to the `signals` table so
the x-poster can overlay it on the chart screenshot when tweeting.

Architecture mirrors chart-worker:
  - Poll DB every POLL_INTERVAL seconds
  - Signal with pnl_card_status='pending' → render entry card (PnL = 0.00%)
  - Signal where chart_status is ahead of pnl_card_status → render update
  - Rolling cleanup: only keep entry + latest event card per signal

Storage layout (matches chart-worker pattern):
  /opt/luxquant/pnl-cards/{signal_id}/
    ├── {PAIR}_entry_{timestamp}.png       ← kept forever (proof of entry)
    ├── {PAIR}_tp2_{timestamp}.png         ← deleted when tp3 arrives
    └── {PAIR}_tp3_{timestamp}.png         ← kept until tp4 arrives, then deleted

Usage:
    # One-shot batch
    /opt/luxquant/pnl-card-worker-venv/bin/python pnl_card_worker.py

    # Run forever (production)
    /opt/luxquant/pnl-card-worker-venv/bin/python pnl_card_worker.py --loop

    # Render a specific signal (no DB writes)
    /opt/luxquant/pnl-card-worker-venv/bin/python pnl_card_worker.py \\
        --signal-id <uuid> --dry-run

    # Render N latest signals from DB as read-only test
    /opt/luxquant/pnl-card-worker-venv/bin/python pnl_card_worker.py \\
        --test-latest 3 --dry-run

Requirements (in venv):
    pip install playwright Pillow psycopg2-binary sqlalchemy
    playwright install chromium
"""

import argparse
import asyncio
import glob
import hashlib
import logging
import os
import random
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright
from sqlalchemy import create_engine, text

# ============================================================
# CONFIG
# ============================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant",
)

# Worker root — render.html and assets live here next to this file,
# matching chart-worker's pattern of having logo.png next to chart_worker.py
WORKER_ROOT  = Path(__file__).resolve().parent
RENDER_HTML  = WORKER_ROOT / "pnl-card-renderer" / "render.html"
PNL_CARD_DIR = "/opt/luxquant/pnl-cards"

POLL_INTERVAL = 5      # seconds between batches when --loop
BATCH_LIMIT   = 5      # max signals processed per cycle
RENDER_WAIT_MS = 800   # extra settle time after Playwright reports loaded

# Retry strategy for Playwright crashes / timeouts: 3 attempts, exponential.
RETRY_DELAYS_S = (5, 15, 45)

# Leverage pool — random pick per signal, then persisted.
LEVERAGE_CHOICES = (10, 20, 25, 50, 75)
STYLE_CHOICES    = (1, 2, 3, 4)

# Native canvas dimensions for each style's `.binance-design-N-layout` div.
# Must match what render.html expects; Playwright sets viewport to these.
DESIGN_VIEWPORTS = {
    1: (1035, 624),
    2: (800, 800),
    3: (1035, 624),
    4: (980, 1340),
}

# Rolling cleanup order (mirror chart-worker). On a TP event we delete ALL lower
# TPs, not just the immediately-previous one — signals often skip TPs (tp2->tp4)
# and the old single-step map left the skipped stage orphaned. Entry never deleted.
TP_ORDER = ("tp1", "tp2", "tp3", "tp4")

# ============================================================
# LOGGING
# ============================================================

LOG_DIR = "/var/log/luxquant-sync"
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f"{LOG_DIR}/pnl-card-worker.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("pnl-card-worker")

engine = create_engine(DATABASE_URL, future=True)
os.makedirs(PNL_CARD_DIR, exist_ok=True)


# ============================================================
# DATABASE QUERIES
# ============================================================

def get_pending_entries(limit=BATCH_LIMIT):
    """Signals that have at least an entry chart but no PnL card yet."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry,
                   target1, target2, target3, target4, stop1,
                   status, created_at,
                   pnl_leverage, pnl_style, max_leverage
            FROM signals
            WHERE pnl_card_status = 'pending'
              AND pair IS NOT NULL
              AND entry IS NOT NULL
              AND entry_chart_path IS NOT NULL
              AND created_at::timestamptz > NOW() - INTERVAL '90 days'
              -- Only render after chart-worker has produced the entry chart;
              -- gives chart-worker first shot to populate the entry_chart_path.
              AND chart_status IN ('entry_done', 'updated:tp1', 'updated:tp2',
                                   'updated:tp3', 'updated:tp4', 'updated:sl',
                                   'complete')
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(r._mapping) for r in rows]


def get_pending_updates(limit=BATCH_LIMIT):
    """Signals whose pnl_card_status is behind their latest signal_update.

    Mirrors chart-worker.get_pending_updates() but on `pnl_card_status`
    instead of `chart_status`.
    """
    with engine.connect() as conn:
        rows = conn.execute(text("""
            WITH latest_update AS (
                SELECT DISTINCT ON (signal_id)
                    signal_id, update_type, price, update_at
                FROM signal_updates
                WHERE update_type IN ('tp1','tp2','tp3','tp4','sl')
                ORDER BY signal_id, update_at DESC,
                    CASE update_type
                        WHEN 'tp4' THEN 5
                        WHEN 'tp3' THEN 4
                        WHEN 'tp2' THEN 3
                        WHEN 'tp1' THEN 2
                        WHEN 'sl'  THEN 1
                        ELSE 0
                    END DESC
            )
            SELECT
                s.signal_id, s.pair, s.entry,
                s.target1, s.target2, s.target3, s.target4, s.stop1,
                s.status, s.created_at,
                s.pnl_card_status, s.pnl_leverage, s.pnl_style, s.max_leverage,
                lu.update_type, lu.price AS hit_price, lu.update_at
            FROM signals s
            JOIN latest_update lu ON s.signal_id = lu.signal_id
            WHERE s.pnl_card_status NOT IN ('pending', 'error')
              AND s.entry_chart_path IS NOT NULL
              AND s.created_at::timestamptz > NOW() - INTERVAL '90 days'
              AND s.created_at::timestamptz > now() - interval '7 days'
              AND (
                  s.pnl_card_status = 'entry_done'
                  OR (s.pnl_card_status LIKE 'updated:%%'
                      AND s.pnl_card_status != 'updated:' || lu.update_type)
                  OR (
                      s.pnl_card_status = 'complete'
                      AND s.pnl_card_latest_path IS NOT NULL
                      AND split_part(
                          split_part(s.pnl_card_latest_path, '/', -1), '_', 2
                      ) <> lu.update_type
                  )
              )
            ORDER BY lu.update_at::timestamptz DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(r._mapping) for r in rows]


def update_pnl_card_db(signal_id, *,
                       entry_path=None, latest_path=None,
                       status=None, leverage=None, style=None):
    """Sparse UPDATE — only writes columns that are passed."""
    updates, params = [], {"signal_id": signal_id}
    if entry_path is not None:
        updates.append("pnl_card_entry_path = :entry_path")
        params["entry_path"] = entry_path
    if latest_path is not None:
        updates.append("pnl_card_latest_path = :latest_path")
        params["latest_path"] = latest_path
    if status is not None:
        updates.append("pnl_card_status = :status")
        params["status"] = status
    if leverage is not None:
        updates.append("pnl_leverage = :leverage")
        params["leverage"] = leverage
    if style is not None:
        updates.append("pnl_style = :style")
        params["style"] = style
    if not updates:
        return
    sql = f"UPDATE signals SET {', '.join(updates)} WHERE signal_id = :signal_id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def get_signal_by_id(signal_id):
    """For --signal-id flag: fetch one signal and its latest update if any."""
    with engine.connect() as conn:
        sig = conn.execute(text("""
            SELECT signal_id, pair, entry,
                   target1, target2, target3, target4, stop1,
                   status, created_at,
                   pnl_card_status, pnl_leverage, pnl_style, max_leverage
            FROM signals
            WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()
        if not sig:
            return None
        sig = dict(sig._mapping)
        upd = conn.execute(text("""
            SELECT update_type, price AS hit_price, update_at
            FROM signal_updates
            WHERE signal_id = :sid
              AND update_type IN ('tp1','tp2','tp3','tp4','sl')
            ORDER BY update_at DESC
            LIMIT 1
        """), {"sid": signal_id}).fetchone()
        if upd:
            sig.update(dict(upd._mapping))
        return sig


# ============================================================
# DETERMINISTIC BUT RANDOM-FEELING CHOICES
# ============================================================

def pick_leverage_and_style(signal_id, existing_leverage=None, existing_style=None,
                            max_leverage=None):
    """Return (leverage, style).

    Leverage priority (option A — pure max):
      1. existing_leverage already persisted for this signal (reuse, stable).
      2. max_leverage  -> real Binance max for this coin (source of truth).
      3. legacy hashed pool (only when max_leverage is NULL / not computed yet).

    Style is always hash-derived (cosmetic only).
    """
    h = hashlib.md5(str(signal_id).encode()).digest()
    sty = existing_style or STYLE_CHOICES[h[1] % len(STYLE_CHOICES)]

    if existing_leverage:
        return existing_leverage, sty

    if max_leverage:
        try:
            lev = int(max_leverage)
            if lev > 0:
                return lev, sty
        except (TypeError, ValueError):
            pass

    # Fallback: coin's max leverage not computed yet (max_leverage_worker pending)
    lev = LEVERAGE_CHOICES[h[0] % len(LEVERAGE_CHOICES)]
    return lev, sty


def detect_side(entry, target1):
    """LONG if target above entry, SHORT otherwise. Matches LuxQuant convention."""
    if not entry or not target1:
        return "long"
    return "long" if float(target1) > float(entry) else "short"


# ============================================================
# CARD RENDERING (Playwright + render.html)
# ============================================================

def trim_white_bottom_rows(image_path, *, max_rows=4):
    """Remove browser-captured white rows at the bottom of style 1 cards."""
    path = Path(image_path)
    with Image.open(path) as im:
        rgba = im.convert("RGBA")
        width, height = rgba.size
        rows_to_trim = 0

        for y in range(height - 1, max(height - max_rows - 1, -1), -1):
            row = [rgba.getpixel((x, y)) for x in range(0, width, 8)]
            if all(r >= 248 and g >= 248 and b >= 248 and a >= 248
                   for r, g, b, a in row):
                rows_to_trim += 1
            else:
                break

        if rows_to_trim:
            rgba.crop((0, 0, width, height - rows_to_trim)).save(path)
            logger.info(f"  trimmed {rows_to_trim}px white bottom edge: {path.name}")


async def render_card_once(browser_context, *, style, symbol, side, leverage,
                           entry_price, hit_price, ts, out_path):
    """Single render attempt. Raises on failure (caller retries)."""
    if not RENDER_HTML.exists():
        raise FileNotFoundError(f"Missing renderer: {RENDER_HTML}")

    w, h = DESIGN_VIEWPORTS[style]

    page = await browser_context.new_page()
    try:
        await page.set_viewport_size({"width": w, "height": h})

        # Pass everything via URL params — render.html JS will pick smart
        # defaults for `ref` based on style if we don't override.
        qs = urllib.parse.urlencode({
            "style":    style,
            "symbol":   symbol,
            "side":     side,
            "leverage": leverage,
            "entry":    f"{entry_price:.8f}".rstrip("0").rstrip("."),
            "hit":      f"{hit_price:.8f}".rstrip("0").rstrip("."),
            "ts":       ts,
        })
        url = f"file://{RENDER_HTML}?{qs}"

        await page.goto(url, wait_until="domcontentloaded", timeout=15_000)

        # Wait for the renderer to signal all images are loaded.
        try:
            await page.wait_for_function(
                "window.__rendered === true", timeout=8_000
            )
        except Exception:
            logger.warning("__rendered flag did not fire; proceeding anyway")

        await page.wait_for_timeout(RENDER_WAIT_MS)

        locator = page.locator(f".binance-design-{style}-layout")
        await locator.screenshot(path=str(out_path))
        if style == 1:
            trim_white_bottom_rows(out_path)
    finally:
        await page.close()


async def render_card_with_retry(browser_context, **kwargs):
    """3-attempt exponential backoff: 5s → 15s → 45s.

    Returns True on success, False if all attempts failed.
    Failures are logged at each attempt.
    """
    last_err = None
    for attempt, delay in enumerate([0] + list(RETRY_DELAYS_S[:-1])):
        if delay:
            logger.info(f"  retry in {delay}s...")
            await asyncio.sleep(delay)
        try:
            await render_card_once(browser_context, **kwargs)
            if attempt > 0:
                logger.info(f"  ✓ succeeded on attempt {attempt + 1}")
            return True
        except Exception as e:
            last_err = e
            logger.warning(f"  attempt {attempt + 1} failed: {e}")
    logger.error(f"  ✗ all 3 attempts failed; last error: {last_err}")
    return False


# ============================================================
# CLEANUP — same logic as chart-worker
# ============================================================

def cleanup_previous_cards(signal_id, event_type):
    """Delete stale PnL cards when a newer event arrives.

    - Delete previous TP (tp1 when tp2 arrives, tp2 when tp3, ...)
    - Delete SL card if a TP arrives later
    - Delete all TP cards if SL final
    - NEVER delete the entry card (proof of entry)
    """
    signal_dir = os.path.join(PNL_CARD_DIR, str(signal_id))
    if not os.path.exists(signal_dir):
        return

    if event_type in TP_ORDER:
        idx = TP_ORDER.index(event_type)
        for prev in TP_ORDER[:idx]:
            for f in glob.glob(os.path.join(signal_dir, f"*_{prev}_*.png")):
                os.remove(f)
                logger.info(f"  cleanup: removed {os.path.basename(f)}")

        for f in glob.glob(os.path.join(signal_dir, "*_sl_*.png")):
            os.remove(f)
            logger.info(f"  cleanup: removed (old SL) {os.path.basename(f)}")

    if event_type == "sl":
        for tp in TP_ORDER:
            for f in glob.glob(os.path.join(signal_dir, f"*_{tp}_*.png")):
                os.remove(f)
                logger.info(f"  cleanup: removed (SL final) {os.path.basename(f)}")


# ============================================================
# PROCESS PIPELINES
# ============================================================

async def process_entry(browser_context, sig, dry_run=False):
    """Render the entry PnL card (PnL = 0.00%, mark = entry).

    Persists pnl_leverage and pnl_style on this first render so all later
    updates reuse the same values.
    """
    sid    = sig["signal_id"]
    pair   = sig["pair"]
    entry  = float(sig["entry"])
    t1     = sig.get("target1")
    side   = detect_side(entry, t1)

    leverage, style = pick_leverage_and_style(
        sid, sig.get("pnl_leverage"), sig.get("pnl_style"),
        max_leverage=sig.get("max_leverage")
    )

    logger.info(f"[entry] {pair} {sid} → style={style} leverage={leverage}x")

    signal_dir = os.path.join(PNL_CARD_DIR, str(sid))
    os.makedirs(signal_dir, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(signal_dir, f"{pair}_entry_{ts}.png")

    created_at = sig.get("created_at")
    ts_iso = created_at.isoformat() if hasattr(created_at, "isoformat") else \
             datetime.now(timezone.utc).isoformat()

    ok = await render_card_with_retry(
        browser_context,
        style=style, symbol=pair, side=side, leverage=leverage,
        entry_price=entry, hit_price=entry,   # mark = entry → PnL 0.00%
        ts=ts_iso, out_path=out_path,
    )

    if not ok:
        logger.error(f"  ✗ entry render permanently failed for {sid}")
        if not dry_run:
            update_pnl_card_db(sid, status="error",
                               leverage=leverage, style=style)
        return False

    if dry_run:
        logger.info(f"  ✓ DRY RUN — would save: {out_path}")
    else:
        update_pnl_card_db(
            sid,
            entry_path=out_path,
            latest_path=out_path,
            status="entry_done",
            leverage=leverage,
            style=style,
        )
        logger.info(f"  ✓ saved: {out_path}")
    return True


async def process_update(browser_context, sig, dry_run=False):
    """Render an updated PnL card after a TP/SL hit."""
    sid        = sig["signal_id"]
    pair       = sig["pair"]
    entry      = float(sig["entry"])
    hit_price  = float(sig["hit_price"])
    event      = sig["update_type"]
    t1         = sig.get("target1")
    side       = detect_side(entry, t1)

    # Reuse leverage and style chosen at entry time
    leverage = sig.get("pnl_leverage")
    style    = sig.get("pnl_style")
    if not leverage or not style:
        # Edge case: pnl_card_status='entry_done' but values missing.
        # Pick fresh and persist.
        leverage, style = pick_leverage_and_style(
            sid, max_leverage=sig.get("max_leverage"))
        if not dry_run:
            update_pnl_card_db(sid, leverage=leverage, style=style)

    logger.info(f"[{event}] {pair} {sid} → entry={entry} hit={hit_price} "
                f"style={style} leverage={leverage}x")

    signal_dir = os.path.join(PNL_CARD_DIR, str(sid))
    os.makedirs(signal_dir, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(signal_dir, f"{pair}_{event}_{ts}.png")

    update_at = sig.get("update_at")
    ts_iso = update_at.isoformat() if hasattr(update_at, "isoformat") else \
             datetime.now(timezone.utc).isoformat()

    ok = await render_card_with_retry(
        browser_context,
        style=style, symbol=pair, side=side, leverage=leverage,
        entry_price=entry, hit_price=hit_price,
        ts=ts_iso, out_path=out_path,
    )

    if not ok:
        logger.error(f"  ✗ update render permanently failed for {sid} {event}")
        if not dry_run:
            update_pnl_card_db(sid, status="error")
        return False

    if dry_run:
        logger.info(f"  ✓ DRY RUN — would save: {out_path}")
        return True

    # Cleanup older cards BEFORE updating the DB so we never reference a
    # path that was just unlinked.
    cleanup_previous_cards(sid, event)

    new_status = "complete" if sig.get("status") not in (None, "open") \
                            and event in ("tp4", "sl") else f"updated:{event}"

    update_pnl_card_db(
        sid,
        latest_path=out_path,
        status=new_status,
    )
    logger.info(f"  ✓ saved: {out_path}  status={new_status}")
    return True


# ============================================================
# MAIN LOOP
# ============================================================

async def run_one_batch(browser_context, dry_run=False):
    """Process one batch of entries + updates. Returns count of processed items."""
    processed = 0

    entries = get_pending_entries()
    for sig in entries:
        try:
            if await process_entry(browser_context, sig, dry_run=dry_run):
                processed += 1
        except Exception:
            logger.exception(f"entry failed for {sig.get('signal_id')}")

    updates = get_pending_updates()
    for sig in updates:
        try:
            if await process_update(browser_context, sig, dry_run=dry_run):
                processed += 1
        except Exception:
            logger.exception(f"update failed for {sig.get('signal_id')}")

    return processed


async def main_loop(dry_run=False):
    """Main poll loop. Keep browser context alive across batches for speed."""
    logger.info("=" * 60)
    logger.info(f"PnL Card Worker starting")
    logger.info(f"  poll interval: {POLL_INTERVAL}s")
    logger.info(f"  card dir:      {PNL_CARD_DIR}")
    logger.info(f"  renderer:      {RENDER_HTML}")
    logger.info(f"  dry-run:       {dry_run}")
    logger.info("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(device_scale_factor=2)
        try:
            while True:
                try:
                    count = await run_one_batch(ctx, dry_run=dry_run)
                    if count:
                        logger.info(f"batch processed {count} card(s)")
                except Exception:
                    logger.exception("batch failed")
                await asyncio.sleep(POLL_INTERVAL)
        finally:
            await ctx.close()
            await browser.close()


async def run_single(signal_id, dry_run=False):
    """Render card for one specific signal_id and exit. Used by tests."""
    sig = get_signal_by_id(signal_id)
    if not sig:
        logger.error(f"signal not found: {signal_id}")
        return 1

    logger.info(f"single-signal render: {signal_id} ({sig.get('pair')})")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(device_scale_factor=2)
        try:
            if "update_type" in sig:
                ok = await process_update(ctx, sig, dry_run=dry_run)
            else:
                ok = await process_entry(ctx, sig, dry_run=dry_run)
            return 0 if ok else 2
        finally:
            await ctx.close()
            await browser.close()


async def run_test_latest(n, dry_run=True):
    """Render cards for the N most-recent signals as a smoke test.
    Always dry-run by default — does NOT write to DB.
    """
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT s.signal_id, s.pair, s.entry,
                   s.target1, s.target2, s.target3, s.target4, s.stop1,
                   s.status, s.created_at,
                   s.pnl_leverage, s.pnl_style,
                   lu.update_type, lu.price AS hit_price, lu.update_at
            FROM signals s
            LEFT JOIN LATERAL (
                SELECT update_type, price, update_at
                FROM signal_updates
                WHERE signal_id = s.signal_id
                  AND update_type IN ('tp1','tp2','tp3','tp4','sl')
                ORDER BY update_at DESC LIMIT 1
            ) lu ON true
            WHERE s.pair IS NOT NULL AND s.entry IS NOT NULL
            ORDER BY s.created_at DESC
            LIMIT :n
        """), {"n": n}).fetchall()
    rows = [dict(r._mapping) for r in rows]

    if not rows:
        logger.error("no signals found")
        return 1

    logger.info(f"test-latest: rendering {len(rows)} signal(s) dry-run")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(device_scale_factor=2)
        ok_count = 0
        try:
            for sig in rows:
                logger.info("-" * 60)
                if sig.get("update_type"):
                    ok = await process_update(ctx, sig, dry_run=dry_run)
                else:
                    ok = await process_entry(ctx, sig, dry_run=dry_run)
                if ok:
                    ok_count += 1
        finally:
            await ctx.close()
            await browser.close()

    logger.info("=" * 60)
    logger.info(f"test-latest: {ok_count}/{len(rows)} succeeded")
    return 0 if ok_count == len(rows) else 2


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="LuxQuant PnL Card Worker")
    parser.add_argument("--loop", action="store_true",
                        help="Run forever, polling every POLL_INTERVAL")
    parser.add_argument("--signal-id",
                        help="Render only this signal_id, then exit")
    parser.add_argument("--test-latest", type=int, metavar="N",
                        help="Render N latest signals (dry-run, no DB)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip all DB writes; only render to disk")
    args = parser.parse_args()

    if args.test_latest:
        sys.exit(asyncio.run(run_test_latest(args.test_latest, dry_run=True)))
    if args.signal_id:
        sys.exit(asyncio.run(run_single(args.signal_id, dry_run=args.dry_run)))
    if args.loop:
        asyncio.run(main_loop(dry_run=args.dry_run))
        return
    # One-shot
    async def once():
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
            )
            ctx = await browser.new_context(device_scale_factor=2)
            try:
                count = await run_one_batch(ctx, dry_run=args.dry_run)
                logger.info(f"one-shot: processed {count}")
            finally:
                await ctx.close()
                await browser.close()
    asyncio.run(once())


if __name__ == "__main__":
    main()
