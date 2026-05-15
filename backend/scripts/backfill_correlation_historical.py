#!/usr/bin/env python3
"""
LuxQuant BTC Correlation — Historical Backfill (Point-in-Time)
================================================================
Processes ALL signals in chronological order (oldest first), computing
correlation as it would have appeared AT THE TIME each signal was called.

KEY DIFFERENCES FROM LIVE WORKER:
  • Fetches OHLC ending at signals.created_at (not "now")
  • Uses Binance endTime parameter for historical klines
  • CoinGecko historical via /range endpoint (uses from/to UNIX timestamps)
  • In-memory cache per (pair, day-bucket) — many signals share data
  • Resumable: tracks progress via DB (signals already in correlation table)
  • Sequential processing — no concurrent CoinGecko calls (rate limit safe)

USAGE:
    # Full backfill (48k signals)
    python3 backfill_correlation_historical.py

    # Backfill specific age range
    python3 backfill_correlation_historical.py --days 180

    # Force recompute (skip resume check)
    python3 backfill_correlation_historical.py --force

    # Limit (for testing)
    python3 backfill_correlation_historical.py --limit 100

    # Skip CoinGecko fallback (Binance-only, much faster)
    python3 backfill_correlation_historical.py --skip-coingecko
"""
import os
import re
import sys
import json
import time
import asyncio
import argparse
import logging
from typing import Optional
from datetime import datetime, timezone, timedelta

import asyncpg
import httpx
import numpy as np
import pandas as pd

# Allow running as standalone — script is at backend/scripts/<this>.py
# We need backend/ on sys.path so `app.*` imports resolve.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# CRITICAL: Set dummy env vars for Telegram/Discord BEFORE importing anything
# from `app.*`. The app config module validates these at import time
# and calls sys.exit(1) if missing. Backfill doesn't need them — just bypass.
# Note: validator rejects "0" as falsy, use truthy non-empty strings.
for _required in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION_STRING",
                   "DISCORD_TOKEN", "FORUM_CHAT_ID"):
    os.environ.setdefault(_required, "1")

from app.core.http_client import init_clients, close_clients, get_binance_client, get_coingecko_client

from app.workers.btc_correlation_worker import (
    compute_advanced_metrics, compute_btc_context, generate_interpretation,
    determine_confidence, detect_mapping_anomaly, _coingecko_headers,
    SHORT_WINDOW, LONG_WINDOW, MIN_TO_INSERT_LOW,
    WORKER_VERSION,
)

# ============================================================
DB_DSN            = os.getenv("DATABASE_URL")
BINANCE_BASE      = "https://api.binance.com"
COINGECKO_BASE    = "https://api.coingecko.com/api/v3"
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")

# Pacing
BINANCE_GAP_S     = float(os.getenv("BACKFILL_BINANCE_GAP", "0.1"))
COINGECKO_GAP_S   = float(os.getenv("BACKFILL_COINGECKO_GAP", "2.5"))

# Cache: (pair, snapshot_day_iso) → DataFrame
# Same pair signaled multiple times in same day shares data
MAX_CACHE_ENTRIES = 200
LOOKBACK_HOURS    = 1000   # how much history to fetch ending at signal time

QUOTE_RE = re.compile(r"(USDT|USDC|BUSD|USD)$")

