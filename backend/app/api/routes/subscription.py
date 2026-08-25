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
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
import os
import hashlib

from app.config import settings
from app.services.notifier import create_notification, notification_exists
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.services.tier import tier_from_plan
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
from app.services.referral_service import refund_redemption
from app.services.wallet_pool import pick_wallet, increment_usage
from app.services.growth_measurement import record_growth_event_best_effort

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscription", tags=["Subscription"])

RECEIVING_WALLET = settings.RECEIVING_WALLET_BSC
# 24h killed 187 of 277 invoices. Exchange withdrawal holds to a new address
# are often 24h on their own, so the old window expired before the money could
# physically arrive.
PAYMENT_WINDOW_HOURS = 72

SITE_URL = os.getenv("PUBLIC_SITE_URL", "https://luxquant.tw")
CHECKOUT_URL = f"{SITE_URL}/payment"


def _invoice_dm(plan_label: str, amount, expires_at, window_hours: int) -> str:
    """The invoice, as a message the customer keeps.

    It deliberately does NOT carry the wallet address. LuxQuant runs a public
    Telegram channel, which makes the brand trivial to impersonate, and the
    single most common crypto scam is a lookalike account DMing a payment
    address. If our own bot also sends addresses, a customer has no way left to
    tell the two apart — so the rule is absolute and stated in the message
    itself, where it does double duty as a warning.

    Everything else they need to plan the payment is here; the address lives on
    the invoice page, behind their login.
    """
    when = expires_at.strftime("%d %b %Y, %H:%M UTC") if expires_at else "—"
    return (
        f"<b>Invoice created — {plan_label}</b>\n\n"
        f"Amount: <b>{amount} USDT</b>\n"
        f"Network: BNB Smart Chain (BEP-20)\n"
        f"Pay before: <b>{when}</b> ({window_hours}h)\n\n"
        f"Open your invoice: {CHECKOUT_URL}\n\n"
        "<i>We never send a wallet address by message. Always take it from the "
        "invoice page above — anyone messaging you an address is not us.</i>"
    )


async def _send_invoice_dm(telegram_id: int, text: str) -> None:
    """Best-effort. A failed DM must never affect the invoice itself."""
    try:
        from app.services.telegram_group import send_dm
        await send_dm(telegram_id, text)
    except Exception as e:
        logger.warning(f"Invoice DM failed for telegram_id={telegram_id}: {e}")
# After the window closes we still accept a hash for this long. The chain check
# is the real gate; the clock only ever decided how long the page stayed open.
PAYMENT_GRACE_DAYS = 7


# ============================================
# GET /plans
# ============================================

@router.get("/plans", response_model=list[PlanResponse])
def get_plans(db: Session = Depends(get_db)):
    plans = db.query(SubscriptionPlan)\
        .filter(SubscriptionPlan.is_active == True)\
        .order_by(SubscriptionPlan.sort_order)\
        .all()
    return plans


# ============================================
# POST /subscribe — Create payment invoice
# ============================================

