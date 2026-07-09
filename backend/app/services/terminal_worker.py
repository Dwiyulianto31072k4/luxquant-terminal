"""
LuxQuant Terminal - Derivatives & TA precompute worker
=======================================================
Feeds the Signals Analytics terminal so users NEVER hit an empty state:
everything is computed here in the background and the endpoint only reads
Redis (fresh → stale → {warming:true}).

One blob per sweep:  lq:terminal:deriv
  {
    generated_at, pairs: {
      "<PAIR>": {
        has_deriv: bool,           # listed on Binance futures?
        funding: float|None,       # last funding rate (fraction, e.g. 0.0001)
        oi: float|None,            # open interest in QUOTE units (contracts*price)
        oi_chg_1h / oi_chg_4h: %,  # from in-process anchors (warm ≈1h/4h)
        lsr: float|None,           # global accounts long/short ratio (5m)
        top_lsr: float|None,       # top trader positions L/S ratio (5m)
        taker: float|None,         # taker buy/sell vol ratio (5m)
        rsi: float|None,           # RSI(14) on 1h closes
        vol24h: float|None,        # futures 24h quote volume
        vol_chg_1h: %|None,        # Δ of rolling 24h volume over ~1h (anchor)
        price_chg_24h: %|None,     # futures ticker change
      }, ...
    }
  }

Budget: premiumIndex(all)=1 call · ticker24hr(all)=1 call ·
openInterest=1/pair (throttled) · LSR/topLSR/taker/RSI staggered in slices,
full coverage every ~4 sweeps. Well inside Binance IP weight limits.

Registered from cache_worker.start_cache_workers().
"""
import asyncio
import time
import traceback
from collections import deque
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.redis import cache_set, is_redis_available
from app.core.http_client import get_binance_client
from app.core.leader import is_leader

BINANCE_FUTURES_API = "https://fapi.binance.com"

SWEEP_INTERVAL = 120          # seconds between sweeps
# Binance /futures/data/* endpoints share a strict ~500 req/5min IP limit.
# 3 calls × SLICE_SIZE per sweep (2 min) → keep ≤ 40 pairs/sweep
# (= 3×40×2.5 = 300 req/5min, safely under). Full board coverage ≈ 20 min,
# fine for 5m-period metrics. Klines (weight-based limit) can go faster.
SLICE_SIZE = 40
BLOB_KEY = "lq:terminal:deriv"
BLOB_TTL = SWEEP_INTERVAL + 300   # generous floor; cache_set also keeps 10× stale

# in-process anchors (leader is a single process; warms ≈1h after boot)
_oi_hist = {}    # pair -> deque[(ts, oi)]
_vol_hist = {}   # pair -> deque[(ts, vol24h)]
_slice_cursor = 0
_slow = {}       # pair -> last slow metrics (lsr/top_lsr/taker/rsi) carried between sweeps


