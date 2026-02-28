"""
LuxQuant Chart Worker
======================
Worker terpisah yang monitor database, screenshot chart TradingView,
tambah overlay info signal, lalu update path ke database.

Flow:
  - Poll DB tiap 5 detik
  - Signal baru (chart_status='pending') → screenshot entry
  - Signal update (TP/SL hit, chart_status='entry_done') → screenshot update
  - Simpan path ke DB, update chart_status

Usage:
    # Run sekali
    /opt/luxquant/chart-worker-venv/bin/python chart_worker.py

    # Run terus (loop tiap 5 detik)
    /opt/luxquant/chart-worker-venv/bin/python chart_worker.py --loop

    # Run untuk signal tertentu
    /opt/luxquant/chart-worker-venv/bin/python chart_worker.py --signal-id abc123

Requirements (dalam venv):
    pip install playwright Pillow psycopg2-binary sqlalchemy
    playwright install chromium
"""

import asyncio
import argparse
import os
import sys
import glob
import logging
from datetime import datetime
from sqlalchemy import create_engine, text
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

# ============================================================
# CONFIG
# ============================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)
SCREENSHOT_DIR = "/opt/luxquant/screenshots"
CHART_WAIT_SECONDS = 8
POLL_INTERVAL = 5
BATCH_LIMIT = 5

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("/var/log/luxquant-sync/chart-worker.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("chart-worker")

engine = create_engine(DATABASE_URL, future=True)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


# ============================================================
# DATABASE QUERIES
# ============================================================

def get_pending_entries(limit=5):
    """Signal baru yang belum ada screenshot entry."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, created_at
            FROM signals
            WHERE chart_status = 'pending'
              AND pair IS NOT NULL
              AND entry IS NOT NULL
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def get_pending_updates(limit=5):
    """Signal yang sudah entry_done tapi status berubah sejak terakhir di-screenshot.
    chart_status format: 'entry_done', 'updated:tp1', 'updated:tp2', etc.
    Hanya pick signal yang status DB-nya BEDA dari yang terakhir di-chart."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DISTINCT ON (s.signal_id)
                s.signal_id, s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
                s.stop1, s.status, s.created_at, s.chart_status,
                u.update_type, u.price, u.update_at
            FROM signals s
            JOIN signal_updates u ON s.signal_id = u.signal_id
            WHERE s.chart_status NOT IN ('complete', 'pending', 'error')
              AND s.status NOT IN ('open')
              AND u.update_type IN ('tp1','tp2','tp3','tp4','sl')
              AND s.status != REPLACE(s.chart_status, 'updated:', '')
              AND s.chart_status != 'updated:' || 
                  CASE WHEN s.status = 'closed_win' THEN 'tp4'
                       WHEN s.status = 'closed_loss' THEN 'sl'
                       ELSE s.status END
            ORDER BY s.signal_id, u.update_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def update_chart_db(signal_id, entry_chart_path=None, latest_chart_path=None, chart_status=None):
    """Update chart paths dan status di database."""
    updates = []
    params = {"signal_id": signal_id}

    if entry_chart_path is not None:
        updates.append("entry_chart_path = :entry_path")
        params["entry_path"] = entry_chart_path
    if latest_chart_path is not None:
        updates.append("latest_chart_path = :latest_path")
        params["latest_path"] = latest_chart_path
    if chart_status is not None:
        updates.append("chart_status = :chart_status")
        params["chart_status"] = chart_status

    if not updates:
        return

    sql = f"UPDATE signals SET {', '.join(updates)} WHERE signal_id = :signal_id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def get_signal_by_id(signal_id):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, created_at, chart_status
            FROM signals WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()
    return dict(row._mapping) if row else None


def get_latest_update(signal_id):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT update_type, price, update_at
            FROM signal_updates
            WHERE signal_id = :sid
            ORDER BY update_at DESC LIMIT 1
        """), {"sid": signal_id}).fetchone()
    return dict(row._mapping) if row else None


# ============================================================
# TRADINGVIEW SCREENSHOT
# ============================================================

def get_chart_html(tv_symbol, interval="60"):
    return f"""<!DOCTYPE html>
<html><head><style>
* {{ margin:0; padding:0; }}
body {{ background:#131722; width:1280px; height:720px; overflow:hidden; }}
.tradingview-widget-container {{ height:100%; width:100%; }}
.tradingview-widget-container__widget {{ height:100%; width:100%; }}
</style></head><body>
<div class="tradingview-widget-container">
<div class="tradingview-widget-container__widget"></div>
<script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
{{
    "autosize": true,
    "symbol": "{tv_symbol}",
    "interval": "{interval}",
    "timezone": "Asia/Jakarta",
    "theme": "dark",
    "style": "1",
    "locale": "en",
    "allow_symbol_change": false,
    "hide_volume": false,
    "show_symbol_logo": true,
    "calendar": false,
    "hide_side_toolbar": true,
    "withdateranges": false,
    "details": false
}}
</script>
</div>
</body></html>"""


async def screenshot_chart(symbol, signal_id, event_type):
    tv_symbol = f"BINANCE:{symbol}.P"
    signal_dir = os.path.join(SCREENSHOT_DIR, str(signal_id))
    os.makedirs(signal_dir, exist_ok=True)

    html_content = get_chart_html(tv_symbol)
    html_path = os.path.abspath(os.path.join(signal_dir, "chart_temp.html"))
    with open(html_path, "w") as f:
        f.write(html_content)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-web-security', '--disable-gpu']
            )
            page = await browser.new_page(viewport={"width": 1280, "height": 720})
            await page.goto(f"file://{html_path}", wait_until="domcontentloaded")
            await page.wait_for_timeout(CHART_WAIT_SECONDS * 1000)

            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            raw_path = os.path.join(signal_dir, f"{symbol}_{event_type}_{ts}_raw.png")
            await page.screenshot(
                path=raw_path,
                clip={"x": 0, "y": 0, "width": 1280, "height": 720},
                timeout=15000
            )
            await browser.close()
            return raw_path
    except Exception as e:
        logger.error(f"Screenshot failed for {symbol}: {e}")
        raise
    finally:
        if os.path.exists(html_path):
            os.remove(html_path)


# ============================================================
# OVERLAY
# ============================================================

LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")

def add_signal_overlay(chart_path, output_path, signal_data, event_type="entry"):
    chart_img = Image.open(chart_path)
    chart_w, chart_h = chart_img.size

    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    font_path = None
    for fp in font_paths:
        if os.path.exists(fp):
            font_path = fp
            break

    def make_font(size):
        try:
            return ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default()
        except:
            return ImageFont.load_default()

    font_pair = make_font(20)
    font_badge = make_font(13)
    font_label = make_font(11)
    font_value = make_font(14)

    pair = signal_data.get("pair", "UNKNOWN")
    entry_price = signal_data.get("entry", 0)
    tp1 = signal_data.get("target1")
    tp2 = signal_data.get("target2")
    tp3 = signal_data.get("target3")
    tp4 = signal_data.get("target4")
    sl = signal_data.get("stop1")
    status = signal_data.get("status", "open")
    created_at = signal_data.get("created_at", "")
    hit_price = signal_data.get("price")
    update_at = signal_data.get("update_at", "")

    def fmt_price(p):
        if p is None: return "-"
        if p < 0.01: return f"${p:,.6f}"
        elif p < 1: return f"${p:,.4f}"
        elif p < 100: return f"${p:,.2f}"
        else: return f"${p:,.1f}"

    bg_primary = (10, 12, 20)
    gold = (212, 175, 55)
    gold_dim = (160, 130, 40)
    white = (240, 240, 240)
    green = (0, 200, 100)
    red = (220, 50, 50)
    gray = (120, 120, 140)
    border_color = (40, 44, 60)

    bar_height = 70
    img = Image.new('RGB', (chart_w, bar_height + chart_h), bg_primary)
    draw = ImageDraw.Draw(img, 'RGBA')

    draw.rectangle([(0, 0), (chart_w, bar_height)], fill=bg_primary)
    draw.line([(0, bar_height - 1), (chart_w, bar_height - 1)], fill=gold_dim, width=1)

    x = 10
    y_center = bar_height // 2

    # === LOGO IMAGE ===
    logo_h = 50
    try:
        logo_img = Image.open(LOGO_PATH)
        # Resize keeping aspect ratio
        logo_ratio = logo_img.width / logo_img.height
        logo_w = int(logo_h * logo_ratio)
        logo_img = logo_img.resize((logo_w, logo_h), Image.LANCZOS)
        # Paste logo (handle transparency)
        logo_y = (bar_height - logo_h) // 2
        if logo_img.mode == 'RGBA':
            img.paste(logo_img, (x, logo_y), logo_img)
        else:
            img.paste(logo_img, (x, logo_y))
        x += logo_w + 12
    except Exception:
        # Fallback to text if logo not found
        font_brand = make_font(22)
        draw.text((x, y_center - 12), "LuxQuant", fill=gold, font=font_brand)
        x += 140

    # Separator
    draw.line([(x, 12), (x, bar_height - 12)], fill=border_color, width=1)
    x += 15

    # Pair name
    draw.text((x, y_center - 11), pair, fill=white, font=font_pair)
    x += len(pair) * 12 + 12

    # Event badge (no LONG badge)
    badge_h = 20
    badge_y = y_center - badge_h // 2
    event_labels = {
        "entry": "ENTRY", "tp1": "TP1 HIT", "tp2": "TP2 HIT",
        "tp3": "TP3 HIT", "tp4": "TP4 HIT", "sl": "SL HIT",
        "closed_win": "TP4 HIT", "closed_loss": "SL HIT"
    }
    event_colors_map = {
        "entry": (41, 98, 255),
        "tp1": green, "tp2": green, "tp3": green, "tp4": green, "closed_win": green,
        "sl": red, "closed_loss": red
    }
    event_label = event_labels.get(event_type, event_type.upper())
    evt_color = event_colors_map.get(event_type, (100, 100, 100))
    evt_w = len(event_label) * 9 + 14
    draw.rectangle([(x, badge_y), (x + evt_w, badge_y + badge_h)], fill=evt_color)
    draw.text((x + 7, badge_y + 3), event_label, fill=white, font=font_badge)
    x += evt_w + 20

    # Separator
    draw.line([(x, 12), (x, bar_height - 12)], fill=border_color, width=1)
    x += 15

    # Price cards
    def draw_price_card(x_pos, label, price, color=white, is_hit=False):
        draw.text((x_pos, 10), label, fill=gray, font=font_label)
        val_text = fmt_price(price) if price else "-"
        if is_hit:
            val_text += " ✓"
        draw.text((x_pos, 28), val_text, fill=color, font=font_value)
        if is_hit:
            draw.line([(x_pos, 48), (x_pos + 75, 48)], fill=green, width=2)
        return 90

    # TP targets first
    if tp1:
        x += draw_price_card(x, "TP1", tp1, green, status in ["tp1", "tp2", "tp3", "closed_win"])
    if tp2:
        x += draw_price_card(x, "TP2", tp2, green, status in ["tp2", "tp3", "closed_win"])
    if tp3:
        x += draw_price_card(x, "TP3", tp3, green, status in ["tp3", "closed_win"])
    if tp4:
        x += draw_price_card(x, "TP4", tp4, green, status == "closed_win")
    # SL
    if sl:
        sl_hit = status == "closed_loss"
        x += draw_price_card(x, "STOP LOSS", sl, red if sl_hit else (180, 80, 80), sl_hit)
    # Entry (moved to right side)
    x += draw_price_card(x, "ENTRY", entry_price, white)
    # Hit price
    if hit_price and event_type != "entry":
        x += draw_price_card(x, "HIT PRICE", hit_price, gold)

    # Time (far right, no TF:1H)
    ts_display = update_at if event_type != "entry" else created_at
    if ts_display:
        ts_short = str(ts_display)[:16]
        draw.text((chart_w - 150, 10), "TIME", fill=gray, font=font_label)
        draw.text((chart_w - 150, 28), ts_short, fill=white, font=font_value)

    # Paste chart below
    img.paste(chart_img, (0, bar_height))
    img.save(output_path, "PNG", quality=95)
    return output_path


# ============================================================
# CLEANUP
# ============================================================

TP_CLEANUP_MAP = {"tp2": "tp1", "tp3": "tp2", "tp4": "tp3"}

def cleanup_previous_tp(signal_id, event_type):
    if event_type not in TP_CLEANUP_MAP:
        return
    prev_tp = TP_CLEANUP_MAP[event_type]
    signal_dir = os.path.join(SCREENSHOT_DIR, str(signal_id))
    if not os.path.exists(signal_dir):
        return
    for f in glob.glob(os.path.join(signal_dir, f"*_{prev_tp}_*.png")):
        if "_raw" not in f:
            os.remove(f)
            logger.info(f"  Deleted previous: {os.path.basename(f)}")


# ============================================================
# PROCESS PIPELINES
# ============================================================

async def process_entry(signal):
    sid = signal["signal_id"]
    pair = signal["pair"]
    logger.info(f"[ENTRY] {pair} - capturing chart...")

    try:
        raw_path = await screenshot_chart(pair, sid, "entry")
        signal_dir = os.path.join(SCREENSHOT_DIR, str(sid))
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        final_path = os.path.join(signal_dir, f"{pair}_entry_{ts}.png")

        add_signal_overlay(raw_path, final_path, signal, "entry")
        os.remove(raw_path)

        update_chart_db(sid, entry_chart_path=final_path, chart_status="entry_done")
        logger.info(f"[ENTRY] {pair} - done: {final_path}")
        return True
    except Exception as e:
        logger.error(f"[ENTRY] {pair} - FAILED: {e}")
        update_chart_db(sid, chart_status="error")
        return False


async def process_update(signal):
    sid = signal["signal_id"]
    pair = signal["pair"]
    status = signal["status"]

    if status == "closed_win":
        event_type = "tp4"
    elif status == "closed_loss":
        event_type = "sl"
    else:
        event_type = status

    logger.info(f"[UPDATE] {pair} {event_type} - capturing chart...")

    try:
        raw_path = await screenshot_chart(pair, sid, event_type)
        signal_dir = os.path.join(SCREENSHOT_DIR, str(sid))
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        final_path = os.path.join(signal_dir, f"{pair}_{event_type}_{ts}.png")

        add_signal_overlay(raw_path, final_path, signal, event_type)
        os.remove(raw_path)
        cleanup_previous_tp(sid, event_type)

        if status in ("closed_win", "closed_loss"):
            chart_status = "complete"
        else:
            chart_status = f"updated:{event_type}"

        update_chart_db(sid, latest_chart_path=final_path, chart_status=chart_status)
        logger.info(f"[UPDATE] {pair} {event_type} - done: {final_path}")
        return True
    except Exception as e:
        logger.error(f"[UPDATE] {pair} {event_type} - FAILED: {e}")
        return False


# ============================================================
# MAIN
# ============================================================

async def run_once():
    processed = 0

    entries = get_pending_entries(limit=BATCH_LIMIT)
    for signal in entries:
        if await process_entry(signal):
            processed += 1

    updates = get_pending_updates(limit=BATCH_LIMIT)
    for signal in updates:
        if await process_update(signal):
            processed += 1

    return processed


async def run_loop():
    logger.info(f"Chart Worker started - polling every {POLL_INTERVAL}s")
    logger.info(f"Screenshots: {SCREENSHOT_DIR}")

    while True:
        try:
            count = await run_once()
            if count > 0:
                logger.info(f"Processed {count} signals")
        except Exception as e:
            logger.error(f"Poll error: {e}")

        await asyncio.sleep(POLL_INTERVAL)


async def run_single(signal_id):
    signal = get_signal_by_id(signal_id)
    if not signal:
        logger.error(f"Signal {signal_id} not found")
        return

    logger.info(f"Processing: {signal['pair']} (status={signal['status']}, chart={signal['chart_status']})")

    if signal["chart_status"] in ("pending", "error"):
        await process_entry(signal)
    elif signal["chart_status"].startswith("updated:") or signal["chart_status"] == "entry_done":
        update = get_latest_update(signal_id)
        if update:
            signal.update(update)
        await process_update(signal)
    else:
        logger.info(f"Signal {signal_id} already complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LuxQuant Chart Worker")
    parser.add_argument("--loop", action="store_true", help="Run continuously")
    parser.add_argument("--signal-id", type=str, help="Process specific signal ID")
    args = parser.parse_args()

    if args.signal_id:
        asyncio.run(run_single(args.signal_id))
    elif args.loop:
        asyncio.run(run_loop())
    else:
        asyncio.run(run_once())
