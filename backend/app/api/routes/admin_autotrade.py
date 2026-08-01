"""Admin-side AutoTrade monitoring.

AutoTrade lives in a separate application with its own database, so a user
reporting "my bot isn't trading" previously meant an SSH session and hand-written
SQL. These endpoints put the same answers in the admin workspace: which bots are
healthy, which are broken, and — for one user — the actual error text.

Read-only throughout. The underlying database role cannot write, and has no
access to the encrypted API key columns.
"""
from typing import Any

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services import autotrade_monitor

router = APIRouter(prefix="/admin/autotrade", tags=["Admin AutoTrade"])

# The reconciler, entitlement gate, fill recording and auth fixes all landed on
# 2026-07-30. Results before that came from a system that was demonstrably
# broken — the reconciler had not completed a cycle in weeks — so the default
# view starts the day after. History is not deleted; `since=` selects the
# window and an empty value returns everything.
FIXES_LANDED = "2026-07-31"


def _attach_identities(db: Session, rows: list[dict[str, Any]]) -> None:
    """Fill in real usernames from the LuxQuant side.

    cryptobot only stores synthetic addresses like
    `tg_1307021572@telegram.luxquant.tw`, which are unreadable in a support
    context. The two systems are separate databases, so this is a second lookup
    rather than a join — the shared key is cryptobot's `lq:{id}` subject.
    """
    ids = {r.get("luxquant_user_id") for r in rows if r.get("luxquant_user_id")}
    if not ids:
        return
    lookup = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(ids)).all()
    }
    for row in rows:
        user = lookup.get(row.get("luxquant_user_id"))
        row["username"] = getattr(user, "username", None)
        row["email"] = getattr(user, "email", None)
        row["role"] = getattr(user, "role", None)
        row["subscription_expires_at"] = getattr(user, "subscription_expires_at", None)


@router.get("/overview")
def autotrade_overview(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Fleet health plus one row per user who has linked AutoTrade.

    Returns `available: False` rather than erroring when the cryptobot database
    is unreachable — a monitoring panel must not be able to break the page it
    is embedded in.
    """
    data = autotrade_monitor.overview()
    if data.get("available"):
        _attach_identities(db, data.get("users", []))
    return data


@router.get("/users/{user_id}/trades")
def autotrade_user_trades(
    user_id: int,
    admin: User = Depends(get_admin_user),
    since: str = Query(FIXES_LANDED, description="ISO date; empty string for all time"),
):
    """Closed trades for one user, each with that day's BTC move and signal regime."""
    return autotrade_monitor.user_trades(user_id, since=since or None)


@router.get("/analytics")
def autotrade_analytics(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    since: str = Query(FIXES_LANDED, description="ISO date; empty string for all time"),
):
    """Desk-wide profitability: leaderboard, leverage/exit splits, equity curve."""
    data = autotrade_monitor.analytics(since=since or None)
    if data.get("available"):
        _attach_identities(db, data.get("leaderboard", []))
    return data


@router.get("/positions")
def autotrade_positions(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Every position held right now, across all users, stuck ones first."""
    data = autotrade_monitor.open_positions()
    if data.get("available"):
        _attach_identities(db, data.get("positions", []))
    return data


class BotAccessRequest(BaseModel):
    blocked: bool
    reason: str = Field(min_length=3, max_length=500)


@router.post("/users/{user_id}/bot-access")
def set_bot_access(
    user_id: int,
    body: BotAccessRequest,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Switch one user's bot off (or back on), with a reason they will see.

    Deliberately narrow. This does not touch the subscription, the account, the
    signal feed or any open position — those keep their take-profit and stop-loss
    and go on being reconciled. Only new live entries stop.

    The gate is the entitlement endpoint AutoTrade already calls before every
    live trade, so nothing has to be restarted and the block cannot be raced by
    a trade already in flight.

    The reason is mandatory and is shown to the user, because a bot that stops
    with no explanation is indistinguishable from a bot that is broken — and the
    user is the one whose money is sitting in the position.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=422, detail="A reason is required")

    if body.blocked:
        user.autotrade_blocked_at = datetime.now(timezone.utc)
        user.autotrade_blocked_reason = reason
        user.autotrade_blocked_by = (admin.username or admin.email or str(admin.id))[:64]
    else:
        user.autotrade_blocked_at = None
        user.autotrade_blocked_reason = None
        user.autotrade_blocked_by = None
    db.commit()

    return {
        "user_id": user.id,
        "bot_access_blocked": user.autotrade_blocked,
        "reason": user.autotrade_blocked_reason,
        "blocked_by": user.autotrade_blocked_by,
        "blocked_at": (
            user.autotrade_blocked_at.isoformat() if user.autotrade_blocked_at else None
        ),
        # AutoTrade caches an "allowed" answer, so a block is not instant.
        "takes_effect_within_seconds": 120,
    }


@router.get("/users/{user_id}")
def autotrade_user_detail(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """One user's bot in full: config, open positions, blocks, and error text."""
    data = autotrade_monitor.user_detail(user_id)
    if data.get("available") and data.get("summary"):
        _attach_identities(db, [data["summary"]])
    return data
