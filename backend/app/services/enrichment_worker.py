"""
LuxQuant Enrichment Worker v2.3.1
================================
Worker terpisah yang monitor database untuk signal baru,
fetch OHLCV dari exchange, run multi-factor analysis,
dan store enrichment score ke database.

v2.3.1 fixes:
- Swing lookback 5→10 (reduce false positive pivots)
- Harmonic tolerance 10%→8% (balanced for crypto)
- Double top/bottom min 10 candle distance between peaks
- Fibonacci uses pivot-based swing, not global max/min
- Flag/Pennant threshold 0.005→0.01 (consistent with triangle)
- Gartley BC_AB ratio fixed to range (0.382-0.886)

v2.3 changes (from v2.2):
- Fibonacci Retracement + Extension analysis (entry near Fib level, TP alignment)
- Bull/Bear Flag & Pennant detection
- Harmonic XABCD pattern detection (Gartley, Bat, Butterfly, Crab)
- All integrated into pattern scoring

v2.2 changes:
- Real Pattern Detection (double top/bottom, triangle, wedge, channel, H&S)
- Real SMC Detection via smartmoneyconcepts (FVG, Order Block, Liquidity)
- Scoring functions updated untuk pattern + SMC

Usage:
    python3 enrichment_worker.py                           # process pending once
    python3 enrichment_worker.py --loop                    # run continuously
    python3 enrichment_worker.py --signal-id <uuid>        # process specific signal
    python3 enrichment_worker.py --backtest                # score all closed signals

Requirements:
    pip install pandas numpy ta ccxt psycopg2-binary sqlalchemy redis smartmoneyconcepts
"""

import asyncio
import argparse
import os
import sys
import json
import logging
import traceback
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

# ============================================================
# CONFIG
# ============================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)

POLL_INTERVAL = 30
BATCH_LIMIT = 10
ENRICHMENT_VERSION = "v2.3.1"

LOG_DIR = os.getenv("LOG_DIR", "/var/log/luxquant-sync")
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "enrichment-worker.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("enrichment-worker")

engine = create_engine(DATABASE_URL, future=True)


# ============================================================
# HELPERS
# ============================================================

def _json(obj) -> str:
    def _default(o):
        if isinstance(o, (np.bool_,)):
            return bool(o)
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, (np.ndarray,)):
            return o.tolist()
        if isinstance(o, datetime):
            return o.isoformat()
        return str(o)
    return json.dumps(obj, default=_default)


# ============================================================
# SECTION 1: DATABASE QUERIES
# ============================================================

def get_pending_signals(limit: int = 10) -> list:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, risk_level, created_at
            FROM signals
            WHERE enrichment_status = 'pending'
              AND pair IS NOT NULL AND entry IS NOT NULL
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def get_changed_signals(limit: int = 10) -> list:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT s.signal_id, s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
                   s.stop1, s.status, s.risk_level, s.created_at
            FROM signals s
            JOIN signal_enrichment e ON s.signal_id = e.signal_id
            WHERE s.enrichment_status = 'done'
              AND s.status IN ('tp1', 'tp2', 'tp3')
              AND e.analyzed_at < NOW() - INTERVAL '1 hour'
            ORDER BY s.created_at DESC LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def get_signal_by_id(signal_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, risk_level, created_at
            FROM signals WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()
    return dict(row._mapping) if row else None


def get_all_closed_signals() -> list:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, risk_level, created_at
            FROM signals
            WHERE status IN ('closed_win', 'closed_loss')
              AND pair IS NOT NULL AND entry IS NOT NULL
            ORDER BY created_at ASC
        """)).fetchall()
    return [dict(row._mapping) for row in rows]


def update_enrichment_status(signal_id: str, status: str):
    with engine.begin() as conn:
        conn.execute(text(
            "UPDATE signals SET enrichment_status = :status WHERE signal_id = :sid"
        ), {"status": status, "sid": signal_id})


def upsert_enrichment(result: dict):
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO signal_enrichment (
                signal_id, pair, confidence_score, rating, regime,
                score_breakdown, weights_used,
                mtf_h4_trend, mtf_h1_trend, mtf_m15_trend, signal_direction, mtf_detail,
                patterns_detected,
                smc_fvg_count, smc_ob_count, smc_sweep_count, smc_golden_setup, smc_detail,
                btc_trend, btc_dom_trend, fear_greed, atr_percentile,
                confluence_notes, warnings, analyzed_at, enrichment_version
            ) VALUES (
                :signal_id, :pair, :confidence_score, :rating, :regime,
                :score_breakdown, :weights_used,
                :mtf_h4_trend, :mtf_h1_trend, :mtf_m15_trend, :signal_direction, :mtf_detail,
                :patterns_detected,
                :smc_fvg_count, :smc_ob_count, :smc_sweep_count, :smc_golden_setup, :smc_detail,
                :btc_trend, :btc_dom_trend, :fear_greed, :atr_percentile,
                :confluence_notes, :warnings, :analyzed_at, :enrichment_version
            )
            ON CONFLICT (signal_id) DO UPDATE SET
                confidence_score = EXCLUDED.confidence_score,
                rating = EXCLUDED.rating,
                regime = EXCLUDED.regime,
                score_breakdown = EXCLUDED.score_breakdown,
                weights_used = EXCLUDED.weights_used,
                mtf_h4_trend = EXCLUDED.mtf_h4_trend,
                mtf_h1_trend = EXCLUDED.mtf_h1_trend,
                mtf_m15_trend = EXCLUDED.mtf_m15_trend,
                signal_direction = EXCLUDED.signal_direction,
                mtf_detail = EXCLUDED.mtf_detail,
                patterns_detected = EXCLUDED.patterns_detected,
                smc_fvg_count = EXCLUDED.smc_fvg_count,
                smc_ob_count = EXCLUDED.smc_ob_count,
                smc_sweep_count = EXCLUDED.smc_sweep_count,
                smc_golden_setup = EXCLUDED.smc_golden_setup,
                smc_detail = EXCLUDED.smc_detail,
                btc_trend = EXCLUDED.btc_trend,
                btc_dom_trend = EXCLUDED.btc_dom_trend,
                fear_greed = EXCLUDED.fear_greed,
                atr_percentile = EXCLUDED.atr_percentile,
                confluence_notes = EXCLUDED.confluence_notes,
                warnings = EXCLUDED.warnings,
                analyzed_at = EXCLUDED.analyzed_at,
                enrichment_version = EXCLUDED.enrichment_version
        """), result)


# ============================================================
# SECTION 2: OHLCV FETCHER
# ============================================================

import ccxt.async_support as ccxt_async

INTERVAL_MAP = {"15m": "15m", "1h": "1h", "4h": "4h"}