logging.basicConfig(
    level=os.getenv("BACKFILL_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] backfill: %(message)s",
)
log = logging.getLogger("backfill")


# ============================================================
# In-memory cache (per-process, no Redis to avoid serialization issues)
# ============================================================
class OHLCCache:
    def __init__(self, max_entries: int = MAX_CACHE_ENTRIES):
        self._store: dict[str, pd.DataFrame] = {}
        self._order: list[str] = []
        self.max = max_entries
        self.hits = 0
        self.misses = 0

    def _key(self, source: str, identifier: str, end_iso_day: str) -> str:
        return f"{source}:{identifier}:{end_iso_day}"

    def get(self, source: str, identifier: str, end_iso_day: str) -> Optional[pd.DataFrame]:
        k = self._key(source, identifier, end_iso_day)
        if k in self._store:
            self.hits += 1
            return self._store[k]
        self.misses += 1
        return None

    def set(self, source: str, identifier: str, end_iso_day: str, df: pd.DataFrame):
        k = self._key(source, identifier, end_iso_day)
        if k not in self._store:
            self._order.append(k)
        self._store[k] = df
        # LRU eviction
        while len(self._order) > self.max:
            old = self._order.pop(0)
            self._store.pop(old, None)

    def stats(self) -> str:
        total = self.hits + self.misses
        rate = (self.hits / total * 100) if total else 0
        return f"cache hits={self.hits} miss={self.misses} ({rate:.1f}% hit rate)"


cache = OHLCCache()


# ============================================================
# Historical OHLC fetchers (point-in-time)
# ============================================================
_last_binance = 0.0
_last_cg      = 0.0


async def _throttle_binance():
    global _last_binance
    now = time.time()
    wait = (_last_binance + BINANCE_GAP_S) - now
    if wait > 0:
        await asyncio.sleep(wait)
    _last_binance = time.time()


async def _throttle_cg():
    global _last_cg
    now = time.time()
    wait = (_last_cg + COINGECKO_GAP_S) - now
    if wait > 0:
        await asyncio.sleep(wait)
    _last_cg = time.time()


async def fetch_binance_historical(symbol_pair: str, end_dt: datetime,
                                    hours: int = LOOKBACK_HOURS) -> Optional[pd.DataFrame]:
    """Fetch 1h klines ending at end_dt, going back `hours` candles."""
    end_day_iso = end_dt.strftime("%Y-%m-%d")
    cached = cache.get("binance", symbol_pair, end_day_iso)
    if cached is not None:
        return cached

    await _throttle_binance()
    client  = get_binance_client()
    end_ms  = int(end_dt.timestamp() * 1000)
    try:
        r = await client.get(
            f"{BINANCE_BASE}/api/v3/klines",
            params={
                "symbol":   symbol_pair,
                "interval": "1h",
                "limit":    min(hours, 1000),
                "endTime":  end_ms,
            },
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
        df = df[["timestamp", "close"]].copy()
        cache.set("binance", symbol_pair, end_day_iso, df)
        return df
    except Exception as e:
        log.warning(f"Binance hist fetch failed for {symbol_pair} @ {end_dt}: {e}")
        return None


async def fetch_coingecko_historical(coin_id: str, end_dt: datetime,
                                      days: int = 30) -> Optional[pd.DataFrame]:
    """
    Fetch historical OHLC from CoinGecko ending at end_dt, going back `days`.
    Uses /coins/{id}/market_chart/range with from/to UNIX timestamps.
    NOTE: Demo tier limited to 365 days back. Signals older than that → None.
    """
    end_day_iso = end_dt.strftime("%Y-%m-%d")
    cached = cache.get("coingecko", coin_id, end_day_iso)
    if cached is not None:
        return cached

    # Check 365-day Demo tier limit
    age_days = (datetime.now(timezone.utc) - end_dt).days
    if age_days > 365:
        log.debug(f"  ↳ CoinGecko skip {coin_id}: signal age {age_days}d exceeds Demo tier limit")
        return None

    await _throttle_cg()
    client = get_coingecko_client()
    to_ts   = int(end_dt.timestamp())
    from_ts = to_ts - (days * 86400)

    url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart/range"
    params = {"vs_currency": "usd", "from": from_ts, "to": to_ts}

    backoff = 5.0
    for attempt in range(1, 4):
        try:
            r = await client.get(url, params=params, headers=_coingecko_headers())
            if r.status_code == 429:
                log.warning(f"  ⏳ CG 429 for {coin_id} (try {attempt}/3); backoff {backoff:.0f}s")
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            if r.status_code == 401:
                log.warning(f"  ↳ CG 401 for {coin_id}: data may be Pro-only")
                return None
            r.raise_for_status()
            prices = r.json().get("prices", [])
            if not prices:
                return None
            df = pd.DataFrame(prices, columns=["timestamp", "close"])
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            df["close"]     = df["close"].astype(float)
            cache.set("coingecko", coin_id, end_day_iso, df)
            return df
        except httpx.HTTPStatusError as e:
            log.warning(f"CG HTTP error for {coin_id}: {e}")
            return None
        except Exception as e:
            log.warning(f"CG fetch failed for {coin_id}: {e}")
            return None
    return None


# ============================================================
# Process one signal (point-in-time)
# ============================================================
async def process_signal_historical(conn: asyncpg.Connection, signal: dict,
                                     skip_coingecko: bool = False) -> str:
    """Returns: 'ok' | 'skipped' | 'insufficient' | 'failed'"""
    signal_id   = signal["signal_id"]
    pair        = signal["pair"]
    base_symbol = (signal.get("base_symbol") or QUOTE_RE.sub("", pair)).upper()
    coingecko_id= signal.get("coingecko_id")
    created_at  = signal["created_at_dt"]

    mapping_warning = detect_mapping_anomaly(base_symbol, coingecko_id)

    btc_df = await fetch_binance_historical("BTCUSDT", created_at, LOOKBACK_HOURS)
    coin_df = await fetch_binance_historical(pair, created_at, LOOKBACK_HOURS)
    data_source = "binance"

    if coin_df is None or len(coin_df) < MIN_TO_INSERT_LOW:
        if skip_coingecko or not coingecko_id:
            return "skipped"
        coin_df = await fetch_coingecko_historical(coingecko_id, created_at, days=30)
        data_source = "coingecko"

    if coin_df is None or btc_df is None or len(coin_df) < 30 or len(btc_df) < 30:
        # Still insert insufficient_data row so we don't reprocess
        metrics = {"sample_size": 0, "insufficient": True,
                   "corr_short": None, "corr_long": None, "beta": None,
                   "r_squared": None, "z_score": None,
                   "tail_corr_down": None, "tail_corr_up": None,
                   "downside_beta": None, "lead_lag": None,
                   "coin_vol_pct": None, "vol_ratio": None,
                   "momentum_div_7d": None, "is_extended": False,
                   "daily_sample": 0, "btc_down_samples": 0,
                   "btc_up_samples": 0, "btc_stress_days": 0}
    else:
        metrics = compute_advanced_metrics(coin_df, btc_df)
        if metrics is None:
            return "failed"

    confidence = determine_confidence(metrics)
    btc_ctx    = compute_btc_context(btc_df, None) if btc_df is not None and len(btc_df) >= 24 else {
        "price": None, "trend": "insufficient_data", "rsi_14": None,
        "change_24h_pct": None, "regime": "neutral", "dominance": None
    }
    interpretation = generate_interpretation(metrics, btc_ctx, confidence, mapping_warning)

    is_decoupled = False
    if metrics.get("corr_long") is not None and metrics.get("z_score") is not None:
        is_decoupled = abs(metrics["z_score"]) > 2 and abs(metrics["corr_long"]) < 0.5

    quality_legacy = ("high" if metrics["sample_size"] >= 500 else
                      "medium" if metrics["sample_size"] >= 200 else "low")

    await conn.execute("""
        INSERT INTO signal_btc_correlation (
            signal_id, pair, corr_1h_7d, corr_4h_30d, beta_30d, r_squared_30d, corr_zscore,
            btc_context, is_decoupled, interpretation,
            data_source, sample_quality, sample_size, confidence, worker_version,
            tail_corr_btc_down, tail_corr_btc_up, downside_beta,
            lead_lag_hours, volatility_ratio, coin_volatility_pct,
            momentum_divergence_7d, is_extended,
            snapshot_at, analyzed_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
            $24, now()
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
            snapshot_at        = EXCLUDED.snapshot_at,
            analyzed_at        = now()
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
        created_at,
    )

    return "ok" if confidence != "insufficient_data" else "insufficient"


# ============================================================
# Main backfill loop
# ============================================================
async def main(args):
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL required")

    log.info("🚀 LuxQuant Historical Backfill starting")
    log.info(f"   Mode: {'full' if args.days is None else f'last {args.days} days'}")
    log.info(f"   Force recompute: {args.force}")
    log.info(f"   Limit: {args.limit or 'unlimited'}")
    log.info(f"   Skip CoinGecko: {args.skip_coingecko}")
    log.info(f"   Binance gap: {BINANCE_GAP_S}s, CoinGecko gap: {COINGECKO_GAP_S}s")

    init_clients()
    conn = await asyncpg.connect(DB_DSN)

    # Build query — substitute INTERVAL inline (asyncpg doesn't parameterize it)
    where_clauses = ["s.pair IS NOT NULL", "s.pair <> ''"]
    if args.days:
        where_clauses.append(f"s.created_at::timestamptz > NOW() - INTERVAL '{int(args.days)} days'")
    if not args.force:
        where_clauses.append("c.signal_id IS NULL")

    where_sql = " AND ".join(where_clauses)
    limit_sql = f"LIMIT {int(args.limit)}" if args.limit else ""

    query = f"""
        SELECT s.signal_id, s.pair, s.created_at,
               co.base_symbol, co.coingecko_id
        FROM signals s
        LEFT JOIN coins co ON co.pair = s.pair
        LEFT JOIN signal_btc_correlation c ON c.signal_id = s.signal_id
        WHERE {where_sql}
        ORDER BY s.created_at ASC
        {limit_sql}
    """

    log.info("📋 Fetching signal list from DB...")
    rows = await conn.fetch(query)
    total = len(rows)
    log.info(f"   {total} signals to process")
    if total == 0:
        log.info("Nothing to do.")
        await conn.close()
        await close_clients()
        return

    # Pre-parse created_at
    signals = []
    for r in rows:
        d = dict(r)
        ca = d["created_at"]
        if isinstance(ca, str):
            try:
                d["created_at_dt"] = datetime.fromisoformat(ca.replace("Z", "+00:00"))
            except Exception:
                log.warning(f"Bad created_at for {d['signal_id']}: {ca!r}")
                continue
        elif isinstance(ca, datetime):
            d["created_at_dt"] = ca if ca.tzinfo else ca.replace(tzinfo=timezone.utc)
        else:
            continue
        signals.append(d)

    # ============================================================
    # Main loop with progress + stats
    # ============================================================
    stats = {"ok": 0, "insufficient": 0, "skipped": 0, "failed": 0}
    start = time.time()

    try:
        for i, signal in enumerate(signals, 1):
            try:
                result = await process_signal_historical(conn, signal,
                                                          skip_coingecko=args.skip_coingecko)
                stats[result] = stats.get(result, 0) + 1
            except Exception as e:
                stats["failed"] += 1
                log.exception(f"Failed {signal['signal_id'][:8]}…: {e}")

            # Progress every 25 or every 5%
            if i % 25 == 0 or i == total:
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                eta_s = (total - i) / rate if rate > 0 else 0
                eta_min = eta_s / 60
                log.info(
                    f"  [{i}/{total}] ({i*100/total:.1f}%) "
                    f"ok={stats['ok']} insuff={stats['insufficient']} "
                    f"skip={stats['skipped']} fail={stats['failed']} "
                    f"| {rate:.1f}/s, eta {eta_min:.1f}min | {cache.stats()}"
                )

    except KeyboardInterrupt:
        log.warning("\n⏸  Interrupted by user — already-processed signals are saved.")
    finally:
        elapsed = time.time() - start
        log.info("\n" + "="*70)
        log.info(f"🏁 Done in {elapsed/60:.1f} min")
        log.info(f"   ✅ ok:           {stats['ok']}")
        log.info(f"   ⚠️  insufficient: {stats['insufficient']}")
        log.info(f"   ⏭  skipped:      {stats['skipped']}")
        log.info(f"   ❌ failed:       {stats['failed']}")
        log.info(f"   📊 {cache.stats()}")
        log.info("="*70)
        await conn.close()
        await close_clients()


def parse_args():
    p = argparse.ArgumentParser(description="LuxQuant historical correlation backfill")
    p.add_argument("--days",    type=int, default=None,
                   help="Only backfill signals from last N days (default: ALL)")
    p.add_argument("--limit",   type=int, default=None,
                   help="Stop after N signals (testing)")
    p.add_argument("--force",   action="store_true",
                   help="Recompute even if correlation row exists")
    p.add_argument("--skip-coingecko", action="store_true",
                   help="Skip CoinGecko fallback (Binance-only, much faster)")
    return p.parse_args()


if __name__ == "__main__":
    try:
        asyncio.run(main(parse_args()))
    except KeyboardInterrupt:
        pass
