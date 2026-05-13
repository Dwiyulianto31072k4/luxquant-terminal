#!/usr/bin/env python3
"""
LuxQuant BTC Correlation Worker
================================
Listens on Postgres channel `signal_created` and, for every new signal call:
  1. Fetches OHLC for BTC + the coin (Binance primary, CoinGecko fallback)
  2. Computes 5 metrics: corr_1h_7d, corr_4h_30d, beta_30d, r_squared_30d, corr_zscore
  3. Snapshots BTC context (price, trend, RSI, regime)
  4. Generates rule-based English interpretation (sizing, hedge, bias, warnings)
  5. Inserts everything into `signal_btc_correlation`

Run as systemd service `luxquant-btc-correlation-worker.service`.
"""
import os
import json
import asyncio
import logging
from typing import Optional
from datetime import datetime

import asyncpg
import httpx
import numpy as np
import pandas as pd

# ============================================================
# Configuration
# ============================================================
DB_DSN              = os.getenv("DATABASE_URL")
NOTIFY_CHANNEL      = os.getenv("CORR_CHANNEL", "signal_created")
COINGECKO_BASE      = "https://api.coingecko.com/api/v3"
BINANCE_BASE        = "https://api.binance.com"
COINGECKO_API_KEY   = os.getenv("COINGECKO_API_KEY")
REQUEST_TIMEOUT     = float(os.getenv("CORR_HTTP_TIMEOUT", "20"))

# Lookback windows (in 1h candles)
SHORT_WINDOW = 168   # 7 days @ 1h
LONG_WINDOW  = 720   # 30 days @ 1h
BASELINE_WIN = 60    # rolling correlation window for z-score baseline

# Quality thresholds
MIN_SAMPLES_TO_COMPUTE = 30

