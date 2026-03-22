"""
LuxQuant Enrichment Worker v2.1
================================
Worker terpisah yang monitor database untuk signal baru,
fetch OHLCV dari Binance, run multi-factor analysis,
dan store enrichment score ke database.

Flow:
  - Poll DB tiap 30 detik
  - Signal baru (enrichment_status='pending') → fetch OHLCV → analyze → store
  - Signal update (status changed) → re-analyze → update enrichment
  - Skip signal kalau pair terlalu illiquid

Usage:
    # Run sekali (process pending signals)
    python enrichment_worker.py

    # Run terus (loop tiap 30 detik)
    python enrichment_worker.py --loop

    # Run untuk signal tertentu
    python enrichment_worker.py --signal-id abc123

    # Backtest: score all historical closed signals
    python enrichment_worker.py --backtest

Requirements:
    pip install pandas numpy ta smartmoneyconcepts ccxt scipy psycopg2-binary sqlalchemy httpx
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

BINANCE_BASE = "https://fapi.binance.com"  # Futures API (pairs end with USDT)
POLL_INTERVAL = 30          # seconds between polls
BATCH_LIMIT = 5             # max signals per poll cycle
ENRICHMENT_VERSION = "v2.1"

# Logging
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
# SECTION 1: DATABASE QUERIES
# ============================================================

def get_pending_signals(limit: int = 5) -> list:
    """Get signals that need enrichment analysis."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, risk_level, created_at
            FROM signals
            WHERE enrichment_status = 'pending'
              AND pair IS NOT NULL
              AND entry IS NOT NULL
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def get_changed_signals(limit: int = 5) -> list:
    """Get signals whose status changed after enrichment (for re-analysis)."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT s.signal_id, s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
                   s.stop1, s.status, s.risk_level, s.created_at
            FROM signals s
            JOIN signal_enrichment e ON s.signal_id = e.signal_id
            WHERE s.enrichment_status = 'done'
              AND s.status IN ('tp1', 'tp2', 'tp3')
              AND e.analyzed_at < NOW() - INTERVAL '1 hour'
            ORDER BY s.created_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def get_signal_by_id(signal_id: str) -> dict:
    """Get a specific signal for manual processing."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, risk_level, created_at
            FROM signals
            WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()
    return dict(row._mapping) if row else None


def get_all_closed_signals() -> list:
    """Get all closed signals for backtest scoring."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, status, risk_level, created_at
            FROM signals
            WHERE status IN ('closed_win', 'closed_loss')
              AND pair IS NOT NULL
              AND entry IS NOT NULL
            ORDER BY created_at ASC
        """)).fetchall()
    return [dict(row._mapping) for row in rows]


