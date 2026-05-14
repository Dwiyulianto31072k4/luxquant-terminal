#!/usr/bin/env python3
"""
LuxQuant BTC Correlation Worker (v1.1)
=======================================
Integrates with project infrastructure:
  • Shared httpx clients via app.core.http_client (connection pool reuse)
  • Redis cache for BTC OHLC + dominance (shared across workers)
  • Mirrors enrichment_worker pattern (LISTEN/NOTIFY)

Trigger: existing pg channel 'new_signal' (notify_new_signal trigger)
Payload: {"signal_id":"...","pair":"AINUSDT","entry":...,"created_at":"..."}
"""
import os
import re
import sys
import json
import asyncio
import logging
from typing import Optional, Tuple

import asyncpg
import httpx
import numpy as np
import pandas as pd

# Make project imports work when run as standalone script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.http_client import (
    init_clients, close_clients,
    get_binance_client, get_coingecko_client,
)
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
WORKER_VERSION      = "v1.1"

# Cache keys / TTLs
CACHE_BTC_1H_KEY    = "lq:correlation:btc_1h_ohlc"
CACHE_BTC_1H_TTL    = 300          # 5 min
CACHE_DOMINANCE_KEY = "lq:correlation:btc_dominance"
CACHE_DOMINANCE_TTL = 600
CACHE_COIN_PREFIX   = "lq:correlation:coin_ohlc:"
CACHE_COIN_TTL      = 600

# Lookback windows (1h candles)
SHORT_WINDOW = 168
LONG_WINDOW  = 720
BASELINE_WIN = 60
MIN_SAMPLES_TO_COMPUTE = 30

COINGECKO_MIN_GAP = float(os.getenv("COINGECKO_MIN_GAP", "2.5"))

QUOTE_RE = re.compile(r"(USDT|USDC|BUSD|USD)$")

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
# CoinGecko helpers (auth header + throttle)
# ============================================================
_cg_lock          = asyncio.Lock()
_cg_last_call_ts  = 0.0


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
# Data fetching (shared clients + Redis cache)
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
    """BTC 1h OHLC — Redis-cached across the whole system."""
    if is_redis_available():
        cached = cache_get(CACHE_BTC_1H_KEY)
        if cached:
            try:
                return _df_from_records(cached)
            except Exception as e:
                log.debug(f"cached BTC parse failed: {e}")

    df = await fetch_binance_klines("BTCUSDT", "1h", 1000)
    if df is not None and len(df) > 0 and is_redis_available():
        try:
            cache_set(CACHE_BTC_1H_KEY, _df_to_records(df), ttl=CACHE_BTC_1H_TTL)
        except Exception as e:
            log.debug(f"cache_set BTC failed: {e}")
    return df


