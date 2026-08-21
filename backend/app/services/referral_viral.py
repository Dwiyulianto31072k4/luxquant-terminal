# backend/app/services/referral_viral.py
"""Viral referral loop: qualification + time-boxed access grants.

A referee is qualified when they hit 2 of 3 signals within 7 days of signup:
  1. Telegram linked
  2. Opened a resolved proof (growth_events.proof_verified)
  3. Returned (login_count >= 2) or armed a watch/alert

Referrer rewards (stack on top of the existing 10% USDT commission):
  3 qualified AND 1 confirmed subscriber → 7 days
  10 qualified (after unlock) → +7 days
  each further → +2 days
  cap 30 days total granted via this loop
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.referral import (
    ReferralUse,
    REFERRAL_STATUS_CANCELLED,
)
from app.models.user import User
from app.services.role_resolver import (
    ACCESS_ROLES,
    SOURCE_ADMIN,
    SOURCE_LEGACY,
    SOURCE_LIFETIME,
    SOURCE_PAYMENT,
    SOURCE_REFERRAL_REWARD,
)

logger = logging.getLogger(__name__)

QUALIFIED_WINDOW_DAYS = 7
UNLOCK_AT = 3
UNLOCK_PAID = 1
UNLOCK_DAYS = 7
BONUS_AT = 10
BONUS_DAYS = 7
EXTRA_DAYS = 2
CAP_DAYS = 30


def grant_timeboxed_access(
    db: Session,
    user: User,
    days: int,
    *,
    source: str = SOURCE_REFERRAL_REWARD,
    note: Optional[str] = None,
    commit: bool = False,
) -> User:
    """Extend or grant subscriber access. Never shortens an existing grant."""
    if days <= 0:
        return user

    staff = getattr(User, "STAFF_ROLES", ("admin", "co_admin", "founder"))
    if user.role in staff:
        return user

    now = datetime.now(timezone.utc)
    delta = timedelta(days=days)
    protected_keep_source = {
        SOURCE_PAYMENT,
        SOURCE_ADMIN,
        SOURCE_LIFETIME,
        SOURCE_LEGACY,
    }

    # Lifetime (no expiry) — already has everything.
    if user.role in ACCESS_ROLES and user.subscription_expires_at is None:
        return user

    if (
        user.role in ACCESS_ROLES
        and user.subscription_expires_at
        and user.subscription_expires_at > now
    ):
        user.subscription_expires_at = user.subscription_expires_at + delta
        if user.subscription_source not in protected_keep_source:
            user.subscription_source = source
    else:
        user.role = "subscriber"
        user.subscription_expires_at = now + delta
        user.subscription_source = source
        user.subscription_granted_at = now
        user.subscription_note = note or f"referral reward +{days}d"

    if commit:
        db.commit()
        db.refresh(user)
    return user


def _has_proof(db: Session, user_id: int) -> bool:
    row = db.execute(
        text(
            """
            SELECT 1 FROM growth_events
            WHERE user_id = :uid AND event = 'proof_verified'
            LIMIT 1
            """
        ),
        {"uid": user_id},
    ).first()
    return bool(row)


def _has_armed_value(db: Session, user_id: int) -> bool:
    row = db.execute(
        text(
            """
            SELECT 1 WHERE
              EXISTS (SELECT 1 FROM watchlist WHERE user_id = :uid LIMIT 1)
              OR EXISTS (SELECT 1 FROM coin_watch WHERE user_id = :uid LIMIT 1)
              OR EXISTS (SELECT 1 FROM entry_alerts WHERE user_id = :uid LIMIT 1)
            """
        ),
        {"uid": user_id},
    ).first()
    return bool(row)


def _days_already_granted(db: Session, referrer_id: int) -> int:
    total = (
        db.query(func.coalesce(func.sum(ReferralUse.reward_days_granted), 0))
        .filter(ReferralUse.referrer_id == referrer_id)
        .scalar()
    )
    return int(total or 0)


def _qualified_count(db: Session, referrer_id: int) -> int:
    return int(
        db.query(func.count(ReferralUse.id))
        .filter(
            ReferralUse.referrer_id == referrer_id,
            ReferralUse.qualified_at.isnot(None),
            ReferralUse.status != REFERRAL_STATUS_CANCELLED,
        )
        .scalar()
        or 0
    )


def _unlock_pool_count(db: Session, referrer_id: int) -> int:
    """Distinct referees who either qualified (use) or have a live payment."""
    from app.models.subscription import Payment

    paid_ids = (
        db.query(ReferralUse.referred_id)
        .join(Payment, Payment.user_id == ReferralUse.referred_id)
        .filter(
            ReferralUse.referrer_id == referrer_id,
            ReferralUse.status != REFERRAL_STATUS_CANCELLED,
            Payment.status == "confirmed",
            Payment.deleted_at.is_(None),
        )
    )
    qualified_ids = (
        db.query(ReferralUse.referred_id)
        .filter(
            ReferralUse.referrer_id == referrer_id,
            ReferralUse.qualified_at.isnot(None),
            ReferralUse.status != REFERRAL_STATUS_CANCELLED,
        )
    )
    return int(
        db.query(func.count(func.distinct(ReferralUse.referred_id)))
        .filter(
            ReferralUse.referrer_id == referrer_id,
            ReferralUse.referred_id.in_(paid_ids.union(qualified_ids)),
        )
        .scalar()
        or 0
    )


def _paid_count(db: Session, referrer_id: int) -> int:
    """Distinct referees with a live confirmed payment. Refunds do not count."""
    from app.models.subscription import Payment

    return int(
        db.query(func.count(func.distinct(ReferralUse.referred_id)))
        .join(Payment, Payment.user_id == ReferralUse.referred_id)
        .filter(
            ReferralUse.referrer_id == referrer_id,
            ReferralUse.status != REFERRAL_STATUS_CANCELLED,
            Payment.status == "confirmed",
            Payment.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )


def desired_grant_days(qualified: int, paid: int, pool: Optional[int] = None) -> int:
    """Access days the referrer should hold.

    Unlock needs 3 who use AND 1 who pays. If the payer is already one of
    the 3 users, that is 3 people — not enough. ``pool`` is distinct
    referees who are qualified or paid; it must be at least 4.
    """
    people = qualified + paid if pool is None else pool
    if (
        qualified < UNLOCK_AT
        or paid < UNLOCK_PAID
        or people < (UNLOCK_AT + UNLOCK_PAID)
    ):
        return 0
    days = UNLOCK_DAYS
    if qualified >= BONUS_AT:
        days += BONUS_DAYS + max(0, qualified - BONUS_AT) * EXTRA_DAYS
    return min(days, CAP_DAYS)


def _sync_referrer_grant(db: Session, trigger_use: ReferralUse) -> int:
    """Grant any newly earned days onto the use that just moved state."""
    referrer = db.query(User).filter(User.id == trigger_use.referrer_id).first()
    if not referrer:
        return 0

    qualified = _qualified_count(db, trigger_use.referrer_id)
    paid = _paid_count(db, trigger_use.referrer_id)
    pool = _unlock_pool_count(db, trigger_use.referrer_id)
    already = _days_already_granted(db, trigger_use.referrer_id)
    days = max(
        0,
        min(desired_grant_days(qualified, paid, pool) - already, CAP_DAYS - already),
    )
    if days <= 0:
        return 0

    grant_timeboxed_access(
        db,
        referrer,
        days,
        source=SOURCE_REFERRAL_REWARD,
        note=f"referral unlock: {qualified} used + {paid} paid (+{days}d)",
        commit=False,
    )
    trigger_use.reward_days_granted = int(trigger_use.reward_days_granted or 0) + days
    logger.info(
        "referral grant referrer=%s days=%s qualified=%s paid=%s from referee=%s",
        referrer.id,
        days,
        qualified,
        paid,
        trigger_use.referred_id,
    )
    return days


def evaluate_referral_qualification(
    db: Session,
    user: User,
    *,
    commit: bool = False,
) -> Optional[ReferralUse]:
    """Mark a referee qualified and grant the referrer if a threshold is crossed.

    Idempotent. Safe to call on every login / proof / watch.
    """
    if not getattr(user, "referred_by", None):
        return None

    use = (
        db.query(ReferralUse)
        .filter(ReferralUse.referred_id == user.id)
        .first()
    )
    if not use or use.status == REFERRAL_STATUS_CANCELLED:
        return None

    if not use.qualified_at:
        created = use.created_at
        if created is None:
            return None
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if now - created <= timedelta(days=QUALIFIED_WINDOW_DAYS):
            referrer = db.query(User).filter(User.id == use.referrer_id).first()
            same_network = (
                referrer
                and referrer.geo_ip_hash
                and user.geo_ip_hash
                and referrer.geo_ip_hash == user.geo_ip_hash
            )
            if same_network:
                logger.info(
                    "referral qualify skipped same-network referrer=%s referred=%s",
                    referrer.id,
                    user.id,
                )
            else:
                signals = 0
                if user.telegram_id:
                    signals += 1
                if _has_proof(db, user.id):
                    signals += 1
                if (user.login_count or 0) >= 2 or _has_armed_value(db, user.id):
                    signals += 1
                if signals >= 2:
                    use.qualified_at = now

    _sync_referrer_grant(db, use)

    if commit:
        db.commit()
        db.refresh(use)
    return use


def sync_referrer_grant_best_effort(db: Session, use: ReferralUse) -> None:
    """Payment path: unlock can complete on subscribe, not only on qualify."""
    try:
        _sync_referrer_grant(db, use)
    except Exception:
        logger.exception(
            "referral grant sync failed referrer=%s referee=%s",
            getattr(use, "referrer_id", None),
            getattr(use, "referred_id", None),
        )


def evaluate_referral_qualification_best_effort(db: Session, user: User) -> None:
    try:
        evaluate_referral_qualification(db, user, commit=True)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        logger.exception(
            "referral qualification failed user=%s", getattr(user, "id", None)
        )