def _normalize_pair(pair: str) -> str:
    p = pair.upper().replace("/", "")
    if not p.endswith("USDT"):
        p = p + "USDT" if "USDT" not in p else p
    base = p.replace("USDT", "")
    return f"{base}/USDT"


async def fetch_ohlcv(pair: str, interval: str, limit: int = 150) -> pd.DataFrame:
    symbol = _normalize_pair(pair)
    tf = INTERVAL_MAP.get(interval, interval)

    for ExchangeClass in [ccxt_async.binance, ccxt_async.bybit]:
        exchange = ExchangeClass({"enableRateLimit": True})
        try:
            ohlcv = await exchange.fetch_ohlcv(symbol, tf, limit=limit)
            if not ohlcv:
                continue
            df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
            df["open_time"] = pd.to_datetime(df["timestamp"], unit="ms")
            df = df[["open_time", "open", "high", "low", "close", "volume"]].copy()
            for col in ["open", "high", "low", "close", "volume"]:
                df[col] = pd.to_numeric(df[col], errors="coerce")
            df = df.dropna(subset=["close"])
            if len(df) >= 50:
                return df
        except Exception as e:
            logger.debug(f"  {ExchangeClass.__name__} failed {symbol} {tf}: {e}")
        finally:
            await exchange.close()

    logger.warning(f"All exchanges failed for {pair} {interval}")
    return pd.DataFrame()


async def fetch_24h_volume(pair: str) -> float:
    symbol = _normalize_pair(pair)

    for ExchangeClass in [ccxt_async.binance, ccxt_async.bybit]:
        exchange = ExchangeClass({"enableRateLimit": True})
        try:
            ticker = await exchange.fetch_ticker(symbol)
            return float(ticker.get("quoteVolume", 0) or 0)
        except Exception as e:
            logger.debug(f"  Volume {ExchangeClass.__name__} {symbol}: {e}")
        finally:
            await exchange.close()

    logger.warning(f"Failed to fetch 24h volume for {pair}")
    return 0


# ============================================================
# SECTION 3: MARKET CONTEXT (Redis cache)
# ============================================================

def get_btc_context() -> dict:
    try:
        import redis
        r = redis.Redis(host="127.0.0.1", port=6379, decode_responses=True)

        btc_price_change = 0
        btc_data = r.get("lq:coingecko:coin-info:BTCUSDT")
        if btc_data:
            btc_price_change = json.loads(btc_data).get("price_change_percentage_24h", 0) or 0

        btc_dom_change = 0
        global_data = r.get("lq:market:global")
        if global_data:
            btc_dom_change = json.loads(global_data).get("btc_dominance_change_24h", 0) or 0

        fear_greed = None
        fg_data = r.get("lq:market:fear-greed")
        if fg_data:
            fear_greed = json.loads(fg_data).get("value")

        btc_trend = "BULLISH" if btc_price_change > 2 else ("BEARISH" if btc_price_change < -2 else "RANGING")
        btc_dom_trend = "RISING" if btc_dom_change > 0.3 else ("FALLING" if btc_dom_change < -0.3 else "FLAT")

        return {"btc_trend": btc_trend, "btc_dom_trend": btc_dom_trend,
                "fear_greed": int(fear_greed) if fear_greed else None}
    except Exception as e:
        logger.warning(f"Redis BTC context unavailable: {e}")
        return {"btc_trend": "RANGING", "btc_dom_trend": "FLAT", "fear_greed": None}


# ============================================================
# SECTION 4: TREND DETECTION
# ============================================================

def _detect_trend(df: pd.DataFrame) -> dict:
    import ta as ta_lib

    close, high, low = df["close"], df["high"], df["low"]

    ema20 = float(ta_lib.trend.ema_indicator(close, window=20).iloc[-1])
    ema50 = float(ta_lib.trend.ema_indicator(close, window=50).iloc[-1])
    atr_val = float(ta_lib.volatility.average_true_range(high, low, close, window=14).iloc[-1])
    rsi_val = float(ta_lib.momentum.rsi(close, window=14).iloc[-1])
    macd_hist = float(ta_lib.trend.macd_diff(close).iloc[-1])
    last_close = float(close.iloc[-1])

    ema_aligned = ema20 > ema50
    ema_gap_atr = abs(ema20 - ema50) / atr_val if atr_val > 0 else 0.0
    macd_norm = macd_hist / atr_val if atr_val > 0 else 0.0

    if ema_gap_atr < 0.5:
        trend = "RANGING"
    elif last_close > ema20 and ema_aligned:
        trend = "BULLISH"
    elif last_close < ema20 and not ema_aligned:
        trend = "BEARISH"
    else:
        trend = "RANGING"

    swing_high = float(high.rolling(20).max().iloc[-1])
    swing_low = float(low.rolling(20).min().iloc[-1])
    dist_res = (swing_high - last_close) / atr_val if atr_val > 0 else 999.0
    dist_sup = (last_close - swing_low) / atr_val if atr_val > 0 else 999.0
    near_res = dist_res < 1.0
    near_sup = dist_sup < 1.0

    key_level = None
    if near_res and (not near_sup or dist_res < dist_sup):
        key_level = "resistance"
    elif near_sup:
        key_level = "support"

    return {
        "trend": trend, "ema_aligned": ema_aligned,
        "ema_gap_atr": round(ema_gap_atr, 3), "rsi": round(rsi_val, 2),
        "macd_norm": round(macd_norm, 4), "atr": round(atr_val, 8),
        "near_key_level": near_res or near_sup, "key_level_type": key_level,
    }


# ============================================================
# SECTION 4B: CHART PATTERN DETECTION
# ============================================================

def _find_swing_points(df: pd.DataFrame, lookback: int = 10) -> tuple:
    highs, lows = [], []
    h, l = df["high"].values, df["low"].values

    for i in range(lookback, len(df) - lookback):
        if h[i] == max(h[i - lookback:i + lookback + 1]):
            highs.append({"idx": i, "price": float(h[i])})
        if l[i] == min(l[i - lookback:i + lookback + 1]):
            lows.append({"idx": i, "price": float(l[i])})

    return highs, lows


