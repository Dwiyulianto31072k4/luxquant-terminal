# backend/app/api/routes/delisting.py
"""
Exchange Delisting Alerts — baca delisting_events (diisi delisting_worker.py)
dan hitung % move sejak announce (pump-after-delist tracker).

Auth: require_subscription (premium/subscriber/admin), konsisten dgn money-flow.
"""
import time
import logging
from typing import Optional

import requests
from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_subscription
from app.models.delisting import DelistingEvent
from app.core.http_client import binance_get_sync

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/delistings",
    tags=["Delistings"],
    dependencies=[Depends(require_subscription)],
)

# ── cache harga (biar tidak fetch Binance tiap request) ──
_PRICE_CACHE = {"ts": 0.0, "map": {}}
_PRICE_TTL = 60  # detik


def _all_prices():
    """Map {BASE: price_usdt} dari Binance (1 call, cached 60s)."""
    now = time.time()
    if now - _PRICE_CACHE["ts"] < _PRICE_TTL and _PRICE_CACHE["map"]:
        return _PRICE_CACHE["map"]
    m = {}
    try:
        r = binance_get_sync("https://api.binance.com/api/v3/ticker/price", timeout=15)
        if r is not None and r.status_code == 200:
            for it in r.json():
                sym = it.get("symbol", "")
                if sym.endswith("USDT"):
                    try:
                        m[sym[:-4]] = float(it["price"])
                    except Exception:
                        pass
            _PRICE_CACHE["map"] = m
            _PRICE_CACHE["ts"] = now
    except Exception as e:
        logger.warning(f"delisting price fetch failed: {e}")
        return _PRICE_CACHE["map"]  # fallback ke cache lama
    return m


@router.get("")
async def list_delistings(
    exchange: Optional[str] = Query(None, description="filter: binance|bybit|okx"),
    limit: int = Query(60, le=200),
    _: bool = Depends(require_subscription),
    db: Session = Depends(get_db),
):
    q = db.query(DelistingEvent).order_by(DelistingEvent.announced_at.desc().nullslast())
    if exchange:
        q = q.filter(DelistingEvent.exchange == exchange.lower())
    rows = q.limit(limit).all()

    # _all_prices() does a synchronous Binance call (cached 60s). Offload to a
    # threadpool so it never blocks the async event loop / freezes the worker.
    prices = await run_in_threadpool(_all_prices)

    # ── Lookup call LuxQuant per token (pintasan buka call) ──
    pairs = list({f"{s}USDT" for r in rows for s in (r.symbols or [])})
    call_map = {}  # PAIR -> [(signal_id, created_at), ...] (desc)
    if pairs:
        try:
            res = db.execute(text(
                "SELECT signal_id, pair, created_at FROM signals "
                "WHERE pair = ANY(:p) ORDER BY created_at DESC"
            ), {"p": pairs}).fetchall()
            for sid, pair, ca in res:
                call_map.setdefault((pair or "").upper(), []).append((str(sid), ca))
        except Exception as e:
            logger.warning(f"delisting call lookup failed: {e}")

    def _ts(dt):
        try:
            return dt.timestamp()
        except Exception:
            return None

    def pick_call(token, announced):
        calls = call_map.get(f"{token}USDT".upper(), [])
        if not calls:
            return None, False
        ann = _ts(announced)
        after = [c for c in calls if ann and _ts(c[1]) and _ts(c[1]) >= ann]
        if after:
            c = min(after, key=lambda x: _ts(x[1]))  # call pertama setelah announce
            return c[0], True
        return calls[0][0], False  # fallback: call terbaru

    exchanges = set()
    out = []  # flat per-token rows (struktur rapi, filterable/sortable di frontend)
    for r in rows:
        exchanges.add(r.exchange)
        pa = r.price_at_announce or {}
        peak = r.peak_since_announce or {}
        base = {
            "id": r.id,
            "exchange": r.exchange,
            "title": r.title,
            "url": r.url,
            "announced_at": r.announced_at.isoformat() if r.announced_at else None,
            "delist_at": r.delist_at.isoformat() if r.delist_at else None,
        }
        syms = r.symbols or []
        if not syms:
            out.append({**base, "token": None, "price_at_announce": None,
                        "current_price": None, "current_pct": None,
                        "peak_price": None, "peak_pct": None, "peak_at": None})
            continue
        for s in syms:
            entry = pa.get(s)
            cur = prices.get(s)
            cur_pct = round((cur - entry) / entry * 100, 2) if (cur and entry) else None
            pk = peak.get(s) or {}
            call_id, call_after = pick_call(s, r.announced_at)
            out.append({
                **base,
                "token": s,
                "price_at_announce": entry,
                "current_price": cur,
                "current_pct": cur_pct,
                "peak_price": pk.get("peak"),
                "peak_pct": pk.get("peak_pct"),
                "peak_at": pk.get("peak_at"),
                "call_signal_id": call_id,
                "call_after_announce": call_after,
            })

    return {
        "rows": out,
        "exchanges": sorted(exchanges),
        "count": len(out),
    }