async def fetch_coingecko_market_chart(coin_id: str, days: int = 30,
                                        max_retries: int = 3) -> Optional[pd.DataFrame]:
    cache_key = f"{CACHE_COIN_PREFIX}{coin_id}"
    if is_redis_available():
        cached = cache_get(cache_key)
        if cached:
            try:
                return _df_from_records(cached)
            except Exception:
                pass

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
            df = _df_from_records(prices)
            if is_redis_available():
                try:
                    cache_set(cache_key, _df_to_records(df), ttl=CACHE_COIN_TTL)
                except Exception:
                    pass
            return df
        except httpx.HTTPStatusError as e:
            log.warning(f"CoinGecko HTTP error for {coin_id}: {e}")
            return None
        except Exception as e:
            log.warning(f"CoinGecko fetch failed for {coin_id}: {e}")
            return None

    log.warning(f"  ✗ CoinGecko gave up on {coin_id} after {max_retries} retries")
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
# Metric computation
# ============================================================
def compute_metrics(coin_df: pd.DataFrame, btc_df: pd.DataFrame) -> Optional[dict]:
    merged = pd.merge_asof(
        coin_df.sort_values("timestamp"),
        btc_df.sort_values("timestamp"),
        on="timestamp",
        suffixes=("_coin", "_btc"),
        tolerance=pd.Timedelta("2h"),
    ).dropna()
    if len(merged) < MIN_SAMPLES_TO_COMPUTE:
        return None

    merged["ret_coin"] = merged["close_coin"].pct_change()
    merged["ret_btc"]  = merged["close_btc"].pct_change()
    rets = merged[["ret_coin", "ret_btc"]].dropna()
    if len(rets) < MIN_SAMPLES_TO_COMPUTE:
        return None

    short = rets.tail(SHORT_WINDOW) if len(rets) >= SHORT_WINDOW else rets
    long_ = rets.tail(LONG_WINDOW) if len(rets) >= LONG_WINDOW else rets

    corr_short = short["ret_coin"].corr(short["ret_btc"])
    corr_long  = long_["ret_coin"].corr(long_["ret_btc"])

    var_btc = float(long_["ret_btc"].var())
    cov     = float(long_["ret_coin"].cov(long_["ret_btc"]))
    beta    = cov / var_btc if var_btc > 0 else 0.0
    r_sq    = float(corr_long) ** 2 if pd.notna(corr_long) else 0.0

    rolling_corr = rets["ret_coin"].rolling(BASELINE_WIN).corr(rets["ret_btc"]).dropna()
    if len(rolling_corr) >= 30:
        baseline_mean = float(rolling_corr.mean())
        baseline_std  = float(rolling_corr.std())
        z_score = (float(corr_short) - baseline_mean) / baseline_std if baseline_std > 0 else 0.0
    else:
        z_score = 0.0

    return {
        "corr_short":  round(float(corr_short or 0), 4),
        "corr_long":   round(float(corr_long or 0), 4),
        "beta":        round(float(beta), 4),
        "r_squared":   round(r_sq, 4),
        "z_score":     round(z_score, 4),
        "sample_size": int(len(rets)),
    }


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
# Interpretation generator (rule-based, English)
# ============================================================
def generate_interpretation(metrics: dict, btc_ctx: dict) -> dict:
    corr_short = metrics["corr_short"]
    corr_long  = metrics["corr_long"]
    beta       = metrics["beta"]
    r_sq       = metrics["r_squared"]
    z          = metrics["z_score"]

    abs_corr     = abs(corr_long)
    abs_z        = abs(z)
    regime       = btc_ctx["regime"]
    trend        = btc_ctx["trend"]
    is_decoupled = abs_z > 2 and abs_corr < 0.5

    if abs_corr > 0.8 and beta > 1.5:
        if "risk_off" in regime:
            headline, risk_level = "Highly BTC-driven with amplified downside exposure", "high"
        else:
            headline, risk_level = "Highly BTC-driven with amplified upside potential", "medium"
    elif abs_corr > 0.8 and beta < 0.8:
        headline, risk_level = "BTC-aligned but with dampened volatility (safer BTC proxy)", "low"
    elif is_decoupled:
        headline, risk_level = "Decoupled from BTC — possible idiosyncratic catalyst", "medium"
    elif abs_corr > 0.5:
        headline, risk_level = "Normal BTC alignment", "medium"
    else:
        headline, risk_level = "Weak BTC correlation — coin trading independently", "medium"

    summary = (
        f"Correlation {corr_long:+.2f} with beta {beta:.2f}. "
        f"R² of {r_sq:.2f} means roughly {int(r_sq * 100)}% of this coin's price movement "
        f"is explained by BTC."
    )
    if abs_z > 2:
        direction = "weaker" if z < 0 else "stronger"
        summary  += f" Current correlation is significantly {direction} than its 60-period baseline (z-score {z:+.2f})."

    if beta > 1.5:
        size_pct    = max(40, int(100 / beta))
        sizing_hint = f"Reduce position to ~{size_pct}% of standard size — high beta amplifies BTC risk"
    elif beta < 0.8 and abs_corr > 0.6:
        sizing_hint = "Standard or slightly larger position acceptable — low beta dampens volatility"
    elif beta < 0.5:
        sizing_hint = "Standard position — minimal BTC exposure"
    else:
        sizing_hint = "Standard position sizing — beta within normal range"

    if beta > 1.3 and "risk_off" in regime:
        hedge_hint = "Strongly consider partial BTC short hedge — high beta in weak BTC regime"
    elif beta > 1.3:
        hedge_hint = "Optional BTC hedge if holding overnight or through major BTC events"
    elif abs_corr < 0.4:
        hedge_hint = "BTC hedge unnecessary — minimal BTC exposure"
    else:
        hedge_hint = "BTC hedge not required at this size"

    regime_warning = None
    if trend == "below_ema200" and abs_corr > 0.7:
        regime_warning = "BTC trading below 200 EMA — elevated downside risk for correlated assets"
    elif regime == "risk_on_overheated" and abs_corr > 0.7:
        regime_warning = "BTC overheated (RSI > 70) — pullback risk transfers to this coin"
    elif regime == "risk_off_oversold" and abs_corr > 0.7:
        regime_warning = "BTC oversold (RSI < 30) — potential bounce could drag this coin up"

    decoupling_note = None
    if is_decoupled:
        decoupling_note = ("Significant decoupling — likely coin-specific catalyst (news, listing, partnership)"
                           if z < -2 else "Correlation spike — possible sector rotation in progress")

    if is_decoupled and z < -2:
        trade_bias = "Asymmetric opportunity — BTC risk minimal, focus on coin-specific catalysts"
    elif "risk_off" in regime and abs_corr > 0.7:
        trade_bias = "Wait for BTC recovery or scale-in gradually"
    elif beta < 0.8 and abs_corr > 0.6:
        trade_bias = "Safer BTC-proxy play — suitable for risk-averse entries"
    elif regime == "risk_on_healthy" and abs_corr > 0.7:
        trade_bias = "Favorable conditions — BTC trend supportive"
    else:
        trade_bias = "Standard entry — monitor BTC for confirmation"

    score = 50 + (abs_corr * 30) - max(0, beta - 1) * 10 - min(abs_z, 5) * 3
    if regime == "risk_on_healthy":
        score += 5
    elif "risk_off" in regime:
        score -= 5
    score = max(0, min(100, int(round(score))))

    return {
        "alignment_score":  score,
        "risk_level":       risk_level,
        "headline":         headline,
        "summary":          summary,
        "sizing_hint":      sizing_hint,
        "hedge_hint":       hedge_hint,
        "regime_warning":   regime_warning,
        "decoupling_note":  decoupling_note,
        "trade_bias":       trade_bias,
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

    btc_df, coin_df = await asyncio.gather(
        fetch_btc_ohlc_cached(),
        fetch_binance_klines(pair, "1h", 1000),
    )
    data_source = "binance"

    if coin_df is None or len(coin_df) < MIN_SAMPLES_TO_COMPUTE:
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

    metrics = compute_metrics(coin_df, btc_df)
    if metrics is None:
        log.warning(f"  ↳ Insufficient overlap for {pair}")
        return

    dominance      = await fetch_btc_dominance()
    btc_ctx        = compute_btc_context(btc_df, dominance)
    interpretation = generate_interpretation(metrics, btc_ctx)

    is_decoupled = abs(metrics["z_score"]) > 2 and abs(metrics["corr_long"]) < 0.5
    if metrics["sample_size"] >= 500:
        quality = "high"
    elif metrics["sample_size"] >= 150:
        quality = "medium"
    else:
        quality = "low"

    await conn.execute("""
        INSERT INTO signal_btc_correlation (
            signal_id, pair, corr_1h_7d, corr_4h_30d, beta_30d,
            r_squared_30d, corr_zscore, btc_context, is_decoupled,
            interpretation, data_source, sample_quality, worker_version, analyzed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, now())
        ON CONFLICT (signal_id) DO UPDATE SET
            pair = EXCLUDED.pair, corr_1h_7d = EXCLUDED.corr_1h_7d,
            corr_4h_30d = EXCLUDED.corr_4h_30d, beta_30d = EXCLUDED.beta_30d,
            r_squared_30d = EXCLUDED.r_squared_30d, corr_zscore = EXCLUDED.corr_zscore,
            btc_context = EXCLUDED.btc_context, is_decoupled = EXCLUDED.is_decoupled,
            interpretation = EXCLUDED.interpretation, data_source = EXCLUDED.data_source,
            sample_quality = EXCLUDED.sample_quality, worker_version = EXCLUDED.worker_version,
            analyzed_at = now()
    """,
        signal_id, pair,
        metrics["corr_short"], metrics["corr_long"], metrics["beta"],
        metrics["r_squared"], metrics["z_score"],
        json.dumps(btc_ctx), is_decoupled,
        json.dumps(interpretation), data_source, quality, WORKER_VERSION,
    )

    log.info(
        f"✅ {signal_id[:8]}… {pair} — "
        f"ρ={metrics['corr_long']:+.2f} β={metrics['beta']:.2f} R²={metrics['r_squared']:.2f} "
        f"score={interpretation['alignment_score']} risk={interpretation['risk_level']} "
        f"src={data_source}"
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


# ============================================================
# Notify payload parser
# ============================================================
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


# ============================================================
# Main
# ============================================================
async def main():
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL env var required")

    log.info(f"🚀 LuxQuant BTC Correlation Worker {WORKER_VERSION} starting")
    log.info(f"   Channel: {NOTIFY_CHANNEL}")
    log.info(f"   Redis available: {is_redis_available()}")

    init_clients()
    conn = await asyncpg.connect(DB_DSN)
    queue: asyncio.Queue[str] = asyncio.Queue()

    def on_notify(_connection, _pid, _channel, payload: str):
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
            log.exception("Initial backfill failed (continuing anyway)")

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
