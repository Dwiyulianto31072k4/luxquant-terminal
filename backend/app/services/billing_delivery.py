"""Where a billing document goes, and in what form.

The order is fixed and it is not arbitrary. A customer who has started the bot
reads Telegram; that is where they already get their signals, and a message
there is opened in minutes where a mail is opened in hours. So Telegram first,
with the PDF attached to it, and email only when Telegram cannot be reached.

Email already followed that rule for reminders. This module extends it to the
documents — the invoice and the receipt — and adds the one event that had no
customer-facing message at all: the payment clearing.

Every function is best-effort. A PDF that fails to render must cost the
attachment, never the message beside it, and never the request that triggered it.
"""
from __future__ import annotations

import logging
import os
import tempfile

from app.services import billing_pdf, email_lifecycle, telegram_group

logger = logging.getLogger(__name__)

CHECKOUT_URL = "https://luxquant.tw/payment"


def _money(v) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    return f"{f:,.0f}" if f == int(f) else f"{f:,.2f}"


async def _with_pdf(make, kwargs, telegram_id: int, filename: str,
                    caption: str = "") -> bool:
    """Render to a temp file, send, delete.

    The caption rides ON the document rather than in a message before it: one
    notification, one bubble, and the summary sits against the file it
    describes. Two separate sends put a wall of text above an unexplained
    attachment and rang the phone twice for one event.

    The temp file is removed whether the send worked or not — an invoice left
    on disk is a customer's wallet address and plan sitting in /tmp for no
    reason."""
    path = None
    try:
        fd, path = tempfile.mkstemp(suffix=".pdf", prefix="lq_")
        os.close(fd)
        make(path, **kwargs)
        return await telegram_group.send_document(telegram_id, path, filename, caption)
    except Exception as e:
        logger.warning("billing pdf %s failed: %s", filename, e)
        return False
    finally:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


async def invoice_document(telegram_id: int, *, caption: str = "",
                           invoice_no: str | None = None, **facts) -> bool:
    """The unpaid invoice: one message, the reminder text as the PDF's caption.

    Returns False when nothing was delivered, so the caller can fall back to
    plain text and then to email — a customer must not lose the reminder just
    because a document could not be built."""
    if not telegram_id:
        return False
    name = f"{invoice_no or 'LuxQuant'}-invoice.pdf"
    return await _with_pdf(billing_pdf.invoice_pdf,
                           dict(invoice_no=invoice_no, **facts),
                           telegram_id, name, caption)


def receipt_text(plan: str, amount, access_to: str | None,
                 duration_days: int | None) -> str:
    """Short, and it leads with what they now have.

    The amount left their wallet a minute ago — they know it. What they cannot
    see is the date it runs to, and that is the line worth putting first."""
    until = ("never — Lifetime" if duration_days is None
             else (access_to or "your account"))
    # Only the figure goes in <code>. Wrapping "50 USDT" in it renders the gap
    # between number and unit at monospace width, which reads as two values.
    return (
        "<b>Payment confirmed</b>\n\n"
        f"<b>{plan}</b> access — open until <b>{until}</b>\n"
        f"Paid <code>{_money(amount)}</code> USDT\n\n"
        "VIP group and the full terminal are unlocked. "
        "This PDF is your receipt."
    )


async def deliver_receipt(db, *, telegram_id: int | None, email: str | None,
                          **facts) -> str:
    """Telegram (text + PDF) if the bot can reach them, else email.

    Returns the channel used, so the caller can log which one carried it rather
    than guessing from the absence of an error."""
    plan = facts.get("plan", "LuxQuant")
    if telegram_id:
        text = receipt_text(plan, facts.get("amount"),
                            facts.get("access_to"), facts.get("duration_days"))
        name = f"{facts.get('receipt_no') or 'LuxQuant'}-receipt.pdf"
        try:
            # One message: the receipt, captioned with its own summary.
            if await _with_pdf(billing_pdf.receipt_pdf, facts,
                               telegram_id, name, text):
                return "telegram"
            # The document could not be built or sent. The confirmation still
            # has to arrive — a customer who paid and heard nothing assumes it
            # failed — so the text goes on its own.
            if await telegram_group.send_dm(telegram_id, text):
                return "telegram"
        except Exception as e:
            logger.warning("receipt DM failed: %s", e)

    try:
        if await email_lifecycle.payment_confirmed(db, email, **facts):
            return "email"
    except Exception as e:
        logger.warning("receipt email failed: %s", e)
    return "none"
