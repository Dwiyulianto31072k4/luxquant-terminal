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
from app.models.agent_disclaimer import AgentDisclaimerAck
from app.models.user import User
from app.services import autotrade_monitor
from app.services.autotrade_monitor import TRACKING_RESET_AT

router = APIRouter(prefix="/admin/autotrade", tags=["Admin AutoTrade"])

# Default performance window. History is not deleted; empty `since` is all time.
FIXES_LANDED = TRACKING_RESET_AT


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
        # Whether an operator has switched this bot off. It lives on the LuxQuant
        # side, so the monitoring view — which reads the cryptobot database —
        # cannot see it without this. Without it the console would show a bot
        # sitting idle and give no hint that we are the reason.
        row["bot_access_blocked"] = bool(getattr(user, "autotrade_blocked", False))
        row["bot_access_blocked_reason"] = getattr(user, "autotrade_blocked_reason", None)
        row["bot_access_blocked_by"] = getattr(user, "autotrade_blocked_by", None)


def _attach_agreements(db: Session, rows: list[dict[str, Any]]) -> None:
    """Join the signed Agent forms and drop unsigned noise from the incident queue.

    A rejected key or a risk-limit skip is not a live Agent incident if the
    person never signed the live trading acknowledgement. History is kept;
    only the desk status is reclassified. Anyone who signed stays as-is.
    """
    ids = {r.get("luxquant_user_id") for r in rows if r.get("luxquant_user_id")}
    latest: dict[int, dict[str, Any]] = {}
    if ids:
        try:
            ack_rows = (
                db.query(AgentDisclaimerAck)
                .filter(AgentDisclaimerAck.user_id.in_(ids))
                .order_by(AgentDisclaimerAck.accepted_at.desc())
                .all()
            )
        except Exception:
            return
        for ack in ack_rows:
            slot = latest.setdefault(ack.user_id, {"live": None, "assistant": None})
            if ack.kind in slot and slot[ack.kind] is None:
                slot[ack.kind] = ack
    for row in rows:
        uid = row.get("luxquant_user_id")
        slot = latest.get(uid) or {}
        live = slot.get("live")
        assistant = slot.get("assistant")
        row["has_live_ack"] = live is not None
        row["live_ack_id"] = getattr(live, "id", None)
        row["live_ack_at"] = live.accepted_at.isoformat() if live and live.accepted_at else None
        row["has_assistant_ack"] = assistant is not None
        row["assistant_ack_at"] = (
            assistant.accepted_at.isoformat() if assistant and assistant.accepted_at else None
        )
        if row.get("has_live_ack"):
            continue
        row["status"] = "unsigned"
        row["reasons"] = ["No live trading agreement signed"] + list(row.get("reasons") or [])


def _recount_overview(data: dict[str, Any]) -> None:
    rows = data.get("users") or []
    linked = [r for r in rows if r.get("has_account")]
    totals = data.setdefault("totals", {})
    totals["errors"] = len([r for r in rows if r.get("status") == "error"])
    totals["warnings"] = len([r for r in rows if r.get("status") == "warn"])
    totals["unsigned"] = len([r for r in linked if not r.get("has_live_ack")])
    totals["unsigned_live"] = len(
        [
            r
            for r in linked
            if not r.get("has_live_ack") and r.get("is_active") and r.get("dry_run") is False
        ]
    )
    totals["signed_live"] = len([r for r in linked if r.get("has_live_ack")])
    totals["invalid_keys"] = len(
        [r for r in linked if r.get("key_status") == "invalid" and r.get("has_live_ack")]
    )


def decorate_agent_overview(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    """Identities + agreement gate used by both the monitor and the workspace pulse."""
    if data.get("available"):
        _attach_identities(db, data.get("users", []))
        _attach_agreements(db, data.get("users", []))
        _recount_overview(data)
    return data


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
    return decorate_agent_overview(db, data)


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
        _attach_agreements(db, [data["summary"]])
    return data
