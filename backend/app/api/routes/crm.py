"""
CRM segments — who to talk to, and why.

The Users tab already segments by ROLE (subscriber / free / lifetime). That
answers "what are they"; it does not answer "who needs a message today". These
segments are behavioural: people who paid and went quiet, people who tried to
pay and could not, people who came back twice and never bought.

DESIGN RULE — one definition, two uses. Each segment owns a single SQL WHERE
fragment used for BOTH its count and its member list. A card showing 76 that
opens a list of 61 destroys trust in every other number on the page, and that
divergence is exactly what happens when a count is hand-written next to a query.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User  # noqa: F401

logger = logging.getLogger("crm")

router = APIRouter(prefix="/api/v1/workspace/crm", tags=["workspace-crm"])


# key -> definition. `where` is a fragment over `users u`.
SEGMENTS: dict[str, dict[str, Any]] = {
    "ever_subscribed": {
        "label": "Ever subscribed",
        "hint": "Everyone who has ever had access — active, expired, or granted. No time window: this is the whole history.",
        "tone": "green",
        # Four kinds of evidence, because access has been granted four ways over
        # the product's life: a live role, an expiry date that has since passed,
        # a subscription_source set by a grant or legacy import, and a confirmed
        # payment. Checking only role would hide everyone who ever lapsed —
        # which is exactly the population worth looking at.
        "where": """
            u.role <> 'admin' AND (
                u.role IN ('premium','subscriber')
                OR u.subscription_expires_at IS NOT NULL
                OR COALESCE(NULLIF(TRIM(u.subscription_source), ''), NULL) IS NOT NULL
                OR EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id
                           AND p.deleted_at IS NULL AND p.status = 'confirmed')
            )
        """,
    },
    "at_risk": {
        "label": "At risk",
        "hint": "Entitled, but has not opened the app in 21 days. The people most likely to lapse without ever saying why.",
        "tone": "red",
        "where": """
            u.role IN ('premium','subscriber')
            AND (u.last_login_at IS NULL OR u.last_login_at < now() - interval '21 days')
        """,
    },
    "tried_to_pay": {
        "label": "Tried to pay",
        "hint": "Started a payment that expired or was cancelled, and has never completed one. They already decided to buy.",
        "tone": "amber",
        "where": """
            EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id
                    AND p.deleted_at IS NULL AND p.status IN ('expired','cancelled'))
            AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.user_id = u.id
                    AND p2.deleted_at IS NULL AND p2.status = 'confirmed')
        """,
    },
    "warm_prospect": {
        "label": "Warm prospect",
        "hint": "Free, came back at least twice, active in the last 14 days. Interested and still around.",
        "tone": "green",
        "where": """
            u.role = 'free'
            AND COALESCE(u.login_count, 0) >= 2
            AND u.last_login_at >= now() - interval '14 days'
        """,
    },
    "renewal": {
        "label": "Renewal due",
        "hint": "Subscription expires within 7 days.",
        "tone": "amber",
        "where": """
            u.role IN ('premium','subscriber')
            AND u.subscription_expires_at > now()
            AND u.subscription_expires_at <= now() + interval '7 days'
        """,
    },
    "winback": {
        "label": "Just lapsed",
        "hint": "Subscription ended in the last 30 days.",
        "tone": "red",
        "where": """
            u.subscription_expires_at IS NOT NULL
            AND u.subscription_expires_at < now()
            AND u.subscription_expires_at >= now() - interval '30 days'
        """,
    },
    "dormant": {
        "label": "Never activated",
        "hint": "Signed up over 30 days ago and never logged in a second time.",
        "tone": "muted",
        "where": """
            COALESCE(u.login_count, 0) <= 1
            AND CAST(u.created_at AS timestamptz) < now() - interval '30 days'
        """,
    },
    "unreachable_sub": {
        "label": "Entitled, no Telegram",
        "hint": "Has access but no Telegram linked — the signal channel cannot reach them at all.",
        "tone": "amber",
        "where": """
            u.telegram_id IS NULL
            AND u.role IN ('premium','subscriber')
        """,
    },
}


def _count(db: Session, where: str) -> int:
    row = db.execute(text(f"SELECT count(*)::int AS n FROM users u WHERE {where}")).mappings().fetchone()
    return int(row["n"] or 0) if row else 0


@router.get("/segments")
def list_segments(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Every segment with its live count, ordered by how urgent it is to act."""
    out = []
    for key, seg in SEGMENTS.items():
        try:
            n = _count(db, seg["where"])
        except Exception:
            logger.exception("segment count failed: %s", key)
            db.rollback()
            n = None
        out.append({
            "key": key,
            "label": seg["label"],
            "hint": seg["hint"],
            "tone": seg["tone"],
            "count": n,
        })
    return {"segments": out}


