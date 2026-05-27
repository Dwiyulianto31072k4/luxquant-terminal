# backend/app/api/routes/finance.py
"""
Finance management endpoints for admin workspace.
Payment monitoring, approval, cancellation, refund tracking.
All endpoints require admin role.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, desc
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.api.deps import get_admin_user
from app.models.user import User
from app.models.subscription import Payment, SubscriptionPlan


router = APIRouter(prefix="/api/v1/workspace/finance", tags=["finance"])


# ════════════════════════════════════════════════════════════════════
# Schemas
# ════════════════════════════════════════════════════════════════════

class PaymentActionPayload(BaseModel):
    note: Optional[str] = None


class PaymentNotePayload(BaseModel):
    note: str = Field(..., min_length=1)


# ════════════════════════════════════════════════════════════════════
# Helper: serialize payment
# ════════════════════════════════════════════════════════════════════

def _serialize_payment(p: Payment, include_bscscan: bool = False) -> dict:
    """Serialize Payment object to dict. Optionally include full bscscan_data blob."""

    # Compute "stale" flag for pending payments
    is_stale = False
    age_hours = None
    if p.status == 'pending' and p.created_at:
        delta = datetime.now(timezone.utc) - p.created_at
        age_hours = round(delta.total_seconds() / 3600, 1)
        is_stale = age_hours > 24

    # Check if expired
    is_expired = False
    if p.expires_at and p.status == 'pending':
        is_expired = datetime.now(timezone.utc) > p.expires_at

    d = {
        "id": p.id,
        "user_id": p.user_id,
        "user": {
            "id": p.user.id,
            "username": p.user.username,
            "email": p.user.email,
            "role": p.user.role,
            "avatar_url": getattr(p.user, 'avatar_url', None),
        } if p.user else None,
        "plan_id": p.plan_id,
        "plan": {
            "id": p.plan.id,
            "name": p.plan.name,
            "duration_days": getattr(p.plan, 'duration_days', None),
        } if p.plan else None,
        "amount_usdt": float(p.amount_usdt or 0),
        "discount_amount": float(p.discount_amount or 0),
        "credit_redeemed": float(p.credit_redeemed or 0),
        "final_amount": float(p.final_amount or p.amount_usdt or 0),
        "status": p.status,
        "tx_hash": p.tx_hash,
        "wallet_from": p.wallet_from,
        "wallet_to": p.wallet_to,
        "network": p.network,
        "verified_at": p.verified_at,
        "expires_at": p.expires_at,
        "notes": p.notes,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        # Computed
        "is_stale": is_stale,
        "age_hours": age_hours,
        "is_expired": is_expired,
    }

    if include_bscscan:
        d["bscscan_data"] = p.bscscan_data

    return d


# ════════════════════════════════════════════════════════════════════
# STATS — Finance overview
# ════════════════════════════════════════════════════════════════════

@router.get("/stats")
def finance_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Aggregate finance stats: revenue, pending, failed, stale counts."""
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(hours=24)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Revenue: sum confirmed payments
    total_revenue = db.query(
        func.coalesce(func.sum(Payment.final_amount), 0)
    ).filter(Payment.status == 'confirmed').scalar() or 0

    revenue_this_month = db.query(
        func.coalesce(func.sum(Payment.final_amount), 0)
    ).filter(
        Payment.status == 'confirmed',
        Payment.verified_at >= month_start,
    ).scalar() or 0

    revenue_today = db.query(
        func.coalesce(func.sum(Payment.final_amount), 0)
    ).filter(
        Payment.status == 'confirmed',
        Payment.verified_at >= today_start,
    ).scalar() or 0

    # Pending
    pending_count = db.query(Payment).filter(Payment.status == 'pending').count()
    pending_value = db.query(
        func.coalesce(func.sum(Payment.final_amount), 0)
    ).filter(Payment.status == 'pending').scalar() or 0

    # Stale pending (> 24h old)
    stale_count = db.query(Payment).filter(
        Payment.status == 'pending',
        Payment.created_at < stale_cutoff,
    ).count()
    stale_value = db.query(
        func.coalesce(func.sum(Payment.final_amount), 0)
    ).filter(
        Payment.status == 'pending',
        Payment.created_at < stale_cutoff,
    ).scalar() or 0

    # Failed
    failed_count = db.query(Payment).filter(Payment.status == 'failed').count()
    failed_value = db.query(
        func.coalesce(func.sum(Payment.final_amount), 0)
    ).filter(Payment.status == 'failed').scalar() or 0

    # Cancelled
    cancelled_count = db.query(Payment).filter(Payment.status == 'cancelled').count()

    # Total payment count
    total_count = db.query(Payment).count()

    # Credit redeemed (lifetime)
    total_credit_redeemed = db.query(
        func.coalesce(func.sum(Payment.credit_redeemed), 0)
    ).filter(Payment.status == 'confirmed').scalar() or 0

    return {
        "total_revenue": float(total_revenue),
        "revenue_this_month": float(revenue_this_month),
        "revenue_today": float(revenue_today),
        "pending_count": pending_count,
        "pending_value": float(pending_value),
        "stale_count": stale_count,
        "stale_value": float(stale_value),
        "failed_count": failed_count,
        "failed_value": float(failed_value),
        "cancelled_count": cancelled_count,
        "total_count": total_count,
        "total_credit_redeemed": float(total_credit_redeemed),
    }


