"""
LuxQuant Enrichment Service v3.0 — Facts + Tags
================================================
Pure logic untuk generate snapshot {facts, tags, metadata} dari signal + OHLCV.
NO scoring, NO rating, NO judgment — hanya raw facts dan descriptive tags.

Dipakai oleh:
- enrichment_worker_v3.py (entry mode, saat signal pertama masuk)
- live_refresher_v3.py (live mode, refresh tiap 5 menit untuk signal aktif)

Reuse fungsi detection dari enrichment_worker.py v2.3.1:
- _detect_trend, detect_patterns, detect_smc, analyze_fibonacci

Tag baru di v3:
- HTF Bias, MTF alignment, RSI divergence, ADX, Bollinger,
  Funding rate, BTC dominance trend, F&G

Author: LuxQuant Team
Version: v3.0
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
import redis
import requests
import ta as ta_lib

# Reuse detection functions from v2.3.1 worker
from app.services.enrichment_worker import (
    _detect_trend,
    detect_patterns,
    detect_smc,
    analyze_fibonacci,
)

logger = logging.getLogger("enrichment-v3")

# ============================================================
# CONSTANTS & CONFIG
# ============================================================

ENRICHMENT_VERSION = "v3.0"

# Redis keys (verified from VPS investigation)
REDIS_BTC_TICKER_KEY = "lq:market:btc-ticker"
REDIS_GLOBAL_KEY = "lq:market:global"
REDIS_FUNDING_KEY = "lq:market:funding-rates"
REDIS_DOM_HISTORY_KEY = "lq:enrichment:dom_history"
REDIS_FNG_CACHE_KEY = "lq:enrichment:fng_cache"

# Thresholds
FNG_CACHE_TTL = 600  # 10 minutes
DOM_HISTORY_RETENTION_HOURS = 25
DOM_TREND_THRESHOLD = 0.3  # delta % to call rising/falling

# Tag visibility classification (for UI default vs expand)
IMPORTANT_TAGS = {
    # HTF Bias
    "HTF_BIAS_BULLISH", "HTF_BIAS_BEARISH", "HTF_BIAS_NEUTRAL",
    "HTF_TREND_STRONG", "HTF_TREND_EXHAUSTED",
    # MTF
    "MTF_FULL_ALIGNED", "MTF_LTF_ALIGNED", "MTF_AGAINST_HTF",
    # Critical momentum
    "RSI_OVERBOUGHT_H1", "RSI_OVERSOLD_H1",
    "RSI_BULL_DIV_H1", "RSI_BEAR_DIV_H1",
    "RSI_HIDDEN_BULL_H1", "RSI_HIDDEN_BEAR_H1",
    # Volume signals
    "VOL_SPIKE_2X", "VOL_SPIKE_3X", "VOL_CLIMAX",
    # Entry quality (warnings)
    "LATE_ENTRY", "OVEREXTENDED", "PARABOLIC", "EXHAUSTION_CANDLE",
    "FRESH_BREAKOUT", "DEEP_PULLBACK",
    # Structure (high value)
    "SMC_GOLDEN_SETUP", "FVG_NEAR_ENTRY", "OB_NEAR_ENTRY",
    "PATTERN_BULLISH", "PATTERN_BEARISH", "HARMONIC_DETECTED",
    # Levels
    "BROKE_RESISTANCE_RECENT", "BROKE_SUPPORT_RECENT",
    "AT_FIB_GOLDEN_ZONE",
    # BB
    "BB_SQUEEZE_H1", "BB_EXPANSION_H1",
    # Context
    "BTC_BULLISH", "BTC_BEARISH", "BTC_VOLATILE",
    "ALT_SEASON_HINT", "RISK_OFF_REGIME",
    "FUNDING_HEAVY_LONG", "FUNDING_HEAVY_SHORT",
    # Environment warnings
    "VOL_REGIME_HIGH", "FNG_EXTREME_FEAR", "FNG_EXTREME_GREED",
    "LIQ_VERY_LOW", "LIQ_LOW",
}


# ============================================================
# JSON HELPER (handle numpy types)
# ============================================================

def _to_jsonable(obj):
    """Convert numpy/pandas types to JSON-serializable Python types."""
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        f = float(obj)
        return f if not (np.isnan(f) or np.isinf(f)) else None
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, float):
        return obj if not (np.isnan(obj) or np.isinf(obj)) else None
    return obj


def _safe_float(val, default=None):
    """Safely convert to float, return default if NaN/Inf/None."""
    if val is None:
        return default
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return default
        return round(f, 8)
    except (TypeError, ValueError):
        return default


# ============================================================
# INDICATOR HELPERS (new in v3)
# ============================================================

def compute_adx(df: pd.DataFrame, period: int = 14) -> Optional[float]:
    """Compute ADX (trend strength) for a dataframe."""
    if len(df) < period * 2:
        return None
    try:
        adx = ta_lib.trend.adx(df["high"], df["low"], df["close"], window=period)
        val = adx.iloc[-1]
        return _safe_float(val)
    except Exception as e:
        logger.debug(f"ADX compute failed: {e}")
        return None


def compute_bollinger(df: pd.DataFrame, period: int = 20) -> dict:
    """Compute Bollinger Bands and width metrics."""
    result = {
        "upper": None, "middle": None, "lower": None,
        "width": None, "width_pct_avg": None,
        "price_position": None,  # 0-1, where in BB the price is
        "squeeze": False, "expansion": False,
        "upper_touch": False, "lower_touch": False,
    }
    if len(df) < period * 2:
        return result
    try:
        bb = ta_lib.volatility.BollingerBands(df["close"], window=period, window_dev=2)
        upper = bb.bollinger_hband()
        lower = bb.bollinger_lband()
        middle = bb.bollinger_mavg()

        u, m, l = float(upper.iloc[-1]), float(middle.iloc[-1]), float(lower.iloc[-1])
        close = float(df["close"].iloc[-1])
        high = float(df["high"].iloc[-1])
        low = float(df["low"].iloc[-1])

        width = u - l
        # Width history for squeeze/expansion detection
        width_series = upper - lower
        width_avg = float(width_series.iloc[-50:].mean()) if len(width_series) >= 50 else float(width_series.mean())
        width_pct_avg = (width / width_avg * 100) if width_avg > 0 else None

        result["upper"] = _safe_float(u)
        result["middle"] = _safe_float(m)
        result["lower"] = _safe_float(l)
        result["width"] = _safe_float(width)
        result["width_pct_avg"] = _safe_float(width_pct_avg)

        # Price position 0-1
        if width > 0:
            result["price_position"] = _safe_float((close - l) / width)

        # Squeeze: width currently < 60% of average width
        if width_pct_avg is not None and width_pct_avg < 60:
            result["squeeze"] = True

        # Expansion: width increasing for last 2 candles
        if len(width_series) >= 3:
            if width_series.iloc[-1] > width_series.iloc[-2] > width_series.iloc[-3]:
                expansion_ratio = width_series.iloc[-1] / width_series.iloc[-3]
                if expansion_ratio > 1.15:
                    result["expansion"] = True

        # Touch detection
        if high >= u * 0.998:
            result["upper_touch"] = True
        if low <= l * 1.002:
            result["lower_touch"] = True

    except Exception as e:
        logger.debug(f"Bollinger compute failed: {e}")
    return result


def detect_rsi_divergence(df: pd.DataFrame, lookback: int = 30) -> dict:
    """
    Detect regular and hidden RSI divergence over recent candles.
    Returns dict with bull_div, bear_div, hidden_bull, hidden_bear flags.
    """
    result = {
        "bull_div": False, "bear_div": False,
        "hidden_bull": False, "hidden_bear": False,
        "rsi_value": None,
    }
    if len(df) < lookback + 14:
        return result

    try:
        rsi_series = ta_lib.momentum.rsi(df["close"], window=14)
        if rsi_series.isna().all():
            return result

        result["rsi_value"] = _safe_float(rsi_series.iloc[-1])

        # Look at last `lookback` candles
        recent = df.iloc[-lookback:].copy()
        rsi = rsi_series.iloc[-lookback:].values
        highs = recent["high"].values
        lows = recent["low"].values

        if len(highs) < 10:
            return result

        # Find local extremes (window=3)
        def find_pivots(arr, window=3, find_max=True):
            pivots = []
            for i in range(window, len(arr) - window):
                segment = arr[i - window:i + window + 1]
                if find_max and arr[i] == max(segment):
                    pivots.append((i, arr[i]))
                elif not find_max and arr[i] == min(segment):
                    pivots.append((i, arr[i]))
            return pivots

        price_highs = find_pivots(highs, find_max=True)
        price_lows = find_pivots(lows, find_max=False)
        rsi_highs = find_pivots(rsi, find_max=True)
        rsi_lows = find_pivots(rsi, find_max=False)

        # Need at least 2 pivots to compare
        if len(price_highs) >= 2 and len(rsi_highs) >= 2:
            # Last 2 price highs vs last 2 rsi highs (closest in index)
            ph1, ph2 = price_highs[-2], price_highs[-1]
            # Find rsi pivots near these indexes
            rh_near_1 = min(rsi_highs, key=lambda x: abs(x[0] - ph1[0]))
            rh_near_2 = min(rsi_highs, key=lambda x: abs(x[0] - ph2[0]))

            if ph2[0] - ph1[0] >= 5:  # spread enough apart
                # Bearish divergence: price HH, RSI LH
                if ph2[1] > ph1[1] and rh_near_2[1] < rh_near_1[1]:
                    result["bear_div"] = True
                # Hidden bearish: price LH, RSI HH
                if ph2[1] < ph1[1] and rh_near_2[1] > rh_near_1[1]:
                    result["hidden_bear"] = True

        if len(price_lows) >= 2 and len(rsi_lows) >= 2:
            pl1, pl2 = price_lows[-2], price_lows[-1]
            rl_near_1 = min(rsi_lows, key=lambda x: abs(x[0] - pl1[0]))
            rl_near_2 = min(rsi_lows, key=lambda x: abs(x[0] - pl2[0]))

            if pl2[0] - pl1[0] >= 5:
                # Bullish divergence: price LL, RSI HL
                if pl2[1] < pl1[1] and rl_near_2[1] > rl_near_1[1]:
                    result["bull_div"] = True
                # Hidden bullish: price HL, RSI LL
                if pl2[1] > pl1[1] and rl_near_2[1] < rl_near_1[1]:
                    result["hidden_bull"] = True

    except Exception as e:
        logger.debug(f"RSI divergence detection failed: {e}")
    return result


def consecutive_candles_same_direction(df: pd.DataFrame, lookback: int = 10) -> int:
    """Count last consecutive candles in the same direction (positive = bullish)."""
    if len(df) < 2:
        return 0
    closes = df["close"].iloc[-lookback - 1:].values
    if len(closes) < 2:
        return 0
    direction = 1 if closes[-1] > closes[-2] else -1
    count = 1
    for i in range(len(closes) - 2, 0, -1):
        if (closes[i] > closes[i - 1]) == (direction == 1):
            count += 1
        else:
            break
    return count * direction  # signed count


# ============================================================
# REDIS / EXTERNAL DATA HELPERS
# ============================================================

def get_redis_client():
    """Get redis client (decode_responses=True for string values)."""
    return redis.Redis(host="127.0.0.1", port=6379, decode_responses=True)


def get_btc_context_v3(r: redis.Redis = None) -> dict:
    """
    Read BTC context from Redis using v3 keys.
    Returns: {price, price_change_pct, dominance, dominance_delta, dominance_trend}
    """
    result = {
        "price": None, "price_change_pct": None,
        "dominance": None, "dominance_delta": None, "dominance_trend": "UNKNOWN",
    }
    if r is None:
        r = get_redis_client()

    # BTC ticker
    try:
        raw = r.get(REDIS_BTC_TICKER_KEY)
        if raw:
            data = json.loads(raw)
            result["price"] = _safe_float(data.get("price"))
            result["price_change_pct"] = _safe_float(data.get("price_change_pct"))
    except Exception as e:
        logger.warning(f"BTC ticker fetch failed: {e}")

    # Dominance from global
    try:
        raw = r.get(REDIS_GLOBAL_KEY)
        if raw:
            data = json.loads(raw)
            g = data.get("global", data)
            mcp = g.get("market_cap_percentage", {})
            current_dom = _safe_float(mcp.get("btc"))
            result["dominance"] = current_dom

            # Dominance trend via history cache
            if current_dom is not None:
                delta, trend = update_dominance_history(r, current_dom)
                result["dominance_delta"] = delta
                result["dominance_trend"] = trend
    except Exception as e:
        logger.warning(f"Global market fetch failed: {e}")

    return result


def update_dominance_history(r: redis.Redis, current: float) -> tuple:
    """
    Maintain rolling 25-hour history of BTC dominance and compute 24h delta.
    Returns: (delta, trend_label)
    """
    try:
        history_raw = r.get(REDIS_DOM_HISTORY_KEY)
        history = json.loads(history_raw) if history_raw else []
    except Exception:
        history = []

    now = time.time()
    history.append({"ts": now, "value": current})

    # Keep last 25 hours
    cutoff = now - DOM_HISTORY_RETENTION_HOURS * 3600
    history = [h for h in history if h["ts"] >= cutoff]

    try:
        r.set(REDIS_DOM_HISTORY_KEY, json.dumps(history))
    except Exception as e:
        logger.warning(f"Dom history save failed: {e}")

    # Find value ~24h ago (within 2h tolerance)
    target = now - 24 * 3600
    candidates = [h for h in history if abs(h["ts"] - target) < 7200]
    if not candidates:
        return None, "UNKNOWN"

    prev = candidates[0]["value"]
    delta = current - prev

    if delta > DOM_TREND_THRESHOLD:
        trend = "RISING"
    elif delta < -DOM_TREND_THRESHOLD:
        trend = "FALLING"
    else:
        trend = "FLAT"

    return _safe_float(delta), trend


def get_fear_greed_cached(r: redis.Redis = None) -> dict:
    """
    Get Fear & Greed index with Redis caching (10 min TTL).
    On-demand fetch from alternative.me.
    """
    result = {"value": None, "classification": None}
    if r is None:
        r = get_redis_client()

    # Check cache
    try:
        cached = r.get(REDIS_FNG_CACHE_KEY)
        if cached:
            data = json.loads(cached)
            return data
    except Exception:
        pass

    # Fetch from API
    try:
        resp = requests.get("https://api.alternative.me/fng/?limit=1", timeout=5)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            if data:
                result["value"] = int(data[0]["value"])
                result["classification"] = data[0].get("value_classification")
                # Cache
                try:
                    r.setex(REDIS_FNG_CACHE_KEY, FNG_CACHE_TTL, json.dumps(result))
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"F&G fetch failed: {e}")

    return result


def get_funding_rate(r: redis.Redis, symbol: str) -> Optional[float]:
    """
    Get latest funding rate for a symbol (e.g. 'BTC', 'ETH').
    Returns None if symbol not in funding rates list.
    """
    try:
        raw = r.get(REDIS_FUNDING_KEY)
        if not raw:
            return None
        data = json.loads(raw)
        for item in data:
            if item.get("symbol", "").upper() == symbol.upper():
                return _safe_float(item.get("rate"))
    except Exception as e:
        logger.debug(f"Funding rate fetch failed for {symbol}: {e}")
    return None


# ============================================================
# FACTS BUILDERS — per timeframe
# ============================================================

def build_trend_facts(df: pd.DataFrame, tf_label: str) -> dict:
    """Build trend-related facts for a single timeframe."""
    result = {
        "trend": "UNKNOWN",
        "ema20": None, "ema50": None, "ema200": None,
        "ema200_available": False,
        "close": None, "ema_gap_atr": None,
        "atr": None,
        "adx": None, "trend_strength": "UNKNOWN",
        "consecutive_candles": 0,
    }
    if len(df) < 50:
        return result

    try:
        close = df["close"]
        high = df["high"]
        low = df["low"]

        ema20 = float(ta_lib.trend.ema_indicator(close, window=20).iloc[-1])
        ema50 = float(ta_lib.trend.ema_indicator(close, window=50).iloc[-1])
        atr = float(ta_lib.volatility.average_true_range(high, low, close, window=14).iloc[-1])

        ema200 = None
        ema200_avail = False
        if len(df) >= 200:
            ema200_val = ta_lib.trend.ema_indicator(close, window=200).iloc[-1]
            if not np.isnan(ema200_val):
                ema200 = float(ema200_val)
                ema200_avail = True

        last_close = float(close.iloc[-1])
        ema_gap = abs(ema20 - ema50)
        ema_gap_atr = ema_gap / atr if atr > 0 else 0

        # Trend classification
        if ema_gap_atr < 0.5:
            trend = "RANGING"
        elif last_close > ema20 and ema20 > ema50:
            trend = "BULLISH"
        elif last_close < ema20 and ema20 < ema50:
            trend = "BEARISH"
        else:
            trend = "RANGING"

        # ADX
        adx = compute_adx(df)
        if adx is not None:
            if adx > 40:
                strength = "EXHAUSTED"
            elif adx > 25:
                strength = "STRONG"
            elif adx >= 20:
                strength = "MODERATE"
            else:
                strength = "WEAK"
        else:
            strength = "UNKNOWN"

        consec = consecutive_candles_same_direction(df)

        result.update({
            "trend": trend,
            "ema20": _safe_float(ema20),
            "ema50": _safe_float(ema50),
            "ema200": _safe_float(ema200),
            "ema200_available": ema200_avail,
            "close": _safe_float(last_close),
            "ema_gap_atr": _safe_float(ema_gap_atr),
            "atr": _safe_float(atr),
            "adx": _safe_float(adx),
            "trend_strength": strength,
            "consecutive_candles": int(consec),
        })
    except Exception as e:
        logger.warning(f"Trend facts {tf_label} failed: {e}")

    return result


def build_momentum_facts(df: pd.DataFrame, tf_label: str) -> dict:
    """Build momentum facts: RSI, MACD, divergence."""
    result = {
        "rsi": None, "rsi_state": "UNKNOWN",
        "macd_hist": None, "macd_direction": "UNKNOWN",
        "rsi_divergence": {},
        "bollinger": {},
    }
    if len(df) < 30:
        return result

    try:
        close = df["close"]

        rsi = float(ta_lib.momentum.rsi(close, window=14).iloc[-1])
        if rsi > 70:
            rsi_state = "OVERBOUGHT"
        elif rsi < 30:
            rsi_state = "OVERSOLD"
        else:
            rsi_state = "NEUTRAL"

        macd_hist = float(ta_lib.trend.macd_diff(close).iloc[-1])
        macd_dir = "BULLISH" if macd_hist > 0 else "BEARISH"

        result["rsi"] = _safe_float(rsi)
        result["rsi_state"] = rsi_state
        result["macd_hist"] = _safe_float(macd_hist)
        result["macd_direction"] = macd_dir
        result["rsi_divergence"] = detect_rsi_divergence(df)
        result["bollinger"] = compute_bollinger(df)

    except Exception as e:
        logger.warning(f"Momentum facts {tf_label} failed: {e}")

    return result


def build_volume_facts(df: pd.DataFrame, tf_label: str) -> dict:
    """Build volume facts."""
    result = {
        "current": None, "avg20": None, "ratio": None,
        "state": "UNKNOWN",
        "rising_with_trend": False, "falling_with_trend": False,
        "climax": False, "dry_up": False,
    }
    if len(df) < 20:
        return result

    try:
        vol = df["volume"]
        close = df["close"]

        current = float(vol.iloc[-1])
        avg20 = float(vol.rolling(20).mean().iloc[-1])
        ratio = current / avg20 if avg20 > 0 else None

        if ratio is None:
            state = "UNKNOWN"
        elif ratio < 0.5:
            state = "LOW"
        elif ratio < 1.5:
            state = "NORMAL"
        elif ratio < 2.0:
            state = "HIGH"
        elif ratio < 3.0:
            state = "SPIKE_2X"
        else:
            state = "SPIKE_3X"

        # Volume trend over last 5 candles
        if len(vol) >= 5:
            recent_vol = vol.iloc[-5:].values
            recent_close = close.iloc[-5:].values
            vol_rising = recent_vol[-1] > recent_vol[0]
            price_up = recent_close[-1] > recent_close[0]
            if vol_rising and price_up:
                result["rising_with_trend"] = True
            elif (not vol_rising) and price_up:
                result["falling_with_trend"] = True

        # Climax: vol > 3x AND price moved > 5% in this candle
        if ratio and ratio > 3.0 and len(close) >= 2:
            move_pct = abs((close.iloc[-1] - close.iloc[-2]) / close.iloc[-2] * 100)
            if move_pct > 5:
                result["climax"] = True

        # Dry up: vol < 0.5x for 3+ candles
        if len(vol) >= 3:
            recent3 = vol.iloc[-3:].values
            if all(v < avg20 * 0.5 for v in recent3):
                result["dry_up"] = True

        result.update({
            "current": _safe_float(current),
            "avg20": _safe_float(avg20),
            "ratio": _safe_float(ratio),
            "state": state,
        })
    except Exception as e:
        logger.warning(f"Volume facts {tf_label} failed: {e}")

    return result


def build_entry_quality_facts(h1_df: pd.DataFrame, signal_dir: str, entry_price: float) -> dict:
    """Build entry quality / anti-FOMO facts."""
    result = {
        "last_3_candles_gain_pct": None,
        "last_5_candles_gain_pct": None,
        "distance_from_ema20_h1_pct": None,
        "distance_from_ema50_h1_pct": None,
        "candle_age_pct": None,
        "last_candle_upper_wick_pct": None,
        "last_candle_lower_wick_pct": None,
        "exhaustion_candle": False,
        "fresh_breakout": False,
        "deep_pullback": False,
    }
    if len(h1_df) < 50:
        return result

    try:
        closes = h1_df["close"].values
        highs = h1_df["high"].values
        lows = h1_df["low"].values
        opens = h1_df["open"].values

        # Last N candles gain (in signal direction)
        if len(closes) >= 4:
            move_3c = (closes[-1] - closes[-4]) / closes[-4] * 100
            if signal_dir == "BEARISH":
                move_3c = -move_3c
            result["last_3_candles_gain_pct"] = _safe_float(move_3c)

        if len(closes) >= 6:
            move_5c = (closes[-1] - closes[-6]) / closes[-6] * 100
            if signal_dir == "BEARISH":
                move_5c = -move_5c
            result["last_5_candles_gain_pct"] = _safe_float(move_5c)

        # Distance from EMA20 / EMA50 H1
        ema20_h1 = float(ta_lib.trend.ema_indicator(h1_df["close"], window=20).iloc[-1])
        ema50_h1 = float(ta_lib.trend.ema_indicator(h1_df["close"], window=50).iloc[-1])
        last_close = float(closes[-1])

        dist_ema20 = (last_close - ema20_h1) / ema20_h1 * 100
        if signal_dir == "BEARISH":
            dist_ema20 = -dist_ema20
        result["distance_from_ema20_h1_pct"] = _safe_float(dist_ema20)

        dist_ema50 = (last_close - ema50_h1) / ema50_h1 * 100
        if signal_dir == "BEARISH":
            dist_ema50 = -dist_ema50
        result["distance_from_ema50_h1_pct"] = _safe_float(dist_ema50)

        # Candle age (relative to H1 = 60 min)
        last_ts = pd.to_datetime(h1_df["open_time"].iloc[-1]) if "open_time" in h1_df.columns else None
        if last_ts is not None:
            now_ts = pd.Timestamp.utcnow().tz_localize(None) if last_ts.tzinfo is None else pd.Timestamp.now(tz="UTC")
            age_min = (now_ts - last_ts).total_seconds() / 60
            age_pct = min(100, max(0, age_min / 60 * 100))
            result["candle_age_pct"] = _safe_float(age_pct)

        # Wick analysis on last candle
        last_open = float(opens[-1])
        last_high = float(highs[-1])
        last_low = float(lows[-1])
        last_close_v = float(closes[-1])
        candle_range = last_high - last_low

        if candle_range > 0:
            body_top = max(last_open, last_close_v)
            body_bottom = min(last_open, last_close_v)
            upper_wick = last_high - body_top
            lower_wick = body_bottom - last_low
            upper_wick_pct = upper_wick / candle_range * 100
            lower_wick_pct = lower_wick / candle_range * 100

            result["last_candle_upper_wick_pct"] = _safe_float(upper_wick_pct)
            result["last_candle_lower_wick_pct"] = _safe_float(lower_wick_pct)

            # Exhaustion: large wick against signal direction
            if signal_dir == "BULLISH" and upper_wick_pct > 50:
                result["exhaustion_candle"] = True
            elif signal_dir == "BEARISH" and lower_wick_pct > 50:
                result["exhaustion_candle"] = True

        # Fresh breakout: last 3 candles broke above swing high (or below swing low)
        if len(highs) >= 23:
            swing_high_20 = float(max(highs[-23:-3]))
            swing_low_20 = float(min(lows[-23:-3]))
            recent_high = float(max(highs[-3:]))
            recent_low = float(min(lows[-3:]))
            if signal_dir == "BULLISH" and recent_high > swing_high_20 * 1.001:
                result["fresh_breakout"] = True
            elif signal_dir == "BEARISH" and recent_low < swing_low_20 * 0.999:
                result["fresh_breakout"] = True

        # Deep pullback: price near EMA50 within 2 ATR
        atr_h1 = float(ta_lib.volatility.average_true_range(
            h1_df["high"], h1_df["low"], h1_df["close"], window=14
        ).iloc[-1])
        if abs(last_close - ema50_h1) <= 2 * atr_h1:
            result["deep_pullback"] = True

    except Exception as e:
        logger.warning(f"Entry quality facts failed: {e}")

    return result


def build_levels_facts(h1_df: pd.DataFrame, h4_df: pd.DataFrame, signal_dir: str) -> dict:
    """Build key levels facts: support/resistance proximity, recent breakouts."""
    result = {
        "h1_swing_high": None, "h1_swing_low": None,
        "h4_swing_high": None, "h4_swing_low": None,
        "near_resistance_h1": False, "near_support_h1": False,
        "near_resistance_h4": False, "near_support_h4": False,
        "broke_resistance_recent": False, "broke_support_recent": False,
    }

    try:
        for tf_label, df, prefix in [("h1", h1_df, "h1"), ("h4", h4_df, "h4")]:
            if len(df) < 25:
                continue
            highs = df["high"]
            lows = df["low"]
            close = df["close"]
            atr = float(ta_lib.volatility.average_true_range(
                highs, lows, close, window=14
            ).iloc[-1])

            swing_high = float(highs.rolling(20).max().iloc[-1])
            swing_low = float(lows.rolling(20).min().iloc[-1])
            last_close = float(close.iloc[-1])

            result[f"{prefix}_swing_high"] = _safe_float(swing_high)
            result[f"{prefix}_swing_low"] = _safe_float(swing_low)

            if atr > 0:
                if (swing_high - last_close) / atr < 1.0:
                    result[f"near_resistance_{prefix}"] = True
                if (last_close - swing_low) / atr < 1.0:
                    result[f"near_support_{prefix}"] = True

        # Recent break detection on H4
        if len(h4_df) >= 25:
            highs_h4 = h4_df["high"].values
            lows_h4 = h4_df["low"].values
            prev_swing_high = float(max(highs_h4[-25:-5]))
            prev_swing_low = float(min(lows_h4[-25:-5]))
            recent_high = float(max(highs_h4[-5:]))
            recent_low = float(min(lows_h4[-5:]))

            if recent_high > prev_swing_high * 1.001:
                result["broke_resistance_recent"] = True
            if recent_low < prev_swing_low * 0.999:
                result["broke_support_recent"] = True

    except Exception as e:
        logger.warning(f"Levels facts failed: {e}")

    return result


def build_structure_facts(h1_df: pd.DataFrame, m15_df: pd.DataFrame, h4_df: pd.DataFrame,
                          entry_price: float, signal_dir: str, signal: dict) -> dict:
    """Build structure facts: SMC + chart patterns + Fibonacci. Reuses v2.3.1 functions."""
    result = {
        "smc": {
            "fvg_count": 0, "ob_count": 0, "sweep_count": 0,
            "fvg_near_entry": False, "ob_near_entry": False, "sweep_recent": False,
            "golden_setup": False, "available": False,
        },
        "patterns": [],
        "fib": {
            "entry_near_fib": False, "entry_fib_level": None,
            "tp_fib_aligned": 0, "swing_high": None, "swing_low": None,
        },
    }

    try:
        # ATR for thresholds
        atr_m15 = float(ta_lib.volatility.average_true_range(
            m15_df["high"], m15_df["low"], m15_df["close"], window=14
        ).iloc[-1])
        atr_h1 = float(ta_lib.volatility.average_true_range(
            h1_df["high"], h1_df["low"], h1_df["close"], window=14
        ).iloc[-1])
        atr_h4 = float(ta_lib.volatility.average_true_range(
            h4_df["high"], h4_df["low"], h4_df["close"], window=14
        ).iloc[-1])

        # SMC on M15 + H1, merge results
        smc_m15 = detect_smc(m15_df, entry_price, atr_m15)
        smc_h1 = detect_smc(h1_df, entry_price, atr_h1)

        result["smc"]["fvg_count"] = max(smc_m15["fvg_count"], smc_h1["fvg_count"])
        result["smc"]["ob_count"] = max(smc_m15["ob_count"], smc_h1["ob_count"])
        result["smc"]["sweep_count"] = max(smc_m15["sweep_count"], smc_h1["sweep_count"])
        result["smc"]["fvg_near_entry"] = bool(smc_m15["fvg_near_entry"] or smc_h1["fvg_near_entry"])
        result["smc"]["ob_near_entry"] = bool(smc_m15["ob_near_entry"] or smc_h1["ob_near_entry"])
        result["smc"]["sweep_recent"] = bool(smc_m15["sweep_recent"] or smc_h1["sweep_recent"])
        result["smc"]["golden_setup"] = bool(smc_m15["golden_setup"] or smc_h1["golden_setup"])
        result["smc"]["available"] = True

        # Patterns on H1 + H4
        patterns_h1 = detect_patterns(h1_df, atr_h1)
        for p in patterns_h1:
            p["timeframe"] = "H1"
        patterns_h4 = detect_patterns(h4_df, atr_h4)
        for p in patterns_h4:
            p["timeframe"] = "H4"

        all_patterns = patterns_h1 + patterns_h4
        result["patterns"] = _to_jsonable(all_patterns)

        # Fibonacci on H4
        targets = [signal.get("target1"), signal.get("target2"),
                   signal.get("target3"), signal.get("target4")]
        stop = signal.get("stop1")
        fib = analyze_fibonacci(h4_df, entry_price, targets, stop, signal_dir, atr_h4)
        result["fib"] = {
            "entry_near_fib": bool(fib.get("entry_near_fib", False)),
            "entry_fib_level": fib.get("entry_fib_level"),
            "tp_fib_aligned": int(fib.get("tp_fib_aligned", 0)),
            "swing_high": _safe_float(fib.get("detail", {}).get("swing_high")),
            "swing_low": _safe_float(fib.get("detail", {}).get("swing_low")),
        }

    except Exception as e:
        logger.warning(f"Structure facts failed: {e}")
        result["smc"]["available"] = False

    return result


def build_context_facts(r: redis.Redis, base_symbol: str, vol_24h: float,
                        atr_h4_pct: float) -> dict:
    """Build market context facts: BTC, F&G, funding, environment."""
    btc = get_btc_context_v3(r)
    fng = get_fear_greed_cached(r)
    funding = get_funding_rate(r, base_symbol)

    if vol_24h < 100_000:
        liq = "VERY_LOW"
    elif vol_24h < 500_000:
        liq = "LOW"
    elif vol_24h < 2_000_000:
        liq = "MID"
    else:
        liq = "HIGH"

    if atr_h4_pct > 80:
        vol_regime = "HIGH"
    elif atr_h4_pct < 20:
        vol_regime = "LOW"
    else:
        vol_regime = "NORMAL"

    return {
        "btc": btc,
        "fng": fng,
        "funding_rate": funding,
        "environment": {
            "vol_24h_usd": _safe_float(vol_24h),
            "liquidity_tier": liq,
            "atr_percentile_h4": _safe_float(atr_h4_pct),
            "volatility_regime": vol_regime,
        },
    }


def compute_atr_percentile(df: pd.DataFrame, period: int = 14, lookback: int = 100) -> float:
    """Compute ATR percentile (where current ATR sits in lookback distribution)."""
    try:
        atr_series = ta_lib.volatility.average_true_range(
            df["high"], df["low"], df["close"], window=period
        )
        recent = atr_series.iloc[-lookback:]
        current = float(atr_series.iloc[-1])
        pct = (recent < current).sum() / len(recent) * 100
        return float(pct)
    except Exception:
        return 50.0


# ============================================================
# TAG GENERATORS
# ============================================================

def tag_trend_per_tf(facts: dict) -> list:
    """Generate trend + EMA200 position tags per timeframe."""
    tags = []
    by_tf = facts.get("by_timeframe", {})
    for tf in ["m15", "h1", "h4"]:
        tf_data = by_tf.get(tf, {}).get("trend", {})
        trend = tf_data.get("trend")
        TF = tf.upper()
        if trend == "BULLISH":
            tags.append(f"BULLISH_{TF}")
        elif trend == "BEARISH":
            tags.append(f"BEARISH_{TF}")
        elif trend == "RANGING":
            tags.append(f"RANGING_{TF}")

        # EMA200 position
        if tf_data.get("ema200_available"):
            close = tf_data.get("close")
            ema200 = tf_data.get("ema200")
            if close is not None and ema200 is not None:
                if close > ema200:
                    tags.append(f"ABOVE_EMA200_{TF}")
                else:
                    tags.append(f"BELOW_EMA200_{TF}")
    return tags


def tag_htf_bias(facts: dict, signal_dir: str) -> list:
    """Generate higher-timeframe bias tags."""
    tags = []
    h4 = facts.get("by_timeframe", {}).get("h4", {}).get("trend", {})
    h4_trend = h4.get("trend")
    h4_close = h4.get("close")
    h4_ema200 = h4.get("ema200")
    h4_strength = h4.get("trend_strength")
    h4_adx = h4.get("adx")

    above_ema200 = (h4_close is not None and h4_ema200 is not None and h4_close > h4_ema200)
    below_ema200 = (h4_close is not None and h4_ema200 is not None and h4_close < h4_ema200)

    if h4_trend == "BULLISH" and above_ema200:
        tags.append("HTF_BIAS_BULLISH")
    elif h4_trend == "BEARISH" and below_ema200:
        tags.append("HTF_BIAS_BEARISH")
    else:
        tags.append("HTF_BIAS_NEUTRAL")

    if h4_strength == "STRONG":
        tags.append("HTF_TREND_STRONG")
    elif h4_strength == "EXHAUSTED":
        tags.append("HTF_TREND_EXHAUSTED")

    return tags


def tag_mtf_alignment(facts: dict, signal_dir: str) -> list:
    """Generate MTF alignment tags."""
    tags = []
    by_tf = facts.get("by_timeframe", {})
    m15 = by_tf.get("m15", {}).get("trend", {}).get("trend")
    h1 = by_tf.get("h1", {}).get("trend", {}).get("trend")
    h4 = by_tf.get("h4", {}).get("trend", {}).get("trend")

    if m15 == h1 == h4 and m15 in ("BULLISH", "BEARISH"):
        tags.append("MTF_FULL_ALIGNED")
        if m15 == "BULLISH":
            tags.append("MTF_FULL_BULLISH")
        else:
            tags.append("MTF_FULL_BEARISH")
    elif m15 == h1 and m15 in ("BULLISH", "BEARISH") and h4 != m15:
        tags.append("MTF_LTF_ALIGNED")
    elif h1 == h4 and h1 in ("BULLISH", "BEARISH") and m15 != h1:
        tags.append("MTF_HTF_ALIGNED")
    else:
        tags.append("MTF_DIVERGENT")

    # Against HTF
    if h4 in ("BULLISH", "BEARISH") and h4 != signal_dir:
        tags.append("MTF_AGAINST_HTF")

    # Trend strong on H1
    h1_strength = by_tf.get("h1", {}).get("trend", {}).get("trend_strength")
    if h1_strength == "STRONG":
        tags.append("TREND_STRONG_H1")
    elif h1_strength == "EXHAUSTED":
        tags.append("TREND_EXHAUSTED_H1")

    return tags


def tag_momentum(facts: dict) -> list:
    """Generate RSI / divergence / Bollinger tags."""
    tags = []
    by_tf = facts.get("by_timeframe", {})

    for tf in ["m15", "h1", "h4"]:
        m = by_tf.get(tf, {}).get("momentum", {})
        TF = tf.upper()
        rsi_state = m.get("rsi_state")
        if rsi_state == "OVERBOUGHT":
            tags.append(f"RSI_OVERBOUGHT_{TF}")
        elif rsi_state == "OVERSOLD":
            tags.append(f"RSI_OVERSOLD_{TF}")
        elif rsi_state == "NEUTRAL":
            tags.append(f"RSI_NEUTRAL_{TF}")

        macd_dir = m.get("macd_direction")
        if macd_dir == "BULLISH":
            tags.append(f"MACD_BULLISH_{TF}")
        elif macd_dir == "BEARISH":
            tags.append(f"MACD_BEARISH_{TF}")

    # Divergence on H1 (most actionable)
    h1_div = by_tf.get("h1", {}).get("momentum", {}).get("rsi_divergence", {})
    if h1_div.get("bull_div"):
        tags.append("RSI_BULL_DIV_H1")
    if h1_div.get("bear_div"):
        tags.append("RSI_BEAR_DIV_H1")
    if h1_div.get("hidden_bull"):
        tags.append("RSI_HIDDEN_BULL_H1")
    if h1_div.get("hidden_bear"):
        tags.append("RSI_HIDDEN_BEAR_H1")

    # Bollinger H1
    h1_bb = by_tf.get("h1", {}).get("momentum", {}).get("bollinger", {})
    if h1_bb.get("squeeze"):
        tags.append("BB_SQUEEZE_H1")
    if h1_bb.get("expansion"):
        tags.append("BB_EXPANSION_H1")
    if h1_bb.get("upper_touch"):
        tags.append("BB_UPPER_TOUCH_H1")
    if h1_bb.get("lower_touch"):
        tags.append("BB_LOWER_TOUCH_H1")

    return tags


def tag_volume(facts: dict) -> list:
    """Generate volume tags."""
    tags = []
    h1_vol = facts.get("by_timeframe", {}).get("h1", {}).get("volume", {})
    state = h1_vol.get("state")
    if state == "LOW":
        tags.append("VOL_LOW")
    elif state == "NORMAL":
        tags.append("VOL_NORMAL")
    elif state == "HIGH":
        tags.append("VOL_HIGH")
    elif state == "SPIKE_2X":
        tags.append("VOL_SPIKE_2X")
    elif state == "SPIKE_3X":
        tags.append("VOL_SPIKE_3X")

    if h1_vol.get("climax"):
        tags.append("VOL_CLIMAX")
    if h1_vol.get("dry_up"):
        tags.append("VOL_DRY_UP")
    if h1_vol.get("rising_with_trend"):
        tags.append("VOL_RISING_WITH_TREND")
    if h1_vol.get("falling_with_trend"):
        tags.append("VOL_FALLING_WITH_TREND")

    return tags


def tag_entry_quality(facts: dict) -> list:
    """Generate entry quality / anti-FOMO tags."""
    tags = []
    eq = facts.get("entry_quality", {})

    g3 = eq.get("last_3_candles_gain_pct")
    g5 = eq.get("last_5_candles_gain_pct")
    if g3 is not None and g3 > 8:
        tags.append("LATE_ENTRY")
    if g5 is not None and g5 > 12:
        tags.append("LATE_ENTRY_5C")

    dist = eq.get("distance_from_ema20_h1_pct")
    if dist is not None:
        if dist > 8:
            tags.append("PARABOLIC")
        elif dist > 5:
            tags.append("OVEREXTENDED")

    if eq.get("exhaustion_candle"):
        tags.append("EXHAUSTION_CANDLE")
    if eq.get("fresh_breakout"):
        tags.append("FRESH_BREAKOUT")
    if eq.get("deep_pullback"):
        tags.append("DEEP_PULLBACK")

    age = eq.get("candle_age_pct")
    if age is not None:
        if age < 30:
            tags.append("CANDLE_FRESH_H1")
        elif age < 70:
            tags.append("CANDLE_MID_H1")
        else:
            tags.append("CANDLE_NEAR_CLOSE_H1")

    return tags


def tag_levels(facts: dict) -> list:
    """Generate key level tags."""
    tags = []
    lv = facts.get("levels", {})
    if lv.get("near_resistance_h1"):
        tags.append("NEAR_RESISTANCE_H1")
    if lv.get("near_support_h1"):
        tags.append("NEAR_SUPPORT_H1")
    if lv.get("near_resistance_h4"):
        tags.append("NEAR_RESISTANCE_H4")
    if lv.get("near_support_h4"):
        tags.append("NEAR_SUPPORT_H4")
    if lv.get("broke_resistance_recent"):
        tags.append("BROKE_RESISTANCE_RECENT")
    if lv.get("broke_support_recent"):
        tags.append("BROKE_SUPPORT_RECENT")
    return tags


def tag_structure(facts: dict, signal_dir: str) -> list:
    """Generate SMC + pattern + Fibonacci tags."""
    tags = []
    structure = facts.get("structure", {})
    smc = structure.get("smc", {})

    if smc.get("golden_setup"):
        tags.append("SMC_GOLDEN_SETUP")
    if smc.get("fvg_near_entry"):
        tags.append("FVG_NEAR_ENTRY")
    if smc.get("ob_near_entry"):
        tags.append("OB_NEAR_ENTRY")
    if smc.get("sweep_recent"):
        tags.append("LIQ_SWEEP_RECENT")

    # Patterns
    patterns = structure.get("patterns", [])
    aligned_bull = any(p.get("direction") == "BULLISH" for p in patterns)
    aligned_bear = any(p.get("direction") == "BEARISH" for p in patterns)
    has_harmonic = any("harmonic" in str(p.get("type", "")) for p in patterns)

    if aligned_bull:
        tags.append("PATTERN_BULLISH")
    if aligned_bear:
        tags.append("PATTERN_BEARISH")
    if has_harmonic:
        tags.append("HARMONIC_DETECTED")

    # Fibonacci
    fib = structure.get("fib", {})
    if fib.get("entry_near_fib"):
        level = fib.get("entry_fib_level")
        if level in ("0.5", "0.618"):
            tags.append("AT_FIB_GOLDEN_ZONE")
        elif level == "0.786":
            tags.append("AT_FIB_EXTREME")
        else:
            tags.append("FIB_ENTRY_ALIGNED")

    if fib.get("tp_fib_aligned", 0) >= 1:
        tags.append("FIB_TP_ALIGNED")

    return tags


def tag_context(facts: dict, signal_dir: str) -> list:
    """Generate market context tags: BTC, dominance, F&G, funding."""
    tags = []
    ctx = facts.get("context", {})
    btc = ctx.get("btc", {})
    fng = ctx.get("fng", {})
    funding = ctx.get("funding_rate")

    # BTC trend
    bpc = btc.get("price_change_pct")
    if bpc is not None:
        if bpc > 2:
            tags.append("BTC_BULLISH")
        elif bpc < -2:
            tags.append("BTC_BEARISH")
        else:
            tags.append("BTC_RANGING")
        if abs(bpc) > 5:
            tags.append("BTC_VOLATILE")

    # Dominance
    dom_trend = btc.get("dominance_trend")
    if dom_trend == "RISING":
        tags.append("BTC_DOM_RISING")
    elif dom_trend == "FALLING":
        tags.append("BTC_DOM_FALLING")
    elif dom_trend == "FLAT":
        tags.append("BTC_DOM_FLAT")
    elif dom_trend == "UNKNOWN":
        tags.append("BTC_DOM_UNKNOWN")

    # Composite alt season / risk off
    if bpc is not None and dom_trend:
        if bpc > 0 and dom_trend == "FALLING":
            tags.append("ALT_SEASON_HINT")
        elif bpc < 0 and dom_trend == "RISING":
            tags.append("RISK_OFF_REGIME")

    # Fear & Greed
    fng_val = fng.get("value")
    if fng_val is not None:
        if fng_val < 25:
            tags.append("FNG_EXTREME_FEAR")
        elif fng_val < 45:
            tags.append("FNG_FEAR")
        elif fng_val <= 55:
            tags.append("FNG_NEUTRAL")
        elif fng_val <= 75:
            tags.append("FNG_GREED")
        else:
            tags.append("FNG_EXTREME_GREED")

    # Funding rate
    if funding is not None:
        if funding > 0.0005:
            tags.append("FUNDING_HEAVY_LONG")
        elif funding < -0.0005:
            tags.append("FUNDING_HEAVY_SHORT")
        else:
            tags.append("FUNDING_NEUTRAL")

    return tags


def tag_environment(facts: dict) -> list:
    """Generate volatility regime + liquidity tags."""
    tags = []
    env = facts.get("context", {}).get("environment", {})

    vr = env.get("volatility_regime")
    if vr == "HIGH":
        tags.append("VOL_REGIME_HIGH")
    elif vr == "LOW":
        tags.append("VOL_REGIME_LOW")
    else:
        tags.append("VOL_REGIME_NORMAL")

    liq = env.get("liquidity_tier")
    if liq == "VERY_LOW":
        tags.append("LIQ_VERY_LOW")
    elif liq == "LOW":
        tags.append("LIQ_LOW")
    elif liq == "MID":
        tags.append("LIQ_MID")
    elif liq == "HIGH":
        tags.append("LIQ_HIGH")

    return tags


def generate_all_tags(facts: dict, signal_dir: str) -> list:
    """Run all tag generators and return deduplicated list."""
    all_tags = []
    all_tags.extend(tag_trend_per_tf(facts))
    all_tags.extend(tag_htf_bias(facts, signal_dir))
    all_tags.extend(tag_mtf_alignment(facts, signal_dir))
    all_tags.extend(tag_momentum(facts))
    all_tags.extend(tag_volume(facts))
    all_tags.extend(tag_entry_quality(facts))
    all_tags.extend(tag_levels(facts))
    all_tags.extend(tag_structure(facts, signal_dir))
    all_tags.extend(tag_context(facts, signal_dir))
    all_tags.extend(tag_environment(facts))
    # Dedupe while preserving order
    seen = set()
    deduped = []
    for t in all_tags:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    return deduped


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def determine_signal_direction(signal: dict) -> str:
    """Determine BULLISH or BEARISH from entry/target/stop."""
    entry = float(signal.get("entry") or 0)
    t1 = signal.get("target1")
    s1 = signal.get("stop1")
    if t1 is not None and float(t1) < entry:
        return "BEARISH"
    if s1 is not None and float(s1) > entry:
        return "BEARISH"
    return "BULLISH"


def compute_snapshot(signal: dict, m15_df: pd.DataFrame, h1_df: pd.DataFrame,
                     h4_df: pd.DataFrame, vol_24h: float, mode: str = "entry",
                     redis_client: Optional[redis.Redis] = None) -> dict:
    """
    Main entry point. Build complete snapshot {facts, tags, metadata}.

    Args:
        signal: dict with signal_id, pair, entry, target1-4, stop1
        m15_df, h1_df, h4_df: OHLCV DataFrames (must have 'open_time' column)
        vol_24h: 24h quote volume in USD
        mode: 'entry' (frozen, first time) or 'live' (refresh)
        redis_client: optional pre-built Redis client

    Returns:
        dict ready for JSONB storage in entry_snapshot or live_snapshot
    """
    if redis_client is None:
        redis_client = get_redis_client()

    pair = signal.get("pair", "")
    base_symbol = pair.upper().replace("USDT", "")
    entry_price = float(signal.get("entry") or 0)
    signal_dir = determine_signal_direction(signal)

    # ── Build facts per timeframe ──
    by_tf = {}
    for tf_label, df in [("m15", m15_df), ("h1", h1_df), ("h4", h4_df)]:
        by_tf[tf_label] = {
            "trend": build_trend_facts(df, tf_label),
            "momentum": build_momentum_facts(df, tf_label),
            "volume": build_volume_facts(df, tf_label),
        }

    # ── ATR percentile (volatility regime) ──
    atr_h4_pct = compute_atr_percentile(h4_df)

    # ── Cross-timeframe facts ──
    entry_quality = build_entry_quality_facts(h1_df, signal_dir, entry_price)
    levels = build_levels_facts(h1_df, h4_df, signal_dir)
    structure = build_structure_facts(h1_df, m15_df, h4_df, entry_price, signal_dir, signal)
    context = build_context_facts(redis_client, base_symbol, vol_24h, atr_h4_pct)

    # ── Assemble facts ──
    facts = {
        "by_timeframe": by_tf,
        "entry_quality": entry_quality,
        "levels": levels,
        "structure": structure,
        "context": context,
    }

    # ── Generate tags from facts ──
    tags = generate_all_tags(facts, signal_dir)

    # ── Annotate tag importance for UI ──
    tags_annotated = [
        {"name": t, "important": t in IMPORTANT_TAGS}
        for t in tags
    ]

    snapshot = {
        "version": ENRICHMENT_VERSION,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "signal_id": signal.get("signal_id"),
        "pair": pair,
        "signal_direction": signal_dir,
        "entry_price": _safe_float(entry_price),
        "facts": _to_jsonable(facts),
        "tags": tags,
        "tags_annotated": tags_annotated,
        "metadata": {
            "tag_count": len(tags),
            "important_tag_count": sum(1 for t in tags if t in IMPORTANT_TAGS),
            "structure_available": structure["smc"]["available"],
        },
    }

    return _to_jsonable(snapshot)


# ============================================================
# STANDALONE TEST
# ============================================================

if __name__ == "__main__":
    """
    Quick test: fetch data for TWTUSDT and print snapshot.
    Run from /root/luxquant-terminal/backend:
        python3 -m app.services.enrichment_service_v3
    """
    import asyncio
    from app.services.enrichment_worker import fetch_ohlcv, fetch_24h_volume

    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s [%(levelname)s] %(message)s')

    test_signal = {
        "signal_id": "test-twt-001",
        "pair": "TWTUSDT",
        "entry": 0.4074,
        "target1": 0.4117,
        "target2": 0.4200,
        "target3": 0.4300,
        "target4": 0.4400,
        "stop1": 0.3986,
    }

    async def run_test():
        print(f"Fetching OHLCV for {test_signal['pair']}...")
        m15 = await fetch_ohlcv(test_signal["pair"], "15m", 250)
        h1 = await fetch_ohlcv(test_signal["pair"], "1h", 250)
        h4 = await fetch_ohlcv(test_signal["pair"], "4h", 250)
        vol = await fetch_24h_volume(test_signal["pair"])
        print(f"M15: {len(m15)} candles, H1: {len(h1)}, H4: {len(h4)}, vol_24h: ${vol:,.0f}")

        print("\nComputing snapshot...")
        snapshot = compute_snapshot(test_signal, m15, h1, h4, vol, mode="entry")

        print("\n" + "=" * 60)
        print(f"SNAPSHOT — {test_signal['pair']} {snapshot['signal_direction']}")
        print("=" * 60)
        print(f"Total tags: {snapshot['metadata']['tag_count']}")
        print(f"Important tags: {snapshot['metadata']['important_tag_count']}")
        print(f"Structure available: {snapshot['metadata']['structure_available']}")

        print("\n--- IMPORTANT TAGS ---")
        for t in snapshot["tags"]:
            if t in IMPORTANT_TAGS:
                print(f"  • {t}")

        print("\n--- DETAIL TAGS ---")
        for t in snapshot["tags"]:
            if t not in IMPORTANT_TAGS:
                print(f"  · {t}")

        print("\n--- KEY FACTS ---")
        h1_t = snapshot["facts"]["by_timeframe"]["h1"]["trend"]
        h1_m = snapshot["facts"]["by_timeframe"]["h1"]["momentum"]
        h1_v = snapshot["facts"]["by_timeframe"]["h1"]["volume"]
        eq = snapshot["facts"]["entry_quality"]
        ctx = snapshot["facts"]["context"]

        print(f"H1 trend:        {h1_t.get('trend')} (ADX {h1_t.get('adx')}, strength {h1_t.get('trend_strength')})")
        print(f"H1 RSI:          {h1_m.get('rsi')} ({h1_m.get('rsi_state')})")
        print(f"H1 MACD:         {h1_m.get('macd_hist')} ({h1_m.get('macd_direction')})")
        print(f"H1 Volume:       {h1_v.get('ratio')}x avg ({h1_v.get('state')})")
        print(f"Last 3 c gain:   {eq.get('last_3_candles_gain_pct')}%")
        print(f"Dist EMA20 H1:   {eq.get('distance_from_ema20_h1_pct')}%")
        print(f"BTC change:      {ctx.get('btc', {}).get('price_change_pct')}%")
        print(f"BTC dominance:   {ctx.get('btc', {}).get('dominance')}% (delta: {ctx.get('btc', {}).get('dominance_delta')}, trend: {ctx.get('btc', {}).get('dominance_trend')})")
        print(f"Fear & Greed:    {ctx.get('fng', {}).get('value')} ({ctx.get('fng', {}).get('classification')})")
        print(f"Funding rate:    {ctx.get('funding_rate')}")
        print(f"Liquidity:       ${ctx.get('environment', {}).get('vol_24h_usd'):,.0f} ({ctx.get('environment', {}).get('liquidity_tier')})")
        print(f"Vol regime:      {ctx.get('environment', {}).get('volatility_regime')} (ATR pct {ctx.get('environment', {}).get('atr_percentile_h4')})")

    asyncio.run(run_test())