# backend/app/api/routes/admin_cashout.py
"""
Admin Cashout Management — Layer 8

Standalone router untuk admin manage cashout requests dari user.
Separated from admin.py supaya:
  - Concerns terpisah (subscription mgmt vs cashout mgmt)
  - Easy to disable/refactor Layer 8 tanpa touch admin.py
  - Cleaner test surface

Endpoints (all under /admin/cashouts):
  GET    /admin/cashouts                     List all (paginated, status filter)
  GET    /admin/cashouts/pending             Pending only (FIFO oldest-first)
  GET    /admin/cashouts/stats               Dashboard stats per status
  GET    /admin/cashouts/{id}                Single detail with user info
  POST   /admin/cashouts/{id}/approve        pending → approved (informational)
  POST   /admin/cashouts/{id}/complete       pending|approved → completed + tx_hash
  POST   /admin/cashouts/{id}/reject         pending|approved → rejected + auto refund

Auth: all endpoints require admin role via get_admin_user dependency.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.cashout import (
    CashoutRequest,
    STATUS_PENDING,
    STATUS_APPROVED,
    STATUS_COMPLETED,
    STATUS_REJECTED,
    STATUS_CANCELLED,
)
from app.schemas.cashout import (
    CashoutApprovePayload,
    CashoutCompletePayload,
    CashoutRejectPayload,
)
from app.services.cashout_service import (
    admin_approve_cashout,
    admin_complete_cashout,
    admin_reject_cashout,
    get_all_cashouts,
    get_pending_cashouts,
    _get_cashout_for_admin,
)
from app.api.deps import get_admin_user

router = APIRouter(prefix="/admin", tags=["Admin Cashout"])


# ════════════════════════════════════════════════════════════════════
# HELPER: build admin response with embedded user info
# ════════════════════════════════════════════════════════════════════

def _cashout_with_user(cashout: CashoutRequest, db: Session) -> dict:
    """Build admin response with user summary + reviewer info."""
    user = db.query(User).filter(User.id == cashout.user_id).first()
    reviewed_by = None
    if cashout.reviewed_by_admin_id:
        reviewed_by = db.query(User).filter(
            User.id == cashout.reviewed_by_admin_id
        ).first()

    return {
        "id": cashout.id,
        "amount_usdt": float(cashout.amount_usdt),
        "method": cashout.method,
        "destination_telegram": cashout.destination_telegram,
        "destination_note": cashout.destination_note,
        "status": cashout.status,
        "admin_note": cashout.admin_note,
        "tx_hash": cashout.tx_hash,
        "requested_at": cashout.requested_at.isoformat() if cashout.requested_at else None,
        "reviewed_at": cashout.reviewed_at.isoformat() if cashout.reviewed_at else None,
        "completed_at": cashout.completed_at.isoformat() if cashout.completed_at else None,
        "user": {
            "id": user.id if user else None,
            "username": user.username if user else None,
            "email": user.email if user else None,
            "telegram_username": getattr(user, "telegram_username", None) if user else None,
            "referral_credit_usdt": float(user.referral_credit_usdt or 0) if user else 0,
            "lifetime_credit_earned": float(user.lifetime_credit_earned or 0) if user else 0,
        },
        "reviewed_by": {
            "id": reviewed_by.id,
            "username": reviewed_by.username,
        } if reviewed_by else None,
    }


# ════════════════════════════════════════════════════════════════════
# 1. LIST ALL CASHOUTS
# ════════════════════════════════════════════════════════════════════

@router.get("/cashouts")
async def admin_list_cashouts(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter: pending, approved, completed, rejected, cancelled",
    ),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    List all cashout requests with optional status filter + pagination.

    Stats always reflect ALL cashouts regardless of filter.
    """
    items, stats = get_all_cashouts(
        db=db,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )

    return {
        "items": [_cashout_with_user(c, db) for c in items],
        "stats": stats,
        "limit": limit,
        "offset": offset,
        "filter": status_filter,
    }


# ════════════════════════════════════════════════════════════════════
# 2. PENDING QUEUE (FIFO)
# ════════════════════════════════════════════════════════════════════

