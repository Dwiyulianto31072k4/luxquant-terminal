import asyncio
import time

from fastapi import HTTPException

from app.api.routes.telegram_auth import TELEGRAM_BOT_TOKEN, telegram_bot_webhook
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


def test_webhook_rejects_missing_secret_and_ignores_stale_queue():
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
            _Request(stale_update, webhook_secret(TELEGRAM_BOT_TOKEN)),
            None,
        )
        assert result["ok"] is True
        assert result["handled"] is False
        assert result["reason"] == "stale"

    asyncio.run(run())
