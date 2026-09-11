"""What was sent, what failed, and what the provider said afterwards.

One table behind three things that would otherwise each grow their own:

  · admin visibility — you cannot run a sending domain you cannot see
  · the marketing frequency cap — "once per 14 days" is a question about
    history, and history has to be written down somewhere
  · bounce and complaint handling — the provider reports those minutes or
    hours later, against a message id we have to have kept

Writing a row must never be able to break a send. Every function here swallows
its own failures: an unlogged email is a gap in a report, a raised exception in
a worker cycle is a customer who never hears from us.
"""
from __future__ import annotations

import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)

TRANSACTIONAL = "transactional"
MARKETING = "marketing"

# Anything about money already moving or access already bought. These are never
# rationed and never counted against the marketing cap — a receipt withheld
# because someone got a newsletter last week is indefensible.
TRANSACTIONAL_KINDS = {
    "invoice_open", "invoice_expired", "renewal_due",
    "subscription_ended", "payment_confirmed",
}

DDL = """
CREATE TABLE IF NOT EXISTS email_events (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    user_id     INTEGER,
    kind        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'transactional',
    status      TEXT NOT NULL,
    provider_id TEXT,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_email_events_email_time
    ON email_events (email, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_email_events_time
    ON email_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_email_events_provider
    ON email_events (provider_id);
"""


def category_for(kind: str) -> str:
    return TRANSACTIONAL if kind in TRANSACTIONAL_KINDS else MARKETING


def record(db, *, email: str, kind: str, status: str,
           user_id: int | None = None, provider_id: str | None = None,
           detail: str | None = None) -> None:
    try:
        db.execute(
            text("""
                INSERT INTO email_events
                    (email, user_id, kind, category, status, provider_id, detail)
                VALUES (:e, :u, :k, :c, :s, :p, :d)
            """),
            {"e": (email or "")[:255].lower(), "u": user_id, "k": kind[:60],
             "c": category_for(kind), "s": status[:30],
             "p": (provider_id or None), "d": (detail or None) and detail[:400]},
        )
        db.commit()
    except Exception as e:
        logger.warning("email_events insert failed (%s/%s): %s",
                       kind, status, type(e).__name__)
        try:
            db.rollback()
        except Exception:
            pass


def mark_by_provider_id(db, provider_id: str, status: str,
                        detail: str | None = None) -> int:
    """A bounce or complaint arrives later, keyed on the provider's id."""
    try:
        res = db.execute(
            text("""UPDATE email_events SET status = :s,
                           detail = COALESCE(:d, detail)
                    WHERE provider_id = :p"""),
            {"s": status[:30], "d": (detail or None) and detail[:400],
             "p": provider_id},
        )
        db.commit()
        return res.rowcount or 0
    except Exception as e:
        logger.warning("email_events update failed: %s", type(e).__name__)
        try:
            db.rollback()
        except Exception:
            pass
        return 0


def marketing_allowed(db, email: str, days: int = 14) -> bool:
    """One marketing mail per address per 14 days, counted from what was
    actually sent rather than from an intention.

    Fails CLOSED — a history we cannot read is not permission to mail again.
    The cost of being wrong in the other direction is somebody receiving two
    campaigns in a week, which is exactly the thing the rule exists to stop.
    """
    if not email:
        return False
    try:
        row = db.execute(
            text("""
                SELECT 1 FROM email_events
                WHERE email = :e AND category = 'marketing'
                  AND status IN ('sent', 'delivered')
                  AND created_at > NOW() - make_interval(days => :d)
                LIMIT 1
            """),
            {"e": email.strip().lower(), "d": days},
        ).first()
        return row is None
    except Exception as e:
        logger.warning("marketing cap check failed for %s: %s",
                       email, type(e).__name__)
        return False
