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
from app.core.redis import cache_set, cache_get, is_redis_available
from app.core.http_client import get_binance_client
from app.core.leader import is_leader

BINANCE_FUTURES_API = "https://fapi.binance.com"
BINANCE_SPOT_API = "https://api.binance.com"

WS_BLOB_KEY = "lq:terminal:ws"       # realtime funding/price/vol from binance_ws_worker
BYBIT_BLOB_KEY = "lq:terminal:bybit" # funding/OI/price/vol from bybit_worker (1 call, no Binance ban)
BYBIT_API = "https://api.bybit.com"   # klines for RSI/ATR (Binance is IP-banned here)
SWEEP_INTERVAL = 60           # ONE worker fills EVERYTHING every minute
# Binance /futures/data/* endpoints share a strict ~500 req/5min IP limit.
# 3 calls × SLICE_SIZE per sweep (2 min) — keep the sequential futures/data pass
# short enough that the sweep fits the interval. RSI klines are batched
# concurrently (fapi/v1, weight-based) so they no longer sit on this path.
SLICE_SIZE = 28
BLOB_KEY = "lq:terminal:deriv"
BLOB_TTL = SWEEP_INTERVAL + 300   # generous floor; cache_set also keeps 10× stale

# in-process anchors (leader is a single process; warms in minutes/hours)
_oi_hist = {}    # pair -> deque[(ts, oi)]
_vol_hist = {}   # pair -> deque[(ts, vol24h)]
_px_hist = {}    # pair -> deque[(ts, price)]  — powers server-side 15m movers
_slice_cursor = 0
_slow = {}       # pair -> last slow metrics (lsr/top_lsr/taker/rsi) carried between sweeps
_oi_last = {}    # pair -> last known OI (OI pass alternates sweeps)
_sweep_n = 0     # sweep counter — heavy blocks alternate to keep sweeps < 60s
_oi_cursor = 0   # OI is ALSO sliced (rotating) — never a 400+ burst again
OI_SLICE = 120
_fapi_banned_until = 0.0  # global cooldown when Binance answers 418/429

# post-signal historical stats (heavy — runs every ~6h)
PS_KEY = "lq:terminal:postsignal"
PS_INTERVAL = 6 * 3600
PS_TTL = 8 * 3600
_last_ps = 0.0


def _note_ban(resp, default_secs):
    """Honor Retry-After; back off HARD so we stop poking a live ban.

    Binance 418 IP-bans ESCALATE (2min → 3 days) every time you hit them while
    banned. Probing at each cooldown expiry was extending the ban. So enforce a
    long floor: 418 → ≥1h, 429 → ≥10min. WS keeps the data flowing once the ban
    lifts on its own — no REST poking needed to recover.
    """
    global _fapi_banned_until
    try:
        retry = int(resp.headers.get("Retry-After", "0"))
    except Exception:
        retry = 0
    status = getattr(resp, "status_code", 0)
    floor = 3600 if status == 418 else (600 if status == 429 else default_secs)
    _fapi_banned_until = time.time() + max(default_secs, retry, floor)
    print(f"⚠️ Terminal deriv: fapi cooldown {round(_fapi_banned_until - time.time())}s (status {status})")


def _fapi_ok():
    return time.time() >= _fapi_banned_until


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


# ── anchor persistence — survive restarts so 15m/1h warm-up isn't lost ──
_ANCHORS_KEY = "lq:terminal:anchors"
_ANCHORS_TTL = 6 * 3600
ANCHOR_SAVE_INTERVAL = 180   # save every ~3 min
ANCHOR_KEEP = 75             # samples/pair to persist (≥1h at 60s; keeps blob small)
_last_anchor_save = 0.0


