# app/api/routes/coin_watch.py
# ════════════════════════════════════════════════════════════════
# LuxQuant Terminal — Coin Watch (Waitlist) Routes
# Coin-based: user pilih KOIN yang ditunggu (beda dari watchlist yang
# signal-based). Pas koin di-call, notification_worker generate notif
# 'coin_called' (lihat generate_coin_called_notifications).
# Mirror konvensi watchlist.py: prefix, auth dep, raw SQL.
# ════════════════════════════════════════════════════════════════
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import re

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/coin-watch", tags=["Coin Watch"])

# Cap per user biar ga di-abuse
MAX_WATCH = 100
# Symbol valid setelah normalize: 2-20 char alnum + USDT
_SYMBOL_RX = re.compile(r"^[A-Z0-9]{2,20}USDT$")


def normalize_symbol(raw: str) -> str:
    """
    Normalize input koin ke format signals.pair (mis. 'BTCUSDT').
    'btc' -> 'BTCUSDT', 'btc/usdt' -> 'BTCUSDT', 'BTCUSDT' -> 'BTCUSDT'.
    """
    s = (raw or "").strip().upper().replace("/", "").replace(" ", "").replace("-", "")
    if not s:
        return s
    if not s.endswith("USDT"):
        s = s + "USDT"
    return s


# ============ Schemas ============

class CoinWatchAdd(BaseModel):
    symbol: str


class CoinWatchItem(BaseModel):
    id: int
    symbol: str
    created_at: datetime
    status: str  # 'WAITING' | 'CALLED'
    # signal terakhir yang cocok (kalau CALLED) — buat tombol "Open signal"
    signal_id: Optional[str] = None
    entry: Optional[float] = None
    risk_level: Optional[str] = None


class CoinWatchResponse(BaseModel):
    items: List[CoinWatchItem]
    total: int
    waiting: int
    called: int


# ============ Endpoints ============

@router.get("/", response_model=CoinWatchResponse)
async def get_coin_watch(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List koin yang di-watch user.
    Status per koin:
      CALLED  -> ada signal 'open' buat koin ini yang dibikin SETELAH user mulai watch
      WAITING -> belum ada
    """
    result = db.execute(
        text("""
            SELECT
                cw.id,
                cw.symbol,
                cw.created_at,
                s.signal_id,
                s.entry,
                s.risk_level
            FROM coin_watch cw
            LEFT JOIN LATERAL (
                SELECT signal_id, entry, risk_level
                FROM signals
                WHERE pair = cw.symbol
                  AND status = 'open'
                  AND created_at::timestamptz >= cw.created_at
                ORDER BY created_at::timestamptz DESC
                LIMIT 1
            ) s ON true
            WHERE cw.user_id = :user_id
            ORDER BY cw.created_at DESC
        """),
        {"user_id": current_user.id}
    )

    items = []
    waiting = called = 0
    for row in result.fetchall():
        is_called = row[3] is not None
        if is_called:
            called += 1
        else:
            waiting += 1
        items.append(CoinWatchItem(
            id=row[0],
            symbol=row[1],
            created_at=row[2],
            status="CALLED" if is_called else "WAITING",
            signal_id=row[3],
            entry=row[4],
            risk_level=row[5],
        ))

    return CoinWatchResponse(
        items=items,
        total=len(items),
        waiting=waiting,
        called=called,
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_coin_watch(
    data: CoinWatchAdd,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Tambah koin ke waitlist (input dinormalisasi ke <COIN>USDT)."""
    symbol = normalize_symbol(data.symbol)

    if not _SYMBOL_RX.match(symbol):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid symbol"
        )

    # Cek dupe
    existing = db.execute(
        text("SELECT id FROM coin_watch WHERE user_id = :user_id AND symbol = :symbol"),
        {"user_id": current_user.id, "symbol": symbol}
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coin is already in your watchlist"
        )

    # Cek cap
    count = db.execute(
        text("SELECT COUNT(*) FROM coin_watch WHERE user_id = :user_id"),
        {"user_id": current_user.id}
    ).scalar() or 0
    if count >= MAX_WATCH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_WATCH} coins in your watchlist"
        )

    db.execute(
        text("INSERT INTO coin_watch (user_id, symbol) VALUES (:user_id, :symbol)"),
        {"user_id": current_user.id, "symbol": symbol}
    )
    db.commit()

    return {"message": "Koin ditambahkan", "symbol": symbol}


