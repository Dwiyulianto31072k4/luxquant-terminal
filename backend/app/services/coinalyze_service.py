"""
Coinalyze Liquidation Service — CALL-CENTRIC, multi-exchange aggregated.
Data source: Coinalyze API (free, API key required)
  - Docs: https://api.coinalyze.net/v1/doc
  - Auth: header/query `api_key` (get key at coinalyze.net/account/api-key/)
  - Rate limit: 40 API calls / minute. NOTE: each symbol = 1 call (max 20/request).
  - Retention: intraday 1500–2000 datapoints; old intraday deleted daily.
  - Please cite Coinalyze if data shown publicly.

Design (see LUXQUANT_INTEL_ROADMAP.md §0 Call-Centric):
  We only pull liquidations for pairs that have an ACTIVE SIGNAL (≤7d) — NOT the
  whole market. That keeps us comfortably inside the 40/min free budget.

Endpoint used: GET /v1/liquidation-history
  params: symbols, interval, from, to (unix s), convert_to_usd=true
  response: [{"symbol": "...", "history": [{"t": <unix>, "l": <long_usd>, "s": <short_usd>}]}]
  (l = LONG liquidations, s = SHORT liquidations, in USD when convert_to_usd=true)

Output per pair (cached in Redis, served to the Liquidations tab / confluence engine):
  {
    "pair": "BTCUSDT",
    "liq_long_1h", "liq_short_1h", "total_1h",
    "liq_long_4h", "liq_short_4h", "total_4h",
    "side_bias",        # (short - long) / total  in [-1..1]  (>0 = shorts rekt)
    "robust_z",         # spike score of the latest bucket vs history (median/MAD)
    "spike",            # bool: robust_z >= Z_THRESHOLD
    "updated_at"
  }
"""
import os
import time
import json
import asyncio
import statistics
from typing import Optional

import httpx
from sqlalchemy import text

from app.core.redis import cache_get, cache_set, is_redis_available
from app.core.leader import is_leader

# ── Config ──────────────────────────────────────────────────────────
COINALYZE_BASE = "https://api.coinalyze.net/v1"
API_KEY = os.getenv("COINALYZEAPIKEY_TERMINAL", "")   # set in backend/.env (VPS)

INTERVAL = "5min"          # base granularity; we roll up to 1H / 4H ourselves
LOOKBACK_HOURS = 48        # history window for the robust-z baseline
BUCKETS_1H = 12            # 12 × 5min
BUCKETS_4H = 48            # 48 × 5min
Z_THRESHOLD = 3.0          # robust-z spike threshold (2.5 = more sensitive)

MAX_SYMBOLS_PER_REQ = 20   # Coinalyze hard cap (each symbol = 1 call)
RATE_PER_MIN = 40          # free-tier budget
PACE_SECONDS = 33          # sleep between requests → ~36 calls/min (safe margin under 40)
MAX_PAIRS = 120            # cap active pairs per cycle (~3.5 min refresh); raise with a dedicated key

CACHE_KEY = "lq:terminal:liquidations"  # Redis: single JSON string {pair: blob} (matches lq:terminal:* convention)
CACHE_TTL = 360            # 6 min (worker refreshes ~every 5 min)
MAP_KEY = "liq:symbolmap"  # Redis: LuxQuant pair -> Coinalyze symbol
MAP_TTL = 86400            # rebuild symbol map daily

# Preferred perp exchanges for the "primary" symbol, in order.
# v1 uses ONE representative perp per coin to stay within rate limits.
# Multi-exchange SUM (true aggregation) is a later toggle for top-N coins only.
EXCHANGE_PREFERENCE = ["A", "6", "F", "0"]  # TODO: confirm codes via /exchanges


# ════════════════════════════════════════════════════════════════════
# Robust z-score (median + MAD) — fat-tail safe, see roadmap §3
# ════════════════════════════════════════════════════════════════════
def robust_z(series: list[float], x: float) -> float:
    """0.6745 * (x - median) / MAD. Returns 0 when MAD is 0 / series too short."""
    if len(series) < 8:
        return 0.0
    med = statistics.median(series)
    mad = statistics.median([abs(v - med) for v in series])
    if mad == 0:
        return 0.0
    return 0.6745 * (x - med) / mad


