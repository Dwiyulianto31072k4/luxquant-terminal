#!/usr/bin/env python3
"""
LuxQuant Shariah Screening Worker v1
=====================================
Mengisi tabel `coin_shariah` + `coin_shariah_sources`.

Prinsip yang tidak boleh dilanggar (SHARIAH_MODE_RESEARCH.md §4.1.D):

  1. TIDAK ADA ALASAN TANPA SITASI. Setiap kriteria yang kita nilai harus
     membawa `evidence` — potongan teks nyata dari kolom yang kita simpan.
     Kalau tidak ada bahan untuk beralasan, statusnya `unrated`, bukan ditebak.
  2. Ini SCREENING, bukan fatwa. Kata-kata di `summary` tidak pernah
     memutuskan hukum; ia melaporkan temuan.
  3. Default `unrated`. Tidak ada coin yang menjadi `halal` karena kelalaian.

Urutan pipeline — kelas aset lebih dulu, karena salah kelas = rubrik salah:

    classify → verify-identity → sources → screen (rules → LLM) → merge

Place at:
    /root/luxquant-terminal/backend/app/services/shariah_screening_worker.py

Mode:
    --classify         asset_class dari Binance exchangeInfo
    --verify-identity  cocokkan coingecko_id dengan base_symbol
    --sources          refresh Sharlife (satu GET untuk seluruh tabel)
    --screen           rules engine untuk pair yang belum ter-screening
    --backfill         keempatnya, berurutan
    --pair BTCUSDT     satu pair saja (screen)
    --listen           daemon: LISTEN new_pair_to_categorize
"""

import argparse
import json
import logging
import os
import re
import select
import sys
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple

import httpx
import psycopg2
import psycopg2.extensions
from sqlalchemy import create_engine, text


# ============================================================
# Konfigurasi — TIDAK ADA kredensial hardcoded di file ini.
# ============================================================

def _load_env_file(path: str) -> None:
    """Isi os.environ dari backend/.env bila variabelnya belum ada.

    Worker ini dijalankan sebagai skrip lepas oleh systemd, jadi ia tidak
    otomatis mewarisi konfigurasi backend. Sengaja tidak menimpa variabel yang
    sudah diset supaya EnvironmentFile systemd tetap menang.
    """
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


_load_env_file(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    sys.exit("DATABASE_URL tidak diset (cek backend/.env atau EnvironmentFile systemd)")

BINANCE_EXCHANGE_INFO = "https://fapi.binance.com/fapi/v1/exchangeInfo"
SHARLIFE_LIST_URL = "https://sharlife.my/crypto-shariah"
COINGECKO_API_BASE = "https://api.coingecko.com/api/v3"
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")
COINGECKO_SLEEP = float(os.getenv("COINGECKO_SLEEP", "2.0" if COINGECKO_API_KEY else "12.0"))

ENGINE_VERSION = "v1.1"
LISTEN_CHANNEL = "new_pair_to_categorize"
USER_AGENT = "LuxQuant-ShariahScreening/1.0 (+https://luxquant.tw)"

LOG_DIR = os.getenv("LOG_DIR", "/var/log/luxquant-sync")
try:
    os.makedirs(LOG_DIR, exist_ok=True)
    _handlers = [
        logging.FileHandler(os.path.join(LOG_DIR, "shariah-screening-worker.log")),
        logging.StreamHandler(),
    ]
except OSError:
    _handlers = [logging.StreamHandler()]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=_handlers,
)
logger = logging.getLogger("shariah-screening")
engine = create_engine(DATABASE_URL, future=True)


# ============================================================
# 1. KELAS ASET — dari Binance exchangeInfo (§4.2)
#
# Binance sudah melabeli tiap simbol. Tidak perlu regex, tidak perlu LLM,
# tidak perlu menebak dari harga. Ini label otoritatif.
# ============================================================

def _map_asset_class(contract_type: str, underlying_type: str) -> str:
    if contract_type == "PERPETUAL" and underlying_type == "COIN":
        return "crypto_token"
    if contract_type == "PERPETUAL" and underlying_type == "INDEX":
        return "index_perp"
    if contract_type == "TRADIFI_PERPETUAL":
        # EQUITY / KR_EQUITY / COMMODITY / PREMARKET — semuanya kontrak atas
        # aset yang tidak bisa dimiliki lewat Binance. Satu bucket.
        return "tradfi_perp"
    return "crypto_token"


def classify_asset_classes() -> int:
    logger.info("Mengambil Binance exchangeInfo...")
    with httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT}) as client:
        data = client.get(BINANCE_EXCHANGE_INFO).raise_for_status().json()

    labels = {
        s["symbol"]: _map_asset_class(s.get("contractType") or "", s.get("underlyingType") or "")
        for s in data.get("symbols", [])
    }
    logger.info(f"exchangeInfo memuat {len(labels)} simbol")

    with engine.begin() as conn:
        pairs = [r[0] for r in conn.execute(text("SELECT pair FROM coins")).fetchall()]

    updated = 0
    with engine.begin() as conn:
        for pair in pairs:
            cls = labels.get(pair, "delisted")
            conn.execute(
                text("""
                    UPDATE coin_shariah
                       SET asset_class = :cls,
                           updated_at  = now()
                     WHERE pair = :pair AND asset_class IS DISTINCT FROM :cls
                """),
                {"pair": pair, "cls": cls},
            )
            updated += 1

    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT asset_class, count(*) FROM coin_shariah GROUP BY 1 ORDER BY 2 DESC
        """)).fetchall()
    for cls, n in rows:
        logger.info(f"  asset_class {cls:14} {n}")
    return updated


# ============================================================
# 2. IDENTITAS — cocokkan coingecko_id dengan base_symbol (§2.5)
#
# `coingecko_id` bukan sumber yang boleh dipercaya buta: pair `T` tercatat
# sebagai Bitcoin karena worker metadata menebak dari ticker. Vonis yang
# terdengar yakin tapi tentang aset yang keliru adalah kesalahan terburuk
# yang bisa dibuat fitur ini.
#
# Pengali harga Binance (1000/10000/1000000/1M) DIABAIKAN saat membandingkan,
# tapi TIDAK PERNAH dipotong untuk dijadikan kunci pencarian — lihat §2.4.
# ============================================================

_MULTIPLIER_RE = re.compile(r"^(1000000|100000|10000|1000|1M)(?=[A-Z])")


def strip_multiplier_for_compare(base_symbol: str) -> str:
    """Hanya untuk MEMBANDINGKAN. Jangan dipakai sebagai kunci pencarian."""
    return _MULTIPLIER_RE.sub("", base_symbol.upper())


def verify_identities(limit: Optional[int] = None) -> Dict[str, int]:
    """Cocokkan setiap coingecko_id dengan simbol resminya.

    Memakai /coins/list — SATU panggilan mengembalikan id+symbol seluruh coin
    di CoinGecko. Versi pertama saya memanggil /coins/{id} per aset: 643
    panggilan, sekitar 21 menit, dan membebani API mereka tanpa alasan.
    """
    headers = {"User-Agent": USER_AGENT}
    if COINGECKO_API_KEY:
        headers["x-cg-demo-api-key"] = COINGECKO_API_KEY

    logger.info("Mengambil daftar lengkap coin CoinGecko (satu panggilan)...")
    with httpx.Client(timeout=120, headers=headers) as client:
        listing = client.get(f"{COINGECKO_API_BASE}/coins/list").raise_for_status().json()
    id_to_symbol = {c["id"]: (c.get("symbol") or "").upper() for c in listing}
    logger.info(f"CoinGecko memuat {len(id_to_symbol)} coin")

    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT c.pair, c.base_symbol, c.coingecko_id
              FROM coins c
              JOIN coin_shariah s ON s.pair = c.pair
             WHERE s.asset_class IN ('crypto_token', 'delisted')
             ORDER BY c.pair
        """)).fetchall()
    if limit:
        rows = rows[:limit]

    stats = {"ok": 0, "mismatch": 0, "no_id": 0, "id_tidak_dikenal": 0}
    for pair, base_symbol, cg_id in rows:
        if not cg_id:
            _set_identity(pair, "unknown", "No coingecko_id on file — identity cannot be verified yet.")
            stats["no_id"] += 1
            continue

        got = id_to_symbol.get(cg_id)
        # Dua bentuk sama-sama sah. Sebagian coin memang bernama dengan angka
        # di depannya (CoinGecko mencatat simbol '1000CAT', '1000X', '1MBABYDOGE'
        # apa adanya), sementara sebagian lain memakai pengali harga Binance di
        # atas simbol biasa (1000SHIB → SHIB). Menuntut satu bentuk saja
        # menghasilkan tuduhan palsu untuk kelompok pertama.
        want_raw = base_symbol.upper()
        want_stripped = strip_multiplier_for_compare(base_symbol)
        accepted = {want_raw, want_stripped}

        if got is None:
            note = f"coingecko_id '{cg_id}' does not exist in CoinGecko's coin list."
            _set_identity(pair, "mismatch", note)
            stats["id_tidak_dikenal"] += 1
            logger.warning(f"[{pair}] {note}")
        elif got in accepted:
            _set_identity(pair, "ok", None)
            stats["ok"] += 1
        else:
            note = (f"coingecko_id '{cg_id}' carries the symbol '{got}', but this pair is "
                    f"'{want_raw}' — the metadata we hold belongs to a different asset.")
            _set_identity(pair, "mismatch", note)
            stats["mismatch"] += 1
            logger.warning(f"[{pair}] IDENTITAS TIDAK COCOK — {note}")

    logger.info(f"Identitas: {stats}")
    return stats