def _detect_double_top_bottom(highs, lows, last_close, atr):
    patterns = []
    tol = atr * 0.5

    for i in range(len(highs) - 1):
        for j in range(i + 1, min(i + 4, len(highs))):
            # Fix: peaks must be at least 10 candles apart to avoid false positives
            if highs[j]["idx"] - highs[i]["idx"] < 10:
                continue
            if abs(highs[i]["price"] - highs[j]["price"]) <= tol:
                idx_range = range(highs[i]["idx"], highs[j]["idx"] + 1)
                neckline_lows = [lw for lw in lows if lw["idx"] in idx_range]
                if neckline_lows:
                    neckline = min(nl["price"] for nl in neckline_lows)
                    confirmed = last_close < neckline
                    patterns.append({
                        "type": "double_top", "direction": "BEARISH",
                        "level": round((highs[i]["price"] + highs[j]["price"]) / 2, 8),
                        "neckline": round(neckline, 8),
                        "strength": "confirmed" if confirmed else "forming"
                    })

    for i in range(len(lows) - 1):
        for j in range(i + 1, min(i + 4, len(lows))):
            # Fix: troughs must be at least 10 candles apart
            if lows[j]["idx"] - lows[i]["idx"] < 10:
                continue
            if abs(lows[i]["price"] - lows[j]["price"]) <= tol:
                idx_range = range(lows[i]["idx"], lows[j]["idx"] + 1)
                neckline_highs = [hw for hw in highs if hw["idx"] in idx_range]
                if neckline_highs:
                    neckline = max(nh["price"] for nh in neckline_highs)
                    confirmed = last_close > neckline
                    patterns.append({
                        "type": "double_bottom", "direction": "BULLISH",
                        "level": round((lows[i]["price"] + lows[j]["price"]) / 2, 8),
                        "neckline": round(neckline, 8),
                        "strength": "confirmed" if confirmed else "forming"
                    })
    return patterns


def _detect_triangle_wedge(highs, lows, atr):
    patterns = []
    if len(highs) < 3 or len(lows) < 3:
        return patterns

    recent_highs = highs[-4:]
    recent_lows = lows[-4:]

    h_x = np.array([h["idx"] for h in recent_highs], dtype=float)
    h_y = np.array([h["price"] for h in recent_highs], dtype=float)
    l_x = np.array([l["idx"] for l in recent_lows], dtype=float)
    l_y = np.array([l["price"] for l in recent_lows], dtype=float)

    if len(h_x) >= 2 and len(l_x) >= 2:
        h_slope = float(np.polyfit(h_x, h_y, 1)[0])
        l_slope = float(np.polyfit(l_x, l_y, 1)[0])
        h_norm = h_slope / atr if atr > 0 else 0
        l_norm = l_slope / atr if atr > 0 else 0

        if h_norm < -0.01 and l_norm > 0.01:
            patterns.append({"type": "symmetrical_triangle", "direction": "NEUTRAL"})
        elif abs(h_norm) < 0.01 and l_norm > 0.01:
            patterns.append({"type": "ascending_triangle", "direction": "BULLISH"})
        elif abs(l_norm) < 0.01 and h_norm < -0.01:
            patterns.append({"type": "descending_triangle", "direction": "BEARISH"})
        elif h_norm > 0.01 and l_norm > 0.01 and l_norm > h_norm:
            patterns.append({"type": "rising_wedge", "direction": "BEARISH"})
        elif h_norm < -0.01 and l_norm < -0.01 and h_norm < l_norm:
            patterns.append({"type": "falling_wedge", "direction": "BULLISH"})
        elif h_norm > 0.01 and l_norm > 0.01 and abs(h_norm - l_norm) < 0.02:
            patterns.append({"type": "channel_up", "direction": "BULLISH"})
        elif h_norm < -0.01 and l_norm < -0.01 and abs(h_norm - l_norm) < 0.02:
            patterns.append({"type": "channel_down", "direction": "BEARISH"})

    return patterns


def _detect_head_shoulders(highs, lows, last_close, atr):
    patterns = []
    if len(highs) < 3:
        return patterns

    for i in range(len(highs) - 2):
        left, head, right = highs[i], highs[i + 1], highs[i + 2]
        if head["price"] > left["price"] and head["price"] > right["price"]:
            if abs(left["price"] - right["price"]) <= atr * 1.0:
                between_lows = [l for l in lows if left["idx"] < l["idx"] < right["idx"]]
                if between_lows:
                    neckline = min(l["price"] for l in between_lows)
                    confirmed = last_close < neckline
                    patterns.append({
                        "type": "head_and_shoulders", "direction": "BEARISH",
                        "head": round(head["price"], 8), "neckline": round(neckline, 8),
                        "strength": "confirmed" if confirmed else "forming"
                    })

    if len(lows) >= 3:
        for i in range(len(lows) - 2):
            left, head, right = lows[i], lows[i + 1], lows[i + 2]
            if head["price"] < left["price"] and head["price"] < right["price"]:
                if abs(left["price"] - right["price"]) <= atr * 1.0:
                    between_highs = [h for h in highs if left["idx"] < h["idx"] < right["idx"]]
                    if between_highs:
                        neckline = max(h["price"] for h in between_highs)
                        confirmed = last_close > neckline
                        patterns.append({
                            "type": "inverse_head_and_shoulders", "direction": "BULLISH",
                            "head": round(head["price"], 8), "neckline": round(neckline, 8),
                            "strength": "confirmed" if confirmed else "forming"
                        })
    return patterns


def _detect_flag_pennant(df: pd.DataFrame, atr: float) -> list:
    """Detect Bull/Bear Flag and Pennant: impulse + small consolidation."""
    patterns = []
    if len(df) < 30:
        return patterns

    close = df["close"].values
    high = df["high"].values
    low = df["low"].values

    for impulse_len in [15, 20, 25]:
        consol_len = 8
        if len(df) < impulse_len + consol_len:
            continue

        impulse_start = len(df) - impulse_len - consol_len
        impulse_end = len(df) - consol_len
        impulse_move = close[impulse_end - 1] - close[impulse_start]
        impulse_range = max(high[impulse_start:impulse_end]) - min(low[impulse_start:impulse_end])

        if abs(impulse_move) < 3 * atr:
            continue

        is_bull_impulse = impulse_move > 0

        consol_high = high[-consol_len:]
        consol_low = low[-consol_len:]
        consol_range = max(consol_high) - min(consol_low)

        if consol_range > impulse_range * 0.50:
            continue

        x = np.arange(consol_len, dtype=float)
        h_slope = float(np.polyfit(x, consol_high, 1)[0])
        l_slope = float(np.polyfit(x, consol_low, 1)[0])
        h_norm = h_slope / atr if atr > 0 else 0
        l_norm = l_slope / atr if atr > 0 else 0

        if is_bull_impulse:
            if h_norm < 0 and l_norm < 0 and abs(h_norm - l_norm) < 0.03:
                patterns.append({"type": "bull_flag", "direction": "BULLISH", "strength": "confirmed"})
                break
            elif h_norm < -0.01 and l_norm > 0.01:
                patterns.append({"type": "bull_pennant", "direction": "BULLISH", "strength": "confirmed"})
                break
        else:
            if h_norm > 0 and l_norm > 0 and abs(h_norm - l_norm) < 0.03:
                patterns.append({"type": "bear_flag", "direction": "BEARISH", "strength": "confirmed"})
                break
            elif h_norm < -0.01 and l_norm > 0.01:
                patterns.append({"type": "bear_pennant", "direction": "BEARISH", "strength": "confirmed"})
                break

    return patterns