# ════════════════════════════════════════════════════════════════════
# Symbol map: LuxQuant pair (e.g. "BTCUSDT") -> Coinalyze perp (e.g. "BTCUSDT_PERP.A")
# ════════════════════════════════════════════════════════════════════
async def _build_symbol_map() -> dict:
    """Fetch /future-markets once, map each USDT perpetual to a primary symbol."""
    url = f"{COINALYZE_BASE}/future-markets"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"api_key": API_KEY})
            resp.raise_for_status()
            markets = resp.json()
    except Exception as e:
        print(f"❌ Coinalyze future-markets error: {e}")
        return {}

    # group candidate perps by LuxQuant-style pair (base+quote, e.g. BTCUSDT)
    by_pair: dict[str, list[dict]] = {}
    for m in markets:
        if not m.get("is_perpetual"):
            continue
        if (m.get("quote_asset") or "").upper() != "USDT":
            continue
        pair = f"{m.get('base_asset', '').upper()}USDT"
        by_pair.setdefault(pair, []).append(m)

    def rank(mkt: dict) -> int:
        ex = str(mkt.get("exchange", ""))
        return EXCHANGE_PREFERENCE.index(ex) if ex in EXCHANGE_PREFERENCE else 99

    symbol_map = {}
    for pair, cands in by_pair.items():
        best = sorted(cands, key=rank)[0]
        symbol_map[pair] = best["symbol"]   # e.g. "BTCUSDT_PERP.A"
    return symbol_map


async def get_symbol_map() -> dict:
    cached = cache_get(MAP_KEY)
    if cached:
        return cached
    m = await _build_symbol_map()
    if m:
        cache_set(MAP_KEY, m, ttl=MAP_TTL)
    return m


# ════════════════════════════════════════════════════════════════════
# Fetch + aggregate liquidations for a SCOPED list of active-signal pairs
# ════════════════════════════════════════════════════════════════════
async def _fetch_liq_batch(coinalyze_symbols: list[str], since: int, until: int) -> list[dict]:
    url = f"{COINALYZE_BASE}/liquidation-history"
    params = {
        "symbols": ",".join(coinalyze_symbols),   # up to 20
        "interval": INTERVAL,
        "from": since,
        "to": until,
        "convert_to_usd": "true",
        "api_key": API_KEY,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params)
        if resp.status_code == 429:
            ra = resp.headers.get("Retry-After", "5")
            try:
                wait = max(1, int(float(ra)))
            except (TypeError, ValueError):
                wait = 5
            print(f"⏳ Coinalyze 429 — sleeping {wait}s")
            await asyncio.sleep(wait)
            resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


def _aggregate(history: list[dict]) -> dict:
    """history = [{t, l, s}] ascending. Roll up to 1H/4H + robust-z spike."""
    if not history:
        return {}
    longs = [float(h.get("l") or 0) for h in history]
    shorts = [float(h.get("s") or 0) for h in history]
    totals = [a + b for a, b in zip(longs, shorts)]

    l1, s1 = sum(longs[-BUCKETS_1H:]), sum(shorts[-BUCKETS_1H:])
    l4, s4 = sum(longs[-BUCKETS_4H:]), sum(shorts[-BUCKETS_4H:])
    t1, t4 = l1 + s1, l4 + s4
    side_bias = (s4 - l4) / t4 if t4 > 0 else 0.0

    # spike: latest 5min bucket vs the historical distribution of buckets
    z = robust_z(totals[:-1], totals[-1]) if len(totals) > 1 else 0.0

    return {
        "liq_long_1h": round(l1, 2), "liq_short_1h": round(s1, 2), "total_1h": round(t1, 2),
        "liq_long_4h": round(l4, 2), "liq_short_4h": round(s4, 2), "total_4h": round(t4, 2),
        "side_bias": round(side_bias, 3),
        "robust_z": round(z, 2),
        "spike": z >= Z_THRESHOLD,
        "updated_at": int(time.time()),
    }


