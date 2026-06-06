# backend/app/api/routes/public_signals.py
"""
Public Data API — Signals (akses autotrade / agent milik subscriber).

Mounted di /api/public/v1. Auth API key + rate limit dipasang di LEVEL ROUTER,
jadi SEMUA endpoint di sini otomatis butuh key & kena limit.

CUTOFF (lindungi moat):
    Cuma signal dengan created_at >= settings.PUBLIC_API_SIGNALS_FROM yang kebuka.
    Backlog historis sebelum launch tetap di balik tembok.
    Filter ini DIPAKSA di server — bukan param yang bisa dioverride user.
    created_at di DB itu TEXT, jadi dibanding pakai CAST(... AS timestamptz)
    (bukan string-compare mentah) biar beda separator/timezone nggak salah potong.

PRIVASI:
    message_link / channel_id / raw_text TIDAK pernah diekspos — itu nunjuk ke
    channel sumber Telegram. update_type dinormalisasi ke tp1..tp4/sl.

Status di-derive pakai CTE yang sama dengan web app (single source of truth).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.config import settings
from app.api.deps_public import get_api_key_user
from app.api.routes.signals import SIGNAL_OUTCOMES_CTE  # reuse, jangan duplikat logika

logger = logging.getLogger("public-api-signals")


def _cutoff() -> str:
    # Field di Settings (config.py). Fallback aman: kalau belum di-set,
    # backlog lama TETAP nggak bocor.
    return getattr(settings, "PUBLIC_API_SIGNALS_FROM", "2026-06-05T00:00:00+00:00")


# Auth + rate limit berlaku ke SEMUA route di router ini.
router = APIRouter(
    prefix="/signals",
    tags=["public-signals"],
    dependencies=[Depends(get_api_key_user)],
)

# Normalisasi event jadi machine-readable (sama persis precedence-nya dgn CTE).
_EVENT_NORMALIZE = """
    CASE
        WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 'tp4'
        WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 'tp3'
        WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 'tp2'
        WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 'tp1'
        WHEN LOWER(update_type) LIKE '%sl%'  OR LOWER(update_type) LIKE '%stop%'     THEN 'sl'
        ELSE LOWER(update_type)
    END
"""

# Mapping outcome -> status (sama dgn outcome_to_status web app).
_STATUS_CASE = """
    CASE WHEN so.outcome = 'tp4' THEN 'closed_win'
         WHEN so.outcome = 'sl'  THEN 'closed_loss'
         WHEN so.outcome IS NOT NULL THEN so.outcome
         ELSE 'open' END
"""

# Kolom signal yang aman diekspos (tanpa message_link/channel_id/raw_text).
_SIGNAL_COLS = """
    s.signal_id, s.pair, s.entry,
    s.target1, s.target2, s.target3, s.target4,
    s.stop1, s.stop2,
    s.risk_level, s.volume_rank_num, s.volume_rank_den,
    s.market_cap, s.created_at
"""

# ── Status filter (user-facing) ─────────────────────────────────────
# Nilai yang user kirim di ?status= harus salah satu ini. Sama persis
# dengan output _STATUS_CASE biar konsisten (kalau response punya
# status='closed_win', filter ?status=closed_win harus matchin).
VALID_STATUSES = ("open", "tp1", "tp2", "tp3", "closed_win", "closed_loss")

# Map status -> outcome di DB (tp4 di outcome jadi closed_win di status, dst).
_STATUS_TO_OUTCOME = {
    "tp1": "tp1",
    "tp2": "tp2",
    "tp3": "tp3",
    "closed_win": "tp4",
    "closed_loss": "sl",
    # "open" ditangani khusus -> so.outcome IS NULL
}


def _status_filter_clause(status_val: str):
    """
    Return (sql_fragment, extra_params) untuk filter status user-facing.
    Raise 400 dengan daftar valid value kalau status_val nggak dikenal —
    biar user yang nebak-nebak langsung tau apa yang valid.
    """
    if status_val not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {list(VALID_STATUSES)}",
        )
    if status_val == "open":
        return "so.outcome IS NULL", {}
    return "so.outcome = :status_outcome", {"status_outcome": _STATUS_TO_OUTCOME[status_val]}


def _sig_dict(r) -> dict:
    return {
        "signal_id": r["signal_id"],
        "pair": r["pair"],
        "status": r["status"],
        "risk_level": r["risk_level"],
        "entry": r["entry"],
        "target1": r["target1"], "target2": r["target2"],
        "target3": r["target3"], "target4": r["target4"],
        "stop1": r["stop1"], "stop2": r["stop2"],
        "market_cap": r["market_cap"],          # TEXT (mis. "1.2B") — apa adanya
        "volume_rank_num": r["volume_rank_num"],
        "volume_rank_den": r["volume_rank_den"],
        "created_at": r["created_at"],          # TEXT ISO; dipakai sbg cursor `since`
    }


# ── GET /signals — list / poll ──
@router.get("")
def list_signals(
    since: Optional[str] = Query(None, description="ISO8601 cursor — signal dibuat SETELAH ini (polling maju)"),
    pair: Optional[str] = Query(None, description="Filter pair, mis. BTCUSDT"),
    risk_level: Optional[str] = Query(None, description="Filter risk: Low / Normal / High"),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter by status: open / tp1 / tp2 / tp3 / closed_win / closed_loss",
    ),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    # Cutoff DIPAKSA, selalu ada. created_at TEXT -> CAST.
    params = {"cutoff": _cutoff(), "limit": limit}
    conds = [
        "s.created_at IS NOT NULL",
        "CAST(s.created_at AS timestamptz) >= CAST(:cutoff AS timestamptz)",
    ]
    if since:
        conds.append("CAST(s.created_at AS timestamptz) > CAST(:since AS timestamptz)")
        params["since"] = since
    if pair:
        conds.append("UPPER(s.pair) = :pair")
        params["pair"] = pair.upper()
    if risk_level:
        conds.append("s.risk_level = :risk")
        params["risk"] = risk_level
    if status_filter:
        clause, extra = _status_filter_clause(status_filter)
        conds.append(clause)
        params.update(extra)

    where = " AND ".join(conds)
    order = "ASC" if since else "DESC"   # since=maju kronologis; tanpa since=terbaru dulu

    rows = db.execute(text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT {_SIGNAL_COLS}, {_STATUS_CASE} AS status
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE {where}
        ORDER BY CAST(s.created_at AS timestamptz) {order}
        LIMIT :limit
    """), params).mappings().fetchall()

    items = [_sig_dict(r) for r in rows]
    cursor = max((it["created_at"] for it in items if it["created_at"]), default=None)
    return {"items": items, "count": len(items), "cursor": cursor}


