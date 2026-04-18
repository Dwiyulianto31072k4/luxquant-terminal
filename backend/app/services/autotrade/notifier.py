"""
LuxQuant Terminal - Notifier
Sends Telegram notifications for trade events.

Reuses existing Telegram bot config from .env:
    TELEGRAM_BOT_TOKEN
    TELEGRAM_NOTIFY_CHAT_ID  (admin chat, can be per-user later)

Future: look up per-user telegram_id from users table → DM direct.
"""
import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger("autotrade.notifier")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_NOTIFY_CHAT_ID = os.getenv("TELEGRAM_NOTIFY_CHAT_ID", "")


class Notifier:
    """Send notifications via Telegram bot."""

    async def send_trade_notification(self, user_id: int, trade, event: str):
        """Send trade event notification."""
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_NOTIFY_CHAT_ID:
            return

        emoji = {
            "opened":       "✅",
            "closed_win":   "💰",
            "closed_loss":  "❌",
            "trailing_sl":  "📈",
            "emergency":    "🚨",
            "breakeven":    "🛡️",
            "tp_hit":       "🎯",
        }.get(event, "🔔")

        side_emoji = "🟢" if trade.side == "buy" else "🔴"

        text = (
            f"{emoji} <b>AutoTrade {event.upper()}</b>\n"
            f"{side_emoji} {trade.pair} | {trade.side.upper()}\n"
            f"Exchange: {trade.exchange_id}\n"
            f"Type: {trade.market_type}\n"
        )

        if event == "opened":
            text += (
                f"Entry: ${trade.entry_price or trade.target_entry}\n"
                f"Qty: {trade.qty}\n"
                f"Leverage: {trade.leverage}x\n"
                f"SL: ${trade.sl_price}\n"
            )
        elif "closed" in event:
            text += (
                f"PnL: ${trade.realized_pnl or 0:.2f}\n"
                f"Reason: {trade.close_reason}\n"
            )
        elif event == "trailing_sl":
            text += f"New SL: ${trade.sl_current}\n"
        elif event == "emergency":
            text += f"Action: {trade.close_reason}\n"
        elif event == "breakeven":
            text += f"SL moved to entry: ${trade.sl_current}\n"

        await self._send_telegram(text)

    async def send_alert(self, message: str):
        """Send a generic alert message."""
        await self._send_telegram(f"🚨 <b>Alert</b>\n{message}")

    async def _send_telegram(self, text: str):
        """Send raw text via Telegram Bot API."""
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_NOTIFY_CHAT_ID:
            logger.debug("Telegram not configured, skipping notification")
            return

        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_NOTIFY_CHAT_ID,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    logger.warning(f"Telegram send failed: {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Telegram notification error: {e}")
