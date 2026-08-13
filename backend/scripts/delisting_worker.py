"""
Delisting Worker — poll exchange delisting announcements → delisting_events.

Sumber (cloud-safe, dicek dari VPS):
  - Binance  : CMS feed catalogId 161
  - Bybit    : /v5/announcements/index
  - OKX      : /api/v5/support/announcements?annType=announcements-delistings
  - KuCoin   : CMS /_api/cms/articles?category=delistings
  - Bitget   : /api/v2/public/annoucements?annType=symbol_delisting
  - Upbit    : api-manager announcements (trade) — EN titles "Termination of Trading Support"
  Best-effort (sering 403/reset dari VPS; adapter no-op aman):
  - Gate, MEXC, HTX, Coinbase, BingX

Alur:
  1. Ambil pengumuman terbaru tiap exchange.
  2. Dedupe via (exchange, ann_id). Yang baru → insert.
  3. Parse simbol token + tanggal delist (best-effort) dari judul.
  4. Snapshot harga tiap simbol saat pertama terlihat (buat "pump after delist").

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
from email.utils import parsedate_to_datetime

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
KUCOIN_CMS = ("https://www.kucoin.com/_api/cms/articles"
              "?category=delistings&lang=en_US&page=1&pageSize=30")
BITGET_ANN = ("https://api.bitget.com/api/v2/public/annoucements"
              "?language=en_US&annType=symbol_delisting&pageNo=1")
UPBIT_ANN = "https://api-manager.upbit.com/api/v1/announcements"

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
    # generic quantifier / noise (khusus judul OKX & sejenis)
    "SEVERAL", "UM", "USDS", "MANY", "VARIOUS", "CERTAIN", "MULTIPLE",
    "SELECT", "CoinM".upper(), "UMCBL", "SOME", "OKX",
    # exchange brand names + announcement boilerplate
    "KUCOIN", "BITGET", "GATE", "MEXC", "HTX", "HUOBI", "COINBASE", "BINGX",
    "UPBIT", "CRYPTO", "IMPORTANT", "SERVICES", "RELATED", "FUNCTION",
    "FUNCTIONS", "DISABLE", "SIMPLE", "PRODUCTS", "PROJECT", "COINS",
    "PRODUCT", "TWO", "THREE", "FOUR", "FIVE", "FROM", "WITH", "INTO",
    "TERMINATION", "MARKET", "MARKETS", "GUIDANCE", "ANNOUNCEMENT",
    "PROJECTS", "THEIR", "ASSOCIATED", "FIXED", "CLASSIC", "COIN",
    "INCLUDING", "STOCK", "INDEX", "AGES", "CROSS", "COPY", "ARRANGEMENT",
    "RELISTING", "TEMPORARILY", "SUSPEND", "TEMPORARY", "NOTICE",
    "CRYPTOS", "CRYPTO", "SOME", "USER", "ASSETS", "CONVERSION",
    "MARGINED", "PERPETUALS", "BOTS", "ANNOUNCEMENT", "FEE", "DEDUCTIONS",
    "REGARDING", "DISCONTINUATION", "OTHERS", "OTHER",
    "UTC", "GMT", "EUR", "GBP", "BRL", "JUL", "JUN", "AUG", "SEP", "OCT",
    "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "PAIRS", "PAIR",
    "SPOT", "FUTURES", "FROM", "CONVERT", "ARRANGEMENT", "COMPENSATION",
    "CORTEX",  # project name next to (CTXC)
}
# Ambil bagian judul SETELAH kata-kunci ini (di situ nama coin biasanya berada).
_TRIGGER_RE = re.compile(
    r"(?:will\s+)?(?:delist|remove|removal\s+of|discontinuation\s+of|"
    r"cease\s+support\s+for|delisting\s+of|"
    r"termination\s+of\s+trading\s+support\s+for|"
    r"trading\s+support\s+terminat(?:ion|es?)\s+for)\s+", re.I)
# Parenthetical ticker: "Tottenham Hotspur(SPURS)" / "Coin Name (ABC)"
_PAREN_TICKER_RE = re.compile(r"\(([A-Z0-9]{2,15})\)")
# Explicit pair tickers first (handles long bases like WHITEWHALEUSDT)
# Base can be 1 char (DUSDT) up to long meme tickers (WHITEWHALEUSDT)
_PAIR_RE = re.compile(r"\b([A-Z0-9]{1,20})(?:USDT|USDC|USD|BUSD|FDUSD)\b")
# Potong ekor kalimat setelah nama-nama coin.
_TAIL_RE = re.compile(r"\s+(?:on\s+20\d{2}|perpetual|contract|from\b|as\b|"
                      r"due\b|effective\b|starting\b|\()", re.I)
_TICKER_RE = re.compile(r"[A-Z0-9]{2,15}")
_DATE_RE = re.compile(r"(20\d{2}[-/]\d{1,2}[-/]\d{1,2})")


def extract_symbols(title):
    """Ambil ticker dari judul, hanya dari segmen setelah kata-kunci delist.

    Judul generik ('Notice of Removal of Spot Trading Pairs - ...') tak menyebut
    coin di judul → return [] (coin ada di body, di luar scope v1).
    Juga ambil ticker di dalam kurung: 'Name(TICKER)'.
    Prefer explicit *USDT/*USD pairs before free-form tokens.
    """
    title = title or ""
    # Drop time brackets like [Jul 27, 2026, 08:00 (UTC)] that pollute parsers
    title = re.sub(r"\[[^\]]{0,40}\]", " ", title)
    title = re.sub(r"\((?:UTC|GMT|UTC\+?\d*)\)", " ", title, flags=re.I)
    out = []

    def _add(tok, min_len=2):
        tok = (tok or "").upper()
        if not tok or tok in _STOPWORDS or tok.isdigit() or len(tok) < min_len:
            return
        if tok not in out:
            out.append(tok)

    # Parenthetical tickers anywhere (Upbit / formal notices)
    for tok in _PAREN_TICKER_RE.findall(title.upper()):
        _add(tok)

    m = _TRIGGER_RE.search(title)
    if not m:
        return out[:15]
    seg = title[m.end():]
    tail = _TAIL_RE.search(seg)
    if tail:
        seg = seg[:tail.start()]
    seg_u = seg.upper()

    # 1) Prefer explicit pairs: TKOUSDT, WHITEWHALEUSDT, TRXUSD, DUSDT
    pairs = _PAIR_RE.findall(seg_u)
    for base in pairs:
        _add(base, min_len=1)  # single-letter bases are valid (D, F, …)

    # 2) Free-form tokens only when no *USDT/*USD pairs in the segment
    if not pairs:
        for tok in _TICKER_RE.findall(seg_u):
            stripped = re.sub(r"(USDT|USDC|USD|BUSD|FDUSD)$", "", tok)
            if stripped and stripped != tok:
                tok = stripped
            _add(tok)
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


def peak_high_since(symbol, start_dt):
    """Max high candle 1h symbolUSDT sejak start_dt → (peak_price, peak_at) atau None.

    Ini metrik 'pump after delist' yang benar (bukan harga sekarang).
    """
    pair = f"{symbol}USDT"
    start_ms = int(start_dt.timestamp() * 1000)
    for base in ("https://api.binance.com/api/v3/klines",
                 "https://fapi.binance.com/fapi/v1/klines"):
        try:
            r = requests.get(base, params={"symbol": pair, "interval": "1h",
                                           "startTime": start_ms, "limit": 1000},
                             headers=HEADERS, timeout=REQ_TIMEOUT)
            if r.status_code != 200:
                continue
            data = r.json()
            if not isinstance(data, list) or not data:
                continue
            peak = 0.0
            peak_at = None
            for c in data:
                hi = float(c[2])
                if hi > peak:
                    peak = hi
                    peak_at = datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc)
            if peak > 0:
                return peak, peak_at
        except Exception:
            continue
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


def fetch_okx():
    out = []
    try:
        r = requests.get(
            "https://www.okx.com/api/v5/support/announcements",
            params={"annType": "announcements-delistings"},
            headers=HEADERS, timeout=REQ_TIMEOUT)
        if r.status_code != 200:
            log.warning(f"okx status {r.status_code}")
            return out
        data = r.json().get("data") or []
        # bentuk: [{"details":[{title,url,pTime}, ...]}] atau list langsung
        items = []
        for d in data:
            if isinstance(d, dict) and d.get("details"):
                items.extend(d["details"])
            elif isinstance(d, dict):
                items.append(d)
        for a in items:
            title = a.get("title", "")
            if not title:
                continue
            blob = title.lower()
            if "delist" not in blob and "removal" not in blob and "discontinue" not in blob:
                continue
            ts = a.get("pTime")
            out.append({
                "exchange": "okx",
                "ann_id": a.get("url") or f"{title}-{ts}",
                "title": title,
                "url": a.get("url"),
                "announced_at": datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc) if ts else None,
            })
    except Exception as e:
        log.error(f"okx fetch error: {e}")
    return out


def fetch_kucoin():
    """KuCoin CMS delistings category — HTTP 200 dari VPS."""
    out = []
    try:
        r = requests.get(KUCOIN_CMS, headers=HEADERS, timeout=REQ_TIMEOUT)
        if r.status_code != 200:
            log.warning(f"kucoin status {r.status_code}")
            return out
        items = (r.json() or {}).get("items") or []
        for a in items:
            title = a.get("title") or ""
            if not title:
                continue
            blob = title.lower()
            # Category is already delistings, but keep light filter for noise.
            if not any(k in blob for k in ("delist", "remov", "discontinu", "cease")):
                continue
            aid = str(a.get("id") or a.get("path") or title)
            path = a.get("path") or ""
            url = f"https://www.kucoin.com/announcement{path}" if path else None
            ts = a.get("publish_ts") or a.get("first_publish_at")
            announced = None
            if ts:
                try:
                    announced = datetime.fromtimestamp(int(ts), tz=timezone.utc)
                except Exception:
                    announced = None
            if announced is None and a.get("publish_at"):
                try:
                    announced = datetime.strptime(
                        a["publish_at"], "%Y-%m-%d %H:%M:%S"
                    ).replace(tzinfo=timezone.utc)
                except Exception:
                    pass
            out.append({
                "exchange": "kucoin",
                "ann_id": aid,
                "title": title,
                "url": url,
                "announced_at": announced,
            })
    except Exception as e:
        log.error(f"kucoin fetch error: {e}")
    return out


def fetch_bitget():
    """Bitget public announcements — annType=symbol_delisting."""
    out = []
    try:
        r = requests.get(BITGET_ANN, headers=HEADERS, timeout=REQ_TIMEOUT)
        if r.status_code != 200:
            log.warning(f"bitget status {r.status_code}")
            return out
        data = (r.json() or {}).get("data") or []
        for a in data:
            title = a.get("annTitle") or a.get("title") or ""
            if not title:
                continue
            blob = title.lower()
            if not any(k in blob for k in ("delist", "remov", "discontinu", "disable")):
                continue
            ts = a.get("cTime") or a.get("pTime")
            announced = None
            if ts:
                try:
                    # Bitget cTime is ms epoch as string
                    announced = datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc)
                except Exception:
                    announced = None
            aid = str(a.get("annId") or a.get("annUrl") or f"{title}-{ts}")
            out.append({
                "exchange": "bitget",
                "ann_id": aid,
                "title": title,
                "url": a.get("annUrl"),
                "announced_at": announced,
            })
    except Exception as e:
        log.error(f"bitget fetch error: {e}")
    return out


def fetch_upbit():
    """Upbit trade announcements — filter EN/KO delist wording.

    Rate-limited (429) — 1 page, soft fail.
    """
    out = []
    try:
        r = requests.get(
            UPBIT_ANN,
            params={"os": "web", "page": 1, "per_page": 50, "category": "trade"},
            headers=HEADERS, timeout=REQ_TIMEOUT)
        if r.status_code != 200:
            log.warning(f"upbit status {r.status_code}")
            return out
        notices = ((r.json() or {}).get("data") or {}).get("notices") or []
        for a in notices:
            title = a.get("title") or ""
            if not title:
                continue
            # EN: "Termination of Trading Support for X(TICKER)"
            # KO: "XXX 거래지원 종료 안내"
            if not re.search(
                r"Termination of Trading Support|거래지원\s*종료|Market Support Termin|"
                r"delist|trading support termin",
                title, re.I,
            ):
                continue
            aid = str(a.get("id") or a.get("uuid") or title)
            listed = a.get("listed_at") or a.get("first_listed_at")
            announced = None
            if listed:
                try:
                    # e.g. 2026-07-31T17:07:11+09:00
                    announced = datetime.fromisoformat(listed.replace("Z", "+00:00"))
                    if announced.tzinfo is None:
                        announced = announced.replace(tzinfo=timezone.utc)
                    else:
                        announced = announced.astimezone(timezone.utc)
                except Exception:
                    announced = None
            # Prefer EN UUID page when available
            url = f"https://upbit.com/service_center/notice?id={aid}"
            out.append({
                "exchange": "upbit",
                "ann_id": aid,
                "title": title,
                "url": url,
                "announced_at": announced,
            })
    except Exception as e:
        log.error(f"upbit fetch error: {e}")
    return out


_LEVERAGE_RE = re.compile(r"(3L|3S|5L|5S|\dL|\dS|_OLD|BEAR|BULL)$", re.I)


def fetch_gate():
    """Gate.io delisted currencies via public API (announcement CMS blocked).

    api.gateio.ws /spot/currencies exposes `delisted=true`. We turn each into a
    synthetic event so the Gate tab is always populated; new delists appear on
    subsequent runs via ON CONFLICT.
    """
    out = []
    # 1) Try announcement CMS first (usually blocked from datacenter IPs)
    for url in (
        "https://www.gate.io/apiw/v2/article/list?page=1&limit=20&cate_type=delisted&lang=en",
        "https://www.gate.com/apiw/v2/article/list?page=1&limit=20&cate_type=delisted&lang=en",
    ):
        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                continue
            data = r.json()
            items = []
            if isinstance(data, dict):
                payload = data.get("data") or data
                if isinstance(payload, dict):
                    items = payload.get("list") or payload.get("articles") or []
                elif isinstance(payload, list):
                    items = payload
            for a in items if isinstance(items, list) else []:
                if not isinstance(a, dict):
                    continue
                title = a.get("title") or a.get("brief") or ""
                if not title or not re.search(r"delist|remov|discontinu", title, re.I):
                    continue
                out.append({
                    "exchange": "gate",
                    "ann_id": str(a.get("id") or a.get("article_id") or title),
                    "title": title,
                    "url": a.get("url") or a.get("link"),
                    "announced_at": None,
                    "symbols": extract_symbols(title) or None,
                })
            if out:
                log.info(f"gate: {len(out)} from CMS")
                return out
        except Exception as e:
            log.debug(f"gate CMS fail: {e}")

    # 2) Fallback: public currency catalog (always works from VPS)
    try:
        r = requests.get(
            "https://api.gateio.ws/api/v4/spot/currencies",
            headers=HEADERS, timeout=REQ_TIMEOUT,
        )
        if r.status_code != 200:
            log.warning(f"gate currencies status {r.status_code}")
            return out
        curs = r.json() or []
        if not isinstance(curs, list):
            return out
        n = 0
        for c in curs:
            if not isinstance(c, dict) or not c.get("delisted"):
                continue
            cur = (c.get("currency") or "").upper()
            if not cur or len(cur) < 2 or len(cur) > 12:
                continue
            if not re.match(r"^[A-Z0-9]+$", cur):
                continue
            if _LEVERAGE_RE.search(cur):
                continue
            name = c.get("name") or cur
            out.append({
                "exchange": "gate",
                "ann_id": f"currency-delisted-{cur}",
                "title": f"Gate.io delisted {cur}" + (f" ({name})" if name != cur else ""),
                "url": f"https://www.gate.io/trade/{cur}_USDT",
                "announced_at": None,
                "symbols": [cur],
            })
            n += 1
            if n >= 80:  # keep tab useful without flooding DB
                break
        log.info(f"gate: {len(out)} from currencies catalog")
    except Exception as e:
        log.error(f"gate fetch error: {e}")
    return out


def fetch_mexc():
    """MEXC — scrape mexc.co/announcements/delistings HTML (API often blocked)."""
    out = []
    seen = set()
    # 1) HTML listing pages (works from VPS via mexc.co)
    for page in range(1, 6):
        url = "https://www.mexc.co/announcements/delistings"
        if page > 1:
            url = f"{url}?page={page}"
        try:
            r = requests.get(
                url,
                headers={
                    **HEADERS,
                    "Accept": "text/html,application/xhtml+xml",
                    "Referer": "https://www.mexc.co/announcements",
                },
                timeout=REQ_TIMEOUT,
            )
            if r.status_code != 200:
                log.debug(f"mexc html page {page}: {r.status_code}")
                break
            # Anchors look like:
            # <a title="Delisting of ..." aria-label="..." href="/announcements/article/slug-ID">
            for title, href in re.findall(
                r'(?:title|aria-label)="((?:Delisting|MEXC will|MEXC Will|Announcement)[^"]{8,180})"'
                r'[^>]*href="(/announcements/article/[^"]+)"',
                r.text, re.I,
            ):
                title = re.sub(r"\s+", " ", title).strip()
                if not re.search(r"delist|remov|discontinu", title, re.I):
                    continue
                slug = href.rstrip("/").split("/")[-1]
                m_id = re.search(r"(\d{10,})$", slug)
                aid = m_id.group(1) if m_id else slug
                if aid in seen:
                    continue
                seen.add(aid)
                announced = None
                dm = re.search(r"\[([A-Za-z]{3}\s+\d{1,2},\s+20\d{2})", title)
                if dm:
                    try:
                        announced = datetime.strptime(
                            dm.group(1), "%b %d, %Y"
                        ).replace(tzinfo=timezone.utc)
                    except Exception:
                        announced = None
                out.append({
                    "exchange": "mexc",
                    "ann_id": aid,
                    "title": title,
                    "url": f"https://www.mexc.com{href}",
                    "announced_at": announced,
                })
            # reverse attribute order: href first then title
            for href, title in re.findall(
                r'href="(/announcements/article/[^"]+)"[^>]*'
                r'(?:title|aria-label)="((?:Delisting|MEXC will|MEXC Will|Announcement)[^"]{8,180})"',
                r.text, re.I,
            ):
                title = re.sub(r"\s+", " ", title).strip()
                if not re.search(r"delist|remov", title, re.I):
                    continue
                slug = href.rstrip("/").split("/")[-1]
                m_id = re.search(r"(\d{10,})$", slug)
                aid = m_id.group(1) if m_id else slug
                if aid in seen:
                    continue
                seen.add(aid)
                out.append({
                    "exchange": "mexc",
                    "ann_id": aid,
                    "title": title,
                    "url": f"https://www.mexc.com{href}",
                    "announced_at": None,
                })
        except Exception as e:
            log.debug(f"mexc html page {page}: {e}")
            break
    if out:
        log.info(f"mexc: {len(out)} from announcements HTML")
        return out

    # 2) Fallback: market status inactive
    try:
        r2 = requests.get(
            "https://www.mexc.co/api/platform/spot/market-v2/web/symbols",
            headers={**HEADERS, "Referer": "https://www.mexc.co/"},
            timeout=REQ_TIMEOUT,
        )
        if r2.status_code == 200:
            data = (r2.json() or {}).get("data") or {}
            usdt = data.get("USDT") or []
            for x in usdt:
                if str(x.get("sts")) == "1":
                    continue
                base = (x.get("vn") or "").upper()
                if not base or len(base) < 2 or _LEVERAGE_RE.search(base):
                    continue
                out.append({
                    "exchange": "mexc",
                    "ann_id": f"market-sts-{base}-{x.get('sts')}",
                    "title": f"MEXC market inactive for {base} (sts={x.get('sts')})",
                    "url": f"https://www.mexc.com/exchange/{base}_USDT",
                    "announced_at": None,
                    "symbols": [base],
                })
        log.info(f"mexc: {len(out)} from market status fallback")
    except Exception as e:
        log.error(f"mexc fetch error: {e}")
    return out


def fetch_htx():
    """HTX announcements via huobi.com mirror (htx.com often resets)."""
    out = []
    hosts = (
        "https://www.huobi.com/-/x/support/public/getList/v2",
        "https://www.htx.com/-/x/support/public/getList/v2",
    )
    for base in hosts:
        try:
            for page in range(1, 12):
                r = requests.get(
                    base,
                    params={
                        "language": "en-us",
                        "page": page,
                        "limit": 50,
                        "oneLevelId": "360000031902",
                        "twoLevelId": "360000039481",
                    },
                    headers={**HEADERS, "Referer": "https://www.huobi.com/"},
                    timeout=REQ_TIMEOUT,
                )
                if r.status_code != 200:
                    if page == 1:
                        log.debug(f"htx {base} status {r.status_code}")
                    break
                items = ((r.json() or {}).get("data") or {}).get("list") or []
                if not items:
                    break
                for a in items:
                    title = a.get("title") or ""
                    if not title:
                        continue
                    if not re.search(
                        r"delist|remov|discontinu|off.?board|conversion of user assets",
                        title, re.I,
                    ):
                        continue
                    aid = str(a.get("id") or title)
                    ts = a.get("showTime")
                    announced = None
                    if ts:
                        try:
                            announced = datetime.fromtimestamp(
                                int(ts) / 1000, tz=timezone.utc
                            )
                        except Exception:
                            announced = None
                    # Prefer symbols from dealPair when present (spot_wbt/usdt)
                    symbols = []
                    deal = a.get("dealPair") or ""
                    for m in re.finditer(r"(?:spot_|futures_)?([a-z0-9]+)/(?:usdt|usd|btc)", deal, re.I):
                        tok = m.group(1).upper()
                        if tok not in _STOPWORDS and tok not in symbols:
                            symbols.append(tok)
                    if not symbols:
                        symbols = extract_symbols(title)
                    out.append({
                        "exchange": "htx",
                        "ann_id": aid,
                        "title": title,
                        "url": f"https://www.htx.com/support/{aid}",
                        "announced_at": announced,
                        "symbols": symbols or None,
                    })
            if out:
                log.info(f"htx: {len(out)} from {base.split('/')[2]}")
                return out
        except Exception as e:
            log.debug(f"htx host fail: {e}")
    if not out:
        log.info("htx: no data")
    return out


def fetch_coinbase():
    """Coinbase Exchange currencies with status=delisted (blog CF-blocked)."""
    out = []
    # RSS first (rarely has delists)
    try:
        r = requests.get(
            "https://status.coinbase.com/history.rss",
            headers={**HEADERS, "Accept": "application/rss+xml, */*"},
            timeout=REQ_TIMEOUT,
        )
        if r.status_code == 200 and "<item>" in r.text:
            for it in re.findall(r"<item>(.*?)</item>", r.text, re.S | re.I):
                tm = re.search(
                    r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", it, re.S | re.I
                )
                title = (tm.group(1) if tm else "").strip()
                if not title or not re.search(
                    r"delist|remov|discontinu|suspend trading", title, re.I
                ):
                    continue
                lm = re.search(
                    r"<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>", it, re.S | re.I
                )
                link = (lm.group(1) if lm else "").strip()
                out.append({
                    "exchange": "coinbase",
                    "ann_id": link or title,
                    "title": title,
                    "url": link or None,
                    "announced_at": None,
                })
    except Exception as e:
        log.debug(f"coinbase rss: {e}")

    # Catalog of delisted assets (reliable)
    try:
        r = requests.get(
            "https://api.exchange.coinbase.com/currencies",
            headers=HEADERS, timeout=REQ_TIMEOUT,
        )
        if r.status_code != 200:
            log.warning(f"coinbase currencies {r.status_code}")
            return out
        curs = r.json() or []
        n = 0
        for c in curs:
            if not isinstance(c, dict):
                continue
            if (c.get("status") or "").lower() != "delisted":
                continue
            cur = (c.get("id") or "").upper()
            if not cur or len(cur) < 2 or _LEVERAGE_RE.search(cur):
                continue
            name = c.get("name") or cur
            out.append({
                "exchange": "coinbase",
                "ann_id": f"currency-delisted-{cur}",
                "title": f"Coinbase delisted {cur}" + (f" ({name})" if name != cur else ""),
                "url": f"https://www.coinbase.com/price/{cur.lower()}",
                "announced_at": None,
                "symbols": [cur],
            })
            n += 1
            if n >= 80:
                break
        log.info(f"coinbase: {len(out)} events (incl. catalog)")
    except Exception as e:
        log.error(f"coinbase fetch error: {e}")
    return out