def _set_identity(pair: str, status: str, note: Optional[str]) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE coin_shariah
                   SET identity_status = :st,
                       identity_note   = :note,
                       -- Identitas meragukan tidak boleh membawa vonis APA PUN.
                       -- Status DAN alasannya sama-sama dibuang: alasan lama
                       -- mengutip deskripsi aset yang keliru, dan kutipan yang
                       -- salah alamat lebih berbahaya daripada kolom kosong.
                       -- Nyata terjadi: IDUSDT sempat divonis haram dengan
                       -- kutipan deskripsi Hyperliquid.
                       status = CASE WHEN :st = 'mismatch' THEN 'unrated' ELSE status END,
                       criteria = CASE WHEN :st = 'mismatch' THEN '{}'::jsonb ELSE criteria END,
                       summary = CASE WHEN :st = 'mismatch' THEN NULL ELSE summary END,
                       confidence = CASE WHEN :st = 'mismatch' THEN 0 ELSE confidence END,
                       review_status = CASE WHEN :st = 'mismatch' THEN 'needs_review' ELSE review_status END,
                       updated_at = now()
                 WHERE pair = :pair
            """),
            {"pair": pair, "st": status, "note": note},
        )


def fix_identities() -> Dict[str, int]:
    """Perbaiki `coingecko_id` yang salah — hanya bila jawabannya tidak ambigu.

    Kalau satu simbol punya lebih dari satu kandidat di CoinGecko, kita TIDAK
    memilihkan. Menebak di sini persis mengulang kesalahan yang menciptakan
    masalahnya: worker metadata dulu menebak, dan `ID` berakhir membawa
    deskripsi Hyperliquid. Daftar kandidatnya disimpan utuh supaya admin
    memutuskan dengan bahan lengkap, bukan dari nol.
    """
    headers = {"User-Agent": USER_AGENT}
    if COINGECKO_API_KEY:
        headers["x-cg-demo-api-key"] = COINGECKO_API_KEY

    with httpx.Client(timeout=120, headers=headers) as client:
        listing = client.get(f"{COINGECKO_API_BASE}/coins/list").raise_for_status().json()

    by_symbol: Dict[str, List[Dict[str, str]]] = {}
    for c in listing:
        by_symbol.setdefault((c.get("symbol") or "").upper(), []).append(
            {"id": c["id"], "name": c.get("name") or ""}
        )

    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT cs.pair, c.base_symbol, c.coingecko_id
              FROM coin_shariah cs JOIN coins c ON c.pair = cs.pair
             WHERE cs.identity_status = 'mismatch'
             ORDER BY cs.pair
        """)).fetchall()

    stats = {"diperbaiki": 0, "ambigu": 0, "tidak_ada_kandidat": 0}

    for pair, base_symbol, old_id in rows:
        raw = base_symbol.upper()
        cands = by_symbol.get(raw) or by_symbol.get(strip_multiplier_for_compare(base_symbol)) or []

        if len(cands) == 1:
            new_id = cands[0]["id"]
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE coins SET coingecko_id=:n, updated_at=now() WHERE pair=:p"),
                    {"n": new_id, "p": pair},
                )
                conn.execute(
                    text("""UPDATE coin_shariah
                               SET identity_status='ok',
                                   identity_note=:note,
                                   screened_at=NULL,
                                   updated_at=now()
                             WHERE pair=:p"""),
                    {"p": pair,
                     "note": f"coingecko_id auto-corrected: '{old_id}' → '{new_id}' "
                             f"({cands[0]['name']}). Only one asset on CoinGecko carries the "
                             f"symbol {raw}, so nothing had to be guessed."},
                )
            logger.info(f"[{pair}] identitas diperbaiki: {old_id} → {new_id}")
            stats["diperbaiki"] += 1

        elif len(cands) > 1:
            shortlist = ", ".join(f"{c['id']} ({c['name']})" for c in cands[:8])
            more = f" — and {len(cands) - 8} more" if len(cands) > 8 else ""
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE coin_shariah SET identity_note=:note, updated_at=now() WHERE pair=:p"),
                    {"p": pair,
                     "note": f"Old coingecko_id '{old_id}' was wrong. {len(cands)} assets on "
                             f"CoinGecko carry the symbol {raw}, so we did NOT pick one. "
                             f"Candidates: {shortlist}{more}."},
                )
            stats["ambigu"] += 1

        else:
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE coin_shariah SET identity_note=:note, updated_at=now() WHERE pair=:p"),
                    {"p": pair,
                     "note": f"Old coingecko_id '{old_id}' was wrong, and no asset on CoinGecko "
                             f"carries the symbol {raw}. Its identity must be set manually."},
                )
            stats["tidak_ada_kandidat"] += 1

    logger.info(f"Perbaikan identitas: {stats}")
    return stats


