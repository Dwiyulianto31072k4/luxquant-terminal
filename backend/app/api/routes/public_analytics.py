# backend/app/api/routes/public_analytics.py
"""
Public Analytics API — coin-intel / daily-winrate / performance dashboard.

Mounted di /api/public/v1. Auth API key + rate limit di LEVEL ROUTER (sama
persis seperti public_data.py — semua endpoint butuh key & kena limit).
Semua handler RE-USE fungsi web app yang sudah ada → single source of truth,
anti-drift (tidak menduplikasi query/logic).

CATATAN MOAT (PENTING):
    Analytics di file ini = data agregat yang SUDAH tampil di halaman publik
    LuxQuant untuk transparansi marketing. Jadi TIDAK kena cutoff per-signal
    (PUBLIC_API_SIGNALS_FROM) — full-history, identik dengan web.
    Cutoff per-signal tetap berlaku HANYA untuk data turunan-signal di
    public_data.py (journey / enrichment / btc-correlation).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.api.deps_public import get_api_key_user

# ── Re-use handler web app (jangan duplikat logika/SQL) ──
# Dipanggil sebagai fungsi biasa (bukan via FastAPI), jadi Depends bawaan
# masing-masing handler TIDAK ikut jalan — auth/role sudah di-handle
# get_api_key_user di level router ini.
from app.api.routes.signals import get_coin_intel
from app.api.routes.analytics import get_daily_winrate
from app.api.routes.daily_dashboard import get_daily_dashboard

logger = logging.getLogger("public-api-analytics")

# Auth + rate limit berlaku ke SEMUA route di router ini.
router = APIRouter(
    tags=["public-analytics"],
    dependencies=[Depends(get_api_key_user)],
)


# ════════════════════════════════════════════════════════════
# COIN-INTEL — WR / streak / risk per-coin (regime-aware)
# Full-history. Re-use cache internal (lq:signals:coin-intel, ttl 120s).
# ════════════════════════════════════════════════════════════
@router.get("/analytics/coin-intel")
async def public_coin_intel(user: User = Depends(get_api_key_user)):
    # get_coin_intel() membuka SessionLocal sendiri + cache sendiri.
    # Param current_user hanya gate di web; di sini sudah di-gate oleh
    # get_api_key_user, jadi kita teruskan user yang sudah terautentikasi.
    # Depends(get_api_key_user) di-cache per-request (sama dengan router-level),
    # jadi auth + rate-limit tetap dihitung SEKALI, bukan dobel.
    return await get_coin_intel(current_user=user)


# ════════════════════════════════════════════════════════════
# DAILY WIN-RATE — trend WR harian/mingguan (chart time-series)
# ════════════════════════════════════════════════════════════
@router.get("/analytics/daily-winrate")
async def public_daily_winrate(
    time_range: str = Query("all", description="Time range: all, ytd, mtd, 30d, 7d"),
    period: str = Query("daily", description="Aggregation period: daily, weekly"),
    db: Session = Depends(get_db),
):
    return await get_daily_winrate(time_range=time_range, period=period, db=db)


# ════════════════════════════════════════════════════════════
# PERFORMANCE DASHBOARD — daily perf + 14-day trend (bundled)
# ════════════════════════════════════════════════════════════
@router.get("/analytics/dashboard")
async def public_dashboard(
    date: Optional[str] = Query(None, description="YYYY-MM-DD UTC. Default = today UTC"),
    db: Session = Depends(get_db),
):
    return await get_daily_dashboard(date=date, db=db)