def update_enrichment_status(signal_id: str, status: str):
    """Update enrichment_status on signals table."""
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE signals SET enrichment_status = :status
            WHERE signal_id = :sid
        """), {"status": status, "sid": signal_id})


def upsert_enrichment(result: dict):
    """Insert or update enrichment result."""
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO signal_enrichment (
                signal_id, pair, confidence_score, rating, regime,
                score_breakdown, weights_used,
                mtf_h4_trend, mtf_h1_trend, mtf_m15_trend, signal_direction, mtf_detail,
                patterns_detected,
                smc_fvg_count, smc_ob_count, smc_sweep_count, smc_golden_setup, smc_detail,
                btc_trend, btc_dom_trend, fear_greed, atr_percentile,
                confluence_notes, warnings,
                analyzed_at, enrichment_version
            ) VALUES (
                :signal_id, :pair, :confidence_score, :rating, :regime,
                :score_breakdown, :weights_used,
                :mtf_h4_trend, :mtf_h1_trend, :mtf_m15_trend, :signal_direction, :mtf_detail,
                :patterns_detected,
                :smc_fvg_count, :smc_ob_count, :smc_sweep_count, :smc_golden_setup, :smc_detail,
                :btc_trend, :btc_dom_trend, :fear_greed, :atr_percentile,
                :confluence_notes, :warnings,
                :analyzed_at, :enrichment_version
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

# Map interval strings to ccxt format
INTERVAL_MAP = {"15m": "15m", "1h": "1h", "4h": "4h"}

# Pair name fixes: DB format → exchange format
def _normalize_pair(pair: str) -> str:
    """Convert DB pair format to ccxt symbol format."""
    p = pair.upper().replace("/", "")
    if not p.endswith("USDT"):
        p = p + "USDT" if "USDT" not in p else p
    # ccxt format: BASE/QUOTE
    base = p.replace("USDT", "")
    return f"{base}/USDT"


async def fetch_ohlcv(pair: str, interval: str, limit: int = 150) -> pd.DataFrame:
    """
    Fetch OHLCV klines via ccxt.
    Try Binance first, fallback to Bybit if pair not found.
    """
    symbol = _normalize_pair(pair)
    tf = INTERVAL_MAP.get(interval, interval)
    
    # Try Binance first
    for ExchangeClass in [ccxt_async.bybit]:
        exchange = ExchangeClass({"enableRateLimit": True})
        try:
            ohlcv = await exchange.fetch_ohlcv(symbol, tf, limit=limit)
            await exchange.close()
            
            if not ohlcv:
                continue
            
            df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
            df["open_time"] = pd.to_datetime(df["timestamp"], unit="ms")
            df = df[["open_time", "open", "high", "low", "close", "volume"]].copy()
            df = df.dropna(subset=["close"])
            
            if len(df) >= 50:
                return df
                
        except Exception as e:
            await exchange.close()
            logger.debug(f"  {ExchangeClass.__name__} failed for {symbol} {tf}: {e}")
            continue
    
    logger.warning(f"All exchanges failed for {pair} {interval}")
    return pd.DataFrame()


async def fetch_24h_volume(pair: str) -> float:
    """Fetch 24h USD volume via ccxt."""
    symbol = _normalize_pair(pair)
    
    for ExchangeClass in [ccxt_async.bybit]:
        exchange = ExchangeClass({"enableRateLimit": True})
        try:
            ticker = await exchange.fetch_ticker(symbol)
            await exchange.close()
            vol = ticker.get("quoteVolume", 0) or 0
            return float(vol)
        except Exception as e:
            await exchange.close()
            logger.debug(f"  Volume fetch failed {ExchangeClass.__name__} {symbol}: {e}")
            continue
    
    logger.warning(f"Failed to fetch 24h volume for {pair}")
    return 0


# ============================================================
# SECTION 3: MARKET CONTEXT FETCHER (from Redis cache)
# ============================================================

def get_btc_context() -> dict:
    """
    Get BTC trend + dominance from existing Redis cache.
    Falls back to neutral if unavailable.
    """
    import redis
    
    try:
        r = redis.Redis(host="127.0.0.1", port=6379, decode_responses=True)
        
        # BTC ticker from existing cache
        btc_data = r.get("lq:coingecko:coin-info:BTCUSDT")
        btc_price_change = 0
        if btc_data:
            info = json.loads(btc_data)
            btc_price_change = info.get("price_change_percentage_24h", 0) or 0
        
        # BTC dominance from global data
        global_data = r.get("lq:market:global")
        btc_dom_change = 0
        if global_data:
            gd = json.loads(global_data)
            btc_dom_change = gd.get("btc_dominance_change_24h", 0) or 0
        
        # Fear & Greed
        fg_data = r.get("lq:market:fear-greed")
        fear_greed = None
        if fg_data:
            fg = json.loads(fg_data)
            fear_greed = fg.get("value")
        
        # Determine BTC trend
        if btc_price_change > 2:
            btc_trend = "BULLISH"
        elif btc_price_change < -2:
            btc_trend = "BEARISH"
        else:
            btc_trend = "RANGING"
        
        # Determine BTC dominance trend
        if btc_dom_change > 0.3:
            btc_dom_trend = "RISING"
        elif btc_dom_change < -0.3:
            btc_dom_trend = "FALLING"
        else:
            btc_dom_trend = "FLAT"
        
        return {
            "btc_trend": btc_trend,
            "btc_dom_trend": btc_dom_trend,
            "fear_greed": int(fear_greed) if fear_greed else None,
        }
    
    except Exception as e:
        logger.warning(f"Redis BTC context unavailable: {e}")
        return {
            "btc_trend": "RANGING",
            "btc_dom_trend": "FLAT",
            "fear_greed": None,
        }


# ============================================================
# SECTION 4: ENRICHMENT PIPELINE
# ============================================================

async def enrich_signal(signal: dict) -> dict:
    """
    Full enrichment pipeline for one signal.
    
    Steps:
        1. Pre-filter: liquidity check
        2. Fetch OHLCV (M15, H1, H4) from Binance
        3. Pre-filter: data quality check
        4. Detect volatility regime → select weights
        5. Run trend detection per TF
        6. Detect patterns (TODO: phase 2)
        7. Detect SMC zones (TODO: phase 2)
        8. Get BTC market context
        9. Score all 6 categories
        10. Aggregate → return result
    """
    sid = signal["signal_id"]
    pair = signal["pair"]
    
    logger.info(f"[ENRICH] {pair} ({sid[:8]}...) starting...")
    
    # ── Import scoring engine ──
    # For now, inline scoring. Will be separate module in phase 2.
    import ta as ta_lib
    
    # ── Step 1: Liquidity pre-filter ──
    volume_24h = await fetch_24h_volume(pair)
    
    if volume_24h < 100_000:
        logger.info(f"[ENRICH] {pair} SKIPPED — 24h vol ${volume_24h:,.0f} < $100k")
        return _build_skip_result(signal, f"Pair too illiquid (24h vol: ${volume_24h:,.0f})")
    
    liq_cap = 100
    if volume_24h < 500_000:
        liq_cap = 50
    elif volume_24h < 2_000_000:
        liq_cap = 70
    
    # ── Step 2: Fetch OHLCV ──
    try:
        m15_df, h1_df, h4_df = await asyncio.gather(
            fetch_ohlcv(pair, "15m", 150),
            fetch_ohlcv(pair, "1h", 150),
            fetch_ohlcv(pair, "4h", 150),
        )
    except Exception as e:
        logger.error(f"[ENRICH] {pair} OHLCV fetch failed: {e}")
        return _build_skip_result(signal, f"OHLCV fetch failed: {e}")
    
    # ── Step 3: Data quality check ──
    for label, df in [("M15", m15_df), ("H1", h1_df), ("H4", h4_df)]:
        if len(df) < 100:
            logger.warning(f"[ENRICH] {pair} {label} only {len(df)} candles")
            return _build_skip_result(signal, f"{label} data insufficient ({len(df)} candles)")
    
    # ── Step 4: Volatility regime ──
    atr_h4 = ta_lib.volatility.average_true_range(h4_df["high"], h4_df["low"], h4_df["close"], window=14)
    current_atr = atr_h4.iloc[-1]
    lookback = min(100, len(atr_h4))
    atr_percentile = float((atr_h4.iloc[-lookback:] < current_atr).sum() / lookback * 100)
    
    if atr_percentile >= 80:
        regime = "high_vol"
        weights = {"mtf": 30, "pattern": 15, "smc": 15, "momentum": 15, "context": 15, "fresh": 10}
    elif atr_percentile <= 20:
        regime = "low_vol"
        weights = {"mtf": 20, "pattern": 15, "smc": 20, "momentum": 20, "context": 15, "fresh": 10}
    else:
        regime = "normal"
        weights = {"mtf": 25, "pattern": 20, "smc": 20, "momentum": 15, "context": 10, "fresh": 10}
    
    # ── Step 5: Trend detection per TF ──
    def _detect(df):
        close = df["close"]
        high = df["high"]
        low = df["low"]
        
        ema20 = ta_lib.trend.ema_indicator(close, window=20).iloc[-1]
        ema50 = ta_lib.trend.ema_indicator(close, window=50).iloc[-1]
        atr = ta_lib.volatility.average_true_range(high, low, close, window=14).iloc[-1]
        rsi = ta_lib.momentum.rsi(close, window=14).iloc[-1]
        macd_hist = ta_lib.trend.macd_diff(close).iloc[-1]
        
        ema_aligned = ema20 > ema50
        ema_gap_atr = abs(ema20 - ema50) / atr if atr > 0 else 0
        macd_norm = macd_hist / atr if atr > 0 else 0
        
        if ema_gap_atr < 0.5:
            trend = "RANGING"
        elif close.iloc[-1] > ema20 and ema_aligned:
            trend = "BULLISH"
        elif close.iloc[-1] < ema20 and not ema_aligned:
            trend = "BEARISH"
        else:
            trend = "RANGING"
        
        swing_high = high.rolling(20).max().iloc[-1]
        swing_low = low.rolling(20).min().iloc[-1]
        dist_res = (swing_high - close.iloc[-1]) / atr if atr > 0 else 999
        dist_sup = (close.iloc[-1] - swing_low) / atr if atr > 0 else 999
        
        near_res = dist_res < 1.0
        near_sup = dist_sup < 1.0
        key_level = "resistance" if near_res and (not near_sup or dist_res < dist_sup) else \
                    ("support" if near_sup else None)
        
        return {
            "trend": trend, "ema_aligned": ema_aligned,
            "ema_gap_atr": round(ema_gap_atr, 3),
            "rsi": round(float(rsi), 2),
            "macd_norm": round(float(macd_norm), 4),
            "atr": float(atr),
            "near_key_level": near_res or near_sup,
            "key_level_type": key_level,
        }
    
    h4_info = _detect(h4_df)
    h1_info = _detect(h1_df)
    m15_info = _detect(m15_df)
    
    # Determine signal direction
    entry = signal.get("entry", 0)
    t1 = signal.get("target1")
    s1 = signal.get("stop1")
    if t1 and t1 > entry:
        sig_dir = "BULLISH"
    elif t1 and t1 < entry:
        sig_dir = "BEARISH"
    elif s1 and s1 < entry:
        sig_dir = "BULLISH"
    else:
        sig_dir = "BULLISH"
    
    # ── Step 6 & 7: Pattern + SMC detection (placeholder — phase 2) ──
    # For now, score 0 for these categories. Will be filled when detection modules are built.
    patterns_detected = []
    fvg_zones = []
    ob_zones = []
    liq_sweeps = []
    
    # ── Step 8: Market context ──
    btc_ctx = get_btc_context()
    
    # ── Step 9: Score all categories ──
    a_score, a_notes = _score_mtf(h4_info, h1_info, sig_dir, weights["mtf"])
    b_score, b_notes = 0, ["Pattern detection not yet implemented (phase 2)"]
    c_score, c_notes = 0, ["SMC detection not yet implemented (phase 2)"]
    d_score, d_notes = _score_momentum(h4_info, h1_info, m15_df, sig_dir, weights["momentum"])
    e_score, e_notes = _score_context(btc_ctx, signal["pair"], sig_dir, weights["context"])
    f_score, f_notes = _score_freshness(signal, atr_percentile, weights["fresh"])
    
    all_notes = a_notes + b_notes + c_notes + d_notes + e_notes + f_notes
    
    # ── Step 10: Aggregate ──
    raw_total = a_score + b_score + c_score + d_score + e_score + f_score
    total = min(raw_total, liq_cap)
    
    if total >= 70:
        rating = "STRONG"
    elif total >= 55:
        rating = "MODERATE"
    elif total >= 40:
        rating = "WEAK"
    elif total >= 25:
        rating = "LOW"
    else:
        rating = "AVOID"
    
    warnings = []
    if liq_cap < 100:
        warnings.append(f"Low liquidity cap: {liq_cap}")
    
    result = {
        "signal_id": sid,
        "pair": pair,
        "confidence_score": total,
        "rating": rating,
        "regime": regime,
        "score_breakdown": json.dumps({
            "mtf": {"score": a_score, "max": weights["mtf"]},
            "pattern": {"score": b_score, "max": weights["pattern"]},
            "smc": {"score": c_score, "max": weights["smc"]},
            "momentum": {"score": d_score, "max": weights["momentum"]},
            "context": {"score": e_score, "max": weights["context"]},
            "freshness": {"score": f_score, "max": weights["fresh"]},
        }),
        "weights_used": json.dumps(weights),
        "mtf_h4_trend": h4_info["trend"],
        "mtf_h1_trend": h1_info["trend"],
        "mtf_m15_trend": m15_info["trend"],
        "signal_direction": sig_dir,
        "mtf_detail": json.dumps({"h4": h4_info, "h1": h1_info, "m15": m15_info}),
        "patterns_detected": json.dumps(patterns_detected),
        "smc_fvg_count": len(fvg_zones),
        "smc_ob_count": len(ob_zones),
        "smc_sweep_count": len(liq_sweeps),
        "smc_golden_setup": False,
        "smc_detail": json.dumps({}),
        "btc_trend": btc_ctx["btc_trend"],
        "btc_dom_trend": btc_ctx["btc_dom_trend"],
        "fear_greed": btc_ctx["fear_greed"],
        "atr_percentile": round(atr_percentile, 1),
        "confluence_notes": " | ".join(all_notes[:5]),
        "warnings": warnings,
        "analyzed_at": datetime.now(timezone.utc),
        "enrichment_version": ENRICHMENT_VERSION,
    }
    
    logger.info(f"[ENRICH] {pair} → score={total} rating={rating} regime={regime}")
    return result


# ============================================================
# SECTION 5: INLINE SCORING FUNCTIONS (simplified from formula v2.1)
# ============================================================

def _score_mtf(h4: dict, h1: dict, sig_dir: str, max_pts: int) -> tuple:
    notes = []
    score = 0
    
    # Full alignment
    if h4["trend"] == h1["trend"] == sig_dir:
        score += int(max_pts * 0.72)
        notes.append(f"Full MTF alignment ({sig_dir})")
    elif h4["trend"] == sig_dir:
        score += int(max_pts * 0.48)
        notes.append(f"H4 aligned ({sig_dir})")
    elif h1["trend"] == sig_dir and h4["trend"] == "RANGING":
        score += int(max_pts * 0.28)
        notes.append(f"H1 aligned, H4 ranging")
    elif h4["trend"] != "RANGING" and h4["trend"] != sig_dir:
        notes.append(f"⚠ Signal against H4 trend ({h4['trend']})")
    
    # EMA bonus
    h4_ema_ok = (h4["ema_aligned"] and sig_dir == "BULLISH") or (not h4["ema_aligned"] and sig_dir == "BEARISH")
    h1_ema_ok = (h1["ema_aligned"] and sig_dir == "BULLISH") or (not h1["ema_aligned"] and sig_dir == "BEARISH")
    if h4_ema_ok and h1_ema_ok:
        score += int(max_pts * 0.16)
    elif h4_ema_ok or h1_ema_ok:
        score += int(max_pts * 0.08)
    
    # Key level penalty
    if sig_dir == "BULLISH" and h4.get("near_key_level") and h4.get("key_level_type") == "resistance":
        penalty = int(max_pts * 0.32)
        score -= penalty
        notes.append(f"⚠ Bullish near H4 resistance (-{penalty})")
    elif sig_dir == "BEARISH" and h4.get("near_key_level") and h4.get("key_level_type") == "support":
        penalty = int(max_pts * 0.32)
        score -= penalty
        notes.append(f"⚠ Bearish near H4 support (-{penalty})")
    
    if h4["trend"] == "RANGING":
        score -= int(max_pts * 0.12)
    
    return (max(0, min(max_pts, score)), notes)


def _score_momentum(h4: dict, h1: dict, m15_df: pd.DataFrame, sig_dir: str, max_pts: int) -> tuple:
    import ta as ta_lib
    notes = []
    score = 0
    is_bull = sig_dir == "BULLISH"
    
    # RSI health
    rsi_h4, rsi_h1 = h4["rsi"], h1["rsi"]
    if is_bull:
        healthy = 35 < rsi_h4 < 70 and 35 < rsi_h1 < 70
        exhausted = rsi_h4 > 75
    else:
        healthy = 30 < rsi_h4 < 65 and 30 < rsi_h1 < 65
        exhausted = rsi_h4 < 25
    
    if healthy:
        score += int(max_pts * 0.20)
        notes.append(f"RSI healthy H4={rsi_h4:.0f} H1={rsi_h1:.0f}")
    if exhausted:
        score -= int(max_pts * 0.15)
        notes.append(f"⚠ RSI exhausted H4={rsi_h4:.0f}")
    
    # MACD alignment
    macd_ok = (is_bull and h4["macd_norm"] > 0 and h1["macd_norm"] > 0) or \
              (not is_bull and h4["macd_norm"] < 0 and h1["macd_norm"] < 0)
    if macd_ok:
        score += int(max_pts * 0.20)
        notes.append("MACD confirms H4+H1")
    
    # Conflict penalty
    rsi_bull = rsi_h4 < 65
    macd_bull = h4["macd_norm"] > 0
    if rsi_bull != macd_bull:
        score -= int(max_pts * 0.10)
        notes.append("⚠ RSI/MACD conflict")
    
    # Volume
    vol = m15_df["volume"]
    if len(vol) >= 20:
        vol_avg = vol.rolling(20).mean().iloc[-1]
        vol_ratio = vol.iloc[-1] / vol_avg if vol_avg > 0 else 1
        if vol_ratio >= 2.0:
            score += int(max_pts * 0.25)
            notes.append(f"Volume spike {vol_ratio:.1f}x")
        elif vol_ratio >= 1.5:
            score += int(max_pts * 0.15)
        elif vol_ratio < 0.5:
            score -= int(max_pts * 0.12)
            notes.append(f"⚠ Low volume {vol_ratio:.1f}x")
        
        # 3-bar increase
        if len(vol) >= 3 and vol.iloc[-1] > vol.iloc[-2] > vol.iloc[-3]:
            score += int(max_pts * 0.10)
    
    return (max(0, min(max_pts, score)), notes)


def _score_context(btc_ctx: dict, pair: str, sig_dir: str, max_pts: int) -> tuple:
    notes = []
    score = int(max_pts * 0.50)
    is_bull = sig_dir == "BULLISH"
    is_btc = "BTC" in pair and "USDT" in pair
    
    bt = btc_ctx["btc_trend"]
    bd = btc_ctx["btc_dom_trend"]
    fg = btc_ctx.get("fear_greed")
    
    if is_btc:
        if bt == sig_dir:
            score += int(max_pts * 0.50)
        elif bt not in ("RANGING", sig_dir):
            score -= int(max_pts * 0.40)
        return (max(0, min(max_pts, score)), notes)
    
    # Altcoin logic
    if is_bull:
        if bt == "BEARISH" and bd == "RISING":
            score -= int(max_pts * 0.50)
            notes.append("⚠ Risk-off: BTC bear + dom rising")
        elif bt == "BULLISH" and bd == "FALLING":
            score += int(max_pts * 0.50)
            notes.append("Alt season conditions")
        elif bt == "BULLISH" and bd == "RISING":
            score += int(max_pts * 0.20)
    else:
        if bt == "BEARISH":
            score += int(max_pts * 0.30)
        elif bt == "BULLISH" and bd == "FALLING":
            score -= int(max_pts * 0.30)
    
    # Fear & Greed
    if fg is not None:
        if fg < 20 and is_bull:
            score += int(max_pts * 0.15)
            notes.append(f"Extreme fear ({fg}) contrarian edge")
        elif fg > 80 and is_bull:
            score -= int(max_pts * 0.15)
            notes.append(f"⚠ Extreme greed ({fg})")
    
    return (max(0, min(max_pts, score)), notes)


def _score_freshness(signal: dict, atr_pct: float, max_pts: int) -> tuple:
    notes = []
    score = int(max_pts * 0.50)
    
    created = signal.get("created_at")
    if created:
        try:
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            age_min = (datetime.now(timezone.utc) - created).total_seconds() / 60
        except Exception:
            age_min = 60  # fallback
    else:
        age_min = 60
    
    if age_min <= 15:
        score += int(max_pts * 0.25)
        notes.append(f"Fresh signal ({age_min:.0f}min)")
    elif age_min <= 60:
        score += int(max_pts * 0.10)
    elif age_min > 240:
        score -= int(max_pts * 0.25)
        notes.append(f"⚠ Stale ({age_min/60:.1f}hrs)")
    
    if atr_pct >= 85:
        score -= int(max_pts * 0.25)
        notes.append(f"⚠ Extreme volatility (P{atr_pct:.0f})")
    elif 55 <= atr_pct <= 80:
        score += int(max_pts * 0.15)
    elif atr_pct <= 15:
        score -= int(max_pts * 0.20)
        notes.append(f"⚠ Too quiet (P{atr_pct:.0f})")
    
    return (max(0, min(max_pts, score)), notes)


def _build_skip_result(signal: dict, reason: str) -> dict:
    return {
        "signal_id": signal["signal_id"],
        "pair": signal["pair"],
        "confidence_score": 0,
        "rating": "AVOID",
        "regime": "skip",
        "score_breakdown": json.dumps({}),
        "weights_used": json.dumps({}),
        "mtf_h4_trend": None, "mtf_h1_trend": None, "mtf_m15_trend": None,
        "signal_direction": None,
        "mtf_detail": json.dumps({}),
        "patterns_detected": json.dumps([]),
        "smc_fvg_count": 0, "smc_ob_count": 0, "smc_sweep_count": 0,
        "smc_golden_setup": False, "smc_detail": json.dumps({}),
        "btc_trend": None, "btc_dom_trend": None, "fear_greed": None,
        "atr_percentile": None,
        "confluence_notes": reason,
        "warnings": [reason],
        "analyzed_at": datetime.now(timezone.utc),
        "enrichment_version": ENRICHMENT_VERSION,
    }


# ============================================================
# SECTION 6: MAIN LOOP
# ============================================================

async def process_signal(signal: dict) -> bool:
    """Process one signal through enrichment pipeline."""
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


async def run_once() -> int:
    """Process all pending signals once."""
    processed = 0
    
    # New signals
    pending = get_pending_signals(limit=BATCH_LIMIT)
    for signal in pending:
        if await process_signal(signal):
            processed += 1
        await asyncio.sleep(1)  # rate limit Binance
    
    # Re-analyze changed signals
    changed = get_changed_signals(limit=BATCH_LIMIT)
    for signal in changed:
        if await process_signal(signal):
            processed += 1
        await asyncio.sleep(1)
    
    return processed


async def run_loop():
    """Run continuously, polling every POLL_INTERVAL seconds."""
    logger.info(f"Enrichment Worker v{ENRICHMENT_VERSION} started — polling every {POLL_INTERVAL}s")
    
    while True:
        try:
            count = await run_once()
            if count > 0:
                logger.info(f"Processed {count} signals")
        except Exception as e:
            logger.error(f"Poll error: {e}")
            traceback.print_exc()
        
        await asyncio.sleep(POLL_INTERVAL)


async def run_single(signal_id: str):
    """Process a specific signal."""
    signal = get_signal_by_id(signal_id)
    if not signal:
        logger.error(f"Signal {signal_id} not found")
        return
    
    logger.info(f"Processing: {signal['pair']} (status={signal['status']})")
    await process_signal(signal)


async def run_backtest():
    """Score all closed signals for backtest validation."""
    signals = get_all_closed_signals()
    logger.info(f"Backtest: {len(signals)} closed signals to score")
    
    results = []
    for i, signal in enumerate(signals):
        try:
            result = await enrich_signal(signal)
            upsert_enrichment(result)
            results.append({
                "score": result["confidence_score"],
                "rating": result["rating"],
                "outcome": signal["status"],
            })
            if (i + 1) % 10 == 0:
                logger.info(f"Backtest progress: {i+1}/{len(signals)}")
            await asyncio.sleep(0.5)  # rate limit
        except Exception as e:
            logger.error(f"Backtest error {signal['pair']}: {e}")
    
    # Print validation
    from collections import defaultdict
    tiers = defaultdict(lambda: {"total": 0, "wins": 0})
    for r in results:
        tiers[r["rating"]]["total"] += 1
        if r["outcome"] == "closed_win":
            tiers[r["rating"]]["wins"] += 1
    
    logger.info("=" * 50)
    logger.info("BACKTEST RESULTS")
    logger.info("=" * 50)
    for tier in ["STRONG", "MODERATE", "WEAK", "LOW", "AVOID"]:
        d = tiers[tier]
        wr = (d["wins"] / d["total"] * 100) if d["total"] > 0 else 0
        logger.info(f"  {tier:10s}: {d['total']:4d} signals | {d['wins']:4d} wins | WR={wr:.1f}%")
    logger.info("=" * 50)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LuxQuant Enrichment Worker v2.1")
    parser.add_argument("--loop", action="store_true", help="Run continuously")
    parser.add_argument("--signal-id", type=str, help="Process specific signal ID")
    parser.add_argument("--backtest", action="store_true", help="Score all closed signals for validation")
    args = parser.parse_args()
    
    if args.signal_id:
        asyncio.run(run_single(args.signal_id))
    elif args.backtest:
        asyncio.run(run_backtest())
    elif args.loop:
        asyncio.run(run_loop())
    else:
        asyncio.run(run_once())