"""The one billing fact the signed-in user needs told, if any.

This is the in-app half of A1. The notification centre reaches the 24% who
open the bell; a bar in the shell reaches everyone who loads a page. It also
reaches the ~490 accounts that signed in through Telegram or Discord and have
no mailbox at all — email can never help them, so without this they have no
tier-1 channel whatsoever.

Deliberately returns AT MOST ONE thing. A person with a lapsed subscription
and an open invoice has one problem, not two, and stacking banners is how a
page turns into an argument with itself.
"""
from datetime import datetime, timezone

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services import email_suppression as sup

router = APIRouter(prefix="/billing", tags=["billing"])

# Matches the worker's renewal milestones. Telling someone 30 days out is not
# urgency, it is noise, and noise is what made the bell ignorable.
EXPIRING_WITHIN_DAYS = 7
# After this the message stops being useful and starts being nagging.
ENDED_WITHIN_DAYS = 30


@router.get("/state")
def billing_state(db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    exp = getattr(user, "subscription_expires_at", None)
    active = user.role in ("premium", "subscriber", "admin", "co_admin", "founder") and (
        exp is None or exp > now)

    # 1. An unpaid invoice outranks everything: money is already in motion and
    #    the window closes on its own.
    if not active:
        inv = db.execute(text("""
            SELECT p.id, p.expires_at,
                   COALESCE(p.final_amount, p.amount_usdt) AS amount,
                   COALESCE(pl.label, 'LuxQuant') AS plan_label,
                   EXTRACT(epoch FROM (p.expires_at - :now)) / 3600.0 AS hours_left
            FROM payments p
            LEFT JOIN subscription_plans pl ON pl.id = p.plan_id
            WHERE p.user_id = :uid AND p.status = 'pending'
              AND p.deleted_at IS NULL AND p.tx_hash IS NULL
              AND p.expires_at IS NOT NULL AND p.expires_at > :now
            ORDER BY p.expires_at ASC LIMIT 1
        """), {"uid": user.id, "now": now}).mappings().first()
        if inv:
            return {
                "kind": "invoice_open",
                "plan": inv["plan_label"],
                "amount": float(inv["amount"]) if inv["amount"] is not None else None,
                "hours_left": round(float(inv["hours_left"] or 0), 1),
                "action": {"label": "Complete payment", "href": "/payment"},
            }

    # 2. Access still running but close to the end.
    if active and exp is not None:
        days_left = (exp - now).total_seconds() / 86400.0
        if days_left <= EXPIRING_WITHIN_DAYS:
            return {
                "kind": "expiring",
                "days_left": round(days_left, 1),
                "expires_at": exp.isoformat(),
                "action": {"label": "Renew", "href": "/pricing"},
            }

    # 3. Recently lapsed. Older than a month it is history, not news.
    if not active and exp is not None:
        days_since = (now - exp).total_seconds() / 86400.0
        if 0 <= days_since <= ENDED_WITHIN_DAYS:
            return {
                "kind": "ended",
                "days_since": round(days_since, 1),
                "expired_at": exp.isoformat(),
                "action": {"label": "Renew", "href": "/pricing"},
            }

    return {"kind": None}


# ── Giving us an address ───────────────────────────────────────────────────
# Telegram's login widget never returns an email — the platform does not expose
# one — so 516 accounts carry a synthetic tg_<id>@telegram.luxquant.tw that
# goes nowhere. Nothing in the product ever offered them a way to supply a real
# one, so a receipt could never reach them however much they wanted it.
#
# The place to ask is checkout, not signup: at checkout somebody is expecting
# to be asked where the receipt goes, and the people who answer are exactly the
# ones worth being able to reach.

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


class EmailIn(BaseModel):
    email: str


@router.get("/email")
def get_billing_email(user: User = Depends(get_current_user)):
    """What we would send a receipt to, and whether that is real."""
    real = sup.deliverable(user.email)
    return {
        "email": user.email if real else None,
        "has_real_email": real,
        # The prompt is only worth showing to someone who has no usable
        # address; asking a Google sign-up for their email is noise.
        "should_ask": not real,
    }


@router.put("/email")
def set_billing_email(body: EmailIn, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    address = (body.email or "").strip().lower()
    if not _EMAIL_RE.match(address) or len(address) > 200:
        raise HTTPException(status_code=422, detail="That does not look like an email address")
    if not sup.deliverable(address):
        # Nobody should be able to hand us another synthetic address and think
        # they have solved their own problem.
        raise HTTPException(status_code=422, detail="Please use a real mailbox")

    clash = db.query(User).filter(User.email == address, User.id != user.id).first()
    if clash is not None:
        # Deliberately not "that address belongs to account 412". Confirming
        # which addresses have accounts here is an enumeration oracle.
        raise HTTPException(
            status_code=409,
            detail="That address is already used by another LuxQuant account")

    previous = user.email
    user.email = address
    db.commit()

    # An address someone typed at checkout is a stated preference, so an old
    # unsubscribe against their synthetic address must not silently mute it.
    db.execute(text("DELETE FROM email_suppressions WHERE email = :e"),
               {"e": address})
    db.commit()
    return {"ok": True, "email": address, "replaced_synthetic": not sup.deliverable(previous)}