logging.basicConfig(
    level=os.getenv("CORR_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
log = logging.getLogger("btc_correlation")


# ============================================================
# Data fetching
# ============================================================
async def fetch_binance_klines(client: httpx.AsyncClient, symbol: str,
                                interval: str = "1h", limit: int = 1000) -> Optional[pd.DataFrame]:
    """Fetch OHLC from Binance. Returns DataFrame with [timestamp, close] or None."""
    url = f"{BINANCE_BASE}/api/v3/klines"
    pair = f"{symbol.upper()}USDT"
    try:
        r = await client.get(url, params={"symbol": pair, "interval": interval, "limit": limit})
        if r.status_code == 400:
            log.debug(f"Binance: symbol {pair} not listed")
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
        log.warning(f"Binance fetch failed for {pair}: {e}")
        return None


async def fetch_coingecko_market_chart(client: httpx.AsyncClient, coin_id: str,
                                        days: int = 30) -> Optional[pd.DataFrame]:
    """Fetch hourly price from CoinGecko. Returns DataFrame with [timestamp, close] or None."""
    url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart"
    headers = {"x-cg-pro-api-key": COINGECKO_API_KEY} if COINGECKO_API_KEY else {}
    params = {"vs_currency": "usd", "days": days, "interval": "hourly"}
    try:
        r = await client.get(url, params=params, headers=headers)
        r.raise_for_status()
        prices = r.json().get("prices", [])
        if not prices:
            return None
        df = pd.DataFrame(prices, columns=["timestamp", "close"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df["close"]     = df["close"].astype(float)
        return df
    except Exception as e:
        log.warning(f"CoinGecko fetch failed for {coin_id}: {e}")
        return None


async def fetch_btc_dominance(client: httpx.AsyncClient) -> Optional[float]:
    """Get current BTC dominance % from CoinGecko global endpoint."""
    try:
        r = await client.get(f"{COINGECKO_BASE}/global", timeout=10)
        r.raise_for_status()
        return float(r.json()["data"]["market_cap_percentage"]["btc"])
    except Exception:
        return None


# ============================================================
# Metric computation
# ============================================================
def compute_metrics(coin_df: pd.DataFrame, btc_df: pd.DataFrame) -> Optional[dict]:
    """Compute Pearson corr (short & long), beta, R², and z-score."""
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

    # Beta = cov(coin, btc) / var(btc)
    var_btc = float(long_["ret_btc"].var())
    cov     = float(long_["ret_coin"].cov(long_["ret_btc"]))
    beta    = cov / var_btc if var_btc > 0 else 0.0

    # R²
    r_sq = float(corr_long) ** 2 if pd.notna(corr_long) else 0.0

    # Z-score vs rolling baseline
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
    """Snapshot of BTC state at signal time."""
    closes = btc_df["close"]
    current = float(closes.iloc[-1])

    # Trend vs EMA200
    if len(closes) >= 200:
        ema_200 = float(closes.ewm(span=200, adjust=False).mean().iloc[-1])
        trend = "above_ema200" if current > ema_200 else "below_ema200"
    else:
        trend = "insufficient_data"

    # RSI 14
    delta = closes.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain / loss.replace(0, np.nan)
    rsi   = 100 - (100 / (1 + rs))
    rsi_14 = float(rsi.iloc[-1]) if pd.notna(rsi.iloc[-1]) else 50.0

    # 24h change
    change_24h = ((current - float(closes.iloc[-24])) / float(closes.iloc[-24]) * 100) \
                 if len(closes) >= 24 else 0.0

    # Regime classification
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

    abs_corr = abs(corr_long)
    abs_z    = abs(z)
    regime   = btc_ctx["regime"]
    trend    = btc_ctx["trend"]

    is_decoupled = abs_z > 2 and abs_corr < 0.5

    # ---- Headline & risk_level ----
    if abs_corr > 0.8 and beta > 1.5:
        if "risk_off" in regime:
            headline = "Highly BTC-driven with amplified downside exposure"
            risk_level = "high"
        else:
            headline = "Highly BTC-driven with amplified upside potential"
            risk_level = "medium"
    elif abs_corr > 0.8 and beta < 0.8:
        headline = "BTC-aligned but with dampened volatility (safer BTC proxy)"
        risk_level = "low"
    elif is_decoupled:
        headline = "Decoupled from BTC — possible idiosyncratic catalyst"
        risk_level = "medium"
    elif abs_corr > 0.5:
        headline = "Normal BTC alignment"
        risk_level = "medium"
    else:
        headline = "Weak BTC correlation — coin trading independently"
        risk_level = "medium"

    # ---- Summary ----
    summary = (
        f"Correlation {corr_long:+.2f} with beta {beta:.2f}. "
        f"R² of {r_sq:.2f} means roughly {int(r_sq * 100)}% of this coin's price movement "
        f"is explained by BTC."
    )
    if abs_z > 2:
        direction = "weaker" if z < 0 else "stronger"
        summary += f" Current correlation is significantly {direction} than its 60-period baseline (z-score {z:+.2f})."

    # ---- Sizing hint ----
    if beta > 1.5:
        size_pct = max(40, int(100 / beta))
        sizing_hint = f"Reduce position to ~{size_pct}% of standard size — high beta amplifies BTC risk"
    elif beta < 0.8 and abs_corr > 0.6:
        sizing_hint = "Standard or slightly larger position acceptable — low beta dampens volatility"
    elif beta < 0.5:
        sizing_hint = "Standard position — minimal BTC exposure"
    else:
        sizing_hint = "Standard position sizing — beta within normal range"

    # ---- Hedge hint ----
    if beta > 1.3 and "risk_off" in regime:
        hedge_hint = "Strongly consider partial BTC short hedge — high beta in weak BTC regime"
    elif beta > 1.3:
        hedge_hint = "Optional BTC hedge if holding overnight or through major BTC events"
    elif abs_corr < 0.4:
        hedge_hint = "BTC hedge unnecessary — minimal BTC exposure"
    else:
        hedge_hint = "BTC hedge not required at this size"

    # ---- Regime warning ----
    regime_warning = None
    if trend == "below_ema200" and abs_corr > 0.7:
        regime_warning = "BTC trading below 200 EMA — elevated downside risk for correlated assets"
    elif regime == "risk_on_overheated" and abs_corr > 0.7:
        regime_warning = "BTC overheated (RSI > 70) — pullback risk transfers to this coin"
    elif regime == "risk_off_oversold" and abs_corr > 0.7:
        regime_warning = "BTC oversold (RSI < 30) — potential bounce could drag this coin up"

    # ---- Decoupling note ----
    decoupling_note = None
    if is_decoupled:
        if z < -2:
            decoupling_note = "Significant decoupling — likely coin-specific catalyst (news, listing, partnership)"
        else:
            decoupling_note = "Correlation spike — possible sector rotation in progress"

    # ---- Trade bias ----
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

    # ---- Alignment score (0–100) ----
    # Higher = clearer & more favorable structure
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
# Signal processing pipeline
# ============================================================
async def process_signal(conn: asyncpg.Connection, http: httpx.AsyncClient, signal_id: int):
    # 1. Fetch signal row — ADJUST column names to your actual schema
    row = await conn.fetchrow("""
        SELECT id, symbol,
               COALESCE(coingecko_id, NULL) AS coingecko_id
        FROM signals
        WHERE id = $1
    """, signal_id)

    if not row:
        log.warning(f"Signal {signal_id} not found — skipping")
        return

    symbol   = (row["symbol"] or "").upper().lstrip("$")
    coin_id  = row["coingecko_id"]

    if not symbol:
        log.warning(f"Signal {signal_id} has no symbol — skipping")
        return

    log.info(f"📥 Processing signal {signal_id} ({symbol})")

    # 2. Fetch BTC + coin OHLC (parallel)
    btc_task, coin_task = await asyncio.gather(
        fetch_binance_klines(http, "BTC", "1h", 1000),
        fetch_binance_klines(http, symbol, "1h", 1000),
        return_exceptions=False,
    )
    btc_df, coin_df = btc_task, coin_task
    data_source = "binance"

    # CoinGecko fallback for the coin only (BTC always on Binance)
    if coin_df is None or len(coin_df) < MIN_SAMPLES_TO_COMPUTE:
        if coin_id:
            log.info(f"  ↳ Binance miss for {symbol}, falling back to CoinGecko ({coin_id})")
            coin_df = await fetch_coingecko_market_chart(http, coin_id, days=30)
            data_source = "coingecko"
        else:
            log.warning(f"  ↳ No Binance pair & no coingecko_id for {symbol} — cannot compute")
            return

    if coin_df is None or btc_df is None:
        log.warning(f"  ↳ Unable to fetch price data for {symbol}")
        return

    # 3. Compute metrics
    metrics = compute_metrics(coin_df, btc_df)
    if metrics is None:
        log.warning(f"  ↳ Insufficient overlap for {symbol}")
        return

    # 4. BTC context + interpretation
    dominance      = await fetch_btc_dominance(http)
    btc_ctx        = compute_btc_context(btc_df, dominance)
    interpretation = generate_interpretation(metrics, btc_ctx)

    # 5. Quality + flags
    is_decoupled = abs(metrics["z_score"]) > 2 and abs(metrics["corr_long"]) < 0.5
    if metrics["sample_size"] >= 500:
        quality = "high"
    elif metrics["sample_size"] >= 150:
        quality = "medium"
    else:
        quality = "low"

    # 6. Upsert
    await conn.execute("""
        INSERT INTO signal_btc_correlation (
            signal_id, coin_symbol, corr_1h_7d, corr_4h_30d, beta_30d,
            r_squared_30d, corr_zscore, btc_context, is_decoupled,
            interpretation, data_source, sample_quality
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12)
        ON CONFLICT (signal_id) DO UPDATE SET
            corr_1h_7d     = EXCLUDED.corr_1h_7d,
            corr_4h_30d    = EXCLUDED.corr_4h_30d,
            beta_30d       = EXCLUDED.beta_30d,
            r_squared_30d  = EXCLUDED.r_squared_30d,
            corr_zscore    = EXCLUDED.corr_zscore,
            btc_context    = EXCLUDED.btc_context,
            is_decoupled   = EXCLUDED.is_decoupled,
            interpretation = EXCLUDED.interpretation,
            data_source    = EXCLUDED.data_source,
            sample_quality = EXCLUDED.sample_quality,
            computed_at    = NOW()
    """,
        signal_id, symbol,
        metrics["corr_short"], metrics["corr_long"], metrics["beta"],
        metrics["r_squared"], metrics["z_score"],
        json.dumps(btc_ctx), is_decoupled,
        json.dumps(interpretation), data_source, quality,
    )

    log.info(
        f"✅ signal {signal_id} ({symbol}) — "
        f"ρ={metrics['corr_long']:+.2f} β={metrics['beta']:.2f} R²={metrics['r_squared']:.2f} "
        f"score={interpretation['alignment_score']} risk={interpretation['risk_level']}"
    )


# ============================================================
# Backfill helper — process signals that have no correlation row yet
# ============================================================
async def backfill_missing(conn: asyncpg.Connection, http: httpx.AsyncClient, limit: int = 50):
    rows = await conn.fetch("""
        SELECT s.id
        FROM signals s
        LEFT JOIN signal_btc_correlation c ON c.signal_id = s.id
        WHERE c.signal_id IS NULL
        ORDER BY s.id DESC
        LIMIT $1
    """, limit)
    if rows:
        log.info(f"🔄 Backfilling {len(rows)} signals without correlation...")
        for r in rows:
            try:
                await process_signal(conn, http, r["id"])
                await asyncio.sleep(0.5)  # gentle rate limit
            except Exception as e:
                log.exception(f"Backfill failed for signal {r['id']}: {e}")


# ============================================================
# Main listen loop
# ============================================================
async def main():
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL env var required")

    log.info("🚀 LuxQuant BTC Correlation Worker starting")
    log.info(f"   Channel: {NOTIFY_CHANNEL}")

    conn = await asyncpg.connect(DB_DSN)
    queue: asyncio.Queue[int] = asyncio.Queue()

    def on_notify(_connection, _pid, _channel, payload: str):
        try:
            queue.put_nowait(int(payload))
            log.debug(f"📨 notify: signal_id={payload}")
        except Exception as e:
            log.error(f"Bad notify payload {payload!r}: {e}")

    await conn.add_listener(NOTIFY_CHANNEL, on_notify)
    log.info(f"🎧 Listening on '{NOTIFY_CHANNEL}'")

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as http:
        # initial backfill (optional, comment out if not wanted)
        try:
            await backfill_missing(conn, http, limit=20)
        except Exception:
            log.exception("Initial backfill failed (continuing anyway)")

        while True:
            try:
                signal_id = await asyncio.wait_for(queue.get(), timeout=60)
                await process_signal(conn, http, signal_id)
            except asyncio.TimeoutError:
                # heartbeat
                try:
                    await conn.execute("SELECT 1")
                except Exception:
                    log.warning("DB heartbeat failed — reconnecting...")
                    await conn.close()
                    conn = await asyncpg.connect(DB_DSN)
                    await conn.add_listener(NOTIFY_CHANNEL, on_notify)
            except asyncpg.PostgresConnectionError as e:
                log.error(f"DB connection lost: {e} — reconnecting in 5s")
                await asyncio.sleep(5)
                try:
                    await conn.close()
                except Exception:
                    pass
                conn = await asyncpg.connect(DB_DSN)
                await conn.add_listener(NOTIFY_CHANNEL, on_notify)
            except Exception as e:
                log.exception(f"Loop error: {e}")
                await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