# ════════════════════════════════════════════════════════════════════
# LIST — payments with filter/search
# ════════════════════════════════════════════════════════════════════

@router.get("/payments")
def list_payments(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),  # username/email/tx_hash
    user_id: Optional[int] = Query(None),
    only_stale: bool = Query(False),
    sort_by: str = Query("created_at"),  # created_at | amount | verified_at
    sort_order: str = Query("desc"),     # asc | desc
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """List payments with filters + pagination."""
    q = db.query(Payment).options(
        joinedload(Payment.user),
        joinedload(Payment.plan),
    )

    # Filters
    if status:
        if status == 'stale':
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            q = q.filter(Payment.status == 'pending', Payment.created_at < cutoff)
        else:
            q = q.filter(Payment.status == status)

    if only_stale:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        q = q.filter(Payment.status == 'pending', Payment.created_at < cutoff)

    if user_id:
        q = q.filter(Payment.user_id == user_id)

    if search:
        like = f"%{search}%"
        q = q.join(Payment.user).filter(or_(
            User.username.ilike(like),
            User.email.ilike(like),
            Payment.tx_hash.ilike(like),
            Payment.wallet_from.ilike(like),
        ))

    # Sort
    sort_col_map = {
        'created_at': Payment.created_at,
        'amount': Payment.final_amount,
        'verified_at': Payment.verified_at,
    }
    sort_col = sort_col_map.get(sort_by, Payment.created_at)
    if sort_order == 'desc':
        q = q.order_by(desc(sort_col).nullslast())
    else:
        q = q.order_by(sort_col.asc().nullslast())

    total = q.count()
    total_pages = (total + page_size - 1) // page_size

    items = q.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [_serialize_payment(p) for p in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ════════════════════════════════════════════════════════════════════
# DETAIL — single payment (include bscscan_data blob)
# ════════════════════════════════════════════════════════════════════

@router.get("/payments/{payment_id}")
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    p = db.query(Payment).options(
        joinedload(Payment.user),
        joinedload(Payment.plan),
    ).filter(Payment.id == payment_id).first()

    if not p:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    return _serialize_payment(p, include_bscscan=True)


# ════════════════════════════════════════════════════════════════════
# APPROVE — pending → confirmed (manual override)
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: int,
    data: PaymentActionPayload = PaymentActionPayload(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Manually approve a pending payment.
    - Sets status='confirmed', verified_at=now
    - Grants subscription to user (inline minimal logic)
    - Adds admin note for audit trail
    """
    p = db.query(Payment).options(
        joinedload(Payment.user),
        joinedload(Payment.plan),
    ).filter(Payment.id == payment_id).first()

    if not p:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    if p.status not in ('pending',):
        raise HTTPException(
            status_code=400,
            detail=f"Hanya pending payment yang bisa di-approve. Status sekarang: {p.status}"
        )

    if not p.user:
        raise HTTPException(status_code=400, detail="User terkait tidak ditemukan")

    now = datetime.now(timezone.utc)

    # Flip status
    p.status = 'confirmed'
    p.verified_at = now

    # Append admin note
    admin_note = f"[Manual approve by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    # Grant subscription — inline logic, mirrors admin grant_subscription
    user = p.user
    plan = p.plan

    duration_days = getattr(plan, 'duration_days', None) if plan else None
    is_lifetime = (
        plan and (
            duration_days is None or
            duration_days == 0 or
            getattr(plan, 'is_lifetime', False)
        )
    )

    if is_lifetime:
        new_expires_at = None  # lifetime
    elif duration_days:
        # Extend existing subscription if still active, otherwise start fresh
        base = user.subscription_expires_at if (
            user.subscription_expires_at and user.subscription_expires_at > now
        ) else now
        new_expires_at = base + timedelta(days=duration_days)
    else:
        # Fallback — default 30 days
        new_expires_at = now + timedelta(days=30)

    user.role = 'subscriber'
    user.subscription_expires_at = new_expires_at
    user.subscription_granted_by = admin.id
    user.subscription_granted_at = now
    if hasattr(user, 'subscription_source'):
        user.subscription_source = 'admin_approve'

    db.commit()
    db.refresh(p)

    return {
        "success": True,
        "message": f"Payment #{p.id} approved. User @{user.username} subscription extended.",
        "payment": _serialize_payment(p),
    }


# ════════════════════════════════════════════════════════════════════
# MARK FAILED
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/mark-failed")
def mark_payment_failed(
    payment_id: int,
    data: PaymentActionPayload = PaymentActionPayload(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Mark a payment as failed (e.g. wrong tx_hash, invalid amount)."""
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    if p.status not in ('pending',):
        raise HTTPException(
            status_code=400,
            detail=f"Hanya pending payment yang bisa di-mark failed. Status: {p.status}"
        )

    now = datetime.now(timezone.utc)
    p.status = 'failed'

    admin_note = f"[Marked failed by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    return {
        "success": True,
        "message": f"Payment #{p.id} marked as failed",
        "payment": _serialize_payment(p),
    }


# ════════════════════════════════════════════════════════════════════
# CANCEL — pending → cancelled
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/cancel")
def cancel_payment(
    payment_id: int,
    data: PaymentActionPayload = PaymentActionPayload(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Cancel a pending payment (e.g. user request, stale > 24h)."""
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    if p.status not in ('pending',):
        raise HTTPException(
            status_code=400,
            detail=f"Hanya pending payment yang bisa di-cancel. Status: {p.status}"
        )

    now = datetime.now(timezone.utc)
    p.status = 'cancelled'

    admin_note = f"[Cancelled by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    return {
        "success": True,
        "message": f"Payment #{p.id} cancelled",
        "payment": _serialize_payment(p),
    }


# ════════════════════════════════════════════════════════════════════
# REFUND FLAG — confirmed → refunded (manual flag)
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/refund")
def refund_payment(
    payment_id: int,
    data: PaymentActionPayload = PaymentActionPayload(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Flag a confirmed payment as refunded (for audit/tracking).
    NOTE: This does NOT actually send USDT back. Refund happens manually via wallet.
    This endpoint only flags status + revokes user subscription if applicable.
    """
    p = db.query(Payment).options(
        joinedload(Payment.user),
    ).filter(Payment.id == payment_id).first()

    if not p:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    if p.status != 'confirmed':
        raise HTTPException(
            status_code=400,
            detail=f"Hanya confirmed payment yang bisa di-refund. Status: {p.status}"
        )

    now = datetime.now(timezone.utc)
    p.status = 'refunded'

    admin_note = f"[Refunded by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    else:
        admin_note += " — manual USDT refund via wallet required separately."
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    # Optionally revoke user subscription
    if p.user:
        p.user.role = 'free'
        p.user.subscription_expires_at = None

    db.commit()
    db.refresh(p)

    return {
        "success": True,
        "message": f"Payment #{p.id} flagged as refunded. Remember to actually send USDT back manually.",
        "payment": _serialize_payment(p),
    }


# ════════════════════════════════════════════════════════════════════
# ADD NOTE — append admin note (any status)
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/note")
def add_payment_note(
    payment_id: int,
    data: PaymentNotePayload,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Append an admin note to a payment (audit trail)."""
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    now = datetime.now(timezone.utc)
    note = f"[Note by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}] {data.note.strip()}"
    p.notes = f"{p.notes}\n{note}" if p.notes else note

    db.commit()
    db.refresh(p)

    return {
        "success": True,
        "message": "Note added",
        "payment": _serialize_payment(p),
    }


# ════════════════════════════════════════════════════════════════════
# BULK CANCEL STALE — convenience endpoint
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/bulk-cancel-stale")
def bulk_cancel_stale(
    hours: int = Query(24, ge=1, description="Pending payments older than X hours"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Bulk cancel all stale pending payments older than X hours."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)

    stale_payments = db.query(Payment).filter(
        Payment.status == 'pending',
        Payment.created_at < cutoff,
    ).all()

    count = len(stale_payments)
    if count == 0:
        return {"success": True, "cancelled": 0, "message": "No stale payments found"}

    admin_note = f"[Bulk cancelled by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}] Auto-cancel stale > {hours}h"

    for p in stale_payments:
        p.status = 'cancelled'
        p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()

    return {
        "success": True,
        "cancelled": count,
        "message": f"Cancelled {count} stale payment(s) older than {hours}h",
    }
