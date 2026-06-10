"""
LuxQuant Terminal - Money Flow Worker (Step 2)
==============================================
One-shot script. Jalanin sekali = 1 snapshot cycle, lalu exit.
Dijadwal systemd timer tiap 4 jam (boundary UTC: 00/04/08/12/16/20).

Ngisi 3 tabel (lihat migration-money-flow.sql):
  - mf_sector_snapshots   (CoinGecko categories)
  - mf_coin_snapshots     (top 250 + flag is_luxquant_signal)
  - mf_macro_snapshots    (dominance + altseason index, window 30d)

Prinsip: "inform, don't decide" — worker cuma simpan ANGKA mentah.
Tag akumulasi/distribusi & judgment apapun dihitung di layer
endpoint/frontend, bukan di sini.

Idempotent: ON CONFLICT (snapshot_at, ...) DO UPDATE.
Re-run cycle yang sama nggak gandain row.

Usage:
    DATABASE_URL=postgresql://... COINGECKO_API_KEY=... \
        /usr/bin/python3 money_flow_worker.py

Requirements: httpx, sqlalchemy (udah ada di backend).
"""
import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta

import httpx
from sqlalchemy import create_engine, text

# ============================================================
# CONFIG
# ============================================================
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq@127.0.0.1:5432/luxquant",  # password via env di prod
)
COINGECKO_API = "https://api.coingecko.com/api/v3"
CG_API_KEY = os.getenv("COINGECKO_API_KEY", "")
CG_HEADERS = {"accept": "application/json"}
if CG_API_KEY:
    CG_HEADERS["x-cg-demo-api-key"] = CG_API_KEY

TIMEOUT = 20.0
TOP_COINS = 250          # top N coins per snapshot
ALTSEASON_TOP_N = 100    # altseason index dihitung dari top 100
RETENTION_DAYS = 35      # delta 30d + buffer
ACTIVE_SIGNAL_DAYS = 7   # window "lagi di-call LuxQuant"