def _save_anchors():
    """Snapshot rolling anchors to Redis (trimmed) so a restart keeps warm-up."""
    def dump(hist):
        out = {}
        for p, dq in hist.items():
            if dq:
                out[p] = [[t, v] for (t, v) in list(dq)[-ANCHOR_KEEP:]]
        return out
    try:
        cache_set(_ANCHORS_KEY, {
            "saved_at": time.time(),
            "oi": dump(_oi_hist), "vol": dump(_vol_hist), "px": dump(_px_hist),
        }, ttl=_ANCHORS_TTL)
    except Exception as e:
        print(f"   ⚠️ anchor save: {type(e).__name__}: {e}")


def _load_anchors():
    """Reload rolling anchors from Redis at worker start (fresh boot only)."""
    try:
        blob = cache_get(_ANCHORS_KEY)
        if not blob:
            return
        age = time.time() - (blob.get("saved_at") or 0)
        if age > _ANCHORS_TTL:
            return
        def load(hist, key):
            for p, rows in (blob.get(key) or {}).items():
                dq = hist.setdefault(p, deque(maxlen=300))
                for r in rows:
                    if isinstance(r, (list, tuple)) and len(r) == 2:
                        dq.append((r[0], r[1]))
        load(_oi_hist, "oi"); load(_vol_hist, "vol"); load(_px_hist, "px")
        print(f"   ♻️ anchors restored from Redis (age {round(age)}s): "
              f"oi={len(_oi_hist)} vol={len(_vol_hist)} px={len(_px_hist)}")
    except Exception as e:
        print(f"   ⚠️ anchor load: {type(e).__name__}: {e}")


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


def _spike_15m(pair, vol_now, ts):
    """Traded notional in the last ~15min vs the pair's normal pace (× ratio).
    Reads _vol_hist (already appended by the vol_chg_1h call this sweep)."""
    dq = _vol_hist.get(pair)
    if not dq or len(dq) < 2 or not vol_now:
        return None
    target = ts - 15 * 60
    best = None
    for (t0, v0) in dq:
        if best is None or abs(t0 - target) < abs(best[0] - target):
            best = (t0, v0)
    span_min = (ts - best[0]) / 60
    if span_min < 4 or not best[1]:
        return None
    traded = max(0.0, vol_now - best[1])
    expected = vol_now * (span_min / 1440)
    if expected <= 0:
        return None
    return round(traded / expected, 2)