# ── Keterangan untuk yang TIDAK bisa dinilai ─────────────────────────────
# Kolom kosong mengundang salah paham: orang membaca "tidak ada keterangan"
# sebagai "berarti aman" atau justru "berarti haram". Karena itu setiap coin
# yang tidak bisa dinilai HARUS membawa penjelasan sebabnya, dan penegasan
# bahwa ini bukan vonis apa pun.

UNRATED_DISCLAIMER = (
    "IMPORTANT: 'not yet assessed' does NOT mean halal, and does NOT mean haram. "
    "It means we do not have enough defensible material to assess it, and we chose "
    "silence over guessing. Please check it yourself, or ask a scholar or "
    "institution you trust."
)


def explain_unrated() -> Dict[str, int]:
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT cs.pair, cs.identity_status, cs.identity_note, cs.asset_class,
                   NULLIF(TRIM(COALESCE(c.description, '')), '') AS descr,
                   NULLIF(TRIM(COALESCE(c.summary, '')), '')     AS summ
              FROM coin_shariah cs JOIN coins c ON c.pair = cs.pair
             WHERE cs.status = 'unrated'
        """)).mappings().all()

    stats: Dict[str, int] = {}
    for r in rows:
        if r["identity_status"] == "mismatch":
            sebab = "identity_unverified"
            teks = (
                "We cannot assess this asset yet because the reference data we hold turned out "
                "to belong to a different asset, so any assessment would be about the wrong "
                "thing. " + (r["identity_note"] or "")
            )
        elif not r["descr"] and not r["summ"]:
            sebab = "no_material"
            teks = ("We cannot assess this asset yet because there is no official description "
                    "we can quote. Assessing without material means guessing, and we do not do "
                    "that here.")
        else:
            sebab = "insufficient_material"
            teks = ("We cannot assess this asset yet because the available material is too thin "
                    "to produce a reason we can back with a quote.")

        criteria = {
            "_unrated_reason": {"code": sebab, "text": teks},
            "_disclaimer": UNRATED_DISCLAIMER,
            "_basis": {
                "engine": "none",
                "engine_label": ENGINE_LABEL["none"],
                "sources": [],
                "engine_version": ENGINE_VERSION,
                "screened_at": datetime.now(timezone.utc).isoformat(),
            },
        }
        with engine.begin() as conn:
            conn.execute(
                text("""UPDATE coin_shariah
                           SET criteria = CAST(:c AS jsonb),
                               summary = :s,
                               updated_at = now()
                         WHERE pair = :p AND status = 'unrated'"""),
                {"p": r["pair"], "c": json.dumps(criteria, ensure_ascii=False), "s": teks},
            )
        stats[sebab] = stats.get(sebab, 0) + 1

    logger.info(f"Keterangan 'belum dinilai': {stats}")
    return stats


# ============================================================
# 3. SUMBER EKSTERNAL — Sharlife (§2.1, §2.4)
#
# Satu GET mengembalikan SELURUH tabel (±1.132 baris) sudah server-rendered,
# dengan atribut data yang terbaca mesin. Bukan scraper per-halaman.
#
# Kita menautkan dan menyebut status mereka; kita TIDAK menyalin analisisnya
# (analisis rinci mereka berbayar).
# ============================================================

_ROW_RE = re.compile(
    r"onclick=\"window\.location='(/crypto-shariah/crypto/([a-z0-9\-]+))'\"([^>]*?)data-status=\"([^\"]*)\"")
_TICKER_RE = re.compile(r"data-ticker=\"([^\"]*)\"")
_NAME_RE = re.compile(r"data-name=\"([^\"]*)\"")

SHARLIFE_NORM = {"Shariah": "halal", "Grey": "mashbooh", "Non-Shariah": "haram"}


def fetch_sharlife() -> Tuple[Dict[str, Dict], Dict[str, List[Dict]]]:
    """→ (by_slug, by_ticker). by_ticker memuat SEMUA kandidat, termasuk yang ambigu."""
    with httpx.Client(timeout=90, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        html = client.get(SHARLIFE_LIST_URL).raise_for_status().text

    rows = _ROW_RE.findall(html)
    if len(rows) < 500:
        # Struktur HTML pihak ketiga bisa berubah kapan saja tanpa pemberitahuan.
        # Kalau parse anjlok, ini HARUS berbunyi — bukan diam lalu menulis nol baris.
        raise RuntimeError(
            f"Parse Sharlife hanya menemukan {len(rows)} baris (harusnya >1.000). "
            "Markup mereka kemungkinan berubah — konektor perlu diperiksa."
        )

    by_slug: Dict[str, Dict] = {}
    by_ticker: Dict[str, List[Dict]] = {}
    for _, slug, attrs, status in rows:
        tm, nm = _TICKER_RE.search(attrs), _NAME_RE.search(attrs)
        ticker = (tm.group(1).split() or [""])[0].upper() if tm else ""
        rec = {
            "slug": slug,
            "status_raw": status,
            "status_norm": SHARLIFE_NORM.get(status, "not_found"),
            "label": (nm.group(1).strip() if nm else "") or ticker,
            "url": f"https://sharlife.my/crypto-shariah/crypto/{slug}",
        }
        by_slug[slug] = rec
        if ticker:
            by_ticker.setdefault(ticker, []).append(rec)

    logger.info(f"Sharlife: {len(rows)} baris, {len(by_slug)} slug, {len(by_ticker)} ticker")
    return by_slug, by_ticker


def refresh_sources() -> Dict[str, int]:
    by_slug, by_ticker = fetch_sharlife()

    with engine.begin() as conn:
        coins = conn.execute(text("""
            SELECT c.pair, c.base_symbol, c.coingecko_id
              FROM coins c JOIN coin_shariah s ON s.pair = c.pair
             -- 'delisted' ikut: MATIC, RNDR, EOS dan kawan-kawan tetap kripto
             -- sungguhan, hanya tidak lagi listing di Binance futures. Sinyal
             -- historisnya masih dibaca orang, jadi statusnya tetap perlu.
             WHERE s.asset_class IN ('crypto_token', 'delisted')
        """)).fetchall()

    stats = {"coingecko_id": 0, "ticker_unique": 0, "ambiguous": 0, "none": 0}

    with engine.begin() as conn:
        for pair, base_symbol, cg_id in coins:
            rec, method = None, "none"

            # Utama: coingecko_id → slug. Eksak, tanpa tebakan.
            if cg_id and cg_id in by_slug:
                rec, method = by_slug[cg_id], "coingecko_id"
            else:
                # Cadangan: ticker, HANYA bila unik. 22 ticker di Sharlife
                # menunjuk lebih dari satu aset — `LIT` bahkan memberi vonis
                # berlawanan (lighter=haram vs litentry=halal). Menebak di sini
                # berarti menayangkan vonis acak.
                cands = by_ticker.get(base_symbol.upper(), [])
                if len(cands) == 1:
                    rec, method = cands[0], "ticker_unique"
                elif len(cands) > 1:
                    method = "ambiguous"

            stats[method] += 1
            if method == "none":
                # Tidak ada di Sharlife sama sekali — tidak perlu dicatat.
                continue

            # `ambiguous` TETAP dicatat, dengan status_norm='not_found'. Kita
            # ingin bisa menjawab "kenapa coin ini kosong padahal tickernya ada
            # di Sharlife" tanpa menebak-nebak lagi nanti.
            conn.execute(
                text("""
                    INSERT INTO coin_shariah_sources
                        (pair, source, status_raw, status_norm, url, label, match_method, checked_at)
                    VALUES (:pair, 'sharlife', :raw, :norm, :url, :label, :method, now())
                    ON CONFLICT (pair, source) DO UPDATE SET
                        status_raw = EXCLUDED.status_raw,
                        status_norm = EXCLUDED.status_norm,
                        url = EXCLUDED.url,
                        label = EXCLUDED.label,
                        match_method = EXCLUDED.match_method,
                        checked_at = now()
                """),
                {
                    "pair": pair,
                    "method": method,
                    "raw": rec["status_raw"] if rec else None,
                    "norm": rec["status_norm"] if rec else "not_found",
                    "url": rec["url"] if rec else None,
                    "label": rec["label"] if rec else None,
                },
            )

    logger.info(f"Sumber Sharlife: {stats}")
    return stats


# ============================================================
# 4. RULES ENGINE — deterministik, dan setiap alasan mengutip buktinya (§4.1.D)
#
# Aturannya sengaja konservatif. Yang tidak bisa dijawab di sini TIDAK
# diloloskan — ia diserahkan ke LLM, lalu ke review manusia. `halal` bukan
# nilai default apa pun.
# ============================================================

# Kata kunci → (kriteria, vonis, alasan). Dicek pada teks gabungan yang
# SUDAH kita simpan sendiri, sehingga buktinya selalu bisa ditunjuk.
BUSINESS_HARAM = [
    (["perpetual", "perpetuals", "derivatives exchange", "perps dex", "leverage trading",
      "margin trading", "up to 100x", "futures exchange"],
     "business", "haram",
     "The project runs a leveraged derivatives/perpetuals exchange — riba and maysir are "
     "built into its core product."),
    (["lending protocol", "lending and borrowing", "lending & borrowing", "borrow against collateral",
      "money market protocol", "supply assets to earn", "earn interest", "interest-bearing"],
     "riba", "haram",
     "Its core business is interest-bearing lending and borrowing — riba."),
    (["casino", "gambling", "betting", "sportsbook", "wager", "lottery", "prediction market"],
     "gharar", "haram",
     "Its core product is gambling or betting — maysir."),
]

CATEGORY_HARAM = [
    (["derivatives", "perpetuals"], "business", "haram",
     "This token's official categories include derivatives/perpetuals."),
    (["lending/borrowing", "lending borrowing", "yield farming"], "riba", "haram",
     "This token's official categories include interest-bearing lending/borrowing."),
    (["gambling (gamblefi)", "gamblefi", "prediction markets"], "gharar", "haram",
     "This token's official categories include gambling or prediction markets."),
]


def _text_blob(coin: Dict[str, Any]) -> str:
    parts = [
        coin.get("description") or "",
        coin.get("summary") or "",
        json.dumps(coin.get("use_cases") or []),
        json.dumps(coin.get("key_features") or []),
        json.dumps(coin.get("utility_details") or {}),
    ]
    return " ".join(parts).lower()


def _categories(coin: Dict[str, Any]) -> List[str]:
    """Kategori CoinGecko, dengan tag ekosistem dibuang.

    ARPA membawa 'bnb chain ecosystem', 'animoca brands portfolio', 'dwf labs
    portfolio' — kebisingan yang sudah pernah menjebak coin_metadata_worker
    ('CRITICAL FIX: ecosystem tags filtered out'). Jangan ulangi.
    """
    raw = coin.get("categories_raw")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    out = []
    for c in raw or []:
        c = str(c).lower().strip()
        if not c or c == "manual_override":
            continue
        if "ecosystem" in c or "portfolio" in c:
            continue
        out.append(c)
    return out


def _crit(verdict: str, reason: str, evidence: str, source: str) -> Dict[str, Any]:
    return {"verdict": verdict, "reason": reason, "evidence": evidence, "source": source}


def apply_rules(coin: Dict[str, Any], asset_class: str) -> Tuple[str, int, Dict[str, Any], str]:
    """→ (status, confidence, criteria, summary). Status 'unrated' = rules tidak cukup."""

    # Kelas aset lebih dulu. Perpetual TradFi dan indeks bukan aset yang bisa
    # dimiliki atau diserahkan — gagal syarat sil'ah di level definisi, sebelum
    # pertanyaan halal/haram sempat muncul. Ini BUKAN vonis haram.
    if asset_class in ("tradfi_perp", "index_perp"):
        label = ("a perpetual contract on a TradFi asset" if asset_class == "tradfi_perp"
                 else "a synthetic index")
        crit = {"sil_ah": _crit(
            "fail",
            f"This instrument is {label}; it cannot be owned or delivered, and has no spot market.",
            f"Binance exchangeInfo: asset_class={asset_class}",
            "binance_exchange_info",
        )}
        return ("not_applicable", 95, crit,
                "This instrument is a derivative, not an asset you can own. It falls outside "
                "spot-only Shariah Mode — this is not a halal or haram judgement.")

    blob = _text_blob(coin)
    cats = _categories(coin)
    criteria: Dict[str, Any] = {}
    haram_reasons: List[str] = []

    # Kriteria 2/3/4 — aktivitas bisnis, riba, maysir.
    for keywords, key, verdict, reason in BUSINESS_HARAM:
        for kw in keywords:
            if kw in blob:
                idx = blob.find(kw)
                snippet = blob[max(0, idx - 60): idx + len(kw) + 60].strip()
                criteria[key] = _crit(verdict, reason, f"…{snippet}…", "description")
                haram_reasons.append(reason)
                break
        if key in criteria:
            continue

    for keywords, key, verdict, reason in CATEGORY_HARAM:
        if key in criteria:
            continue
        hit = next((c for c in cats if any(k in c for k in keywords)), None)
        if hit:
            criteria[key] = _crit(verdict, reason, f"categories_raw: \"{hit}\"", "coingecko_categories")
            haram_reasons.append(reason)

    if haram_reasons:
        return ("haram", 85, criteria, " ".join(haram_reasons))

    # Kriteria 1 — manfaat / syarat sil'ah.
    # Memecoin sengaja TIDAK divonis haram: ini titik perbedaan pendapat yang
    # nyata (Sharlife menilai DOGE "Grey", bukan "Non-Shariah"). `mashbooh`
    # justru arti sebenarnya dari keadaan ini.
    if coin.get("token_type") == "memecoin" or coin.get("has_utility") is False:
        criteria["sil_ah"] = _crit(
            "fail",
            "No clear benefit or underlying — the sil'ah requirement in the MUI fatwa is not "
            "met. Scholars differ on assets like this one.",
            f"token_type={coin.get('token_type')}, has_utility={coin.get('has_utility')}"
            + (f", risk_notes: \"{(coin.get('risk_notes') or '')[:120]}\"" if coin.get("risk_notes") else ""),
            "coins.token_type",
        )
        return ("mashbooh", 70, criteria,
                "No clear benefit or underlying asset. Some scholars reject purely speculative "
                "assets; others allow them as digital commodities.")

    # Kriteria 5 — backing ribawi (aturan sarf).
    if coin.get("token_type") == "stablecoin":
        criteria["ribawi_backing"] = _crit(
            "warn",
            "Pegged to fiat and typically backed by interest-bearing reserves. Subject to sarf "
            "rules: the exchange must be spot, with immediate delivery on both sides.",
            "token_type=stablecoin",
            "coins.token_type",
        )
        return ("mashbooh", 65, criteria,
                "A fiat-backed stablecoin. Its status is disputed because the reserves normally "
                "earn interest and the exchange falls under sarf rules.")

    # Token bursa — pendapatan penerbitnya mencakup derivatif berleverage.
    if coin.get("token_type") == "exchange":
        criteria["business"] = _crit(
            "warn",
            "Its value depends on exchange revenue, which includes leveraged derivatives trading.",
            "token_type=exchange",
            "coins.token_type",
        )
        return ("mashbooh", 60, criteria,
                "An exchange token. The issuer's revenue includes leveraged products, so the "
                "benefit this token represents is mixed.")

    # Sampai sini rules tidak menemukan masalah — TAPI itu bukan berarti halal.
    # Tidak menemukan bukti berbeda dengan menemukan bukti bahwa tidak ada
    # masalah. Serahkan ke LLM lalu review.
    return ("unrated", 0, criteria, "")


def screen_pairs(only_pair: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, int]:
    sql = """
        SELECT c.pair, c.base_symbol, c.token_type, c.sector, c.has_utility,
               c.utility_details, c.description, c.summary, c.use_cases,
               c.key_features, c.risk_notes, c.categories_raw,
               s.asset_class, s.identity_status
          FROM coins c JOIN coin_shariah s ON s.pair = c.pair
         {where}
         ORDER BY c.pair
    """
    where = "WHERE c.pair = :pair" if only_pair else ""
    with engine.begin() as conn:
        rows = conn.execute(
            text(sql.format(where=where)),
            {"pair": only_pair} if only_pair else {},
        ).mappings().all()
    if limit:
        rows = rows[:limit]

    stats: Dict[str, int] = {}
    for row in rows:
        coin = dict(row)
        asset_class = coin["asset_class"]

        # Identitas meragukan → tidak boleh membawa vonis apa pun (§2.5).
        if coin["identity_status"] == "mismatch":
            _persist(coin["pair"], "unrated", 0, {}, "", needs_review=True)
            stats["skip_identity_mismatch"] = stats.get("skip_identity_mismatch", 0) + 1
            continue

        status, confidence, criteria, summary = apply_rules(coin, asset_class)
        needs_review = False

        # Rules yang DIAM tidak boleh menghapus penilaian yang sudah ada.
        # Pernah terjadi: menjalankan ulang --screen setelah LLM pass
        # mengembalikan 197 coin ke 'unrated' karena rules memang tidak
        # menemukan apa-apa pada mereka. Diam bukan temuan.
        if status == "unrated":
            with engine.begin() as conn:
                prev = conn.execute(
                    text("""SELECT status,
                                   criteria->'_basis'->>'engine' AS engine,
                                   criteria->'_basis'->>'engine_version' AS version
                              FROM coin_shariah WHERE pair = :p"""),
                    {"p": coin["pair"]},
                ).mappings().first()
            # Hanya pertahankan bila baris lamanya ditulis engine versi INI.
            # Tanpa syarat versi, pengaman ini ikut melindungi teks basi —
            # nyata terjadi saat konversi ke bahasa Inggris: 322 baris tetap
            # memegang alasan berbahasa Indonesia karena rules diam dan
            # barisnya dilewati.
            if (prev and prev["status"] != "unrated"
                    and prev["engine"] in ("llm", "external_source")
                    and prev["version"] == ENGINE_VERSION):
                stats["dipertahankan"] = stats.get("dipertahankan", 0) + 1
                continue

        # Sumber eksternal: sepakat → naikkan confidence, bertentangan → review.
        with engine.begin() as conn:
            src = conn.execute(
                text("""SELECT source, status_norm, url FROM coin_shariah_sources
                         WHERE pair = :p AND status_norm <> 'not_found'"""),
                {"p": coin["pair"]},
            ).mappings().all()

        for s in src:
            criteria[f"source_{s['source']}"] = _crit(
                s["status_norm"], f"External source {s['source']} rates this: {s['status_norm']}.",
                s["url"] or "", s["source"],
            )

        ext = {s["status_norm"] for s in src}
        if status != "unrated" and status != "not_applicable" and ext:
            if status in ext:
                confidence = min(95, confidence + 10)
            else:
                # Tidak dipaksa menang siapa pun. Manusia yang memutuskan.
                needs_review = True
                confidence = max(30, confidence - 25)

        engine_used = "rules" if status not in ("unrated", "not_applicable") else "none"
        if status == "not_applicable":
            engine_used = "asset_class"

        # Rules diam, tapi sumber luar bicara → pakai sumbernya, sebut sumbernya.
        if status == "unrated" and ext:
            if len(ext) == 1:
                status = next(iter(ext))
                confidence = 55
                engine_used = "external_source"
                names = ", ".join(sorted({s["source"] for s in src}))
                summary = (f"Our own screening found nothing on this asset. This status follows "
                           f"{names}'s assessment — it is not our own. The link is below so you "
                           f"can check it directly.")
                needs_review = True

        sources = [{"name": s["source"], "status": s["status_norm"], "url": s["url"]} for s in src]
        criteria = attach_basis(criteria, status, engine_used, sources)

        # Setiap status yang tayang harus membawa kalimat asal-usulnya sendiri.
        if summary and engine_used in ("rules", "asset_class"):
            summary = f"According to {ENGINE_LABEL[engine_used]}: {summary}"

        _persist(coin["pair"], status, confidence, criteria, summary, needs_review)
        stats[status] = stats.get(status, 0) + 1

    logger.info(f"Screening: {stats}")
    return stats


def _persist(pair: str, status: str, confidence: int, criteria: Dict[str, Any],
             summary: str, needs_review: bool = False) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE coin_shariah
                   SET status = :status,
                       confidence = :conf,
                       criteria = CAST(:criteria AS jsonb),
                       summary = NULLIF(:summary, ''),
                       engine_version = :ver,
                       screened_at = now(),
                       -- 'pending' = belum pernah disentuh siapa pun (nilai awal).
                       -- 'needs_review' = engine SENDIRI menandai ada yang perlu
                       -- diputuskan manusia (konflik dengan sumber luar, identitas
                       -- meragukan, atau status yang cuma bersandar pada sumber luar).
                       -- Dibedakan supaya antrean admin tidak berisi seluruh katalog.
                       review_status = CASE
                           WHEN review_status = 'overridden' THEN 'overridden'
                           WHEN :needs_review THEN 'needs_review'
                           ELSE review_status END,
                       updated_at = now()
                 WHERE pair = :pair
            """),
            {"pair": pair, "status": status, "conf": confidence,
             "criteria": json.dumps(criteria, ensure_ascii=False),
             "summary": summary, "ver": ENGINE_VERSION, "needs_review": needs_review},
        )


