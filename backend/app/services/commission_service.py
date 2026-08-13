"""
Commission Service — Layer 4 (Referral commission)

Responsible for:
    1. apply_referral_discount        — 10% off for first payment via ReferralUse
    2. process_commission_for_payment — credit referrer when referee payment confirmed

NOTE: Credit redemption (Layer 8) lives in referral_service.py
      (preview_redemption / execute_redemption / refund_redemption). Those are
      the ACTIVE implementations wired into the routes + worker.

Design principles:
  - Idempotent: safe to call multiple times for same payment
  - Defensive: skip silently when user not eligible (incl. cancelled referrals)
  - Transactional: caller commits, this module only flushes
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.subscription import Payment
from app.models.referral import ReferralCode, ReferralUse, REFERRAL_STATUS_CANCELLED
from app.models.credit import (
    CreditLedger,
    LEDGER_TYPE_EARN,
    LEDGER_TYPE_ADJUST,
)

logger = logging.getLogger(__name__)

DEFAULT_DISCOUNT_PCT = Decimal("10.00")
DEFAULT_COMMISSION_PCT = Decimal("10.00")


def _quantize(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ════════════════════════════════════════════════
# Layer 4: Referral Discount (invoice creation)
# ════════════════════════════════════════════════

def apply_referral_discount(
    user: User,
    gross_amount: Decimal,
    db: Session,
) -> tuple[Decimal, Decimal, Optional[int]]:
    """
    Apply referral discount for first payment.

    Returns: (discount_amount, after_referral_amount, referral_use_id)
    """
    zero = Decimal("0.00")

    use = db.query(ReferralUse).filter(
        ReferralUse.referred_id == user.id
    ).first()

    if not use:
        return zero, gross_amount, None

    # Honor admin cancellation (fraud/refund) — no discount for cancelled referrals.
    if use.status == REFERRAL_STATUS_CANCELLED:
        logger.info(
            f"Referral discount skipped for user {user.id}: "
            f"ReferralUse #{use.id} is cancelled."
        )
        return zero, gross_amount, use.id

    if use.total_payments > 0:
        return zero, gross_amount, use.id

    code = db.query(ReferralCode).filter(
        ReferralCode.id == use.referral_code_id
    ).first()

    discount_pct = (
        Decimal(str(code.discount_pct))
        if code and code.discount_pct is not None
        else DEFAULT_DISCOUNT_PCT
    )

    discount_amount = _quantize(gross_amount * discount_pct / Decimal("100"))
    after_amount = _quantize(gross_amount - discount_amount)

    if after_amount < zero:
        after_amount = zero

    logger.info(
        f"💰 Referral discount applied for user {user.id}: "
        f"{discount_pct}% off → {discount_amount} USDT discount "
        f"(after referral: {after_amount}, ref_use_id={use.id})"
    )

    return discount_amount, after_amount, use.id


# ════════════════════════════════════════════════
# Layer 4: Commission processing
# ════════════════════════════════════════════════

def process_commission_for_payment(
    payment: Payment,
    db: Session,
) -> Optional[dict]:
    """
    Credit commission to referrer when referee's payment is confirmed.
    Idempotent. Does NOT commit — caller does.
    """
    use = db.query(ReferralUse).filter(
        ReferralUse.referred_id == payment.user_id
    ).first()

    if not use:
        return None

    # Honor admin cancellation (fraud/refund) — no commission for cancelled referrals.
    if use.status == REFERRAL_STATUS_CANCELLED:
        logger.info(
            f"⚠️  Commission skipped for payment #{payment.id}: "
            f"ReferralUse #{use.id} is cancelled."
        )
        return None

    existing_ledger = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == LEDGER_TYPE_EARN,
    ).first()

    if existing_ledger:
        logger.info(
            f"⚠️  Commission for payment #{payment.id} already processed "
            f"(ledger entry #{existing_ledger.id}). Skipping."
        )
        return None

    referrer = db.query(User).filter(User.id == use.referrer_id).first()
    if not referrer:
        logger.warning(
            f"⚠️  Referrer user_id={use.referrer_id} not found for "
            f"ReferralUse #{use.id}. Skipping commission."
        )
        return None

    code = db.query(ReferralCode).filter(
        ReferralCode.id == use.referral_code_id
    ).first()

    commission_pct = (
        Decimal(str(code.commission_pct))
        if code and code.commission_pct is not None
        else DEFAULT_COMMISSION_PCT
    )

    base_amount = Decimal(str(payment.final_amount or payment.amount_usdt))
    commission_amount = _quantize(base_amount * commission_pct / Decimal("100"))

    if commission_amount <= Decimal("0"):
        logger.warning(
            f"⚠️  Commission amount = {commission_amount} for payment #{payment.id}. "
            f"Skipping (zero or negative)."
        )
        return None

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    # times_used counts DISTINCT referees who reached first payment (not renewals),
    # so max_uses limits are enforced against real conversions.
    is_first_payment = (use.total_payments or 0) == 0

    use.status = "subscribed"
    use.total_commission_earned = (
        Decimal(str(use.total_commission_earned or 0)) + commission_amount
    )
    use.total_payments = (use.total_payments or 0) + 1
    use.last_payment_at = now
    use.commission_amount = (
        Decimal(str(use.commission_amount or 0)) + commission_amount
    )
    use.payment_id = payment.id

    if is_first_payment and code is not None:
        code.times_used = (code.times_used or 0) + 1

    new_balance = (
        Decimal(str(referrer.referral_credit_usdt or 0)) + commission_amount
    )
    new_lifetime = (
        Decimal(str(referrer.lifetime_credit_earned or 0)) + commission_amount
    )

    referrer.referral_credit_usdt = new_balance
    referrer.lifetime_credit_earned = new_lifetime

    ledger = CreditLedger(
        user_id=referrer.id,
        amount=commission_amount,
        type=LEDGER_TYPE_EARN,
        ref_payment_id=payment.id,
        ref_use_id=use.id,
        balance_after=new_balance,
        note=(
            f"Commission {commission_pct}% from referee "
            f"user_id={payment.user_id} payment #{payment.id}"
        ),
        created_at=now,
    )
    db.add(ledger)
    payment.referral_use_id = use.id

    db.flush()

    logger.info(
        f"💸 Commission credited: referrer user_id={referrer.id} "
        f"+{commission_amount} USDT (new balance: {new_balance}) "
        f"from referee user_id={payment.user_id} payment #{payment.id} "
        f"[ReferralUse #{use.id} → subscribed]"
    )

    return {
        "referrer_id": referrer.id,
        "referee_id": payment.user_id,
        "commission_amount": float(commission_amount),
        "commission_pct": float(commission_pct),
        "referrer_new_balance": float(new_balance),
        "referrer_lifetime_earned": float(new_lifetime),
        "referral_use_id": use.id,
        "ledger_id": ledger.id,
    }


def reverse_commission_for_refund(payment: Payment, db: Session) -> Optional[dict]:
    """Reverse a referral commission when its confirmed payment is refunded.

    Idempotency is anchored to an ``adjust`` ledger row for the same payment.
    The balance is allowed to become negative when the reward has already been
    spent: hiding that liability would make the ledger and cashout controls lie.
    Caller owns the transaction and commit.
    """
    earn = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == LEDGER_TYPE_EARN,
    ).first()
    if not earn:
        return None

    reversal = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == LEDGER_TYPE_ADJUST,
        CreditLedger.note.like("Commission reversal for refunded payment%"),
    ).first()
    if reversal:
        return None

    use = db.query(ReferralUse).filter(ReferralUse.id == earn.ref_use_id).first()
    referrer = db.query(User).filter(User.id == earn.user_id).first()
    if not use or not referrer:
        logger.error(
            "Cannot reverse commission for payment #%s: referral use or referrer missing",
            payment.id,
        )
        return None

    amount = abs(Decimal(str(earn.amount or 0)))
    if amount <= Decimal("0"):
        return None

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    remaining_payments = db.query(Payment).filter(
        Payment.user_id == use.referred_id,
        Payment.status == "confirmed",
        Payment.deleted_at.is_(None),
        Payment.id != payment.id,
    ).all()

    new_balance = Decimal(str(referrer.referral_credit_usdt or 0)) - amount
    referrer.referral_credit_usdt = new_balance
    referrer.lifetime_credit_earned = max(
        Decimal("0"), Decimal(str(referrer.lifetime_credit_earned or 0)) - amount
    )

    use.total_commission_earned = max(
        Decimal("0"), Decimal(str(use.total_commission_earned or 0)) - amount
    )
    use.commission_amount = max(
        Decimal("0"), Decimal(str(use.commission_amount or 0)) - amount
    )
    use.total_payments = len(remaining_payments)
    if remaining_payments:
        use.status = "subscribed"
        use.last_payment_at = max(
            (p.verified_at or p.created_at for p in remaining_payments if p.verified_at or p.created_at),
            default=None,
        )
    else:
        use.status = "active" if use.first_login_at else "pending"
        use.last_payment_at = None
        code = db.query(ReferralCode).filter(ReferralCode.id == use.referral_code_id).first()
        if code and (code.times_used or 0) > 0:
            code.times_used -= 1

    db.add(CreditLedger(
        user_id=referrer.id,
        amount=-amount,
        type=LEDGER_TYPE_ADJUST,
        ref_payment_id=payment.id,
        ref_use_id=use.id,
        balance_after=new_balance,
        note=f"Commission reversal for refunded payment #{payment.id}",
        created_at=now,
    ))
    db.flush()

    logger.info(
        "Commission reversed: payment #%s, referrer user_id=%s, amount=-%s, balance=%s",
        payment.id,
        referrer.id,
        amount,
        new_balance,
    )
    return {
        "referrer_id": referrer.id,
        "amount": float(amount),
        "balance_after": float(new_balance),
        "referral_use_id": use.id,
    }