async def _sweep():
    """One full precompute sweep. Never raises (returns key count)."""
    global _slice_cursor, _sweep_n
    _sweep_n += 1
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

    # ── 0) SOURCE PRIORITY for funding/price/vol/OI:
    #      Bybit (1 call, NOT affected by Binance bans) → Binance WS (if the IP
    #      allows it) → Binance REST premiumIndex+ticker (last resort). ───────
    funding = {}
    fut = {}
    bybit_oi = {}   # OI in USD from Bybit — replaces the 120-call Binance OI pass

    by = cache_get(BYBIT_BLOB_KEY) or {}
    by_pairs = by.get("pairs") or {}
    by_fresh = bool(by_pairs) and (now - (by.get("generated_at") or 0) < 120)

    ws = cache_get(WS_BLOB_KEY) or {}
    ws_pairs = ws.get("pairs") or {}
    ws_fresh = bool(ws_pairs) and (now - (ws.get("generated_at") or 0) < 90)

    if by_fresh:
        for sym, d in by_pairs.items():
            fr = d.get("funding")
            if fr is not None:
                funding[sym] = fr
            price = d.get("price")
            if price:
                fut[sym] = {"vol": d.get("vol") or 0, "chg": d.get("chg") or 0, "price": price, "basis": d.get("basis"), "range24": d.get("range24")}
            oi = d.get("oi")
            if oi:
                bybit_oi[sym] = oi
    elif ws_fresh:
        for sym, d in ws_pairs.items():
            fr = d.get("funding")
            if fr is not None:
                funding[sym] = fr
            price = d.get("price")
            if price:
                fut[sym] = {"vol": d.get("vol") or 0, "chg": d.get("chg") or 0, "price": price}
    else:
        # ── 1) funding for ALL futures symbols — single REST call ──────
        if _fapi_ok():
            try:
                r = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex")
                if r.status_code in (418, 429):
                    _note_ban(r, 600 if r.status_code == 418 else 120)
                elif r.status_code == 451:
                    _note_ban(r, 1800)  # geo/legal block — back off longer, keep logging
                    print("⛔ Terminal deriv: fapi 451 (region blocked) — futures data unavailable from this server IP")
                elif r.status_code == 200:
                    for row in r.json():
                        funding[row.get("symbol")] = float(row.get("lastFundingRate") or 0)
                else:
                    print(f"⚠️ Terminal deriv: fapi funding status {r.status_code}")
            except Exception as e:
                print(f"⚠️ Terminal deriv: fapi funding error {type(e).__name__}: {e}")

        # ── 2) futures 24h tickers — single REST call ──────────────────
        if _fapi_ok():
            try:
                r = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/ticker/24hr")
                if r.status_code in (418, 429):
                    _note_ban(r, 600 if r.status_code == 418 else 120)
                elif r.status_code == 451:
                    _note_ban(r, 1800)
                elif r.status_code == 200:
                    for row in r.json():
                        fut[row.get("symbol")] = {
                            "vol": float(row.get("quoteVolume") or 0),
                            "chg": float(row.get("priceChangePercent") or 0),
                            "price": float(row.get("lastPrice") or 0),
                        }
                else:
                    print(f"⚠️ Terminal deriv: fapi ticker status {r.status_code}")
            except Exception as e:
                print(f"⚠️ Terminal deriv: fapi ticker error {type(e).__name__}: {e}")

    deriv_pairs = [p for p in pairs if p in fut or p in funding]
    if not deriv_pairs:
        banned = max(0, round(_fapi_banned_until - time.time()))
        print(f"⚠️ Terminal deriv: NO futures data ({len(pairs)} pairs spot-only) — "
              f"fapi {'in cooldown ' + str(banned) + 's' if banned else 'reachable but returned nothing'}")

    # ── 2b) SPOT tickers — single call (covers spot-only pairs) ────
    spot = {}
    try:
        r = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr")
        if r.status_code == 200:
            wanted = set(pairs)
            for row in r.json():
                sym = row.get("symbol")
                if sym in wanted:
                    spot[sym] = {
                        "vol": float(row.get("quoteVolume") or 0),
                        "chg": float(row.get("priceChangePercent") or 0),
                        "price": float(row.get("lastPrice") or 0),
                    }
    except Exception:
        pass

    # ── 3) open interest ──────────────────────────────────────────
    # Bybit already gave OI for every pair in ONE call → use it and SKIP the
    # heavy Binance per-symbol OI pass entirely. Only fall back to Binance OI
    # (sliced) when Bybit is stale/cold.
    global _oi_cursor
    if bybit_oi:
        _oi_last.update(bybit_oi)
    elif _sweep_n % 2 == 1 and _fapi_ok() and deriv_pairs:
        oi_slice = deriv_pairs[_oi_cursor:_oi_cursor + OI_SLICE]
        if not oi_slice:
            _oi_cursor = 0
            oi_slice = deriv_pairs[:OI_SLICE]
        _oi_cursor += OI_SLICE
        if _oi_cursor >= len(deriv_pairs):
            _oi_cursor = 0
        # openInterest is fapi/v1 (weight 1, 2400/min limit) → safe to fire in
        # small CONCURRENT chunks. 120 sequential awaits over India→Binance RTT
        # took ~70s; chunked gather does it in a few seconds, well under limits.
        async def _one_oi(p):
            try:
                r = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol": p})
                if r.status_code in (418, 429):
                    _note_ban(r, 600 if r.status_code == 418 else 120)
                    return
                if r.status_code == 200:
                    contracts = float(r.json().get("openInterest") or 0)
                    px = fut.get(p, {}).get("price") or 0
                    _oi_last[p] = contracts * px if px else contracts
            except Exception:
                pass

        for j in range(0, len(oi_slice), 6):
            if not _fapi_ok():
                break
            await asyncio.gather(*[_one_oi(p) for p in oi_slice[j:j + 6]])
            await asyncio.sleep(0.5)   # peak ≈ 6 req / 0.5s ≈ 12 req/s — safe burst
    oi_now = _oi_last

    # ── 4) SLOW metrics slice (LSR/topLSR/taker/RSI) — alternate sweep ─
    if _sweep_n % 2 == 0:
        slice_pairs = deriv_pairs[_slice_cursor:_slice_cursor + SLICE_SIZE]
        if not slice_pairs:
            _slice_cursor = 0
            slice_pairs = deriv_pairs[:SLICE_SIZE]
        _slice_cursor += SLICE_SIZE
        if _slice_cursor >= len(deriv_pairs):
            _slice_cursor = 0
    else:
        slice_pairs = []

    for i, p in enumerate(slice_pairs):
        if not _fapi_ok():
            break
        slow = _slow.setdefault(p, {})
        for url, key, field in (
            ("/futures/data/globalLongShortAccountRatio", "lsr", "longShortRatio"),
            ("/futures/data/topLongShortPositionRatio", "top_lsr", "longShortRatio"),
            ("/futures/data/takerlongshortRatio", "taker", "buySellRatio"),
        ):
            if not _fapi_ok():
                break
            try:
                r = await client.get(
                    f"{BINANCE_FUTURES_API}{url}",
                    params={"symbol": p, "period": "5m", "limit": 1},
                )
                if r.status_code in (418, 429):
                    _note_ban(r, 600 if r.status_code == 418 else 120)
                    break
                if r.status_code == 200 and r.json():
                    slow[key] = round(float(r.json()[0].get(field) or 0), 3)
            except Exception:
                pass
            await asyncio.sleep(0.35)  # ≤ ~3 req/s on the strict futures/data pool

    # Multi-timeframe RSI(14) + ATR%(14). Source priority:
    #   PRIMARY  Bybit  (reachable here; Binance REST is IP-banned on this host)
    #   FALLBACK Binance (only if Bybit fails AND Binance isn't in cooldown)
    # Timeframes = the standard swing framework 1H / 4H / 1D (4H primary).
    # Both kline shapes share indices [_, open(1), high(2), low(3), close(4)];
    # Bybit returns newest-first so we reverse it. Fetched in small chunks.
    # (by_iv, bn_iv, label)
    _RSI_TFS = (("60", "1h", "1h"), ("240", "4h", "4h"), ("D", "1d", "1d"))

    async def _klines(p, by_iv, bn_iv):
        """Return klines oldest-first (Bybit primary, Binance fallback), or None."""
        try:
            r = await client.get(
                f"{BYBIT_API}/v5/market/kline",
                params={"category": "linear", "symbol": p, "interval": by_iv, "limit": 21},
            )
            if r.status_code == 200:
                d = r.json()
                if d.get("retCode") == 0:
                    raw = d.get("result", {}).get("list") or []
                    if len(raw) >= 15:
                        return raw[::-1]  # newest-first → oldest-first
        except Exception:
            pass
        if _fapi_ok():
            try:
                r = await client.get(
                    f"{BINANCE_FUTURES_API}/fapi/v1/klines",
                    params={"symbol": p, "interval": bn_iv, "limit": 20},
                )
                if r.status_code in (418, 429):
                    _note_ban(r, 600 if r.status_code == 418 else 120)
                elif r.status_code == 200:
                    b = r.json()
                    if len(b) >= 15:
                        return b
            except Exception:
                pass
        return None

    async def _one_rsi(p):
        s = _slow.setdefault(p, {})
        for by_iv, bn_iv, label in _RSI_TFS:
            kl = await _klines(p, by_iv, bn_iv)
            if not kl or len(kl) < 15:
                continue
            closes = [float(k[4]) for k in kl]
            s[f"rsi_{label}"] = _rsi14(closes)
            # ATR% (14) as % of price on this TF
            trs = []
            for i in range(1, len(kl)):
                hi, lo = float(kl[i][2]), float(kl[i][3])
                pc = float(kl[i - 1][4])
                trs.append(max(hi - lo, abs(hi - pc), abs(lo - pc)))
            atr = sum(trs[-14:]) / min(14, len(trs))
            last = closes[-1] or 0
            s[f"atr_{label}"] = round(atr / last * 100, 3) if last else None
        # legacy aliases: default momentum/ATR-levels math stays on 1h
        if "rsi_1h" in s:
            s["rsi"] = s["rsi_1h"]
        if "atr_1h" in s:
            s["atr_pct"] = s["atr_1h"]

    for j in range(0, len(slice_pairs), 4):
        await asyncio.gather(*[_one_rsi(p) for p in slice_pairs[j:j + 4]])
        await asyncio.sleep(0.4)

    # ── 5) assemble blob — price/vol/chg from futures, spot fallback ─
    # Bybit refreshes OI EVERY sweep → anchor every sweep; Binance-only refreshes
    # OI on odd sweeps → anchor only then.
    oi_appended = bool(bybit_oi) or (_sweep_n % 2 == 1)
    for p in pairs:
        has_deriv = p in fut or p in funding
        f = fut.get(p) or spot.get(p) or {}
        slow = _slow.get(p, {})
        oi = oi_now.get(p)
        price = f.get("price")
        vol = f.get("vol")
        out[p] = {
            "has_deriv": has_deriv,
            "price": price,
            "price_chg_24h": f.get("chg"),
            "vol24h": vol,
            # server-side LIVE layers (no client warm-up needed):
            "chg_15m": _anchor_chg(_px_hist, p, price, now, 15) if price else None,
            "vol_chg_1h": _anchor_chg(_vol_hist, p, vol, now, 60) if vol else None,
            "spike_15m": _spike_15m(p, vol, now) if vol else None,
            # derivatives:
            "funding": funding.get(p),
            "oi": oi,
            "oi_chg_1h": _anchor_chg(_oi_hist, p, oi, now, 60, append=oi_appended) if oi else None,
            "oi_chg_4h": _anchor_chg(_oi_hist, p, oi, now, 240, append=False) if oi else None,
            "lsr": slow.get("lsr"),
            "top_lsr": slow.get("top_lsr"),
            "taker": slow.get("taker"),
            "rsi": slow.get("rsi"),
            "rsi_1h": slow.get("rsi_1h"),
            "rsi_4h": slow.get("rsi_4h"),
            "rsi_1d": slow.get("rsi_1d"),
            "basis": f.get("basis"),        # perp premium % (mark vs index, Bybit)
            "atr_pct": slow.get("atr_pct"),  # hourly ATR as % of price
            "range24_pct": f.get("range24"),  # 24h realized range % (ATR levels)
        }

    btc = fut.get("BTCUSDT") or spot.get("BTCUSDT") or {}

    # ── composite scores (precomputed here; frontend just reads) ──────
    btc_chg = btc.get("chg") or 0.0
    _c01 = lambda x: 0.0 if x < 0 else (1.0 if x > 1 else x)          # noqa: E731
    _cpm = lambda x: -1.0 if x < -1 else (1.0 if x > 1 else x)        # noqa: E731
    for p, d in out.items():
        # MOMENTUM 0-100 — relative strength + volume acceleration + spike + rsi
        chg = d.get("price_chg_24h")
        rs = (chg - btc_chg) if chg is not None else None
        accel = d.get("vol_chg_1h")
        spike = d.get("spike_15m")
        rsi = d.get("rsi")
        m, w = 0.0, 0.0
        if rs is not None:    m += 0.50 * _c01((rs + 15) / 30);  w += 0.50
        if accel is not None: m += 0.25 * _c01(accel / 60);      w += 0.25
        if spike is not None: m += 0.15 * _c01((spike - 1) / 4); w += 0.15
        if rsi is not None:   m += 0.10 * _c01((rsi - 40) / 40); w += 0.10
        d["momentum"] = round((m / w) * 100, 1) if w > 0 else None
        d["rs_btc"] = round(rs, 2) if rs is not None else None

        # SQUEEZE 0-100 + side — how crowded/extended one side is (reversal fuel)
        fr, lsr, top, taker = d.get("funding"), d.get("lsr"), d.get("top_lsr"), d.get("taker")
        oi_chg = d.get("oi_chg_1h")
        bias = []
        if fr is not None:    bias.append(_cpm(fr / 0.0005))       # +0.05% funding = full long
        if lsr is not None:   bias.append(_cpm((lsr - 1) / 1.5))   # lsr 2.5 → +1
        if top is not None:   bias.append(_cpm((top - 1) / 1.0))
        if taker is not None: bias.append(_cpm((taker - 1) / 0.3))
        if bias:
            db = sum(bias) / len(bias)                              # -1..1 (long-crowded +)
            fuel = 0.7 + 0.3 * _c01((oi_chg or 0) / 40)
            d["squeeze"] = round(min(1.0, abs(db) * fuel) * 100, 1)
            d["squeeze_side"] = "long" if db > 0.12 else "short" if db < -0.12 else "flat"
        else:
            d["squeeze"] = None
            d["squeeze_side"] = None

    blob = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_pairs": len(pairs),
        "deriv_pairs": len(deriv_pairs),
        "btc": {"price": btc.get("price"), "chg": btc.get("chg")},
        "pairs": out,
    }
    cache_set(BLOB_KEY, blob, ttl=BLOB_TTL)
    return len(out)


