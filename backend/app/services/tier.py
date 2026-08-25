# backend/app/services/tier.py
"""
One definition of what shape an entitlement has.

`subscription_expires_at` says WHEN access ends and `subscription_source` says
WHERE it came from, but neither can tell monthly from yearly — both are just a
date in the future. That is what `subscription_tier` records.

Kept in one module because the answer is written from four different places
(purchase, admin grant, manual finance approval, referral reward) and they must
not drift into four slightly different definitions of "yearly".
"""
from __future__ import annotations

from typing import Optional

LIFETIME = "lifetime"
MONTHLY = "monthly"
YEARLY = "yearly"
CUSTOM = "custom"

ALL_TIERS = (LIFETIME, MONTHLY, YEARLY, CUSTOM)

# Windows, not exact matches: a grant made at 09:00 and expiring at 23:59:59 on
# the last day is still a month, and admin "custom" dates land a day either side
# of a round number often enough that exact equality would mislabel them.
_MONTH = (25, 35)
_YEAR = (350, 380)


def tier_from_days(days: Optional[float]) -> str:
    """Tier for a term of `days`. None (no expiry) is lifetime."""
    if days is None:
        return LIFETIME
    if _MONTH[0] <= days <= _MONTH[1]:
        return MONTHLY
    if _YEAR[0] <= days <= _YEAR[1]:
        return YEARLY
    return CUSTOM


def tier_from_plan(plan) -> str:
    """Tier for a `SubscriptionPlan` row.

    Prefers the plan's own name when it is already one we know — a plan called
    `yearly` stays `yearly` even if somebody edits its duration to 366 days —
    and falls back to the duration otherwise.
    """
    if plan is None:
        return CUSTOM
    name = (getattr(plan, "name", "") or "").strip().lower()
    if name in ALL_TIERS:
        return name
    return tier_from_days(getattr(plan, "duration_days", None))


def tier_from_dates(granted_at, expires_at) -> str:
    """Tier implied by a grant window. Used where no plan row exists — admin
    grants and legacy records, which is most of the member base."""
    if expires_at is None:
        return LIFETIME
    if granted_at is None:
        return CUSTOM
    return tier_from_days((expires_at - granted_at).total_seconds() / 86400)
