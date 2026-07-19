"""
LuxQuant Terminal - Money Flow Router (Step 3b)
===============================================
Endpoint /api/v1/money-flow/* — ngerakit 3 layer:
  - /sectors : ranking sektor + delta 24h/7d/30d (mf_sector_snapshots)
  - /macro   : dominance + altseason (mf_macro_snapshots)
  - /coins   : flow intensity + flag LuxQuant (mf_coin_snapshots)
  - /dex     : live DEX buy/sell pressure (GeckoTerminal, fakta)
  - /overview: gabungan ringkas buat initial page load

Prinsip "inform, don't decide":
  Semua "tag" DESKRIPTIF & transparan — turunan langsung dari angka.
  Mis. buys_24h > sells_24h → tag "net_buying" (fakta), BUKAN "bullish".
  User yang nyimpulin.

Auth: require_subscription di router-level (admin + premium/subscriber).
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_subscription
from app.services.gecko_dex_service import get_dex_trending
from app.services.gecko_category_service import get_category_coins

# Auth nempel ke SEMUA endpoint di router ini.
router = APIRouter(
    prefix="/money-flow",
    tags=["Money Flow"],
    dependencies=[Depends(require_subscription)],
)


# ════════════════════════════════════════════
# Snapshot lookup helpers
# ════════════════════════════════════════════
def _latest_snapshot_at(db: Session, table: str):
    row = db.execute(text(f"SELECT MAX(snapshot_at) AS m FROM {table}")).fetchone()
    return row.m if row and row.m else None


def _nearest_snapshot_at(db: Session, table: str, days_ago: int):
    """snapshot_at terdekat ke (now - days_ago). Toleransi +6h (boundary 4h
    + buffer) biar delta nggak NULL gara-gara geser dikit."""
    sql = text(f"""
        SELECT snapshot_at FROM {table}
        WHERE snapshot_at <= NOW() - make_interval(days => :d) + INTERVAL '6 hours'
        ORDER BY snapshot_at DESC
        LIMIT 1
    """)
    row = db.execute(sql, {"d": days_ago}).fetchone()
    return row.snapshot_at if row else None


def _pct_change(now_val, then_val):
    """Delta % antar dua snapshot. None kalau salah satu nggak ada/0."""
    if now_val is None or then_val is None or then_val == 0:
        return None
    return round((now_val - then_val) / then_val * 100, 2)


# ════════════════════════════════════════════
# 1. SECTORS — ranking + delta multi-TF
# ════════════════════════════════════════════
@router.get("/sectors")
def money_flow_sectors(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Ranking sektor: market cap & volume + delta 24h/7d/30d.
    24h diambil dari field CoinGecko langsung; 7d/30d dari beda snapshot."""
    latest = _latest_snapshot_at(db, "mf_sector_snapshots")
    if latest is None:
        return {"sectors": [], "note": "no snapshot yet — worker belum jalan"}

    at_7d = _nearest_snapshot_at(db, "mf_sector_snapshots", 7)
    at_30d = _nearest_snapshot_at(db, "mf_sector_snapshots", 30)

    # Ambil snapshot terbaru
    now_rows = db.execute(text("""
        SELECT category_id, name, market_cap, volume_24h,
               market_cap_change_24h, top_3_coins
        FROM mf_sector_snapshots
        WHERE snapshot_at = :at
    """), {"at": latest}).fetchall()

    # Map historis buat delta
    def _hist(at):
        if at is None:
            return {}
        rows = db.execute(text("""
            SELECT category_id, market_cap, volume_24h
            FROM mf_sector_snapshots WHERE snapshot_at = :at
        """), {"at": at}).fetchall()
        return {r.category_id: r for r in rows}

    hist_7d = _hist(at_7d)
    hist_30d = _hist(at_30d)

    sectors = []
    for r in now_rows:
        h7 = hist_7d.get(r.category_id)
        h30 = hist_30d.get(r.category_id)
        mcap = float(r.market_cap) if r.market_cap is not None else None
        vol = float(r.volume_24h) if r.volume_24h is not None else None

        sectors.append({
            "category_id": r.category_id,
            "name": r.name,
            "market_cap": mcap,
            "volume_24h": vol,
            "top_3_coins": r.top_3_coins,
            "mcap_change_24h": float(r.market_cap_change_24h) if r.market_cap_change_24h is not None else None,
            "mcap_change_7d": _pct_change(mcap, float(h7.market_cap) if h7 and h7.market_cap is not None else None),
            "mcap_change_30d": _pct_change(mcap, float(h30.market_cap) if h30 and h30.market_cap is not None else None),
            "vol_change_7d": _pct_change(vol, float(h7.volume_24h) if h7 and h7.volume_24h is not None else None),
        })

    # Ranking default: Δmcap 24h desc (rotasi modal masuk)
    sectors.sort(key=lambda s: (s["mcap_change_24h"] is not None, s["mcap_change_24h"] or -1e9), reverse=True)

    return {
        "sectors": sectors[:limit],
        "snapshot_at": latest.isoformat(),
        "has_7d": at_7d is not None,
        "has_30d": at_30d is not None,
    }


