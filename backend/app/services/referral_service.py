# backend/app/services/referral_service.py
"""
Referral business logic.

Decoupled dari route handlers (referral.py) supaya:
- Reusable di subscription.py (Layer 4 commission hook)
- Testable
- Single source of truth buat URL building, slug generation, etc.
"""
import os
import io
import logging
import secrets
import string
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Tuple

from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.subscription import Payment
from app.models.referral import (
    ReferralCode,
    ReferralUse,
    REFERRAL_STATUS_PENDING,
    REFERRAL_STATUS_ACTIVE,
    REFERRAL_STATUS_SUBSCRIBED,
    REFERRAL_STATUS_CHURNED,
)
from app.models.credit import CreditLedger

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════
# URL BUILDERS (env-var driven)
# ════════════════════════════════════════════════════════════════════

REFERRAL_BASE_URL = os.getenv("REFERRAL_BASE_URL", "https://luxquant.tw")
API_PREFIX = os.getenv("API_PREFIX", "/api/v1")


def build_share_link(code: str) -> str:
    return f"{REFERRAL_BASE_URL}/?ref={code}"


def build_qr_url(code: str) -> str:
    return f"{REFERRAL_BASE_URL}{API_PREFIX}/referral/qr/{code}"


# ════════════════════════════════════════════════════════════════════
# CODE GENERATION
# ════════════════════════════════════════════════════════════════════

def generate_random_code() -> str:
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(secrets.choice(chars) for _ in range(8))
    return f"LUXQ-{suffix}"


def generate_unique_code(db: Session, max_attempts: int = 10) -> str:
    for _ in range(max_attempts):
        code = generate_random_code()
        existing = db.query(ReferralCode).filter(ReferralCode.code == code).first()
        if not existing:
            return code
    return f"LUXQ-{secrets.token_hex(6).upper()}"


def is_code_taken(db: Session, code: str) -> bool:
    return db.query(ReferralCode).filter(
        func.upper(ReferralCode.code) == code.upper()
    ).first() is not None


# ════════════════════════════════════════════════════════════════════
# QR CODE GENERATION
# ════════════════════════════════════════════════════════════════════

