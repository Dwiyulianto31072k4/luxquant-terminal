# backend/app/api/routes/finance.py
"""
Finance management endpoints for admin workspace.
v2: Uses explicit JOIN + manual hydration, no SQLAlchemy relationship() needed.
v3: Adds wallet exchange labeling (Binance/Indodax/etc) for wallet_to via
    receiving_wallets pool, plus filter-by-exchange and exchanges endpoint.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.api.deps import get_admin_user
from app.models.user import User
from app.models.subscription import Payment, SubscriptionPlan
from app.models.wallet import ReceivingWallet


router = APIRouter(prefix="/api/v1/workspace/finance", tags=["finance"])


# ════════════════════════════════════════════════════════════════════
# Schemas
# ════════════════════════════════════════════════════════════════════

class PaymentActionPayload(BaseModel):
    note: Optional[str] = None


class PaymentNotePayload(BaseModel):
    note: str = Field(..., min_length=1)


# ════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════

def _serialize_row(payment, user, plan, include_bscscan=False, wallet_map=None):
    """
    Serialize a Payment row to dict.

    wallet_map: optional dict { address: { exchange_name, label } } from the
    receiving_wallets pool. If provided and payment.wallet_to matches, the
    response will include wallet_to_exchange + wallet_to_label.
    """
    is_stale = False
    age_hours = None
    if payment.status == 'pending' and payment.created_at:
        delta = datetime.now(timezone.utc) - payment.created_at
        age_hours = round(delta.total_seconds() / 3600, 1)
        is_stale = age_hours > 24

    is_expired = False
    if payment.expires_at and payment.status == 'pending':
        is_expired = datetime.now(timezone.utc) > payment.expires_at

    user_dict = None
    if user:
        user_dict = {
            "id": user.id,
            "username": getattr(user, 'username', None),
            "email": getattr(user, 'email', None),
            "role": getattr(user, 'role', None),
            "avatar_url": getattr(user, 'avatar_url', None),
        }

    plan_dict = None
    if plan:
        plan_dict = {
            "id": plan.id,
            "name": getattr(plan, 'name', None),
            "duration_days": getattr(plan, 'duration_days', None),
        }

    # Resolve wallet_to → exchange info (if address is in our pool)
    wallet_info = (wallet_map or {}).get(payment.wallet_to) if payment.wallet_to else None
    wallet_to_exchange = wallet_info.get("exchange_name") if wallet_info else None
    wallet_to_label = wallet_info.get("label") if wallet_info else None

    d = {
        "id": payment.id,
        "user_id": payment.user_id,
        "user": user_dict,
        "plan_id": payment.plan_id,
        "plan": plan_dict,
        "amount_usdt": float(payment.amount_usdt or 0),
        "discount_amount": float(payment.discount_amount or 0),
        "credit_redeemed": float(payment.credit_redeemed or 0),
        "final_amount": float(payment.final_amount or payment.amount_usdt or 0),
        "status": payment.status,
        "tx_hash": payment.tx_hash,
        "wallet_from": payment.wallet_from,
        "wallet_to": payment.wallet_to,
        "wallet_to_exchange": wallet_to_exchange,
        "wallet_to_label": wallet_to_label,
        "network": payment.network,
        "verified_at": payment.verified_at,
        "expires_at": payment.expires_at,
        "notes": payment.notes,
        "created_at": payment.created_at,
        "updated_at": payment.updated_at,
        "is_stale": is_stale,
        "age_hours": age_hours,
        "is_expired": is_expired,
    }

    if include_bscscan:
        d["bscscan_data"] = payment.bscscan_data

    return d


def _build_wallet_map(db: Session, addresses: list) -> dict:
    """
    Build address -> { exchange_name, label } map from receiving_wallets.
    Used to hydrate wallet_to with exchange info.
    """
    if not addresses:
        return {}
    rows = db.query(ReceivingWallet).filter(
        ReceivingWallet.address.in_(addresses)
    ).all()
    return {
        w.address: {"exchange_name": w.exchange_name, "label": w.label}
        for w in rows
    }


def _hydrate(db: Session, payments: list) -> list:
    if not payments:
        return []
    user_ids = list({p.user_id for p in payments if p.user_id is not None})
    plan_ids = list({p.plan_id for p in payments if p.plan_id is not None})
    wallet_addrs = list({p.wallet_to for p in payments if p.wallet_to})

    users_map = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        users_map = {u.id: u for u in users}

    plans_map = {}
    if plan_ids:
        plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.id.in_(plan_ids)).all()
        plans_map = {p.id: p for p in plans}

    wallet_map = _build_wallet_map(db, wallet_addrs)

    return [
        _serialize_row(
            p,
            users_map.get(p.user_id),
            plans_map.get(p.plan_id),
            wallet_map=wallet_map,
        )
        for p in payments
    ]


# ════════════════════════════════════════════════════════════════════
# STATS
# ════════════════════════════════════════════════════════════════════

@router.get("/stats")
def finance_stats(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(hours=24)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_revenue = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed').scalar() or 0
    revenue_this_month = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', Payment.verified_at >= month_start).scalar() or 0
    revenue_today = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', Payment.verified_at >= today_start).scalar() or 0
    pending_count = db.query(Payment).filter(Payment.status == 'pending').count()
    pending_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending').scalar() or 0
    stale_count = db.query(Payment).filter(Payment.status == 'pending', Payment.created_at < stale_cutoff).count()
    stale_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending', Payment.created_at < stale_cutoff).scalar() or 0
    failed_count = db.query(Payment).filter(Payment.status == 'failed').count()
    failed_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'failed').scalar() or 0
    cancelled_count = db.query(Payment).filter(Payment.status == 'cancelled').count()
    total_count = db.query(Payment).count()
    total_credit_redeemed = db.query(func.coalesce(func.sum(Payment.credit_redeemed), 0)).filter(Payment.status == 'confirmed').scalar() or 0

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
# EXCHANGES — distinct list for filter dropdown
# ════════════════════════════════════════════════════════════════════

@router.get("/exchanges")
def list_exchanges(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Distinct exchange names from the receiving wallet pool."""
    rows = db.query(ReceivingWallet.exchange_name).filter(
        ReceivingWallet.is_active == True  # noqa: E712
    ).distinct().all()
    exchanges = sorted({r[0] for r in rows if r[0]})
    return {"exchanges": exchanges}


