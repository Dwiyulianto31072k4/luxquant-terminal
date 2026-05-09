# backend/app/services/referral_helpers.py
"""
Helper functions untuk referral v2.

Reusable di:
  - app/api/routes/auth.py          (Google login)
  - app/api/routes/telegram_auth.py (Telegram login)
  - app/api/routes/discord_auth.py  (Discord OAuth callback)
  - app/api/routes/referral.py      (manual apply by user)
  - app/api/routes/subscription.py  (commission hook saat payment confirmed)

Semua helper di sini IDEMPOTENT — aman di-call berkali-kali tanpa side effect ganda.
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.referral import (
    ReferralCode,
    ReferralUse,
    REFERRAL_STATUS_PENDING,
    REFERRAL_STATUS_ACTIVE,
)

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════
# REFERRAL CODE LOOKUP & APPLY
# ════════════════════════════════════════════════════════════════════

def find_referral_code(db: Session, code: str) -> Optional[ReferralCode]:
    """Lookup referral code, case-insensitive."""
    if not code:
        return None
    code_norm = code.strip().upper()
    if not code_norm:
        return None

    return db.query(ReferralCode).filter(
        ReferralCode.code == code_norm,
        ReferralCode.is_active == True,
    ).first()


def is_referral_code_valid(referral: Optional[ReferralCode]) -> Tuple[bool, str]:
    """Validate apakah code masih bisa dipake."""
    if not referral:
        return False, "Invalid referral code"

    if not referral.is_active:
        return False, "Referral code is inactive"

    if referral.expires_at and referral.expires_at < datetime.now(timezone.utc):
        return False, "Referral code has expired"

    if referral.max_uses is not None and referral.times_used >= referral.max_uses:
        return False, "Referral code has reached max uses"

    return True, "OK"


def apply_referral_to_user(
    db: Session,
    user: User,
    code: str,
    *,
    commit: bool = True,
) -> Tuple[bool, str, Optional[ReferralUse]]:
    """
    Apply referral code ke user. Idempotent.

    Returns:
        (success, message, referral_use_or_None)
    """

    # Skip kalo user udah punya referral
    if user.referred_by or user.referral_code_used:
        logger.info(f"User {user.id} already has referral, skipping apply")
        return False, "User already has a referral", None

    if not code:
        return False, "No referral code provided", None

    # Lookup
    referral = find_referral_code(db, code)
    valid, reason = is_referral_code_valid(referral)
    if not valid:
        logger.warning(f"Invalid referral code '{code}' for user {user.id}: {reason}")
        return False, reason, None

    # Anti self-refer
    if referral.user_id == user.id:
        logger.warning(f"User {user.id} tried to use own referral code")
        return False, "Cannot use your own referral code", None

    # Anti same-email fraud — basic check
    referrer = db.query(User).filter(User.id == referral.user_id).first()
    if referrer and referrer.email and user.email:
        if referrer.email.lower() == user.email.lower():
            logger.warning(f"Same email detected: referrer.email == user.email")
            return False, "Invalid referral", None

    # Defensive: cek udah ada ReferralUse buat user ini
    existing_use = db.query(ReferralUse).filter(
        ReferralUse.referred_id == user.id
    ).first()
    if existing_use:
        logger.warning(f"User {user.id} already has ReferralUse #{existing_use.id}")
        return False, "User already has a referral use record", None

    # Apply
    user.referred_by = referral.user_id
    user.referral_code_used = referral.code

    use = ReferralUse(
        referral_code_id=referral.id,
        referrer_id=referral.user_id,
        referred_id=user.id,
        status=REFERRAL_STATUS_PENDING,
        discount_amount=Decimal("0"),
        commission_amount=Decimal("0"),
        total_commission_earned=Decimal("0"),
        total_payments=0,
    )
    db.add(use)

    # Note: times_used NOT incremented here — di-increment saat payment confirmed.

    if commit:
        db.commit()
        db.refresh(use)
        db.refresh(user)

    logger.info(
        f"🎟️ Referral applied: code={referral.code} referrer={referral.user_id} "
        f"referred={user.id} use_id={use.id}"
    )
    return True, "Referral applied successfully", use


# ════════════════════════════════════════════════════════════════════
# LOGIN TRACKING
# ════════════════════════════════════════════════════════════════════

def track_user_login(
    db: Session,
    user: User,
    *,
    commit: bool = True,
) -> None:
    """
    Update login tracking fields. Dipanggil di setiap successful login.

    Side effects:
        - user.last_login_at = NOW
        - user.login_count += 1
        - user.first_login_at = NOW (kalo belum)
        - Kalo referee dengan ReferralUse status=pending → bump 'active'
    """
    now = datetime.now(timezone.utc)
    is_first_login = user.first_login_at is None

    user.last_login_at = now
    user.login_count = (user.login_count or 0) + 1

    if is_first_login:
        user.first_login_at = now

        # Kalo referee, bump ReferralUse → active
        if user.referred_by:
            use = db.query(ReferralUse).filter(
                ReferralUse.referred_id == user.id,
                ReferralUse.status == REFERRAL_STATUS_PENDING,
            ).first()

            if use:
                use.status = REFERRAL_STATUS_ACTIVE
                use.first_login_at = now
                logger.info(
                    f"📈 Referral #{use.id} bumped to ACTIVE: referee={user.id} "
                    f"first login at {now.isoformat()}"
                )

    if commit:
        db.commit()
        db.refresh(user)
