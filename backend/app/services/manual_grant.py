# backend/app/services/manual_grant.py
"""
Turning a recorded off-web payment into access.

Two callers need this and must not drift apart: the admin recording a payment
directly, and a payer claiming an offer link. Both end in the same four
questions — how long, stacked onto what, which tier, and what does the
subscription worker see afterwards — so both ask them here.

Nothing in this module writes an audit note or a payment row; those differ
between the two callers and belong to them.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from app.services.tier import tier_from_dates


def resolve_duration_days(plan, override: Optional[int]) -> Optional[int]:
    """Days of access, or None for lifetime.

    `override` wins when present — that is the whole point of it. It exists for
    the cases no plan row describes: a negotiated discount, or a few days of
    access while somebody decides. `0` is a valid override meaning lifetime,
    matching how a plan expresses the same thing.
    """
    if override is not None:
        return None if override == 0 else override
    days = getattr(plan, "duration_days", None)
    return None if (days is None or days == 0) else days


def compute_expiry(
    user,
    plan,
    *,
    duration_days: Optional[int] = None,
    effective_date: Optional[datetime] = None,
) -> Optional[datetime]:
    """When access should end. None means lifetime.

    Stacks onto whatever the user already has if it is still in the future, so
    paying again mid-term extends rather than truncates — someone who renews
    early must never lose the days they already bought.
    """
    effective_date = effective_date or datetime.now(timezone.utc)
    days = resolve_duration_days(plan, duration_days)
    if days is None:
        return None

    existing = getattr(user, "subscription_expires_at", None)
    base = existing if (existing and existing > effective_date) else effective_date
    return base + timedelta(days=days)


def apply_grant(
    user,
    *,
    expires_at: Optional[datetime],
    granted_by_id: Optional[int],
    source: str,
    note: str,
    now: Optional[datetime] = None,
) -> None:
    """Put the access on the account. Caller commits."""
    now = now or datetime.now(timezone.utc)

    user.role = "subscriber"
    user.subscription_expires_at = expires_at
    user.subscription_tier = tier_from_dates(now, expires_at)

    # Access is (re)granted → drop any stale VIP grace, or the subscription
    # worker will go on sending expiry reminders and eventually kick a member
    # who has just paid.
    if hasattr(user, "telegram_grace_until"):
        user.telegram_grace_until = None
    if hasattr(user, "subscription_granted_by"):
        user.subscription_granted_by = granted_by_id
    if hasattr(user, "subscription_granted_at"):
        user.subscription_granted_at = now
    if hasattr(user, "subscription_source"):
        user.subscription_source = source
    if hasattr(user, "subscription_note"):
        user.subscription_note = note


def describe_duration(plan, override: Optional[int]) -> str:
    """Human label for what is being granted — used in notes and on the claim
    page, so the payer reads the same words the audit trail records."""
    days = resolve_duration_days(plan, override)
    if days is None:
        return "Lifetime"
    if days % 365 == 0 and days >= 365:
        n = days // 365
        return f"{n} year" if n == 1 else f"{n} years"
    if days % 30 == 0 and days >= 30:
        n = days // 30
        return f"{n} month" if n == 1 else f"{n} months"
    return f"{days} day" if days == 1 else f"{days} days"
