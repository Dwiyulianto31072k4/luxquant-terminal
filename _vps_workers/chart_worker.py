"""
LuxQuant Chart Worker
======================
Worker terpisah yang monitor database, screenshot chart via Lightweight Charts,
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
    pip install playwright Pillow psycopg2-binary sqlalchemy requests
    playwright install chromium
"""

import asyncio
import argparse
import os
import sys
import glob
import json
import logging
import requests as http_requests
from datetime import datetime, timezone
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
CHART_WAIT_SECONDS = 6
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
                   stop1, stop2, status, created_at
            FROM signals
            WHERE chart_status = 'pending'
              AND pair IS NOT NULL
              AND entry IS NOT NULL
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def get_pending_updates(limit=5):
    """Signal yang ada update baru yang belum di-screenshot.
    
    FIX: Ambil update TERBARU berdasarkan waktu (bukan ranking).
    Juga re-process signal 'complete' jika ada update lebih baru dari
    screenshot terakhir (case: SL hit dulu, terus TP hit setelahnya).
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
                        WHEN 'sl' THEN 1
                        ELSE 0
                    END DESC
            )
            SELECT 
                s.signal_id, s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
                s.stop1, s.stop2, s.status, s.created_at, s.chart_status,
                lu.update_type, lu.price, lu.update_at
            FROM signals s
            JOIN latest_update lu ON s.signal_id = lu.signal_id
            WHERE s.chart_status NOT IN ('pending', 'error')
              AND s.status NOT IN ('open')
              -- Pick if chart hasn't been updated to this event yet
              AND (
                  -- Normal case: chart_status doesn't match latest update
                  (s.chart_status = 'entry_done')
                  OR (s.chart_status LIKE 'updated:%%' 
                      AND s.chart_status != 'updated:' || lu.update_type)
                  -- Re-process complete if latest update is different from what was screenshotted
                  -- e.g. SL was screenshotted but TP4 came in later
                  OR (s.chart_status = 'complete' 
                      AND s.latest_chart_path IS NOT NULL
                      AND s.latest_chart_path NOT LIKE '%%_' || lu.update_type || '_%%')
              )
            ORDER BY lu.update_at DESC
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
                   stop1, stop2, status, created_at, chart_status
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
# BINANCE KLINE DATA
# ============================================================

def fetch_binance_klines(symbol, interval="1h", limit=200):
    """Fetch OHLCV data from Binance. Try futures first, fallback to spot."""
    urls = [
        "https://fapi.binance.com/fapi/v1/klines",
        "https://api.binance.com/api/v3/klines",
        "https://data-api.binance.vision/api/v3/klines",
    ]
    params = {"symbol": symbol, "interval": interval, "limit": limit}

    for url in urls:
        try:
            resp = http_requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            return [
                {
                    "time": int(k[0]) // 1000,
                    "open": float(k[1]),
                    "high": float(k[2]),
                    "low": float(k[3]),
                    "close": float(k[4]),
                    "volume": float(k[5]),
                }
                for k in data
            ]
        except Exception as e:
            logger.warning(f"Binance {url.split('/')[2]} failed for {symbol}: {e.__class__.__name__}")
            continue

    logger.error(f"All Binance endpoints failed for {symbol}")
    return None


def find_closest_candle_time(klines, target_dt):
    """Find the candle time closest to a target datetime."""
    if not klines or not target_dt:
        return None

    if hasattr(target_dt, 'timestamp'):
        target_ts = int(target_dt.timestamp())
    else:
        try:
            dt = datetime.fromisoformat(str(target_dt).replace('Z', '+00:00'))
            target_ts = int(dt.timestamp())
        except:
            return None

    closest = None
    min_diff = float('inf')
    for k in klines:
        diff = abs(k["time"] - target_ts)
        if diff < min_diff:
            min_diff = diff
            closest = k["time"]

    return closest


# ============================================================
# ACTUAL HIT CANDLE DETECTION
# ============================================================

def find_actual_hit_candle(klines, entry_time, target_price, direction="long"):
    """Find the FIRST candle after entry that actually reached the target price.
    
    For long TP: first candle where high >= target_price
    For short TP: first candle where low <= target_price
    For long SL: first candle where low <= sl_price
    For short SL: first candle where high >= sl_price
    """
    if not klines or not entry_time or not target_price:
        return None
    for k in klines:
        if k["time"] < entry_time:
            continue
        if direction == "long" and k["high"] >= target_price:
            return k["time"]
        elif direction == "short" and k["low"] <= target_price:
            return k["time"]
        elif direction == "sl_long" and k["low"] <= target_price:
            return k["time"]
        elif direction == "sl_short" and k["high"] >= target_price:
            return k["time"]
    return None


# ============================================================
# LIGHTWEIGHT CHARTS HTML
# ============================================================

def get_chart_html(klines, markers, entry_price=None, hit_price=None, event_type=None, pair=None, signal_data=None):
    """Generate HTML with Lightweight Charts, markers, and position visualization.
    
    Position visualization includes:
    - Green semi-transparent box for TP zone (entry → highest TP)
    - Red semi-transparent box for SL zone (entry → SL)
    - TP/SL labels on price axis only (no full-width lines)
    - Dashed white diagonal trade path from entry to actual hit candle
    - Solid arrowhead at diagonal end
    - Boxes start at entry candle time
    """
    candle_data = json.dumps(klines)
    volume_data = json.dumps([
        {
            "time": k["time"],
            "value": k["volume"],
            "color": "rgba(38, 166, 154, 0.5)" if k["close"] >= k["open"] else "rgba(239, 83, 80, 0.5)"
        }
        for k in klines
    ])
    markers_json = json.dumps(markers or [])

    # Dynamic price precision
    if entry_price and entry_price > 0:
        if entry_price < 0.0001:
            precision, min_move = 8, 0.00000001
        elif entry_price < 0.01:
            precision, min_move = 6, 0.000001
        elif entry_price < 1:
            precision, min_move = 4, 0.0001
        else:
            precision, min_move = 2, 0.01
    else:
        precision, min_move = 2, 0.01
    
    price_format_js = f"{{ type: 'price', precision: {precision}, minMove: {min_move} }}"
    pair_display = (pair or "???").replace("USDT", " / TetherUS PERPETUAL") + " · 30m · Binance"
    legend_precision = precision

    # === BUILD POSITION DATA ===
    position_data = {"entry": None, "targets": [], "stop": None, "hit": None}
    
    if signal_data and entry_price:
        created_at = signal_data.get("created_at")
        entry_time = find_closest_candle_time(klines, created_at) if klines and created_at else None
        if entry_time:
            position_data["entry"] = {"time": entry_time, "price": float(entry_price)}
        
        # Determine direction
        tp1 = signal_data.get("target1")
        is_long = tp1 and float(tp1) > float(entry_price)
        
        for i, key in enumerate(["target1", "target2", "target3", "target4"]):
            tp_val = signal_data.get(key)
            if tp_val:
                pct = ((float(tp_val) - float(entry_price)) / float(entry_price) * 100)
                position_data["targets"].append({
                    "label": f"TP{i+1}",
                    "price": float(tp_val),
                    "pct": f"+{pct:.1f}%",
                })
        
        sl_val = signal_data.get("stop1")
        if sl_val:
            position_data["stop"] = {"price": float(sl_val)}

        sl2_val = signal_data.get("stop2")
        if sl2_val:
            position_data["stop2"] = {"price": float(sl2_val)}
        
        # Find ACTUAL hit candle (by price, not DB update_at)
        if event_type and event_type != "entry" and entry_time and klines:
            if event_type.startswith("tp"):
                tp_map = {"tp1": "target1", "tp2": "target2", "tp3": "target3", "tp4": "target4"}
                target_price = float(signal_data.get(tp_map.get(event_type, "target1"), 0))
                direction = "long" if is_long else "short"
                actual_hit_time = find_actual_hit_candle(klines, entry_time, target_price, direction)
                if actual_hit_time:
                    position_data["hit"] = {"time": actual_hit_time, "price": target_price, "type": event_type}
            elif event_type == "sl":
                sl_price = float(signal_data.get("stop1", 0))
                direction = "sl_long" if is_long else "sl_short"
                actual_hit_time = find_actual_hit_candle(klines, entry_time, sl_price, direction)
                if actual_hit_time:
                    position_data["hit"] = {"time": actual_hit_time, "price": sl_price, "type": "sl"}

    position_json = json.dumps(position_data)
    last_candle_time = klines[-1]["time"] if klines else 0

    return f"""<!DOCTYPE html>
