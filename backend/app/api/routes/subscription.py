# backend/app/api/routes/subscription.py
"""
Subscription Routes — Payment & subscription management

Flow at /subscribe:
  gross = plan.price_usdt
  final = gross - referral_discount (10% if first payment via referral)

Credit redemption is NOT applied here — user must explicitly redeem via
POST /referral/redeem after invoice creation (PaymentPage UI).
This separation allows the user to see/confirm the redemption before applying it.

Layer 4 (Referral commission) — on payment confirm:
  - Credit referrer's balance with X% of final_amount
  - Mark ReferralUse status='subscribed'

Multi-Wallet Rotation:
  - wallet_to picked from receiving_wallets pool per-invoice (privacy)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging

from app.config import settings
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
from app.schemas.user import UserResponse
from app.services.bscscan import verify_bep20_tx
from app.services.commission_service import (
    apply_referral_discount,
    process_commission_for_payment,
)
from app.services.wallet_pool import pick_wallet, increment_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscription", tags=["Subscription"])

RECEIVING_WALLET = settings.RECEIVING_WALLET_BSC
PAYMENT_WINDOW_HOURS = 24


# ============================================
# GET /plans
# ============================================

@router.get("/plans", response_model=list[PlanResponse])
async def get_plans(db: Session = Depends(get_db)):
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
    plan = db.query(SubscriptionPlan)\
        .filter(SubscriptionPlan.id == data.plan_id, SubscriptionPlan.is_active == True)\
        .first()

    if not plan:
        raise HTTPException(status_code=404, detail="Paket tidak ditemukan atau tidak aktif")

    if current_user.is_premium and not data.is_upgrade:
        raise HTTPException(
            status_code=400,
            detail="Kamu sudah punya subscription aktif. Gunakan is_upgrade=true untuk ganti paket."
        )

    # Check existing pending payment
    pending = db.query(Payment)\
        .filter(
            Payment.user_id == current_user.id,
            Payment.status == "pending",
            Payment.expires_at > datetime.now(timezone.utc)
        ).first()

    if pending:
        if pending.plan_id == data.plan_id:
            return _invoice_response(pending, plan, "Kamu sudah punya invoice untuk paket ini")
        else:
            # Different plan — cancel old
            pending.status = "cancelled"
            pending.notes = f"Switched to plan_id={data.plan_id}"
            db.flush()

    # Cancel ALL other pending payments
    other_pendings = db.query(Payment).filter(
        Payment.user_id == current_user.id,
        Payment.status == "pending"
    ).all()
    for p in other_pendings:
        p.status = "cancelled"
        p.notes = "New invoice created"
    db.flush()

    # ── Layer 4: Apply referral discount ──
    gross_amount = Decimal(str(plan.price_usdt))
    discount_amount, final_amount, referral_use_id = apply_referral_discount(
        user=current_user,
        gross_amount=gross_amount,
        db=db,
    )

    # ── Multi-Wallet: rotate receiving wallet ──
    try:
        rotated_wallet = pick_wallet(db, network="BSC")
    except RuntimeError as e:
        logger.error(f"Wallet pool empty: {e}")
        raise HTTPException(
            status_code=503,
            detail="Sistem pembayaran sementara tidak tersedia. Coba lagi nanti."
        )

    # ── Create payment ──
    # credit_redeemed defaults to 0 — user can redeem later via POST /referral/redeem
    payment = Payment(
        user_id=current_user.id,
        plan_id=plan.id,
        amount_usdt=gross_amount,
        discount_amount=discount_amount,
        credit_redeemed=Decimal("0"),
        final_amount=final_amount,
        referral_use_id=referral_use_id,
        wallet_to=rotated_wallet,
        network="BSC",
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=PAYMENT_WINDOW_HOURS)
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    # ── Multi-Wallet: increment usage stats ──
    try:
        increment_usage(db, rotated_wallet)
    except Exception as e:
        logger.warning(f"Failed to increment wallet usage: {e}")

    msg = (
        f"Transfer {final_amount} USDT (BEP-20) ke wallet di bawah"
        + (f" (diskon referral {discount_amount} USDT)" if discount_amount > 0 else "")
    )

    return _invoice_response(payment, plan, msg)


# ============================================
# POST /verify — Submit TX hash
# ============================================

@router.post("/verify")
async def verify_payment(
    data: PaymentVerify,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    payment = db.query(Payment)\
        .filter(Payment.id == data.payment_id, Payment.user_id == current_user.id)\
        .first()

    if not payment:
        raise HTTPException(status_code=404, detail="Payment tidak ditemukan")

    if payment.status == "confirmed":
        raise HTTPException(status_code=400, detail="Payment sudah dikonfirmasi sebelumnya")

    if payment.status in ("expired", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail=f"Payment sudah {payment.status}. Silakan buat invoice baru."
        )

    tx_hash_clean = data.tx_hash.strip().lower()

    existing_confirmed = db.query(Payment)\
        .filter(
            Payment.tx_hash == tx_hash_clean,
            Payment.status == "confirmed",
            Payment.id != payment.id
        ).first()

    if existing_confirmed:
        raise HTTPException(
            status_code=400,
            detail="TX hash ini sudah digunakan di transaksi lain yang berhasil"
        )

    payment.tx_hash = tx_hash_clean
    payment.status = "verifying"
    payment.updated_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(f"🔍 Verifying payment #{payment.id} tx={tx_hash_clean}")

    # On-chain verify: expected amount = final_amount (post discount + credit redeem if any)
    expected_amount = Decimal(str(payment.final_amount or payment.amount_usdt))

    result = await verify_bep20_tx(
        tx_hash=data.tx_hash,
        expected_amount=expected_amount,
        expected_wallet_to=payment.wallet_to
    )

    if result.valid:
        now = datetime.now(timezone.utc)
        payment.status = "confirmed"
        payment.verified_at = now
        payment.wallet_from = result.data.get("from", "")
        payment.bscscan_data = result.data

        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payment.plan_id).first()

        current_user.role = "subscriber"
        current_user.subscription_granted_at = now
        if hasattr(current_user, "subscription_source"):
            current_user.subscription_source = "payment"
        # Access (re)granted → clear any stale VIP grace immediately.
        if hasattr(current_user, "telegram_grace_until"):
            current_user.telegram_grace_until = None

        if plan and plan.duration_days:
            current_user.subscription_expires_at = now + timedelta(days=plan.duration_days)
        else:
            current_user.subscription_expires_at = None

        plan_label = plan.label if plan else "unknown"
        current_user.subscription_note = f"Plan: {plan_label}"

        # ── Layer 4: Commission to referrer ──
        commission_summary = None
        try:
            commission_summary = process_commission_for_payment(payment, db)
        except Exception as e:
            logger.error(
                f"⚠️  Commission processing failed for payment #{payment.id}: {e}.",
                exc_info=True,
            )

        db.commit()
        db.refresh(current_user)

        logger.info(
            f"✅ Payment #{payment.id} confirmed. "
            f"User {current_user.id} → subscriber ({plan_label})"
            + (f" | Commission: +{commission_summary['commission_amount']} USDT "
               f"to user_id={commission_summary['referrer_id']}" if commission_summary else "")
        )

        response = {
            "status": "confirmed",
            "message": "Pembayaran berhasil! Subscription aktif.",
            "subscription": {
                "role": current_user.role,
                "plan_label": plan_label,
                "plan_name": plan.name if plan else None,
                "expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None,
            },
            "user": UserResponse.model_validate(current_user).model_dump(mode='json')
        }

        if commission_summary:
            response["referral"] = {
                "commission_credited": True,
                "referrer_id": commission_summary["referrer_id"],
                "commission_amount": commission_summary["commission_amount"],
            }

        return response
    else:
        payment.status = "pending"
        payment.tx_hash = None
        payment.bscscan_data = result.data if result.data else None
        payment.notes = result.error
        payment.updated_at = datetime.now(timezone.utc)
        db.commit()

        logger.warning(f"❌ Payment #{payment.id} failed: {result.error}")

        return {
            "status": "failed",
            "message": result.error,
            "can_retry": True
        }


# ============================================
# GET /me — Subscription status
# ============================================

@router.get("/me")
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    base = {
        "is_subscribed": False,
        "tier": "free",
        "expires_at": None,
        "days_remaining": None,
        "plan_label": None,
        "plan_name": None,
        "can_upgrade": True,
        "can_downgrade": False,
    }

    if current_user.role == 'admin':
        base.update(is_subscribed=True, tier="admin", can_upgrade=False)
        return base

    if current_user.role in ('premium', 'subscriber'):
        now = datetime.now(timezone.utc)
        expires = current_user.subscription_expires_at

        if expires and expires < now:
            current_user.role = "free"
            current_user.subscription_note = None
            db.commit()
            return base

        days_remaining = None
        if expires:
            days_remaining = max(0, (expires - now).days)

        plan_label = None
        plan_name = None
        current_plan_order = -1

        latest_payment = db.query(Payment)\
            .filter(Payment.user_id == current_user.id, Payment.status == "confirmed")\
            .order_by(Payment.verified_at.desc())\
            .first()

        if latest_payment and latest_payment.plan:
            plan_label = latest_payment.plan.label
            plan_name = latest_payment.plan.name
            current_plan_order = latest_payment.plan.sort_order

        if not plan_label and current_user.subscription_note:
            plan_label = current_user.subscription_note

        max_order = db.query(SubscriptionPlan.sort_order)\
            .filter(SubscriptionPlan.is_active == True)\
            .order_by(SubscriptionPlan.sort_order.desc())\
            .limit(1)\
            .scalar() or 0

        base.update(
            is_subscribed=True,
            tier="subscriber",
            expires_at=expires.isoformat() if expires else None,
            days_remaining=days_remaining,
            plan_label=plan_label,
            plan_name=plan_name,
            can_upgrade=current_plan_order < max_order,
        )
        return base

    return base


# ============================================
# GET /payments — Payment history
# ============================================

@router.get("/payments")
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    payments = db.query(Payment)\
        .filter(Payment.user_id == current_user.id)\
        .order_by(Payment.created_at.desc())\
        .limit(50)\
        .all()

    return {
        "items": [_payment_to_dict(p) for p in payments],
        "total": len(payments)
    }


# ============================================
# Helpers
# ============================================

def _invoice_response(payment: Payment, plan: SubscriptionPlan, message: str):
    return {
        "payment": _payment_to_dict(payment),
        "wallet_to": payment.wallet_to,
        "amount_usdt": float(payment.final_amount or payment.amount_usdt),
        "gross_amount_usdt": float(payment.amount_usdt),
        "discount_amount_usdt": float(payment.discount_amount or 0),
        "credit_redeemed_usdt": float(payment.credit_redeemed or 0),
        "final_amount_usdt": float(payment.final_amount or payment.amount_usdt),
        "plan": {
            "id": plan.id,
            "name": plan.name,
            "label": plan.label,
            "description": plan.description,
            "price_usdt": float(plan.price_usdt),
            "duration_days": plan.duration_days,
        },
        "expires_at": payment.expires_at.isoformat() if payment.expires_at else None,
        "message": message
    }


def _payment_to_dict(p: Payment) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "plan_id": p.plan_id,
        "amount_usdt": float(p.amount_usdt),
        "discount_amount": float(p.discount_amount or 0),
        "credit_redeemed": float(p.credit_redeemed or 0),
        "final_amount": float(p.final_amount or p.amount_usdt),
        "referral_use_id": p.referral_use_id,
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
