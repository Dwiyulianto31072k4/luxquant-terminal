"""Email as a second channel for the messages the subscription worker sends.

It is not a replacement for Telegram. The worker's own comment is the reason:
in-app first because it reaches someone with no Telegram link, then the DM.
Email is the third leg, and it is the only one that reaches a customer who
signed in with Google, never linked Telegram, and has notifications muted.

Nothing here decides *whether* a person is due a message — the worker's
milestone marks already do that, and duplicating the logic is how two channels
drift apart. This module only decides whether we are allowed to write to that
address, builds the mail, and hands it to the transport.

Sending is OFF until EMAIL_LIFECYCLE_ENABLED=1. The switch exists because
turning this on writes to real customers on the next cycle, and that is not a
thing to discover from a log.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from app.services import email_log, email_sender, email_suppression as sup
from app.services import email_templates as tpl

logger = logging.getLogger(__name__)


def enabled() -> bool:
    return os.getenv("EMAIL_LIFECYCLE_ENABLED", "0") == "1" and email_sender.enabled()


def _allowed(db, email: str | None) -> bool:
    return bool(enabled() and sup.deliverable(email) and not sup.is_suppressed(db, email))


async def _send(db, email: str, built, kind: str,
                user_id: int | None = None, unsub: bool = True) -> bool:
    """`built` is whatever a template builder returned: (subject, html).

    Every outcome is written to `email_events`, successes included. A log that
    only holds failures cannot answer "when did we last write to this person",
    which is the whole basis of the frequency cap."""
    subject, html = built
    msg_id = await email_sender.send_email(
        email, subject, html, sup.unsubscribe_url(email) if unsub else None)
    email_log.record(db, email=email, kind=kind, user_id=user_id,
                     status="sent" if msg_id else "failed",
                     provider_id=msg_id if msg_id else None,
                     detail=None if msg_id else subject[:200])
    return bool(msg_id)


def _hours_phrase(h: float) -> str:
    if h <= 1:
        return "within the hour"
    if h < 24:
        return f"in about {int(h)} hours"
    return f"in about {int(round(h / 24))} days"


def _days_phrase(d: float) -> str:
    if d < 1:
        return "today"
    n = int(round(d))
    return "tomorrow" if n == 1 else f"in {n} days"


def _fmt(dt) -> str | None:
    return dt.strftime("%d %b %Y, %H:%M UTC") if dt else None


def _day(dt) -> str | None:
    return dt.strftime("%d %b %Y") if dt else None


async def checkout_open(db, row, hours_left: float) -> bool:
    """An invoice still open. `row` is the worker's SELECT mapping."""
    email = row.get("email")
    if not _allowed(db, email):
        return False

    now = datetime.now(timezone.utc)
    days = row.get("duration_days")
    exp = row.get("subscription_expires_at")
    # finance.py stacks a renewal on top of time still running, so the period
    # this invoice buys does not necessarily start today.
    base = exp if (exp and exp > now) else now
    covers_from = covers_to = None
    if days:
        covers_from = _day(base)
        covers_to = _day(base + timedelta(days=int(days)) - timedelta(days=1))

    try:
        built = tpl.invoice_open(
            row.get("plan_label") or "LuxQuant",
            row.get("amount"),
            _hours_phrase(hours_left),
            sup.unsubscribe_url(email),
            duration_days=days,
            list_price=row.get("list_price"),
            discount=row.get("discount_amount") or 0,
            credit=row.get("credit_redeemed") or 0,
            invoice_no=f"LQ-{row['id']:06d}",
            issued=_fmt(row.get("created_at")),
            expires_at=_fmt(row.get("expires_at")),
            account=row.get("username"),
            telegram=row.get("telegram_username"),
            email=email,
            wallet_to=row.get("wallet_to"),
            covers_from=covers_from,
            covers_to=covers_to,
            extends_existing=bool(exp and exp > now),
        )
    except Exception as e:
        logger.warning("checkout email build failed for payment %s: %s", row.get("id"), e)
        return False
    return await _send(db, email, built, "invoice_open")


async def marketing(db, email: str, subject: str, html: str,
                    kind: str = "campaign") -> bool:
    """Anything that is not about money already moving.

    Two gates the transactional mail does not have: the suppression list AND
    the 14-day cap. `email_log.marketing_allowed` fails closed, so a history we
    cannot read stops the send rather than repeating it."""
    if not _allowed(db, email):
        return False
    if not email_log.marketing_allowed(db, email):
        logger.info("marketing skipped for %s: inside the 14-day window", email)
        return False
    return await _send(db, email, (subject, html), kind)


async def payment_confirmed(db, email: str, **kw) -> bool:
    """A receipt, and receipts are not subject to the unsubscribe list.

    Unsubscribing stops the reminders; it cannot stop the proof of a purchase
    somebody just made. The unsubscribe page says exactly this, and a promise
    made there has to hold here. `deliverable()` still applies — a synthetic
    Telegram address is not a mailbox, and mailing it only earns a bounce.

    No unsubscribe URL is passed, so the mail carries no List-Unsubscribe
    header: offering to turn off a receipt would contradict the same promise.
    """
    if not (enabled() and sup.deliverable(email)):
        return False
    return await _send(db, email, tpl.payment_confirmed(**kw),
                       "payment_confirmed", unsub=False)


async def renewal_due(db, email: str, days_left: float, plan: str | None = None) -> bool:
    if not _allowed(db, email):
        return False
    return await _send(db, email, tpl.renewal_due(
        _days_phrase(days_left), days_left, sup.unsubscribe_url(email), plan=plan),
        "renewal_due")


async def subscription_ended(db, email: str, plan: str | None = None) -> bool:
    if not _allowed(db, email):
        return False
    return await _send(db, email, tpl.subscription_ended(
        sup.unsubscribe_url(email), plan=plan), "subscription_ended")


async def invoice_expired(db, email: str, plan: str, amount, recovery_url: str,
                          duration_days: int | None = None) -> bool:
    if not _allowed(db, email):
        return False
    return await _send(db, email, tpl.invoice_expired(
        plan, amount, recovery_url, sup.unsubscribe_url(email),
        duration_days=duration_days), "invoice_expired")
