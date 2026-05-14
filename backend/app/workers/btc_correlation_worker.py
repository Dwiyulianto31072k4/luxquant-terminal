#!/usr/bin/env python3
"""
LuxQuant BTC Correlation Worker (v2.0 — Advanced)
==================================================
Computes advanced BTC-correlation analytics for trade decisions:

CORE METRICS:
  • Pearson correlation (short 7d / long 30d)
  • Beta (volatility multiplier)
  • R² (explained variance)
  • Correlation z-score (decoupling detection)

ADVANCED METRICS:
  • Tail correlation (separate ρ for BTC up-days and down-days)
  • Downside beta (asymmetric risk indicator — critical for crypto)
  • Lead/lag analysis (does coin LEAD or LAG BTC?)
  • Volatility ratio + absolute coin vol
  • 7-day momentum divergence (vs BTC)
  • Extended/overheated detection
  • Expected move range (24h, using beta × BTC implied vol)
  • BTC invalidation level (what BTC level would invalidate this trade)

DATA QUALITY:
  • confidence level (high/medium/low/insufficient_data)
  • mapping anomaly detection (e.g. HUSDT → ethereum)
  • Skip insert when sample_size < 100

INFRASTRUCTURE:
  • Shared http_client + Redis cache (project pattern)
  • LISTEN/NOTIFY on 'new_signal'
"""
import os
import re
import sys
import json
import asyncio
import logging
from typing import Optional, Tuple, Dict, Any

import asyncpg
import httpx
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.http_client import init_clients, close_clients, get_binance_client, get_coingecko_client
from app.core.redis import cache_get, cache_set, is_redis_available
from app.config import settings

# ============================================================
# Configuration
# ============================================================
DB_DSN              = os.getenv("DATABASE_URL") or getattr(settings, "DATABASE_URL", None)
NOTIFY_CHANNEL      = os.getenv("CORR_CHANNEL", "new_signal")
COINGECKO_BASE      = "https://api.coingecko.com/api/v3"
BINANCE_BASE        = "https://api.binance.com"
COINGECKO_API_KEY   = os.getenv("COINGECKO_API_KEY") or getattr(settings, "COINGECKO_API_KEY", "")
WORKER_VERSION      = "v2.0"

CACHE_BTC_1H_KEY    = "lq:correlation:btc_1h_ohlc"
CACHE_BTC_1H_TTL    = 300
CACHE_DOMINANCE_KEY = "lq:correlation:btc_dominance"
CACHE_DOMINANCE_TTL = 600
CACHE_COIN_PREFIX   = "lq:correlation:coin_ohlc:"
CACHE_COIN_TTL      = 600

# Window sizes (in 1h candles)
SHORT_WINDOW = 168     # 7 days
LONG_WINDOW  = 720     # 30 days
BASELINE_WIN = 60
MAX_LEAD_LAG = 6       # check ±6h lead/lag

# Quality thresholds
MIN_TO_INSERT_HIGH = 500    # high confidence
MIN_TO_INSERT_MED  = 200    # medium confidence
MIN_TO_INSERT_LOW  = 100    # low confidence; below = insufficient_data, SKIP

# Tail thresholds
BTC_BIG_DOWN = -0.03   # daily ret threshold for "BTC down" regime
BTC_BIG_UP   =  0.03

COINGECKO_MIN_GAP = float(os.getenv("COINGECKO_MIN_GAP", "2.5"))
QUOTE_RE          = re.compile(r"(USDT|USDC|BUSD|USD)$")

LOG_DIR = os.getenv("LOG_DIR", "/var/log/luxquant-sync")
try:
    os.makedirs(LOG_DIR, exist_ok=True)
    handlers = [
        logging.FileHandler(os.path.join(LOG_DIR, "btc-correlation-worker.log")),
        logging.StreamHandler(),
    ]
except Exception:
    handlers = [logging.StreamHandler()]

