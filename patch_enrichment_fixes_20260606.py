#!/usr/bin/env python3
"""
patch_enrichment_fixes_20260606.py
==================================
Two coverage fixes for enrichment v3:

  BUG A (1178 missing in 90d, 85.62% coverage):
    Expand OHLCV exchange list from 2 (binance, bybit) -> 8.
    Covers new/tier-2 listings (MEXC, Gate, KuCoin, Bitget, BingX, OKX).
    Files: enrichment_worker.py (fetch_ohlcv, fetch_24h_volume)

  BUG B (funding "--" for all coins except BTC/ETH/SOL/BNB):
    Replace 4-symbol funding loop with single Binance premiumIndex call
    (returns ALL USDT perps). Cache to new key lq:market:funding-all
    (frontend key lq:market:funding-rates untouched -- keeps top-4 only).
    Files: cache_worker.py + enrichment_service_v3.py

Usage:
  python3 patch_enrichment_fixes_20260606.py            # dry-run
  python3 patch_enrichment_fixes_20260606.py --apply    # actually patch

Idempotent: re-running after a successful apply is a no-op (skip markers).
Validated: py_compile runs on every touched file after apply.
"""
import argparse
import py_compile
import sys
from pathlib import Path

REPO_ROOT = Path("/Users/dwiyulianto/Downloads/luxquant-fullstack")

# (file_relpath, old_str, new_str)
EDITS = [
    # --- BUG A.1: fetch_ohlcv exchange list ---------------------------------
    (
        "backend/app/services/enrichment_worker.py",
        '''async def fetch_ohlcv(pair: str, interval: str, limit: int = 150) -> pd.DataFrame:
    symbol = _normalize_pair(pair)
    tf = INTERVAL_MAP.get(interval, interval)

    for ExchangeClass in [ccxt_async.binance, ccxt_async.bybit]:''',
        '''async def fetch_ohlcv(pair: str, interval: str, limit: int = 150) -> pd.DataFrame:
    symbol = _normalize_pair(pair)
    tf = INTERVAL_MAP.get(interval, interval)

    # PATCH-2026-06-06-ENRICHMENT-A: expand exchange list -- covers new/tier-2 listings
    for ExchangeClass in [
        ccxt_async.binance,
        ccxt_async.bybit,
        ccxt_async.okx,
        ccxt_async.mexc,
        ccxt_async.gate,
        ccxt_async.kucoin,
        ccxt_async.bitget,
        ccxt_async.bingx,
    ]:''',
    ),
    # --- BUG A.2: fetch_24h_volume exchange list ----------------------------
    (
        "backend/app/services/enrichment_worker.py",
        '''async def fetch_24h_volume(pair: str) -> float:
    symbol = _normalize_pair(pair)

    for ExchangeClass in [ccxt_async.binance, ccxt_async.bybit]:''',
        '''async def fetch_24h_volume(pair: str) -> float:
    symbol = _normalize_pair(pair)

    # PATCH-2026-06-06-ENRICHMENT-A: expand exchange list
    for ExchangeClass in [
        ccxt_async.binance,
        ccxt_async.bybit,
        ccxt_async.okx,
        ccxt_async.mexc,
        ccxt_async.gate,
        ccxt_async.kucoin,
        ccxt_async.bitget,
        ccxt_async.bingx,
    ]:''',
    ),
    # --- BUG B.1: cache_worker.py -- replace 4-symbol loop with premiumIndex ---
    (
        "backend/app/services/cache_worker.py",
        '''            # Funding rates — sequential with small delay to reduce connection pressure
            for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]:
                try:
                    fr = await client.get(
                        f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate",
                        params={"symbol": sym, "limit": 1}
                    )
                    d = fr.json()
                    if d and isinstance(d, list):
                        result["fundingRates"].append({
                            "symbol": sym.replace("USDT", ""),
                            "rate": float(d[0]["fundingRate"]),
                            "time": int(d[0]["fundingTime"])
                        })
                except Exception:
                    continue
                await asyncio.sleep(0.2)  # CHANGED: small delay between requests''',
        '''            # PATCH-2026-06-06-ENRICHMENT-B: one premiumIndex call returns ALL USDT perps.
            # Builds two outputs:
            #   result["fundingRates"]    = top-4 (BTC/ETH/SOL/BNB) -- frontend backward-compat
            #   result["fundingRatesAll"] = every USDT perp -- consumed by enrichment worker
            try:
                pi = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex")
                pi_data = pi.json()
                if pi_data and isinstance(pi_data, list):
                    all_funding = []
                    for item in pi_data:
                        sym = item.get("symbol", "")
                        if not sym.endswith("USDT"):
                            continue
                        try:
                            rate = float(item.get("lastFundingRate", 0))
                            next_time = int(item.get("nextFundingTime", 0))
                        except (TypeError, ValueError):
                            continue
                        all_funding.append({
                            "symbol": sym.replace("USDT", ""),
                            "rate": rate,
                            "time": next_time,
                        })
                    top4 = {"BTC", "ETH", "SOL", "BNB"}
                    result["fundingRates"] = [f for f in all_funding if f["symbol"] in top4]
                    result["fundingRatesAll"] = all_funding
            except Exception:
                pass''',
    ),
    # --- BUG B.2: cache_worker.py -- write the new key to Redis -------------
    (
        "backend/app/services/cache_worker.py",
        '''                if overview.get("fundingRates"):
                    cache_set("lq:market:funding-rates", overview["fundingRates"], ttl=interval + 5)''',
        '''                if overview.get("fundingRates"):
                    cache_set("lq:market:funding-rates", overview["fundingRates"], ttl=interval + 5)
                # PATCH-2026-06-06-ENRICHMENT-B: full per-symbol funding for enrichment worker
                if overview.get("fundingRatesAll"):
                    cache_set("lq:market:funding-all", overview["fundingRatesAll"], ttl=interval + 5)''',
    ),
    # --- BUG B.3: enrichment_service_v3.py -- add new key constant ----------
    (
        "backend/app/services/enrichment_service_v3.py",
        '''REDIS_FUNDING_KEY = "lq:market:funding-rates"''',
        '''REDIS_FUNDING_KEY = "lq:market:funding-rates"
# PATCH-2026-06-06-ENRICHMENT-B: full per-symbol funding (populated by cache_worker)
REDIS_FUNDING_ALL_KEY = "lq:market:funding-all"''',
    ),
    # --- BUG B.4: enrichment_service_v3.py -- get_funding_rate reads new key first ---
    (
        "backend/app/services/enrichment_service_v3.py",
        '''def get_funding_rate(r: redis.Redis, symbol: str) -> Optional[float]:
    """
    Get latest funding rate for a symbol (e.g. 'BTC', 'ETH').
    Returns None if symbol not in funding rates list.
    """
    try:
        raw = r.get(REDIS_FUNDING_KEY)
        if not raw:
            return None
        data = json.loads(raw)
        for item in data:
            if item.get("symbol", "").upper() == symbol.upper():
                return _safe_float(item.get("rate"))
    except Exception as e:
        logger.debug(f"Funding rate fetch failed for {symbol}: {e}")
    return None''',
        '''def get_funding_rate(r: redis.Redis, symbol: str) -> Optional[float]:
    """
    Get latest funding rate for a symbol (e.g. 'BTC', 'ETH').
    PATCH-2026-06-06-ENRICHMENT-B: try the full per-symbol key first; fall back
    to the 4-symbol key for backward-compat / cold-start before cache_worker repopulates.
    """
    sym_u = symbol.upper()
    for key in (REDIS_FUNDING_ALL_KEY, REDIS_FUNDING_KEY):
        try:
            raw = r.get(key)
            if not raw:
                continue
            data = json.loads(raw)
            for item in data:
                if item.get("symbol", "").upper() == sym_u:
                    val = _safe_float(item.get("rate"))
                    if val is not None:
                        return val
        except Exception as e:
            logger.debug(f"Funding rate fetch failed for {symbol} from {key}: {e}")
    return None''',
    ),
]


