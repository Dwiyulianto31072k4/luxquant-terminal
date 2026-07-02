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
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_subscription
from app.models.delisting import DelistingEvent

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
        r = requests.get("https://api.binance.com/api/v3/ticker/price", timeout=15,
                         headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200:
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

    prices = _all_prices()
    exchanges = set()
    events = []
    for r in rows:
        exchanges.add(r.exchange)
        pa = r.price_at_announce or {}
        syms = []
        best = None
        for s in (r.symbols or []):
            cur = prices.get(s)
            at = pa.get(s)
            pct = None
            if cur and at:
                pct = round((cur - at) / at * 100, 2)
                if best is None or pct > best:
                    best = pct
            syms.append({"symbol": s, "price_at_announce": at, "current_price": cur, "pct": pct})
        events.append({
            "id": r.id,
            "exchange": r.exchange,
            "title": r.title,
            "url": r.url,
            "announced_at": r.announced_at.isoformat() if r.announced_at else None,
            "delist_at": r.delist_at.isoformat() if r.delist_at else None,
            "symbols": syms,
            "best_move_pct": best,
        })

    return {
        "events": events,
        "exchanges": sorted(exchanges),
        "count": len(events),
    }
