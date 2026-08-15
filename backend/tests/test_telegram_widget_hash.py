"""Regression coverage for Telegram Login Widget signature verification.

Paid acquisition metadata is added by LuxQuant after Telegram signs the
identity payload. It must never participate in Telegram's HMAC check.
"""

import hashlib
import hmac

from app.api.routes import telegram_auth
from app.schemas.user import TelegramLogin


def _signed_widget_payload(bot_token: str) -> dict:
    payload = {
        "id": 424242,
        "first_name": "Growth",
        "username": "luxquant_test",
        "auth_date": 1_786_752_000,
    }
    check_string = "\n".join(f"{key}={value}" for key, value in sorted(payload.items()))
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    payload["hash"] = hmac.new(
        secret_key,
        check_string.encode(),
        hashlib.sha256,
    ).hexdigest()
    return payload


def test_internal_acquisition_fields_do_not_break_telegram_hmac():
    bot_token = "test-bot-token"
    previous_token = telegram_auth.TELEGRAM_BOT_TOKEN
    telegram_auth.TELEGRAM_BOT_TOKEN = bot_token
    try:
        login = TelegramLogin(
            **_signed_widget_payload(bot_token),
            referral_code="PARTNER42",
            acq={
                "source": "telegram",
                "medium": "paid_social",
                "campaign": "proof-scale",
                "content": "proof-a",
            },
        )
        assert telegram_auth._verify_telegram_hash(login) is True

        tampered = login.model_copy(update={"first_name": "Changed"})
        assert telegram_auth._verify_telegram_hash(tampered) is False
    finally:
        telegram_auth.TELEGRAM_BOT_TOKEN = previous_token


if __name__ == "__main__":
    test_internal_acquisition_fields_do_not_break_telegram_hmac()
    print("telegram widget HMAC regression: passed")