# ============================================================
# 4b. KETERANGAN WAJIB — dari mana, kenapa, dan peringatan bahwa ini bisa salah
#
# Permintaan pemilik: setiap status harus menyebut SUMBERNYA dan ALASANNYA,
# dan harus menyatakan terus terang bahwa ini bisa keliru sehingga pembaca
# perlu memeriksanya kembali sesuai keyakinan atau rujukan yang ia percaya.
#
# Ini disimpan sebagai DATA (`criteria._basis` dan `criteria._disclaimer`),
# bukan sekadar kalimat di UI — supaya tidak mungkin ada satu permukaan pun
# yang menampilkan status telanjang tanpa keterangannya.
# ============================================================

# Bahasa: SEMUA teks yang dilihat user ditulis dalam bahasa Inggris, karena
# aplikasinya berbahasa Inggris (i18n saat ini: en/zh). Kolom `summary_id` dan
# `summary_ar` disiapkan untuk terjemahan menyusul — jangan menulis bahasa lain
# ke `summary`.

DISCLAIMER_BASE = (
    "This is a screening result, not a fatwa. LuxQuant is not a fatwa body and "
    "does not issue rulings. This assessment can be wrong — please verify it "
    "yourself, or consult a scholar or institution you trust."
)

DISCLAIMER_BY_STATUS = {
    "halal": "We found no problem in the criteria we checked. That is not the same as "
             "a guarantee that no problem exists.",
    "mashbooh": "This status is disputed. Scholars differ on assets like this one, so the "
                "decision rests with you.",
    "haram": "We found indications that conflict with Shariah principles in the criteria "
             "below. Read the evidence yourself before concluding.",
    "unrated": "Not enough material to assess. We deliberately do not guess.",
    "not_applicable": "This instrument is a derivative that cannot be owned, so it falls "
                      "outside spot-based assessment. It is neither a halal nor a haram ruling.",
}

