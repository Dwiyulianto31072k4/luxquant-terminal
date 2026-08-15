"""Telegram Terminal Bot onboarding contract.

The bot is a paid-acquisition destination, so its profile, commands, webhook,
and replies must stay reproducible in source control.  This module deliberately
contains no token; production injects ``TELEGRAM_BOT_TOKEN`` through systemd.
"""
from __future__ import annotations

import hashlib
import hmac


BOT_DESCRIPTION = (
    "LuxQuant is a quantitative market-intelligence terminal with transparent "
    "historical signal records, market data, on-chain context, and risk tools. "
    "Open the Mini App to explore free. Historical results are not guarantees. "
    "Not financial advice."
)

BOT_SHORT_DESCRIPTION = (
    "Market intelligence, transparent signal records, risk tools, and the LuxQuant Mini App."
)

BOT_COMMANDS = [
    {"command": "start", "description": "Open LuxQuant and see what is included"},
    {"command": "terminal", "description": "Open the LuxQuant Mini App"},
    {"command": "performance", "description": "Audit the transparent signal record"},
    {"command": "help", "description": "Get help and contact support"},
]

WELCOME_TEXT = (
    "Welcome to LuxQuant.\n\n"
    "Explore quantitative market intelligence, transparent historical signal "
    "records, on-chain context, and risk tools.\n\n"
    "Start free in the Mini App. Historical results are not guarantees. "
    "Not financial advice."
)

PERFORMANCE_TEXT = (
    "Audit the LuxQuant Performance record: published calls include their target "
    "and stop outcomes. Historical results are not guarantees."
)

HELP_TEXT = (
    "Use Open Terminal to enter the Mini App, or View Performance to inspect the "
    "historical record. For account or billing help, contact @luxquantadmin."
)


def webhook_secret(bot_token: str) -> str:
    """Stable Bot API webhook secret without storing another credential."""
    if not bot_token:
        return ""
    return hmac.new(
        bot_token.encode("utf-8"),
        b"luxquant-terminal-bot-webhook-v1",
        hashlib.sha256,
    ).hexdigest()


def command_from_text(text: object) -> str:
    """Normalize ``/start payload`` and ``/start@BotName`` to ``start``."""
    first = str(text or "").strip().split(maxsplit=1)[0].lower()
    if not first.startswith("/"):
        return "help"
    return first[1:].split("@", 1)[0] or "help"


def reply_for_command(command: str) -> str:
    if command == "performance":
        return PERFORMANCE_TEXT
    if command == "help":
        return HELP_TEXT
    return WELCOME_TEXT


__all__ = [
    "BOT_COMMANDS",
    "BOT_DESCRIPTION",
    "BOT_SHORT_DESCRIPTION",
    "HELP_TEXT",
    "PERFORMANCE_TEXT",
    "WELCOME_TEXT",
    "command_from_text",
    "reply_for_command",
    "webhook_secret",
]
