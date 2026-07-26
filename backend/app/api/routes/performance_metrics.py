"""Track-record performance in R units.

Gating, decided deliberately and in this order:
  · /public-summary — anonymous. Two numbers the landing teaser prints.
  · /r-metrics, /rr-geometry, /position-size — any signed-in user. The landing
    button literally says "sign in to view the R breakdown", so sign-in is the
    price; making it admin-only would turn that button into a lie.

The full r-metrics pass folds ~53k rows in Python (~2s on the box), so the
no-filter variants are cached; a date-filtered call computes live.

The maths lives in app/services/performance_metrics.py — see that module's
header for what 1R means here and where outcomes come from.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.redis import cache_get, cache_set
from app.models.user import User
from app.services import performance_metrics as pm

router = APIRouter(prefix="/performance", tags=["performance"])

# v2: dropped the R ladder from the payload — the landing stopped drawing it, so
# shipping it anyway just moved the leak from the DOM to the network tab.
_PUBLIC_SUMMARY_KEY = "lq:performance:public-summary:v2"
_R_METRICS_KEY = "lq:performance:r-metrics:v1"  # + :population, unfiltered only
_R_METRICS_TTL = 900  # the numbers move by decimals per day; 15 min is generous


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
    _user: User = Depends(get_current_user),
):
    """Win rate, expectancy, profit factor, R-multiples, drawdown, SQN, the
    monthly/weekly R series, and breakdowns by outcome and risk level."""
    # Only the unfiltered book is cached — that is what the Performance page
    # asks for, and it is the expensive one to recompute per visitor.
    cacheable = since is None and until is None
    key = f"{_R_METRICS_KEY}:{population}"
    if cacheable:
        cached = cache_get(key)
        if cached:
            return cached
    report = pm.compute(
        db,
        since=_parse_date(since, "since"),
        until=_parse_date(until, "until"),
        population=population,
    )
    if cacheable:
        cache_set(key, report, ttl=_R_METRICS_TTL)
    return report


@router.get("/rr-geometry")
def rr_geometry(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """The reward:risk the calls promise before any outcome — the shape of the book."""
    return pm.rr_geometry(db)


@router.get("/public-summary")
def public_summary(db: Session = Depends(get_db)):
    """The teaser payload for the landing page. Two numbers, and they are the only
    two the landing renders.

    It used to carry the R ladder as well. That was a leak by another route: the
    landing does not draw those bars any more, but the values still travelled in
    this response, so the ladder was one network tab away. Anything the page does
    not print does not go out.

    The break-even win rate survives because it is the whole argument — it is what
    the reader compares the published win rate against — and because it runs
    nowhere: knowing the geometry needs 33.7% tells you nothing about expectancy,
    profit factor, drawdown or the equity curve. Those need /r-metrics and an
    admin token.

    Cached for an hour; it moves by a decimal a month.
    """
    cached = cache_get(_PUBLIC_SUMMARY_KEY)
    if cached:
        return cached

    report = pm.compute(db)
    payload = {
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
    _user: User = Depends(get_current_user),
):
    """Turn a call into a sized trade: quantity, notional, leverage, loss at stop."""
    try:
        return pm.position_size(account_equity, risk_pct, entry, stop, max_leverage)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
