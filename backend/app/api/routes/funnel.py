"""
Anonymous funnel events for landing → login conversion.

POST /api/v1/funnel/event  — public, rate-limited, allowlisted events
GET  /api/v1/workspace/growth/conversion — admin weekly conversion snapshot

Storage: funnel_events (auto-created). No PII beyond coarse path/source.
"""
from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

# The first day CF-IPCountry was captured for every request. Before this,
# country was recorded for 0-25% of traffic, so counting that era produces an
# "unknown" bucket that looks like a measurement failure and is really just
# history. Measured 2026-08-09: 100% coverage on 08-07 and 08-08, 66.7% on
# 08-06. Geo queries are floored at this date; nothing else is.
GEO_TRACKING_START = datetime(2026, 8, 7, tzinfo=timezone.utc)
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
    # Impression and dismissal, kept apart from cta_click so the funnel counts
    # intent rather than exposure.
    "cta_shown",
    "cta_dismiss",
    "soft_gate_shown",
    "soft_gate_login_click",
    "auth_page_view",
    "auth_start",
    "auth_success",
    "auth_error",
    "post_login_land",
    # First-touch land with UTM / social referrer (anonymous, before login)
    "acq_land",
    # Telegram OAuth opens a popup and talks back to the opener. In an in-app
    # browser that conversation can simply never happen: no success, no error,
    # the promise never settles. Measured 2026-08-07: 38 auth_start reached only
    # 10 POSTs to /auth/telegram — 28 attempts vanished with nothing recorded.
    # These two events give that silence a name.
    "auth_popup_blocked",
    "auth_abandoned",
    # A door failed and another was offered in its place, and whether it was
    # taken. Offered-without-taken is the shape of an offer nobody trusts.
    "auth_fallback_offered",
    "auth_fallback_taken",
}

# Simple in-process IP rate limit (per worker): 60 events / minute
_RATE: dict[str, list[float]] = defaultdict(list)
_RATE_MAX = 60
_RATE_WINDOW = 60.0

_TABLE_READY = False

# Our own traffic, excluded from every aggregate below. Measured 2026-08-09:
# one address produced 44 of the 269 landing sessions, 8 of the 9 soft-gate
# impressions and 5 of the 5 soft-gate clicks — so the soft-gate CTR was
# reporting 55.6% for a control no customer had ever used.
#
# Events are still written; only the reporting drops them, so the decision is
# reversible and nothing is destroyed. Set LQ_FUNNEL_INTERNAL_IPS to a
# comma-separated list of ip_hash values (the 16-char hashes stored on the
# table) to change it without a deploy.
INTERNAL_IP_HASHES: set[str] = {
    h.strip()
    for h in os.getenv(
        "LQ_FUNNEL_INTERNAL_IPS",
        # Confirmed internal: 22 distinct paths over three days including admin
        # pages, single country. Not a customer.
        "56a91710d180b6fe",
    ).split(",")
    if h.strip()
}

# The predicate is spelled out inline in each aggregate below rather than
# assembled from a constant: SQLAlchemy's text() takes a literal string, and
# f-string assembly around SQL is the habit that eventually writes an injection.
# Four queries carry it — event counts, CTA sources, session counts, threaded.


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

    # Look before you lock. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is a
    # no-op when the column is already there, but it still takes an ACCESS
    # EXCLUSIVE lock to decide that — and four workers reloading at once take
    # four of them. That exact pattern, run against `users` at import time, is
    # what produced the statement-timeout incident: the lock queue is FIFO, so
    # one brief exclusive lock parks every reader behind it.
    #
    # A catalogue read takes no lock at all. In the steady state this function
    # now costs one cheap SELECT per worker and touches no DDL.
    try:
        ready = db.execute(
            text(
                """
                SELECT count(*) FILTER (WHERE column_name = 'country') > 0
                       AND count(*) > 0
                FROM information_schema.columns
                WHERE table_name = 'funnel_events'
                """
            )
        ).scalar()
        if ready:
            _TABLE_READY = True
            return
    except Exception:
        # Fall through to the create path — a catalogue query that fails is not
        # a reason to stop serving.
        logger.exception("funnel_events catalogue probe failed")

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
          country       varchar(2),
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
        # Existing tables created before country was added
        "ALTER TABLE funnel_events ADD COLUMN IF NOT EXISTS country VARCHAR(2)",
        """
        CREATE INDEX IF NOT EXISTS ix_funnel_events_country_created
          ON funnel_events (country, created_at DESC)
        """,
    ):
        db.execute(text(stmt))
    db.commit()
    _TABLE_READY = True