# ════════════════════════════════════════════
# 1b. SECTOR → COINS drill-down (klik satu naratif)
# ════════════════════════════════════════════
@router.get("/sectors/{category_id}/coins")
async def money_flow_sector_coins(
    category_id: str,
    limit: int = Query(100, ge=1, le=250),
    db: Session = Depends(get_db),
):
    """Semua koin dalam satu kategori/naratif (CoinGecko), diurut market
    cap desc. Koin yang lagi di-call LuxQuant ditandai `is_luxquant_signal`
    (dari snapshot terbaru) — biar user bisa loncat ke signal-nya."""
    data = await get_category_coins(category_id, limit=limit)
    coins = data.get("coins", [])

    # Tandai koin yang lagi di-call LuxQuant (match by symbol).
    if coins:
        latest = _latest_snapshot_at(db, "mf_coin_snapshots")
        lux_symbols = set()
        if latest is not None:
            rows = db.execute(text("""
                SELECT UPPER(symbol) AS s
                FROM mf_coin_snapshots
                WHERE snapshot_at = :at AND is_luxquant_signal = TRUE
            """), {"at": latest}).fetchall()
            lux_symbols = {r.s for r in rows if r.s}
        for c in coins:
            c["is_luxquant_signal"] = (c.get("symbol") or "").upper() in lux_symbols

    return data


# ════════════════════════════════════════════
# 2. MACRO — dominance + altseason gauge
# ════════════════════════════════════════════
@router.get("/macro")
def money_flow_macro(db: Session = Depends(get_db)):
    """BTC/ETH/stablecoin dominance + altseason index (window 30d).
    Plus delta dominance 7d biar keliatan arah rotasi."""
    latest = _latest_snapshot_at(db, "mf_macro_snapshots")
    if latest is None:
        return {"note": "no snapshot yet — worker belum jalan"}

    now = db.execute(text("""
        SELECT btc_dominance, eth_dominance, stablecoin_dominance,
               total_market_cap, total_volume_24h, altseason_index, altseason_window
        FROM mf_macro_snapshots WHERE snapshot_at = :at
    """), {"at": latest}).fetchone()

    at_7d = _nearest_snapshot_at(db, "mf_macro_snapshots", 7)
    then = None
    if at_7d:
        then = db.execute(text("""
            SELECT btc_dominance, stablecoin_dominance
            FROM mf_macro_snapshots WHERE snapshot_at = :at
        """), {"at": at_7d}).fetchone()

    def _f(v):
        return float(v) if v is not None else None

    return {
        "btc_dominance": _f(now.btc_dominance),
        "eth_dominance": _f(now.eth_dominance),
        "stablecoin_dominance": _f(now.stablecoin_dominance),
        "total_market_cap": _f(now.total_market_cap),
        "total_volume_24h": _f(now.total_volume_24h),
        "altseason_index": _f(now.altseason_index),
        "altseason_window": now.altseason_window,
        # delta arah (poin persentase, bukan %)
        "btc_dominance_change_7d": round(_f(now.btc_dominance) - _f(then.btc_dominance), 2) if then and then.btc_dominance is not None else None,
        "stablecoin_dominance_change_7d": round(_f(now.stablecoin_dominance) - _f(then.stablecoin_dominance), 2) if then and then.stablecoin_dominance is not None else None,
        "snapshot_at": latest.isoformat(),
    }