# ── Harmonic XABCD Detection ──

HARMONIC_PATTERNS = {
    "gartley": {
        "AB_XA": (0.618, 0.618), "BC_AB": (0.382, 0.886),
        "CD_BC": (1.272, 1.618), "AD_XA": (0.786, 0.786),
    },
    "bat": {
        "AB_XA": (0.382, 0.500), "BC_AB": (0.382, 0.886),
        "CD_BC": (1.618, 2.618), "AD_XA": (0.886, 0.886),
    },
    "butterfly": {
        "AB_XA": (0.786, 0.786), "BC_AB": (0.382, 0.886),
        "CD_BC": (1.618, 2.618), "AD_XA": (1.270, 1.618),
    },
    "crab": {
        "AB_XA": (0.382, 0.618), "BC_AB": (0.382, 0.886),
        "CD_BC": (2.240, 3.618), "AD_XA": (1.618, 1.618),
    },
}

# Tolerance for ratio matching: 8% (balanced for crypto — 1% too strict, 15% too loose)
HARMONIC_TOLERANCE = 0.08


def _detect_harmonic_patterns(highs, lows, atr):
    """Detect XABCD harmonic patterns via Fibonacci ratio matching on swing pivots."""
    patterns = []

    # Build alternating pivot list
    all_pivots = []
    for h in highs:
        all_pivots.append({"idx": h["idx"], "price": h["price"], "type": "high"})
    for l in lows:
        all_pivots.append({"idx": l["idx"], "price": l["price"], "type": "low"})
    all_pivots.sort(key=lambda x: x["idx"])

    # Remove consecutive same-type pivots (keep most extreme)
    filtered = []
    for p in all_pivots:
        if filtered and filtered[-1]["type"] == p["type"]:
            if p["type"] == "high" and p["price"] > filtered[-1]["price"]:
                filtered[-1] = p
            elif p["type"] == "low" and p["price"] < filtered[-1]["price"]:
                filtered[-1] = p
        else:
            filtered.append(p)

    if len(filtered) < 5:
        return patterns

    tolerance = HARMONIC_TOLERANCE

    max_combos = min(8, len(filtered) - 4)
    for start in range(max(0, len(filtered) - max_combos - 4), len(filtered) - 4):
        X, A, B, C, D = filtered[start], filtered[start+1], filtered[start+2], filtered[start+3], filtered[start+4]

        xa = abs(A["price"] - X["price"])
        ab = abs(B["price"] - A["price"])
        bc = abs(C["price"] - B["price"])
        cd = abs(D["price"] - C["price"])
        ad = abs(D["price"] - X["price"])

        if xa == 0 or ab == 0 or bc == 0:
            continue

        ab_xa = ab / xa
        bc_ab = bc / ab
        cd_bc = cd / bc if bc > 0 else 0
        ad_xa = ad / xa

        direction = "BEARISH" if A["price"] > X["price"] else "BULLISH"

        for name, ratios in HARMONIC_PATTERNS.items():
            ab_ok = (ratios["AB_XA"][0] - tolerance) <= ab_xa <= (ratios["AB_XA"][1] + tolerance)
            bc_ok = (ratios["BC_AB"][0] - tolerance) <= bc_ab <= (ratios["BC_AB"][1] + tolerance)
            cd_ok = (ratios["CD_BC"][0] - tolerance) <= cd_bc <= (ratios["CD_BC"][1] + tolerance)
            ad_ok = (ratios["AD_XA"][0] - tolerance) <= ad_xa <= (ratios["AD_XA"][1] + tolerance)

            match_count = sum([ab_ok, bc_ok, cd_ok, ad_ok])

            if match_count >= 3:
                patterns.append({
                    "type": f"harmonic_{name}", "direction": direction,
                    "match_score": round(match_count / 4.0, 2),
                    "ratios": {"AB/XA": round(ab_xa, 3), "BC/AB": round(bc_ab, 3),
                               "CD/BC": round(cd_bc, 3), "AD/XA": round(ad_xa, 3)},
                    "d_price": round(D["price"], 8),
                    "strength": "confirmed" if match_count == 4 else "forming"
                })

    # Deduplicate: best match per pattern type
    seen = {}
    for p in patterns:
        key = p["type"]
        if key not in seen or p.get("match_score", 0) > seen[key].get("match_score", 0):
            seen[key] = p
    return list(seen.values())


# ── Fibonacci Retracement + Extension Analysis ──

FIB_RETRACEMENT_LEVELS = [0.236, 0.382, 0.500, 0.618, 0.786]
FIB_EXTENSION_LEVELS = [1.272, 1.618, 2.000, 2.618]


def analyze_fibonacci(df, entry_price, targets, stop, sig_dir, atr):
    """Check if entry aligns with Fib retracement and TPs with Fib extension.
    Uses pivot-based swing high/low (last significant swing), not global max/min."""
    result = {"entry_near_fib": False, "entry_fib_level": None, "tp_fib_aligned": 0, "fib_levels": {}, "detail": {}}

    if len(df) < 30 or atr == 0:
        return result

    # Use pivot-based swing detection (lookback=10) instead of global max/min
    highs, lows = _find_swing_points(df, lookback=10)
    if len(highs) < 1 or len(lows) < 1:
        return result

    # Find the most recent significant swing high and swing low
    # For BULLISH: we want the last swing low (bottom) and the swing high before it (top)
    # For BEARISH: we want the last swing high (top) and the swing low before it (bottom)
    if sig_dir == "BULLISH":
        # Last swing high = recent top, last swing low after it = retracement bottom
        swing_high = max(h["price"] for h in highs[-3:])  # best of last 3 swing highs
        swing_low = min(l["price"] for l in lows[-3:])     # best of last 3 swing lows
    else:
        swing_high = max(h["price"] for h in highs[-3:])
        swing_low = min(l["price"] for l in lows[-3:])

    swing_range = swing_high - swing_low

    if swing_range < atr * 0.5:
        return result

    fib_levels = {}
    if sig_dir == "BULLISH":
        for lvl in FIB_RETRACEMENT_LEVELS:
            fib_levels[f"ret_{lvl}"] = round(swing_high - (swing_range * lvl), 8)
        for lvl in FIB_EXTENSION_LEVELS:
            fib_levels[f"ext_{lvl}"] = round(swing_low + (swing_range * lvl), 8)
    else:
        for lvl in FIB_RETRACEMENT_LEVELS:
            fib_levels[f"ret_{lvl}"] = round(swing_low + (swing_range * lvl), 8)
        for lvl in FIB_EXTENSION_LEVELS:
            fib_levels[f"ext_{lvl}"] = round(swing_high - (swing_range * lvl), 8)

    result["fib_levels"] = fib_levels

    # Entry near Fib retracement?
    for name, fib_price in fib_levels.items():
        if not name.startswith("ret_"):
            continue
        if abs(entry_price - fib_price) <= atr * 1.0:
            result["entry_near_fib"] = True
            result["entry_fib_level"] = name.replace("ret_", "")
            break

    # TP targets align with Fib extension?
    tp_aligned = 0
    for tp in targets:
        if tp is None:
            continue
        tp_val = float(tp)
        for name, fib_price in fib_levels.items():
            if not name.startswith("ext_"):
                continue
            if abs(tp_val - fib_price) <= atr * 1.5:
                tp_aligned += 1
                break
    result["tp_fib_aligned"] = tp_aligned

    result["detail"]["swing_high"] = round(swing_high, 8)
    result["detail"]["swing_low"] = round(swing_low, 8)

    return result


