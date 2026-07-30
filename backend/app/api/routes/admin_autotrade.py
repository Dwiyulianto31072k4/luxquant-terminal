"""Admin-side AutoTrade monitoring.

AutoTrade lives in a separate application with its own database, so a user
reporting "my bot isn't trading" previously meant an SSH session and hand-written
SQL. These endpoints put the same answers in the admin workspace: which bots are
healthy, which are broken, and — for one user — the actual error text.

Read-only throughout. The underlying database role cannot write, and has no
access to the encrypted API key columns.
"""
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services import autotrade_monitor

router = APIRouter(prefix="/admin/autotrade", tags=["Admin AutoTrade"])


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