# Stablecoin & wrapped — di-exclude dari altseason (bukan "alt" beneran)
ALTSEASON_EXCLUDE = {
    "usdt", "usdc", "dai", "busd", "tusd", "usde", "fdusd", "usds",
    "wbtc", "weth", "steth", "wsteth", "wbeth", "cbbtc", "lbtc",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [money-flow] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler("/var/log/luxquant-sync/money-flow.log"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("money-flow")

engine = create_engine(DATABASE_URL, future=True)


# ============================================================
# HELPERS
# ============================================================
def boundary_4h(now: datetime) -> datetime:
    """Round down ke boundary 4 jam UTC (00/04/08/12/16/20).
    Bikin lookup '7d ago'/'30d ago' landing di snapshot yang pas."""
    now = now.astimezone(timezone.utc)
    hour = (now.hour // 4) * 4
    return now.replace(hour=hour, minute=0, second=0, microsecond=0)


def _num(v):
    """Safe float-or-None."""
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


# ============================================================
# FETCH — CoinGecko
# ============================================================
def fetch_categories(client) -> list:
    res = client.get(
        f"{COINGECKO_API}/coins/categories",
        params={"order": "market_cap_change_24h_desc"},
        headers=CG_HEADERS,
    )
    res.raise_for_status()
    out = []
    for c in res.json():
        mcap = c.get("market_cap", 0) or 0
        if mcap < 1_000_000:
            continue
        out.append({
            "category_id": c.get("id", ""),
            "name": c.get("name", ""),
            "market_cap": mcap,
            "volume_24h": c.get("total_volume", 0) or 0,
            "market_cap_change_24h": c.get("market_cap_change_24h", 0) or 0,
            "top_3_coins": c.get("top_3_coins", [])[:3],
        })
    return out


def fetch_coins(client) -> list:
    """Top N coins dengan delta 1h/24h/7d/30d."""
    res = client.get(
        f"{COINGECKO_API}/coins/markets",
        params={
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": TOP_COINS,
            "page": 1,
            "sparkline": "false",
            "price_change_percentage": "1h,24h,7d,30d",
        },
        headers=CG_HEADERS,
    )
    res.raise_for_status()
    out = []
    for c in res.json():
        out.append({
            "coin_id": c.get("id", ""),
            "symbol": (c.get("symbol") or "").upper(),
            "price": _num(c.get("current_price")),
            "market_cap": _num(c.get("market_cap")),
            "volume_24h": _num(c.get("total_volume")),
            "price_change_24h": _num(c.get("price_change_percentage_24h")),
            "price_change_7d": _num(c.get("price_change_percentage_7d_in_currency")),
            "price_change_30d": _num(c.get("price_change_percentage_30d_in_currency")),
        })
    return out


def fetch_global(client) -> dict:
    res = client.get(f"{COINGECKO_API}/global", headers=CG_HEADERS)
    res.raise_for_status()
    g = res.json().get("data", {})
    pct = g.get("market_cap_percentage", {})
    return {
        "btc_dominance": _num(pct.get("btc")),
        "eth_dominance": _num(pct.get("eth")),
        "stablecoin_dominance": (_num(pct.get("usdt")) or 0) + (_num(pct.get("usdc")) or 0),
        "total_market_cap": _num(g.get("total_market_cap", {}).get("usd")),
        "total_volume_24h": _num(g.get("total_volume", {}).get("usd")),
    }


def compute_altseason(coins: list) -> float | None:
    """Altseason index (window 30d): % dari top alt yang outperform BTC 30d.
    JUJUR: ini window 30d, bukan 90d standar — CoinGecko markets nggak
    kasih 90d. Window disimpan eksplisit di kolom altseason_window."""
    btc = next((c for c in coins if c["coin_id"] == "bitcoin"), None)
    if not btc or btc.get("price_change_30d") is None:
        return None
    btc_30d = btc["price_change_30d"]

    alts = [
        c for c in coins[:ALTSEASON_TOP_N]
        if c["coin_id"] != "bitcoin"
        and (c.get("symbol") or "").lower() not in ALTSEASON_EXCLUDE
        and c.get("price_change_30d") is not None
    ]
    if not alts:
        return None

    outperformed = sum(1 for c in alts if c["price_change_30d"] > btc_30d)
    return round(outperformed / len(alts) * 100, 1)


# ============================================================
# DB — active signal pairs (flag is_luxquant_signal)
# ============================================================
def get_active_signal_symbols(conn) -> set:
    """Symbol (mis. 'BTC') dari pair signal yang di-call <=7 hari.
    signals.pair = 'BTCUSDT' (TEXT), created_at = TEXT → cast timestamptz.
    Defensive: skip baris yang created_at-nya nggak valid."""
    sql = text("""
        SELECT DISTINCT
            UPPER(REPLACE(REPLACE(pair, 'USDT', ''), 'USD', '')) AS sym
        FROM signals
        WHERE pair IS NOT NULL
          AND created_at IS NOT NULL
          AND created_at ~ '^\\d{4}-\\d{2}-\\d{2}'        -- guard cast
          AND created_at::timestamptz > NOW() - make_interval(days => :days)
    """)
    rows = conn.execute(sql, {"days": ACTIVE_SIGNAL_DAYS}).fetchall()
    return {r.sym for r in rows if r.sym}


# ============================================================
# UPSERTS (idempotent — ON CONFLICT DO UPDATE)
# ============================================================
def upsert_sectors(conn, snap_at, sectors):
    sql = text("""
        INSERT INTO mf_sector_snapshots
            (snapshot_at, category_id, name, market_cap, volume_24h,
             market_cap_change_24h, top_3_coins)
        VALUES
            (:snapshot_at, :category_id, :name, :market_cap, :volume_24h,
             :market_cap_change_24h, CAST(:top_3_coins AS jsonb))
        ON CONFLICT (snapshot_at, category_id) DO UPDATE SET
            name                  = EXCLUDED.name,
            market_cap            = EXCLUDED.market_cap,
            volume_24h            = EXCLUDED.volume_24h,
            market_cap_change_24h = EXCLUDED.market_cap_change_24h,
            top_3_coins           = EXCLUDED.top_3_coins
    """)
    for s in sectors:
        conn.execute(sql, {
            "snapshot_at": snap_at,
            "category_id": s["category_id"],
            "name": s["name"],
            "market_cap": s["market_cap"],
            "volume_24h": s["volume_24h"],
            "market_cap_change_24h": s["market_cap_change_24h"],
            "top_3_coins": json.dumps(s["top_3_coins"]),
        })


def upsert_coins(conn, snap_at, coins, active_symbols):
    sql = text("""
        INSERT INTO mf_coin_snapshots
            (snapshot_at, coin_id, symbol, price, market_cap, volume_24h,
             price_change_24h, price_change_7d, price_change_30d,
             is_luxquant_signal)
        VALUES
            (:snapshot_at, :coin_id, :symbol, :price, :market_cap, :volume_24h,
             :price_change_24h, :price_change_7d, :price_change_30d,
             :is_luxquant_signal)
        ON CONFLICT (snapshot_at, coin_id) DO UPDATE SET
            symbol             = EXCLUDED.symbol,
            price              = EXCLUDED.price,
            market_cap         = EXCLUDED.market_cap,
            volume_24h         = EXCLUDED.volume_24h,
            price_change_24h   = EXCLUDED.price_change_24h,
            price_change_7d    = EXCLUDED.price_change_7d,
            price_change_30d   = EXCLUDED.price_change_30d,
            is_luxquant_signal = EXCLUDED.is_luxquant_signal
    """)
    flagged = 0
    for c in coins:
        is_lux = c["symbol"] in active_symbols
        if is_lux:
            flagged += 1
        conn.execute(sql, {
            "snapshot_at": snap_at,
            **{k: c[k] for k in (
                "coin_id", "symbol", "price", "market_cap", "volume_24h",
                "price_change_24h", "price_change_7d", "price_change_30d",
            )},
            "is_luxquant_signal": is_lux,
        })
    return flagged


def upsert_macro(conn, snap_at, macro, altseason):
    sql = text("""
        INSERT INTO mf_macro_snapshots
            (snapshot_at, btc_dominance, eth_dominance, stablecoin_dominance,
             total_market_cap, total_volume_24h, altseason_index, altseason_window)
        VALUES
            (:snapshot_at, :btc_dominance, :eth_dominance, :stablecoin_dominance,
             :total_market_cap, :total_volume_24h, :altseason_index, :altseason_window)
        ON CONFLICT (snapshot_at) DO UPDATE SET
            btc_dominance        = EXCLUDED.btc_dominance,
            eth_dominance        = EXCLUDED.eth_dominance,
            stablecoin_dominance = EXCLUDED.stablecoin_dominance,
            total_market_cap     = EXCLUDED.total_market_cap,
            total_volume_24h     = EXCLUDED.total_volume_24h,
            altseason_index      = EXCLUDED.altseason_index,
            altseason_window     = EXCLUDED.altseason_window
    """)
    conn.execute(sql, {
        "snapshot_at": snap_at,
        **macro,
        "altseason_index": altseason,
        "altseason_window": "30d",
    })


def cleanup_retention(conn):
    cutoff_sql = text(
        "DELETE FROM {tbl} WHERE snapshot_at < NOW() - make_interval(days => :days)"
    )
    for tbl in ("mf_sector_snapshots", "mf_coin_snapshots", "mf_macro_snapshots"):
        conn.execute(
            text(str(cutoff_sql).replace("{tbl}", tbl)),
            {"days": RETENTION_DAYS},
        )


# ============================================================
# ORCHESTRATOR
# ============================================================
def run_cycle():
    snap_at = boundary_4h(datetime.now(timezone.utc))
    log.info(f"Cycle start — snapshot_at={snap_at.isoformat()}")

    # Fetch (di luar transaksi DB biar koneksi DB nggak nahan lama)
    with httpx.Client(timeout=TIMEOUT) as client:
        sectors = fetch_categories(client)
        coins = fetch_coins(client)
        macro = fetch_global(client)
    altseason = compute_altseason(coins)
    log.info(f"Fetched: {len(sectors)} sectors, {len(coins)} coins, "
             f"altseason(30d)={altseason}")

    # Tulis dalam 1 transaksi (all-or-nothing per cycle)
    with engine.begin() as conn:
        active = get_active_signal_symbols(conn)
        upsert_sectors(conn, snap_at, sectors)
        flagged = upsert_coins(conn, snap_at, coins, active)
        upsert_macro(conn, snap_at, macro, altseason)
        cleanup_retention(conn)

    log.info(f"Cycle done — {flagged} coins flagged LuxQuant-active "
             f"(of {len(active)} active symbols)")


if __name__ == "__main__":
    try:
        run_cycle()
    except Exception as e:
        log.error(f"Cycle FAILED: {type(e).__name__}: {e}", exc_info=True)
        sys.exit(1)