# ════════════════════════════════════════════════════════════════════
# LIST — explicit JOIN, no relationship() needed
# ════════════════════════════════════════════════════════════════════

@router.get("/payments")
def list_payments(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    exchange: Optional[str] = Query(None, description="Filter by receiving wallet exchange (e.g. 'Binance', 'Indodax')"),
    only_stale: bool = Query(False),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(Payment)

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

    if exchange:
        # Restrict to payments whose wallet_to is one of the addresses
        # owned by the given exchange in the receiving_wallets pool.
        matching_addrs = [
            row[0] for row in db.query(ReceivingWallet.address).filter(
                ReceivingWallet.exchange_name == exchange
            ).all()
        ]
        if matching_addrs:
            q = q.filter(Payment.wallet_to.in_(matching_addrs))
        else:
            # No wallets registered for that exchange → no results
            q = q.filter(Payment.id == -1)

    if search:
        like = f"%{search}%"
        q = q.join(User, User.id == Payment.user_id).filter(or_(
            User.username.ilike(like),
            User.email.ilike(like),
            Payment.tx_hash.ilike(like),
            Payment.wallet_from.ilike(like),
        ))

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
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

    payments = q.offset((page - 1) * page_size).limit(page_size).all()
    items = _hydrate(db, payments)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ════════════════════════════════════════════════════════════════════
# DETAIL
# ════════════════════════════════════════════════════════════════════

@router.get("/payments/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    user = db.query(User).filter(User.id == p.user_id).first() if p.user_id else None
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None

    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])

    return _serialize_row(p, user, plan, include_bscscan=True, wallet_map=wallet_map)


