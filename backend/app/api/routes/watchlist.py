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
    # Did you actually take this call? None = not answered yet, and that is a
    # state of its own — 741 rows predate this field and none of them means
    # "skipped". Only the two answers a person can give are stored.
    taken: Optional[str] = None
    taken_at: Optional[datetime] = None


class WatchlistResponse(BaseModel):
    items: List[WatchlistItem]
    total: int


class WatchlistTaken(BaseModel):
    # None clears the answer back to "not marked" — the row stays watched.
    taken: Optional[str] = None


# ============ Endpoints ============

@router.get("/", response_model=WatchlistResponse)
def get_watchlist(
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
                w.taken,
                w.taken_at,
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
    # By name, not by position: adding two columns to the SELECT above shifted
    # every index after created_at, which is a silent way to serve entry prices
    # as risk levels.
    for row in result.fetchall():
        items.append(WatchlistItem(
            id=row.id,
            signal_id=row.signal_id,
            created_at=row.created_at,
            pair=row.pair,
            entry=row.entry,
            status=row.status,
            risk_level=row.risk_level,
            target1=row.target1,
            target2=row.target2,
            target3=row.target3,
            target4=row.target4,
            stop1=row.stop1,
            stop2=row.stop2,
            volume_rank_num=row.volume_rank_num,
            volume_rank_den=row.volume_rank_den,
            taken=row.taken,
            taken_at=row.taken_at,
        ))
    
    return WatchlistResponse(items=items, total=len(items))


@router.post("/", status_code=status.HTTP_201_CREATED)
def add_to_watchlist(
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
            detail="Signal is already in your watchlist"
        )
    
    # Check if signal exists
    signal = db.execute(
        text("SELECT signal_id FROM signals WHERE signal_id = :signal_id"),
        {"signal_id": data.signal_id}
    ).fetchone()
    
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal not found"
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

    try:
        from app.services.referral_viral import evaluate_referral_qualification
        evaluate_referral_qualification(db, current_user, commit=True)
    except Exception:
        pass
    
    return {"message": "Signal ditambahkan ke watchlist", "signal_id": data.signal_id}


@router.delete("/{signal_id}")
def remove_from_watchlist(
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
            detail="Signal is not in your watchlist"
        )
    
    return {"message": "Signal dihapus dari watchlist", "signal_id": signal_id}


@router.patch("/{signal_id}/taken")
def set_taken(
    signal_id: str,
    data: WatchlistTaken,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark whether you actually entered this call.

    'taken' / 'skipped' / null. Null is not a third opinion — it is the absence
    of one, and it is what every row created before this field looks like.

    Marking never removes the row: the journal is the point, so a call you
    skipped stays on the list precisely so it can be counted against the ones
    you took.
    """
    value = (data.taken or "").strip().lower() or None
    if value not in (None, "taken", "skipped"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="taken must be 'taken', 'skipped', or null",
        )

    result = db.execute(
        text("""
            UPDATE watchlist
               SET taken = :taken,
                   taken_at = CASE WHEN :taken IS NULL THEN NULL ELSE NOW() END
             WHERE user_id = :user_id AND signal_id = :signal_id
        """),
        {"taken": value, "user_id": current_user.id, "signal_id": signal_id},
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal is not in your watchlist",
        )

    return {"signal_id": signal_id, "taken": value}


@router.get("/check/{signal_id}")
def check_in_watchlist(
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
def get_watchlist_ids(
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