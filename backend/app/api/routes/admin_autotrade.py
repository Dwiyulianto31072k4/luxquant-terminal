"""Admin-side AutoTrade monitoring.

AutoTrade lives in a separate application with its own database, so a user
reporting "my bot isn't trading" previously meant an SSH session and hand-written
SQL. These endpoints put the same answers in the admin workspace: which bots are
healthy, which are broken, and — for one user — the actual error text.

Read-only throughout. The underlying database role cannot write, and has no
access to the encrypted API key columns.
"""
from fastapi import APIRouter, Depends

from app.api.deps import get_admin_user
from app.models.user import User
from app.services import autotrade_monitor

router = APIRouter(prefix="/admin/autotrade", tags=["Admin AutoTrade"])


@router.get("/overview")
def autotrade_overview(admin: User = Depends(get_admin_user)):
    """Fleet health plus one row per user who has linked AutoTrade.

    Returns `available: False` rather than erroring when the cryptobot database
    is unreachable — a monitoring panel must not be able to break the page it
    is embedded in.
    """
    return autotrade_monitor.overview()


@router.get("/positions")
def autotrade_positions(admin: User = Depends(get_admin_user)):
    """Every position held right now, across all users, stuck ones first."""
    return autotrade_monitor.open_positions()


@router.get("/users/{user_id}")
def autotrade_user_detail(user_id: int, admin: User = Depends(get_admin_user)):
    """One user's bot in full: config, open positions, blocks, and error text."""
    return autotrade_monitor.user_detail(user_id)