def detect_patterns(df: pd.DataFrame, atr: float) -> list:
    """Run all pattern detection on a DataFrame."""
    if len(df) < 30:
        return []

    last_close = float(df["close"].iloc[-1])
    highs, lows = _find_swing_points(df, lookback=5)

    if len(highs) < 2 or len(lows) < 2:
        return []

    patterns = []
    patterns.extend(_detect_double_top_bottom(highs, lows, last_close, atr))
    patterns.extend(_detect_triangle_wedge(highs, lows, atr))
    patterns.extend(_detect_head_shoulders(highs, lows, last_close, atr))
    patterns.extend(_detect_flag_pennant(df, atr))
    patterns.extend(_detect_harmonic_patterns(highs, lows, atr))

    return patterns


# ============================================================
# SECTION 4C: SMC DETECTION (via smartmoneyconcepts library)
# ============================================================

def _prepare_smc_df(df):
    smc_df = df[["open", "high", "low", "close", "volume"]].copy()
    smc_df = smc_df.reset_index(drop=True)
    return smc_df


def detect_smc(df, entry_price, atr):
    result = {
        "fvg_count": 0, "ob_count": 0, "sweep_count": 0,
        "golden_setup": False,
        "fvg_near_entry": False, "ob_near_entry": False, "sweep_recent": False,
        "detail": {}
    }

    if len(df) < 50:
        return result

    try:
        from smartmoneyconcepts import smc
    except ImportError:
        logger.warning("smartmoneyconcepts not installed, skipping SMC detection")
        return result

    try:
        smc_df = _prepare_smc_df(df)

        # FVG
        fvg_data = smc.fvg(smc_df, join_consecutive=True)
        fvg_list = []
        if fvg_data is not None and "FVG" in fvg_data.columns:
            for idx, row in fvg_data.iterrows():
                if pd.notna(row.get("FVG")) and row["FVG"] != 0:
                    fvg_list.append({
                        "idx": int(idx),
                        "type": "bullish" if row["FVG"] == 1 else "bearish",
                        "top": float(row.get("Top", 0)),
                        "bottom": float(row.get("Bottom", 0)),
                        "mitigated": pd.notna(row.get("MitigatedIndex")),
                    })

        recent_fvg = [f for f in fvg_list if not f["mitigated"] and f["idx"] >= len(df) - 50]
        result["fvg_count"] = len(recent_fvg)

        for f in recent_fvg:
            mid = (f["top"] + f["bottom"]) / 2
            if abs(mid - entry_price) <= 2 * atr:
                result["fvg_near_entry"] = True
                break

        # Swing Highs/Lows
        swing_hl = smc.swing_highs_lows(smc_df, swing_length=10)

        # Order Block
        ob_data = smc.ob(smc_df, swing_highs_lows=swing_hl)
        ob_list = []
        if ob_data is not None and "OB" in ob_data.columns:
            for idx, row in ob_data.iterrows():
                if pd.notna(row.get("OB")) and row["OB"] != 0:
                    ob_list.append({
                        "idx": int(idx),
                        "type": "bullish" if row["OB"] == 1 else "bearish",
                        "top": float(row.get("Top", 0)),
                        "bottom": float(row.get("Bottom", 0)),
                        "mitigated": pd.notna(row.get("MitigatedIndex")),
                    })

        recent_ob = [o for o in ob_list if not o["mitigated"] and o["idx"] >= len(df) - 50]
        result["ob_count"] = len(recent_ob)

        for o in recent_ob:
            if o["bottom"] - 1.5 * atr <= entry_price <= o["top"] + 1.5 * atr:
                result["ob_near_entry"] = True
                break

        # Liquidity
        liq_data = smc.liquidity(smc_df, swing_highs_lows=swing_hl)
        sweep_list = []
        if liq_data is not None and "Liquidity" in liq_data.columns:
            for idx, row in liq_data.iterrows():
                if pd.notna(row.get("Liquidity")) and row["Liquidity"] != 0:
                    swept = pd.notna(row.get("SweptIndex")) if "SweptIndex" in liq_data.columns else False
                    sweep_list.append({
                        "idx": int(idx),
                        "type": "buy_side" if row["Liquidity"] == 1 else "sell_side",
                        "level": float(row.get("Level", 0)),
                        "swept": swept,
                    })

        recent_sweeps = [s for s in sweep_list if s["swept"] and s["idx"] >= len(df) - 30]
        result["sweep_count"] = len(recent_sweeps)
        result["sweep_recent"] = len(recent_sweeps) > 0

        if result["sweep_recent"] and result["fvg_near_entry"] and result["ob_near_entry"]:
            result["golden_setup"] = True

        result["detail"] = {
            "fvg_total": len(fvg_list), "fvg_unmitigated": len(recent_fvg),
            "ob_total": len(ob_list), "ob_unmitigated": len(recent_ob),
            "liquidity_levels": len(sweep_list), "sweeps_recent": len(recent_sweeps),
        }

    except Exception as e:
        logger.warning(f"SMC detection error: {e}")
        traceback.print_exc()

    return result


# ============================================================
# SECTION 5: SCORING FUNCTIONS
# ============================================================

