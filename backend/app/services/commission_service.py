"""
Commission Service — Layer 4 + Layer 8

Responsible for:
  Layer 4 (Referral commission):
    1. apply_referral_discount    — 10% off for first payment via ReferralUse
    2. process_commission_for_payment — credit referrer when referee payment confirmed

  Layer 8 (Credit redemption):
    3. apply_credit_redeem        — use user's balance as additional discount
    4. commit_credit_redeem       — actually deduct balance + ledger entry
    5. refund_credit_redeem       — refund balance when invoice expired/cancelled
    6. record_referral_discount_audit — audit ledger entry for transparency

Design principles:
  - Idempotent: safe to call multiple times for same payment
  - Defensive: skip silently when user not eligible
  - Transactional: caller commits, this module only flushes
  - Stacking allowed: referral discount + credit redeem can combine
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.subscription import Payment
from app.models.referral import ReferralCode, ReferralUse
from app.models.credit import (
    CreditLedger,
    LEDGER_TYPE_EARN,
    LEDGER_TYPE_REDEEM,
    LEDGER_TYPE_REFUND,
    LEDGER_TYPE_REFERRAL_DISCOUNT,
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
# Layer 8: Credit Redemption
# ════════════════════════════════════════════════

def apply_credit_redeem(
    user: User,
    after_referral_amount: Decimal,
) -> tuple[Decimal, Decimal]:
    """
    Calculate credit redemption (preview / planning, no DB writes).

    Full credit redeem: if balance >= amount, use balance to cover it.
                       Otherwise use all balance.

    Returns: (credit_redeemed, final_amount)

    NOTE: This is pure calculation. Use commit_credit_redeem() to actually
    deduct balance + create ledger entry.
    """
    zero = Decimal("0.00")
    current_balance = Decimal(str(user.referral_credit_usdt or 0))

    if current_balance <= zero:
        return zero, after_referral_amount

    redeemed = min(current_balance, after_referral_amount)
    redeemed = _quantize(redeemed)
    final_amount = _quantize(after_referral_amount - redeemed)

    if final_amount < zero:
        final_amount = zero

    logger.info(
        f"💳 Credit redeem preview for user {user.id}: "
        f"balance={current_balance}, after_ref={after_referral_amount}, "
        f"redeem={redeemed}, final={final_amount}"
    )

    return redeemed, final_amount


def commit_credit_redeem(
    user: User,
    payment: Payment,
    credit_amount: Decimal,
    db: Session,
) -> Optional[dict]:
    """
    Actually deduct balance + create ledger entry for credit redemption.

    Called after payment row is committed and we have payment.id.

    Idempotency: skips if 'redeem' ledger entry already exists for this payment.
    """
    if credit_amount <= Decimal("0"):
        return None

    existing = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == LEDGER_TYPE_REDEEM,
    ).first()

    if existing:
        logger.info(
            f"⚠️  Credit redeem for payment #{payment.id} already processed "
            f"(ledger #{existing.id}). Skipping."
        )
        return None

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    credit_amount = _quantize(Decimal(str(credit_amount)))
    current_balance = Decimal(str(user.referral_credit_usdt or 0))

    if credit_amount > current_balance:
        logger.warning(
            f"⚠️  Credit redeem amount {credit_amount} exceeds balance "
            f"{current_balance} for user {user.id}. Capping to balance."
        )
        credit_amount = current_balance

    new_balance = _quantize(current_balance - credit_amount)
    user.referral_credit_usdt = new_balance

    ledger = CreditLedger(
        user_id=user.id,
        amount=-credit_amount,
        type=LEDGER_TYPE_REDEEM,
        ref_payment_id=payment.id,
        balance_after=new_balance,
        note=f"Credit redeem for invoice #{payment.id}",
        created_at=now,
    )
    db.add(ledger)
    db.flush()

    logger.info(
        f"💳 Credit redeemed: user={user.id} -{credit_amount} USDT "
        f"(balance: {current_balance} → {new_balance}) for payment #{payment.id}"
    )

    return {
        "user_id": user.id,
        "credit_redeemed": float(credit_amount),
        "new_balance": float(new_balance),
        "payment_id": payment.id,
        "ledger_id": ledger.id,
    }


def refund_credit_redeem(payment: Payment, db: Session) -> Optional[dict]:
    """
    Refund credit_redeemed back to user when invoice expires/cancelled.

    Idempotency: skips if a 'refund' ledger entry tied to this payment exists.
    """
    if not hasattr(payment, "credit_redeemed") or not payment.credit_redeemed:
        return None

    refund_amount = _quantize(Decimal(str(payment.credit_redeemed)))
    if refund_amount <= Decimal("0"):
        return None

    existing_refund = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == LEDGER_TYPE_REFUND,
    ).first()

    if existing_refund:
        logger.debug(
            f"Refund for payment #{payment.id} already processed. Skipping."
        )
        return None

    user = db.query(User).filter(User.id == payment.user_id).first()
    if not user:
        logger.warning(
            f"User #{payment.user_id} not found for refund of payment #{payment.id}"
        )
        return None

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    current_balance = Decimal(str(user.referral_credit_usdt or 0))
    new_balance = _quantize(current_balance + refund_amount)
    user.referral_credit_usdt = new_balance

    ledger = CreditLedger(
        user_id=user.id,
        amount=refund_amount,
        type=LEDGER_TYPE_REFUND,
        ref_payment_id=payment.id,
        balance_after=new_balance,
        note=f"Refund credit redeem from cancelled/expired invoice #{payment.id}",
        created_at=now,
    )
    db.add(ledger)
    db.flush()

    logger.info(
        f"💸 Credit refunded: user={user.id} +{refund_amount} USDT "
        f"(balance: {current_balance} → {new_balance}) from payment #{payment.id}"
    )

    return {
        "user_id": user.id,
        "refunded": float(refund_amount),
        "new_balance": float(new_balance),
    }


# ════════════════════════════════════════════════
# Layer 8: Audit trail for referral discount
# ════════════════════════════════════════════════

def record_referral_discount_audit(
    user: User,
    payment: Payment,
    discount_amount: Decimal,
    referral_use_id: Optional[int],
    db: Session,
) -> Optional[CreditLedger]:
    """
    Create audit-only ledger entry for referral discount.
    Amount = 0 (no balance change), purely for audit transparency.
    """
    if discount_amount <= Decimal("0"):
        return None

    # Idempotency
    existing = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == LEDGER_TYPE_REFERRAL_DISCOUNT,
    ).first()
    if existing:
        return existing

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    ledger = CreditLedger(
        user_id=user.id,
        amount=Decimal("0"),
        type=LEDGER_TYPE_REFERRAL_DISCOUNT,
        ref_payment_id=payment.id,
        ref_use_id=referral_use_id,
        balance_after=Decimal(str(user.referral_credit_usdt or 0)),
        note=f"Referral discount {discount_amount} USDT applied to invoice #{payment.id}",
        created_at=now,
    )
    db.add(ledger)
    db.flush()

    return ledger


# ════════════════════════════════════════════════
# Layer 4: Commission processing (unchanged)
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
