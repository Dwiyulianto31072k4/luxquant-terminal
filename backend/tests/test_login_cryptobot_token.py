"""A sign-in hands out an Agent exchange token only to accounts that can use it.

Every free account's login used to exchange one and be refused with a 403 by the
Agent (41 in two days). The Agent page still mints its own on demand.
"""
from types import SimpleNamespace

from app.core import security


def _user(active):
    return SimpleNamespace(id=7, email="a@b.c", role="user", has_active_access=active,
                           telegram_id=None, telegram_username=None)


def test_no_token_without_active_access():
    assert security.login_cryptobot_token(_user(False)) is None


def test_active_access_gets_the_exchange_token():
    saved = security.LUXQUANT_JWT_SECRET
    security.LUXQUANT_JWT_SECRET = "test-secret"
    try:
        assert security.login_cryptobot_token(_user(True))
    finally:
        security.LUXQUANT_JWT_SECRET = saved