def _client_ip(request: Request) -> str:
    try:
        from app.services.geo_helpers import client_ip_from_request
        ip = client_ip_from_request(request)
        if ip:
            return ip
    except Exception:
        pass
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
        from app.services.geo_helpers import country_from_request

        country = country_from_request(request)
        _ensure_table(db)
        db.execute(
            text(
                """
                INSERT INTO funnel_events
                  (event, source, path, provider, session_id, meta, ip_hash, country)
                VALUES
                  (:event, :source, :path, :provider, :session_id,
                   CAST(:meta AS jsonb), :ip_hash, :country)
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
                "country": country,
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


def _ratio(num: Optional[int], den: Optional[int]) -> Optional[float]:
    """Guarded division; None (not 0.0) when there is nothing to divide by, so
    the UI can show an em-dash instead of a confident-looking zero."""
    if not den:
        return None
    return round((num or 0) / den, 4)


def _canonical_growth_funnel(db: Session, since: datetime) -> dict[str, Any]:
    """Cohort funnel stitched from existing domain truth plus growth_events.

    The legacy dashboard's ``login_count >= 2`` remains a useful return proxy,
    but it is not product activation. Canonical activation requires both a
    resolved proof view and a saved watch/alert within 24 hours of signup.
    """
    table_ready = db.execute(
        text("SELECT to_regclass('public.growth_events') IS NOT NULL")
    ).scalar()
    if not table_ready:
        return {
            "status": "migration_required",
            "schema_version": "2026-08-15",
            "definition": "resolved proof + watch/alert within 24h",
        }

    first_at = db.execute(
        text("SELECT min(occurred_at) FROM growth_events")
    ).scalar()
    if first_at is None:
        return {
            "status": "collecting",
            "schema_version": "2026-08-15",
            "definition": "resolved proof + watch/alert within 24h",
            "tracking_started_at": None,
            "totals": {},
            "by_source": [],
            "by_campaign": [],
            "by_content": [],
        }
    cohort_since = max(since, first_at)

    rows = db.execute(
        text(
            """
            WITH cohort AS (
              SELECT id AS user_id, created_at, acq_source, acq_medium,
                     acq_campaign, acq_content
              FROM users
              WHERE created_at >= :since
            ),
            milestones AS (
              SELECT
                g.user_id,
                min(g.occurred_at) FILTER (
                  WHERE g.event = 'proof_verified'
                    AND g.occurred_at < c.created_at + interval '24 hours'
                ) AS proof_at,
                min(g.occurred_at) FILTER (WHERE g.event = 'pricing_viewed') AS pricing_at,
                min(g.occurred_at) FILTER (WHERE g.event = 'plan_selected') AS plan_at,
                min(g.occurred_at) FILTER (WHERE g.event = 'transaction_submitted') AS tx_at
              FROM growth_events g
              JOIN cohort c ON c.user_id = g.user_id
              WHERE g.occurred_at >= c.created_at
              GROUP BY g.user_id
            ),
            armed_events AS (
              SELECT w.user_id, w.created_at AS armed_at
              FROM watchlist w
              JOIN cohort c ON c.user_id = w.user_id
              WHERE w.created_at >= c.created_at
                AND w.created_at < c.created_at + interval '24 hours'
              UNION ALL
              SELECT cw.user_id, cw.created_at
              FROM coin_watch cw
              JOIN cohort c ON c.user_id = cw.user_id
              WHERE cw.created_at >= c.created_at
                AND cw.created_at < c.created_at + interval '24 hours'
              UNION ALL
              SELECT ea.user_id, ea.created_at
              FROM entry_alerts ea
              JOIN cohort c ON c.user_id = ea.user_id
              WHERE ea.created_at >= c.created_at
                AND ea.created_at < c.created_at + interval '24 hours'
            ),
            armed AS (
              SELECT user_id, min(armed_at) AS armed_at
              FROM armed_events
              GROUP BY user_id
            ),
            payment_truth AS (
              SELECT
                p.user_id,
                min(p.created_at) AS invoice_at,
                min(p.verified_at) FILTER (WHERE p.status = 'confirmed') AS paid_at,
                count(*) FILTER (WHERE p.status = 'confirmed') AS confirmed_payments,
                COALESCE(sum(COALESCE(p.final_amount, p.amount_usdt)) FILTER (
                  WHERE p.status = 'confirmed'
                ), 0) AS revenue
              FROM payments p
              JOIN cohort c ON c.user_id = p.user_id
              WHERE p.deleted_at IS NULL AND p.created_at >= c.created_at
              GROUP BY p.user_id
            )
            SELECT
              COALESCE(NULLIF(trim(c.acq_source), ''), '(unknown)') AS source,
              COALESCE(NULLIF(trim(c.acq_medium), ''), '(none)') AS medium,
              COALESCE(NULLIF(trim(c.acq_campaign), ''), '(none)') AS campaign,
              COALESCE(NULLIF(trim(c.acq_content), ''), '(none)') AS content,
              count(*)::int AS signups,
              count(*) FILTER (WHERE m.proof_at IS NOT NULL)::int AS proof_users,
              count(*) FILTER (WHERE a.armed_at IS NOT NULL)::int AS armed_users,
              count(*) FILTER (
                WHERE m.proof_at IS NOT NULL AND a.armed_at IS NOT NULL
              )::int AS activated_users,
              count(*) FILTER (WHERE m.pricing_at IS NOT NULL)::int AS pricing_users,
              count(*) FILTER (WHERE m.plan_at IS NOT NULL)::int AS plan_users,
              count(*) FILTER (WHERE p.invoice_at IS NOT NULL)::int AS invoice_users,
              count(*) FILTER (WHERE m.tx_at IS NOT NULL)::int AS tx_users,
              count(*) FILTER (WHERE p.paid_at IS NOT NULL)::int AS paid_users,
              count(*) FILTER (WHERE p.confirmed_payments > 1)::int AS renewal_users,
              COALESCE(sum(p.revenue), 0) AS revenue
            FROM cohort c
            LEFT JOIN milestones m ON m.user_id = c.user_id
            LEFT JOIN armed a ON a.user_id = c.user_id
            LEFT JOIN payment_truth p ON p.user_id = c.user_id
            GROUP BY 1, 2, 3, 4
            ORDER BY paid_users DESC, activated_users DESC, signups DESC
            """
        ),
        {"since": cohort_since},
    ).mappings().all()

    metric_keys = (
        "signups",
        "proof_users",
        "armed_users",
        "activated_users",
        "pricing_users",
        "plan_users",
        "invoice_users",
        "tx_users",
        "paid_users",
        "renewal_users",
        "revenue_usdt",
    )
    totals = {
        "signups": 0,
        "proof_users": 0,
        "armed_users": 0,
        "activated_users": 0,
        "pricing_users": 0,
        "plan_users": 0,
        "invoice_users": 0,
        "tx_users": 0,
        "paid_users": 0,
        "renewal_users": 0,
        "revenue_usdt": 0.0,
    }
    detailed = []
    for row in rows:
        item = {
            "source": row["source"],
            "medium": row["medium"],
            "campaign": row["campaign"],
            "content": row["content"],
            "signups": int(row["signups"] or 0),
            "proof_users": int(row["proof_users"] or 0),
            "armed_users": int(row["armed_users"] or 0),
            "activated_users": int(row["activated_users"] or 0),
            "pricing_users": int(row["pricing_users"] or 0),
            "plan_users": int(row["plan_users"] or 0),
            "invoice_users": int(row["invoice_users"] or 0),
            "tx_users": int(row["tx_users"] or 0),
            "paid_users": int(row["paid_users"] or 0),
            "renewal_users": int(row["renewal_users"] or 0),
            "revenue_usdt": float(row["revenue"] or 0),
        }
        detailed.append(item)
        for key in totals:
            totals[key] += item[key]

    def _rollup(dimensions: tuple[str, ...]) -> list[dict[str, Any]]:
        buckets: dict[tuple[str, ...], dict[str, Any]] = {}
        for item in detailed:
            group_key = tuple(str(item[dimension]) for dimension in dimensions)
            bucket = buckets.get(group_key)
            if bucket is None:
                bucket = {dimension: item[dimension] for dimension in dimensions}
                bucket.update({key: 0.0 if key == "revenue_usdt" else 0 for key in metric_keys})
                buckets[group_key] = bucket
            for key in metric_keys:
                bucket[key] += item[key]
        return sorted(
            buckets.values(),
            key=lambda item: (
                item["paid_users"],
                item["activated_users"],
                item["signups"],
            ),
            reverse=True,
        )

    by_source = _rollup(("source",))
    by_campaign = _rollup(("source", "medium", "campaign"))
    by_content = _rollup(("source", "medium", "campaign", "content"))

    signups_total = totals["signups"]
    activated_total = totals["activated_users"]
    invoice_total = totals["invoice_users"]
    totals["rates"] = {
        "proof_per_signup": _ratio(totals["proof_users"], signups_total),
        "armed_per_signup": _ratio(totals["armed_users"], signups_total),
        "activated_per_signup": _ratio(activated_total, signups_total),
        "invoice_per_activated": _ratio(invoice_total, activated_total),
        "paid_per_invoice": _ratio(totals["paid_users"], invoice_total),
    }

    return {
        "status": "collecting",
        "schema_version": "2026-08-15",
        "definition": "resolved proof + watch/alert within 24h",
        "tracking_started_at": first_at.isoformat() if first_at else None,
        "cohort_since": cohort_since.isoformat(),
        "totals": totals,
        "by_source": by_source,
        "by_campaign": by_campaign,
        "by_content": by_content,
    }


@growth_router.get("/conversion")
def growth_conversion(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Weekly-style conversion snapshot from users + funnel_events."""
    # Anything at or beyond this means "all time" rather than a literal span,
    # so the caller does not have to know how old the product is.
    ALL_TIME_DAYS = 3650
    days = max(7, min(days, ALL_TIME_DAYS))
    all_time = days >= ALL_TIME_DAYS
    cache_key = f"lq:growth:conversion:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    now = datetime.now(timezone.utc)
    since = (
        datetime(1970, 1, 1, tzinfo=timezone.utc)
        if all_time
        else now - timedelta(days=days)
    )
    # The window before this one, same length. Meaningless for all-time (there is
    # nothing before the beginning), so the payload reports None there rather
    # than a zero that would read as "we lost 100%".
    prev_since = (
        datetime(1970, 1, 1, tzinfo=timezone.utc)
        if all_time
        else since - timedelta(days=days)
    )

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
              ) AS signup_referred,
              -- The equal-length window immediately before this one. It rides
              -- along on the scan we are already doing, so the comparison costs
              -- nothing. A KPI without one is a number nobody can act on.
              count(*) FILTER (
                WHERE created_at >= :prev_since AND created_at < :since
              ) AS prev_signups
            FROM users
            """
        ),
        {
            "since": since,
            "prev_since": prev_since,
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
    funnel_sessions: dict[str, int] = {}
    funnel_threaded: dict[str, int] = {}
    funnel_window: dict[str, Any] = {}
    funnel_by_source: list[dict] = []
    try:
        _ensure_table(db)
        rows = db.execute(
            text(
                """
                SELECT event, count(*)::int AS n
                FROM funnel_events
                WHERE created_at >= :since AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                GROUP BY event
                """
            ),
            {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
        ).mappings().all()
        funnel_counts = {r["event"]: int(r["n"]) for r in rows}

        funnel_by_source = [
            dict(r)
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(source, '(none)') AS source, count(*)::int AS n
                    FROM funnel_events
                    WHERE created_at >= :since AND event = 'cta_click' AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                      AND COALESCE(source,'') NOT ILIKE 'free_onboarding%'
                      AND COALESCE(source,'') NOT ILIKE '%_shown'
                      AND COALESCE(source,'') NOT ILIKE '%backdrop%'
                      AND COALESCE(source,'') NOT ILIKE '%dismiss%'
                    GROUP BY 1
                    ORDER BY n DESC
                    LIMIT 20
                    """
                ),
                {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
            ).mappings().all()
        ]
        # Sessions, not events. Every event repeats at a different rate —
        # cta_click ~2.2x per session, soft_gate_shown ~2.8x, landing_view
        # ~1.6x — so dividing one inflated count by another inflated count
        # with a DIFFERENT inflation factor gives a ratio that is wrong in
        # both directions at once. Measured 2026-08-07: event maths said
        # landing->CTA was 67.6% when the truth was 35.0%, which inverted the
        # diagnosis and pointed optimisation at the step that already worked.
        sess_rows = db.execute(
            text(
                """
                SELECT event, count(DISTINCT session_id)::int AS n
                FROM funnel_events
                WHERE created_at >= :since AND session_id IS NOT NULL AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                GROUP BY event
                """
            ),
            {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
        ).mappings().all()
        funnel_sessions = {r["event"]: int(r["n"]) for r in sess_rows}

        # A funnel is a sequence, so follow the SAME session through it rather
        # than counting each stage independently.
        threaded = db.execute(
            text(
                """
                WITH s AS (
                  SELECT session_id,
                         bool_or(event = 'landing_view')  AS lv,
                         -- free_onboarding_* is a post-login nudge, not a
                         -- landing CTA; historic rows still carry it as a
                         -- cta_click, so exclude it by source too.
                         bool_or(event = 'cta_click'
                                 AND COALESCE(source,'') NOT ILIKE 'free_onboarding%'
                                 AND COALESCE(source,'') NOT ILIKE '%_shown'
                                 AND COALESCE(source,'') NOT ILIKE '%backdrop%'
                                 AND COALESCE(source,'') NOT ILIKE '%dismiss%') AS cta,
                         bool_or(event = 'auth_start')    AS st,
                         bool_or(event = 'auth_success')  AS ok,
                         -- A signup, not a sign-in. auth_success fires on every
                         -- successful authentication from seven call sites; only
                         -- this flag says the account did not exist before.
                         -- Rows written before 2026-08-09 carry no flag and are
                         -- therefore never counted as new.
                         bool_or(event = 'auth_success'
                                 AND meta->>'is_new' = 'true') AS newacct
                  FROM funnel_events
                  WHERE created_at >= :since AND session_id IS NOT NULL AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                  GROUP BY session_id
                )
                SELECT
                  count(*) FILTER (WHERE lv)                       AS landed,
                  count(*) FILTER (WHERE lv AND cta)               AS cta,
                  count(*) FILTER (WHERE lv AND cta AND st)        AS started,
                  count(*) FILTER (WHERE lv AND cta AND st AND ok) AS success,
                  count(*) FILTER (WHERE lv AND cta AND st AND newacct) AS new_account
                FROM s
                """
            ),
            {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
        ).mappings().fetchone()
        funnel_threaded = {k: int(threaded[k] or 0) for k in
                           ("landed", "cta", "started", "success", "new_account")} if threaded else {}

        # How much history this table actually has. The users-side tiles really
        # do cover `days`; funnel_events only started collecting when the
        # tracking shipped, and showing both under one "30d" chip invited a
        # comparison between a 30-day number and a 34-hour one.
        wrow = db.execute(
            text("SELECT min(created_at) AS first_at, max(created_at) AS last_at "
                 "FROM funnel_events WHERE created_at >= :since"),
            {"since": since},
        ).mappings().fetchone()
        if wrow and wrow["first_at"]:
            _first, _last = wrow["first_at"], wrow["last_at"]
            funnel_window = {
                "first_at": _first.isoformat(),
                "last_at": _last.isoformat() if _last else None,
                "hours": round((_last - _first).total_seconds() / 3600.0, 1) if _last else 0.0,
                "covers_full_window": _first <= since + timedelta(hours=1),
            }
    except Exception:
        logger.exception("funnel aggregate failed")
        db.rollback()

    # Activity MAU/WAU for same window
    activity = db.execute(
        text(
            """
            SELECT
              -- Pinned to 30 days, NOT the tab window. DAU and WAU are fixed
              -- spans; when this one followed :since the same tile read 167 on
              -- the 7d chip and 590 on 90d while still calling itself MAU.
              count(DISTINCT user_id) FILTER (
                WHERE occurred_at >= :d30
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
            "d30": now - timedelta(days=30),
            "d7": now - timedelta(days=7),
            "d1": now - timedelta(days=1),
        },
    ).mappings().fetchone()

    signups = int(user_row["signups"] or 0)
    multi = int(user_row["signups_multi_login"] or 0)
    one_shot = int(user_row["signups_one_shot"] or 0)

    # ── Acquisition attribution (first-touch on users) ──
    acq_by_source: list[dict] = []
    acq_by_campaign: list[dict] = []
    acq_by_content: list[dict] = []
    acq_land_by_source: list[dict] = []
    try:
        from app.services.acq_helpers import _ensure_columns, label_source

        _ensure_columns(db)
        acq_by_source = [
            {
                "source": r["source"],
                "label": label_source(r["source"] if r["source"] != "(unknown)" else None),
                "n": int(r["n"]),
                "multi_login": int(r["multi_login"] or 0),
            }
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(NULLIF(TRIM(acq_source), ''), '(unknown)') AS source,
                           count(*)::int AS n,
                           count(*) FILTER (WHERE COALESCE(login_count, 0) >= 2)::int AS multi_login
                    FROM users
                    WHERE created_at >= :since
                    GROUP BY 1
                    ORDER BY n DESC
                    LIMIT 20
                    """
                ),
                {"since": since},
            ).mappings().all()
        ]
        acq_by_campaign = [
            {
                "campaign": r["campaign"],
                "source": r["source"],
                "n": int(r["n"]),
            }
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(NULLIF(TRIM(acq_campaign), ''), '(none)') AS campaign,
                           COALESCE(NULLIF(TRIM(acq_source), ''), '(unknown)') AS source,
                           count(*)::int AS n
                    FROM users
                    WHERE created_at >= :since
                      AND acq_campaign IS NOT NULL
                      AND TRIM(acq_campaign) <> ''
                    GROUP BY 1, 2
                    ORDER BY n DESC
                    LIMIT 20
                    """
                ),
                {"since": since},
            ).mappings().all()
        ]
        acq_by_content = [
            {
                "content": r["content"],
                "source": r["source"],
                "campaign": r["campaign"],
                "n": int(r["n"]),
            }
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(NULLIF(TRIM(acq_content), ''), '(none)') AS content,
                           COALESCE(NULLIF(TRIM(acq_source), ''), '(unknown)') AS source,
                           COALESCE(NULLIF(TRIM(acq_campaign), ''), '(none)') AS campaign,
                           count(*)::int AS n
                    FROM users
                    WHERE created_at >= :since
                      AND acq_content IS NOT NULL
                      AND TRIM(acq_content) <> ''
                    GROUP BY 1, 2, 3
                    ORDER BY n DESC
                    LIMIT 20
                    """
                ),
                {"since": since},
            ).mappings().all()
        ]
        acq_land_by_source = [
            {"source": r["source"], "n": int(r["n"])}
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(source, '(none)') AS source, count(*)::int AS n
                    FROM funnel_events
                    WHERE created_at >= :since AND event = 'acq_land'
                      AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                    GROUP BY 1
                    ORDER BY n DESC
                    LIMIT 20
                    """
                ),
                {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
            ).mappings().all()
        ]

        # Which BUTTON the landing came from, not just which network.
        #
        # This is the only measurement the VIP button can ever have.
        # `apply_acq_to_user` writes acq_* only when the field is empty —
        # first touch, once per account — and the VIP button's whole job is
        # converting people who ALREADY have an account. Their attribution was
        # set months ago, so a VIP click can never appear in signup attribution
        # however well it works. The land event is the only place it exists,
        # and until now the query read `source` and dropped meta entirely.
        acq_land_by_button = [
            {
                "content": r["content"],
                "campaign": r["campaign"],
                "source": r["source"],
                "n": int(r["n"]),
            }
            for r in db.execute(
                text(
                    """
                    SELECT meta->>'content'  AS content,
                           COALESCE(meta->>'campaign', '(none)') AS campaign,
                           COALESCE(source, '(none)') AS source,
                           count(*)::int AS n
                    FROM funnel_events
                    WHERE created_at >= :since AND event = 'acq_land'
                      AND meta->>'content' IS NOT NULL
                      AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                    GROUP BY 1, 2, 3
                    ORDER BY n DESC
                    LIMIT 40
                    """
                ),
                {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
            ).mappings().all()
        ]
    except Exception:
        logger.exception("acq aggregate failed")
        try:
            db.rollback()
        except Exception:
            pass

    # ── Sign-in health: which door is failing, why, and who was lost ──
    auth_health: dict = {}
    try:
        _ensure_table(db)
        by_provider = [
            {
                "provider": r["provider"] or "(unknown)",
                "started": int(r["started"]),
                "success": int(r["success"]),
                "errors": int(r["errors"]),
                "success_rate": (
                    round(int(r["success"]) / int(r["started"]), 4)
                    if int(r["started"]) else None
                ),
            }
            for r in db.execute(
                text(
                    """
                    WITH visitor_provider AS (
                      SELECT provider,
                             COALESCE(ip_hash, session_id) AS visitor_key,
                             bool_or(event = 'auth_start') AS started,
                             bool_or(event = 'auth_success') AS success,
                             bool_or(event = 'auth_error') AS errors
                      FROM funnel_events
                      WHERE created_at >= :since
                        AND event IN ('auth_start', 'auth_success', 'auth_error')
                        AND COALESCE(ip_hash, session_id) IS NOT NULL
                        AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                      GROUP BY provider, COALESCE(ip_hash, session_id)
                    )
                    SELECT provider,
                           count(*) FILTER (WHERE started)::int AS started,
                           count(*) FILTER (WHERE started AND success)::int AS success,
                           count(*) FILTER (WHERE errors)::int AS errors
                    FROM visitor_provider
                    GROUP BY 1
                    HAVING count(*) FILTER (WHERE started) > 0
                        OR count(*) FILTER (WHERE errors) > 0
                    ORDER BY started DESC
                    """
                ),
                {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
            ).mappings().all()
        ]

        by_message = [
            {
                "provider": r["provider"] or "(unknown)",
                "message": r["message"] or "(no message)",
                # `n` remains for old bundles during a rolling deploy. It is
                # visitors now, never raw retries.
                "n": int(r["visitors"]),
                "visitors": int(r["visitors"]),
                "events": int(r["events"]),
                "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
            }
            for r in db.execute(
                text(
                    """
                    SELECT provider,
                           meta->>'message' AS message,
                           count(DISTINCT COALESCE(ip_hash, session_id, id::text))::int AS visitors,
                           count(*)::int AS events,
                           max(created_at) AS last_seen
                    FROM funnel_events
                    WHERE created_at >= :since AND event = 'auth_error'
                      AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                    GROUP BY 1, 2
                    ORDER BY visitors DESC, events DESC
                    LIMIT 12
                    """
                ),
                {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
            ).mappings().all()
        ]

        # People, not events. A visitor counts as recovered if they ever signed
        # in successfully — including after this window — because a later
        # success means they were not lost, whatever the window says.
        impact = db.execute(
            text(
                """
                WITH hit AS (
                    SELECT DISTINCT ip_hash
                    FROM funnel_events
                    WHERE created_at >= :since AND event = 'auth_error'
                      AND ip_hash IS NOT NULL
                      AND ip_hash <> ALL(:internal_ips)
                ),
                ok AS (
                    SELECT DISTINCT ip_hash
                    FROM funnel_events
                    WHERE event = 'auth_success' AND ip_hash IS NOT NULL
                )
                SELECT count(*)::int AS visitors_hit,
                       count(ok.ip_hash)::int AS recovered,
                       (count(*) - count(ok.ip_hash))::int AS lost
                FROM hit LEFT JOIN ok USING (ip_hash)
                """
            ),
            {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
        ).mappings().fetchone()

        recent = [
            {
                "at": r["created_at"].isoformat() if r["created_at"] else None,
                "provider": r["provider"] or "(unknown)",
                "message": (r["meta"] or {}).get("message") if isinstance(r["meta"], dict) else None,
                "path": r["path"],
            }
            for r in db.execute(
                text(
                    """
                    WITH latest_incident AS (
                      SELECT DISTINCT ON (
                               provider,
                               COALESCE(ip_hash, session_id, id::text),
                               COALESCE(meta->>'message', '')
                             )
                             created_at, provider, meta, path
                      FROM funnel_events
                      WHERE created_at >= :since AND event = 'auth_error'
                        AND (ip_hash IS NULL OR ip_hash <> ALL(:internal_ips))
                      ORDER BY provider,
                               COALESCE(ip_hash, session_id, id::text),
                               COALESCE(meta->>'message', ''),
                               created_at DESC
                    )
                    SELECT created_at, provider, meta, path
                    FROM latest_incident
                    ORDER BY created_at DESC
                    LIMIT 8
                    """
                ),
                {"since": since, "internal_ips": list(INTERNAL_IP_HASHES)},
            ).mappings().all()
        ]

        auth_health = {
            "by_provider": by_provider,
            "by_message": by_message,
            "visitors_hit": int(impact["visitors_hit"]) if impact else 0,
            "recovered": int(impact["recovered"]) if impact else 0,
            "lost": int(impact["lost"]) if impact else 0,
            "recent": recent,
        }
    except Exception:
        logger.exception("auth health aggregate failed")
        try:
            db.rollback()
        except Exception:
            pass

    # ── Geo (CF-IPCountry): signed-up users + anonymous funnel visitors ──
    geo_users: list[dict] = []
    geo_visitors: list[dict] = []
    geo_landing: list[dict] = []
    # Never look further back than the day country capture began — see
    # GEO_TRACKING_START. Only the geo block uses this; every other figure on
    # this endpoint still honours the caller's window.
    geo_since = max(since, GEO_TRACKING_START)
    geo_clamped = geo_since > since
    try:
        from app.services.geo_helpers import _ensure_user_geo_columns

        _ensure_user_geo_columns(db)
        _ensure_table(db)
        # Signups in window by first-touch country (fallback last geo)
        geo_users = [
            {"country": r["country"], "n": int(r["n"])}
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(
                             NULLIF(TRIM(geo_country_first), ''),
                             NULLIF(TRIM(geo_country), ''),
                             NULLIF(TRIM(country_code), ''),
                             '(unknown)'
                           ) AS country,
                           count(*)::int AS n
                    FROM users
                    WHERE created_at >= :since
                    GROUP BY 1
                    ORDER BY n DESC
                    LIMIT 40
                    """
                ),
                {"since": geo_since},
            ).mappings().all()
        ]
        # Distinct anonymous visitors (ip_hash) by country on any funnel event
        geo_visitors = [
            {"country": r["country"], "n": int(r["n"])}
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(NULLIF(TRIM(country), ''), '(unknown)') AS country,
                           count(DISTINCT ip_hash)::int AS n
                    FROM funnel_events
                    WHERE created_at >= :since
                      AND ip_hash IS NOT NULL
                    GROUP BY 1
                    ORDER BY n DESC
                    LIMIT 40
                    """
                ),
                {"since": geo_since},
            ).mappings().all()
        ]
        # Landing views by country (includes people who never sign up)
        geo_landing = [
            {"country": r["country"], "n": int(r["n"])}
            for r in db.execute(
                text(
                    """
                    SELECT COALESCE(NULLIF(TRIM(country), ''), '(unknown)') AS country,
                           count(*)::int AS n
                    FROM funnel_events
                    WHERE created_at >= :since
                      AND event IN ('landing_view', 'acq_land')
                    GROUP BY 1
                    ORDER BY n DESC
                    LIMIT 40
                    """
                ),
                {"since": geo_since},
            ).mappings().all()
        ]
    except Exception:
        logger.exception("geo aggregate failed")
        try:
            db.rollback()
        except Exception:
            pass

    # ── Money side of the funnel ────────────────────────────────────────
    # Deliberately NOT chained onto the session funnel above. That one counts
    # anonymous SESSIONS over however much history funnel_events happens to
    # have; this one counts ACCOUNTS over `days`. Multiplying the two produces
    # a number that looks like an end-to-end rate and is not one — the same
    # class of mistake as dividing event counts by event counts.
    money = {}
    try:
        acct = db.execute(
            text(
                """
                SELECT
                  count(*) FILTER (WHERE created_at >= :since) AS signups,
                  count(*) FILTER (
                    WHERE created_at >= :since AND COALESCE(login_count, 0) >= 2
                  ) AS activated
                FROM users
                """
            ),
            {"since": since},
        ).mappings().fetchone()

        pay = db.execute(
            text(
                """
                SELECT
                  count(DISTINCT user_id) FILTER (WHERE created_at >= :since) AS intent_users,
                  count(DISTINCT user_id) FILTER (
                    WHERE created_at >= :since AND status = 'confirmed'
                  ) AS paid_users,
                  count(*) FILTER (
                    WHERE created_at >= :since AND status IN ('expired', 'cancelled')
                  ) AS failed_attempts,
                  COALESCE(sum(COALESCE(final_amount, amount_usdt)) FILTER (
                    WHERE created_at >= :since AND status = 'confirmed'
                  ), 0) AS revenue,
                  COALESCE(sum(COALESCE(final_amount, amount_usdt)) FILTER (
                    WHERE created_at >= :since AND status IN ('expired', 'cancelled')
                  ), 0) AS abandoned
                FROM payments
                WHERE deleted_at IS NULL
                """
            ),
            {"since": since},
        ).mappings().fetchone()

        # Repeat purchase is LIFETIME on purpose. Windowing it to 30 days would
        # report zero renewals for a product whose plans run monthly or longer,
        # which reads as a bug rather than the finding it is.
        repeat = db.execute(
            text(
                """
                SELECT count(*)::int AS n FROM (
                  SELECT user_id FROM payments
                  WHERE status = 'confirmed' AND deleted_at IS NULL
                  GROUP BY user_id HAVING count(*) > 1
                ) t
                """
            )
        ).scalar()

        ever_paid = db.execute(
            text(
                "SELECT count(DISTINCT user_id)::int FROM payments "
                "WHERE status = 'confirmed' AND deleted_at IS NULL"
            )
        ).scalar()

        # One row per rail. With a single rail this looks redundant; it is the
        # point — it makes "there is no alternative" visible instead of assumed.
        rails = [
            {
                "method": r["method"] or "(none)",
                "network": r["network"] or "-",
                "paid": int(r["paid"] or 0),
                "failed": int(r["failed"] or 0),
            }
            for r in db.execute(
                text(
                    """
                    SELECT method, network,
                           count(*) FILTER (WHERE status = 'confirmed')::int AS paid,
                           count(*) FILTER (WHERE status IN ('expired','cancelled'))::int AS failed
                    FROM payments
                    WHERE deleted_at IS NULL
                    GROUP BY 1, 2
                    ORDER BY paid DESC, failed DESC
                    """
                )
            ).mappings().all()
        ]

        signups_w = int(acct["signups"] or 0) if acct else 0
        activated_w = int(acct["activated"] or 0) if acct else 0
        intent_u = int(pay["intent_users"] or 0) if pay else 0
        paid_u = int(pay["paid_users"] or 0) if pay else 0

        money = {
            "signups": signups_w,
            "activated": activated_w,
            "intent_users": intent_u,
            "paid_users": paid_u,
            "failed_attempts": int(pay["failed_attempts"] or 0) if pay else 0,
            "revenue_usdt": float(pay["revenue"] or 0) if pay else 0.0,
            "abandoned_usdt": float(pay["abandoned"] or 0) if pay else 0.0,
            "repeat_payers_lifetime": int(repeat or 0),
            "ever_paid_lifetime": int(ever_paid or 0),
            "rails": rails,
            "rates": {
                "activated_per_signup": _ratio(activated_w, signups_w),
                "intent_per_signup": _ratio(intent_u, signups_w),
                "paid_per_intent": _ratio(paid_u, intent_u),
                "repeat_per_payer": _ratio(int(repeat or 0), int(ever_paid or 0)),
            },
        }
    except Exception:
        logger.exception("global funnel aggregate failed")
        try:
            db.rollback()
        except Exception:
            pass

    canonical_funnel: dict[str, Any] = {}
    try:
        canonical_funnel = _canonical_growth_funnel(db, since)
    except Exception:
        logger.exception("canonical growth funnel aggregate failed")
        try:
            db.rollback()
        except Exception:
            pass
        canonical_funnel = {
            "status": "unavailable",
            "schema_version": "2026-08-15",
            "definition": "resolved proof + watch/alert within 24h",
        }

    payload = {
        "window_days": days,
        "all_time": all_time,
        "as_of": now.isoformat(),
        "users": {
            "signups": signups,
            # Same-length window immediately before, for the delta on the tile.
            # Deliberately NOT provided for the come-back rate: login_count is a
            # cumulative counter with no per-login timestamps, so an older cohort
            # has simply had longer to come back. That comparison would always
            # flatter the past, and a delta that is wrong by construction is
            # worse than no delta.
            "prev_signups": (
                None if all_time else int(user_row["prev_signups"] or 0)
            ),
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
        "funnel_sessions": funnel_sessions,
        "funnel_threaded": funnel_threaded,
        "funnel_window": funnel_window,
        "global_funnel": money,
        "canonical_funnel": canonical_funnel,
        "cta_by_source": funnel_by_source,
        "acquisition": {
            "by_source": acq_by_source,
            "by_campaign": acq_by_campaign,
            "by_content": acq_by_content,
            "land_by_source": acq_land_by_source,
            "land_by_button": acq_land_by_button,
            "attributed": sum(
                int(r["n"]) for r in acq_by_source if r.get("source") not in (None, "(unknown)")
            ),
            "unknown": sum(
                int(r["n"]) for r in acq_by_source if r.get("source") in (None, "(unknown)")
            ),
        },
        "auth_health": auth_health,
        "geo": {
            # The geo block can cover a shorter period than window_days; say so
            # rather than letting the panel imply it shares the tab's range.
            "since": geo_since.isoformat(),
            "clamped": geo_clamped,
            "tracking_started": GEO_TRACKING_START.date().isoformat(),
            "signups_by_country": geo_users,
            "visitors_by_country": geo_visitors,
            "landing_by_country": geo_landing,
            "signups_known": sum(
                int(r["n"]) for r in geo_users if r.get("country") not in (None, "(unknown)")
            ),
            "signups_unknown": sum(
                int(r["n"]) for r in geo_users if r.get("country") in (None, "(unknown)")
            ),
            "visitors_known": sum(
                int(r["n"]) for r in geo_visitors if r.get("country") not in (None, "(unknown)")
            ),
        },
        "rates": {
            # Session-threaded: the same visitor followed through the sequence.
            # The old event-count version is kept nowhere — it was not a
            # conservative approximation, it was a different (wrong) answer.
            "cta_per_landing": _ratio(funnel_threaded.get("cta"), funnel_threaded.get("landed")),
            "auth_start_per_cta": _ratio(funnel_threaded.get("started"), funnel_threaded.get("cta")),
            "auth_success_per_start": _ratio(funnel_threaded.get("success"), funnel_threaded.get("started")),
            "account_per_landing": _ratio(funnel_threaded.get("success"), funnel_threaded.get("landed")),
        },
    }

    cache_set(cache_key, payload, ttl=120)
    return payload


# Buckets are chosen from the span, not asked of the caller. 365 daily points on
# a card this size is a smear nobody can read, and a reader who picks "1 year"
# wants the shape of the year, not 365 individual days.
def _bucket_for(days: int) -> str:
    if days <= 92:
        return "day"
    if days <= 400:
        return "week"
    return "month"


@growth_router.get("/signups-series")
def growth_signups_series(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Signup counts over time, on a range of its own.

    Deliberately separate from /conversion: that endpoint is heavy (a dozen
    aggregates behind a 120s cache) and its window drives the whole tab. Letting
    a reader swing this chart out to a year should not refetch all of it, and
    should not move every other number on the page.
    """
    ALL_TIME_DAYS = 3650
    days = max(7, min(int(days or 30), ALL_TIME_DAYS))
    all_time = days >= ALL_TIME_DAYS
    bucket = "month" if all_time else _bucket_for(days)

    cache_key = f"lq:growth:signup-series:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    now = datetime.now(timezone.utc)
    since = (
        datetime(1970, 1, 1, tzinfo=timezone.utc)
        if all_time
        else now - timedelta(days=days)
    )

    # generate_series fills the gaps. Grouping alone drops days with no signups
    # entirely, which silently shortens a flat stretch into a dense one and makes
    # a quiet week look like a busy one.
    rows = db.execute(
        text(
            """
            -- CAST(), not the :: shorthand. SQLAlchemy's text() binder reads
            -- ":since::timestamptz" as a parameter named "since:" and never
            -- binds it, which fails as a bare syntax error at the colon.
            WITH bounds AS (
                SELECT date_trunc(:bucket, GREATEST(
                           CAST(:since AS timestamptz),
                           COALESCE((SELECT min(created_at) FROM users), now())
                       )) AS lo,
                       date_trunc(:bucket, now()) AS hi
            ),
            grid AS (
                SELECT generate_series(lo, hi, CAST('1 ' || :bucket AS interval)) AS b
                FROM bounds
            ),
            agg AS (
                SELECT date_trunc(:bucket, created_at) AS b,
                       count(*)::int AS total,
                       count(*) FILTER (WHERE auth_provider = 'google')::int   AS google,
                       count(*) FILTER (WHERE auth_provider = 'telegram')::int AS telegram,
                       count(*) FILTER (WHERE auth_provider = 'discord')::int  AS discord
                FROM users
                WHERE created_at >= (SELECT lo FROM bounds)
                GROUP BY 1
            )
            SELECT grid.b AS bucket,
                   COALESCE(agg.total, 0)    AS total,
                   COALESCE(agg.google, 0)   AS google,
                   COALESCE(agg.telegram, 0) AS telegram,
                   COALESCE(agg.discord, 0)  AS discord
            FROM grid LEFT JOIN agg ON agg.b = grid.b
            ORDER BY grid.b
            """
        ),
        {"since": since, "bucket": bucket},
    ).mappings().all()

    # The three providers do NOT sum to the total — early accounts predate
    # auth_provider and carry NULL. Without this remainder a stacked view would
    # draw bars shorter than the number printed beside them.
    series = [
        {
            "bucket": r["bucket"].date().isoformat(),
            "total": int(r["total"]),
            "google": int(r["google"]),
            "telegram": int(r["telegram"]),
            "discord": int(r["discord"]),
            "other": max(
                int(r["total"]) - int(r["google"]) - int(r["telegram"]) - int(r["discord"]),
                0,
            ),
        }
        for r in rows
    ]

    total = sum(p["total"] for p in series)
    payload = {
        "days": days,
        "all_time": all_time,
        "bucket": bucket,
        "as_of": now.isoformat(),
        "total": total,
        # The last bucket is almost always mid-flight — a month that is three
        # days old is not a low month. The chart marks it rather than letting it
        # read as a collapse.
        "partial_last": bool(series),
        "series": series,
    }
    cache_set(cache_key, payload, ttl=300)
    return payload