# ════════════════════════════════════════════════════════════════════
# APPROVE
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: int,
    data: PaymentActionPayload = PaymentActionPayload(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    if p.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Only pending payments can be approved. Current status: {p.status}")

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None

    if not user:
        raise HTTPException(status_code=400, detail="Associated user not found")

    now = datetime.now(timezone.utc)
    p.status = 'confirmed'
    p.verified_at = now

    admin_note = f"[Manual approve by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    duration_days = getattr(plan, 'duration_days', None) if plan else None
    is_lifetime = plan and (duration_days is None or duration_days == 0 or getattr(plan, 'is_lifetime', False))

    if is_lifetime:
        new_expires_at = None
    elif duration_days:
        existing = getattr(user, 'subscription_expires_at', None)
        base = existing if (existing and existing > now) else now
        new_expires_at = base + timedelta(days=duration_days)
    else:
        new_expires_at = now + timedelta(days=30)

    user.role = 'subscriber'
    if hasattr(user, 'subscription_expires_at'):
        user.subscription_expires_at = new_expires_at
    if hasattr(user, 'subscription_granted_by'):
        user.subscription_granted_by = admin.id
    if hasattr(user, 'subscription_granted_at'):
        user.subscription_granted_at = now
    if hasattr(user, 'subscription_source'):
        user.subscription_source = 'admin_approve'

    db.commit()
    db.refresh(p)

    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])

    return {
        "success": True,
        "message": f"Payment #{p.id} approved. User @{user.username} subscription extended.",
        "payment": _serialize_row(p, user, plan, wallet_map=wallet_map),
    }


# ════════════════════════════════════════════════════════════════════
# MARK FAILED / CANCEL / REFUND / NOTE / BULK
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/mark-failed")
def mark_payment_failed(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Only pending payments can be marked failed. Current status: {p.status}")

    now = datetime.now(timezone.utc)
    p.status = 'failed'
    admin_note = f"[Marked failed by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} marked as failed", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/{payment_id}/cancel")
def cancel_payment(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Only pending payments can be cancelled. Current status: {p.status}")

    now = datetime.now(timezone.utc)
    p.status = 'cancelled'
    admin_note = f"[Cancelled by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} cancelled", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/{payment_id}/refund")
def refund_payment(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.status != 'confirmed':
        raise HTTPException(status_code=400, detail=f"Only confirmed payments can be refunded. Current status: {p.status}")

    now = datetime.now(timezone.utc)
    p.status = 'refunded'
    admin_note = f"[Refunded by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    else:
        admin_note += " — manual USDT refund via wallet required separately."
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    user = db.query(User).filter(User.id == p.user_id).first()
    if user:
        user.role = 'free'
        if hasattr(user, 'subscription_expires_at'):
            user.subscription_expires_at = None

    db.commit()
    db.refresh(p)

    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} flagged as refunded. Manual USDT refund required.", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/{payment_id}/note")
def add_payment_note(payment_id: int, data: PaymentNotePayload, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    now = datetime.now(timezone.utc)
    note = f"[Note by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}] {data.note.strip()}"
    p.notes = f"{p.notes}\n{note}" if p.notes else note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": "Note added", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/bulk-cancel-stale")
def bulk_cancel_stale(hours: int = Query(24, ge=1), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)

    stale = db.query(Payment).filter(Payment.status == 'pending', Payment.created_at < cutoff).all()
    count = len(stale)
    if count == 0:
        return {"success": True, "cancelled": 0, "message": "No stale payments found"}

    admin_note = f"[Bulk cancelled by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}] Auto-cancel stale > {hours}h"
    for p in stale:
        p.status = 'cancelled'
        p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    return {"success": True, "cancelled": count, "message": f"Cancelled {count} stale payment(s) older than {hours}h"}