def _parse_ts(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _horizon_pct(events, entry_ts, hours):
    """pct (sign-normalized) at the event closest to entry+H, within ±50% H."""
    target = entry_ts + hours * 3600
    best = None
    for ev in events:
        ts = _parse_ts(ev.get("at"))
        pct = ev.get("pct")
        if ts is None or pct is None:
            continue
        if best is None or abs(ts - target) < abs(best[0] - target):
            best = (ts, pct)
    if not best or abs(best[0] - target) > hours * 3600 * 0.5:
        return None
    try:
        return float(best[1])
    except Exception:
        return None


def compute_postsignal_stats():
    """Per-pair avg movement after a call (24h/48h/7d), avg peak/MAE, TP1 rate.
    Source: signal_journey.events (price path) + signals.peak_pct.
    Last 60 days, max 20 signals per pair, min 5 samples per pair.
    Heavy → worker-only; result cached with long TTL + stale copy.
    """
    db = SessionLocal()
    try:
        pairs = _pairs_7d(db)
        if not pairs:
            return 0
        cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).strftime("%Y-%m-%d %H:%M:%S")
        rows = db.execute(text("""
            WITH ranked AS (
                SELECT s.pair, s.peak_pct, j.events, j.initial_mae_pct,
                       j.time_to_tp1_seconds,
                       ROW_NUMBER() OVER (PARTITION BY s.pair ORDER BY s.created_at DESC) AS rn
                FROM signal_journey j
                JOIN signals s ON s.signal_id = j.signal_id
                WHERE s.created_at >= :cutoff AND s.pair = ANY(:pairs)
            )
            SELECT pair, peak_pct, events, initial_mae_pct, time_to_tp1_seconds
            FROM ranked WHERE rn <= 20
        """), {"cutoff": cutoff, "pairs": pairs}).mappings()

        acc = {}
        for r in rows:
            p = r["pair"]
            a = acc.setdefault(p, {"r24": [], "r48": [], "r7d": [], "peak": [], "mae": [], "tp1": 0, "n": 0})
            a["n"] += 1
            if r["time_to_tp1_seconds"]:
                a["tp1"] += 1
            if r["peak_pct"] is not None:
                try:
                    a["peak"].append(float(r["peak_pct"]))
                except Exception:
                    pass
            if r["initial_mae_pct"] is not None:
                a["mae"].append(float(r["initial_mae_pct"]))
            events = r["events"] or []
            if events:
                entry_ts = None
                for ev in events:
                    if ev.get("type") == "entry":
                        entry_ts = _parse_ts(ev.get("at"))
                        break
                if entry_ts is None:
                    entry_ts = _parse_ts(events[0].get("at"))
                if entry_ts:
                    for hours, key in ((24, "r24"), (48, "r48"), (168, "r7d")):
                        v = _horizon_pct(events, entry_ts, hours)
                        if v is not None:
                            a[key].append(v)

        def _avg(xs):
            return round(sum(xs) / len(xs), 2) if xs else None

        out = {}
        for p, a in acc.items():
            if a["n"] < 5:
                continue
            out[p] = {
                "avg_24h": _avg(a["r24"]),
                "avg_48h": _avg(a["r48"]),
                "avg_7d": _avg(a["r7d"]),
                "avg_peak": _avg(a["peak"]),
                "avg_mae": _avg(a["mae"]),
                "tp1_rate": round(a["tp1"] / a["n"] * 100, 1),
                "n": a["n"],
            }

        blob = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pairs": out,
        }
        cache_set(PS_KEY, blob, ttl=PS_TTL)
        return len(out)
    finally:
        db.close()