<html><head>
<style>
* {{ margin:0; padding:0; }}
body {{ background:#131722; width:1280px; height:720px; overflow:hidden; }}
#chart {{ width:1280px; height:720px; position:relative; }}
#legend {{
    position: absolute; top: 12px; left: 12px; z-index: 10;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
}}
#legend-pair {{ font-size: 14px; color: #d1d4dc; margin-bottom: 4px; }}
#legend-pair .exchange {{ color: #787b86; font-size: 12px; }}
#legend-ohlcv {{ font-size: 12px; color: #787b86; margin-bottom: 2px; }}
#legend-ohlcv .val {{ color: #d1d4dc; }}
#legend-ohlcv .up {{ color: #26a69a; }}
#legend-ohlcv .down {{ color: #ef5350; }}
#legend-vol {{ font-size: 12px; color: #787b86; }}
#legend-vol .val {{ color: #26a69a; }}
</style>
<script src="https://unpkg.com/lightweight-charts@5.0.5/dist/lightweight-charts.standalone.production.js"></script>
</head><body>
<div id="chart">
    <div id="legend">
        <div id="legend-pair">{pair_display}</div>
        <div id="legend-ohlcv"></div>
        <div id="legend-vol"></div>
    </div>
</div>
<script>
const chart = LightweightCharts.createChart(document.getElementById('chart'), {{
    width: 1280, height: 720,
    layout: {{ background: {{ type: 'solid', color: '#131722' }}, textColor: '#d1d4dc', fontSize: 13 }},
    grid: {{ vertLines: {{ color: 'rgba(42, 46, 57, 0.5)' }}, horzLines: {{ color: 'rgba(42, 46, 57, 0.5)' }} }},
    crosshair: {{ mode: LightweightCharts.CrosshairMode.Normal }},
    rightPriceScale: {{ borderColor: 'rgba(197, 203, 206, 0.3)' }},
    timeScale: {{ borderColor: 'rgba(197, 203, 206, 0.3)', timeVisible: true, secondsVisible: false }},
}});

