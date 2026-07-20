"""
Entitlement checks for signal visibility — who sees full levels, who gets
the redacted "-" columns and the premium lock.

Why this file exists: three routes each kept a private copy of "is this user
entitled?" and every copy only bypassed role == 'admin'. Result: co_admin and
founder — staff who run the product — saw the same redacted signals and
subscribe prompts as a free user. The copies now delegate to
User.has_active_access; these tests pin that delegation so a fourth copy
can't quietly regress it.

All pure — User is instantiated without a database.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models.user import User  # noqa: E402
from app.api.routes.signals import _user_is_active_subscriber  # noqa: E402
from app.api.routes.signal_journey import _has_active_subscription  # noqa: E402

# Both routes' checks must agree — they are the same question.
CHECKS = [_user_is_active_subscriber, _has_active_subscription]


def _user(role, expires=None):
    return User(role=role, subscription_expires_at=expires)


class TestStaffTiersSeeEverything:
    """The bug: only role == 'admin' bypassed. Every staff tier must."""

    @pytest.mark.parametrize("check", CHECKS)
    @pytest.mark.parametrize("role", User.STAFF_ROLES)
    def test_every_staff_role_is_entitled(self, check, role):
        assert check(_user(role)) is True, f"{role} must see full signals"

    @pytest.mark.parametrize("check", CHECKS)
    def test_the_original_bug_co_admin(self, check):
        # The exact report: co-admin saw redacted columns and premium locks.
        assert check(_user("co_admin")) is True


class TestNonStaffUnchanged:
    """Widening staff access must not loosen anything for members."""

    @pytest.mark.parametrize("check", CHECKS)
    def test_anonymous_is_not_entitled(self, check):
        assert check(None) is False

    @pytest.mark.parametrize("check", CHECKS)
    def test_free_is_not_entitled(self, check):
        assert check(_user("free")) is False

    @pytest.mark.parametrize("check", CHECKS)
    @pytest.mark.parametrize("role", ["premium", "subscriber"])
    def test_active_subscription_is_entitled(self, check, role):
        future = datetime.now(timezone.utc) + timedelta(days=30)
        assert check(_user(role, expires=future)) is True

    @pytest.mark.parametrize("check", CHECKS)
    @pytest.mark.parametrize("role", ["premium", "subscriber"])
    def test_expired_subscription_is_not_entitled(self, check, role):
        past = datetime.now(timezone.utc) - timedelta(days=1)
        assert check(_user(role, expires=past)) is False

    @pytest.mark.parametrize("check", CHECKS)
    @pytest.mark.parametrize("role", ["premium", "subscriber"])
    def test_lifetime_no_expiry_is_entitled(self, check, role):
        assert check(_user(role, expires=None)) is True