def _score_mtf(h4, h1, sig_dir, max_pts):
    notes, score = [], 0
    if h4["trend"] == h1["trend"] == sig_dir:
        score += int(max_pts * 0.72); notes.append(f"Full MTF alignment ({sig_dir})")
    elif h4["trend"] == sig_dir:
        score += int(max_pts * 0.48); notes.append(f"H4 aligned ({sig_dir})")
    elif h1["trend"] == sig_dir and h4["trend"] == "RANGING":
        score += int(max_pts * 0.28); notes.append("H1 aligned, H4 ranging")
    elif h4["trend"] != "RANGING" and h4["trend"] != sig_dir:
        notes.append(f"⚠ Signal against H4 ({h4['trend']})")

    h4_ok = (h4["ema_aligned"] and sig_dir == "BULLISH") or (not h4["ema_aligned"] and sig_dir == "BEARISH")
    h1_ok = (h1["ema_aligned"] and sig_dir == "BULLISH") or (not h1["ema_aligned"] and sig_dir == "BEARISH")
    if h4_ok and h1_ok: score += int(max_pts * 0.16)
    elif h4_ok or h1_ok: score += int(max_pts * 0.08)

    if sig_dir == "BULLISH" and h4.get("near_key_level") and h4.get("key_level_type") == "resistance":
        p = int(max_pts * 0.32); score -= p; notes.append(f"⚠ Near H4 resistance (-{p})")
    elif sig_dir == "BEARISH" and h4.get("near_key_level") and h4.get("key_level_type") == "support":
        p = int(max_pts * 0.32); score -= p; notes.append(f"⚠ Near H4 support (-{p})")
    if h4["trend"] == "RANGING": score -= int(max_pts * 0.12)
    return (max(0, min(max_pts, score)), notes)


def _score_pattern(patterns, sig_dir, fib_result, max_pts):
    """Score chart patterns + Fibonacci confluence."""
    notes, score = [], 0

    if patterns:
        aligned = [p for p in patterns if p.get("direction") in (sig_dir, "NEUTRAL")]
        conflicting = [p for p in patterns if p.get("direction") not in (sig_dir, "NEUTRAL", None)]

        if aligned:
            confirmed = [p for p in aligned if p.get("strength") == "confirmed"]
            forming = [p for p in aligned if p.get("strength") != "confirmed"]
            harmonics = [p for p in aligned if "harmonic" in p.get("type", "")]

            if confirmed:
                score += int(max_pts * 0.35)
                names = [p["type"] for p in confirmed[:2]]
                notes.append(f"Confirmed: {', '.join(names)}")
            if forming:
                score += int(max_pts * 0.15)
                names = [p["type"] for p in forming[:2]]
                notes.append(f"Forming: {', '.join(names)}")
            if harmonics:
                best = max(harmonics, key=lambda x: x.get("match_score", 0))
                bonus = int(max_pts * 0.15 * best.get("match_score", 0.75))
                score += bonus
                notes.append(f"Harmonic: {best['type']} ({best.get('match_score', 0):.0%})")

        if conflicting:
            penalty = int(max_pts * 0.20)
            score -= penalty
            names = [p["type"] for p in conflicting[:2]]
            notes.append(f"⚠ Conflicting: {', '.join(names)}")

        if len(aligned) >= 2:
            score += int(max_pts * 0.10)
            notes.append("Multi-pattern confluence")
    else:
        notes.append("No chart patterns")

    # Fibonacci bonus
    if fib_result.get("entry_near_fib"):
        score += int(max_pts * 0.15)
        lvl = fib_result.get("entry_fib_level", "?")
        notes.append(f"Entry at Fib {lvl}")

    if fib_result.get("tp_fib_aligned", 0) >= 2:
        score += int(max_pts * 0.10)
        notes.append(f"TPs align Fib ext ({fib_result['tp_fib_aligned']})")
    elif fib_result.get("tp_fib_aligned", 0) == 1:
        score += int(max_pts * 0.05)

    return (max(0, min(max_pts, score)), notes)


def _score_smc(smc_result, sig_dir, max_pts):
    notes, score = [], 0

    if smc_result["golden_setup"]:
        return (max_pts, ["ICT Golden Setup (Sweep+FVG+OB)"])

    if smc_result["fvg_near_entry"]:
        score += int(max_pts * 0.35)
        notes.append(f"FVG near entry ({smc_result['fvg_count']})")
    elif smc_result["fvg_count"] > 0:
        score += int(max_pts * 0.10)

    if smc_result["ob_near_entry"]:
        score += int(max_pts * 0.30)
        notes.append(f"OB near entry ({smc_result['ob_count']})")
    elif smc_result["ob_count"] > 0:
        score += int(max_pts * 0.08)

    if smc_result["sweep_recent"]:
        score += int(max_pts * 0.25)
        notes.append(f"Liq sweep ({smc_result['sweep_count']})")

    if score == 0:
        notes.append("No SMC confluence")

    return (max(0, min(max_pts, score)), notes)


def _score_momentum(h4, h1, m15_df, sig_dir, max_pts):
    notes, score = [], 0
    is_bull = sig_dir == "BULLISH"
    rsi_h4, rsi_h1 = h4["rsi"], h1["rsi"]

    healthy = (35 < rsi_h4 < 70 and 35 < rsi_h1 < 70) if is_bull else (30 < rsi_h4 < 65 and 30 < rsi_h1 < 65)
    exhausted = rsi_h4 > 75 if is_bull else rsi_h4 < 25
    if healthy: score += int(max_pts * 0.20); notes.append(f"RSI healthy H4={rsi_h4:.0f} H1={rsi_h1:.0f}")
    if exhausted: score -= int(max_pts * 0.15); notes.append(f"⚠ RSI exhausted H4={rsi_h4:.0f}")

    macd_ok = (is_bull and h4["macd_norm"] > 0 and h1["macd_norm"] > 0) or \
              (not is_bull and h4["macd_norm"] < 0 and h1["macd_norm"] < 0)
    if macd_ok: score += int(max_pts * 0.20); notes.append("MACD confirms H4+H1")

    if (rsi_h4 < 65) != (h4["macd_norm"] > 0):
        score -= int(max_pts * 0.10); notes.append("⚠ RSI/MACD conflict")

    vol = m15_df["volume"]
    if len(vol) >= 20:
        vol_avg = float(vol.rolling(20).mean().iloc[-1])
        vol_ratio = float(vol.iloc[-1]) / vol_avg if vol_avg > 0 else 1.0
        if vol_ratio >= 2.0: score += int(max_pts * 0.25); notes.append(f"Volume spike {vol_ratio:.1f}x")
        elif vol_ratio >= 1.5: score += int(max_pts * 0.15)
        elif vol_ratio < 0.5: score -= int(max_pts * 0.12); notes.append(f"⚠ Low vol {vol_ratio:.1f}x")
        if len(vol) >= 3 and float(vol.iloc[-1]) > float(vol.iloc[-2]) > float(vol.iloc[-3]):
            score += int(max_pts * 0.10)
    return (max(0, min(max_pts, score)), notes)


