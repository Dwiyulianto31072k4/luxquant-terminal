"""Work the payment follow-up queue that nobody has ever worked.

`_queue_payment_followup` writes a row whenever an invoice lapses and the DM
could not be delivered — a marker meaning "no channel reached this person, a
human should". No human ever did. Measured 2026-09-09: 60 rows, oldest 15 Aug,
`reminder_sent_at` NULL on every single one, and 59 of the 60 still have not
paid. That is the highest-intent cohort in the database — they got as far as
generating an invoice — sitting untouched for three weeks.

Two things had to exist before this could run, and now both do: the DM gate is
gone (the flag it depended on was set for 12 of 547 accounts), and email exists
as a fallback.

Three rules this holds to:

  · It is MARKETING, not transactional. An invoice that died three weeks ago is
    not news about their money any more; it is us asking for a second go. So it
    counts against the 14-day cap and it honours the suppression list, both of
    which transactional mail is exempt from.
  · It drains slowly. A domain that has sent five emails and then sends sixty
    looks exactly like a domain that has been compromised.
  · It never contacts someone who has since paid.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy import text

from app.services import billing_delivery, email_lifecycle, email_log
from app.services import email_suppression as sup
from app.services.telegram_group import can_message, send_dm

logger = logging.getLogger(__name__)

# Per cycle, not per run. The worker ticks every 5 minutes, so the whole
# backlog takes hours rather than seconds — which is the point.
PER_CYCLE = int(os.getenv("PAYMENT_RECOVERY_PER_CYCLE", "3"))
ENABLED = os.getenv("PAYMENT_RECOVERY_ENABLED", "0") == "1"
RESTART_URL = "https://luxquant.tw/pricing"


# Past this many days, "your checkout lapsed" stops being news and starts
# sounding like a company that has only just noticed. The reader knows exactly
# how long it has been; a message that does not is a message written by someone
# who was not paying attention.
STALE_AFTER_DAYS = int(os.getenv("PAYMENT_RECOVERY_STALE_DAYS", "45"))


def _msg(plan: str, when: str, age_days: float = 0) -> str:
    """Two framings, chosen by how long ago it actually was."""
    if age_days >= STALE_AFTER_DAYS:
        # Months later the honest move is to stop talking about the invoice.
        # It is dead, they know it is dead, and reviving a corpse reads as a
        # script. What is worth saying is what has happened since — and the
        # track record is the one claim here that can be checked from outside.
        return (
            f"You looked at {plan} back in {when} and did not finish — no charge "
            "was ever made.\n\n"
            "Since then the public record has kept running, and you can audit "
            "every call on it without an account: "
            "https://luxquant.tw/performance\n\n"
            f"If it still looks worth it, the plan and price are unchanged: "
            f"{RESTART_URL}\n\n"
            "If not, ignore this — I will not chase it again."
        )
    return (
        f"You started a {plan} checkout on {when} and it lapsed before the "
        "payment came through.\n\n"
        "Nothing was charged, and nothing was removed from your account.\n\n"
        f"The plan and the price are unchanged if you would like to pick it "
        f"up: {RESTART_URL}\n\n"
        "If you ran into a problem paying, reply here and a human will read it."
    )


def _html(plan: str, when: str, email: str, age_days: float = 0) -> tuple[str, str]:
    """`email` is not decoration: the unsubscribe link in the footer has to be
    signed for THIS recipient. Baking one address into the template would hand
    every reader a link that unsubscribes somebody else."""
    from app.services import email_templates as tpl
    if age_days >= STALE_AFTER_DAYS:
        body = (
            tpl._h("The record kept running")
            + tpl._p(f"You looked at {plan} back in {when} and did not finish. No "
                     "charge was ever made.")
            + tpl._p('Since then the public track record has carried on, and you '
                     'can audit every call on it without an account: '
                     '<a href="https://luxquant.tw/performance" style="color:'
                     f'{tpl.GOLD};">luxquant.tw/performance</a>.')
            + tpl._button("See the plans", RESTART_URL)
            + tpl._note("If it is not for you, ignore this — I will not chase it "
                        "again.")
        )
        return (f"The LuxQuant record since you last looked",
                tpl.wrap("Since you last looked",
                         "No charge was ever made. The record is public either way.",
                         body, sup.unsubscribe_url(email), kicker="Checkout"))

    body = (
        tpl._h("Your checkout never finished")
        + tpl._p(f"You started a {plan} checkout on {when} and it lapsed before "
                 "the payment came through. Nothing was charged, and nothing was "
                 "removed from your account.")
        + tpl._p("The plan and the price are unchanged if you would like to pick "
                 "it up.")
        + tpl._button("Start again", RESTART_URL)
        + tpl._note("If you ran into a problem paying, reply to this email and a "
                    "person will read it.")
    )
    return (f"Your {plan} checkout never finished",
            tpl.wrap("Checkout not finished",
                     "Nothing was charged. Pick it up whenever you like.",
                     body, sup.unsubscribe_url(email), kicker="Checkout"))


async def run(db, now) -> dict:
    """One cycle's worth. Returns what happened, for the worker's log line."""
    if not ENABLED:
        return {"skipped": "disabled"}

    rows = db.execute(
        text("""
            SELECT f.id, f.user_id, f.title, f.created_at,
                   u.telegram_id, u.email, u.role
            FROM admin_followups f
            JOIN users u ON u.id = f.user_id
            WHERE f.status = 'pending'
              AND f.category = 'payment'
              AND f.reminder_sent_at IS NULL
              -- Someone who paid after the row was written needs nothing.
              AND u.role NOT IN ('premium', 'subscriber')
              -- Only rows we can actually act on. An unreachable row is
              -- deliberately never stamped so it can be retried, which means
              -- that if it is also among the newest it is selected every
              -- cycle, fails every cycle, and blocks the queue behind it
              -- forever. Head-of-line blocking, observed live: the drain
              -- stopped dead at 10 of 60. Someone with no channel at all is a
              -- job for a human, not for this worker.
              AND (u.telegram_bot_started_at IS NOT NULL
                   OR (u.email IS NOT NULL
                       AND u.email NOT LIKE '%@telegram.luxquant.tw'
                       AND u.email NOT LIKE '%@discord.luxquant.tw'))
              -- Skip rows the 14-day cap would refuse anyway. A capped row is
              -- correct to skip but still burns a slot on every pass, and the
              -- cap lasts a fortnight — long enough to hold up the queue behind
              -- it. Someone with two dead invoices is the common case: they are
              -- one person and get told once, so the sibling row waits.
              --
              -- This is a PRE-FILTER, not the rule. email_log.marketing_allowed
              -- is still the authority and still runs; this only stops the
              -- worker spending a slot to be told no. It does not apply to a
              -- Telegram DM, which the cap never governed.
              AND (u.telegram_bot_started_at IS NOT NULL
                   OR NOT EXISTS (
                        SELECT 1 FROM email_events e
                         WHERE e.email = lower(u.email)
                           AND e.category = 'marketing'
                           AND e.status IN ('sent', 'delivered')
                           AND e.created_at > now() - interval '14 days'))
            -- Least-recently-attempted first, NOT newest first.
            --
            -- "Not stamped" means "try again", and with a newest-first order
            -- that turns any row which cannot be sent right now into a
            -- permanent blockage at the head of the queue. Watched it happen
            -- twice: once with a row whose user has no channel at all, and
            -- again with two rows that are individually correct to skip — one
            -- user has blocked the bot and has no mailbox, the other is inside
            -- the 14-day marketing cap and will be for a fortnight. Both are
            -- right to skip and both jammed everything behind them.
            --
            -- Every attempt touches updated_at, so a row that cannot be sent
            -- goes to the back and the queue rotates instead of stalling.
            ORDER BY f.updated_at ASC NULLS FIRST
            LIMIT :n
        """),
        {"n": PER_CYCLE},
    ).mappings().all()

    out = {"considered": len(rows), "telegram": 0, "email": 0, "none": 0}
    for r in rows:
        # "Recover expired Monthly invoice #424" -> "Monthly"
        title = r["title"] or ""
        plan = "LuxQuant"
        for candidate in ("Monthly", "Annual", "Lifetime"):
            if candidate in title:
                plan = candidate
                break
        # Age decides the framing, so it has to be measured rather than assumed.
        age_days = 0.0
        when = "recently"
        if r["created_at"]:
            age_days = (now - r["created_at"]).total_seconds() / 86400.0
            when = r["created_at"].strftime("%B" if age_days >= STALE_AFTER_DAYS else "%d %b")

        reached = None
        if r["telegram_id"]:
            try:
                if await send_dm(r["telegram_id"], _msg(plan, when, age_days)):
                    reached = "telegram"
            except Exception as e:
                logger.warning("recovery DM failed for followup %s: %s", r["id"], e)

        # A row with no mailbox whose DM failed can never be sent by this
        # worker. Left alone it rotates forever, taking a slot on every pass
        # and never being actioned by anyone.
        #
        # The flag it passed the filter on is stale: it was backfilled from a
        # reachability probe and the user has blocked the bot since. Ask
        # Telegram again — sendChatAction separates "blocked" from "the network
        # had a bad moment", and only a definite no clears the flag.
        if reached is None and r["telegram_id"] and not sup.deliverable(r["email"]):
            still_ok = await can_message(r["telegram_id"])
            if still_ok is False:
                db.execute(text('UPDATE users SET telegram_bot_started_at = NULL, updated_at = NOW() WHERE id = :id'), {"id": r["user_id"]})
                db.commit()
                logger.warning(
                    "followup %s: user %s blocked the bot and has no mailbox — "
                    "flag cleared, this one needs a person",
                    r["id"], r["user_id"])

        if reached is None:
            try:
                subject, html = _html(plan, when, r["email"], age_days)
                if await email_lifecycle.marketing(db, r["email"], subject, html,
                                                   kind="invoice_recovery"):
                    reached = "email"
            except Exception as e:
                logger.warning("recovery email failed for followup %s: %s", r["id"], e)

        # Touched whatever happened. An attempt is a fact worth recording even
        # when it sent nothing — it is what moves this row to the back.
        db.execute(text("UPDATE admin_followups SET updated_at = NOW() WHERE id = :id"),
                   {"id": r["id"]})
        db.commit()

        if reached:
            out[reached] += 1
            # Stamped, not closed. The automated nudge happened; whether the
            # task is finished is a human's call, and closing it here would
            # hide the person from whoever might still want to talk to them.
            db.execute(
                text("""UPDATE admin_followups
                        SET reminder_sent_at = NOW(), updated_at = NOW()
                        WHERE id = :id"""),
                {"id": r["id"]},
            )
            db.commit()
        else:
            out["none"] += 1
            # WARNING, not info: the poller logs at WARNING, so every
            # logger.info written here has been invisible from the start —
            # which is why a 13-hour stall left no trace anyone could find.
            logger.warning("recovery reached nobody for followup %s (tg=%s, mail=%s)",
                           r["id"], bool(r["telegram_id"]), sup.deliverable(r["email"]))

    return out
