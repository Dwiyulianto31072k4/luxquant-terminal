"""
LuxQuant Terminal - Signal Journey API
=======================================
Layer 5 endpoint:
  GET /api/v1/signals/journey/{signal_id}

Access control:
  - Signal age < 7 days (from created_at): subscriber-only via require_subscription
  - Signal age >= 7 days: public (no auth required)

Returns:
  - 200 SignalJourneyResponse — full data ready for frontend rendering
  - 200 JourneyNotAvailableResponse — when journey row gak ada / pair unavailable / requires sub
  - 404 — signal_id tidak ditemukan

Mounting (di main.py atau routes/__init__.py):
    from app.api.routes.signal_journey import router as journey_router
    app.include_router(journey_router, prefix='/api/v1')
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_subscription
from app.services.journey_view_builder import build_journey_view
from app.services.journey_fetcher import parse_created_at
from app.schemas.journey import (
    SignalJourneyResponse,
    JourneyNotAvailableResponse,
)


log = logging.getLogger(__name__)

router = APIRouter(tags=['signals-journey'])
# Note: prefix added by main.py mounting (/api/v1/signals)
# Final endpoint: GET /api/v1/signals/journey/{signal_id}


# ============================================================
# CONFIG
# ============================================================

PUBLIC_AFTER_DAYS = 7
"""Signal yang lebih tua dari N hari = public access (no subscription needed)."""


# ============================================================
# HELPERS
# ============================================================

def _is_recent(created_at: datetime) -> bool:
    """True kalau signal belum lewat PUBLIC_AFTER_DAYS dari sekarang."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=PUBLIC_AFTER_DAYS)
    return created_at >= cutoff


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
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Returns 3-section journey breakdown:
      - entry_stats: pre-TP1 stats (drawdown, time-to-TP1)
      - events: timeline (entry + TP/SL hits + detected swings)
      - outcome: realized pct, peak excursion, time in profit, summary sentence

    Access control:
      - Signal age < 7 days: subscriber-only
      - Signal age >= 7 days: public

    For unsubscribed users on recent signals, returns JourneyNotAvailableResponse
    with reason='requires_subscription' (200 OK, frontend can render gate).
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
        # Manual run dependency. require_subscription is a regular function
        # that takes (request, db) and returns the user, or raises HTTPException.
        # We catch HTTPException to return graceful JourneyNotAvailableResponse
        # instead (better UX — frontend renders paywall card).
        try:
            require_subscription(request=request, db=db)
        except HTTPException:
            return JourneyNotAvailableResponse(
                signal_id=signal_id,
                available=False,
                reason='requires_subscription',
                message='Recent signals (< 7 days old) require active subscription',
            )
        except Exception as e:
            # Unexpected error during auth — log & treat as gated
            log.warning(f"Subscription check failed unexpectedly: {type(e).__name__}: {e}")
            return JourneyNotAvailableResponse(
                signal_id=signal_id,
                available=False,
                reason='requires_subscription',
                message='Recent signals require active subscription',
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
        # Signal exists but no journey row — open signal (no events yet)
        # OR pair was unavailable & worker hasn't computed.
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
