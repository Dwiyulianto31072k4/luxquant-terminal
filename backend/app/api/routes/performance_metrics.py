"""Track-record performance in R units.

Admin-gated for now: these figures (expectancy, drawdown, the gap between win
rate and average win) are the honest shape of the book, and how they get
presented publicly is a decision to make deliberately. Dropping the
`Depends(get_admin_user)` line is all it takes to open any of them up.

The maths lives in app/services/performance_metrics.py — see that module's
header for what 1R means here and where outcomes come from.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services import performance_metrics as pm

router = APIRouter(prefix="/performance", tags=["performance"])


def _parse_date(value: Optional[str], field: str):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"{field} must be ISO format (YYYY-MM-DD)")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/r-metrics")
def r_metrics(
    since: Optional[str] = Query(None, description="ISO date — only calls made on/after this"),
    until: Optional[str] = Query(None, description="ISO date — only calls made before this"),
    include_runners: bool = Query(
        False,
        description="Fold tp1/tp2/tp3 calls in at the best target reached so far. "
                    "Off = closed book only (tp4 or sl).",
    ),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Win rate, expectancy, profit factor, R-multiples, drawdown, SQN, and the
    monthly/weekly R series — the whole performance layer in one payload."""
    return pm.compute(
        db,
        since=_parse_date(since, "since"),
        until=_parse_date(until, "until"),
        include_runners=include_runners,
    )


@router.get("/rr-geometry")
def rr_geometry(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """The reward:risk the calls promise before any outcome — the shape of the book."""
    return pm.rr_geometry(db)


@router.get("/position-size")
def position_size(
    account_equity: float = Query(..., gt=0, description="Account equity in quote currency"),
    risk_pct: float = Query(..., gt=0, le=100, description="Percent of equity risked on this trade"),
    entry: float = Query(..., gt=0),
    stop: float = Query(..., gt=0),
    max_leverage: Optional[int] = Query(None, gt=0, description="Venue cap, if any"),
    _admin: User = Depends(get_admin_user),
):
    """Turn a call into a sized trade: quantity, notional, leverage, loss at stop."""
    try:
        return pm.position_size(account_equity, risk_pct, entry, stop, max_leverage)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