@router.get("/segments/{key}")
def segment_members(
    key: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """The people in a segment. Same WHERE as the count — they cannot disagree."""
    seg = SEGMENTS.get(key)
    if not seg:
        raise HTTPException(status_code=404, detail="Unknown segment")

    total = _count(db, seg["where"])
    rows = db.execute(
        text(f"""
            SELECT u.id, u.username, u.email, u.role,
                   u.telegram_id, u.telegram_username,
                   COALESCE(u.login_count, 0) AS login_count,
                   u.last_login_at, u.created_at,
                   u.subscription_expires_at,
                   COALESCE(u.acq_source, '') AS acq_source,
                   -- An invoice the user created and never paid. A plan switch
                   -- auto-cancels the old invoice, so those are excluded: they
                   -- are the checkout working, not the user giving up.
                   (SELECT count(*) FROM payments p
                      WHERE p.user_id = u.id AND p.deleted_at IS NULL
                        AND p.status IN ('expired','cancelled')
                        AND COALESCE(TRIM(p.tx_hash), '') = ''
                        AND COALESCE(p.notes, '') NOT ILIKE '%switch%')::int AS unpaid_invoices,
                   (SELECT count(*) FROM payments p
                      WHERE p.user_id = u.id AND p.deleted_at IS NULL
                        AND p.status = 'cancelled'
                        AND COALESCE(p.notes, '') ILIKE '%switch%')::int AS switched_plan,
                   -- Nobody is in here today. If that changes it is a real
                   -- payment bug, and it must not hide among the abandonments.
                   (SELECT count(*) FROM payments p
                      WHERE p.user_id = u.id AND p.deleted_at IS NULL
                        AND p.status IN ('expired','cancelled')
                        AND COALESCE(TRIM(p.tx_hash), '') <> '')::int AS failed_verify,
                   (SELECT max(p.created_at) FROM payments p
                      WHERE p.user_id = u.id AND p.deleted_at IS NULL) AS last_invoice_at,
                   COALESCE((SELECT sum(COALESCE(p.final_amount, p.amount_usdt))
                      FROM payments p WHERE p.user_id = u.id
                        AND p.deleted_at IS NULL AND p.status = 'confirmed'), 0) AS paid_usdt,
                   COALESCE(NULLIF(TRIM(u.subscription_source), ''), '') AS subscription_source
            FROM users u
            WHERE {seg["where"]}
            -- Most recently seen first: someone who was here yesterday is a
            -- warmer conversation than someone last seen in March.
            ORDER BY u.last_login_at DESC NULLS LAST, u.id DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset},
    ).mappings().all()

    members = []
    for r in rows:
        members.append({
            "id": r["id"],
            "username": r["username"],
            "email": r["email"],
            "role": r["role"],
            "telegram_id": r["telegram_id"],
            "telegram_username": r["telegram_username"],
            "login_count": r["login_count"],
            "last_login_at": r["last_login_at"].isoformat() if r["last_login_at"] else None,
            "created_at": str(r["created_at"]) if r["created_at"] else None,
            "subscription_expires_at": (
                r["subscription_expires_at"].isoformat() if r["subscription_expires_at"] else None
            ),
            "acq_source": r["acq_source"] or None,
            "unpaid_invoices": r["unpaid_invoices"],
            "switched_plan": r["switched_plan"],
            "failed_verify": r["failed_verify"],
            "last_invoice_at": (
                r["last_invoice_at"].isoformat() if r["last_invoice_at"] else None
            ),
            "paid_usdt": float(r["paid_usdt"] or 0),
            "subscription_source": r["subscription_source"] or None,
            # Three states, not two. "No expiry" is not the same as "expired":
            # 113 of 135 entitled accounts carry no expiry date at all, so
            # treating a null as lapsed would mislabel most of the base.
            "access": (
                "lifetime/granted"
                if r["role"] in ("premium", "subscriber") and not r["subscription_expires_at"]
                else "active"
                if r["role"] in ("premium", "subscriber")
                else "expired"
                if r["subscription_expires_at"]
                else "none"
            ),
            # Surfaced per row because it decides HOW you reach them, and a
            # follow-up assigned to someone with no Telegram is a task nobody
            # can complete.
            "reachable": bool(r["telegram_id"]),
        })

    # Activity is fetched for THIS PAGE ONLY, in one query keyed by the ids we
    # already have. Joining user_activity_events into the member query would
    # make every segment pay for a table scan whether or not anyone looks at
    # the activity columns.
    ids = [m["id"] for m in members]
    if ids:
        try:
            act = db.execute(
                text("""
                    SELECT user_id,
                           count(*)::int AS events_total,
                           max(occurred_at) AS last_activity_at,
                           count(*) FILTER (WHERE occurred_at >= now() - interval '30 days')::int AS events_30d,
                           (array_agg(feature ORDER BY occurred_at DESC))[1] AS last_feature
                    FROM user_activity_events
                    WHERE user_id = ANY(:ids)
                    GROUP BY user_id
                """),
                {"ids": ids},
            ).mappings().all()
            by_id = {r["user_id"]: r for r in act}
            for m in members:
                a = by_id.get(m["id"])
                m["events_total"] = int(a["events_total"]) if a else 0
                m["events_30d"] = int(a["events_30d"]) if a else 0
                m["last_activity_at"] = (
                    a["last_activity_at"].isoformat() if a and a["last_activity_at"] else None
                )
                m["last_feature"] = a["last_feature"] if a else None
        except Exception:
            logger.exception("activity enrichment failed")
            db.rollback()
            for m in members:
                m.setdefault("events_total", None)

    return {
        "key": key,
        "label": seg["label"],
        "hint": seg["hint"],
        "total": total,
        "limit": limit,
        "offset": offset,
        "members": members,
    }