def _pairs_7d(db):
    """Distinct pairs from signals of the last 7 days (Potential Trades window)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    rows = db.execute(
        text("SELECT DISTINCT pair FROM signals WHERE created_at >= :c AND pair IS NOT NULL"),
        {"c": cutoff},
    ).fetchall()
    pairs = [r[0] for r in rows if r[0]]
    if "BTCUSDT" not in pairs:
        pairs.append("BTCUSDT")
    return pairs


def _rsi14(closes):
    """Wilder RSI(14) from a list of closes (needs >= 15)."""
    if len(closes) < 15:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    period = 14
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return round(100 - 100 / (1 + rs), 1)


def _anchor_chg(hist, pair, now_val, ts, minutes, append=True):
    """Δ% vs the sample closest to `minutes` ago (None until warm).
    Set append=False on repeat reads within the same sweep (avoid double-append)."""
    dq = hist.setdefault(pair, deque(maxlen=300))
    if append:
        dq.append((ts, now_val))
    target = ts - minutes * 60
    best = None
    for (t0, v0) in dq:
        if best is None or abs(t0 - target) < abs(best[0] - target):
            best = (t0, v0)
    if not best or best[1] in (None, 0):
        return None
    # need at least half the window covered to be meaningful
    if ts - best[0] < minutes * 60 * 0.5:
        return None
    return round((now_val - best[1]) / best[1] * 100, 2)


async def _sweep():
    """One full precompute sweep. Never raises (returns key count)."""
    global _slice_cursor
    client = get_binance_client()
    db = SessionLocal()
    try:
        pairs = _pairs_7d(db)
    finally:
        db.close()
    if not pairs:
        return 0

    now = time.time()
    out = {}

    # ── 1) funding for ALL futures symbols — single call ──────────
    funding = {}
    try:
        r = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex")
        if r.status_code == 200:
            for row in r.json():
                funding[row.get("symbol")] = float(row.get("lastFundingRate") or 0)
    except Exception:
        pass

    # ── 2) futures 24h tickers — single call ──────────────────────
    fut = {}
    try:
        r = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/24hr")
        if r.status_code == 200:
            for row in r.json():
                fut[row.get("symbol")] = {
                    "vol": float(row.get("quoteVolume") or 0),
                    "chg": float(row.get("priceChangePercent") or 0),
                    "price": float(row.get("lastPrice") or 0),
                }
    except Exception:
        pass

    deriv_pairs = [p for p in pairs if p in fut or p in funding]

    # ── 3) open interest per deriv pair (throttled) ────────────────
    oi_now = {}
    for i, p in enumerate(deriv_pairs):
        try:
            r = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol": p})
            if r.status_code in (418, 429):
                print(f"⚠️ Terminal deriv: OI rate-limited ({r.status_code}) — stopping OI pass")
                break
            if r.status_code == 200:
                contracts = float(r.json().get("openInterest") or 0)
                px = fut.get(p, {}).get("price") or 0
                oi_now[p] = contracts * px if px else contracts
        except Exception:
            pass
        if i % 10 == 9:
            await asyncio.sleep(1.0)   # ~10 req/s ceiling — polite to the shared IP

    # ── 4) SLOW metrics for a rotating slice (LSR/topLSR/taker/RSI) ─
    slice_pairs = deriv_pairs[_slice_cursor:_slice_cursor + SLICE_SIZE]
    if not slice_pairs:
        _slice_cursor = 0
        slice_pairs = deriv_pairs[:SLICE_SIZE]
    _slice_cursor += SLICE_SIZE
    if _slice_cursor >= len(deriv_pairs):
        _slice_cursor = 0

    throttled = False  # emergency brake — 429/418 means the WHOLE IP is at risk
    for i, p in enumerate(slice_pairs):
        if throttled:
            break
        slow = _slow.setdefault(p, {})
        for url, key, field in (
            ("/futures/data/globalLongShortAccountRatio", "lsr", "longShortRatio"),
            ("/futures/data/topLongShortPositionRatio", "top_lsr", "longShortRatio"),
            ("/futures/data/takerlongshortRatio", "taker", "buySellRatio"),
        ):
            try:
                r = await client.get(
                    f"{BINANCE_FUTURES_API}{url}",
                    params={"symbol": p, "period": "5m", "limit": 1},
                )
                if r.status_code in (418, 429):
                    print(f"⚠️ Terminal deriv: rate-limited ({r.status_code}) — aborting slice, backing off")
                    throttled = True
                    break
                if r.status_code == 200 and r.json():
                    slow[key] = round(float(r.json()[0].get(field) or 0), 3)
            except Exception:
                pass
            await asyncio.sleep(0.35)  # ≤ ~3 req/s on the strict futures/data pool
        if throttled:
            break
        try:
            r = await client.get(
                f"{BINANCE_FUTURES_API}/fapi/v1/klines",
                params={"symbol": p, "interval": "1h", "limit": 20},
            )
            if r.status_code in (418, 429):
                throttled = True
                break
            if r.status_code == 200:
                closes = [float(k[4]) for k in r.json()]
                slow["rsi"] = _rsi14(closes)
        except Exception:
            pass
        await asyncio.sleep(0.15)
    if throttled:
        await asyncio.sleep(60)  # cool the IP before the next sweep

    # ── 5) assemble blob ───────────────────────────────────────────
    for p in pairs:
        has_deriv = p in fut or p in funding
        f = fut.get(p, {})
        slow = _slow.get(p, {})
        oi = oi_now.get(p)
        out[p] = {
            "has_deriv": has_deriv,
            "funding": funding.get(p),
            "oi": oi,
            "oi_chg_1h": _anchor_chg(_oi_hist, p, oi, now, 60) if oi else None,
            "oi_chg_4h": _anchor_chg(_oi_hist, p, oi, now, 240, append=False) if oi else None,
            "lsr": slow.get("lsr"),
            "top_lsr": slow.get("top_lsr"),
            "taker": slow.get("taker"),
            "rsi": slow.get("rsi"),
            "vol24h": f.get("vol"),
            "vol_chg_1h": _anchor_chg(_vol_hist, p, f.get("vol"), now, 60) if f.get("vol") else None,
            "price_chg_24h": f.get("chg"),
        }

    blob = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_pairs": len(pairs),
        "deriv_pairs": len(deriv_pairs),
        "pairs": out,
    }
    cache_set(BLOB_KEY, blob, ttl=BLOB_TTL)
    return len(out)


async def terminal_deriv_loop():
    """Leader-elected background loop (same pattern as the other cache loops)."""
    print(f"🔄 Terminal derivatives worker started (interval: {SWEEP_INTERVAL}s)")
    await asyncio.sleep(6)
    while True:
        if not is_leader():
            await asyncio.sleep(15)
            continue
        try:
            if not is_redis_available():
                await asyncio.sleep(SWEEP_INTERVAL)
                continue
            start = time.time()
            n = await _sweep()
            print(f"✅ Terminal deriv blob: {n} pairs in {round((time.time()-start)*1000)}ms")
        except Exception as e:
            print(f"❌ Terminal deriv worker error: {type(e).__name__}: {e}")
            traceback.print_exc()
        await asyncio.sleep(SWEEP_INTERVAL)
