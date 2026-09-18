# backend/app/api/routes/entry_planner.py
"""Entry planner support: exchange order rules and the user's planner template.

A laddered plan is only useful if every number in it can be typed straight into
the exchange. The same coin has different rules per venue — measured 2026-09-19:
SOPH steps by 1 coin on Binance, 10 on Bybit, and by 100-coin contracts on OKX
and Gate; Bitunix will not take XPIN below 2000 coins; Binance BTC needs 50 USDT
where the others take 5. OKX and Gate size orders in CONTRACTS, so "133" typed
there is 133 contracts, not 133 coins.

Rules come from each venue's public instruments endpoint (no keys, no cost) and
are cached per process for six hours: they change when a venue relists, not
tick to tick. One venue failing never blocks the others.

The template lives under users.ui_prefs["entry_plan"], validated field by field.
It is written through its own endpoint because /ui-prefs deliberately stores
booleans only.
"""
from __future__ import annotations

import asyncio
import logging
import time
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entry-planner", tags=["entry-planner"])

EXCHANGES = ("binance", "bitget", "bybit", "okx", "gate", "bitunix")
RULES_TTL = 6 * 3600
_cache: dict[str, tuple[float, dict[str, dict[str, Any]]]] = {}
_locks: dict[str, asyncio.Lock] = {ex: asyncio.Lock() for ex in EXCHANGES}
UA = {"User-Agent": "LuxQuant/1.0 (+https://luxquant.tw)"}


def _dec(v: Any) -> str | None:
    """Plain decimal string, never scientific notation — the browser parses it."""
    if v in (None, ""):
        return None
    try:
        d = Decimal(str(v))
    except Exception:
        return None
    s = format(d.normalize(), "f")
    return s if s not in ("-0",) else "0"


def _rule(tick, step, min_qty=None, min_notional=None, unit="coin", contract_size="1") -> dict:
    return {
        "tick": _dec(tick),
        "step": _dec(step),
        "min_qty": _dec(min_qty),
        "min_notional": _dec(min_notional),
        # "contract": quantities are typed in contracts of contract_size coins.
        "unit": unit,
        "contract_size": _dec(contract_size) or "1",
    }


async def _get(client: httpx.AsyncClient, url: str, params: dict | None = None) -> Any:
    r = await client.get(url, params=params, headers=UA)
    r.raise_for_status()
    return r.json()


async def _binance(c) -> dict:
    data = await _get(c, "https://fapi.binance.com/fapi/v1/exchangeInfo")
    out = {}
    for s in data.get("symbols", []):
        if s.get("contractType") != "PERPETUAL" or s.get("quoteAsset") != "USDT":
            continue
        f = {x["filterType"]: x for x in s.get("filters", [])}
        lot = f.get("MARKET_LOT_SIZE") or f.get("LOT_SIZE") or {}
        limit_lot = f.get("LOT_SIZE") or lot
        out[s["symbol"]] = _rule(
            f.get("PRICE_FILTER", {}).get("tickSize"),
            limit_lot.get("stepSize"),
            limit_lot.get("minQty"),
            (f.get("MIN_NOTIONAL") or {}).get("notional"),
        )
    return out


async def _bitget(c) -> dict:
    data = await _get(c, "https://api.bitget.com/api/v2/mix/market/contracts",
                      {"productType": "USDT-FUTURES"})
    out = {}
    for r in data.get("data", []):
        try:
            # priceEndStep is the step of the last decimal, not the tick.
            tick = Decimal(str(r.get("priceEndStep") or 1)) * Decimal(10) ** -int(r.get("pricePlace") or 0)
        except Exception:
            continue
        out[str(r.get("symbol", "")).upper()] = _rule(
            tick, r.get("sizeMultiplier"), r.get("minTradeNum"), r.get("minTradeUSDT"))
    return out