async def terminal_deriv_loop():
    """Leader-elected background loop (same pattern as the other cache loops)."""
    print(f"🔄 Terminal derivatives worker started (interval: {SWEEP_INTERVAL}s)")
    await asyncio.sleep(6)
    global _last_anchor_save
    _anchors_restored = False
    while True:
        if not is_leader():
            await asyncio.sleep(15)
            continue
        try:
            if not is_redis_available():
                await asyncio.sleep(SWEEP_INTERVAL)
                continue
            # reload warm-up anchors once, on first leader sweep after (re)start
            if not _anchors_restored:
                _load_anchors()
                _anchors_restored = True
            start = time.time()
            n = await _sweep()
            # persist anchors so a restart never wipes the 15m/1h warm-up
            if time.time() - _last_anchor_save > ANCHOR_SAVE_INTERVAL:
                _save_anchors()
                _last_anchor_save = time.time()
            # prewarm the screener cache too — users always read warm Redis
            try:
                from app.api.routes.terminal import get_deep_screener
                db = SessionLocal()
                try:
                    get_deep_screener(days=7, scope="all", db=db, current_user=None)
                finally:
                    db.close()
            except Exception as e:
                print(f"   ⚠️ screener prewarm: {type(e).__name__}: {e}")
            # post-signal historical stats — every ~6h (heavy journey scan)
            global _last_ps
            if time.time() - _last_ps > PS_INTERVAL:
                try:
                    t_ps = time.time()
                    n_ps = compute_postsignal_stats()
                    _last_ps = time.time()
                    print(f"   📊 Post-signal stats: {n_ps} pairs in {round((time.time()-t_ps)*1000)}ms")
                except Exception as e:
                    _last_ps = time.time() - PS_INTERVAL + 900  # retry in 15 min
                    print(f"   ⚠️ post-signal stats: {type(e).__name__}: {e}")
            print(f"✅ Terminal deriv blob: {n} pairs in {round((time.time()-start)*1000)}ms")
        except Exception as e:
            print(f"❌ Terminal deriv worker error: {type(e).__name__}: {e}")
            traceback.print_exc()
        await asyncio.sleep(SWEEP_INTERVAL)
