"""
Delisting Worker — poll exchange delisting announcements → delisting_events.

Sumber (cloud-safe, sudah dicek dari VPS):
  - Binance : CMS feed catalogId 161  (HTTP 200 dari VPS — dipakai langsung)
  - Bybit   : /v5/announcements/index (endpoint resmi publik)
  (OKX bisa ditambah sebagai adapter berikutnya.)

Alur:
  1. Ambil pengumuman terbaru tiap exchange.
  2. Dedupe via (exchange, ann_id). Yang baru → insert.
  3. Parse simbol token + tanggal delist (best-effort) dari judul.
  4. Snapshot harga tiap simbol saat pertama terlihat (buat "pump after delist").
  Notifikasi push ditangani terpisah (flag notified=False → dikirim oleh
  notifier, lihat langkah integrasi berikutnya).

Usage:
  python delisting_worker.py --once
  python delisting_worker.py --loop           # loop tiap CHECK_EVERY detik
  python delisting_worker.py --once --dry-run
"""
import os
import re
import sys
import time
import json
import argparse
import logging
from datetime import datetime, timezone

import requests
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

LOCK_FILE = "/tmp/delisting_worker.lock"
LOG_FILE = os.getenv("DELIST_LOG", "/root/luxquant-terminal/backend/delisting_worker.log")
DB_URL = os.getenv("DATABASE_URL", "postgresql://luxq:CHANGEME@127.0.0.1:5432/luxquant")
CHECK_EVERY = int(os.getenv("DELIST_CHECK_EVERY", "300"))
REQ_TIMEOUT = 20

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9"}

BINANCE_CMS = ("https://www.binance.com/bapi/composite/v1/public/cms/article/list/query"
               "?type=1&catalogId=161&pageNo=1&pageSize=20")
BYBIT_ANN = "https://api.bybit.com/v5/announcements/index?locale=en-US&limit=30"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("delist_worker")

# Kata yang JANGAN dianggap ticker (noise dari kalimat judul).
_STOPWORDS = {
    "WILL", "DELIST", "REMOVE", "REMOVAL", "SPOT", "TRADING", "PAIRS", "PAIR",
    "NOTICE", "UPDATE", "UPDATED", "OF", "AND", "THE", "ON", "USDT", "USDC",
    "FDUSD", "TUSD", "BUSD", "MARGIN", "FUTURES", "PERPETUAL", "CONTRACT",
    "CONTRACTS", "BINANCE", "BYBIT", "OKX", "TOKEN", "TOKENS", "LEVERAGED",
    "NEW", "ADD", "USD", "ALPHA", "LOAN", "MARGINED", "EXTEND", "MONITORING",
    "TAG", "TO", "INCLUDE", "CEASE", "SUPPORT", "FOR", "SELECTED", "STOCKS",
    "AS", "COLLATERAL", "LENDING", "ASSET", "DISCONTINUATION", "SEED",
    "WATCHLIST", "STAKING", "EARN", "CONVERT", "ISOLATED", "CROSS",
}
# Ambil bagian judul SETELAH kata-kunci ini (di situ nama coin biasanya berada).
_TRIGGER_RE = re.compile(
    r"(?:will\s+)?(?:delist|remove|removal\s+of|discontinuation\s+of|"
    r"cease\s+support\s+for|delisting\s+of)\s+", re.I)
# Potong ekor kalimat setelah nama-nama coin.
_TAIL_RE = re.compile(r"\s+(?:on\s+20\d{2}|perpetual|contract|from\b|as\b|"
                      r"due\b|effective\b|starting\b|\()", re.I)
_TICKER_RE = re.compile(r"[A-Z0-9]{2,12}")
_DATE_RE = re.compile(r"(20\d{2}[-/]\d{1,2}[-/]\d{1,2})")


def extract_symbols(title):
    """Ambil ticker dari judul, hanya dari segmen setelah kata-kunci delist.

    Judul generik ('Notice of Removal of Spot Trading Pairs - ...') tak menyebut
    coin di judul → return [] (coin ada di body, di luar scope v1).
    """
    m = _TRIGGER_RE.search(title or "")
    if not m:
        return []
    seg = title[m.end():]
    tail = _TAIL_RE.search(seg)
    if tail:
        seg = seg[:tail.start()]
    out = []
    for tok in _TICKER_RE.findall(seg.upper()):
        # strip quote-suffix (IPUSDT -> IP) kalau sisanya masih >=2 char
        stripped = re.sub(r"(USDT|USDC|USD)$", "", tok)
        if len(stripped) >= 2:
            tok = stripped
        if tok in _STOPWORDS or tok.isdigit() or len(tok) < 2:
            continue
        if tok not in out:
            out.append(tok)
    return out[:15]


def parse_delist_at(title):
    m = _DATE_RE.search(title or "")
    if not m:
        return None
    raw = m.group(1).replace("/", "-")
    try:
        return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def ticker_price(symbol):
    """Harga terkini symbolUSDT — Binance dulu, Bybit fallback."""
    pair = f"{symbol}USDT"
    try:
        r = requests.get(f"https://api.binance.com/api/v3/ticker/price?symbol={pair}",
                         headers=HEADERS, timeout=REQ_TIMEOUT)
        if r.status_code == 200:
            p = float(r.json().get("price", 0))
            if p > 0:
                return p
    except Exception:
        pass
    try:
        r = requests.get(f"https://api.bybit.com/v5/market/tickers?category=spot&symbol={pair}",
                         timeout=REQ_TIMEOUT)
        if r.status_code == 200:
            lst = (r.json().get("result") or {}).get("list") or []
            if lst:
                p = float(lst[0].get("lastPrice", 0))
                if p > 0:
                    return p
    except Exception:
        pass
    return None


