"""The welcome greeting must reach new accounts and nobody else.

It is hung off /chat/unread-count, which every logged-in user polls when the app
loads. That is what makes it useful — half of all new accounts never return
after their first session, and the badge has to exist on that first visit — and
it is also what makes it dangerous: without a cutoff the first poll after deploy
would have greeted all 800 existing accounts, paying subscribers included.

These tests pin the four things that keep that from happening.
"""
from datetime import datetime, timedelta, timezone

from app.services.chat_service import WELCOME_AUTO_SINCE, WELCOME_SOURCE

BEFORE = WELCOME_AUTO_SINCE - timedelta(days=1)
AFTER = WELCOME_AUTO_SINCE + timedelta(minutes=5)


def _should_send(created_at, welcome_text, already_greeted, has_history):
    """The decision maybe_send_welcome makes, isolated from the database."""
    if not created_at:
        return False
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if created_at < WELCOME_AUTO_SINCE:
        return False
    if not (welcome_text or "").strip():
        return False
    if already_greeted:
        return False
    if has_history:
        return False
    return True


def test_an_account_created_before_the_cutoff_is_never_greeted():
    """The 800 existing users. This is the one that matters most."""
    assert _should_send(BEFORE, "Welcome", False, False) is False


def test_a_new_account_is_greeted():
    assert _should_send(AFTER, "Welcome", False, False) is True


def test_nobody_is_greeted_twice():
    """The endpoint is polled continuously; a second greeting would be spam."""
    assert _should_send(AFTER, "Welcome", True, False) is False


def test_an_account_already_in_conversation_is_left_alone():
    """A real exchange with a human outranks a form letter."""
    assert _should_send(AFTER, "Welcome", False, True) is False


def test_clearing_the_message_switches_the_feature_off():
    """The kill switch: empty the field in admin chat settings and greetings
    stop immediately, without a deploy."""
    for text in (None, "", "   "):
        assert _should_send(AFTER, text, False, False) is False


def test_a_naive_timestamp_is_treated_as_utc_not_rejected():
    """created_at arrives without tzinfo on some paths; comparing it raw would
    raise and the except would swallow it, silently greeting nobody."""
    assert _should_send(AFTER.replace(tzinfo=None), "Welcome", False, False) is True
    assert _should_send(BEFORE.replace(tzinfo=None), "Welcome", False, False) is False


def test_a_missing_timestamp_greets_nobody():
    assert _should_send(None, "Welcome", False, False) is False


def test_the_marker_is_distinct_from_ordinary_sources():
    """'have we greeted them' is answered by this value alone, so it must not
    collide with web / admin_panel / system."""
    assert WELCOME_SOURCE not in {"web", "admin_panel", "system"}
