import asyncio
from datetime import datetime, timezone

from app.services import subscription_worker


class _Db:
    def rollback(self):
        pass


def test_expired_checkout_recovery_sends_verified_dm(monkeypatch):
    notifications = []
    queued = []

    monkeypatch.setattr(subscription_worker, "notification_exists", lambda *_args, **_kw: False)
    monkeypatch.setattr(
        subscription_worker,
        "create_notification",
        lambda *_args, **kwargs: notifications.append(kwargs),
    )
    monkeypatch.setattr(
        subscription_worker,
        "_queue_payment_followup",
        lambda *_args, **_kwargs: queued.append(True),
    )

    async def fake_dm(_telegram_id, message):
        assert "No access was removed" in message
        return True

    monkeypatch.setattr(subscription_worker, "send_dm", fake_dm)
    rows = [
        {
            "id": 42,
            "user_id": 7,
            "amount": 50,
            "plan_label": "Monthly",
            "telegram_id": 123,
            "telegram_bot_started_at": datetime.now(timezone.utc),
        }
    ]

    result = asyncio.run(
        subscription_worker._send_expired_payment_recoveries(
            _Db(), rows, datetime.now(timezone.utc)
        )
    )
    assert result == {"notified": 1, "dm_sent": 1, "queued": 0}
    assert notifications[0]["type"] == "checkout_expired"
    assert not queued


def test_expired_checkout_recovery_queues_when_telegram_is_not_ready(monkeypatch):
    monkeypatch.setattr(subscription_worker, "notification_exists", lambda *_args, **_kw: False)
    monkeypatch.setattr(subscription_worker, "create_notification", lambda *_args, **_kwargs: 1)
    monkeypatch.setattr(subscription_worker, "send_dm", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        subscription_worker,
        "_queue_payment_followup",
        lambda *_args, **_kwargs: True,
    )
    rows = [
        {
            "id": 43,
            "user_id": 8,
            "amount": 50,
            "plan_label": "Monthly",
            "telegram_id": 456,
            "telegram_bot_started_at": None,
        }
    ]

    result = asyncio.run(
        subscription_worker._send_expired_payment_recoveries(
            _Db(), rows, datetime.now(timezone.utc)
        )
    )
    assert result == {"notified": 1, "dm_sent": 0, "queued": 1}