async def refresh_scoped(pairs: list[str]) -> dict:
    """
    Main entrypoint (called by the scheduled worker).
    pairs = LuxQuant active-signal pairs, e.g. ["BTCUSDT","ETHUSDT",...].
    Respects 40/min by chunking; writes results to Redis hash CACHE_KEY.
    """
    symbol_map = await get_symbol_map()
    # keep only pairs Coinalyze actually has a perp for
    resolved = [(p, symbol_map[p]) for p in pairs if p in symbol_map]
    if not resolved:
        return {}

    # Cap per cycle so one full refresh stays within budget + interval.
    if MAX_PAIRS and len(resolved) > MAX_PAIRS:
        resolved = resolved[:MAX_PAIRS]

    since = int(time.time()) - LOOKBACK_HOURS * 3600
    until = int(time.time())
    out: dict[str, dict] = {}
    chunks = [resolved[i:i + MAX_SYMBOLS_PER_REQ]
              for i in range(0, len(resolved), MAX_SYMBOLS_PER_REQ)]

    for idx, chunk in enumerate(chunks):
        rev = {sym: pair for pair, sym in chunk}
        try:
            blobs = await _fetch_liq_batch([s for _, s in chunk], since, until)
        except Exception as e:
            print(f"❌ Coinalyze liquidation batch error: {e}")
            blobs = []

        for blob in blobs:
            pair = rev.get(blob.get("symbol"))
            if not pair:
                continue
            agg = _aggregate(blob.get("history", []))
            if agg:
                agg["pair"] = pair
                out[pair] = agg

        # Pace evenly to stay under RATE_PER_MIN (each symbol = 1 call).
        if idx < len(chunks) - 1:
            await asyncio.sleep(PACE_SECONDS)

    # persist for the sync route/confluence engine to read via cache_get
    if out:
        cache_set(CACHE_KEY, out, ttl=CACHE_TTL)
    return out


def get_scoped(pairs: Optional[list[str]] = None) -> dict:
    """Read cached liquidation blobs (optionally filtered to `pairs`). Sync — used by the
    FastAPI route and the confluence engine."""
    data = cache_get(CACHE_KEY) or {}
    if pairs:
        return {p: v for p, v in data.items() if p in pairs}
    return data


# ════════════════════════════════════════════════════════════════════
# Background worker (leader-elected) — CALL-CENTRIC refresh
# ════════════════════════════════════════════════════════════════════
REFRESH_INTERVAL = 600  # 10 min (liquidation context doesn't need faster; respects 40/min)


def _active_pairs(days: int = 7) -> list[str]:
    """Distinct pairs with a signal in the last `days` — the ACTIVE-CALL universe."""
    from datetime import datetime, timedelta, timezone
    from app.core.database import SessionLocal
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    db = SessionLocal()
    try:
        rows = db.execute(
            text("SELECT DISTINCT pair FROM signals WHERE created_at >= :cutoff"),
            {"cutoff": cutoff},
        ).fetchall()
        return [r[0] for r in rows if r and r[0]]
    finally:
        db.close()


async def coinalyze_liquidation_loop():
    print(f"🔄 Coinalyze liquidation worker started (interval: {REFRESH_INTERVAL}s)")
    await asyncio.sleep(10)
    while True:
        if not is_leader():
            await asyncio.sleep(15)   # standby — only the leader hits the API
            continue
        try:
            if not is_redis_available():
                await asyncio.sleep(REFRESH_INTERVAL)
                continue
            pairs = await asyncio.to_thread(_active_pairs, 7)
            if pairs:
                out = await refresh_scoped(pairs)
                print(f"✅ Coinalyze liquidations: {len(out)}/{len(pairs)} pairs cached")
        except Exception as e:
            print(f"❌ Coinalyze worker error: {type(e).__name__}: {e}")
        await asyncio.sleep(REFRESH_INTERVAL)


def start_coinalyze_workers():
    """Register in main.py startup, next to start_overview_workers()."""
    if not API_KEY:
        print("⚠️ COINALYZEAPIKEY_TERMINAL not set — liquidation worker NOT started")
        return
    loop = asyncio.get_event_loop()
    loop.create_task(coinalyze_liquidation_loop())
    print("📊 Coinalyze liquidation worker registered (interval: 300s)")
