"""
LuxQuant Enrichment Worker v2.1
================================
Worker terpisah yang monitor database untuk signal baru,
fetch OHLCV dari exchange, run multi-factor analysis,
dan store enrichment score ke database.

Usage:
    python3 enrichment_worker.py                           # process pending once
    python3 enrichment_worker.py --loop                    # run continuously
    python3 enrichment_worker.py --signal-id <uuid>        # process specific signal
    python3 enrichment_worker.py --backtest                # score all closed signals

Requirements:
    pip install pandas numpy ta ccxt psycopg2-binary sqlalchemy redis
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
BATCH_LIMIT = 5
ENRICHMENT_VERSION = "v2.1"

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
    """JSON serialize with numpy/bool/datetime support."""
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

def get_pending_signals(limit: int = 5) -> list:
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


def get_changed_signals(limit: int = 5) -> list:
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
# SECTION 2: OHLCV FETCHER (ccxt — Binance + Bybit fallback)
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

    # BTC pair check
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

    # Liquidity
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
        if len(df) < 100:
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

    # Score
    a, an = _score_mtf(h4_info, h1_info, sig_dir, weights["mtf"])
    b, bn = 0, ["Pattern: phase 2"]
    c, cn = 0, ["SMC: phase 2"]
    d, dn = _score_momentum(h4_info, h1_info, m15_df, sig_dir, weights["momentum"])
    e, en = _score_context(btc_ctx, pair, sig_dir, weights["context"])
    f, fn = _score_freshness(signal, atr_pct, weights["fresh"])

    total = min(a + b + c + d + e + f, liq_cap)
    rating = "STRONG" if total >= 70 else "MODERATE" if total >= 55 else "WEAK" if total >= 40 else "LOW" if total >= 25 else "AVOID"
    all_notes = an + dn + en + fn
    warnings = [f"Low liquidity cap: {liq_cap}"] if liq_cap < 100 else []

    logger.info(f"[ENRICH] {pair} → score={total} rating={rating} regime={regime}")

    return {
        "signal_id": sid, "pair": pair, "confidence_score": total, "rating": rating, "regime": regime,
        "score_breakdown": _json({"mtf": {"score": a, "max": weights["mtf"]}, "pattern": {"score": b, "max": weights["pattern"]},
            "smc": {"score": c, "max": weights["smc"]}, "momentum": {"score": d, "max": weights["momentum"]},
            "context": {"score": e, "max": weights["context"]}, "freshness": {"score": f, "max": weights["fresh"]}}),
        "weights_used": _json(weights),
        "mtf_h4_trend": h4_info["trend"], "mtf_h1_trend": h1_info["trend"], "mtf_m15_trend": m15_info["trend"],
        "signal_direction": sig_dir, "mtf_detail": _json({"h4": h4_info, "h1": h1_info, "m15": m15_info}),
        "patterns_detected": _json([]),
        "smc_fvg_count": 0, "smc_ob_count": 0, "smc_sweep_count": 0, "smc_golden_setup": False, "smc_detail": _json({}),
        "btc_trend": btc_ctx["btc_trend"], "btc_dom_trend": btc_ctx["btc_dom_trend"],
        "fear_greed": btc_ctx["fear_greed"], "atr_percentile": round(atr_pct, 1),
        "confluence_notes": " | ".join(all_notes[:5]), "warnings": warnings,
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
    parser = argparse.ArgumentParser(description="LuxQuant Enrichment Worker v2.1")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--signal-id", type=str)
    parser.add_argument("--backtest", action="store_true")
    args = parser.parse_args()
    if args.signal_id: asyncio.run(run_single(args.signal_id))
    elif args.backtest: asyncio.run(run_backtest())
    elif args.loop: asyncio.run(run_loop())
    else: asyncio.run(run_once())