const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {{
    upColor: '#26a69a', downColor: '#ef5350',
    borderDownColor: '#ef5350', borderUpColor: '#26a69a',
    wickDownColor: '#ef5350', wickUpColor: '#26a69a',
    priceFormat: {price_format_js},
}});
candleSeries.setData({candle_data});

const volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {{
    priceFormat: {{ type: 'volume' }}, priceScaleId: 'volume',
}});
chart.priceScale('volume').applyOptions({{ scaleMargins: {{ top: 0.8, bottom: 0 }} }});
volumeSeries.setData({volume_data});

const markers = {markers_json};
if (markers.length > 0) {{ LightweightCharts.createSeriesMarkers(candleSeries, markers); }}

// ============================================================
// POSITION VISUALIZATION v5
// ============================================================
const posData = {position_json};
const lastCandleTime = {last_candle_time};
const eventType = '{event_type or "entry"}';

if (posData.entry) {{

    // Price axis labels only (lineVisible: false = no chart-wide line)
    posData.targets.forEach((tp) => {{
        candleSeries.createPriceLine({{
            price: tp.price,
            color: 'rgba(0, 180, 80, 0.5)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: tp.label + ' ' + tp.pct,
            lineVisible: false,
        }});
    }});
    if (posData.stop) {{
        candleSeries.createPriceLine({{
            price: posData.stop.price,
            color: 'rgba(220, 50, 50, 0.5)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'SL',
            lineVisible: false,
        }});
    }}
    if (posData.stop2) {{
        candleSeries.createPriceLine({{
            price: posData.stop2.price,
            color: 'rgba(220, 50, 50, 0.9)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: 'SL2',
            lineVisible: true,
        }});
    }}

    class PositionPrimitive {{
        constructor(data) {{ this._data = data; this._chart = null; this._series = null; this._paneViews = [new PositionPaneView(this)]; }}
        attached(param) {{ this._chart = param.chart; this._series = param.series; }}
        detached() {{ this._chart = null; this._series = null; }}
        updateAllViews() {{ this._paneViews.forEach(v => v.update(this)); }}
        paneViews() {{ return this._paneViews; }}
        getChart() {{ return this._chart; }}
        getSeries() {{ return this._series; }}
        getData() {{ return this._data; }}
    }}

    class PositionPaneView {{
        constructor(source) {{ this._source = source; }}
        update() {{}}
        renderer() {{ return new PositionRenderer(this._source); }}
        zOrder() {{ return 'bottom'; }}
    }}

    class PositionRenderer {{
        constructor(source) {{ this._source = source; }}
        draw(target) {{
            target.useBitmapCoordinateSpace(scope => {{
                const ctx = scope.context;
                const chart = this._source.getChart();
                const series = this._source.getSeries();
                const data = this._source.getData();
                if (!chart || !series || !data.entry) return;

                const timeScale = chart.timeScale();
                const r = scope.horizontalPixelRatio;
                const vr = scope.verticalPixelRatio;

                const eX = timeScale.timeToCoordinate(data.entry.time);
                const eY = series.priceToCoordinate(data.entry.price);
                if (eX === null || eY === null) return;

                // Right edge of boxes
                let rX;
                if (data.hit && data.hit.time) {{
                    rX = timeScale.timeToCoordinate(data.hit.time);
                    if (rX !== null) rX += 15;
                }} else {{
                    const vis = timeScale.getVisibleRange();
                    if (vis) {{
                        const fX = timeScale.timeToCoordinate(vis.from);
                        const tX = timeScale.timeToCoordinate(vis.to);
                        if (fX !== null && tX !== null) rX = eX + (tX - fX) * 0.3;
                        else rX = eX + 200;
                    }} else rX = eX + 200;
                }}
                if (rX === null) rX = eX + 200;
                if (rX - eX < 30) rX = eX + 120;

                const bW = (rX - eX) * r;

                // === TP ZONE (green box) ===
                if (data.targets && data.targets.length > 0) {{
                    const htpY = series.priceToCoordinate(data.targets[data.targets.length - 1].price);
                    if (htpY !== null) {{
                        const top = Math.min(eY, htpY);
                        const bot = Math.max(eY, htpY);
                        const h = (bot - top) * vr;
                        ctx.fillStyle = 'rgba(0, 180, 80, 0.07)';
                        ctx.fillRect(eX * r, top * vr, bW, h);
                        ctx.strokeStyle = 'rgba(0, 180, 80, 0.35)';
                        ctx.lineWidth = 1 * r;
                        ctx.setLineDash([]);
                        ctx.strokeRect(eX * r, top * vr, bW, h);
                    }}

                    // TP level dashed lines inside box
                    data.targets.forEach(tp => {{
                        const tY = series.priceToCoordinate(tp.price);
                        if (tY !== null) {{
                            ctx.strokeStyle = 'rgba(0, 180, 80, 0.25)';
                            ctx.lineWidth = 1 * r;
                            ctx.setLineDash([3 * r, 4 * r]);
                            ctx.beginPath();
                            ctx.moveTo(eX * r, tY * vr);
                            ctx.lineTo(rX * r, tY * vr);
                            ctx.stroke();
                            ctx.setLineDash([]);
                        }}
                    }});
                }}

                // === SL ZONE (red box) ===
                if (data.stop) {{
                    const sY = series.priceToCoordinate(data.stop.price);
                    if (sY !== null) {{
                        const top = Math.min(eY, sY);
                        const bot = Math.max(eY, sY);
                        const h = (bot - top) * vr;
                        ctx.fillStyle = 'rgba(220, 50, 50, 0.07)';
                        ctx.fillRect(eX * r, top * vr, bW, h);
                        ctx.strokeStyle = 'rgba(220, 50, 50, 0.35)';
                        ctx.lineWidth = 1 * r;
                        ctx.setLineDash([]);
                        ctx.strokeRect(eX * r, top * vr, bW, h);

                        ctx.strokeStyle = 'rgba(220, 50, 50, 0.25)';
                        ctx.lineWidth = 1 * r;
                        ctx.setLineDash([3 * r, 4 * r]);
                        ctx.beginPath();
                        ctx.moveTo(eX * r, sY * vr);
                        ctx.lineTo(rX * r, sY * vr);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }}
                }}

                // === ENTRY line (subtle, box-width) ===
                ctx.strokeStyle = 'rgba(41, 98, 255, 0.35)';
                ctx.lineWidth = 1 * r;
                ctx.setLineDash([4 * r, 4 * r]);
                ctx.beginPath();
                ctx.moveTo(eX * r, eY * vr);
                ctx.lineTo(rX * r, eY * vr);
                ctx.stroke();
                ctx.setLineDash([]);

                // === TRADE PATH (dashed white + solid arrowhead) ===
                if (data.hit && data.hit.time && data.hit.price) {{
                    const hX = timeScale.timeToCoordinate(data.hit.time);
                    const hY = series.priceToCoordinate(data.hit.price);
                    if (hX !== null && hY !== null) {{
                        // Dashed white line
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                        ctx.lineWidth = 1 * r;
                        ctx.setLineDash([3 * r, 3 * r]);
                        ctx.beginPath();
                        ctx.moveTo(eX * r, eY * vr);
                        ctx.lineTo(hX * r, hY * vr);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // Solid arrowhead
                        const angle = Math.atan2((hY - eY) * vr, (hX - eX) * r);
                        const aLen = 8 * r;
                        const aW = 0.35;
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                        ctx.beginPath();
                        ctx.moveTo(hX * r, hY * vr);
                        ctx.lineTo(hX * r - aLen * Math.cos(angle - aW), hY * vr - aLen * Math.sin(angle - aW));
                        ctx.lineTo(hX * r - aLen * Math.cos(angle + aW), hY * vr - aLen * Math.sin(angle + aW));
                        ctx.closePath();
                        ctx.fill();
                    }}
                }}

                // === ENTRY DOT ===
                ctx.fillStyle = '#2962FF';
                ctx.beginPath();
                ctx.arc(eX * r, eY * vr, 5 * r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(41, 98, 255, 0.25)';
                ctx.lineWidth = 2 * r;
                ctx.beginPath();
                ctx.arc(eX * r, eY * vr, 9 * r, 0, Math.PI * 2);
                ctx.stroke();
            }});
        }}
    }}

    const posPrimitive = new PositionPrimitive(posData);
    candleSeries.attachPrimitive(posPrimitive);
}}

// === AUTO-SCALE: include all TP/SL levels with padding ===
if (posData.entry) {{
    // Upper bound is driven by entry/targets/SL1 only — SL2 must NOT push the
    // top down, so the candles and targets stay proportional.
    const topPrices = [posData.entry.price];
    if (posData.targets) posData.targets.forEach(tp => topPrices.push(tp.price));
    if (posData.stop) topPrices.push(posData.stop.price);

    const minPrice = Math.min(...topPrices);
    const maxPrice = Math.max(...topPrices);
    const range = maxPrice - minPrice || maxPrice * 0.05;
    const padding = range * 0.12;
    const scaleMax = maxPrice + padding;

    // Lower bound: normally minPrice - padding, but if SL2 sits below, drop the
    // floor just enough to show its line with a small gap (no extra slack above).
    let scaleMin = minPrice - padding;
    if (posData.stop2) {{
        scaleMin = Math.min(scaleMin, posData.stop2.price - range * 0.04);
    }}

    candleSeries.applyOptions({{
        autoscaleInfoProvider: (original) => {{
            const res = original();
            if (res !== null) {{
                if (res.priceRange) {{
                    res.priceRange.minValue = Math.min(res.priceRange.minValue, scaleMin);
                    res.priceRange.maxValue = Math.max(res.priceRange.maxValue, scaleMax);
                }} else {{
                    res.priceRange = {{ minValue: scaleMin, maxValue: scaleMax }};
                }}
            }}
            return res;
        }}
    }});
}}

chart.timeScale().fitContent();

// === SMART VISIBLE RANGE: put entry at ~55% from left, leave room on right for boxes ===
if (posData.entry) {{
    const totalBars = {candle_data}.length;
    // Find entry bar index
    let entryIdx = totalBars - 1;
    const entryT = posData.entry.time;
    for (let i = 0; i < totalBars; i++) {{
        if ({candle_data}[i].time >= entryT) {{ entryIdx = i; break; }}
    }}
    
    // We want entry at ~55% from left of visible area
    // And right side to have ~30% empty space after entry (for boxes)
    const barsBeforeEntry = Math.max(30, Math.floor(entryIdx * 0.4)); // show some history
    const barsAfterEntry = Math.max(25, totalBars - entryIdx + 15); // remaining candles + padding
    const rightPadding = Math.max(20, Math.floor(barsAfterEntry * 0.6)); // extra empty space for boxes
    
    const fromIdx = Math.max(0, entryIdx - barsBeforeEntry);
    const toIdx = totalBars - 1 + rightPadding;
    
    chart.timeScale().setVisibleLogicalRange({{ from: fromIdx - (totalBars - 1 - entryIdx + barsBeforeEntry) * 0.1, to: toIdx }});
    chart.timeScale().applyOptions({{ rightOffset: rightPadding }});
}} else {{
    chart.timeScale().applyOptions({{ rightOffset: 12 }});
}}

// Legend OHLCV
const allCandles = {candle_data};
if (allCandles.length > 0) {{
    const last = allCandles[allCandles.length - 1];
    const prev = allCandles.length > 1 ? allCandles[allCandles.length - 2] : last;
    const change = prev.close > 0 ? ((last.close - prev.close) / prev.close * 100) : 0;
    const changeStr = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
    const colorClass = change >= 0 ? 'up' : 'down';
    const fmt = (v) => v.toFixed({legend_precision});
    
    document.getElementById('legend-ohlcv').innerHTML = 
        `O <span class="val">${{fmt(last.open)}}</span> ` +
        `H <span class="val">${{fmt(last.high)}}</span> ` +
        `L <span class="val">${{fmt(last.low)}}</span> ` +
        `C <span class="val">${{fmt(last.close)}}</span> ` +
        `<span class="${{colorClass}}">${{changeStr}}</span>`;
    
    const vol = last.volume || 0;
    let volStr;
    if (vol >= 1e9) volStr = (vol/1e9).toFixed(2) + 'B';
    else if (vol >= 1e6) volStr = (vol/1e6).toFixed(2) + 'M';
    else if (vol >= 1e3) volStr = (vol/1e3).toFixed(2) + 'K';
    else volStr = vol.toFixed(2);
    
    document.getElementById('legend-vol').innerHTML = 
        `Vol <span class="val">${{volStr}}</span>`;
}}
</script>
</body></html>"""


def _get_tradingview_embed_html(tv_symbol, interval="60"):
    """Fallback: original TradingView embed widget (no markers/lines)."""
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


# ============================================================
# MARKERS
# ============================================================

def build_markers(signal_data, event_type, klines):
    """Build marker list for Lightweight Charts.
    
    - Entry: arrow ↑ biru dari bawah
    - TP hit: arrow ↓ hijau dari atas (at actual candle that hit the price)
    - SL hit: arrow ↓ merah dari atas (at actual candle that hit the price)
    """
    markers = []
    if not klines:
        return markers

    created_at = signal_data.get("created_at")
    entry_price = signal_data.get("entry")

    # Entry marker (always show)
    entry_time = find_closest_candle_time(klines, created_at)
    if entry_time:
        markers.append({
            "time": entry_time,
            "position": "belowBar",
            "color": "#2962FF",
            "shape": "arrowUp",
            "text": "Entry"
        })

    # TP/SL hit marker — find ACTUAL candle that hit the price
    if event_type != "entry" and entry_time and entry_price:
        tp1 = signal_data.get("target1")
        is_long = tp1 and float(tp1) > float(entry_price)

        if event_type.startswith("tp"):
            tp_map = {"tp1": "target1", "tp2": "target2", "tp3": "target3", "tp4": "target4"}
            target_price = float(signal_data.get(tp_map.get(event_type, "target1"), 0))
            direction = "long" if is_long else "short"
            hit_time = find_actual_hit_candle(klines, entry_time, target_price, direction)
            if hit_time:
                tp_label = event_type.upper().replace("TP", "TP ") + " Hit"
                markers.append({
                    "time": hit_time,
                    "position": "aboveBar",
                    "color": "#00C853",
                    "shape": "arrowDown",
                    "text": tp_label
                })
        elif event_type == "sl":
            sl_price = float(signal_data.get("stop1", 0))
            direction = "sl_long" if is_long else "sl_short"
            hit_time = find_actual_hit_candle(klines, entry_time, sl_price, direction)
            if hit_time:
                markers.append({
                    "time": hit_time,
                    "position": "aboveBar",
                    "color": "#FF5252",
                    "shape": "arrowDown",
                    "text": "SL Hit"
                })

    markers.sort(key=lambda m: m["time"])
    return markers


# ============================================================
# SCREENSHOT
# ============================================================

async def screenshot_chart(symbol, signal_id, event_type, signal_data=None):
    """Screenshot chart using Lightweight Charts with Binance data."""
    signal_dir = os.path.join(SCREENSHOT_DIR, str(signal_id))
    os.makedirs(signal_dir, exist_ok=True)

    # Fetch klines from Binance
    klines = fetch_binance_klines(symbol, interval="30m", limit=200)

    # Build markers & price line params
    markers = []
    entry_price = None
    hit_price = None
    if klines and signal_data:
        markers = build_markers(signal_data, event_type, klines)
        entry_price = signal_data.get("entry")
        if event_type != "entry":
            hit_price = signal_data.get("price")

    # Generate HTML
    if klines:
        html_content = get_chart_html(klines, markers,
                                      entry_price=entry_price,
                                      hit_price=hit_price,
                                      event_type=event_type,
                                      pair=symbol,
                                      signal_data=signal_data)
    else:
        # Fallback to TradingView embed if Binance fails
        tv_symbol = f"BINANCE:{symbol}.P"
        html_content = _get_tradingview_embed_html(tv_symbol)

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
    sl2 = signal_data.get("stop2")
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
        logo_ratio = logo_img.width / logo_img.height
        logo_w = int(logo_h * logo_ratio)
        logo_img = logo_img.resize((logo_w, logo_h), Image.LANCZOS)
        logo_y = (bar_height - logo_h) // 2
        if logo_img.mode == 'RGBA':
            img.paste(logo_img, (x, logo_y), logo_img)
        else:
            img.paste(logo_img, (x, logo_y))
        x += logo_w + 12
    except Exception:
        font_brand = make_font(22)
        draw.text((x, y_center - 12), "LuxQuant", fill=gold, font=font_brand)
        x += 140

    # Separator
    draw.line([(x, 12), (x, bar_height - 12)], fill=border_color, width=1)
    x += 15

    # Pair name - use actual text width
    pair_bbox = draw.textbbox((0, 0), pair, font=font_pair)
    pair_w = pair_bbox[2] - pair_bbox[0]
    draw.text((x, y_center - 11), pair, fill=white, font=font_pair)
    x += pair_w + 15

    # Event badge
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
    label_bbox = draw.textbbox((0, 0), event_label, font=font_badge)
    evt_w = (label_bbox[2] - label_bbox[0]) + 14
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

    # Hit markers must describe the image being rendered now, not the signal's
    # final/global status. Example: if a signal hit SL earlier but the latest
    # event is TP3, this TP3 image should mark TP1-TP3 only, not STOP LOSS.
    event_rank = {
        "tp1": 1,
        "tp2": 2,
        "tp3": 3,
        "tp4": 4,
        "closed_win": 4,
    }.get(event_type, 0)
    sl_hit = event_type in ("sl", "closed_loss")

    if tp1:
        x += draw_price_card(x, "TP1", tp1, green, event_rank >= 1)
    if tp2:
        x += draw_price_card(x, "TP2", tp2, green, event_rank >= 2)
    if tp3:
        x += draw_price_card(x, "TP3", tp3, green, event_rank >= 3)
    if tp4:
        x += draw_price_card(x, "TP4", tp4, green, event_rank >= 4)
    if sl:
        x += draw_price_card(x, "STOP LOSS", sl, red if sl_hit else (180, 80, 80), sl_hit)
    if sl2:
        # second stop, never marked hit, no percentage — just the level
        x += draw_price_card(x, "SL2", sl2, (180, 80, 80), False)
    x += draw_price_card(x, "ENTRY", entry_price, white)
    if hit_price and event_type != "entry":
        x += draw_price_card(x, "HIT PRICE", hit_price, gold)

    # Time (far right)
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

TP_ORDER = ("tp1", "tp2", "tp3", "tp4")

def cleanup_previous_screenshots(signal_id, event_type):
    """Hapus screenshot lama saat ada update baru.
    - Saat TP masuk: hapus SEMUA TP yang lebih rendah (bukan cuma satu sebelumnya)
      karena sinyal sering loncat TP (mis. tp2 -> tp4). Map lama {"tp4":"tp3"}
      cuma hapus tp3 sehingga tp2 + varian (_combined/_with_card/_cta) yatim.
    - Hapus SL kalau ada TP baru setelahnya.
    - Hapus semua TP kalau SL final.
    - JANGAN hapus entry (buat patokan bukti).
    """
    signal_dir = os.path.join(SCREENSHOT_DIR, str(signal_id))
    if not os.path.exists(signal_dir):
        return

    # Hapus SEMUA TP yang lebih rendah dari event sekarang
    if event_type in TP_ORDER:
        idx = TP_ORDER.index(event_type)
        for prev_tp in TP_ORDER[:idx]:
            for f in glob.glob(os.path.join(signal_dir, f"*_{prev_tp}_*.png")):
                if "_raw" not in f:
                    os.remove(f)
                    logger.info(f"  Deleted previous: {os.path.basename(f)}")

        # TP yang tercapai menyalip SL sebelumnya
        for f in glob.glob(os.path.join(signal_dir, f"*_sl_*.png")):
            if "_raw" not in f:
                os.remove(f)
                logger.info(f"  Deleted old SL: {os.path.basename(f)}")

    # Hapus TP lama kalau SL baru masuk (case: TP1 dulu, terus SL)
    if event_type == "sl":
        for tp in TP_ORDER:
            for f in glob.glob(os.path.join(signal_dir, f"*_{tp}_*.png")):
                if "_raw" not in f:
                    os.remove(f)
                    logger.info(f"  Deleted old {tp}: {os.path.basename(f)}")


# ============================================================
# PROCESS PIPELINES
# ============================================================

async def process_entry(signal):
    sid = signal["signal_id"]
    pair = signal["pair"]
    logger.info(f"[ENTRY] {pair} - capturing chart...")

    try:
        raw_path = await screenshot_chart(pair, sid, "entry", signal_data=signal)
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
    """Process update screenshot.
    
    FIX: event_type dari update_type query (ranked), bukan cuma signal.status.
    """
    sid = signal["signal_id"]
    pair = signal["pair"]
    status = signal["status"]

    # Use update_type from ranked query
    update_type = signal.get("update_type", "")
    if update_type in ('tp1', 'tp2', 'tp3', 'tp4', 'sl'):
        event_type = update_type
    elif status == "closed_win":
        event_type = "tp4"
    elif status == "closed_loss":
        event_type = "sl"
    else:
        event_type = status

    logger.info(f"[UPDATE] {pair} {event_type} (status={status}) - capturing chart...")

    try:
        raw_path = await screenshot_chart(pair, sid, event_type, signal_data=signal)
        signal_dir = os.path.join(SCREENSHOT_DIR, str(sid))
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        final_path = os.path.join(signal_dir, f"{pair}_{event_type}_{ts}.png")

        add_signal_overlay(raw_path, final_path, signal, event_type)
        os.remove(raw_path)
        cleanup_previous_screenshots(sid, event_type)

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
    elif signal["chart_status"] == "complete":
        # Re-process if latest update doesn't match screenshot
        update = get_latest_update(signal_id)
        if update:
            signal.update(update)
            path = signal.get("latest_chart_path") or ""
            utype = update.get("update_type", "")
            if utype and f"_{utype}_" not in path:
                logger.info(f"Re-processing: screenshot is {path}, but latest update is {utype}")
                await process_update(signal)
            else:
                logger.info(f"Signal {signal_id} already complete and up-to-date")
        else:
            logger.info(f"Signal {signal_id} already complete")
    else:
        logger.info(f"Signal {signal_id} - unknown chart_status: {signal['chart_status']}")


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
