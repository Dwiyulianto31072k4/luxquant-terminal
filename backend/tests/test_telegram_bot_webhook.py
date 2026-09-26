import asyncio
import time

from fastapi import HTTPException

from app.api.routes import telegram_auth
from app.api.routes.telegram_auth import telegram_bot_webhook
from app.services.telegram_bot_onboarding import webhook_secret


class _Request:
    def __init__(self, body, secret=""):
        self._body = body
        self.headers = (
            {"x-telegram-bot-api-secret-token": secret}
            if secret
            else {}
        )

    async def json(self):
        return self._body


def test_webhook_rejects_missing_secret_and_ignores_stale_queue(monkeypatch):
    # With no bot token the gate refuses everything, the right secret included,
    # and CI has none: this only ever passed where a real token was in the env.
    monkeypatch.setattr(telegram_auth, "TELEGRAM_BOT_TOKEN", "123456:ci-test-token")

    async def run():
        try:
            await telegram_bot_webhook(_Request({}), None)
            raise AssertionError("webhook accepted a missing secret")
        except HTTPException as exc:
            assert exc.status_code == 403

        stale_update = {
            "message": {
                "date": int(time.time()) - 600,
                "chat": {"id": 123, "type": "private"},
                "from": {"id": 123},
                "text": "/start",
            }
        }
        result = await telegram_bot_webhook(
            _Request(stale_update, webhook_secret(telegram_auth.TELEGRAM_BOT_TOKEN)),
            None,
        )
        assert result["ok"] is True
        assert result["handled"] is False
        assert result["reason"] == "stale"

    asyncio.run(run())
