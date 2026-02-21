# backend/app/api/routes/subscription.py
"""
Subscription Routes — User-facing endpoints
Subscription status stored directly in users table:
  - users.role = 'free' | 'premium' | 'admin'
  - users.subscription_expires_at = timestamp | NULL (lifetime)
  - users.subscription_granted_by = admin user_id | NULL (self-pay)
  - users.subscription_granted_at = timestamp
  - users.subscription_note = text
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.subscription import SubscriptionPlan, Payment
from app.schemas.subscription import (
    PlanResponse,
    PaymentCreate,
    PaymentVerify,
    PaymentListResponse,
    SubscriptionStatusResponse,
)
from app.services.bscscan import verify_bep20_tx

router = APIRouter(prefix="/subscription", tags=["Subscription"])

RECEIVING_WALLET = os.getenv("RECEIVING_WALLET_BSC", "")
PAYMENT_WINDOW_HOURS = int(os.getenv("PAYMENT_WINDOW_HOURS", "24"))


# ============================================
# GET /plans
# ============================================

@router.get("/plans", response_model=list[PlanResponse])
async def get_plans(db: Session = Depends(get_db)):
    """Get all active subscription plans"""
    plans = db.query(SubscriptionPlan)\
        .filter(SubscriptionPlan.is_active == True)\
        .order_by(SubscriptionPlan.sort_order)\
        .all()
    return plans


# ============================================
# POST /subscribe — Create payment invoice
# ============================================

@router.post("/subscribe")
async def create_subscription(
    data: PaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new payment invoice"""

    plan = db.query(SubscriptionPlan)\
        .filter(SubscriptionPlan.id == data.plan_id, SubscriptionPlan.is_active == True)\
        .first()

    if not plan:
        raise HTTPException(status_code=404, detail="Paket tidak ditemukan atau tidak aktif")

    # Check if already premium and not expired
    if current_user.is_premium:
        raise HTTPException(status_code=400, detail="Kamu sudah memiliki subscription aktif")

    # Check pending payment
    pending = db.query(Payment)\
        .filter(
            Payment.user_id == current_user.id,
            Payment.status == "pending",
            Payment.expires_at > datetime.now(timezone.utc)
        ).first()

    if pending:
        return {
            "payment": _payment_to_dict(pending),
            "wallet_to": RECEIVING_WALLET,
            "message": "Kamu sudah punya invoice yang belum dibayar"
        }

    # Create payment
    payment = Payment(
        user_id=current_user.id,
        plan_id=plan.id,
        amount_usdt=plan.price_usdt,
        wallet_to=RECEIVING_WALLET,
        network="BSC",
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=PAYMENT_WINDOW_HOURS)
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return {
        "payment": _payment_to_dict(payment),
        "wallet_to": RECEIVING_WALLET,
        "amount_usdt": float(plan.price_usdt),
        "plan": {"name": plan.name, "label": plan.label, "duration_days": plan.duration_days},
        "expires_at": payment.expires_at.isoformat(),
        "message": f"Silakan transfer {plan.price_usdt} USDT (BEP-20) ke wallet di bawah"
    }


# ============================================
# POST /verify — Submit TX hash
# ============================================

@router.post("/verify")
async def verify_payment(
    data: PaymentVerify,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit TX hash to verify payment"""

    payment = db.query(Payment)\
        .filter(Payment.id == data.payment_id, Payment.user_id == current_user.id)\
        .first()

    if not payment:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    if payment.status == "confirmed":
        raise HTTPException(status_code=400, detail="Payment sudah dikonfirmasi")

    if payment.status == "expired":
        raise HTTPException(status_code=400, detail="Payment expired, buat invoice baru")

    # Check duplicate TX hash
    existing = db.query(Payment)\
        .filter(Payment.tx_hash == data.tx_hash.lower(), Payment.id != payment.id)\
        .first()
    if existing:
        raise HTTPException(status_code=400, detail="TX hash sudah digunakan")

    # Update with TX hash
    payment.tx_hash = data.tx_hash.lower()
    payment.status = "verifying"
    db.commit()

    # Verify via BSCScan
    result = await verify_bep20_tx(
        tx_hash=data.tx_hash,
        expected_amount=Decimal(str(payment.amount_usdt)),
        expected_wallet_to=payment.wallet_to
    )

    if result.valid:
        now = datetime.now(timezone.utc)
        payment.status = "confirmed"
        payment.verified_at = now
        payment.wallet_from = result.data.get("from", "")
        payment.bscscan_data = result.data

        # Get plan for duration
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payment.plan_id).first()

        # Activate subscription directly on users table
        current_user.role = "premium"
        current_user.subscription_granted_at = now
        current_user.subscription_note = f"Self-pay via BSC TX: {data.tx_hash[:16]}... Plan: {plan.name if plan else 'unknown'}"

        if plan and plan.duration_days:
            current_user.subscription_expires_at = now + timedelta(days=plan.duration_days)
        else:
            current_user.subscription_expires_at = None  # lifetime

        db.commit()

        return {
            "status": "confirmed",
            "message": "Pembayaran berhasil! Subscription aktif.",
            "subscription": {
                "role": "premium",
                "expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None,
            }
        }
    else:
        payment.status = "failed"
        payment.bscscan_data = result.data
        payment.notes = result.error
        db.commit()

        return {
            "status": "failed",
            "message": result.error,
            "can_retry": True
        }


# ============================================
# GET /me — Current subscription status
# ============================================

@router.get("/me", response_model=SubscriptionStatusResponse)
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's subscription status"""

    if current_user.is_admin or current_user.role == 'admin':
        return SubscriptionStatusResponse(is_subscribed=True, tier="admin")

    if current_user.role == 'premium':
        now = datetime.now(timezone.utc)
        expires = current_user.subscription_expires_at

        # Check expired
        if expires and expires < now:
            current_user.role = "free"
            db.commit()
            return SubscriptionStatusResponse(is_subscribed=False, tier="free")

        days_remaining = None
        if expires:
            days_remaining = max(0, (expires - now).days)

        return SubscriptionStatusResponse(
            is_subscribed=True,
            tier="premium",
            expires_at=expires,
            days_remaining=days_remaining,
            plan_note=current_user.subscription_note
        )

    return SubscriptionStatusResponse(is_subscribed=False, tier="free")


# ============================================
# GET /payments
# ============================================

@router.get("/payments", response_model=PaymentListResponse)
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's payment history"""
    payments = db.query(Payment)\
        .filter(Payment.user_id == current_user.id)\
        .order_by(Payment.created_at.desc())\
        .limit(50)\
        .all()

    return PaymentListResponse(
        items=[_payment_to_dict(p) for p in payments],
        total=len(payments)
    )


# ============================================
# Helpers
# ============================================

def _payment_to_dict(p: Payment) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "plan_id": p.plan_id,
        "amount_usdt": float(p.amount_usdt),
        "tx_hash": p.tx_hash,
        "wallet_from": p.wallet_from,
        "wallet_to": p.wallet_to,
        "network": p.network,
        "status": p.status,
        "verified_at": p.verified_at.isoformat() if p.verified_at else None,
        "expires_at": p.expires_at.isoformat() if p.expires_at else None,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "plan_name": p.plan.name if p.plan else None,
        "plan_label": p.plan.label if p.plan else None,
    }