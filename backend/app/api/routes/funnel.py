"""
Anonymous funnel events for landing → login conversion.

POST /api/v1/funnel/event  — public, rate-limited, allowlisted events
GET  /api/v1/workspace/growth/conversion — admin weekly conversion snapshot

Storage: funnel_events (auto-created). No PII beyond coarse path/source.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.core.redis import cache_get, cache_set
from app.models.user import User  # noqa: F401

logger = logging.getLogger("funnel")

router = APIRouter(tags=["funnel"])

ALLOWED_EVENTS = {
    "landing_view",
    "cta_click",
    "soft_gate_shown",
    "soft_gate_login_click",
    "auth_page_view",
    "auth_start",
    "auth_success",
    "auth_error",
    "post_login_land",
}

# Simple in-process IP rate limit (per worker): 60 events / minute
_RATE: dict[str, list[float]] = defaultdict(list)
_RATE_MAX = 60
_RATE_WINDOW = 60.0

_TABLE_READY = False


class FunnelEventIn(BaseModel):
    event: str = Field(..., max_length=64)
    source: Optional[str] = Field(None, max_length=80)
    path: Optional[str] = Field(None, max_length=200)
    provider: Optional[str] = Field(None, max_length=40)
    session_id: Optional[str] = Field(None, max_length=80)
    meta: Optional[dict[str, Any]] = None
    ts: Optional[str] = Field(None, max_length=40)


def _ensure_table(db: Session) -> None:
    global _TABLE_READY
    if _TABLE_READY:
        return
    for stmt in (
        """
        CREATE TABLE IF NOT EXISTS funnel_events (
          id            bigserial PRIMARY KEY,
          event         text NOT NULL,
          source        text,
          path          text,
          provider      text,
          session_id    text,
          meta          jsonb,
          ip_hash       text,
          created_at    timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_funnel_events_event_created
          ON funnel_events (event, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_funnel_events_created
          ON funnel_events (created_at DESC)
        """,
    ):
        db.execute(text(stmt))
    db.commit()
    _TABLE_READY = True


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for") or ""
    if xff:
        return xff.split(",")[0].strip()[:64]
    if request.client:
        return (request.client.host or "")[:64]
    return ""


def _rate_ok(ip: str) -> bool:
    now = time.time()
    bucket = _RATE[ip or "unknown"]
    cutoff = now - _RATE_WINDOW
    # prune
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= _RATE_MAX:
        return False
    bucket.append(now)
    return True


def _ip_hash(ip: str) -> str:
    # One-way coarse fingerprint (not reversible identity)
    import hashlib

    salt = "lq-funnel-v1"
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:16]


@router.post("/api/v1/funnel/event")
def ingest_funnel_event(
    body: FunnelEventIn,
    request: Request,
    db: Session = Depends(get_db),
):
    event = (body.event or "").strip().lower()
    if event not in ALLOWED_EVENTS:
        raise HTTPException(status_code=400, detail="unknown event")

    ip = _client_ip(request)
    if not _rate_ok(ip):
        # Fail open for the product UX but don't write
        return {"ok": True, "throttled": True}

    try:
        import json as _json

        _ensure_table(db)
        db.execute(
            text(
                """
                INSERT INTO funnel_events
                  (event, source, path, provider, session_id, meta, ip_hash)
                VALUES
                  (:event, :source, :path, :provider, :session_id,
                   CAST(:meta AS jsonb), :ip_hash)
                """
            ),
            {
                "event": event,
                "source": (body.source or None),
                "path": (body.path or None),
                "provider": (body.provider or None),
                "session_id": (body.session_id or None),
                "meta": _json.dumps(body.meta) if body.meta is not None else "null",
                "ip_hash": _ip_hash(ip) if ip else None,
            },
        )
        db.commit()
    except Exception:
        logger.exception("funnel ingest failed")
        db.rollback()
        # Never break client flows
        return {"ok": False}

    return {"ok": True}


# ── Admin conversion snapshot (mounted via growth prefix in main or here) ──

growth_router = APIRouter(prefix="/api/v1/workspace/growth", tags=["growth"])


@growth_router.get("/conversion")
def growth_conversion(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Weekly-style conversion snapshot from users + funnel_events."""
    days = max(7, min(days, 90))
    cache_key = f"lq:growth:conversion:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    # User-side funnel (authoritative for accounts)
    user_row = db.execute(
        text(
            """
            SELECT
              count(*) FILTER (WHERE created_at >= :since) AS signups,
              count(*) FILTER (
                WHERE created_at >= :since
                  AND COALESCE(login_count, 0) >= 1
              ) AS signups_with_login,
              count(*) FILTER (
                WHERE created_at >= :since
                  AND COALESCE(login_count, 0) = 1
              ) AS signups_one_shot,
              count(*) FILTER (
                WHERE created_at >= :since
                  AND COALESCE(login_count, 0) >= 2
              ) AS signups_multi_login,
              count(*) FILTER (
                WHERE last_login_at >= :since
              ) AS any_login,
              count(*) FILTER (
                WHERE last_login_at >= :d7
              ) AS login_7d,
              count(*) FILTER (
                WHERE last_login_at >= :d1
              ) AS login_24h,
              count(*) FILTER (
                WHERE created_at >= :since
                  AND auth_provider = 'google'
              ) AS signup_google,
              count(*) FILTER (
                WHERE created_at >= :since
                  AND auth_provider = 'telegram'
              ) AS signup_telegram,
              count(*) FILTER (
                WHERE created_at >= :since
                  AND auth_provider = 'discord'
              ) AS signup_discord,
              count(*) FILTER (
                WHERE created_at >= :since
                  AND (referred_by IS NOT NULL OR referral_code_used IS NOT NULL)
              ) AS signup_referred
            FROM users
            """
        ),
        {
            "since": since,
            "d7": now - timedelta(days=7),
            "d1": now - timedelta(days=1),
        },
    ).mappings().fetchone()

    # Daily signups
    daily = db.execute(
        text(
            """
            SELECT created_at::date AS day, count(*)::int AS signups
            FROM users
            WHERE created_at >= :since
            GROUP BY 1
            ORDER BY 1
            """
        ),
        {"since": since},
    ).mappings().all()

    # Funnel events (if table exists)
    funnel_counts: dict[str, int] = {}
    funnel_by_source: list[dict] = []
    try:
        _ensure_table(db)
        rows = db.execute(
            text(
                """
                SELECT event, count(*)::int AS n
                FROM funnel_events
                WHERE created_at >= :since
                GROUP BY event
                """
            ),
            {"since": since},
        ).mappings().all()
        funnel_counts = {r["event"]: int(r["n"]) for r in rows}

        funnel_by_source = [
            dict(r)
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(source, '(none)') AS source, count(*)::int AS n
                    FROM funnel_events
                    WHERE created_at >= :since AND event = 'cta_click'
                    GROUP BY 1
                    ORDER BY n DESC
                    LIMIT 20
                    """
                ),
                {"since": since},
            ).mappings().all()
        ]
    except Exception:
        logger.exception("funnel aggregate failed")
        db.rollback()

    # Activity MAU/WAU for same window
    activity = db.execute(
        text(
            """
            SELECT
              count(DISTINCT user_id) FILTER (
                WHERE occurred_at >= :since
              ) AS mau_activity,
              count(DISTINCT user_id) FILTER (
                WHERE occurred_at >= :d7
              ) AS wau_activity,
              count(DISTINCT user_id) FILTER (
                WHERE occurred_at >= :d1
              ) AS dau_activity
            FROM user_activity_events
            """
        ),
        {
            "since": since,
            "d7": now - timedelta(days=7),
            "d1": now - timedelta(days=1),
        },
    ).mappings().fetchone()

    signups = int(user_row["signups"] or 0)
    multi = int(user_row["signups_multi_login"] or 0)
    one_shot = int(user_row["signups_one_shot"] or 0)

    payload = {
        "window_days": days,
        "as_of": now.isoformat(),
        "users": {
            "signups": signups,
            "signups_with_login": int(user_row["signups_with_login"] or 0),
            "signups_one_shot": one_shot,
            "signups_multi_login": multi,
            "one_shot_rate": round(one_shot / signups, 4) if signups else None,
            "multi_login_rate": round(multi / signups, 4) if signups else None,
            "any_login_window": int(user_row["any_login"] or 0),
            "login_7d": int(user_row["login_7d"] or 0),
            "login_24h": int(user_row["login_24h"] or 0),
            "by_provider": {
                "google": int(user_row["signup_google"] or 0),
                "telegram": int(user_row["signup_telegram"] or 0),
                "discord": int(user_row["signup_discord"] or 0),
            },
            "referred": int(user_row["signup_referred"] or 0),
            "daily_signups": [
                {"day": str(r["day"]), "signups": int(r["signups"])} for r in daily
            ],
        },
        "activity": {
            "dau": int(activity["dau_activity"] or 0) if activity else 0,
            "wau": int(activity["wau_activity"] or 0) if activity else 0,
            "mau": int(activity["mau_activity"] or 0) if activity else 0,
        },
        "funnel_events": funnel_counts,
        "cta_by_source": funnel_by_source,
        "rates": {
            # Client funnel (if instrumented). CF UV is external — not here.
            "cta_per_landing": (
                round(funnel_counts.get("cta_click", 0) / funnel_counts["landing_view"], 4)
                if funnel_counts.get("landing_view")
                else None
            ),
            "auth_start_per_cta": (
                round(funnel_counts.get("auth_start", 0) / funnel_counts["cta_click"], 4)
                if funnel_counts.get("cta_click")
                else None
            ),
            "auth_success_per_start": (
                round(funnel_counts.get("auth_success", 0) / funnel_counts["auth_start"], 4)
                if funnel_counts.get("auth_start")
                else None
            ),
        },
    }

    cache_set(cache_key, payload, ttl=120)
    return payload