def generate_qr_png(code: str, size: int = 256) -> bytes:
    try:
        import qrcode
        from qrcode.image.styledpil import StyledPilImage
        from qrcode.image.styles.colormasks import SolidFillColorMask
    except ImportError:
        import qrcode

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(build_share_link(code))
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(build_share_link(code))
    qr.make(fit=True)

    img = qr.make_image(
        fill_color=(212, 175, 55),
        back_color=(10, 5, 6),
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ════════════════════════════════════════════════════════════════════
# FUNNEL CALCULATION
# ════════════════════════════════════════════════════════════════════

def calculate_funnel(db: Session, referrer_id: int) -> dict:
    rows = (
        db.query(ReferralUse.status, func.count(ReferralUse.id))
        .filter(ReferralUse.referrer_id == referrer_id)
        .group_by(ReferralUse.status)
        .all()
    )

    counts = {status: count for status, count in rows}

    pending = counts.get(REFERRAL_STATUS_PENDING, 0)
    active = counts.get(REFERRAL_STATUS_ACTIVE, 0)
    subscribed = counts.get(REFERRAL_STATUS_SUBSCRIBED, 0)
    churned = counts.get(REFERRAL_STATUS_CHURNED, 0)

    signed_up = pending + active + subscribed + churned
    active_total = active + subscribed + churned
    subscribed_total = subscribed + churned

    activation_rate = (active_total / signed_up * 100) if signed_up > 0 else 0
    subscription_rate = (subscribed_total / active_total * 100) if active_total > 0 else 0

    return {
        "signed_up": signed_up,
        "active": active_total,
        "subscribed": subscribed_total,
        "churned": churned,
        "activation_rate": round(activation_rate, 1),
        "subscription_rate": round(subscription_rate, 1),
    }


# ════════════════════════════════════════════════════════════════════
# EARNINGS CALCULATION
# ════════════════════════════════════════════════════════════════════

def calculate_earnings(db: Session, user: User) -> dict:
    available = float(user.referral_credit_usdt or 0)
    lifetime = float(user.lifetime_credit_earned or 0)
    total_redeemed = lifetime - available

    one_month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    this_month = (
        db.query(func.coalesce(func.sum(CreditLedger.amount), 0))
        .filter(
            CreditLedger.user_id == user.id,
            CreditLedger.type == "earn",
            CreditLedger.created_at >= one_month_ago,
        )
        .scalar()
    )

    pending_commission = 0.0

    return {
        "available_balance": available,
        "lifetime_earned": lifetime,
        "total_redeemed": max(0, total_redeemed),
        "pending_commission": pending_commission,
        "this_month_earned": float(this_month or 0),
        "has_earnings": lifetime > 0,
    }


# ════════════════════════════════════════════════════════════════════
# REFEREE LIST
# ════════════════════════════════════════════════════════════════════

def get_referee_list(
    db: Session,
    referrer_id: int,
    page: int = 1,
    page_size: int = 20,
) -> Tuple[List[dict], int]:
    total = (
        db.query(func.count(ReferralUse.id))
        .filter(ReferralUse.referrer_id == referrer_id)
        .scalar()
    )

    offset = (page - 1) * page_size

    rows = (
        db.query(ReferralUse, User)
        .join(User, ReferralUse.referred_id == User.id)
        .filter(ReferralUse.referrer_id == referrer_id)
        .order_by(ReferralUse.created_at.desc())
        .limit(page_size)
        .offset(offset)
        .all()
    )

    items = []
    for use, user in rows:
        items.append({
            "user_id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "status": use.status,
            "joined_at": use.created_at,
            "first_login_at": use.first_login_at or user.first_login_at,
            "last_login_at": user.last_login_at,
            "login_count": user.login_count or 0,
            "total_payments": use.total_payments or 0,
            "total_commission_earned": float(use.total_commission_earned or 0),
        })

    return items, total or 0


# ════════════════════════════════════════════════════════════════════
# SHARE TRACKING
# ════════════════════════════════════════════════════════════════════

def track_share_event(db: Session, code: str, channel: str) -> Optional[ReferralCode]:
    referral = db.query(ReferralCode).filter(
        func.upper(ReferralCode.code) == code.upper(),
        ReferralCode.is_active == True,
    ).first()

    if not referral:
        return None

    if channel == "qr_download":
        referral.qr_count = (referral.qr_count or 0) + 1
    else:
        referral.share_count = (referral.share_count or 0) + 1

    referral.last_shared_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(referral)

    return referral


# ════════════════════════════════════════════════════════════════════
# CREDIT REDEMPTION — Production-ready (Layer 8)
# ════════════════════════════════════════════════════════════════════

def _quantize(amount: Decimal) -> Decimal:
    """Round to 2 decimals (USDT precision)."""
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def preview_redemption(
    db: Session,
    user: User,
    amount: float,
    payment_id: int,
) -> dict:
    """
    Preview redeem credit terhadap real invoice.
    Tidak commit apapun.
    """
    available = Decimal(str(user.referral_credit_usdt or 0))
    requested = Decimal(str(amount))

    # ── Fetch real payment ──
    payment = db.query(Payment).filter(
        Payment.id == payment_id,
        Payment.user_id == user.id,
    ).first()

    if not payment:
        return {
            "requested_amount": float(requested),
            "available_balance": float(available),
            "invoice_amount": 0.0,
            "discount_amount": 0.0,
            "final_amount_after_credit": 0.0,
            "redeem_amount": 0.0,
            "will_succeed": False,
            "message": f"Payment #{payment_id} tidak ditemukan atau bukan milik kamu.",
        }

    if payment.status != "pending":
        return {
            "requested_amount": float(requested),
            "available_balance": float(available),
            "invoice_amount": float(payment.amount_usdt),
            "discount_amount": float(payment.discount_amount or 0),
            "final_amount_after_credit": float(payment.final_amount or payment.amount_usdt),
            "redeem_amount": 0.0,
            "will_succeed": False,
            "message": f"Invoice tidak bisa di-redeem (status: {payment.status}).",
        }

    invoice_amount = Decimal(str(payment.amount_usdt))
    discount_amount = Decimal(str(payment.discount_amount or 0))
    current_credit = Decimal(str(payment.credit_redeemed or 0))

    # Amount after referral discount, minus any already-redeemed credit
    remaining = invoice_amount - discount_amount - current_credit
    if remaining < Decimal("0"):
        remaining = Decimal("0")

    # User can't redeem more than their balance, and not more than remaining invoice
    redeemable = min(requested, available, remaining)
    redeemable = _quantize(redeemable)

    if redeemable <= Decimal("0"):
        will_succeed = False
        msg = (
            f"Tidak bisa redeem. Saldo: ${available:.2f}, "
            f"sisa invoice: ${remaining:.2f}, diminta: ${requested:.2f}."
        )
    elif available < requested:
        will_succeed = False
        msg = (
            f"Saldo tidak cukup. Tersedia: ${available:.2f}, diminta: ${requested:.2f}."
        )
    else:
        will_succeed = True
        new_final = invoice_amount - discount_amount - current_credit - redeemable
        if new_final < Decimal("0"):
            new_final = Decimal("0")
        msg = (
            f"Akan redeem ${redeemable:.2f}. "
            f"Final invoice: ${new_final:.2f}. "
            f"Sisa saldo: ${(available - redeemable):.2f}."
        )

    final_after_credit = _quantize(
        invoice_amount - discount_amount - current_credit - redeemable
    )
    if final_after_credit < Decimal("0"):
        final_after_credit = Decimal("0")

    return {
        "requested_amount": float(requested),
        "available_balance": float(available),
        "invoice_amount": float(invoice_amount),
        "discount_amount": float(discount_amount),
        "final_amount_after_credit": float(final_after_credit),
        "redeem_amount": float(redeemable),
        "will_succeed": will_succeed,
        "message": msg,
    }


def execute_redemption(
    db: Session,
    user: User,
    amount: float,
    payment_id: int,
) -> dict:
    """
    Actually redeem credit to a real invoice.

    Atomic operation:
      1. Validate payment exists, belongs to user, status=pending
      2. Validate balance sufficient
      3. Decrement user.referral_credit_usdt
      4. Increment payment.credit_redeemed
      5. Recalculate payment.final_amount
      6. Create CreditLedger entry (type='redeem', amount=-X)

    Idempotency: caller responsible. To prevent double-redeem on same payment,
    consider checking existing ledger entries with ref_payment_id before calling.

    Raises ValueError on validation failure.
    """
    amount_dec = _quantize(Decimal(str(amount)))

    if amount_dec <= Decimal("0"):
        raise ValueError("Amount harus lebih besar dari 0.")

    available = Decimal(str(user.referral_credit_usdt or 0))
    if available < amount_dec:
        raise ValueError(
            f"Saldo tidak cukup. Tersedia: ${available:.2f}, diminta: ${amount_dec:.2f}."
        )

    # ── Fetch real payment ──
    payment = db.query(Payment).filter(
        Payment.id == payment_id,
        Payment.user_id == user.id,
    ).first()

    if not payment:
        raise ValueError(f"Payment #{payment_id} tidak ditemukan atau bukan milik kamu.")

    if payment.status != "pending":
        raise ValueError(
            f"Invoice tidak bisa di-redeem (status: {payment.status})."
        )

    invoice_amount = Decimal(str(payment.amount_usdt))
    discount_amount = Decimal(str(payment.discount_amount or 0))
    current_credit = Decimal(str(payment.credit_redeemed or 0))

    remaining = invoice_amount - discount_amount - current_credit
    if remaining < Decimal("0"):
        remaining = Decimal("0")

    if amount_dec > remaining:
        raise ValueError(
            f"Jumlah redeem melebihi sisa invoice. Sisa: ${remaining:.2f}, "
            f"diminta: ${amount_dec:.2f}."
        )

    # ── 1. Decrement user balance ──
    new_balance = _quantize(available - amount_dec)
    user.referral_credit_usdt = new_balance

    # ── 2. Update payment ──
    new_credit_redeemed = _quantize(current_credit + amount_dec)
    new_final = _quantize(invoice_amount - discount_amount - new_credit_redeemed)
    if new_final < Decimal("0"):
        new_final = Decimal("0")

    payment.credit_redeemed = new_credit_redeemed
    payment.final_amount = new_final

    # ── 3. Ledger entry ──
    entry = CreditLedger(
        user_id=user.id,
        amount=-amount_dec,
        type="redeem",
        ref_payment_id=payment.id,
        balance_after=new_balance,
        note=f"Redeem {amount_dec} USDT to invoice #{payment.id}",
    )
    db.add(entry)

    db.commit()
    db.refresh(entry)
    db.refresh(user)
    db.refresh(payment)

    logger.info(
        f"💳 Credit redeemed: user_id={user.id} -{amount_dec} USDT "
        f"(balance: {available} → {new_balance}) to payment #{payment.id} "
        f"(final: {invoice_amount} → {new_final})"
    )

    return {
        "redeemed_amount": float(amount_dec),
        "new_balance": float(new_balance),
        "invoice_amount_after": float(new_final),
        "payment_credit_redeemed": float(new_credit_redeemed),
        "ledger_id": entry.id,
        "message": (
            f"Redeem ${amount_dec:.2f} berhasil. "
            f"Invoice akhir: ${new_final:.2f}. "
            f"Sisa saldo: ${new_balance:.2f}."
        ),
    }


def refund_redemption(
    db: Session,
    payment: Payment,
) -> Optional[dict]:
    """
    Refund credit_redeemed to user when invoice expires or cancelled.

    Called by:
      - Subscription worker on invoice expiration
      - subscription.py when canceling pending payments

    Idempotent: skip if no credit to refund or refund already processed.
    """
    if not payment.credit_redeemed or Decimal(str(payment.credit_redeemed)) <= Decimal("0"):
        return None

    # Idempotency: check if refund ledger entry already exists
    existing_refund = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == "refund",
    ).first()

    if existing_refund:
        logger.debug(f"Refund for payment #{payment.id} already exists, skipping")
        return None

    user = db.query(User).filter(User.id == payment.user_id).first()
    if not user:
        logger.warning(f"User #{payment.user_id} not found for refund of payment #{payment.id}")
        return None

    refund_amount = _quantize(Decimal(str(payment.credit_redeemed)))
    current_balance = Decimal(str(user.referral_credit_usdt or 0))
    new_balance = _quantize(current_balance + refund_amount)

    user.referral_credit_usdt = new_balance

    entry = CreditLedger(
        user_id=user.id,
        amount=refund_amount,
        type="refund",
        ref_payment_id=payment.id,
        balance_after=new_balance,
        note=f"Refund {refund_amount} USDT from cancelled/expired invoice #{payment.id}",
    )
    db.add(entry)

    # Reset payment.credit_redeemed to 0 and restore final_amount
    invoice_amount = Decimal(str(payment.amount_usdt))
    discount_amount = Decimal(str(payment.discount_amount or 0))
    payment.credit_redeemed = Decimal("0")
    payment.final_amount = _quantize(invoice_amount - discount_amount)

    db.flush()

    logger.info(
        f"💸 Credit refunded: user_id={user.id} +{refund_amount} USDT "
        f"(balance: {current_balance} → {new_balance}) from payment #{payment.id}"
    )

    return {
        "user_id": user.id,
        "refunded": float(refund_amount),
        "new_balance": float(new_balance),
    }