@router.post("/subscribe")
def create_subscription(
    data: PaymentCreate,
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    plan = db.query(SubscriptionPlan)\
        .filter(SubscriptionPlan.id == data.plan_id, SubscriptionPlan.is_active == True)\
        .first()

    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found or inactive")

    if current_user.is_premium and not data.is_upgrade:
        raise HTTPException(
            status_code=400,
            detail="You already have an active subscription. Use is_upgrade=true to change plan."
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
            # Different plan — cancel old (refund any redeemed credit first)
            refund_redemption(db, pending)
            pending.status = "cancelled"
            pending.notes = f"Switched to plan_id={data.plan_id}"
            db.flush()

    # Cancel ALL other pending payments (refund any redeemed credit first)
    other_pendings = db.query(Payment).filter(
        Payment.user_id == current_user.id,
        Payment.status == "pending"
    ).all()
    for p in other_pendings:
        refund_redemption(db, p)
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
            detail="The payment system is temporarily unavailable. Please try again later."
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

    record_growth_event_best_effort(
        db,
        user_id=current_user.id,
        event="invoice_created",
        event_id=f"server:invoice_created:{payment.id}",
        source="subscription_api",
        path="/api/v1/subscription/subscribe",
        entity_type="payment",
        entity_id=payment.id,
        meta={
            "plan_id": plan.id,
            "plan_name": plan.name,
            "amount_usdt": float(final_amount),
            "is_upgrade": bool(data.is_upgrade),
        },
        commit=True,
    )

    # ── Multi-Wallet: increment usage stats ──
    try:
        increment_usage(db, rotated_wallet)
    except Exception as e:
        logger.warning(f"Failed to increment wallet usage: {e}")

    msg = (
        f"Transfer {final_amount} USDT (BEP-20) ke wallet di bawah"
        + (f" (diskon referral {discount_amount} USDT)" if discount_amount > 0 else "")
    )

    # ── Give them the invoice to keep ──────────────────────────────
    # Until now a new invoice existed only on the screen that made it. Someone
    # who closed the tab had no record of what they owed, by when, or that an
    # invoice existed at all — and 188 of them lapsed unpaid in silence.
    src = f"invoice:{payment.id}"
    try:
        if not notification_exists(db, type="invoice_created", source_id=src):
            create_notification(
                db,
                type="invoice_created",
                title=f"Invoice created — {plan.label}",
                body=(
                    f"{final_amount} USDT · pay before "
                    f"{payment.expires_at.strftime('%d %b, %H:%M UTC')}"
                    if payment.expires_at else f"{final_amount} USDT"
                ),
                data={
                    "payment_id": payment.id,
                    "amount_usdt": float(final_amount),
                    "expires_at": payment.expires_at.isoformat() if payment.expires_at else None,
                    "checkout_url": CHECKOUT_URL,
                },
                source_type="payment",
                source_id=src,
                user_id=current_user.id,
            )
    except Exception as e:
        logger.warning(f"Invoice notification failed for payment {payment.id}: {e}")
        db.rollback()

    if current_user.telegram_id:
        background.add_task(
            _send_invoice_dm,
            current_user.telegram_id,
            _invoice_dm(plan.label, final_amount, payment.expires_at, PAYMENT_WINDOW_HOURS),
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
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.status == "confirmed":
        raise HTTPException(status_code=400, detail="This payment was already confirmed")

    if payment.status == "cancelled":
        raise HTTPException(
            status_code=400,
            detail="This invoice was cancelled. Please create a new one."
        )

    was_expired = payment.status == "expired"

    # An expired invoice is not a closed case. People pay late — the exchange
    # held the withdrawal, or they came back the next morning — and they arrive
    # holding a real hash. Refusing it means keeping money we were sent.
    if payment.status == "expired":
        grace_until = (payment.expires_at or payment.created_at) + timedelta(
            days=PAYMENT_GRACE_DAYS
        )
        if datetime.now(timezone.utc) > grace_until:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This invoice closed more than "
                    f"{PAYMENT_GRACE_DAYS} days ago. Create a new one, or send your "
                    "transaction hash to an admin and we will match it by hand."
                ),
            )
        logger.info(
            "Accepting a late payment on expired invoice #%s (within %s-day grace)",
            payment.id, PAYMENT_GRACE_DAYS,
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
            detail="This TX hash has already been used in another successful transaction"
        )

    payment.tx_hash = tx_hash_clean
    payment.status = "verifying"
    payment.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Server truth for submit intent. Only a digest of the hash participates in
    # idempotency; the transaction hash itself already belongs to payments and
    # is not duplicated into analytics metadata.
    tx_digest = hashlib.sha256(tx_hash_clean.encode()).hexdigest()[:20]
    record_growth_event_best_effort(
        db,
        user_id=current_user.id,
        event="transaction_submitted",
        event_id=f"server:transaction_submitted:{payment.id}:{tx_digest}",
        source="subscription_api",
        path="/api/v1/subscription/verify",
        entity_type="payment",
        entity_id=payment.id,
        meta={"late_invoice": was_expired},
        commit=True,
    )

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

        # The plan they actually bought. An expiry date alone cannot tell monthly
        # from yearly — both are just "a date in the future" — so the shape of the
        # entitlement is recorded here rather than re-derived later from a span.
        current_user.subscription_tier = tier_from_plan(plan)

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

        record_growth_event_best_effort(
            db,
            user_id=current_user.id,
            event="payment_confirmed",
            event_id=f"server:payment_confirmed:{payment.id}",
            source="subscription_api",
            path="/api/v1/subscription/verify",
            entity_type="payment",
            entity_id=payment.id,
            meta={
                "plan_id": payment.plan_id,
                "plan_name": plan.name if plan else None,
                "amount_usdt": float(payment.final_amount or payment.amount_usdt),
                "method": payment.method,
                "network": payment.network,
            },
            commit=True,
        )

        logger.info(
            f"✅ Payment #{payment.id} confirmed. "
            f"User {current_user.id} → subscriber ({plan_label})"
            + (f" | Commission: +{commission_summary['commission_amount']} USDT "
               f"to user_id={commission_summary['referrer_id']}" if commission_summary else "")
        )

        response = {
            "status": "confirmed",
            "message": "Payment successful! Your subscription is active.",
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
        # Only forget the hash when the chain actually answered and the hash was
        # genuinely wrong. When the failure is ours — no reachable RPC, a crash,
        # or simply not enough confirmations yet — throwing it away forced people
        # who had already paid to hunt down and resubmit their hash, and erased
        # the evidence that they ever submitted one. 201 payments were left with
        # no hash this way.
        if not getattr(result, "retryable", False):
            payment.tx_hash = None
        payment.bscscan_data = result.data if result.data else None
        payment.notes = result.error
        payment.updated_at = datetime.now(timezone.utc)
        db.commit()

        error_text = str(result.error or "").lower()
        if getattr(result, "retryable", False):
            reason_code = "retryable_chain_check"
        elif "amount" in error_text or "insufficient" in error_text:
            reason_code = "amount_mismatch"
        elif "wallet" in error_text or "recipient" in error_text or "address" in error_text:
            reason_code = "wallet_mismatch"
        elif "not found" in error_text or "transaction" in error_text:
            reason_code = "transaction_not_found"
        elif "network" in error_text or "token" in error_text:
            reason_code = "network_or_token_mismatch"
        else:
            reason_code = "verification_rejected"

        record_growth_event_best_effort(
            db,
            user_id=current_user.id,
            event="payment_verification_failed",
            event_id=(
                f"server:payment_verification_failed:{payment.id}:"
                f"{tx_digest}:{reason_code}"
            ),
            source="subscription_api",
            path="/api/v1/subscription/verify",
            entity_type="payment",
            entity_id=payment.id,
            meta={
                "reason_code": reason_code,
                "retryable": bool(getattr(result, "retryable", False)),
            },
            commit=True,
        )

        logger.warning(
            f"{'⏳' if getattr(result, 'retryable', False) else '❌'} "
            f"Payment #{payment.id} not confirmed "
            f"({'retryable' if getattr(result, 'retryable', False) else 'rejected'}): {result.error}"
        )

        return {
            "status": "pending" if getattr(result, "retryable", False) else "failed",
            "message": result.error,
            "can_retry": True,
            # Lets the client tell "we could not check yet, hold on" apart from
            # "this hash is wrong, fix it" instead of showing one blunt failure.
            "retryable": bool(getattr(result, "retryable", False)),
        }


# ============================================
# GET /me — Subscription status
# ============================================

@router.get("/me")
def get_my_subscription(
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

    # All staff tiers (admin / co_admin / founder), not just role == 'admin':
    # otherwise view-only staff read as unsubscribed and the UI offers them
    # an upgrade to the product they help run.
    if current_user.is_admin_staff:
        base.update(is_subscribed=True, tier="admin", can_upgrade=False)
        return base

    if current_user.role in ('premium', 'subscriber'):
        now = datetime.now(timezone.utc)
        expires = current_user.subscription_expires_at

        if expires and expires < now:
            current_user.role = "free"
            current_user.subscription_tier = None
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
# GET /pending — the customer's open invoice
# ============================================

@router.get("/pending")
def get_pending_invoice(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The one open, unexpired invoice this customer has, if any.

    Until now an invoice existed only in the router state of the tab that
    created it. Reload the page, follow a link, or come back tomorrow and it
    was gone — PaymentPage bounced to /pricing, where starting again mints a
    SECOND invoice and cancels the first. An unfinished checkout was therefore
    unreachable by design, which is a poor thing to build under an 81%
    checkout loss.

    Same shape as POST /subscribe so the page can consume either without
    knowing which one it got.
    """
    now = datetime.now(timezone.utc)
    payment = (
        db.query(Payment)
        .filter(
            Payment.user_id == current_user.id,
            Payment.status == "pending",
            Payment.deleted_at.is_(None),
            Payment.expires_at.isnot(None),
            Payment.expires_at > now,
        )
        .order_by(Payment.created_at.desc())
        .first()
    )
    if not payment:
        return {"invoice": None}

    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payment.plan_id).first()
    if not plan:
        # An invoice whose plan was deleted cannot be paid or explained.
        return {"invoice": None}

    return {"invoice": _invoice_response(payment, plan, "")}


# ============================================
# GET /payments — Payment history
# ============================================

@router.get("/payments")
def get_payment_history(
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
