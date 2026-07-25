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
from app.core.redis import cache_get, cache_set
from app.models.user import User
from app.services import performance_metrics as pm

router = APIRouter(prefix="/performance", tags=["performance"])

_PUBLIC_SUMMARY_KEY = "lq:performance:public-summary:v1"


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
    population: str = Query(
        "hit",
        pattern="^(hit|closed)$",
        description="hit = every call that reached a target or its stop (default). "
                    "closed = only tp4 and sl, where every R is realised. "
                    "Calls still open are in neither.",
    ),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Win rate, expectancy, profit factor, R-multiples, drawdown, SQN, the
    monthly/weekly R series, and breakdowns by outcome and risk level."""
    return pm.compute(
        db,
        since=_parse_date(since, "since"),
        until=_parse_date(until, "until"),
        population=population,
    )


@router.get("/rr-geometry")
def rr_geometry(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """The reward:risk the calls promise before any outcome — the shape of the book."""
    return pm.rr_geometry(db)


@router.get("/public-summary")
def public_summary(db: Session = Depends(get_db)):
    """The teaser payload for the landing page. Deliberately public, deliberately small.

    Two things go out and nothing else:

      · the reward:risk ladder — medians of the target and stop levels. Every one
        of those levels is already printed on every public signal, so a reader
        could compute this themselves from the free channel. Withholding it buys
        nothing and it is the most interesting shape in the whole book.
      · the break-even win rate this geometry demands. One number, and the only
        one here that needs outcome history. It cannot be run backwards into
        expectancy, profit factor or the equity curve — those stay behind the
        admin gate on /r-metrics.

    Cached for an hour: it moves on the order of a decimal per month.
    """
    cached = cache_get(_PUBLIC_SUMMARY_KEY)
    if cached:
        return cached

    geo = pm.rr_geometry(db)
    report = pm.compute(db)
    payload = {
        "median_r_to_tp1": geo.get("median_r_to_tp1"),
        "median_r_to_tp2": geo.get("median_r_to_tp2"),
        "median_r_to_tp3": geo.get("median_r_to_tp3"),
        "median_r_to_tp4": geo.get("median_r_to_tp4"),
        "median_stop_distance_pct": geo.get("median_stop_distance_pct"),
        "breakeven_win_rate_pct": report.get("breakeven_win_rate_pct"),
        "calls_measured": report.get("trades"),
    }
    cache_set(_PUBLIC_SUMMARY_KEY, payload, ttl=3600)
    return payload


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