def run(apply: bool) -> int:
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"=== Enrichment patcher [{mode}] ===\n")
    files_to_validate = set()
    issues = 0

    for rel, old, new in EDITS:
        path = REPO_ROOT / rel
        if not path.exists():
            print(f"  X  NOT FOUND: {path}")
            issues += 1
            continue
        src = path.read_text()
        if new in src:
            print(f"  -  SKIP (already patched): {rel}")
            continue
        if old not in src:
            print(f"  X  ANCHOR MISSING in {rel}")
            print(f"      wanted: {old[:80]!r}...")
            issues += 1
            continue
        if src.count(old) > 1:
            print(f"  X  ANCHOR NOT UNIQUE in {rel} ({src.count(old)} matches)")
            issues += 1
            continue
        print(f"  +  MATCH    : {rel}")
        if apply:
            path.write_text(src.replace(old, new))
            files_to_validate.add(path)

    if issues:
        print(f"\n{issues} issue(s) -- aborting before validation.")
        return 1

    if apply and files_to_validate:
        print("\nValidating with py_compile:")
        for p in sorted(files_to_validate):
            try:
                py_compile.compile(str(p), doraise=True)
                print(f"  +  {p.relative_to(REPO_ROOT)}")
            except py_compile.PyCompileError as e:
                print(f"  X  {p.relative_to(REPO_ROOT)}: {e}")
                return 1

    print(f"\n=== Done ({mode}) ===")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Write changes (default: dry-run)")
    sys.exit(run(ap.parse_args().apply))