@router.get("/cashouts/pending")
async def admin_pending_cashouts(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    """Pending cashout requests, oldest first (FIFO processing queue)."""
    items = get_pending_cashouts(db, limit=limit)

    return {
        "items": [_cashout_with_user(c, db) for c in items],
        "total": len(items),
    }


# ════════════════════════════════════════════════════════════════════
# 3. DASHBOARD STATS
# ════════════════════════════════════════════════════════════════════

@router.get("/cashouts/stats")
async def admin_cashout_stats(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Dashboard stats: counts per status + total amounts.

    Useful for admin overview panel:
      - How many pending requests need action
      - Total $ in active state (pending + approved)
      - Total $ already paid out (completed)
    """
    counts = {}
    for status_val in [
        STATUS_PENDING,
        STATUS_APPROVED,
        STATUS_COMPLETED,
        STATUS_REJECTED,
        STATUS_CANCELLED,
    ]:
        counts[status_val] = db.query(CashoutRequest).filter(
            CashoutRequest.status == status_val
        ).count()

    total_active_amount = db.query(
        sa_func.coalesce(sa_func.sum(CashoutRequest.amount_usdt), 0)
    ).filter(
        CashoutRequest.status.in_([STATUS_PENDING, STATUS_APPROVED])
    ).scalar()

    total_completed_amount = db.query(
        sa_func.coalesce(sa_func.sum(CashoutRequest.amount_usdt), 0)
    ).filter(
        CashoutRequest.status == STATUS_COMPLETED
    ).scalar()

    return {
        "counts": counts,
        "total_active_amount_usdt": float(total_active_amount or 0),
        "total_completed_amount_usdt": float(total_completed_amount or 0),
        "total_all": sum(counts.values()),
    }


# ════════════════════════════════════════════════════════════════════
# 4. SINGLE DETAIL
# ════════════════════════════════════════════════════════════════════

@router.get("/cashouts/{cashout_id}")
async def admin_get_cashout(
    cashout_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Get single cashout request with full user info."""
    cashout = _get_cashout_for_admin(cashout_id, db)
    return _cashout_with_user(cashout, db)


# ════════════════════════════════════════════════════════════════════
# 5. APPROVE (pending → approved)
# ════════════════════════════════════════════════════════════════════

@router.post("/cashouts/{cashout_id}/approve")
async def admin_approve_cashout_endpoint(
    cashout_id: int,
    payload: CashoutApprovePayload,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Approve pending cashout (informational, no balance change).

    Status: pending → approved.
    Signals to user: 'admin sedang proses, akan kirim soon'.
    Use this when admin acknowledged the request but hasn't sent fund yet.
    """
    cashout = admin_approve_cashout(
        cashout_id=cashout_id,
        admin_user=admin,
        admin_note=payload.admin_note,
        db=db,
    )

    return {
        "success": True,
        "cashout": _cashout_with_user(cashout, db),
        "message": f"Cashout #{cashout.id} approved",
    }


# ════════════════════════════════════════════════════════════════════
# 6. COMPLETE (funds sent)
# ════════════════════════════════════════════════════════════════════

@router.post("/cashouts/{cashout_id}/complete")
async def admin_complete_cashout_endpoint(
    cashout_id: int,
    payload: CashoutCompletePayload,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Mark cashout as completed (admin has sent the funds).

    Status: pending|approved → completed.
    No balance change (already deducted at submit time).
    Creates audit ledger entry (type='cashout_completed', amount=0).

    tx_hash optional (use kalau ada bukti on-chain).
    """
    cashout = admin_complete_cashout(
        cashout_id=cashout_id,
        admin_user=admin,
        tx_hash=payload.tx_hash,
        admin_note=payload.admin_note,
        db=db,
    )

    return {
        "success": True,
        "cashout": _cashout_with_user(cashout, db),
        "message": f"Cashout #{cashout.id} completed",
    }


# ════════════════════════════════════════════════════════════════════
# 7. REJECT (refund balance)
# ════════════════════════════════════════════════════════════════════

@router.post("/cashouts/{cashout_id}/reject")
async def admin_reject_cashout_endpoint(
    cashout_id: int,
    payload: CashoutRejectPayload,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Reject cashout. Balance auto-refunded to user via ledger entry.

    Status: pending|approved → rejected.
    admin_note REQUIRED (reason for rejection, surfaced to user).
    """
    cashout = admin_reject_cashout(
        cashout_id=cashout_id,
        admin_user=admin,
        admin_note=payload.admin_note,
        db=db,
    )

    return {
        "success": True,
        "cashout": _cashout_with_user(cashout, db),
        "message": f"Cashout #{cashout.id} rejected, balance refunded",
    }