ENGINE_LABEL = {
    "rules": "LuxQuant internal screening (deterministic rules over the data we store)",
    "llm": "LuxQuant internal screening (AI analysis of the project's official description)",
    "external_source": "an external source — not our own assessment",
    "asset_class": "Binance's own instrument classification",
    "none": "not yet assessed",
}


def attach_basis(criteria: Dict[str, Any], status: str, engine_used: str,
                 sources: List[Dict[str, Any]], model: Optional[str] = None) -> Dict[str, Any]:
    criteria = dict(criteria)
    criteria["_basis"] = {
        "engine": engine_used,
        "engine_label": ENGINE_LABEL.get(engine_used, engine_used),
        "model": model,
        "sources": sources,
        "screened_at": datetime.now(timezone.utc).isoformat(),
        "engine_version": ENGINE_VERSION,
    }
    criteria["_disclaimer"] = " ".join(
        [DISCLAIMER_BY_STATUS.get(status, ""), DISCLAIMER_BASE]
    ).strip()
    return criteria


# ============================================================
# 4c. LLM PASS — hanya untuk yang tidak terjawab rules
#
# Aturan mati: model WAJIB mengembalikan `evidence` berupa kutipan verbatim dari
# teks yang kami kirimkan. Setiap kutipan DIPERIKSA ULANG di sini; yang tidak
# benar-benar ada di teks sumber dibuang. Kalau tidak ada satu pun kriteria yang
# lolos pemeriksaan, hasilnya `unrated` — bukan tebakan yang terdengar yakin.
# ============================================================

