import asyncio
from types import SimpleNamespace

from app.api.routes import telegram_auth


class _Db:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


def test_write_access_confirmation_verifies_delivery(monkeypatch):
    sent = []

    async def fake_send(telegram_id, message):
        sent.append((telegram_id, message))
        return True

    monkeypatch.setattr(telegram_auth, "send_dm", fake_send)
    user = SimpleNamespace(telegram_id=123, telegram_bot_started_at=None)
    db = _Db()

    result = asyncio.run(telegram_auth.confirm_telegram_write_access(user, db))
    assert result == {"ok": True, "verified": True, "already_verified": False}
    assert sent and sent[0][0] == 123
    assert user.telegram_bot_started_at is not None
    assert db.commits == 1


def test_write_access_confirmation_is_idempotent(monkeypatch):
    async def should_not_send(*_args, **_kwargs):
        raise AssertionError("already verified users must not get another DM")

    monkeypatch.setattr(telegram_auth, "send_dm", should_not_send)
    user = SimpleNamespace(telegram_id=123, telegram_bot_started_at=object())
    result = asyncio.run(telegram_auth.confirm_telegram_write_access(user, _Db()))
    assert result["already_verified"] is True
