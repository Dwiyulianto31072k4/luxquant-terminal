"""DRC clients are never offered the Agent (2026-09-21).

Daily Rekom Crypto's founder asked that its members get no automated
execution. The owner's rule: every current Premium+ holder is refused, whatever
the source of their LuxQuant access. Staff pass, one account can be exempted
by hand, and without a known Premium+ set the gate fails CLOSED for anyone
with a linked Discord account.

Pure: User is instantiated without a database, the Redis readers are stubbed.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models.user import User  # noqa: E402
from app.services import entitlement_audit as ea  # noqa: E402
from app.api.routes import autotrade_auth  # noqa: E402

PREMIUM = {"111", "222"}


def _user(uid=10, discord_id=111, role="subscriber", source="discord_premium", tier="lifetime"):
    return User(id=uid, role=role, discord_id=discord_id, subscription_source=source,
                subscription_tier=tier, email="m@example.com", username="m")


@pytest.fixture(autouse=True)
def stub(monkeypatch):
    state = {"ids": set(PREMIUM), "exempt": set()}
    monkeypatch.setattr(ea, "drc_premium_ids", lambda: state["ids"])
    monkeypatch.setattr(ea, "agent_drc_exempt_ids", lambda: set(state["exempt"]))
    return state


def test_premium_holder_is_blocked():
    assert ea.agent_blocked_by_drc(_user()) is True


@pytest.mark.parametrize("source", ["discord_premium", "lifetime", "legacy", "admin", "payment"])
def test_source_of_access_does_not_matter(source):
    # dantemasamune paid DRC and was added as lifetime by hand; jhevellz is
    # legacy. Both hold Premium+, both are refused.
    assert ea.agent_blocked_by_drc(_user(source=source)) is True


def test_not_a_premium_holder_is_untouched():
    assert ea.agent_blocked_by_drc(_user(discord_id=999)) is False


def test_no_discord_link_is_untouched():
    assert ea.agent_blocked_by_drc(_user(discord_id=None)) is False


@pytest.mark.parametrize("role", User.STAFF_ROLES)
def test_staff_pass(role):
    assert ea.agent_blocked_by_drc(_user(role=role)) is False


def test_exempted_account_passes(stub):
    stub["exempt"].add(10)
    assert ea.agent_blocked_by_drc(_user(uid=10)) is False
    assert ea.agent_blocked_by_drc(_user(uid=11)) is True


def test_unknown_premium_set_fails_closed_for_discord_linked(stub):
    stub["ids"] = None
    assert ea.agent_blocked_by_drc(_user(discord_id=999)) is True
    assert ea.agent_blocked_by_drc(_user(discord_id=None)) is False


def test_entitlement_payload_carries_the_fourth_gate():
    # _entitlement_payload needs a db for has_live_ack; stub that one lookup.
    autotrade_auth_has_ack = autotrade_auth._has_live_ack
    try:
        autotrade_auth._has_live_ack = lambda db, uid: True
        body = autotrade_auth._entitlement_payload(_user(), db=None)
        assert body["partner_blocks_bot"] is True
        assert body["partner_block_title"] == ea.DRC_AGENT_TITLE
        assert body["partner_block_message"] == ea.DRC_AGENT_MESSAGE
        # The plan gate says nothing about DRC: lifetime still "allows" by plan.
        assert body["plan_allows_bot"] is True

        clear = autotrade_auth._entitlement_payload(_user(discord_id=999), db=None)
        assert clear["partner_blocks_bot"] is False
        assert clear["partner_block_message"] is None
    finally:
        autotrade_auth._has_live_ack = autotrade_auth_has_ack


def test_user_property_matches_the_service():
    assert _user().agent_blocked_by_drc is True
    assert _user(discord_id=999).agent_blocked_by_drc is False


def test_message_has_no_em_dash():
    assert "—" not in ea.DRC_AGENT_MESSAGE and "—" not in ea.DRC_AGENT_TITLE
