# backend/app/middleware/activity_tracker.py
"""
ActivityTrackerMiddleware
=========================
Passively records authenticated user activity for the Growth dashboard,
WITHOUT touching any route handler or the auth layer.

For every request it:
  1. Decodes the Bearer JWT to get user_id (no DB hit, reuses decode_token).
  2. Maps the URL to a coarse feature bucket (allowlist; unmapped = skip
     feature logging, but still refreshes "last seen").
  3. Uses Redis SET NX EX to dedupe two independent windows:
        - heartbeat bucket  (user, 5-min)          -> refresh last_active_at
                                                       + bump total_sessions
        - feature bucket    (user, feature, hour)  -> one activity row per
                                                       feature per hour
  4. When a bucket is newly claimed, the DB write is offloaded to a thread
     executor so the HTTP response is never blocked.

Design notes
------------
* The user-row update uses raw SQL on purpose, so SQLAlchemy's
  onupdate=func.now() does NOT bump users.updated_at on every heartbeat
  (which would pollute the column other code relies on).
* Fail-safe: any tracking error is swallowed and logged — it must never
  break a real request. If Redis is unavailable, tracking is skipped
  (returns False from the claim), which prevents a DB write flood.
"""
import asyncio
from datetime import datetime, timezone, timedelta

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.security import decode_token
from app.core.redis import get_redis
from app.core.database import SessionLocal
from app.models.activity import UserActivityEvent


# ── URL → feature bucket (allowlist). Matches the first path segment ──
# after /api/v1/. Anything not listed here is NOT logged as a feature
# event (auth, admin, workspace, finance, notifications, telegram/discord
# callbacks, etc.). End-user product surfaces only.
FEATURE_MAP = {
    "signals": "signals",
    "market": "markets",
    "market-pulse": "market_pulse",
    "coingecko": "markets",
    "coins": "markets",
    "coin-profile": "markets",
    "orderbook": "markets",
    "tips": "tips",
    "whale": "whale_alert",
    "money-flow": "onchain",
    "onchain": "onchain",
    "referral": "referral",
    "ai-arena": "ai_arena",
    "autotrade": "autotrade",
    "profile": "profile",
    "journal": "journal",
    "crypto-news-feed": "news",
    "fx": "fx",
    "calendar": "macro_calendar",
    "watchlist": "watchlist",
    "daily-dashboard": "analytics",
    "edge-lab": "analytics",
}

SESSION_GAP_MINUTES = 60     # idle gap that starts a new "session"
HEARTBEAT_TTL = 330          # ~5.5 min — refresh last_active at most ~every 5 min
EVENT_TTL = 3700             # ~1 hour — at most one feature row per hour


def _match_feature(path: str):
    """`/api/v1/signals/recent` -> 'signals' (or None if not tracked)."""
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 3 and parts[0] == "api" and parts[1] == "v1":
        return FEATURE_MAP.get(parts[2])
    return None


def _extract_user_id(request):
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if not payload or payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    try:
        return int(sub)
    except (TypeError, ValueError):
        return None


def _claim_bucket(key: str, ttl: int) -> bool:
    """Atomic SET NX EX. True if newly claimed (caller should do the write),
    False if already claimed this window OR Redis is unavailable."""
    try:
        client = get_redis()
        return bool(client.set(key, "1", nx=True, ex=ttl))
    except Exception:
        return False


def _record_activity(user_id: int, feature, do_heartbeat: bool):
    """Sync DB write — runs in a thread executor with its own session.

    * Inserts one activity row when `feature` is provided.
    * Refreshes last_active_at + last_feature_touched, and bumps
      total_sessions when the idle gap exceeds SESSION_GAP_MINUTES.
    * Raw SQL update avoids triggering users.updated_at onupdate.
    """
    db = SessionLocal()
    try:
        if feature:
            db.add(UserActivityEvent(user_id=user_id, feature=feature))

        if do_heartbeat:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(minutes=SESSION_GAP_MINUTES)
            db.execute(
                text(
                    """
                    UPDATE users
                    SET total_sessions = total_sessions + CASE
                            WHEN last_active_at IS NULL THEN 1
                            WHEN last_active_at < :cutoff THEN 1
                            ELSE 0
                        END,
                        last_active_at = :now,
                        last_feature_touched = COALESCE(:feature, last_feature_touched)
                    WHERE id = :uid
                    """
                ),
                {"now": now, "cutoff": cutoff, "feature": feature, "uid": user_id},
            )

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️ activity record error (user={user_id}): {e}")
    finally:
        db.close()


class ActivityTrackerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        try:
            user_id = _extract_user_id(request)
            if user_id is None:
                return response

            feature = _match_feature(request.url.path)

            now = datetime.now(timezone.utc)
            # 5-minute heartbeat window key, e.g. lq:act:hb:372:202606011405
            five = (now.minute // 5) * 5
            hb_key = f"lq:act:hb:{user_id}:{now.strftime('%Y%m%d%H')}{five:02d}"
            need_heartbeat = _claim_bucket(hb_key, HEARTBEAT_TTL)

            need_event = False
            if feature:
                ev_key = f"lq:act:ev:{user_id}:{feature}:{now.strftime('%Y%m%d%H')}"
                need_event = _claim_bucket(ev_key, EVENT_TTL)

            if need_heartbeat or need_event:
                loop = asyncio.get_running_loop()
                loop.run_in_executor(
                    None,
                    _record_activity,
                    user_id,
                    feature if need_event else None,
                    need_heartbeat,
                )
        except Exception as e:
            # never break a real request because of tracking
            print(f"⚠️ activity middleware error: {e}")
        return response