# ════════════════════════════════════════════
# 3. COINS — flow intensity + LuxQuant flag
# ════════════════════════════════════════════
@router.get("/coins")
def money_flow_coins(
    limit: int = Query(30, ge=1, le=100),
    luxquant_only: bool = Query(False, description="Cuma koin yang lagi di-call LuxQuant"),
    db: Session = Depends(get_db),
):
    """Flow intensity per koin = volume_24h / market_cap (proxy seberapa
    aktif duit muter relatif ukuran). Plus Δvolume 7d & flag LuxQuant.
    Tag DESKRIPTIF: high/elevated/normal turnover — bukan rekomendasi."""
    latest = _latest_snapshot_at(db, "mf_coin_snapshots")
    if latest is None:
        return {"coins": [], "note": "no snapshot yet — worker belum jalan"}

    at_7d = _nearest_snapshot_at(db, "mf_coin_snapshots", 7)

    where_lux = "AND is_luxquant_signal = TRUE" if luxquant_only else ""
    now_rows = db.execute(text(f"""
        SELECT coin_id, symbol, price, market_cap, volume_24h,
               price_change_24h, price_change_7d, price_change_30d, is_luxquant_signal
        FROM mf_coin_snapshots
        WHERE snapshot_at = :at {where_lux}
    """), {"at": latest}).fetchall()

    hist_7d = {}
    if at_7d:
        for r in db.execute(text("""
            SELECT coin_id, volume_24h FROM mf_coin_snapshots WHERE snapshot_at = :at
        """), {"at": at_7d}).fetchall():
            hist_7d[r.coin_id] = float(r.volume_24h) if r.volume_24h is not None else None

    coins = []
    for r in now_rows:
        mcap = float(r.market_cap) if r.market_cap is not None else None
        vol = float(r.volume_24h) if r.volume_24h is not None else None
        intensity = round(vol / mcap, 4) if (mcap and vol) else None

        # Tag deskriptif turnover (fakta dari rasio, bukan judgment)
        if intensity is None:
            turnover_tag = None
        elif intensity >= 0.30:
            turnover_tag = "high_turnover"      # volume >=30% mcap/hari
        elif intensity >= 0.10:
            turnover_tag = "elevated_turnover"
        else:
            turnover_tag = "normal_turnover"

        coins.append({
            "coin_id": r.coin_id,
            "symbol": r.symbol,
            "price": float(r.price) if r.price is not None else None,
            "market_cap": mcap,
            "volume_24h": vol,
            "flow_intensity": intensity,           # vol/mcap
            "turnover_tag": turnover_tag,
            "vol_change_7d": _pct_change(vol, hist_7d.get(r.coin_id)),
            "price_change_24h": float(r.price_change_24h) if r.price_change_24h is not None else None,
            "price_change_7d": float(r.price_change_7d) if r.price_change_7d is not None else None,
            "price_change_30d": float(r.price_change_30d) if r.price_change_30d is not None else None,
            "is_luxquant_signal": r.is_luxquant_signal,
        })

    # Ranking: flow intensity desc (duit paling aktif muter di atas)
    coins.sort(key=lambda c: (c["flow_intensity"] is not None, c["flow_intensity"] or -1), reverse=True)

    return {
        "coins": coins[:limit],
        "snapshot_at": latest.isoformat(),
        "luxquant_only": luxquant_only,
        "has_7d": at_7d is not None,
    }


# ════════════════════════════════════════════
# 4. DEX — live buy/sell pressure (GeckoTerminal)
# ════════════════════════════════════════════
@router.get("/dex")
async def money_flow_dex():
    """Trending DEX pools + buy/sell pressure (fakta on-chain, live).
    Inti buat alt/meme yang nggak ke-cover whale BTC/ETH.
    Tag 'net_buying'/'net_selling' = turunan transparan dari buys vs sells."""
    data = await get_dex_trending()

    # Tambah tag deskriptif per pool (turunan dari angka, bukan judgment)
    for p in data.get("pools", []):
        b24 = p.get("buys_24h", 0)
        s24 = p.get("sells_24h", 0)
        if b24 == 0 and s24 == 0:
            p["flow_tag"] = None
        elif b24 > s24:
            p["flow_tag"] = "net_buying"      # lebih banyak transaksi beli
        elif s24 > b24:
            p["flow_tag"] = "net_selling"
        else:
            p["flow_tag"] = "balanced"
    return data


# ════════════════════════════════════════════
# 5. OVERVIEW — gabungan ringkas (1 call buat page load)
# ════════════════════════════════════════════
@router.get("/overview")
async def money_flow_overview(db: Session = Depends(get_db)):
    """Ringkasan buat initial render: top sektor, macro, top flow coins.
    DEX di-fetch terpisah dari frontend (biar nggak nahan initial load)."""
    sectors = await money_flow_sectors(limit=8, db=db)
    macro = await money_flow_macro(db=db)
    coins = await money_flow_coins(limit=10, db=db)
    return {
        "sectors": sectors.get("sectors", []),
        "macro": macro,
        "top_flow_coins": coins.get("coins", []),
        "snapshot_at": sectors.get("snapshot_at"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
