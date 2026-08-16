from app.services.telegram_bot_onboarding import (
    BOT_COMMANDS,
    BOT_DESCRIPTION,
    BOT_SHORT_DESCRIPTION,
    command_from_text,
    reply_for_command,
    webhook_secret,
)


def test_profile_stays_within_telegram_limits():
    assert 1 <= len(BOT_DESCRIPTION) <= 512
    assert 1 <= len(BOT_SHORT_DESCRIPTION) <= 120
    assert len({item["command"] for item in BOT_COMMANDS}) == len(BOT_COMMANDS)


def test_command_normalization_supports_payload_and_bot_suffix():
    assert command_from_text("/start lq1p_aug_proof-a") == "start"
    assert command_from_text("/performance@LuxQuantTerminalBot") == "performance"
    assert command_from_text("hello") == "help"


def test_textless_messages_fall_back_to_help():
    """Photos and stickers arrive with no ``text``; they must not raise."""
    assert command_from_text(None) == "help"
    assert command_from_text("") == "help"
    assert command_from_text("   ") == "help"
    assert command_from_text("\n\t") == "help"
    assert command_from_text("/") == "help"


def test_reply_selection_and_webhook_secret_are_deterministic():
    assert "Performance" in reply_for_command("performance")
    assert "contact" in reply_for_command("help")
    assert reply_for_command("unknown") == reply_for_command("start")
    assert webhook_secret("token") == webhook_secret("token")
    assert webhook_secret("token") != webhook_secret("other-token")