# ─── adapters ───────────────────────────────────────────────────────
def fetch_binance():
    """→ list event dict: {exchange, ann_id, title, url, announced_at}"""
    out = []
    try:
        r = requests.get(BINANCE_CMS, headers=HEADERS, timeout=REQ_TIMEOUT)
        if r.status_code != 200:
            log.warning(f"binance CMS status {r.status_code}")
            return out
        data = (r.json().get("data") or {})
        catalogs = data.get("catalogs") or []
        articles = (catalogs[0].get("articles") if catalogs else data.get("articles")) or []
        for a in articles:
            code = a.get("code") or str(a.get("id"))
            ts = a.get("releaseDate")
            out.append({
                "exchange": "binance",
                "ann_id": str(code),
                "title": a.get("title", "Untitled"),
                "url": f"https://www.binance.com/en/support/announcement/{code}" if code else None,
                "announced_at": datetime.fromtimestamp(ts / 1000, tz=timezone.utc) if ts else None,
            })
    except Exception as e:
        log.error(f"binance fetch error: {e}")
    return out


def fetch_bybit():
    out = []
    try:
        r = requests.get(BYBIT_ANN, headers=HEADERS, timeout=REQ_TIMEOUT)
        if r.status_code != 200:
            log.warning(f"bybit status {r.status_code}")
            return out
        lst = (r.json().get("result") or {}).get("list") or []
        for a in lst:
            title = a.get("title", "")
            typ = (a.get("type") or {})
            tags = " ".join(a.get("tags") or [])
            blob = f"{title} {typ.get('title','')} {tags}".lower()
            if "delist" not in blob and "removal" not in blob:
                continue
            ts = a.get("dateTimestamp") or a.get("publishTime")
            out.append({
                "exchange": "bybit",
                "ann_id": a.get("url") or f"{title}-{ts}",
                "title": title or "Untitled",
                "url": a.get("url"),
                "announced_at": datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc) if ts else None,
            })
    except Exception as e:
        log.error(f"bybit fetch error: {e}")
    return out


ADAPTERS = [fetch_binance, fetch_bybit]


# ─── main ───────────────────────────────────────────────────────────
def acquire_lock():
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE) as f:
                os.kill(int(f.read().strip()), 0)
            return False
        except Exception:
            os.remove(LOCK_FILE)
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
    return True


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except FileNotFoundError:
        pass


def existing_ids(session, exchange, ids):
    if not ids:
        return set()
    rows = session.execute(
        text("SELECT ann_id FROM delisting_events WHERE exchange = :ex AND ann_id = ANY(:ids)"),
        {"ex": exchange, "ids": list(ids)},
    ).fetchall()
    return {r[0] for r in rows}


def run_once(dry_run=False):
    engine = create_engine(DB_URL, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    inserted = 0
    try:
        for adapter in ADAPTERS:
            events = adapter()
            if not events:
                continue
            ex = events[0]["exchange"]
            have = existing_ids(session, ex, [e["ann_id"] for e in events])
            for e in events:
                if e["ann_id"] in have:
                    continue
                symbols = extract_symbols(e["title"])
                delist_at = parse_delist_at(e["title"])
                price_map = {}
                for s in symbols:
                    p = ticker_price(s)
                    if p:
                        price_map[s] = p
                    time.sleep(0.1)
                log.info(f"NEW [{ex}] {e['title'][:70]} · symbols={symbols}")
                if dry_run:
                    inserted += 1
                    continue
                session.execute(text("""
                    INSERT INTO delisting_events
                      (exchange, ann_id, title, url, announced_at, delist_at, symbols, price_at_announce, notified)
                    VALUES
                      (:exchange, :ann_id, :title, :url, :announced_at, :delist_at, :symbols, :price, FALSE)
                    ON CONFLICT (exchange, ann_id) DO NOTHING
                """), {
                    "exchange": ex, "ann_id": e["ann_id"], "title": e["title"], "url": e.get("url"),
                    "announced_at": e.get("announced_at"), "delist_at": delist_at,
                    "symbols": symbols or None,
                    "price": json.dumps(price_map) if price_map else None,
                })
                inserted += 1
            if not dry_run:
                session.commit()
        log.info(f"done. new events={inserted} dry_run={dry_run}")
    finally:
        session.close()
        engine.dispose()
    return inserted


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--once", action="store_true")
    g.add_argument("--loop", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not acquire_lock():
        log.warning("locked, exit")
        sys.exit(0)
    try:
        if args.once:
            run_once(args.dry_run)
        else:
            log.info(f"loop every {CHECK_EVERY}s")
            while True:
                try:
                    run_once(args.dry_run)
                except Exception as e:
                    log.error(f"cycle error: {e}")
                time.sleep(CHECK_EVERY)
    finally:
        release_lock()


if __name__ == "__main__":
    main()
