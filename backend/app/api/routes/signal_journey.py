"""
LuxQuant Terminal - Signal Journey API
=======================================
Layer 5 endpoint:
  GET /api/v1/signals/journey/{signal_id}

Access control:
  - Signal age < 7 days (from created_at): subscriber-only
  - Signal age >= 7 days: public (no auth required)

Returns:
  - 200 SignalJourneyResponse — full data ready for frontend rendering
  - 200 JourneyNotAvailableResponse — when journey row gak ada / pair unavailable / requires sub
  - 404 — signal_id tidak ditemukan
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis import cache_get, cache_set
from app.api.deps import get_current_user_optional
from app.models.user import User
from app.services.journey_view_builder import build_journey_view
from app.services.journey_fetcher import parse_created_at
from app.services.journey_insights import compute_insights
from app.schemas.journey import (
    SignalJourneyResponse,
    JourneyNotAvailableResponse,
)


log = logging.getLogger(__name__)

router = APIRouter(tags=['signals-journey'])
# prefix added by main.py mounting (/api/v1/signals)
# Final endpoint: GET /api/v1/signals/journey/{signal_id}


# ============================================================
# CONFIG
# ============================================================

PUBLIC_AFTER_DAYS = 7
"""Signal yang lebih tua dari N hari = public access."""


# ============================================================
# HELPERS
# ============================================================

def _is_recent(created_at: datetime) -> bool:
    """True kalau signal belum lewat PUBLIC_AFTER_DAYS dari sekarang."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=PUBLIC_AFTER_DAYS)
    return created_at >= cutoff


def _has_active_subscription(user: Optional[User]) -> bool:
    """
    Mirror logic dari deps.py require_subscription, but as a pure check
    (returns bool instead of raising HTTPException).
    Accepts both 'subscriber' and 'premium' roles for compat.
    """
    if user is None:
        return False

    # Admin bypass
    if user.is_admin or user.role == 'admin':
        return True

    # Active subscriber/premium
    if user.role in ('subscriber', 'premium'):
        if user.subscription_expires_at is None:
            return True  # lifetime
        if user.subscription_expires_at > datetime.now(timezone.utc):
            return True  # not expired

    return False


# ============================================================
# ENDPOINT
# ============================================================

@router.get(
    '/journey/{signal_id}',
    response_model=Union[SignalJourneyResponse, JourneyNotAvailableResponse],
    response_model_exclude_none=False,
    summary='Get full journey breakdown for a signal',
)
async def get_signal_journey(
    signal_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Returns 3-section journey breakdown.

    Access control:
      - Signal age < 7 days: subscriber-only (subscriber/premium/admin)
      - Signal age >= 7 days: public

    Uses get_current_user_optional so the endpoint accepts both authenticated
    and anonymous requests, then gates based on signal age + user.role.
    """

    # ============================================================
    # 1. Fetch signal core data
    # ============================================================
    sig_row = db.execute(text("""
        SELECT signal_id, pair, status, created_at
        FROM signals
        WHERE signal_id = :sid
        LIMIT 1
    """), {"sid": signal_id}).mappings().fetchone()

    if not sig_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Signal not found: {signal_id}",
        )

    # Parse created_at (TEXT column with ISO8601)
    try:
        created_at_dt = parse_created_at(sig_row['created_at'])
    except (ValueError, TypeError):
        log.error(f"Signal {signal_id} has invalid created_at: {sig_row['created_at']!r}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Signal has invalid created_at timestamp",
        )

    # ============================================================
    # 2. Subscription gating (recent signals = subscriber-only)
    # ============================================================
    if _is_recent(created_at_dt):
        if not _has_active_subscription(current_user):
            return JourneyNotAvailableResponse(
                signal_id=signal_id,
                available=False,
                reason='requires_subscription',
                message='Recent signals (< 7 days old) require active subscription',
            )

    # ============================================================
    # 3. Fetch signal_journey row
    # ============================================================
    journey_row = db.execute(text("""
        SELECT
            signal_id, direction, computed_at, last_event_at,
            data_source, kline_interval, swing_threshold_pct,
            coverage_from, coverage_until, coverage_status,
            events,
            overall_mae_pct, overall_mae_at,
            overall_mfe_pct, overall_mfe_at,
            initial_mae_pct, initial_mae_at, initial_mae_before,
            time_to_tp1_seconds, time_to_outcome_seconds,
            pct_time_above_entry,
            tp_then_sl, tps_hit_before_sl,
            realized_outcome_pct, missed_potential_pct
        FROM signal_journey
        WHERE signal_id = :sid
        LIMIT 1
    """), {"sid": signal_id}).mappings().fetchone()

    if not journey_row:
        return JourneyNotAvailableResponse(
            signal_id=signal_id,
            available=False,
            reason='no_journey_yet',
            message='Journey data not yet computed for this signal',
        )

    # ============================================================
    # 4. Build view (pure function, no DB/network)
    # ============================================================
    journey_dict = dict(journey_row)
    signal_dict = {
        'pair': sig_row['pair'],
        'status': sig_row['status'],
        'created_at_dt': created_at_dt,
    }

    try:
        view = build_journey_view(
            journey_row=journey_dict,
            signal_row=signal_dict,
        )
    except Exception as e:
        log.exception(f"build_journey_view failed for {signal_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to build journey view",
        )

    return SignalJourneyResponse(**view)


# ============================================================
# ENDPOINT 2: Journey Insights per Pair (for History tab)
# ============================================================

INSIGHTS_CACHE_TTL = 3600  # 1 hour
"""Cache TTL for aggregated insights — recomputed every hour."""


@router.get(
    '/journey-insights/{pair}',
    summary='Get aggregated journey insights for a trading pair',
)
async def get_journey_insights(
    pair: str,
    db: Session = Depends(get_db),
):
    """
    Aggregate journey data across all signals for a given pair.

    Returns insights for History tab:
      - entry_behavior: avg drawdown before TP1, smooth entry rate, time to TP1
      - time_to_each_tp: avg/fastest/slowest per TP level
      - drawdown_before_each_tp: avg + worst per TP transition
      - hit_rate_per_tp: hit count, rate %, avg exit gain
      - peak_potential: avg peak excursion, best peak ever, avg max gain
      - risk_profile: avg/worst drawdown, time in profit, TP-then-SL warning

    Cached in Redis for 1 hour per pair.

    Response shape:
      - {available: true, ...sections...} — when sample size >= MIN_SAMPLE_SIZE
      - {available: false, reason: 'insufficient_data'|'no_data'} — otherwise
    """
    pair_upper = pair.upper()
    cache_key = f"lq:journey-insights:{pair_upper}"

    # Try cache first
    cached = cache_get(cache_key)
    if cached:
        return cached

    # Compute fresh
    try:
        result = compute_insights(db, pair_upper)
    except Exception as e:
        log.exception(f"compute_insights failed for {pair_upper}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute journey insights",
        )

    # Cache only successful aggregations (not insufficient_data — re-check next request)
    if result.get('available') is True:
        cache_set(cache_key, result, ttl=INSIGHTS_CACHE_TTL)

    return result
