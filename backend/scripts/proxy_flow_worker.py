#!/usr/bin/env python3
"""
LuxQuant — Market Pulse flow worker (runs on luxquant-proxy).

Fetches Binance USDT-M futures metrics from THIS machine's IP (separate weight
budget from the main VPS), then POSTs a compact snapshot to the main API.

Coverage:
  ONLY pairs currently active on Market Pulse (distinct feed).
  No Binance volume-fill of unrelated symbols — everything here is Pulse-related.

Efficiency:
  One klines(5m, limit=13) per symbol → ticks_5m + chg_5m + chg_1h
  (avoids a second 1h kline call; keeps IP weight under ~2400/min)

Env:
  FLOW_INGEST_URL      default https://luxquant.tw/api/v1/market-pulse/flow/ingest
  FLOW_PULSE_FEED_URL  default https://luxquant.tw/api/v1/market-pulse/feed?limit=500&distinct=true
  FLOW_INGEST_SECRET   must match main VPS FLOW_INGEST_SECRET
  FLOW_MAX_SYMBOLS     hard cap (default 400)
  FLOW_INTERVAL_SEC    default 30
  FLOW_CONCURRENCY     default 18
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set, Tuple

FAPI = "https://fapi.binance.com"
INGEST_URL = os.getenv(
    "FLOW_INGEST_URL", "https://luxquant.tw/api/v1/market-pulse/flow/ingest"
)
PULSE_FEED_URL = os.getenv(
    "FLOW_PULSE_FEED_URL",
    "https://luxquant.tw/api/v1/market-pulse/feed?limit=500&distinct=true",
)
SECRET = os.getenv("FLOW_INGEST_SECRET", "lq-flow-proxy-v1-change-me")
MAX_SYMBOLS = int(os.getenv("FLOW_MAX_SYMBOLS", "400"))
INTERVAL = int(os.getenv("FLOW_INTERVAL_SEC", "30"))
CONCURRENCY = int(os.getenv("FLOW_CONCURRENCY", "18"))
UA = "luxquant-proxy-flow/1.2"


def http_json(url: str, timeout: float = 20.0) -> Any:
    # Quote non-ASCII path/query safely (some Pulse pairs use CJK tickers)
    parts = urllib.parse.urlsplit(url)
    safe_url = urllib.parse.urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            urllib.parse.quote(parts.path, safe="/"),
            urllib.parse.quote(parts.query, safe="=&%"),
            parts.fragment,
        )
    )
    req = urllib.request.Request(safe_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(url: str, body: dict, headers: dict, timeout: float = 25.0) -> Tuple[int, str]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={**headers, "Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def fetch_pulse_pairs() -> Set[str]:
    """Pairs currently on Market Pulse (distinct feed). Best-effort."""
    try:
        data = http_json(PULSE_FEED_URL, timeout=15)
    except Exception as e:
        print(f"[flow] pulse feed fail: {e}", file=sys.stderr)
        return set()
    events = data.get("events") if isinstance(data, dict) else None
    if not isinstance(events, list):
        return set()
    out: Set[str] = set()
    for e in events:
        if not isinstance(e, dict):
            continue
        pair = str(e.get("pair") or "").upper().strip()
        if pair.endswith("USDT") and "_" not in pair:
            out.add(pair)
    return out


def kline_bundle(symbol: str) -> Tuple[Optional[int], Optional[float], Optional[float]]:
    """
    Single 5m kline pull → (ticks_5m, chg_5m, chg_1h).

    Uses last CLOSED 5m candle for ticks/chg_5m.
    chg_1h ≈ open of ~12 closed candles ago → close of last closed (≈1h).
    """
    sym_q = urllib.parse.quote(symbol, safe="")
    url = f"{FAPI}/fapi/v1/klines?symbol={sym_q}&interval=5m&limit=13"
    try:
        rows = http_json(url, timeout=12)
    except Exception as e:
        print(f"[flow] kline fail {symbol}: {e}", file=sys.stderr)
        return None, None, None
    if not isinstance(rows, list) or not rows:
        return None, None, None

    # Prefer closed candle: if we have ≥2, last is still forming → use [-2]
    closed = rows[:-1] if len(rows) >= 2 else rows
    if not closed:
        return None, None, None
    last = closed[-1]
    try:
        o5 = float(last[1])
        c5 = float(last[4])
        ticks = int(last[8])
        chg_5m = ((c5 - o5) / o5) * 100.0 if o5 else None
    except (TypeError, ValueError, IndexError):
        return None, None, None

    chg_1h: Optional[float] = None
    try:
        # ~12 × 5m = 1h of closed candles
        hour_start = closed[-12] if len(closed) >= 12 else closed[0]
        o1 = float(hour_start[1])
        c1 = float(last[4])
        if o1:
            chg_1h = ((c1 - o1) / o1) * 100.0
    except (TypeError, ValueError, IndexError):
        chg_1h = None

    return ticks, chg_5m, chg_1h


def select_tickers(tickers: List[dict], pulse_pairs: Set[str]) -> List[dict]:
    """ONLY Market Pulse pairs that also exist on Binance USDT-M futures."""
    by_sym: Dict[str, dict] = {}
    for t in tickers:
        sym = str(t.get("symbol") or "")
        if not sym.endswith("USDT") or "_" in sym:
            continue
        by_sym[sym] = t

    chosen: List[str] = []
    for pair in sorted(pulse_pairs):
        if pair in by_sym:
            chosen.append(pair)
        if len(chosen) >= MAX_SYMBOLS:
            break
    return [by_sym[s] for s in chosen]


def build_snapshot() -> Tuple[List[dict], int]:
    tickers = http_json(f"{FAPI}/fapi/v1/ticker/24hr", timeout=25)
    if not isinstance(tickers, list):
        raise RuntimeError(f"unexpected ticker payload: {type(tickers)}")

    pulse_pairs = fetch_pulse_pairs()
    selected = select_tickers(tickers, pulse_pairs)

    def enrich(t: dict) -> Optional[dict]:
        sym = t["symbol"]
        ticks_5m, chg_5m, chg_1h = kline_bundle(sym)
        try:
            price = float(t.get("lastPrice") or 0)
            chg_24h = float(t.get("priceChangePercent") or 0)
            qv = float(t.get("quoteVolume") or 0)
            trades_24h = int(float(t.get("count") or 0))
        except (TypeError, ValueError):
            return None
        return {
            "pair": sym,
            "price": price,
            "ticks_5m": ticks_5m,
            "chg_5m": chg_5m,
            "chg_1h": chg_1h,
            "chg_24h": chg_24h,
            "quote_volume_24h": qv,
            "trades_24h": trades_24h,
            "in_pulse": sym in pulse_pairs,
        }

    items: List[dict] = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = {pool.submit(enrich, t): t.get("symbol") for t in selected}
        for fut in as_completed(futs):
            try:
                row = fut.result()
            except Exception as e:
                print(f"[flow] enrich error {futs[fut]}: {e}", file=sys.stderr)
                continue
            if row:
                items.append(row)

    items.sort(key=lambda x: (x.get("ticks_5m") or 0), reverse=True)
    return items, len(pulse_pairs)


def cycle() -> None:
    t0 = time.time()
    items, pulse_n = build_snapshot()
    status, body = http_post_json(
        INGEST_URL,
        {
            "items": items,
            "source": "binance_futures",
            "pulse_pairs": pulse_n,
        },
        {"X-Flow-Token": SECRET},
    )
    dt = time.time() - t0
    in_pulse = sum(1 for x in items if x.get("in_pulse"))
    print(
        f"[flow] posted {len(items)} items (pulse_pairs={pulse_n} covered={in_pulse}) "
        f"status={status} in {dt:.1f}s body={body[:140]}",
        flush=True,
    )


def main() -> None:
    print(
        f"[flow] start url={INGEST_URL} mode=pulse-only max_symbols={MAX_SYMBOLS} "
        f"interval={INTERVAL}s concurrency={CONCURRENCY}",
        flush=True,
    )
    while True:
        try:
            cycle()
        except Exception as e:
            print(f"[flow] cycle error: {e}", file=sys.stderr, flush=True)
        time.sleep(max(10, INTERVAL))


if __name__ == "__main__":
    main()