# ── GET /signals/updates — feed event TP/SL lintas signal ──
# (didefinisikan SEBELUM /{signal_id} biar "updates" nggak ketangkep sebagai id)
@router.get("/updates")
def list_updates(
    since: Optional[str] = Query(None, description="ISO8601 cursor on update_at — event SETELAH ini"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    # Cutoff lewat signal induk (turunan ikut induk). update_at TEXT -> CAST.
    params = {"cutoff": _cutoff(), "limit": limit}
    conds = [
        "s.created_at IS NOT NULL",
        "CAST(s.created_at AS timestamptz) >= CAST(:cutoff AS timestamptz)",
        "su.update_at IS NOT NULL",
    ]
    if since:
        conds.append("CAST(su.update_at AS timestamptz) > CAST(:since AS timestamptz)")
        params["since"] = since
    where = " AND ".join(conds)

    rows = db.execute(text(f"""
        SELECT su.signal_id, s.pair, su.price, su.update_at,
               {_EVENT_NORMALIZE} AS event
        FROM signal_updates su
        JOIN signals s ON s.signal_id = su.signal_id
        WHERE {where}
        ORDER BY CAST(su.update_at AS timestamptz) ASC
        LIMIT :limit
    """), params).mappings().fetchall()

    items = [{
        "signal_id": r["signal_id"],
        "pair": r["pair"],
        "event": r["event"],          # tp1 / tp2 / tp3 / tp4 / sl
        "price": r["price"],
        "update_at": r["update_at"],
    } for r in rows]
    cursor = max((it["update_at"] for it in items if it["update_at"]), default=None)
    return {"items": items, "count": len(items), "cursor": cursor}


# ── GET /signals/{id} — detail + updates ──
@router.get("/{signal_id}")
def get_signal(signal_id: str, db: Session = Depends(get_db)):
    row = db.execute(text(f"""
        WITH {SIGNAL_OUTCOMES_CTE}
        SELECT {_SIGNAL_COLS}, {_STATUS_CASE} AS status
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE s.signal_id = :sid
          AND s.created_at IS NOT NULL
          AND CAST(s.created_at AS timestamptz) >= CAST(:cutoff AS timestamptz)
    """), {"sid": signal_id, "cutoff": _cutoff()}).mappings().fetchone()

    if row is None:
        # 404 baik signal nggak ada maupun pre-cutoff (nggak bocorin yang mana).
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found")

    urows = db.execute(text(f"""
        SELECT su.price, su.update_at, {_EVENT_NORMALIZE} AS event
        FROM signal_updates su
        WHERE su.signal_id = :sid AND su.update_at IS NOT NULL
        ORDER BY CAST(su.update_at AS timestamptz) ASC
    """), {"sid": signal_id}).mappings().fetchall()

    sig = _sig_dict(row)
    sig["updates"] = [{
        "event": u["event"],
        "price": u["price"],
        "update_at": u["update_at"],
    } for u in urows]
    return sig