LLM_MODEL = os.getenv("SHARIAH_LLM_MODEL", "deepseek-chat")
LLM_BASE_URL = os.getenv("SHARIAH_LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_API_KEY = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY") or ""

LLM_SYSTEM = """You are a Shariah-compliance screening assistant for crypto assets.

Your job is NOT to issue a fatwa. Your job is to examine the text you are given
and report findings, with quotes.

Assess these 7 criteria:
  utility    - Is there a clear benefit/underlying? (sil'ah requirement, MUI fatwa 2021)
  business   - The project's business activity: interest-bearing lending, gambling,
               leveraged derivatives, adult, conventional insurance -> fail
  riba       - Does tokenomics promise fixed/interest-like yield? -> fail
  gharar     - Pure speculation, unclear ownership/supply, maysir? -> fail
  ribawi     - Backed by gold/silver/fiat? -> warn, sarf rules apply
  staking    - PoS validator reward (acceptable) vs interest-bearing "staking" (fail)
  legitimacy - Is there a whitepaper, a team, a real product?

ABSOLUTE RULES:
- For every criterion you assess, "evidence" MUST be a VERBATIM quote (copied
  exactly) from the SOURCE TEXT provided. Never summarize, paraphrase, or invent.
- If the source text contains no evidence for a criterion, OMIT that criterion
  entirely. Silence is better than guessing.
- Do not use outside knowledge about the project. Only the text provided.
- Write every reason and the summary in ENGLISH.

Reply with JSON ONLY:
{"criteria": {"<criterion_name>": {"verdict": "pass|warn|fail",
                                   "reason": "<one sentence, English>",
                                   "evidence": "<verbatim quote>"}},
 "status": "halal|mashbooh|haram|unrated",
 "summary": "<2 sentences, English, neutral, reporting the findings>"}"""


