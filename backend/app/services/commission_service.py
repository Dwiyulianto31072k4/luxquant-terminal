"""
Commission Service — Layer 4

Responsible for:
  1. Apply referral discount when creating invoice (first payment only)
  2. Process commission credit to referrer when payment confirmed
  3. Maintain audit trail via credit_ledger

Design principles:
  - Idempotent: safe to call multiple times for same payment (skip if already processed)
  - Defensive: skip silently for non-referred users (most users)
  - Transactional: all writes in single transaction, rollback on any failure
  - Configurable %: use per-code commission_pct, fallback to default
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.subscription import Payment
from app.models.referral import ReferralCode, ReferralUse
from app.models.credit import CreditLedger

logger = logging.getLogger(__name__)

# Default percentages (used if not set per-code)
DEFAULT_DISCOUNT_PCT = Decimal("10.00")
DEFAULT_COMMISSION_PCT = Decimal("10.00")


def _quantize(amount: Decimal) -> Decimal:
    """Round to 2 decimals (USDT precision)."""
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ============================================
# Discount apply — invoice creation
# ============================================

def apply_referral_discount(
    user: User,
    gross_amount: Decimal,
    db: Session,
) -> tuple[Decimal, Decimal, Optional[int]]:
    """
    Apply referral discount for first payment.

    Returns: (discount_amount, final_amount, referral_use_id)

    Rules:
      - User must have ReferralUse record (referred_id = user.id)
      - Discount only applies if total_payments = 0 (first payment)
      - Default 10% off, or use per-code discount_pct
      - If no eligible discount, returns (0, gross, None)
    """
    zero = Decimal("0.00")

    use = db.query(ReferralUse).filter(
        ReferralUse.referred_id == user.id
    ).first()

    if not use:
        return zero, gross_amount, None

    # Only first payment gets discount
    if use.total_payments > 0:
        return zero, gross_amount, use.id

    # Get discount % from referral_code (per-code override) or default
    code = db.query(ReferralCode).filter(
        ReferralCode.id == use.referral_code_id
    ).first()

    discount_pct = (
        Decimal(str(code.discount_pct))
        if code and code.discount_pct is not None
        else DEFAULT_DISCOUNT_PCT
    )

    discount_amount = _quantize(gross_amount * discount_pct / Decimal("100"))
    final_amount = _quantize(gross_amount - discount_amount)

    # Defensive: ensure non-negative
    if final_amount < zero:
        final_amount = zero

    logger.info(
        f"💰 Referral discount applied for user {user.id}: "
        f"{discount_pct}% off → {discount_amount} USDT discount, "
        f"final={final_amount} USDT (referral_use_id={use.id})"
    )

    return discount_amount, final_amount, use.id


# ============================================
# Commission processing — payment confirmed
# ============================================

def process_commission_for_payment(
    payment: Payment,
    db: Session,
) -> Optional[dict]:
    """
    Credit commission to referrer when referee's payment is confirmed.

    Returns: summary dict if commission credited, None if skipped.

    Idempotency:
      - Skip if payment already has credit_ledger entry with ref_payment_id
      - This prevents double-credit on /verify being called twice

    Logic:
      1. Find ReferralUse for this user (must exist)
      2. Calculate commission = final_amount * commission_pct
      3. Update ReferralUse: status=subscribed, total_commission_earned, total_payments
      4. Credit referrer's user.referral_credit_usdt + lifetime_credit_earned
      5. Insert CreditLedger entry
      6. Link payment.referral_use_id

    Does NOT commit — caller is responsible for db.commit() so this
    can be part of the larger payment-confirmation transaction.
    """
    # ── 1. Find ReferralUse ──
    use = db.query(ReferralUse).filter(
        ReferralUse.referred_id == payment.user_id
    ).first()

    if not use:
        return None  # User not referred, skip silently

    # ── 2. Idempotency check ──
    existing_ledger = db.query(CreditLedger).filter(
        CreditLedger.ref_payment_id == payment.id,
        CreditLedger.type == "earn",
    ).first()

    if existing_ledger:
        logger.info(
            f"⚠️  Commission for payment #{payment.id} already processed "
            f"(ledger entry #{existing_ledger.id}). Skipping."
        )
        return None

    # ── 3. Get referrer + commission % ──
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

    # ── 4. Calculate commission from FINAL amount (after discount) ──
    base_amount = Decimal(str(payment.final_amount or payment.amount_usdt))
    commission_amount = _quantize(base_amount * commission_pct / Decimal("100"))

    if commission_amount <= Decimal("0"):
        logger.warning(
            f"⚠️  Commission amount = {commission_amount} for payment #{payment.id}. "
            f"Skipping (zero or negative)."
        )
        return None

    # ── 5. Update ReferralUse ──
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
    use.payment_id = payment.id  # Link to triggering payment

    # ── 6. Credit referrer balance ──
    new_balance = (
        Decimal(str(referrer.referral_credit_usdt or 0)) + commission_amount
    )
    new_lifetime = (
        Decimal(str(referrer.lifetime_credit_earned or 0)) + commission_amount
    )

    referrer.referral_credit_usdt = new_balance
    referrer.lifetime_credit_earned = new_lifetime

    # ── 7. Create CreditLedger entry ──
    ledger = CreditLedger(
        user_id=referrer.id,
        amount=commission_amount,  # positive = earn
        type="earn",
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

    # ── 8. Link payment ↔ referral_use ──
    payment.referral_use_id = use.id

    db.flush()  # ensure ledger.id populated

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