def _score_context(btc_ctx, pair, sig_dir, max_pts):
    notes, score = [], int(max_pts * 0.50)
    is_bull = sig_dir == "BULLISH"
    bt, bd, fg = btc_ctx["btc_trend"], btc_ctx["btc_dom_trend"], btc_ctx.get("fear_greed")

    base = pair.upper().replace("USDT", "")
    if base == "BTC":
        if bt == sig_dir: score += int(max_pts * 0.50)
        elif bt not in ("RANGING", sig_dir): score -= int(max_pts * 0.40)
        return (max(0, min(max_pts, score)), notes)

    if is_bull:
        if bt == "BEARISH" and bd == "RISING": score -= int(max_pts * 0.50); notes.append("⚠ Risk-off regime")
        elif bt == "BULLISH" and bd == "FALLING": score += int(max_pts * 0.50); notes.append("Alt season conditions")
        elif bt == "BULLISH" and bd == "RISING": score += int(max_pts * 0.20)
    else:
        if bt == "BEARISH": score += int(max_pts * 0.30)
        elif bt == "BULLISH" and bd == "FALLING": score -= int(max_pts * 0.30)

    if fg is not None:
        if fg < 20 and is_bull: score += int(max_pts * 0.15); notes.append(f"Fear({fg}) contrarian")
        elif fg > 80 and is_bull: score -= int(max_pts * 0.15); notes.append(f"⚠ Greed({fg})")
    return (max(0, min(max_pts, score)), notes)


def _score_freshness(signal, atr_pct, max_pts):
    notes, score = [], int(max_pts * 0.50)
    created = signal.get("created_at")
    age_min = 60
    if created:
        try:
            if isinstance(created, str):
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            else:
                dt = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
            age_min = (datetime.now(timezone.utc) - dt).total_seconds() / 60
        except Exception:
            pass
    if age_min <= 15: score += int(max_pts * 0.25); notes.append(f"Fresh ({age_min:.0f}min)")
    elif age_min <= 60: score += int(max_pts * 0.10)
    elif age_min > 240: score -= int(max_pts * 0.25); notes.append(f"⚠ Stale ({age_min/60:.1f}hrs)")

    if atr_pct >= 85: score -= int(max_pts * 0.25); notes.append(f"⚠ Extreme vol (P{atr_pct:.0f})")
    elif 55 <= atr_pct <= 80: score += int(max_pts * 0.15)
    elif atr_pct <= 15: score -= int(max_pts * 0.20); notes.append(f"⚠ Too quiet (P{atr_pct:.0f})")
    return (max(0, min(max_pts, score)), notes)


# ============================================================
# SECTION 6: ENRICHMENT PIPELINE
# ============================================================

async def enrich_signal(signal: dict) -> dict:
    import ta as ta_lib

    sid, pair = signal["signal_id"], signal["pair"]
    logger.info(f"[ENRICH] {pair} ({sid[:8]}...) starting...")

    # Liquidity check
    volume_24h = await fetch_24h_volume(pair)
    if volume_24h < 100_000:
        logger.info(f"[ENRICH] {pair} SKIPPED — 24h vol ${volume_24h:,.0f} < $100k")
        return _build_skip_result(signal, f"Pair too illiquid (24h vol: ${volume_24h:,.0f})")
    liq_cap = 50 if volume_24h < 500_000 else (70 if volume_24h < 2_000_000 else 100)

    # OHLCV
    try:
        m15_df, h1_df, h4_df = await asyncio.gather(
            fetch_ohlcv(pair, "15m", 150), fetch_ohlcv(pair, "1h", 150), fetch_ohlcv(pair, "4h", 150))
    except Exception as e:
        return _build_skip_result(signal, f"OHLCV fetch failed: {e}")

    for label, df in [("M15", m15_df), ("H1", h1_df), ("H4", h4_df)]:
        if len(df) < 50:
            return _build_skip_result(signal, f"{label} insufficient ({len(df)} candles)")

    # Volatility regime
    atr_h4 = ta_lib.volatility.average_true_range(h4_df["high"], h4_df["low"], h4_df["close"], window=14)
    atr_pct = float((atr_h4.iloc[-min(100, len(atr_h4)):] < float(atr_h4.iloc[-1])).sum() / min(100, len(atr_h4)) * 100)

    if atr_pct >= 80:
        regime, weights = "high_vol", {"mtf": 30, "pattern": 15, "smc": 15, "momentum": 15, "context": 15, "fresh": 10}
    elif atr_pct <= 20:
        regime, weights = "low_vol", {"mtf": 20, "pattern": 15, "smc": 20, "momentum": 20, "context": 15, "fresh": 10}
    else:
        regime, weights = "normal", {"mtf": 25, "pattern": 20, "smc": 20, "momentum": 15, "context": 10, "fresh": 10}

    # Trends
    h4_info, h1_info, m15_info = _detect_trend(h4_df), _detect_trend(h1_df), _detect_trend(m15_df)

    # Direction
    entry = float(signal.get("entry") or 0)
    t1, s1 = signal.get("target1"), signal.get("stop1")
    sig_dir = "BULLISH"
    if t1 and float(t1) < entry: sig_dir = "BEARISH"
    elif s1 and float(s1) > entry: sig_dir = "BEARISH"

    btc_ctx = get_btc_context()

    # ── Pattern Detection (H1 + H4) ──
    h1_atr = float(h1_info["atr"]) if h1_info["atr"] else 0
    all_patterns = detect_patterns(h1_df, h1_atr)

    h4_atr = float(h4_info["atr"]) if h4_info["atr"] else 0
    h4_patterns = detect_patterns(h4_df, h4_atr)
    for p in h4_patterns:
        p["timeframe"] = "H4"
    for p in all_patterns:
        p["timeframe"] = "H1"
    all_patterns.extend(h4_patterns)

    # ── Fibonacci Analysis (H4) ──
    targets = [signal.get("target1"), signal.get("target2"),
               signal.get("target3"), signal.get("target4")]
    stop = signal.get("stop1")
    fib_result = analyze_fibonacci(h4_df, entry, targets, stop, sig_dir, h4_atr)

    # ── SMC Detection (M15 + H1) ──
    m15_atr = float(m15_info["atr"]) if m15_info["atr"] else 0
    smc_result = detect_smc(m15_df, entry, m15_atr)

    h1_smc = detect_smc(h1_df, entry, h1_atr)
    smc_result["fvg_count"] = max(smc_result["fvg_count"], h1_smc["fvg_count"])
    smc_result["ob_count"] = max(smc_result["ob_count"], h1_smc["ob_count"])
    smc_result["sweep_count"] = max(smc_result["sweep_count"], h1_smc["sweep_count"])
    smc_result["fvg_near_entry"] = smc_result["fvg_near_entry"] or h1_smc["fvg_near_entry"]
    smc_result["ob_near_entry"] = smc_result["ob_near_entry"] or h1_smc["ob_near_entry"]
    smc_result["sweep_recent"] = smc_result["sweep_recent"] or h1_smc["sweep_recent"]
    smc_result["golden_setup"] = smc_result["golden_setup"] or h1_smc["golden_setup"]

    # ── Score ──
    a, an = _score_mtf(h4_info, h1_info, sig_dir, weights["mtf"])
    b, bn = _score_pattern(all_patterns, sig_dir, fib_result, weights["pattern"])
    c, cn = _score_smc(smc_result, sig_dir, weights["smc"])
    d, dn = _score_momentum(h4_info, h1_info, m15_df, sig_dir, weights["momentum"])
    e, en = _score_context(btc_ctx, pair, sig_dir, weights["context"])
    f, fn = _score_freshness(signal, atr_pct, weights["fresh"])

    total = min(a + b + c + d + e + f, liq_cap)
    rating = "STRONG" if total >= 70 else "MODERATE" if total >= 55 else "WEAK" if total >= 40 else "LOW" if total >= 25 else "AVOID"
    all_notes = an + bn + cn + dn + en + fn
    warnings = [f"Low liquidity cap: {liq_cap}"] if liq_cap < 100 else []

    logger.info(f"[ENRICH] {pair} → score={total} rating={rating} regime={regime} "
                f"[mtf={a} pat={b} smc={c} mom={d} ctx={e} fresh={f}]")

    return {
        "signal_id": sid, "pair": pair, "confidence_score": total, "rating": rating, "regime": regime,
        "score_breakdown": _json({
            "mtf": {"score": a, "max": weights["mtf"]},
            "pattern": {"score": b, "max": weights["pattern"]},
            "smc": {"score": c, "max": weights["smc"]},
            "momentum": {"score": d, "max": weights["momentum"]},
            "context": {"score": e, "max": weights["context"]},
            "freshness": {"score": f, "max": weights["fresh"]},
        }),
        "weights_used": _json(weights),
        "mtf_h4_trend": h4_info["trend"], "mtf_h1_trend": h1_info["trend"], "mtf_m15_trend": m15_info["trend"],
        "signal_direction": sig_dir, "mtf_detail": _json({"h4": h4_info, "h1": h1_info, "m15": m15_info}),
        "patterns_detected": _json(all_patterns),
        "smc_fvg_count": smc_result["fvg_count"],
        "smc_ob_count": smc_result["ob_count"],
        "smc_sweep_count": smc_result["sweep_count"],
        "smc_golden_setup": smc_result["golden_setup"],
        "smc_detail": _json(smc_result["detail"]),
        "btc_trend": btc_ctx["btc_trend"], "btc_dom_trend": btc_ctx["btc_dom_trend"],
        "fear_greed": btc_ctx["fear_greed"], "atr_percentile": round(atr_pct, 1),
        "confluence_notes": " | ".join(all_notes[:8]),
        "warnings": warnings,
        "analyzed_at": datetime.now(timezone.utc), "enrichment_version": ENRICHMENT_VERSION,
    }