def _llm_screen_one(coin: Dict[str, Any], client) -> Optional[Dict[str, Any]]:
    source_text = "\n".join(filter(None, [
        f"NAME: {coin.get('base_symbol')}",
        f"TYPE: {coin.get('token_type')} | SECTOR: {coin.get('sector')}",
        f"OFFICIAL CATEGORIES: {', '.join(_categories(coin)) or '(none)'}",
        f"DESCRIPTION: {coin.get('description') or ''}",
        f"SUMMARY: {coin.get('summary') or ''}",
        f"USE CASES: {json.dumps(coin.get('use_cases') or [], ensure_ascii=False)}",
        f"FEATURES: {json.dumps(coin.get('key_features') or [], ensure_ascii=False)}",
        f"RISK NOTES: {coin.get('risk_notes') or ''}",
    ]))

    # Tanpa bahan, tidak ada yang bisa dikutip. Jangan buang biaya dan jangan
    # beri model kesempatan mengarang.
    if not (coin.get("description") or coin.get("summary")):
        return None

    resp = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": LLM_SYSTEM},
            {"role": "user", "content": f"TEKS SUMBER:\n{source_text}"},
        ],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=1200,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(f"[{coin['pair']}] balasan LLM bukan JSON valid")
        return None

    # ── Pemeriksaan kutipan. Ini inti keamanannya. ──
    haystack = re.sub(r"\s+", " ", source_text).lower()
    verified: Dict[str, Any] = {}
    dropped = 0
    for key, val in (parsed.get("criteria") or {}).items():
        if not isinstance(val, dict):
            continue
        ev = re.sub(r"\s+", " ", str(val.get("evidence") or "")).strip().lower()
        if len(ev) < 12 or ev not in haystack:
            dropped += 1
            continue
        verified[key] = _crit(
            str(val.get("verdict") or "warn"),
            str(val.get("reason") or ""),
            str(val.get("evidence")),
            "llm_verified_quote",
        )

    if dropped:
        logger.info(f"[{coin['pair']}] {dropped} kriteria dibuang — kutipannya tidak ada di teks sumber")
    if not verified:
        return None

    status = str(parsed.get("status") or "unrated")
    if status not in ("halal", "mashbooh", "haram", "unrated"):
        status = "unrated"
    # LLM tidak pernah boleh menyatakan halal sendirian. Halal butuh korroborasi
    # sumber eksternal atau persetujuan admin (§6b).
    if status == "halal":
        status = "mashbooh"

    return {
        "status": status,
        "criteria": verified,
        "summary": str(parsed.get("summary") or "")[:800],
        "usage": resp.usage,
    }