logging.basicConfig(
    level=os.getenv("CORR_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=handlers,
)
log = logging.getLogger("btc_correlation")


# ============================================================
# CoinGecko auth + throttle
# ============================================================
_cg_lock         = asyncio.Lock()
_cg_last_call_ts = 0.0


def _coingecko_headers() -> dict:
    if not COINGECKO_API_KEY:
        return {}
    if COINGECKO_API_KEY.startswith("CG-"):
        return {"x-cg-demo-api-key": COINGECKO_API_KEY}
    return {"x-cg-pro-api-key": COINGECKO_API_KEY}


async def _cg_throttle():
    global _cg_last_call_ts
    async with _cg_lock:
        loop = asyncio.get_event_loop()
        now  = loop.time()
        wait = (_cg_last_call_ts + COINGECKO_MIN_GAP) - now
        if wait > 0:
            await asyncio.sleep(wait)
        _cg_last_call_ts = loop.time()


# ============================================================
# Data fetch helpers (shared clients + Redis cache)
# ============================================================
def _df_from_records(records: list) -> pd.DataFrame:
    df = pd.DataFrame(records, columns=["timestamp", "close"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df["close"]     = df["close"].astype(float)
    return df


def _df_to_records(df: pd.DataFrame) -> list:
    out = df.copy()
    out["timestamp"] = (out["timestamp"].astype("int64") // 10**6).astype("int64")
    return out[["timestamp", "close"]].values.tolist()


async def fetch_binance_klines(symbol_pair: str, interval: str = "1h",
                                limit: int = 1000) -> Optional[pd.DataFrame]:
    client = get_binance_client()
    try:
        r = await client.get(
            f"{BINANCE_BASE}/api/v3/klines",
            params={"symbol": symbol_pair, "interval": interval, "limit": limit},
        )
        if r.status_code == 400:
            return None
        r.raise_for_status()
        data = r.json()
        if not data:
            return None
        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "close_time", "qav", "trades", "tbbav", "tbqav", "ignore"
        ])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df["close"]     = df["close"].astype(float)
        return df[["timestamp", "close"]].copy()
    except Exception as e:
        log.warning(f"Binance fetch failed for {symbol_pair}: {e}")
        return None


async def fetch_btc_ohlc_cached() -> Optional[pd.DataFrame]:
    """Fetch BTC 1h OHLC from Binance.
    NOTE: Despite the name, we no longer cache to Redis — JSON round-trip
    of int64 timestamps causes subtle precision loss that breaks merge_asof.
    Shared Binance client (connection pool) makes raw fetch already fast (~150ms).
    Name kept for compatibility.
    """
    return await fetch_binance_klines("BTCUSDT", "1h", 1000)


async def fetch_coingecko_market_chart(coin_id: str, days: int = 30,
                                        max_retries: int = 3) -> Optional[pd.DataFrame]:
    """Fetch hourly price from CoinGecko.
    NOTE: We intentionally DO NOT cache per-coin OHLC to Redis. CoinGecko
    timestamps are sub-second precision; the int64 ms round-trip through JSON
    can shift them just enough to break merge_asof. BTC cache (which has
    hour-aligned timestamps) stays — that's where most savings are anyway.
    """
    client  = get_coingecko_client()
    url     = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart"
    headers = _coingecko_headers()
    params  = {"vs_currency": "usd", "days": days, "interval": "hourly"}

    backoff = 5.0
    for attempt in range(1, max_retries + 1):
        await _cg_throttle()
        try:
            r = await client.get(url, params=params, headers=headers)
            if r.status_code == 429:
                log.warning(f"  ⏳ CoinGecko 429 for {coin_id} (try {attempt}/{max_retries}); backoff {backoff:.0f}s")
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            r.raise_for_status()
            prices = r.json().get("prices", [])
            if not prices:
                return None
            return _df_from_records(prices)
        except httpx.HTTPStatusError as e:
            log.warning(f"CoinGecko HTTP error for {coin_id}: {e}")
            return None
        except Exception as e:
            log.warning(f"CoinGecko fetch failed for {coin_id}: {e}")
            return None
    return None


async def fetch_btc_dominance() -> Optional[float]:
    if is_redis_available():
        cached = cache_get(CACHE_DOMINANCE_KEY)
        if cached is not None:
            try:
                return float(cached)
            except Exception:
                pass

    try:
        await _cg_throttle()
        client = get_coingecko_client()
        r = await client.get(f"{COINGECKO_BASE}/global", headers=_coingecko_headers())
        r.raise_for_status()
        val = float(r.json()["data"]["market_cap_percentage"]["btc"])
        if is_redis_available():
            try:
                cache_set(CACHE_DOMINANCE_KEY, val, ttl=CACHE_DOMINANCE_TTL)
            except Exception:
                pass
        return val
    except Exception:
        return None


# ============================================================
# Mapping anomaly detection
# ============================================================
KNOWN_AMBIGUOUS_MAPPINGS = {
    # base_symbol → list of "wrong" coingecko_ids that often appear
    "H":   ["ethereum"],         # H token mistakenly mapped to ethereum
    "BTC": ["wrapped-bitcoin"],
    "ETH": ["staked-ether"],
}


def detect_mapping_anomaly(base_symbol: str, coingecko_id: Optional[str]) -> Optional[str]:
    if not coingecko_id:
        return None
    bs = base_symbol.upper()
    if bs in KNOWN_AMBIGUOUS_MAPPINGS and coingecko_id in KNOWN_AMBIGUOUS_MAPPINGS[bs]:
        return f"Likely wrong mapping: {bs} → {coingecko_id}"
    # Stock-tokenization (RWA): MSFT, AAPL, etc.
    if any(coingecko_id.startswith(p) for p in ("microsoft-", "apple-", "tesla-", "nvidia-", "google-")):
        return f"Tokenized stock detected (off-hours behavior different): {coingecko_id}"
    return None


# ============================================================
# Core metric computation
# ============================================================
def _merge_returns(coin_df: pd.DataFrame, btc_df: pd.DataFrame) -> pd.DataFrame:
    merged = pd.merge_asof(
        coin_df.sort_values("timestamp"),
        btc_df.sort_values("timestamp"),
        on="timestamp",
        suffixes=("_coin", "_btc"),
        tolerance=pd.Timedelta("2h"),
    ).dropna()
    merged["ret_coin"] = merged["close_coin"].pct_change()
    merged["ret_btc"]  = merged["close_btc"].pct_change()
    return merged.dropna(subset=["ret_coin", "ret_btc"])


def compute_lead_lag(rets: pd.DataFrame, max_lag: int = MAX_LEAD_LAG) -> int:
    """Find offset k where corr(coin_t, btc_{t-k}) is maximized.
    Positive k = coin LEADS BTC; negative = coin LAGS BTC."""
    if len(rets) < 100:
        return 0
    best_k, best_corr = 0, abs(rets["ret_coin"].corr(rets["ret_btc"]))
    for k in range(-max_lag, max_lag + 1):
        if k == 0:
            continue
        shifted = rets["ret_btc"].shift(-k)  # k>0 → btc future; if coin corr w/ future btc high → coin LEADS
        c = abs(rets["ret_coin"].corr(shifted))
        if pd.notna(c) and c > best_corr:
            best_corr, best_k = c, k
    return int(best_k)


def compute_advanced_metrics(coin_df: pd.DataFrame, btc_df: pd.DataFrame) -> Optional[dict]:
    merged = _merge_returns(coin_df, btc_df)
    sample_size = len(merged)

    # Build a "skeleton" result that always has all keys, NULL when not computable.
    base = {
        "corr_short":          None,
        "corr_long":           None,
        "beta":                None,
        "r_squared":           None,
        "z_score":             None,
        "tail_corr_down":      None,
        "tail_corr_up":        None,
        "downside_beta":       None,
        "lead_lag":            None,
        "coin_vol_pct":        None,
        "vol_ratio":           None,
        "momentum_div_7d":     None,
        "is_extended":         False,
        "sample_size":         int(sample_size),
        "daily_sample":        0,
        "btc_down_days":       0,
        "btc_up_days":         0,
        "insufficient":        sample_size < MIN_TO_INSERT_LOW,
    }

    if sample_size < MIN_TO_INSERT_LOW:
        return base

    rets  = merged[["ret_coin", "ret_btc"]]
    short = rets.tail(SHORT_WINDOW) if len(rets) >= SHORT_WINDOW else rets
    long_ = rets.tail(LONG_WINDOW)  if len(rets) >= LONG_WINDOW  else rets

    # Standard
    corr_short = float(short["ret_coin"].corr(short["ret_btc"]) or 0)
    corr_long  = float(long_["ret_coin"].corr(long_["ret_btc"]) or 0)
    var_btc    = float(long_["ret_btc"].var())
    cov        = float(long_["ret_coin"].cov(long_["ret_btc"]))
    beta       = cov / var_btc if var_btc > 0 else 0.0
    r_sq       = corr_long ** 2

    # Z-score
    rolling_corr = rets["ret_coin"].rolling(BASELINE_WIN).corr(rets["ret_btc"]).dropna()
    z_score = 0.0
    if len(rolling_corr) >= 30:
        m, s = float(rolling_corr.mean()), float(rolling_corr.std())
        z_score = (corr_short - m) / s if s > 0 else 0.0

    # ===== ADVANCED: Tail correlations =====
    merged_d = merged.set_index("timestamp").resample("D").agg({
        "close_coin": "last", "close_btc": "last"
    }).dropna()
    merged_d["ret_coin"] = merged_d["close_coin"].pct_change()
    merged_d["ret_btc"]  = merged_d["close_btc"].pct_change()
    daily = merged_d.dropna()

    btc_down = daily[daily["ret_btc"] < BTC_BIG_DOWN]
    btc_up   = daily[daily["ret_btc"] > BTC_BIG_UP]
    tail_corr_down = float(btc_down["ret_coin"].corr(btc_down["ret_btc"])) if len(btc_down) >= 5 else None
    tail_corr_up   = float(btc_up["ret_coin"].corr(btc_up["ret_btc"]))     if len(btc_up)   >= 5 else None

    downside_beta = None
    if len(btc_down) >= 5 and btc_down["ret_btc"].var() > 0:
        downside_beta = float(btc_down["ret_coin"].cov(btc_down["ret_btc"]) / btc_down["ret_btc"].var())

    lead_lag = compute_lead_lag(long_)

    vol_factor   = (24 * 365) ** 0.5
    coin_vol_ann = float(long_["ret_coin"].std() * vol_factor)
    btc_vol_ann  = float(long_["ret_btc"].std()  * vol_factor)
    vol_ratio    = (coin_vol_ann / btc_vol_ann) if btc_vol_ann > 0 else None

    if len(merged) >= SHORT_WINDOW:
        end   = merged.iloc[-1]
        start = merged.iloc[-SHORT_WINDOW]
        coin_7d = (end["close_coin"] / start["close_coin"] - 1) * 100
        btc_7d  = (end["close_btc"]  / start["close_btc"]  - 1) * 100
        mom_div = float(coin_7d - btc_7d)
    else:
        mom_div = 0.0

    return {
        **base,
        "corr_short":      round(corr_short, 4),
        "corr_long":       round(corr_long, 4),
        "beta":            round(beta, 4),
        "r_squared":       round(r_sq, 4),
        "z_score":         round(z_score, 4),
        "tail_corr_down":  round(tail_corr_down, 4) if tail_corr_down is not None else None,
        "tail_corr_up":    round(tail_corr_up, 4)   if tail_corr_up   is not None else None,
        "downside_beta":   round(downside_beta, 4)  if downside_beta  is not None else None,
        "lead_lag":        int(lead_lag),
        "coin_vol_pct":    round(coin_vol_ann * 100, 2),
        "vol_ratio":       round(vol_ratio, 4) if vol_ratio is not None else None,
        "momentum_div_7d": round(mom_div, 2),
        "is_extended":     bool(mom_div > 30.0),
        "daily_sample":    int(len(daily)),
        "btc_down_days":   int(len(btc_down)),
        "btc_up_days":     int(len(btc_up)),
        "insufficient":    False,
    }


def determine_confidence(m: dict) -> str:
    if m.get("insufficient") or m["sample_size"] < MIN_TO_INSERT_LOW:
        return "insufficient_data"
    if m["sample_size"] >= MIN_TO_INSERT_HIGH and m["daily_sample"] >= 20:
        return "high"
    if m["sample_size"] >= MIN_TO_INSERT_MED:
        return "medium"
    return "low"


def compute_btc_context(btc_df: pd.DataFrame, btc_dominance: Optional[float]) -> dict:
    closes  = btc_df["close"]
    current = float(closes.iloc[-1])

    if len(closes) >= 200:
        ema_200 = float(closes.ewm(span=200, adjust=False).mean().iloc[-1])
        trend   = "above_ema200" if current > ema_200 else "below_ema200"
    else:
        trend = "insufficient_data"

    delta  = closes.diff()
    gain   = delta.clip(lower=0).rolling(14).mean()
    loss   = (-delta.clip(upper=0)).rolling(14).mean()
    rs     = gain / loss.replace(0, np.nan)
    rsi    = 100 - (100 / (1 + rs))
    rsi_14 = float(rsi.iloc[-1]) if pd.notna(rsi.iloc[-1]) else 50.0

    change_24h = ((current - float(closes.iloc[-24])) / float(closes.iloc[-24]) * 100) \
                 if len(closes) >= 24 else 0.0

    if trend == "above_ema200" and rsi_14 < 70:
        regime = "risk_on_healthy"
    elif trend == "above_ema200":
        regime = "risk_on_overheated"
    elif trend == "below_ema200" and rsi_14 < 30:
        regime = "risk_off_oversold"
    elif trend == "below_ema200":
        regime = "risk_off"
    else:
        regime = "neutral"

    return {
        "price":          round(current, 2),
        "trend":          trend,
        "rsi_14":         round(rsi_14, 2),
        "change_24h_pct": round(change_24h, 2),
        "regime":         regime,
        "dominance":      round(btc_dominance, 2) if btc_dominance else None,
    }


# ============================================================
# Advanced interpretation generator (English)
# ============================================================
def generate_interpretation(metrics: dict, btc_ctx: dict, confidence: str,
                             mapping_warning: Optional[str]) -> dict:
    sample_size = metrics.get("sample_size", 0)

    if confidence == "insufficient_data":
        return {
            "alignment_score":  None,
            "risk_level":       "unknown",
            "confidence":       "insufficient_data",
            "headline":         "Insufficient historical data for analysis",
            "summary":          (
                f"Only {sample_size} hourly samples available — need at least {MIN_TO_INSERT_LOW} "
                f"for meaningful BTC correlation analysis. Coin may be too new, "
                f"data source incomplete, or trading volume too thin."
            ),
            "sizing_hint":      "Treat as standalone signal — no BTC correlation context available",
            "hedge_hint":       "Cannot assess BTC exposure with current data",
            "regime_warning":   None,
            "decoupling_note":  None,
            "trade_bias":       "Trade based on signal merit alone, not BTC correlation",
            "mapping_warning":  mapping_warning,
            "key_observations": [
                f"📊 Data limitation: only {sample_size} samples available (need ≥{MIN_TO_INSERT_LOW}). "
                f"Common reasons: new listing, low liquidity, or partial CoinGecko coverage."
            ],
            "btc_context_only": True,   # UI hint: show BTC context but skip correlation widgets
        }

    corr_long      = metrics["corr_long"]
    corr_short     = metrics["corr_short"]
    beta           = metrics["beta"]
    r_sq           = metrics["r_squared"]
    z              = metrics["z_score"]
    tail_down      = metrics.get("tail_corr_down")
    tail_up        = metrics.get("tail_corr_up")
    downside_beta  = metrics.get("downside_beta")
    lead_lag       = metrics.get("lead_lag", 0) or 0
    vol_ratio      = metrics.get("vol_ratio")
    mom_div        = metrics.get("momentum_div_7d", 0) or 0
    is_extended    = metrics.get("is_extended", False)

    abs_corr     = abs(corr_long)
    abs_z        = abs(z)
    regime       = btc_ctx["regime"]
    trend        = btc_ctx["trend"]
    is_decoupled = abs_z > 2 and abs_corr < 0.5

    # ===== Headline =====
    if abs_corr > 0.8 and beta > 1.5:
        if "risk_off" in regime:
            headline, risk_level = "Highly BTC-driven with amplified downside exposure", "high"
        else:
            headline, risk_level = "Highly BTC-driven with amplified upside potential", "medium"
    elif abs_corr > 0.8 and beta < 0.8:
        headline, risk_level = "BTC-aligned with dampened volatility (safer BTC proxy)", "low"
    elif is_decoupled:
        headline, risk_level = "Decoupled from BTC — possible idiosyncratic catalyst", "medium"
    elif abs_corr > 0.5:
        headline, risk_level = "Normal BTC alignment", "medium"
    else:
        headline, risk_level = "Weak BTC correlation — coin trading independently", "medium"

    # ===== Summary =====
    summary = (
        f"Correlation {corr_long:+.2f} with beta {beta:.2f}. "
        f"R² of {r_sq:.2f} means roughly {int(r_sq * 100)}% of price movement is explained by BTC."
    )
    if abs_z > 2:
        direction = "weaker" if z < 0 else "stronger"
        summary  += f" Current correlation is significantly {direction} than its 60-period baseline (z {z:+.2f})."

    # ===== Key observations (the trader's edge) =====
    observations = []

    # 1) Asymmetric tail risk — most critical insight
    if tail_down is not None and tail_up is not None:
        asymmetry = tail_down - tail_up
        if asymmetry > 0.2:
            observations.append(
                f"⚠️ Asymmetric BTC exposure: correlation in BTC-down days ({tail_down:.2f}) "
                f"is much higher than BTC-up days ({tail_up:.2f}). "
                f"Coin amplifies BTC dumps but doesn't fully participate in pumps."
            )
        elif asymmetry < -0.2:
            observations.append(
                f"✨ Favorable asymmetry: correlation in BTC-up days ({tail_up:.2f}) "
                f"exceeds BTC-down days ({tail_down:.2f}). Coin participates in rallies more than dumps."
            )

    # 2) Downside beta higher than overall — hidden risk
    if downside_beta is not None and beta > 0 and downside_beta > beta * 1.3:
        observations.append(
            f"⚠️ Downside beta ({downside_beta:.2f}) is significantly higher than overall beta ({beta:.2f}). "
            f"Coin dumps harder than BTC during stress."
        )
    elif downside_beta is not None and beta > 0 and downside_beta < beta * 0.7:
        observations.append(
            f"🛡️ Resilient downside profile: downside beta ({downside_beta:.2f}) lower than overall beta ({beta:.2f}). "
            f"Coin holds up better than BTC during stress."
        )

    # 3) Lead/lag
    if abs(lead_lag) >= 2:
        if lead_lag > 0:
            observations.append(
                f"🔮 Coin appears to LEAD BTC by ~{lead_lag}h — moves often precede BTC moves. "
                f"Watch coin as a potential BTC indicator."
            )
        else:
            observations.append(
                f"🐌 Coin LAGS BTC by ~{abs(lead_lag)}h — BTC moves first, coin follows. "
                f"Entry timing tip: wait for BTC confirmation."
            )

    # 4) Volatility profile
    if vol_ratio is not None:
        if vol_ratio > 2.5:
            observations.append(
                f"💥 Very high volatility: {vol_ratio:.1f}× BTC's volatility "
                f"(annualized {metrics['coin_vol_pct']:.0f}%). Wider stops & smaller size required."
            )
        elif vol_ratio < 0.7:
            observations.append(
                f"🌊 Low volatility: only {vol_ratio:.1f}× BTC's volatility "
                f"(annualized {metrics['coin_vol_pct']:.0f}%). Tight ranges, smaller moves."
            )

    # 5) Momentum divergence — extended entry warning
    if is_extended:
        observations.append(
            f"🔥 EXTENDED entry: coin outperformed BTC by {mom_div:+.1f}% in last 7d. "
            f"High mean-reversion risk — consider waiting for pullback."
        )
    elif mom_div < -20:
        observations.append(
            f"📉 Underperformed BTC by {mom_div:+.1f}% in 7d. "
            f"If BTC stays strong, coin may catch up (relative value), OR keeps lagging (weak fundamentals)."
        )

    # 6) BTC dominance signal
    dom = btc_ctx.get("dominance")
    if dom is not None and dom > 56:
        observations.append(
            f"📊 BTC dominance high ({dom:.1f}%) — altcoins generally underperform in this regime."
        )
    elif dom is not None and dom < 50:
        observations.append(
            f"📈 BTC dominance low ({dom:.1f}%) — capital rotation into altcoins, potential tailwind."
        )

    # ===== Sizing hint (considers downside beta now) =====
    effective_beta = downside_beta if downside_beta and downside_beta > beta else beta
    if effective_beta > 1.5:
        size_pct    = max(40, int(100 / effective_beta))
        sizing_hint = (f"Reduce position to ~{size_pct}% of standard size "
                       f"(effective beta {effective_beta:.2f} amplifies BTC risk).")
    elif effective_beta < 0.8 and abs_corr > 0.6:
        sizing_hint = "Standard or slightly larger position acceptable (low effective beta)"
    elif effective_beta < 0.5:
        sizing_hint = "Standard position — minimal BTC exposure"
    else:
        sizing_hint = "Standard position sizing — beta within normal range"

    # ===== Hedge hint =====
    if effective_beta > 1.3 and "risk_off" in regime:
        hedge_hint = "Strongly consider BTC short hedge — high beta in weak BTC regime"
    elif tail_down is not None and tail_down > 0.8 and effective_beta > 1.2:
        hedge_hint = "Tail correlation indicates BTC-dump amplification — small BTC short hedge advisable"
    elif effective_beta > 1.3:
        hedge_hint = "Optional BTC hedge if holding overnight or through major BTC events"
    elif abs_corr < 0.4:
        hedge_hint = "BTC hedge unnecessary — minimal BTC exposure"
    else:
        hedge_hint = "BTC hedge not required at this size"

    # ===== Regime warning =====
    regime_warning = None
    if trend == "below_ema200" and abs_corr > 0.7:
        regime_warning = "BTC below 200 EMA — elevated downside risk for correlated assets"
    elif regime == "risk_on_overheated" and abs_corr > 0.7:
        regime_warning = "BTC overheated (RSI > 70) — pullback risk transfers to this coin"
    elif regime == "risk_off_oversold" and abs_corr > 0.7:
        regime_warning = "BTC oversold (RSI < 30) — potential bounce could lift this coin"

    # ===== Decoupling note =====
    decoupling_note = None
    if is_decoupled:
        decoupling_note = ("Significant decoupling — likely coin-specific catalyst (news, listing, partnership)"
                           if z < -2 else "Correlation spike — possible sector rotation in progress")

    # ===== Trade bias =====
    if is_decoupled and z < -2 and not is_extended:
        trade_bias = "Asymmetric opportunity — BTC risk minimal, focus on coin-specific catalysts"
    elif is_extended:
        trade_bias = "Wait for mean-reversion pullback before entry — current entry has overextended momentum"
    elif "risk_off" in regime and abs_corr > 0.7:
        trade_bias = "Wait for BTC recovery or scale-in gradually"
    elif effective_beta < 0.8 and abs_corr > 0.6:
        trade_bias = "Safer BTC-proxy play — suitable for risk-averse entries"
    elif regime == "risk_on_healthy" and abs_corr > 0.7:
        trade_bias = "Favorable conditions — BTC trend supportive"
    else:
        trade_bias = "Standard entry — monitor BTC for confirmation"

    # ===== Alignment score (0–100) — more nuanced =====
    score = 50 + (abs_corr * 30) - max(0, effective_beta - 1) * 10 - min(abs_z, 5) * 3
    if regime == "risk_on_healthy":
        score += 5
    elif "risk_off" in regime:
        score -= 5
    if is_extended:
        score -= 10
    if downside_beta is not None and beta > 0 and downside_beta > beta * 1.5:
        score -= 8   # penalize asymmetric downside risk
    if confidence == "low":
        score -= 5
    score = max(0, min(100, int(round(score))))

    return {
        "alignment_score":  score,
        "risk_level":       risk_level,
        "confidence":       confidence,
        "headline":         headline,
        "summary":          summary,
        "sizing_hint":      sizing_hint,
        "hedge_hint":       hedge_hint,
        "regime_warning":   regime_warning,
        "decoupling_note":  decoupling_note,
        "trade_bias":       trade_bias,
        "mapping_warning":  mapping_warning,
        "key_observations": observations,
    }


# ============================================================
# Pipeline
# ============================================================
async def fetch_signal_meta(conn: asyncpg.Connection, signal_id: str) -> Optional[dict]:
    row = await conn.fetchrow("""
        SELECT s.signal_id, s.pair,
               co.base_symbol, co.coingecko_id
        FROM signals s
        LEFT JOIN coins co ON co.pair = s.pair
        WHERE s.signal_id = $1
    """, signal_id)
    return dict(row) if row else None


async def process_signal(conn: asyncpg.Connection, signal_id: str):
    meta = await fetch_signal_meta(conn, signal_id)
    if not meta or not meta.get("pair"):
        log.warning(f"Signal {signal_id} not found or has no pair — skipping")
        return

    pair         = meta["pair"]
    base_symbol  = (meta.get("base_symbol") or QUOTE_RE.sub("", pair)).upper()
    coingecko_id = meta.get("coingecko_id")

    log.info(f"📥 Processing {signal_id[:8]}… ({pair} / {base_symbol})")

    mapping_warning = detect_mapping_anomaly(base_symbol, coingecko_id)
    if mapping_warning:
        log.warning(f"  ⚠️  {mapping_warning}")

    btc_df, coin_df = await asyncio.gather(
        fetch_btc_ohlc_cached(),
        fetch_binance_klines(pair, "1h", 1000),
    )
    data_source = "binance"

    if coin_df is None or len(coin_df) < MIN_TO_INSERT_LOW:
        if coingecko_id:
            log.info(f"  ↳ Binance miss for {pair}, fallback CoinGecko ({coingecko_id})")
            coin_df = await fetch_coingecko_market_chart(coingecko_id, days=30)
            data_source = "coingecko"
        else:
            log.warning(f"  ↳ No Binance pair & no coingecko_id for {pair}")
            return

    if coin_df is None or btc_df is None:
        log.warning(f"  ↳ Unable to fetch price data for {pair}")
        return

    metrics = compute_advanced_metrics(coin_df, btc_df)
    if metrics is None:
        log.warning(f"  ↳ Computation failed for {pair}")
        return

    confidence = determine_confidence(metrics)

    # Note: even with insufficient_data we still insert a row so the UI knows
    # the correlation has been ATTEMPTED (vs. "not yet processed"). The
    # interpretation will clearly explain the limitation.

    dominance      = await fetch_btc_dominance()
    btc_ctx        = compute_btc_context(btc_df, dominance)
    interpretation = generate_interpretation(metrics, btc_ctx, confidence, mapping_warning)

    is_decoupled = (abs(metrics["z_score"] or 0) > 2 and abs(metrics["corr_long"] or 0) < 0.5) \
                   if metrics.get("corr_long") is not None else False
    quality_legacy = ("high" if metrics["sample_size"] >= MIN_TO_INSERT_HIGH else
                      "medium" if metrics["sample_size"] >= MIN_TO_INSERT_MED else "low")

    await conn.execute("""
        INSERT INTO signal_btc_correlation (
            signal_id, pair, corr_1h_7d, corr_4h_30d, beta_30d, r_squared_30d, corr_zscore,
            btc_context, is_decoupled, interpretation,
            data_source, sample_quality, sample_size, confidence, worker_version,
            tail_corr_btc_down, tail_corr_btc_up, downside_beta,
            lead_lag_hours, volatility_ratio, coin_volatility_pct,
            momentum_divergence_7d, is_extended,
            analyzed_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23,
            now()
        )
        ON CONFLICT (signal_id) DO UPDATE SET
            pair = EXCLUDED.pair, corr_1h_7d = EXCLUDED.corr_1h_7d,
            corr_4h_30d = EXCLUDED.corr_4h_30d, beta_30d = EXCLUDED.beta_30d,
            r_squared_30d = EXCLUDED.r_squared_30d, corr_zscore = EXCLUDED.corr_zscore,
            btc_context = EXCLUDED.btc_context, is_decoupled = EXCLUDED.is_decoupled,
            interpretation = EXCLUDED.interpretation, data_source = EXCLUDED.data_source,
            sample_quality = EXCLUDED.sample_quality, sample_size = EXCLUDED.sample_size,
            confidence = EXCLUDED.confidence, worker_version = EXCLUDED.worker_version,
            tail_corr_btc_down = EXCLUDED.tail_corr_btc_down,
            tail_corr_btc_up   = EXCLUDED.tail_corr_btc_up,
            downside_beta      = EXCLUDED.downside_beta,
            lead_lag_hours     = EXCLUDED.lead_lag_hours,
            volatility_ratio   = EXCLUDED.volatility_ratio,
            coin_volatility_pct= EXCLUDED.coin_volatility_pct,
            momentum_divergence_7d = EXCLUDED.momentum_divergence_7d,
            is_extended        = EXCLUDED.is_extended,
            analyzed_at = now()
    """,
        signal_id, pair,
        metrics.get("corr_short"), metrics.get("corr_long"), metrics.get("beta"),
        metrics.get("r_squared"), metrics.get("z_score"),
        json.dumps(btc_ctx), is_decoupled,
        json.dumps(interpretation),
        data_source, quality_legacy, metrics["sample_size"], confidence, WORKER_VERSION,
        metrics.get("tail_corr_down"), metrics.get("tail_corr_up"), metrics.get("downside_beta"),
        metrics.get("lead_lag"), metrics.get("vol_ratio"), metrics.get("coin_vol_pct"),
        metrics.get("momentum_div_7d"), metrics.get("is_extended"),
    )

    log.info(
        f"✅ {signal_id[:8]}… {pair} — "
        f"sample={metrics['sample_size']} conf={confidence} "
        + (f"ρ={metrics['corr_long']:+.2f} β={metrics['beta']:.2f} score={interpretation['alignment_score']} "
           if confidence != 'insufficient_data' else "")
        + f"obs={len(interpretation.get('key_observations', []))}"
    )


async def backfill_missing(conn: asyncpg.Connection, limit: int = 30):
    rows = await conn.fetch("""
        SELECT s.signal_id
        FROM signals s
        LEFT JOIN signal_btc_correlation c ON c.signal_id = s.signal_id
        WHERE c.signal_id IS NULL AND s.pair IS NOT NULL AND s.pair <> ''
        ORDER BY s.created_at DESC
        LIMIT $1
    """, limit)
    if rows:
        log.info(f"🔄 Backfilling {len(rows)} signals without correlation...")
        for r in rows:
            try:
                await process_signal(conn, r["signal_id"])
                await asyncio.sleep(0.3)
            except Exception as e:
                log.exception(f"Backfill failed for {r['signal_id']}: {e}")


def parse_payload(payload: str) -> Optional[Tuple[str, str]]:
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


async def main():
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL env var required")

    log.info(f"🚀 LuxQuant BTC Correlation Worker {WORKER_VERSION} starting")
    log.info(f"   Channel: {NOTIFY_CHANNEL}")
    log.info(f"   Redis available: {is_redis_available()}")

    init_clients()
    conn = await asyncpg.connect(DB_DSN)
    queue: asyncio.Queue[str] = asyncio.Queue()

    def on_notify(_c, _pid, _ch, payload: str):
        parsed = parse_payload(payload)
        if parsed:
            sid, pair = parsed
            try:
                queue.put_nowait(sid)
                log.debug(f"📨 notify: {sid[:8]}… pair={pair}")
            except Exception as e:
                log.error(f"queue put failed: {e}")
        else:
            log.warning(f"bad notify payload: {payload!r}")

    await conn.add_listener(NOTIFY_CHANNEL, on_notify)
    log.info(f"🎧 Listening on '{NOTIFY_CHANNEL}'")

    try:
        try:
            await backfill_missing(conn, limit=20)
        except Exception:
            log.exception("Initial backfill failed (continuing)")

        while True:
            try:
                signal_id = await asyncio.wait_for(queue.get(), timeout=60)
                await process_signal(conn, signal_id)
            except asyncio.TimeoutError:
                try:
                    await conn.execute("SELECT 1")
                except Exception:
                    log.warning("DB heartbeat failed — reconnecting...")
                    try: await conn.close()
                    except Exception: pass
                    conn = await asyncpg.connect(DB_DSN)
                    await conn.add_listener(NOTIFY_CHANNEL, on_notify)
            except (asyncpg.PostgresConnectionError, ConnectionError) as e:
                log.error(f"DB connection lost: {e} — reconnect in 5s")
                await asyncio.sleep(5)
                try: await conn.close()
                except Exception: pass
                conn = await asyncpg.connect(DB_DSN)
                await conn.add_listener(NOTIFY_CHANNEL, on_notify)
            except Exception as e:
                log.exception(f"Loop error: {e}")
                await asyncio.sleep(2)
    finally:
        try: await close_clients()
        except Exception: pass
        try: await conn.close()
        except Exception: pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("👋 Worker shut down by user")
