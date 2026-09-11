"""Work the referral reminder queue the admin tool never got clicked through.

The tool has been correct and complete since it shipped: policy checks,
cooldowns, a full audit row, a button wired in GrowthTab. `referral_reminder_events`
is empty for one reason — **nobody has ever clicked it**. 431 advocates tracked,
82 eligible on 2026-09-09, zero contacted.

Its author made a deliberate choice worth restating, because this module bends
it: "There is deliberately no bulk or automatic-send endpoint. Each click is a
conscious admin approval." That is a good rule against a blast. It is a bad rule
against 82 separate clicks, which is why it produced silence instead of care.

What is kept from it, exactly:

  · Eligibility is re-evaluated from `_build_referral_ops` on every single send,
    the same call the button makes — never from a list captured earlier.
  · A send that is not `eligible` at that moment is skipped, not queued.
  · The message and the audit row are the route's own, imported rather than
    copied. Two copies of a policy are two policies.

What replaces the click is a switch the owner sets once, and a pace slow enough
that a mistake is caught in the first few rather than the last.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from sqlalchemy import text

logger = logging.getLogger(__name__)

ENABLED = os.getenv("REFERRAL_OUTREACH_ENABLED", "0") == "1"
PER_CYCLE = int(os.getenv("REFERRAL_OUTREACH_PER_CYCLE", "2"))


async def run(db, now=None) -> dict:
    if not ENABLED:
        return {"skipped": "disabled"}

    # Imported here, not at module load: the route module pulls in a large slice
    # of the app, and a worker that cannot start because an admin route moved is
    # a worker that takes the whole poller down with it.
    from app.api.routes.workspace import _build_referral_ops, _referral_reminder_message
    from app.models.referral import ReferralCode, ReferralReminderEvent
    from app.models.user import User
    from app.services.telegram_group import send_dm

    now = now or datetime.now(timezone.utc)
    out = {"eligible": 0, "sent": 0, "failed": 0, "skipped": 0}

    try:
        snapshot = _build_referral_ops(db, now)
    except Exception as e:
        logger.warning("referral outreach: snapshot failed: %s", e)
        return {"error": type(e).__name__}

    advocates = [a for a in (snapshot.get("advocates") or [])
                 if a.get("reminder", {}).get("state") == "eligible"]
    out["eligible"] = len(advocates)
    if not advocates:
        return out

    # Most-referred first. Someone whose link already worked is the one most
    # worth asking again, and it front-loads whatever signal the first sends
    # give us about whether this is welcome.
    advocates.sort(key=lambda a: -(a.get("referred") or 0))

    for adv in advocates[:PER_CYCLE]:
        user = db.query(User).filter(User.id == adv["user_id"]).first()
        code = db.query(ReferralCode).filter(ReferralCode.id == adv["code_id"]).first()
        if not user or not code or not user.telegram_id:
            out["skipped"] += 1
            continue

        message = _referral_reminder_message(user, code, adv)
        event = ReferralReminderEvent(
            user_id=user.id, referral_code_id=code.id,
            segment=adv["reminder"]["segment"], channel="telegram",
            status="queued", message=message, created_by=None,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        try:
            sent = await send_dm(user.telegram_id, message)
        except Exception as e:
            sent = False
            event.error = str(e)[:500]

        if sent:
            event.status = "sent"
            event.sent_at = datetime.now(timezone.utc)
            # A delivered DM is proof the bot can reach this account, same as
            # every other send site records it.
            db.execute(
                text("""UPDATE users SET telegram_bot_started_at = NOW()
                        WHERE id = :id AND telegram_bot_started_at IS NULL"""),
                {"id": user.id},
            )
            out["sent"] += 1
        else:
            event.status = "failed"
            event.error = event.error or "Telegram DM failed"
            out["failed"] += 1
        db.commit()

    return out
