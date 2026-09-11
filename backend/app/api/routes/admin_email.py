"""Admin view of the sending domain.

You cannot run a sending reputation you cannot see. Three questions this
answers, and they are the three that decide whether the domain survives:
what went out, what came back, and who we are no longer allowed to write to.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services import email_lifecycle, email_sender

router = APIRouter(prefix="/admin/email", tags=["admin-email"])


@router.get("/overview")
def overview(days: int = Query(30, ge=1, le=365),
             db: Session = Depends(get_db),
             admin: User = Depends(get_admin_user)):
    p = {"d": days}

    totals = db.execute(text("""
        SELECT status, count(*) AS n
        FROM email_events
        WHERE created_at > NOW() - make_interval(days => :d)
        GROUP BY status ORDER BY n DESC
    """), p).mappings().all()

    by_kind = db.execute(text("""
        SELECT kind, category,
               count(*) FILTER (WHERE status IN ('sent','delivered')) AS sent,
               count(*) FILTER (WHERE status = 'failed')              AS failed,
               count(*) FILTER (WHERE status = 'bounced')             AS bounced,
               count(*) FILTER (WHERE status = 'complained')          AS complained
        FROM email_events
        WHERE created_at > NOW() - make_interval(days => :d)
        GROUP BY kind, category ORDER BY sent DESC
    """), p).mappings().all()

    daily = db.execute(text("""
        SELECT date_trunc('day', created_at)::date AS day,
               count(*) FILTER (WHERE status IN ('sent','delivered')) AS sent,
               count(*) FILTER (WHERE status IN ('failed','bounced')) AS problem
        FROM email_events
        WHERE created_at > NOW() - make_interval(days => :d)
        GROUP BY 1 ORDER BY 1
    """), p).mappings().all()

    recent = db.execute(text("""
        SELECT id, email, kind, category, status, detail, created_at
        FROM email_events ORDER BY id DESC LIMIT 60
    """)).mappings().all()

    sup_rows = db.execute(text("""
        SELECT email, reason, created_at FROM email_suppressions
        ORDER BY created_at DESC LIMIT 60
    """)).mappings().all()
    sup_total = db.execute(text("SELECT count(*) FROM email_suppressions")).scalar()

    # Did any of it work? The sends were always visible; the outcome was not,
    # and a channel you cannot judge is a channel you keep feeding on faith.
    #
    # "Came back" is measured against the moment of contact, not the day — a
    # payment that existed before we wrote is not something we caused.
    outreach = db.execute(text("""
        SELECT count(*)                                                     AS contacted,
               count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM payments p
                     WHERE p.user_id = f.user_id
                       AND p.created_at > f.reminder_sent_at))              AS reopened,
               count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM payments p
                     WHERE p.user_id = f.user_id AND p.status = 'confirmed'
                       AND p.verified_at > f.reminder_sent_at))             AS paid,
               min(f.reminder_sent_at)                                      AS first_contact
          FROM admin_followups f
         WHERE f.reminder_sent_at IS NOT NULL AND f.category = 'payment'
    """)).mappings().first()

    referral = db.execute(text("""
        SELECT count(*) FILTER (WHERE status = 'sent')   AS sent,
               count(*) FILTER (WHERE status = 'failed') AS failed,
               count(DISTINCT user_id)                   AS people
          FROM referral_reminder_events
    """)).mappings().first()

    queue = db.execute(text("""
        SELECT count(*) FILTER (WHERE reminder_sent_at IS NULL
                                 AND status = 'pending')  AS waiting,
               count(*)                                   AS total
          FROM admin_followups WHERE category = 'payment'
    """)).mappings().first()

    sent = sum(r["n"] for r in totals if r["status"] in ("sent", "delivered"))
    bad = sum(r["n"] for r in totals if r["status"] in ("bounced", "complained"))

    return {
        "window_days": days,
        # Sending is two switches, not one, and an operator staring at zero
        # sends needs to know which of them is off.
        "configured": email_sender.enabled(),
        "lifecycle_enabled": email_lifecycle.enabled(),
        "sent": sent,
        "problem": bad,
        # The number a provider judges a domain on. Above ~2% is trouble, above
        # 5% is suspension, so it is shown even when it is comfortably zero.
        "bounce_rate": round(bad / sent * 100, 2) if sent else 0.0,
        "totals": [dict(r) for r in totals],
        "by_kind": [dict(r) for r in by_kind],
        "daily": [dict(r) for r in daily],
        "recent": [dict(r) for r in recent],
        "suppressions": {"total": sup_total, "recent": [dict(r) for r in sup_rows]},
        # Read this next to `sent`. A zero here a couple of days after the
        # first contact means nothing yet — this product's signup-to-paid lag
        # is measured in weeks, so the honest reading is "too early", not
        # "it failed".
        "outreach": {**dict(outreach), **dict(queue)},
        "referral": dict(referral),
    }
