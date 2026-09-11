"""Sending side of LuxQuant mail.

Deliberately small: one function that sends, returns True/False, and never
raises into a caller's cycle. The subscription worker already treats a failed
DM this way — it queues a human follow-up rather than retrying forever — and
email joins that pattern instead of inventing a second one.

The key is read from the environment at call time, never logged, and never
included in an exception message.
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

API_URL = "https://api.resend.com/emails"
FROM = os.getenv("RESEND_FROM", "LuxQuant <no-reply@mail.luxquant.tw>")
TIMEOUT = float(os.getenv("RESEND_TIMEOUT_SECONDS", "20"))


def enabled() -> bool:
    return bool(os.getenv("RESEND_API_KEY"))


async def send_email(to: str, subject: str, html: str,
                     unsubscribe_url: str | None = None) -> str | None:
    """One message. Returns the provider's message id when it was accepted.

    A string, not a bool, and every caller still reads it as one — a non-empty
    id is truthy, None is falsy. The id is what a bounce or complaint arrives
    against hours later, so a send that does not keep it can never be told
    apart from one that was quietly rejected by the recipient's server.
    """
    key = os.getenv("RESEND_API_KEY")
    if not key:
        logger.warning("email skipped: RESEND_API_KEY not set")
        return None
    if not to or "@" not in to:
        return None
    # Synthetic addresses minted for Telegram/Discord sign-ins go nowhere; mailing
    # them earns bounces, and bounces are what cost a young domain its reputation.
    if to.lower().endswith(("@telegram.luxquant.tw", "@discord.luxquant.tw")):
        return None

    payload = {"from": FROM, "to": [to], "subject": subject, "html": html}
    headers = {"Authorization": f"Bearer {key}"}
    if unsubscribe_url:
        # Gmail requires one-click unsubscribe from bulk senders, and honouring it
        # is cheaper than being filtered for ignoring it.
        payload["headers"] = {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(API_URL, json=payload, headers=headers)
    except Exception as e:                       # never let mail break a cycle
        logger.warning("email transport failed for %s: %s", to, type(e).__name__)
        return None

    if r.status_code >= 400:
        # Body can echo the request; log the status and Resend's message only.
        try:
            msg = (r.json() or {}).get("message", "")
        except Exception:
            msg = ""
        logger.warning("email rejected for %s: HTTP %s %s", to, r.status_code, msg[:120])
        return None

    try:
        msg_id = (r.json() or {}).get("id")
    except Exception:
        msg_id = None
    logger.info("email sent to %s: %s", to, subject[:60])
    # Accepted but with no id is still accepted; a sentinel keeps the return
    # truthy so a caller cannot read "delivered" as "failed".
    return msg_id or "accepted"
