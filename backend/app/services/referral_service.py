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
from decimal import Decimal
from typing import Optional, List, Tuple

from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.models.user import User
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
    """https://luxquant.tw/?ref=DWI-2026"""
    return f"{REFERRAL_BASE_URL}/?ref={code}"


def build_qr_url(code: str) -> str:
    """https://luxquant.tw/api/v1/referral/qr/DWI-2026"""
    return f"{REFERRAL_BASE_URL}{API_PREFIX}/referral/qr/{code}"


# ════════════════════════════════════════════════════════════════════
# CODE GENERATION
# ════════════════════════════════════════════════════════════════════

def generate_random_code() -> str:
    """Generate random code: LUXQ-XXXXXXXX"""
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(secrets.choice(chars) for _ in range(8))
    return f"LUXQ-{suffix}"


def generate_unique_code(db: Session, max_attempts: int = 10) -> str:
    """Generate random code yang dijamin unique. Retry sampai max_attempts."""
    for _ in range(max_attempts):
        code = generate_random_code()
        existing = db.query(ReferralCode).filter(ReferralCode.code == code).first()
        if not existing:
            return code
    # Extreme fallback (collision rate ~ 36^8 = sangat rendah)
    return f"LUXQ-{secrets.token_hex(6).upper()}"


def is_code_taken(db: Session, code: str) -> bool:
    """Check kalau code udah dipake (case-insensitive)"""
    return db.query(ReferralCode).filter(
        func.upper(ReferralCode.code) == code.upper()
    ).first() is not None


# ════════════════════════════════════════════════════════════════════
# QR CODE GENERATION
# ════════════════════════════════════════════════════════════════════

def generate_qr_png(code: str, size: int = 256) -> bytes:
    """
    Generate QR code PNG sebagai bytes.
    Returns: PNG bytes ready untuk Response(content=..., media_type="image/png")
    """
    try:
        import qrcode
        from qrcode.image.styledpil import StyledPilImage
        from qrcode.image.styles.colormasks import SolidFillColorMask
    except ImportError:
        # Fallback ke basic qrcode kalau styled tidak tersedia
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

    # Styled version (gold on dark, sesuai theme LuxQuant)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # High = bisa di-decorate logo
        box_size=10,
        border=2,
    )
    qr.add_data(build_share_link(code))
    qr.make(fit=True)

    # Color: gold-primary on bg-primary
    img = qr.make_image(
        fill_color=(212, 175, 55),    # #D4AF37
        back_color=(10, 5, 6),         # #0a0506
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ════════════════════════════════════════════════════════════════════
# FUNNEL CALCULATION
# ════════════════════════════════════════════════════════════════════

def calculate_funnel(db: Session, referrer_id: int) -> dict:
    """
    Calculate funnel breakdown untuk referrer.
    Returns dict yang match ReferralFunnelResponse.
    """
    # Single query, group by status
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

    # Funnel cumulative (each stage includes all later stages)
    signed_up = pending + active + subscribed + churned
    active_total = active + subscribed + churned    # Pernah login = active or beyond
    subscribed_total = subscribed + churned         # Pernah bayar

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
    """
    Calculate earnings card data.
    Returns dict yang match ReferralEarningsResponse.
    """
    available = float(user.referral_credit_usdt or 0)
    lifetime = float(user.lifetime_credit_earned or 0)
    total_redeemed = lifetime - available

    # This month earned (from ledger)
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

    # Pending commission: estimate dari referee yang status=active tapi belum bayar
    # (placeholder untuk Layer 4. Sekarang return 0.)
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
    """
    Paginated list referee + their info.

    Returns: (items, total_count)
    """
    # Total count
    total = (
        db.query(func.count(ReferralUse.id))
        .filter(ReferralUse.referrer_id == referrer_id)
        .scalar()
    )

    # Query: join ReferralUse + User
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
    """
    Increment share/qr counter.
    Returns updated ReferralCode atau None kalau code ga ada.
    """
    referral = db.query(ReferralCode).filter(
        func.upper(ReferralCode.code) == code.upper(),
        ReferralCode.is_active == True,
    ).first()

    if not referral:
        return None

    # Increment counter sesuai channel
    if channel == "qr_download":
        referral.qr_count = (referral.qr_count or 0) + 1
    else:
        # copy_link, twitter, telegram, whatsapp, other → all count as share
        referral.share_count = (referral.share_count or 0) + 1

    referral.last_shared_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(referral)

    return referral


# ════════════════════════════════════════════════════════════════════
# CREDIT REDEMPTION (stub for Layer 4-5 integration)
# ════════════════════════════════════════════════════════════════════

def preview_redemption(
    db: Session,
    user: User,
    amount: float,
    payment_id: int,
) -> dict:
    """
    Preview redeem credit terhadap invoice.
    Tidak commit apapun.

    NOTE: Implementasi real butuh subscription.py yang udah expose
    invoice info (Layer 4). Untuk sekarang return mock buat UI testing.
    """
    available = float(user.referral_credit_usdt or 0)

    # TODO: di Layer 4, ambil real invoice via:
    #   from app.models.subscription import Payment
    #   payment = db.query(Payment).filter(Payment.id == payment_id, ...).first()
    #
    # Untuk sekarang, mock:
    invoice_amount = 30.0       # Stub
    discount_amount = 0.0       # Stub

    final_after_credit = max(0, invoice_amount - discount_amount - amount)
    redeem_amount = min(amount, available, invoice_amount - discount_amount)

    if available < amount:
        return {
            "requested_amount": amount,
            "available_balance": available,
            "invoice_amount": invoice_amount,
            "discount_amount": discount_amount,
            "final_amount_after_credit": invoice_amount - discount_amount,
            "redeem_amount": 0,
            "will_succeed": False,
            "message": f"Insufficient balance. Available: ${available:.2f}, requested: ${amount:.2f}",
        }

    return {
        "requested_amount": amount,
        "available_balance": available,
        "invoice_amount": invoice_amount,
        "discount_amount": discount_amount,
        "final_amount_after_credit": final_after_credit,
        "redeem_amount": redeem_amount,
        "will_succeed": True,
        "message": f"Will redeem ${redeem_amount:.2f}, remaining balance ${available - redeem_amount:.2f}",
    }


def execute_redemption(
    db: Session,
    user: User,
    amount: float,
    payment_id: int,
) -> dict:
    """
    Actually redeem credit.
    NOTE: Real impl butuh Layer 4. Sekarang ini stub yg cuma:
      - decrement user balance
      - log ledger entry
      - return result

    Tidak benerang attach ke payment (akan diisi di Layer 4).
    """
    available = Decimal(str(user.referral_credit_usdt or 0))
    amount_dec = Decimal(str(amount))

    if available < amount_dec:
        raise ValueError(
            f"Insufficient balance. Available: ${available:.2f}, requested: ${amount_dec:.2f}"
        )

    # Decrement balance
    new_balance = available - amount_dec
    user.referral_credit_usdt = new_balance

    # Log ledger entry
    entry = CreditLedger(
        user_id=user.id,
        amount=-amount_dec,           # Negative = redeem
        type="redeem",
        ref_payment_id=payment_id,
        balance_after=new_balance,
        note=f"Redeem to payment #{payment_id}",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    db.refresh(user)

    return {
        "redeemed_amount": amount,
        "new_balance": float(new_balance),
        "invoice_amount_after": 0,    # Stub, Layer 4 fills
        "ledger_id": entry.id,
        "message": f"Redeemed ${amount:.2f}. New balance: ${new_balance:.2f}",
    }