def llm_pass(limit: Optional[int] = None) -> Dict[str, int]:
    if not LLM_API_KEY:
        logger.error("DEEPSEEK_API_KEY/OPENAI_API_KEY tidak diset — LLM pass dilewati")
        return {}
    try:
        from openai import OpenAI
    except ImportError:
        logger.error("paket openai tidak terpasang di venv")
        return {}
    try:
        from app.services.ai_cost import log_usage, extract_usage
    except Exception as e:
        # JANGAN diam. Pernah terjadi: skrip dijalankan sebagai path
        # (`python3 app/services/x.py`) sehingga sys.path[0] menunjuk ke
        # app/services dan paket `app` tidak ketemu — seluruh backfill jalan
        # tanpa satu pun biaya tercatat, dan tidak ada yang tahu.
        # Jalankan sebagai modul: `python3 -m app.services.shariah_screening_worker`.
        log_usage = extract_usage = None
        logger.error(
            f"PELACAKAN BIAYA MATI — gagal mengimpor app.services.ai_cost ({e}). "
            "Jalankan sebagai modul (-m) dengan PYTHONPATH=backend, bukan sebagai path file."
        )

    client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL)

    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT c.pair, c.base_symbol, c.token_type, c.sector, c.has_utility,
                   c.utility_details, c.description, c.summary, c.use_cases,
                   c.key_features, c.risk_notes, c.categories_raw
              FROM coins c JOIN coin_shariah s ON s.pair = c.pair
             WHERE s.status = 'unrated'
               AND s.asset_class IN ('crypto_token', 'delisted')
               AND s.identity_status <> 'mismatch'
               AND s.review_status <> 'overridden'
               -- Jangan menanyakan ulang coin yang sudah pernah dicoba pada
               -- versi engine ini. Tanpa syarat ini, coin yang memang tidak
               -- bisa dinilai akan dipanggilkan ke LLM setiap sweep — ribuan
               -- panggilan sehari untuk jawaban yang sudah kita tahu kosong.
               AND (s.criteria->'_basis'->>'engine_version') IS DISTINCT FROM :ver
             ORDER BY c.pair
        """), {"ver": ENGINE_VERSION}).mappings().all()
    if limit:
        rows = rows[:limit]

    logger.info(f"LLM pass: {len(rows)} pair")
    stats: Dict[str, int] = {}

    for row in rows:
        coin = dict(row)
        try:
            out = _llm_screen_one(coin, client)
        except Exception as e:
            logger.warning(f"[{coin['pair']}] LLM gagal: {e}")
            stats["error"] = stats.get("error", 0) + 1
            continue

        if not out:
            stats["tetap_unrated"] = stats.get("tetap_unrated", 0) + 1
            continue

        if log_usage and extract_usage:
            try:
                log_usage(feature="shariah_screening", model=LLM_MODEL,
                          usage=extract_usage(out["usage"]), page_id=coin["pair"])
            except Exception:
                pass

        with engine.begin() as conn:
            src = conn.execute(
                text("""SELECT source, status_norm, url FROM coin_shariah_sources
                         WHERE pair = :p AND status_norm <> 'not_found'"""),
                {"p": coin["pair"]},
            ).mappings().all()
        sources = [{"name": s["source"], "status": s["status_norm"], "url": s["url"]} for s in src]

        criteria = attach_basis(out["criteria"], out["status"], "llm", sources, model=LLM_MODEL)
        summary = f"According to {ENGINE_LABEL['llm']}: {out['summary']}"
        # Hasil LLM SELALU masuk antrean review. Ia tidak pernah menjadi
        # kata akhir tanpa mata manusia.
        _persist(coin["pair"], out["status"], 45, criteria, summary, needs_review=True)
        stats[out["status"]] = stats.get(out["status"], 0) + 1

    logger.info(f"LLM pass selesai: {stats}")
    return stats


# ============================================================
# 5. DAEMON — coin baru masuk sendiri
#
# Rantainya sudah ada dan sudah diverifikasi di produksi:
#
#   INSERT signals → trigger trg_new_pair_to_coins → notify_new_pair()
#     → INSERT INTO coins (ON CONFLICT DO NOTHING)
#     → pg_notify('new_pair_to_categorize', pair)
#
# Dua hal yang TIDAK ditangani rantai itu, dan harus kita tangani sendiri:
#
#   1. Trigger itu mengisi `coins`, bukan `coin_shariah`. Tanpa penanganan,
#      coin baru tidak akan pernah punya baris di sini dan diam-diam terlewat
#      selamanya oleh INNER JOIN di screen_pairs().
#
#   2. Saat notify tiba, `coins` masih KOSONG — belum ada description, belum
#      ada token_type. coin_metadata_worker baru akan mengisinya beberapa detik
#      sampai beberapa menit kemudian (CoinGecko dibatasi 2–12 detik per coin).
#      Men-screening saat itu juga hanya menghasilkan 'unrated' yang menetap.
#      Karena itu daemon menyapu ulang secara berkala, bukan sekali tembak.
# ============================================================

SWEEP_INTERVAL_SEC = int(os.getenv("SHARIAH_SWEEP_SEC", "180"))
SOURCES_REFRESH_SEC = int(os.getenv("SHARIAH_SOURCES_SEC", str(7 * 24 * 3600)))


def ensure_rows() -> int:
    """Setiap pair di `coins` harus punya baris di `coin_shariah`."""
    with engine.begin() as conn:
        res = conn.execute(text("""
            INSERT INTO coin_shariah (pair)
            SELECT pair FROM coins
            ON CONFLICT (pair) DO NOTHING
        """))
    return res.rowcount or 0


def sweep() -> Dict[str, int]:
    """Screening pair yang belum pernah dinilai, ATAU yang metadatanya baru datang.

    Kondisi kedua itu yang penting: coin baru selalu tiba tanpa metadata, jadi
    percobaan pertama pasti 'unrated'. Begitu coin_metadata_worker mengisi
    description-nya, coin itu harus dinilai ulang — dan tidak ada notifikasi
    yang memberi tahu kita kapan itu terjadi.
    """
    added = ensure_rows()
    if added:
        logger.info(f"{added} pair baru ditambahkan ke coin_shariah")

    with engine.begin() as conn:
        pairs = [r[0] for r in conn.execute(text("""
            SELECT cs.pair
              FROM coin_shariah cs
              JOIN coins c ON c.pair = cs.pair
             WHERE cs.screened_at IS NULL
                OR (cs.status = 'unrated'
                    AND c.description IS NOT NULL
                    AND (cs.screened_at IS NULL OR c.updated_at > cs.screened_at))
             ORDER BY cs.pair
        """)).fetchall()]

    if not pairs:
        return {}

    logger.info(f"Sweep: {len(pairs)} pair perlu dinilai")
    stats: Dict[str, int] = {}

    # PIPELINE PENUH, bukan cuma rules. Versi pertama sweep() hanya memanggil
    # screen_pairs(), dan itu meninggalkan empat lubang untuk coin baru:
    #
    #   * asset_class tidak pernah diklasifikasi → perpetual saham TradFi yang
    #     baru listing akan dinilai memakai rubrik token kripto. Kelas aset ini
    #     sedang bertambah (semua listing pertamanya Mei–Juni 2026).
    #   * identitas tidak pernah diperiksa → persis jalan menuju kesalahan
    #     terburuk: vonis yakin bersitasi tentang aset yang keliru (ID/Hyperliquid).
    #   * LLM tidak pernah jalan → coin yang tak terjawab rules diam selamanya.
    #   * keterangan 'belum dinilai' kosong → mengundang salah paham.
    #
    # Keduanya hanya satu panggilan API untuk seluruh katalog, dan hanya
    # dijalankan saat memang ada pekerjaan — bukan tiap 3 menit tanpa sebab.
    try:
        classify_asset_classes()
    except Exception as e:
        logger.error(f"Sweep: klasifikasi kelas aset gagal: {e}")
    try:
        verify_identities()
    except Exception as e:
        logger.error(f"Sweep: validasi identitas gagal: {e}")

    for pair in pairs:
        s = screen_pairs(only_pair=pair)
        for k, v in s.items():
            stats[k] = stats.get(k, 0) + v

    # Yang tidak terjawab rules diserahkan ke LLM, lalu apa pun yang tetap
    # kosong diberi keterangan sebabnya.
    try:
        for k, v in (llm_pass() or {}).items():
            stats[f"llm_{k}"] = stats.get(f"llm_{k}", 0) + v
    except Exception as e:
        logger.error(f"Sweep: LLM pass gagal: {e}")
    try:
        explain_unrated()
    except Exception as e:
        logger.error(f"Sweep: pengisian keterangan gagal: {e}")

    return stats


def run_listen_daemon() -> None:
    logger.info(f"Mode: DAEMON — LISTEN {LISTEN_CHANNEL}")
    last_sweep = 0.0
    last_sources = time.monotonic()  # sumber baru saja di-refresh saat backfill

    while True:
        conn = None
        try:
            conn = psycopg2.connect(DATABASE_URL)
            conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()
            cur.execute(f"LISTEN {LISTEN_CHANNEL};")
            logger.info(f"Mendengarkan '{LISTEN_CHANNEL}'...")

            while True:
                # Timeout-nya yang membuat pekerjaan berkala tetap jalan meski
                # tidak ada notifikasi sama sekali.
                if select.select([conn], [], [], 30) != ([], [], []):
                    conn.poll()
                    while conn.notifies:
                        n = conn.notifies.pop(0)
                        logger.info(f"NOTIFY: {n.payload}")
                        # Tidak langsung di-screening di sini — metadatanya
                        # hampir pasti belum ada. Sweep yang menanganinya.

                now = time.monotonic()
                if now - last_sweep >= SWEEP_INTERVAL_SEC:
                    last_sweep = now
                    try:
                        st = sweep()
                        if st:
                            logger.info(f"Sweep selesai: {st}")
                    except Exception as e:
                        logger.error(f"Sweep gagal: {e}")

                if now - last_sources >= SOURCES_REFRESH_SEC:
                    last_sources = now
                    try:
                        refresh_sources()
                    except Exception as e:
                        # Markup Sharlife bisa berubah kapan saja. Ini HARUS
                        # berbunyi di log, bukan lewat tanpa jejak.
                        logger.error(f"REFRESH SUMBER GAGAL — konektor perlu diperiksa: {e}")

        except KeyboardInterrupt:
            logger.info("Daemon dihentikan.")
            return
        except Exception as e:
            logger.warning(f"Koneksi LISTEN putus ({e}); menyambung ulang dalam 5 detik...")
            time.sleep(5)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass


def main():
    parser = argparse.ArgumentParser(description="LuxQuant Shariah Screening Worker v1")
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--classify", action="store_true", help="asset_class dari Binance exchangeInfo")
    g.add_argument("--verify-identity", action="store_true", help="cocokkan coingecko_id vs base_symbol")
    g.add_argument("--fix-identity", action="store_true", help="perbaiki coingecko_id yang tidak ambigu")
    g.add_argument("--explain-unrated", action="store_true", help="isi keterangan untuk yang belum dinilai")
    g.add_argument("--sources", action="store_true", help="refresh Sharlife")
    g.add_argument("--screen", action="store_true", help="rules engine untuk semua pair")
    g.add_argument("--pair", type=str, help="screening satu pair")
    g.add_argument("--backfill", action="store_true", help="classify → sources → screen")
    g.add_argument("--llm", action="store_true", help="LLM pass untuk pair yang masih unrated")
    g.add_argument("--sweep", action="store_true", help="nilai pair yang belum/baru punya metadata")
    g.add_argument("--listen", action="store_true", help="daemon: LISTEN + sweep berkala")
    parser.add_argument("--limit", type=int, help="batasi jumlah pair (untuk uji coba)")
    args = parser.parse_args()

    if args.classify:
        classify_asset_classes()
    elif args.verify_identity:
        verify_identities(limit=args.limit)
    elif args.fix_identity:
        fix_identities()
    elif args.explain_unrated:
        explain_unrated()
    elif args.sources:
        refresh_sources()
    elif args.screen:
        screen_pairs(limit=args.limit)
    elif args.pair:
        screen_pairs(only_pair=args.pair.upper())
    elif args.backfill:
        # Identitas sengaja TIDAK ikut di sini: ia memanggil CoinGecko per coin
        # dan bisa memakan berjam-jam. Jalankan --verify-identity terpisah.
        ensure_rows()
        classify_asset_classes()
        refresh_sources()
        screen_pairs()
    elif args.llm:
        llm_pass(limit=args.limit)
    elif args.sweep:
        sweep()
    elif args.listen:
        run_listen_daemon()


if __name__ == "__main__":
    main()