async def _bybit(c) -> dict:
    out, cursor = {}, None
    for _ in range(10):
        params = {"category": "linear", "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        data = await _get(c, "https://api.bybit.com/v5/market/instruments-info", params)
        res = data.get("result", {})
        for r in res.get("list", []):
            if r.get("quoteCoin") != "USDT" or r.get("contractType") != "LinearPerpetual":
                continue
            lot = r.get("lotSizeFilter", {})
            out[r["symbol"]] = _rule(
                r.get("priceFilter", {}).get("tickSize"), lot.get("qtyStep"),
                lot.get("minOrderQty"), lot.get("minNotionalValue"))
        cursor = res.get("nextPageCursor")
        if not cursor:
            break
    return out


async def _okx(c) -> dict:
    data = await _get(c, "https://www.okx.com/api/v5/public/instruments", {"instType": "SWAP"})
    out = {}
    for r in data.get("data", []):
        if r.get("settleCcy") != "USDT" or r.get("ctType") != "linear":
            continue
        sym = r["instId"].replace("-SWAP", "").replace("-", "")
        out[sym] = _rule(r.get("tickSz"), r.get("lotSz"), r.get("minSz"),
                         unit="contract", contract_size=r.get("ctVal"))
    return out


async def _gate(c) -> dict:
    data = await _get(c, "https://api.gateio.ws/api/v4/futures/usdt/contracts")
    out = {}
    for r in data if isinstance(data, list) else []:
        sym = str(r.get("name", "")).replace("_", "")
        out[sym] = _rule(r.get("order_price_round"), "1", r.get("order_size_min"),
                         unit="contract", contract_size=r.get("quanto_multiplier"))
    return out


async def _bitunix(c) -> dict:
    data = await _get(c, "https://fapi.bitunix.com/api/v1/futures/market/trading_pairs")
    out = {}
    for r in data.get("data", []) if isinstance(data, dict) else []:
        try:
            tick = Decimal(10) ** -int(r.get("quotePrecision"))
            step = Decimal(10) ** -int(r.get("basePrecision"))
        except Exception:
            continue
        out[str(r.get("symbol", "")).upper()] = _rule(tick, step, r.get("minTradeVolume"))
    return out


FETCHERS = {"binance": _binance, "bitget": _bitget, "bybit": _bybit,
            "okx": _okx, "gate": _gate, "bitunix": _bitunix}


async def _rules_for(exchange: str, client: httpx.AsyncClient) -> dict[str, dict]:
    hit = _cache.get(exchange)
    if hit and time.time() - hit[0] < RULES_TTL:
        return hit[1]
    async with _locks[exchange]:
        hit = _cache.get(exchange)
        if hit and time.time() - hit[0] < RULES_TTL:
            return hit[1]
        try:
            table = await FETCHERS[exchange](client)
            if table:
                _cache[exchange] = (time.time(), table)
                return table
        except Exception as e:
            log.warning("entry-planner: %s rules fetch failed: %s", exchange, e)
        # A stale table beats none: rules rarely change.
        return hit[1] if hit else {}


@router.get("/rules")
async def exchange_rules(
    symbol: str = Query(..., min_length=3, max_length=30),
    user: User = Depends(get_current_user),
):
    sym = symbol.upper().replace("/", "").replace("-", "").replace("_", "")
    if not sym.endswith("USDT"):
        sym += "USDT"
    async with httpx.AsyncClient(timeout=15.0) as client:
        tables = await asyncio.gather(*(_rules_for(ex, client) for ex in EXCHANGES))
    rules = {ex: t.get(sym) for ex, t in zip(EXCHANGES, tables)}
    return {
        "symbol": sym,
        "rules": rules,
        "listed": [ex for ex, r in rules.items() if r],
        "cached_at": {ex: int(_cache[ex][0]) for ex in EXCHANGES if ex in _cache},
    }


# ── template ─────────────────────────────────────────────────────────────
TEMPLATE_DEFAULT = {
    "risk_usd": 10.0,
    "leverage": 5,
    "entries": 3,
    "weights": [40, 30, 30],
    "sl_mode": "buffer",       # "buffer" below/above SL1, or "sl2"
    "sl_buffer_pct": 0.2,
    "tp_split": [40, 30, 20, 10],
    "exchange": "binance",
    "include_fees": True,
    "entry1_price": "live",    # "live" (market fill ~ now) or "call"
}


def _num(v, lo, hi, name) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise HTTPException(422, f"{name} must be a number")
    if not (lo <= f <= hi):
        raise HTTPException(422, f"{name} must be between {lo} and {hi}")
    return f


def _pct_list(v, n_min, n_max, name) -> list[float]:
    if not isinstance(v, list) or not (n_min <= len(v) <= n_max):
        raise HTTPException(422, f"{name} must have {n_min}-{n_max} values")
    vals = [_num(x, 0, 100, name) for x in v]
    if abs(sum(vals) - 100) > 0.5:
        raise HTTPException(422, f"{name} must add up to 100")
    return vals


def _clean_template(data: dict) -> dict:
    t = dict(TEMPLATE_DEFAULT)
    if "risk_usd" in data:
        t["risk_usd"] = _num(data["risk_usd"], 0.01, 1_000_000, "risk_usd")
    if "leverage" in data:
        t["leverage"] = int(_num(data["leverage"], 1, 125, "leverage"))
    if "weights" in data:
        t["weights"] = _pct_list(data["weights"], 1, 5, "weights")
    t["entries"] = len(t["weights"])
    if "sl_mode" in data:
        if data["sl_mode"] not in ("buffer", "sl2"):
            raise HTTPException(422, "sl_mode must be buffer or sl2")
        t["sl_mode"] = data["sl_mode"]
    if "sl_buffer_pct" in data:
        t["sl_buffer_pct"] = _num(data["sl_buffer_pct"], 0, 10, "sl_buffer_pct")
    if "tp_split" in data:
        t["tp_split"] = _pct_list(data["tp_split"], 1, 4, "tp_split")
    if "exchange" in data:
        if data["exchange"] not in EXCHANGES:
            raise HTTPException(422, f"exchange must be one of {', '.join(EXCHANGES)}")
        t["exchange"] = data["exchange"]
    if "include_fees" in data:
        t["include_fees"] = bool(data["include_fees"])
    if "entry1_price" in data:
        if data["entry1_price"] not in ("live", "call"):
            raise HTTPException(422, "entry1_price must be live or call")
        t["entry1_price"] = data["entry1_price"]
    return t


@router.get("/template")
def get_template(user: User = Depends(get_current_user)):
    saved = (user.ui_prefs or {}).get("entry_plan")
    if not isinstance(saved, dict):
        return {**TEMPLATE_DEFAULT, "saved": False}
    try:
        return {**_clean_template(saved), "saved": True}
    except HTTPException:
        return {**TEMPLATE_DEFAULT, "saved": False}


@router.put("/template")
def put_template(
    data: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean = _clean_template(data or {})
    prefs = dict(user.ui_prefs or {})
    prefs["entry_plan"] = clean
    user.ui_prefs = prefs
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(user, "ui_prefs")
    db.commit()
    return {**clean, "saved": True}
