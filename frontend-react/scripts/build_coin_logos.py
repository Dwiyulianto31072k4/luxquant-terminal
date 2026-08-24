#!/usr/bin/env python3
"""
Build the local coin-logo library and its manifest.

Why this exists
---------------
Logos used to be resolved *by ticker* against three public CDNs. A ticker is
not an identity: LiveCoinWatch — source #1, 88.7% coverage — served AEROCHAIN
for AERO, and a stranger's mark for HYPE and HYPER. The old defence was a
two-symbol override list, which only ever covered the mismatches somebody
happened to notice.

So the library is built from *identity*, never from a name:

  1. Hand-audited files already in public/coin-logos. Somebody compared these
     against the real project; that outranks any automated source.
  2. CoinGecko, but only where identity is **proven by price**: the Binance
     futures mark price must land within 10% of CoinGecko's price for that id,
     and exactly one candidate id may match. Symbol equality is what created
     this bug in the first place; it is not evidence.
  3. The backend's curated library (COIN_LOGO_DIR) — the marks the signal cards
     publish. Mostly right, but not always: checked against price-proven
     identities it had the wrong project for PLAY, TLM, UAI, TAKE, APR, TAC,
     IDOL, STBL and MOCA, which is why proof is ranked above curation.

Anything left unproven keeps the CDN cascade at runtime. Guessing a logo is
how the wrong project ends up on a page.

Usage:  python3 scripts/build_coin_logos.py --library /path/to/coin-logos
        (get the library with: rsync -a luxquant-vps:/opt/luxquant/coin-logos/ ./lib/)
"""
from __future__ import annotations

import argparse
import collections
import io
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from PIL import Image

HDR = {"User-Agent": "Mozilla/5.0 (luxquant coin-logo builder)"}
CG = "https://api.coingecko.com/api/v3"
BINANCE_TICKER = "https://fapi.binance.com/fapi/v1/ticker/price"
PRICE_TOLERANCE = 0.10          # ±10% — enough for a futures/spot basis, far
                                # tighter than any two different projects.
MAX_PX = 128                    # logos render at 20-40px; 128 covers retina.
QUOTE_RE = re.compile(r"(USDT|BUSD|USDC|USD)$", re.I)
MULT_RE = re.compile(r"^(1000000|1000|1M)(?=[A-Z])")
MULTS = {"1000000": 1e6, "1000": 1e3, "1M": 1e6}


def base_symbol(pair: str) -> str:
    """BTCUSDT -> BTC, 1000PEPEUSDT -> PEPE. Never strips a symbol to nothing."""
    stripped = QUOTE_RE.sub("", pair) or pair
    return MULT_RE.sub("", stripped).upper()


def multiplier(pair: str, cg_id: str) -> float:
    """1000CATUSDT is 1000x CAT — unless the CoinGecko id is itself `1000cat`."""
    m = MULT_RE.match(pair)
    if m and not re.match(r"^(1000000|1000|1m)", cg_id):
        return MULTS[m.group(1)]
    return 1.0


def get_json(url: str, **kw):
    for attempt in range(6):
        try:
            r = requests.get(url, headers=HDR, timeout=60, **kw)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                time.sleep(20 + attempt * 10)
                continue
        except requests.RequestException:
            time.sleep(5)
    return None


def cg_markets(ids: list[str]) -> dict:
    """Batched /coins/markets — 250 ids a call, so 600 coins costs 3 requests."""
    out: dict[str, dict] = {}
    for i in range(0, len(ids), 250):
        chunk = ids[i : i + 250]
        data = get_json(
            f"{CG}/coins/markets",
            params={"vs_currency": "usd", "ids": ",".join(chunk), "per_page": 250, "page": 1},
        )
        for item in data or []:
            out[item["id"]] = {"price": item.get("current_price"),
                               "image": item.get("image"),
                               "name": item.get("name")}
        time.sleep(8)
    return out


