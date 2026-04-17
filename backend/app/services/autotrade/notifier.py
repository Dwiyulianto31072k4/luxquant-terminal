"""
LuxQuant Terminal - Notifier
Sends Telegram notifications for trade events.
Uses existing Telegram bot (@LuxQuantTerminalBot).
"""
import os
import logging
import httpx
from typing import Optional

logger = logging.getLogger("autotrade.notifier")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_NOTIFY_CHAT_ID = os.getenv("TELEGRAM_NOTIFY_CHAT_ID", "")


class Notifier:
    """Send notifications via Telegram bot."""

    async def send_trade_notification(
        self,
        user_id: int,
        trade,
        event: str,
    ):
        """Send trade event notification."""
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_NOTIFY_CHAT_ID:
            return

        emoji = {
            "opened": "\u2705",
            "closed_win": "\U0001f4b0",
            "closed_loss": "\u274c",
            "trailing_sl": "\U0001f4c8",
            "emergency": "\U0001f6a8",
            "breakeven": "\U0001f6e1",
            "tp_hit": "\U0001f3af",
        }.get(event, "\U0001f514")

        side_emoji = "\U0001f7e2" if trade.side == "buy" else "\U0001f534"

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

        await self._send_telegram(text)

    async def send_alert(self, message: str):
        """Send generic alert."""
        await self._send_telegram(f"\U0001f6a8 <b>Alert</b>\n{message}")

    async def _send_telegram(self, text: str):
        """Send message via Telegram Bot API."""
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