@router.delete("/{symbol}")
async def remove_coin_watch(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Hapus koin dari waitlist."""
    symbol = normalize_symbol(symbol)

    result = db.execute(
        text("DELETE FROM coin_watch WHERE user_id = :user_id AND symbol = :symbol"),
        {"user_id": current_user.id, "symbol": symbol}
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coin is not in your watchlist"
        )

    return {"message": "Koin dihapus", "symbol": symbol}


@router.get("/check/{symbol}")
async def check_coin_watch(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cek apakah koin ada di waitlist user (buat toggle bintang/bell)."""
    symbol = normalize_symbol(symbol)
    result = db.execute(
        text("SELECT id FROM coin_watch WHERE user_id = :user_id AND symbol = :symbol"),
        {"user_id": current_user.id, "symbol": symbol}
    ).fetchone()
    return {"watching": result is not None, "symbol": symbol}


@router.get("/symbols")
async def get_coin_watch_symbols(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List symbol yang di-watch (buat lookup cepat di frontend)."""
    result = db.execute(
        text("SELECT symbol FROM coin_watch WHERE user_id = :user_id"),
        {"user_id": current_user.id}
    )
    return {"symbols": [row[0] for row in result.fetchall()]}


# ════════════════════════════════════════════════════════════════
# Entry pullback alerts
# ════════════════════════════════════════════════════════════════
# "This setup already ran +25% — ping me if it comes back to entry."
# Fired by notification_worker.generate_entry_pullback_notifications
# (type='entry_pullback'). One-shot: once it triggers it stays triggered.

@router.get("/entry-alert/{signal_id}")
async def get_entry_alert(
    signal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Is an entry alert armed for this signal?"""
    row = db.execute(
        text("""
            SELECT entry, tolerance_pct, triggered_at
            FROM entry_alerts WHERE user_id = :u AND signal_id = :s
        """),
        {"u": current_user.id, "s": signal_id},
    ).first()
    if not row:
        return {"armed": False, "triggered": False}
    return {
        "armed": row[2] is None,
        "triggered": row[2] is not None,
        "entry": float(row[0]) if row[0] is not None else None,
        "tolerance_pct": float(row[1]) if row[1] is not None else None,
    }


@router.post("/entry-alert/{signal_id}")
async def arm_entry_alert(
    signal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Arm an alert for when price returns to this signal's entry."""
    sig = db.execute(
        text("SELECT pair, entry FROM signals WHERE signal_id = :s"),
        {"s": signal_id},
    ).first()
    if not sig or not sig[1]:
        raise HTTPException(status_code=404, detail="Signal not found or has no entry price")

    db.execute(
        text("""
            INSERT INTO entry_alerts (user_id, signal_id, pair, entry)
            VALUES (:u, :s, :p, :e)
            ON CONFLICT (user_id, signal_id)
            DO UPDATE SET triggered_at = NULL, created_at = NOW()
        """),
        {"u": current_user.id, "s": signal_id, "p": sig[0], "e": float(sig[1])},
    )
    db.commit()
    return {"armed": True, "pair": sig[0], "entry": float(sig[1])}


@router.delete("/entry-alert/{signal_id}")
async def disarm_entry_alert(
    signal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel the entry alert."""
    db.execute(
        text("DELETE FROM entry_alerts WHERE user_id = :u AND signal_id = :s"),
        {"u": current_user.id, "s": signal_id},
    )
    db.commit()
    return {"armed": False}