def normalize(raw: bytes, dest: Path) -> bool:
    """Re-encode to a capped PNG. Keeps transparency; drops EXIF and huge art."""
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception:
        return False
    im = im.convert("RGBA")
    if max(im.size) > MAX_PX:
        im.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG", optimize=True)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--library", required=True, help="copy of the backend COIN_LOGO_DIR")
    ap.add_argument("--pairs", required=True, help="file of pairs, one per line")
    ap.add_argument("--ids", help="optional 'PAIR|coingecko_id' lines from the coins table")
    ap.add_argument("--out", default="public/coin-logos")
    ap.add_argument("--manifest", default="src/content/coinLogosLocal.generated.js")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    out_dir, lib_dir = root / args.out, Path(args.library)
    if not lib_dir.is_dir():
        print(f"library not found: {lib_dir}", file=sys.stderr)
        return 1

    pairs = [p.strip().upper() for p in Path(args.pairs).read_text().split() if p.strip()]
    print(f"pairs: {len(pairs)}")

    # ── Hand-audited files already in the tree outrank everything. ──────────
    manifest_path = root / args.manifest
    existing: dict[str, str] = {}
    if manifest_path.exists():
        body = manifest_path.read_text()
        existing = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', body))
    keep = {sym: f for sym, f in existing.items() if (out_dir / f).exists()}
    print(f"hand-audited kept: {len(keep)}")
    manifest: dict[str, str] = dict(keep)

    # ── 1. CoinGecko, gated on a price match ───────────────────────────────
    prices = {d["symbol"]: float(d["price"]) for d in (get_json(BINANCE_TICKER) or [])}
    listing = get_json(f"{CG}/coins/list") or []
    by_symbol = collections.defaultdict(list)
    for c in listing:
        by_symbol[(c.get("symbol") or "").upper()].append(c["id"])

    db_ids: dict[str, str] = {}
    if args.ids:
        for line in Path(args.ids).read_text().splitlines():
            if "|" in line:
                pair, cid = line.strip().split("|", 1)
                if cid:
                    db_ids[pair.upper()] = cid

    candidates: dict[str, list[str]] = {}
    for pair in pairs:
        if base_symbol(pair) in manifest or pair not in prices:
            continue
        ids = list(dict.fromkeys(
            ([db_ids[pair]] if pair in db_ids else []) + by_symbol.get(base_symbol(pair), [])
        ))
        if ids:
            candidates[pair] = ids

    all_ids = sorted({i for v in candidates.values() for i in v})
    print(f"price-checking {len(all_ids)} candidate ids for {len(candidates)} pairs")
    markets = cg_markets(all_ids) if all_ids else {}

    proven, ambiguous, unmatched = 0, 0, 0
    for pair, ids in candidates.items():
        hits = []
        for cid in ids:
            m = markets.get(cid)
            if not m or not m.get("price") or not m.get("image"):
                continue
            # A CoinGecko placeholder is not a logo; taking it would replace a
            # curated mark with a grey question mark.
            if "missing" in m["image"]:
                continue
            if abs(prices[pair] / multiplier(pair, cid) / m["price"] - 1) <= PRICE_TOLERANCE:
                hits.append(cid)
        # Exactly one candidate may match. Two projects trading at the same
        # price under one ticker proves nothing, so we decline to choose and let
        # the curated library or the CDN cascade answer instead.
        if len(hits) != 1:
            ambiguous += len(hits) > 1
            unmatched += not hits
            continue
        try:
            raw = requests.get(markets[hits[0]]["image"].split("?")[0], headers=HDR, timeout=30).content
        except requests.RequestException:
            continue
        sym = base_symbol(pair)
        if normalize(raw, out_dir / f"{sym.lower()}.png"):
            manifest[sym] = f"{sym.lower()}.png"
            proven += 1
    print(f"from CoinGecko (price-proven): {proven} | ambiguous: {ambiguous} | no match: {unmatched}")

    # ── 2. the curated backend library, for whatever proof could not reach ──
    lib: dict[str, Path] = {}
    for f in sorted(lib_dir.iterdir()):
        if f.suffix.lower() in (".png", ".webp", ".jpg", ".jpeg"):
            lib.setdefault(f.stem.upper(), f)

    curated = 0
    for pair in pairs:
        sym = base_symbol(pair)
        if sym in manifest:
            continue
        src = lib.get(sym) or lib.get(pair)
        if src and normalize(src.read_bytes(), out_dir / f"{sym.lower()}.png"):
            manifest[sym] = f"{sym.lower()}.png"
            curated += 1
    print(f"from curated library: {curated}")

    body = [
        "// GENERATED by scripts/build_coin_logos.py — do not edit by hand.",
        "//",
        "// Every entry is identity-checked: curated marks from the backend's own",
        "// library, or CoinGecko images accepted only when the Binance futures price",
        "// matches CoinGecko's price for that id. Ticker spelling proves nothing —",
        "// LiveCoinWatch served AEROCHAIN for AERO under exactly that assumption.",
        "//",
        "// Symbols absent here fall back to the CDN cascade in CoinLogo.jsx.",
        "export const LOCAL_COIN_LOGOS = {",
    ]
    for sym in sorted(manifest, key=lambda s: (s.isdigit(), s)):
        body.append(f'  "{sym}": "{manifest[sym]}",')
    body[-1] = body[-1].rstrip(",")
    body += ["};", ""]
    manifest_path.write_text("\n".join(body))
    print(f"manifest: {len(manifest)} symbols -> {manifest_path.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
