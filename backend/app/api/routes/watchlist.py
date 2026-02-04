# app/api/routes/watchlist.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/watchlist", tags=["Watchlist"])


# ============ Schemas ============

class WatchlistAdd(BaseModel):
    signal_id: str


class WatchlistItem(BaseModel):
    id: int
    signal_id: str
    created_at: datetime
    # Signal details (joined)
    pair: Optional[str] = None
    entry: Optional[float] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    # Target & Stop Loss - ADDED
    target1: Optional[float] = None
    target2: Optional[float] = None
    target3: Optional[float] = None
    target4: Optional[float] = None
    stop1: Optional[float] = None
    stop2: Optional[float] = None
    # Volume Rank - ADDED
    volume_rank_num: Optional[int] = None
    volume_rank_den: Optional[int] = None


class WatchlistResponse(BaseModel):
    items: List[WatchlistItem]
    total: int


# ============ Endpoints ============

@router.get("/", response_model=WatchlistResponse)
async def get_watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's watchlist with full signal details"""
    
    result = db.execute(
        text("""
            SELECT 
                w.id,
                w.signal_id,
                w.created_at,
                s.pair,
                s.entry,
                s.status,
                s.risk_level,
                s.target1,
                s.target2,
                s.target3,
                s.target4,
                s.stop1,
                s.stop2,
                s.volume_rank_num,
                s.volume_rank_den
            FROM watchlist w
            LEFT JOIN signals s ON w.signal_id = s.signal_id
            WHERE w.user_id = :user_id
            ORDER BY w.created_at DESC
        """),
        {"user_id": current_user.id}
    )
    
    items = []
    for row in result.fetchall():
        items.append(WatchlistItem(
            id=row[0],
            signal_id=row[1],
            created_at=row[2],
            pair=row[3],
            entry=row[4],
            status=row[5],
            risk_level=row[6],
            target1=row[7],
            target2=row[8],
            target3=row[9],
            target4=row[10],
            stop1=row[11],
            stop2=row[12],
            volume_rank_num=row[13],
            volume_rank_den=row[14]
        ))
    
    return WatchlistResponse(items=items, total=len(items))


@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    data: WatchlistAdd,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add signal to watchlist"""
    
    # Check if already in watchlist
    existing = db.execute(
        text("SELECT id FROM watchlist WHERE user_id = :user_id AND signal_id = :signal_id"),
        {"user_id": current_user.id, "signal_id": data.signal_id}
    ).fetchone()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signal sudah ada di watchlist"
        )
    
    # Check if signal exists
    signal = db.execute(
        text("SELECT signal_id FROM signals WHERE signal_id = :signal_id"),
        {"signal_id": data.signal_id}
    ).fetchone()
    
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal tidak ditemukan"
        )
    
    # Add to watchlist
    db.execute(
        text("""
            INSERT INTO watchlist (user_id, signal_id)
            VALUES (:user_id, :signal_id)
        """),
        {"user_id": current_user.id, "signal_id": data.signal_id}
    )
    db.commit()
    
    return {"message": "Signal ditambahkan ke watchlist", "signal_id": data.signal_id}


@router.delete("/{signal_id}")
async def remove_from_watchlist(
    signal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove signal from watchlist"""
    
    result = db.execute(
        text("DELETE FROM watchlist WHERE user_id = :user_id AND signal_id = :signal_id"),
        {"user_id": current_user.id, "signal_id": signal_id}
    )
    db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal tidak ada di watchlist"
        )
    
    return {"message": "Signal dihapus dari watchlist", "signal_id": signal_id}


@router.get("/check/{signal_id}")
async def check_in_watchlist(
    signal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if signal is in user's watchlist"""
    
    result = db.execute(
        text("SELECT id FROM watchlist WHERE user_id = :user_id AND signal_id = :signal_id"),
        {"user_id": current_user.id, "signal_id": signal_id}
    ).fetchone()
    
    return {"in_watchlist": result is not None, "signal_id": signal_id}


@router.get("/ids")
async def get_watchlist_ids(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of signal IDs in user's watchlist (for quick lookup)"""
    
    result = db.execute(
        text("SELECT signal_id FROM watchlist WHERE user_id = :user_id"),
        {"user_id": current_user.id}
    )
    
    ids = [row[0] for row in result.fetchall()]
    
    return {"signal_ids": ids}