def fetch_bingx():
    """BingX — article API often rejects; spot symbols with offTime=delisted."""
    out = []
    # 1) Article API (usually code 100003 time error)
    try:
        r = requests.get(
            "https://bingx.com/api/article/v1/public/article/list",
            params={"pageNum": 1, "pageSize": 30, "category": "delisting"},
            headers={**HEADERS, "Referer": "https://bingx.com/"},
            timeout=REQ_TIMEOUT,
        )
        if r.status_code == 200:
            data = r.json() or {}
            if data.get("code") in (0, "0", 200, "200") or data.get("success"):
                items = (
                    (data.get("data") or {}).get("list")
                    or (data.get("data") or {}).get("records")
                    or []
                )
                for a in items if isinstance(items, list) else []:
                    title = (a.get("title") or a.get("articleTitle") or "") if isinstance(a, dict) else ""
                    if not title or not re.search(r"delist|remov", title, re.I):
                        continue
                    out.append({
                        "exchange": "bingx",
                        "ann_id": str(a.get("id") or a.get("articleId") or title),
                        "title": title,
                        "url": a.get("url") or a.get("link"),
                        "announced_at": None,
                    })
    except Exception as e:
        log.debug(f"bingx article: {e}")
    if out:
        return out

    # 2) Spot common symbols — offTime > 0 marks delisted/offline pairs
    try:
        r = None
        for _ in range(4):
            try:
                r = requests.get(
                    "https://open-api.bingx.com/openApi/spot/v1/common/symbols",
                    headers=HEADERS, timeout=REQ_TIMEOUT,
                )
                if r.status_code == 200:
                    break
            except Exception:
                time.sleep(0.4)
                r = None
        if r is not None and r.status_code == 200:
            syms = ((r.json() or {}).get("data") or {}).get("symbols") or []
            ranked = []
            for s in syms:
                if not isinstance(s, dict):
                    continue
                try:
                    ot = int(s.get("offTime") or 0)
                except Exception:
                    ot = 0
                if ot <= 0:
                    continue
                m = re.match(r"^([A-Z0-9]{2,20})-USDT$", (s.get("symbol") or ""))
                if not m:
                    continue
                base = m.group(1)
                if base.startswith("NC") or _LEVERAGE_RE.search(base):
                    continue
                ranked.append((ot, base, s.get("symbol"), s.get("status")))
            ranked.sort(key=lambda x: -x[0])
            # Group by offTime day → one announcement per wave (cleaner UI)
            by_day = {}
            for ot, base, sym, st in ranked[:200]:
                day = datetime.fromtimestamp(ot / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
                by_day.setdefault(day, {"ot": ot, "bases": [], "syms": []})
                if base not in by_day[day]["bases"]:
                    by_day[day]["bases"].append(base)
                    by_day[day]["syms"].append(sym)
            # newest days first, cap 25 waves / 80 tokens total
            days = sorted(by_day.keys(), reverse=True)[:25]
            token_budget = 80
            for day in days:
                info = by_day[day]
                bases = info["bases"][:15]
                if not bases:
                    continue
                token_budget -= len(bases)
                if token_budget < -20:
                    break
                title = (
                    f"BingX delisted {', '.join(bases[:8])}"
                    + (" & others" if len(bases) > 8 else "")
                    + f" from spot ({day})"
                )
                out.append({
                    "exchange": "bingx",
                    "ann_id": f"spot-offtime-{day}-{bases[0]}",
                    "title": title,
                    "url": "https://bingx.com/en/support/notice-center/",
                    "announced_at": datetime.fromtimestamp(
                        info["ot"] / 1000, tz=timezone.utc
                    ),
                    "symbols": bases,
                })
        log.info(f"bingx: {len(out)} from spot offTime waves")
    except Exception as e:
        log.error(f"bingx spot error: {e}")

    if not out:
        log.info("bingx: no remote data")
    return out


# Top-10 CEX adapters (working + best-effort). Order = UI preference.
ADAPTERS = [
    fetch_binance,
    fetch_bybit,
    fetch_okx,
    fetch_bitget,
    fetch_kucoin,
    fetch_gate,
    fetch_mexc,
    fetch_htx,
    fetch_coinbase,
    fetch_bingx,
    fetch_upbit,  # bonus when rate-limit allows
]


def refresh_peaks(session, dry_run=False, days=30):
    """Update peak_since_announce untuk event <days hari (pump-after-delist)."""
    rows = session.execute(text("""
        SELECT id, symbols, price_at_announce, announced_at
        FROM delisting_events
        WHERE announced_at IS NOT NULL
          AND announced_at >= NOW() - (:days || ' days')::interval
          AND symbols IS NOT NULL
    """), {"days": days}).fetchall()
    for r in rows:
        eid, symbols, pa, announced = r[0], r[1] or [], r[2] or {}, r[3]
        peak_map = {}
        for s in symbols:
            entry = pa.get(s)
            res = peak_high_since(s, announced)
            if res:
                peak, peak_at = res
                pct = round((peak - entry) / entry * 100, 2) if entry else None
                peak_map[s] = {"peak": peak, "peak_pct": pct,
                               "peak_at": peak_at.isoformat() if peak_at else None}
            time.sleep(0.1)
        if peak_map and not dry_run:
            session.execute(
                text("UPDATE delisting_events SET peak_since_announce = :p, updated_at = NOW() WHERE id = :id"),
                {"p": json.dumps(peak_map), "id": eid})
    if not dry_run:
        session.commit()
    log.info(f"peaks refreshed for {len(rows)} recent events")


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
                # Prefer adapter-supplied symbols (currency catalogs); else parse title.
                symbols = e.get("symbols")
                if not symbols:
                    symbols = extract_symbols(e["title"])
                # Cap symbols per event (avoid flood from long lists)
                symbols = list(symbols or [])[:20]
                delist_at = parse_delist_at(e["title"])
                price_map = {}
                # Skip live price fetch for large catalog seeds (too slow); peak job covers later.
                do_price = len(symbols) <= 8 and not str(e["ann_id"]).startswith("currency-delisted-")
                if do_price:
                    for s in symbols:
                        p = ticker_price(s)
                        if p:
                            price_map[s] = p
                        time.sleep(0.05)
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
        # Refresh peak (pump-after-delist) untuk event terbaru.
        try:
            refresh_peaks(session, dry_run)
        except Exception as e:
            log.error(f"refresh_peaks error: {e}")
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