def _build_skip_result(signal, reason):
    return {
        "signal_id": signal["signal_id"], "pair": signal["pair"], "confidence_score": 0, "rating": "AVOID",
        "regime": "skip", "score_breakdown": _json({}), "weights_used": _json({}),
        "mtf_h4_trend": None, "mtf_h1_trend": None, "mtf_m15_trend": None, "signal_direction": None,
        "mtf_detail": _json({}), "patterns_detected": _json([]),
        "smc_fvg_count": 0, "smc_ob_count": 0, "smc_sweep_count": 0, "smc_golden_setup": False, "smc_detail": _json({}),
        "btc_trend": None, "btc_dom_trend": None, "fear_greed": None, "atr_percentile": None,
        "confluence_notes": reason, "warnings": [reason],
        "analyzed_at": datetime.now(timezone.utc), "enrichment_version": ENRICHMENT_VERSION,
    }


# ============================================================
# SECTION 7: MAIN
# ============================================================

async def process_signal(signal):
    try:
        update_enrichment_status(signal["signal_id"], "processing")
        result = await enrich_signal(signal)
        upsert_enrichment(result)
        update_enrichment_status(signal["signal_id"], "done")
        return True
    except Exception as e:
        logger.error(f"[ENRICH] {signal['pair']} FAILED: {e}")
        traceback.print_exc()
        update_enrichment_status(signal["signal_id"], "error")
        return False

async def run_once():
    n = 0
    for s in get_pending_signals(BATCH_LIMIT):
        if await process_signal(s): n += 1
        await asyncio.sleep(1)
    for s in get_changed_signals(BATCH_LIMIT):
        if await process_signal(s): n += 1
        await asyncio.sleep(1)
    return n

async def run_loop():
    logger.info(f"Enrichment Worker v{ENRICHMENT_VERSION} started — polling every {POLL_INTERVAL}s")
    while True:
        try:
            c = await run_once()
            if c > 0: logger.info(f"Processed {c} signals")
        except Exception as e:
            logger.error(f"Poll error: {e}"); traceback.print_exc()
        await asyncio.sleep(POLL_INTERVAL)

async def run_single(signal_id):
    s = get_signal_by_id(signal_id)
    if not s: logger.error(f"Signal {signal_id} not found"); return
    logger.info(f"Processing: {s['pair']} (status={s['status']})")
    await process_signal(s)

async def run_backtest():
    signals = get_all_closed_signals()
    logger.info(f"Backtest: {len(signals)} closed signals")
    results = []
    for i, s in enumerate(signals):
        try:
            r = await enrich_signal(s); upsert_enrichment(r)
            results.append({"score": r["confidence_score"], "rating": r["rating"], "outcome": s["status"]})
            if (i+1) % 10 == 0: logger.info(f"  progress: {i+1}/{len(signals)}")
            await asyncio.sleep(0.5)
        except Exception as e: logger.error(f"  error {s['pair']}: {e}")
    from collections import defaultdict
    tiers = defaultdict(lambda: {"total": 0, "wins": 0})
    for r in results:
        tiers[r["rating"]]["total"] += 1
        if r["outcome"] == "closed_win": tiers[r["rating"]]["wins"] += 1
    logger.info("=" * 50)
    logger.info("BACKTEST RESULTS")
    logger.info("=" * 50)
    for t in ["STRONG", "MODERATE", "WEAK", "LOW", "AVOID"]:
        d = tiers[t]; wr = (d["wins"]/d["total"]*100) if d["total"] > 0 else 0
        logger.info(f"  {t:10s}: {d['total']:4d} signals | {d['wins']:4d} wins | WR={wr:.1f}%")
    logger.info("=" * 50)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LuxQuant Enrichment Worker v2.3.1")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--signal-id", type=str)
    parser.add_argument("--backtest", action="store_true")
    args = parser.parse_args()
    if args.signal_id: asyncio.run(run_single(args.signal_id))
    elif args.backtest: asyncio.run(run_backtest())
    elif args.loop: asyncio.run(run_loop())
    else: asyncio.run(run_once())