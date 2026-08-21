# backend/app/api/routes/workspace.py
"""
Admin Workspace API — Follow-ups, Marketing Campaigns, Brand TODOs.
All endpoints require admin role. All data SHARED across admins.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.database import get_db
from app.api.deps import get_admin_user
from app.models.user import User
from app.models.workspace import AdminFollowup, MarketingCampaign, BrandTodo
from app.models.subscription import Payment
from app.models.referral import (
    ReferralCode,
    ReferralUse,
    ReferralReminderEvent,
    ReferralReminderPreference,
)
from app.services.telegram_group import send_dm
from app.schemas.workspace import (
    FollowupCreate, FollowupUpdate, FollowupResponse,
    CampaignCreate, CampaignUpdate, CampaignResponse,
    TodoCreate, TodoUpdate, TodoResponse,
    WorkspaceStats, GenerateFollowupsRequest,
)


router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])

_activation_cache: dict = {"at": 0.0, "data": None}


def _activation_snapshot(db: Session, now: datetime, *, with_analytics: bool = False) -> dict:
    """Paid members vs Agent connect/live — the growth leak after checkout.

    Cached briefly because it reads the cryptobot RO database and this
    snapshot is polled from the workspace pulse every minute.
    """
    import time

    cache_key = "full" if with_analytics else "pulse"
    bucket = (_activation_cache.get("data") or {}) if isinstance(_activation_cache.get("data"), dict) else {}
    # Pulse and full share the same body; only profitable_bots needs analytics.
    if bucket.get(cache_key) is not None and time.monotonic() - float(bucket.get(f"{cache_key}_at") or 0) < 45:
        return bucket[cache_key]

    paying = (
        db.query(User)
        .filter(
            User.role.in_(["premium", "subscriber"]),
            User.is_active.is_(True),
            or_(User.subscription_expires_at.is_(None), User.subscription_expires_at > now),
        )
        .all()
    )
    paying_ids = {u.id for u in paying}
    empty = {
        "paying": len(paying_ids),
        "agent_connected": 0,
        "paid_connected": 0,
        "paid_live": 0,
        "paid_no_agent": len(paying_ids),
        "agent_live": 0,
        "agent_errors": 0,
        "agent_invalid_keys": 0,
        "agent_venues": [],
        "profitable_bots": 0,
        "connect_rate_paid": None,
        "live_rate_paid": None,
        "outreach": [],
    }
    try:
        from app.services import autotrade_monitor

        ov = autotrade_monitor.overview()
        if ov.get("available"):
            from app.api.routes.admin_autotrade import decorate_agent_overview

            decorate_agent_overview(db, ov)
        an = (
            autotrade_monitor.analytics(since=autotrade_monitor.TRACKING_RESET_AT)
            if with_analytics
            else {}
        )
    except Exception:
        ov, an = {"available": False, "users": [], "totals": {}}, {}

    if not ov.get("available"):
        store = _activation_cache.get("data") if isinstance(_activation_cache.get("data"), dict) else {}
        store[cache_key] = empty
        store[f"{cache_key}_at"] = time.monotonic()
        _activation_cache["data"] = store
        return empty

    users = ov.get("users") or []
    connected_ids = {
        u.get("luxquant_user_id")
        for u in users
        if u.get("has_account") and u.get("luxquant_user_id")
    }
    live_ids = {
        u.get("luxquant_user_id")
        for u in users
        if u.get("is_active") and u.get("dry_run") is False and u.get("luxquant_user_id")
    }
    paid_connected = len(paying_ids & connected_ids)
    paid_live = len(paying_ids & live_ids)
    outreach = []
    for u in paying:
        if u.id in connected_ids:
            continue
        outreach.append(
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "expires_at": u.subscription_expires_at.isoformat() if u.subscription_expires_at else None,
                "days_inactive": (now - u.last_active_at).days if u.last_active_at else None,
                "has_telegram": bool(getattr(u, "telegram_id", None)),
            }
        )
    outreach.sort(key=lambda r: (r["days_inactive"] is not None, r["days_inactive"] or 0), reverse=True)
    totals = ov.get("totals") or {}
    an_tot = (an or {}).get("totals") or {}
    result = {
        "paying": len(paying_ids),
        "agent_connected": len(connected_ids),
        "paid_connected": paid_connected,
        "paid_live": paid_live,
        "paid_no_agent": len(outreach),
        "agent_live": int(totals.get("live") or 0),
        "agent_errors": int(totals.get("errors") or 0),
        "agent_invalid_keys": int(totals.get("invalid_keys") or 0),
        "agent_venues": ov.get("by_exchange") or [],
        "profitable_bots": int(an_tot.get("profitable_users") or 0),
        "connect_rate_paid": round(paid_connected / len(paying_ids) * 100, 1) if paying_ids else None,
        "live_rate_paid": round(paid_live / paid_connected * 100, 1) if paid_connected else None,
        "outreach": outreach[:25],
    }
    store = _activation_cache.get("data") if isinstance(_activation_cache.get("data"), dict) else {}
    store[cache_key] = result
    store[f"{cache_key}_at"] = time.monotonic()
    _activation_cache["data"] = store
    return result


REFERRAL_REMINDER_COOLDOWN_DAYS = 30
REFERRAL_REMINDER_ACTIVE_DAYS = 30
REFERRAL_REMINDER_MIN_ACCOUNT_DAYS = 14
REFERRAL_REMINDER_MAX_180D = 3


def _aware(dt):
    """Normalise legacy naive timestamps before comparing them to UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _referral_reminder_message(user, code, advocate):
    username = user.username or "there"
    link = f"https://luxquant.tw/?ref={code.code}"
    portal = "https://luxquant.tw/referral"
    referred = advocate["referred"]
    commission = advocate["commission"]

    if referred:
        lead = (
            f"Your LuxQuant link has already brought in {referred} member"
            f"{'s' if referred != 1 else ''}"
        )
        if commission:
            lead += f" and earned ${commission:,.2f} in referral credit"
        lead += "."
    elif (code.share_count or 0) > 0:
        lead = "You have shared your LuxQuant link before — it is ready whenever you want to use it again."
    else:
        lead = "Your personal LuxQuant referral link is ready, but it has not been shared yet."

    return (
        f"Hi {username},\n\n{lead}\n\n"
        "Share it. They join free and verify the public record. "
        "You earn USDT (10% of what they pay) and 3 friends who actually use LuxQuant unlock 7 days of full access.\n\n"
        f"Your link: {link}\n"
        f"Telegram Mini App: https://t.me/LuxQuantTerminalBot/terminal?startapp=lq1r_{(code.code or '').lower()}\n"
        f"Dashboard: {portal}\n\n"
        "Reply STOP if you do not want referral reminders."
    )


def _build_referral_ops(db: Session, now: datetime) -> dict:
    """Build the complete admin referral graph and safe reminder queue."""
    codes = (
        db.query(ReferralCode)
        .filter(ReferralCode.is_active == True)
        .order_by(ReferralCode.user_id, ReferralCode.created_at.desc())
        .all()
    )
    code_by_owner = {}
    for code in codes:
        code_by_owner.setdefault(code.user_id, code)

    uses = db.query(ReferralUse).order_by(ReferralUse.created_at.desc()).all()
    user_ids = set(code_by_owner)
    for use in uses:
        user_ids.add(use.referrer_id)
        user_ids.add(use.referred_id)
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids else {}
    )

    referred_ids = [u.referred_id for u in uses]
    REV = func.coalesce(Payment.final_amount, Payment.amount_usdt)
    PAID_AT = func.coalesce(Payment.verified_at, Payment.created_at)
    revenue_by_user = {}
    confirmed_payments_by_user = {}
    first_paid_at = {}
    if referred_ids:
        paid_rows = (
            db.query(
                Payment.user_id,
                func.coalesce(func.sum(REV), 0),
                func.count(Payment.id),
                func.min(PAID_AT),
            )
            .filter(
                Payment.status == "confirmed",
                Payment.deleted_at.is_(None),
                Payment.user_id.in_(referred_ids),
            )
            .group_by(Payment.user_id)
            .all()
        )
        revenue_by_user = {uid: float(amount or 0) for uid, amount, _count, _ts in paid_rows}
        confirmed_payments_by_user = {uid: int(count or 0) for uid, _amount, count, _ts in paid_rows}
        first_paid_at = {uid: ts for uid, _amount, _count, ts in paid_rows if ts}

    payment_ids = [u.payment_id for u in uses if u.payment_id]
    payment_by_id = {
        p.id: p for p in db.query(Payment).filter(Payment.id.in_(payment_ids or [-1])).all()
    }

    preferences = {
        p.user_id: p
        for p in db.query(ReferralReminderPreference).filter(
            ReferralReminderPreference.user_id.in_(list(code_by_owner) or [-1])
        ).all()
    }
    d180 = now - timedelta(days=180)
    recent_events = (
        db.query(ReferralReminderEvent)
        .filter(ReferralReminderEvent.created_at >= d180)
        .order_by(ReferralReminderEvent.created_at.desc())
        .all()
    )
    events_by_user = {}
    for event in recent_events:
        events_by_user.setdefault(event.user_id, []).append(event)

    advocate_map = {}
    for owner_id, code in code_by_owner.items():
        owner = users.get(owner_id)
        if not owner:
            continue
        advocate_map[owner_id] = {
            "user_id": owner_id,
            "username": owner.username,
            "role": owner.role,
            "code": code.code,
            "code_id": code.id,
            "discount_pct": float(code.discount_pct or 0),
            "commission_pct": float(code.commission_pct or 0),
            "shares": int(code.share_count or 0),
            "qr_downloads": int(code.qr_count or 0),
            "last_shared_at": code.last_shared_at,
            "referred": 0,
            "activated": 0,
            "qualified": 0,
            "subscribed": 0,
            "payments": 0,
            "revenue": 0.0,
            "commission": 0.0,
            "last_referral_at": None,
            "last_active_at": owner.last_active_at or owner.last_login_at,
            "telegram_reachable": bool(owner.telegram_id),
        }

    relationships = []
    paid_by_code = {}
    refunded_commission = 0
    for use in uses:
        referrer = users.get(use.referrer_id)
        referred = users.get(use.referred_id)
        revenue = revenue_by_user.get(use.referred_id, 0.0)
        confirmed_payments = confirmed_payments_by_user.get(use.referred_id, 0)
        linked_payment = payment_by_id.get(use.payment_id)
        payment_state = linked_payment.status if linked_payment else None
        if confirmed_payments:
            paid_by_code[use.referral_code_id] = paid_by_code.get(use.referral_code_id, 0) + 1
        if payment_state == "refunded" and float(use.total_commission_earned or 0) > 0:
            refunded_commission += 1
        advocate = advocate_map.get(use.referrer_id)
        if advocate:
            advocate["referred"] += 1
            advocate["activated"] += int(bool(use.first_login_at) or use.status != "pending")
            advocate["qualified"] += int(bool(use.qualified_at))
            advocate["subscribed"] += int(confirmed_payments > 0)
            advocate["payments"] += confirmed_payments
            advocate["revenue"] += revenue
            advocate["commission"] += float(use.total_commission_earned or 0)
            created = _aware(use.created_at)
            current_last = _aware(advocate["last_referral_at"])
            if created and (not current_last or created > current_last):
                advocate["last_referral_at"] = use.created_at

        relationships.append({
            "id": use.id,
            "referrer_id": use.referrer_id,
            "referrer_username": referrer.username if referrer else f"#{use.referrer_id}",
            "referrer_role": referrer.role if referrer else None,
            "referred_id": use.referred_id,
            "referred_username": referred.username if referred else f"#{use.referred_id}",
            "referred_role": referred.role if referred else None,
            "status": "refunded" if payment_state == "refunded" else use.status,
            "relationship_status": use.status,
            "payment_status": payment_state,
            "joined_at": use.created_at,
            "activated_at": use.first_login_at,
            "qualified": bool(use.qualified_at),
            "qualified_at": use.qualified_at,
            "reward_days": int(use.reward_days_granted or 0),
            "last_active_at": (referred.last_active_at or referred.last_login_at) if referred else None,
            "first_paid_at": first_paid_at.get(use.referred_id),
            "payments": confirmed_payments,
            "historical_payments": int(use.total_payments or 0),
            "revenue": revenue,
            "commission": float(use.total_commission_earned or 0),
        })

    status_counts = {
        "eligible": 0, "cooldown": 0, "recently_shared": 0, "inactive": 0,
        "unreachable": 0, "warming": 0, "capped": 0, "paused": 0,
    }
    candidates = []
    for owner_id, advocate in advocate_map.items():
        owner = users[owner_id]
        code = code_by_owner[owner_id]
        pref = preferences.get(owner_id)
        sent_events = [e for e in events_by_user.get(owner_id, []) if e.status == "sent"]
        last_sent = _aware(sent_events[0].sent_at or sent_events[0].created_at) if sent_events else None
        last_seen = _aware(owner.last_active_at or owner.last_login_at)
        code_created = _aware(code.created_at) or now
        last_shared = _aware(code.last_shared_at)

        if pref and pref.opted_out:
            state, reason = "paused", pref.reason or "Paused by admin / user request"
        elif not owner.telegram_id:
            state, reason = "unreachable", "Telegram bot is not linked"
        elif (now - code_created).days < REFERRAL_REMINDER_MIN_ACCOUNT_DAYS:
            state, reason = "warming", "Referral code is still in the welcome period"
        elif not last_seen or last_seen < now - timedelta(days=REFERRAL_REMINDER_ACTIVE_DAYS):
            state, reason = "inactive", "User has not been active in the last 30 days"
        elif last_shared and last_shared >= now - timedelta(days=REFERRAL_REMINDER_COOLDOWN_DAYS):
            state, reason = "recently_shared", "Already shared within the last 30 days"
        elif last_sent and last_sent >= now - timedelta(days=REFERRAL_REMINDER_COOLDOWN_DAYS):
            days_left = REFERRAL_REMINDER_COOLDOWN_DAYS - (now - last_sent).days
            state, reason = "cooldown", f"Reminder cooldown · {days_left}d remaining"
        elif len(sent_events) >= REFERRAL_REMINDER_MAX_180D:
            state, reason = "capped", "Reached the 3 reminders / 180 days safety cap"
        else:
            state, reason = "eligible", "Engaged, reachable, and outside all cooldowns"

        segment = (
            "champion" if advocate["referred"] > 0
            else "restart" if advocate["shares"] > 0
            else "first_share"
        )
        advocate["reminder"] = {
            "state": state,
            "reason": reason,
            "segment": segment,
            "last_sent_at": last_sent,
            "sent_180d": len(sent_events),
            "opted_out": bool(pref and pref.opted_out),
        }
        status_counts[state] += 1
        if state == "eligible":
            candidates.append(advocate)

    advocates = sorted(
        advocate_map.values(),
        key=lambda a: (a["subscribed"], a["referred"], a["shares"], a["revenue"]),
        reverse=True,
    )
    candidates.sort(
        key=lambda a: (a["referred"] > 0, a["referred"], a["shares"], a["last_active_at"] or now),
        reverse=True,
    )

    total_referred = len(uses)
    total_activated = sum(1 for u in uses if u.first_login_at or u.status != "pending")
    total_subscribed = sum(1 for u in uses if confirmed_payments_by_user.get(u.referred_id, 0) > 0)
    code_mismatches = sum(
        1 for code in codes if int(code.times_used or 0) != paid_by_code.get(code.id, 0)
    )
    user_without_use = db.query(func.count(User.id)).filter(
        User.referred_by.isnot(None),
        ~db.query(ReferralUse.id).filter(ReferralUse.referred_id == User.id).exists(),
    ).scalar() or 0
    referrer_mismatch = (
        db.query(func.count(ReferralUse.id))
        .join(User, User.id == ReferralUse.referred_id)
        .filter(User.referred_by.is_distinct_from(ReferralUse.referrer_id))
        .scalar() or 0
    )

    history = []
    for event in recent_events[:25]:
        owner = users.get(event.user_id) or db.query(User).filter(User.id == event.user_id).first()
        history.append({
            "id": event.id,
            "user_id": event.user_id,
            "username": owner.username if owner else f"#{event.user_id}",
            "segment": event.segment,
            "channel": event.channel,
            "status": event.status,
            "error": event.error,
            "sent_at": event.sent_at,
            "created_at": event.created_at,
        })

    monthly = {}
    activate_days = []
    pay_days = []
    role_mix = {}
    for use in uses:
        created = _aware(use.created_at)
        key = created.strftime("%Y-%m") if created else ""
        bucket = monthly.setdefault(
            key, {"referred": 0, "activated": 0, "qualified": 0, "paid": 0, "revenue": 0.0}
        )
        bucket["referred"] += 1
        activated = bool(use.first_login_at) or use.status != "pending"
        if activated:
            bucket["activated"] += 1
        if use.qualified_at:
            bucket["qualified"] += 1
        paid = confirmed_payments_by_user.get(use.referred_id, 0) > 0
        if paid:
            bucket["paid"] += 1
            bucket["revenue"] += revenue_by_user.get(use.referred_id, 0.0)
        login_at = _aware(use.first_login_at)
        if created and login_at:
            activate_days.append(max(0, (login_at - created).days))
        paid_ts = _aware(first_paid_at.get(use.referred_id))
        if created and paid_ts:
            pay_days.append(max(0, (paid_ts - created).days))
        referred_user = users.get(use.referred_id)
        role_key = (referred_user.role if referred_user else None) or "unknown"
        role_mix[role_key] = role_mix.get(role_key, 0) + 1

    def _avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    def _median(xs):
        if not xs:
            return None
        ordered = sorted(xs)
        mid = len(ordered) // 2
        if len(ordered) % 2:
            return float(ordered[mid])
        return round((ordered[mid - 1] + ordered[mid]) / 2, 1)

    activity_trend = []
    cursor = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)).replace(day=1)
    empty_month = {"referred": 0, "activated": 0, "qualified": 0, "paid": 0, "revenue": 0.0}
    while cursor <= now:
        key = cursor.strftime("%Y-%m")
        activity_trend.append({"month": key, **(monthly.get(key) or empty_month)})
        if cursor.month == 12:
            cursor = cursor.replace(year=cursor.year + 1, month=1)
        else:
            cursor = cursor.replace(month=cursor.month + 1)

    producing = [a for a in advocates if a["referred"] > 0]
    top1 = producing[0] if producing else None
    top3_referred = sum(a["referred"] for a in producing[:3])
    top3_revenue = sum(a["revenue"] for a in producing[:3])
    top_hubs = [
        {
            "user_id": a["user_id"],
            "username": a["username"],
            "referred": a["referred"],
            "activated": a["activated"],
            "qualified": a["qualified"],
            "subscribed": a["subscribed"],
            "revenue": a["revenue"],
            "commission": a["commission"],
        }
        for a in producing[:8]
    ]

    return {
        "summary": {
            "advocates": len(advocates),
            "tracked_shares": sum(a["shares"] for a in advocates),
            "referred": total_referred,
            "activated": total_activated,
            "qualified": sum(1 for u in uses if u.qualified_at),
            "unlock_days": sum(int(u.reward_days_granted or 0) for u in uses),
            "subscribed": total_subscribed,
            "activation_rate": (total_activated / total_referred * 100) if total_referred else 0,
            "paid_rate": (total_subscribed / total_referred * 100) if total_referred else 0,
            "revenue": sum(a["revenue"] for a in advocates),
            "commission": sum(a["commission"] for a in advocates),
        },
        "velocity": {
            "avg_days_to_activate": _avg(activate_days),
            "median_days_to_activate": _median(activate_days),
            "avg_days_to_pay": _avg(pay_days),
            "median_days_to_pay": _median(pay_days),
            "activated_sample": len(activate_days),
            "paid_sample": len(pay_days),
        },
        "concentration": {
            "producing_advocates": len(producing),
            "top1_username": top1["username"] if top1 else None,
            "top1_referred": top1["referred"] if top1 else 0,
            "top1_share": (top1["referred"] / total_referred * 100) if top1 and total_referred else 0,
            "top3_referred": top3_referred,
            "top3_share": (top3_referred / total_referred * 100) if total_referred else 0,
            "top3_revenue": top3_revenue,
        },
        "role_mix": [{"role": k, "count": v} for k, v in sorted(role_mix.items(), key=lambda x: -x[1])],
        "activity_trend": activity_trend,
        "top_hubs": top_hubs,
        "advocates": advocates,
        "relationships": relationships,
        "reminders": {
            "policy": {
                "cooldown_days": REFERRAL_REMINDER_COOLDOWN_DAYS,
                "active_days": REFERRAL_REMINDER_ACTIVE_DAYS,
                "min_account_days": REFERRAL_REMINDER_MIN_ACCOUNT_DAYS,
                "max_per_180d": REFERRAL_REMINDER_MAX_180D,
                "automatic_send": False,
            },
            "counts": status_counts,
            "candidates": candidates,
            "history": history,
        },
        "data_quality": {
            "user_without_use": int(user_without_use),
            "referrer_mismatch": int(referrer_mismatch),
            "code_use_mismatch": int(code_mismatches),
            "refunded_commission": int(refunded_commission),
            "healthy": not (
                user_without_use or referrer_mismatch or code_mismatches or refunded_commission
            ),
        },
    }


# ════════════════════════════════════════════════════════════════════
# Helper: serialize Campaign (extra_data field instead of metadata)
# ════════════════════════════════════════════════════════════════════

def _serialize_campaign(c: MarketingCampaign) -> dict:
    """Serialize MarketingCampaign."""
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "platform": c.platform,
        "budget_usd": float(c.budget_usd or 0),
        "spent_usd": float(c.spent_usd or 0),
        "extra_data": c.extra_data or {},
        "line_items": c.line_items or [],
        "start_date": c.start_date,
        "end_date": c.end_date,
        "status": c.status,
        "created_by": c.created_by,
        "creator": {"id": c.creator.id, "username": c.creator.username} if c.creator else None,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


# ════════════════════════════════════════════════════════════════════
# STATS — workspace overview
# ════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=WorkspaceStats)
def workspace_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    # Follow-up counts
    followups_pending = db.query(AdminFollowup).filter(
        AdminFollowup.status.in_(['pending', 'in_progress'])
    ).count()

    followups_overdue = db.query(AdminFollowup).filter(
        AdminFollowup.status.in_(['pending', 'in_progress']),
        AdminFollowup.due_date < now,
    ).count()

    followups_today = db.query(AdminFollowup).filter(
        AdminFollowup.status.in_(['pending', 'in_progress']),
        AdminFollowup.due_date >= today_start,
        AdminFollowup.due_date < today_end,
    ).count()

    # Marketing
    campaigns_active = db.query(MarketingCampaign).filter(
        MarketingCampaign.status == 'active'
    ).count()

    budget_row = db.query(
        func.coalesce(func.sum(MarketingCampaign.budget_usd), 0),
        func.coalesce(func.sum(MarketingCampaign.spent_usd), 0),
    ).filter(MarketingCampaign.status != 'cancelled').first()

    total_budget = float(budget_row[0] or 0)
    total_spent = float(budget_row[1] or 0)

    # TODOs
    todos_in_progress = db.query(BrandTodo).filter(BrandTodo.status == 'in_progress').count()
    todos_backlog = db.query(BrandTodo).filter(BrandTodo.status == 'backlog').count()
    todos_urgent = db.query(BrandTodo).filter(
        BrandTodo.status.in_(['backlog', 'in_progress']),
        BrandTodo.priority == 'urgent',
    ).count()

    activation = _activation_snapshot(db, now)
    return WorkspaceStats(
        followups_pending=followups_pending,
        followups_overdue=followups_overdue,
        followups_today=followups_today,
        campaigns_active=campaigns_active,
        total_budget=total_budget,
        total_spent=total_spent,
        todos_in_progress=todos_in_progress,
        todos_backlog=todos_backlog,
        todos_urgent=todos_urgent,
        agent_live=int(activation.get("agent_live") or 0),
        agent_errors=int(activation.get("agent_errors") or 0),
        agent_invalid_keys=int(activation.get("agent_invalid_keys") or 0),
        agent_connected=int(activation.get("agent_connected") or 0),
        paid_no_agent=int(activation.get("paid_no_agent") or 0),
    )


# ════════════════════════════════════════════════════════════════════
# GROWTH — revenue, retention & attribution analytics (read-only)
# ════════════════════════════════════════════════════════════════════

@router.get("/growth")
def growth_analytics(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Business intelligence for the admin workspace — all derived from
    existing data (payments, subscriptions, referrals). No writes.
    """
    now = datetime.now(timezone.utc)
    d30, d60, d365 = now - timedelta(days=30), now - timedelta(days=60), now - timedelta(days=365)

    # Confirmed, non-voided revenue. Prefer final_amount (net) over gross.
    REV = func.coalesce(Payment.final_amount, Payment.amount_usdt)
    PAID_AT = func.coalesce(Payment.verified_at, Payment.created_at)
    CONFIRMED = (Payment.status == 'confirmed', Payment.deleted_at.is_(None))

    # ── Revenue totals ──
    row = db.query(
        func.coalesce(func.sum(REV), 0),
        func.count(Payment.id),
        func.count(func.distinct(Payment.user_id)),
    ).filter(*CONFIRMED).first()
    total_revenue = float(row[0] or 0)
    payment_count = int(row[1] or 0)
    paying_customers = int(row[2] or 0)
    aov = total_revenue / payment_count if payment_count else 0
    ltv = total_revenue / paying_customers if paying_customers else 0

    def _rev_between(lo, hi=None):
        q = db.query(func.coalesce(func.sum(REV), 0)).filter(*CONFIRMED, PAID_AT >= lo)
        if hi is not None:
            q = q.filter(PAID_AT < hi)
        return float(q.scalar() or 0)

    rev_30 = _rev_between(d30)
    rev_prev30 = _rev_between(d60, d30)
    mom_pct = ((rev_30 - rev_prev30) / rev_prev30 * 100) if rev_prev30 else None

    # ── 12-month revenue trend ──
    month = func.date_trunc('month', PAID_AT)
    trend_rows = (
        db.query(month, func.coalesce(func.sum(REV), 0), func.count(Payment.id))
        .filter(*CONFIRMED, PAID_AT >= d365)
        .group_by(month).order_by(month).all()
    )
    by_month = {
        (m.strftime("%Y-%m") if m else ""): {"revenue": float(s or 0), "count": int(c or 0)}
        for m, s, c in trend_rows
        if m
    }
    trend = []
    cursor = (now.replace(day=1) - timedelta(days=365)).replace(day=1)
    while cursor <= now:
        key = cursor.strftime("%Y-%m")
        point = by_month.get(key) or {"revenue": 0.0, "count": 0}
        trend.append({"month": key, **point})
        if cursor.month == 12:
            cursor = cursor.replace(year=cursor.year + 1, month=1)
        else:
            cursor = cursor.replace(month=cursor.month + 1)

    # ── Subscriptions & churn ──
    active_subs = db.query(func.count(User.id)).filter(
        User.role.in_(['premium', 'subscriber']),
        User.is_active == True,
        or_(User.subscription_expires_at.is_(None), User.subscription_expires_at > now),
    ).scalar() or 0
    lapsed_30d = db.query(func.count(User.id)).filter(
        User.role != 'admin',
        User.subscription_expires_at.isnot(None),
        User.subscription_expires_at <= now,
        User.subscription_expires_at >= d30,
    ).scalar() or 0
    churn_rate = (lapsed_30d / (active_subs + lapsed_30d) * 100) if (active_subs + lapsed_30d) else 0
    payments_30d = db.query(func.count(Payment.id)).filter(*CONFIRMED, PAID_AT >= d30).scalar() or 0
    arpu_30 = rev_30 / active_subs if active_subs else 0

    # ── Attribution by subscription source ──
    src_users = dict(
        db.query(User.subscription_source, func.count(User.id))
        .filter(User.subscription_source.isnot(None), User.subscription_source != '')
        .group_by(User.subscription_source).all()
    )
    src_rev = dict(
        db.query(User.subscription_source, func.coalesce(func.sum(REV), 0))
        .join(Payment, Payment.user_id == User.id)
        .filter(*CONFIRMED, User.subscription_source.isnot(None), User.subscription_source != '')
        .group_by(User.subscription_source).all()
    )
    by_source = sorted(
        [
            {"source": s, "users": int(u or 0), "revenue": float(src_rev.get(s, 0) or 0)}
            for s, u in src_users.items()
        ],
        key=lambda x: x["revenue"], reverse=True,
    )

    # ── Referral operating system ──
    referral_ops = _build_referral_ops(db, now)
    # The directory has its own paginated endpoint. Keep the growth payload
    # lean as the advocate base scales into the thousands.
    referral_ops["advocate_total"] = len(referral_ops.get("advocates", []))
    referral_ops.pop("advocates", None)

    # ── Health: churn-risk (paying but going quiet) ──
    d14 = now - timedelta(days=14)
    risk_users = (
        db.query(User)
        .filter(
            User.role.in_(['premium', 'subscriber']),
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at > now,
            or_(User.last_active_at.is_(None), User.last_active_at < d14),
        )
        .order_by(User.last_active_at.is_(None).desc(), User.last_active_at.asc())
        .limit(15).all()
    )
    churn_risk = [
        {
            "id": u.id,
            "username": u.username,
            "days_inactive": (now - u.last_active_at).days if u.last_active_at else None,
            "expires_at": u.subscription_expires_at,
        }
        for u in risk_users
    ]

    return {
        "revenue": {
            "total": total_revenue,
            "last_30d": rev_30,
            "prev_30d": rev_prev30,
            "mom_pct": mom_pct,
            "aov": aov,
            "ltv": ltv,
            "paying_customers": paying_customers,
            "payment_count": payment_count,
            "trend": trend,
        },
        "recurring": {
            "run_rate_30d": rev_30,
            "arpu_30d": arpu_30,
            "active_subs": active_subs,
        },
        "churn": {
            "active_subs": active_subs,
            "lapsed_30d": lapsed_30d,
            "churn_rate": churn_rate,
            "payments_30d": payments_30d,
        },
        "attribution": {
            "by_source": by_source,
            "referral": referral_ops,
        },
        "health": {"churn_risk": churn_risk},
        "activation": _activation_snapshot(db, now, with_analytics=True),
        "generated_at": now,
    }


@router.get("/growth/referrals/advocates")
def list_referral_advocates(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=10, le=50),
    search: Optional[str] = Query(None, max_length=100),
    role: str = Query("all"),
    reminder: str = Query("all"),
    performance: str = Query("all"),
    reach: str = Query("all"),
    sort_by: str = Query("referred"),
    order: str = Query("desc"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Paginated, combinable advocate directory for Growth operations."""
    snapshot = _build_referral_ops(db, datetime.now(timezone.utc))
    all_items = snapshot["advocates"]

    valid_roles = {"all", "free", "subscriber", "premium"}
    valid_reminders = {
        "all", "eligible", "cooldown", "recently_shared", "inactive",
        "unreachable", "warming", "capped", "paused",
    }
    valid_performance = {"all", "has_referrals", "has_paid", "shared", "zero_activity"}
    valid_reach = {"all", "telegram", "no_telegram"}
    valid_sorts = {"referred", "paid", "revenue", "reward", "shares", "last_active", "username"}
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail="Invalid role filter")
    if reminder not in valid_reminders:
        raise HTTPException(status_code=400, detail="Invalid reminder filter")
    if performance not in valid_performance:
        raise HTTPException(status_code=400, detail="Invalid performance filter")
    if reach not in valid_reach:
        raise HTTPException(status_code=400, detail="Invalid reach filter")
    if sort_by not in valid_sorts or order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="Invalid sort")

    role_counts = {}
    reminder_counts = {}
    for item in all_items:
        role_counts[item["role"]] = role_counts.get(item["role"], 0) + 1
        state = item["reminder"]["state"]
        reminder_counts[state] = reminder_counts.get(state, 0) + 1

    items = all_items
    if search:
        needle = search.strip().casefold()
        items = [
            a for a in items
            if needle in (a["username"] or "").casefold() or needle in a["code"].casefold()
        ]
    if role != "all":
        items = [a for a in items if a["role"] == role]
    if reminder != "all":
        items = [a for a in items if a["reminder"]["state"] == reminder]
    if performance == "has_referrals":
        items = [a for a in items if a["referred"] > 0]
    elif performance == "has_paid":
        items = [a for a in items if a["subscribed"] > 0]
    elif performance == "shared":
        items = [a for a in items if a["shares"] > 0]
    elif performance == "zero_activity":
        items = [a for a in items if a["shares"] == 0 and a["referred"] == 0]
    if reach == "telegram":
        items = [a for a in items if a["telegram_reachable"]]
    elif reach == "no_telegram":
        items = [a for a in items if not a["telegram_reachable"]]

    def sort_value(item):
        if sort_by == "paid":
            return item["subscribed"]
        if sort_by == "revenue":
            return item["revenue"]
        if sort_by == "reward":
            return item["commission"]
        if sort_by == "shares":
            return item["shares"]
        if sort_by == "last_active":
            value = _aware(item["last_active_at"])
            return value.timestamp() if value else 0
        if sort_by == "username":
            return (item["username"] or "").casefold()
        return item["referred"]

    items = sorted(items, key=sort_value, reverse=(order == "desc"))
    total = len(items)
    pages = max((total + page_size - 1) // page_size, 1)
    page = min(page, pages)
    offset = (page - 1) * page_size

    return {
        "items": items[offset:offset + page_size],
        "total": total,
        "unfiltered_total": len(all_items),
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "from": offset + 1 if total else 0,
        "to": min(offset + page_size, total),
        "facets": {"roles": role_counts, "reminders": reminder_counts},
    }


@router.post("/growth/referral-reminders/{user_id}/send")
async def send_referral_reminder(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Send one policy-checked Telegram reminder and write a full audit event.

    There is deliberately no bulk or automatic-send endpoint. Each click is a
    conscious admin approval; cooldown and frequency caps are re-evaluated on
    the server immediately before delivery.
    """
    now = datetime.now(timezone.utc)
    snapshot = _build_referral_ops(db, now)
    advocate = next((a for a in snapshot["advocates"] if a["user_id"] == user_id), None)
    if not advocate:
        raise HTTPException(status_code=404, detail="Active referral advocate not found")
    if advocate["reminder"]["state"] != "eligible":
        raise HTTPException(status_code=409, detail=advocate["reminder"]["reason"])

    user = db.query(User).filter(User.id == user_id).first()
    code = db.query(ReferralCode).filter(ReferralCode.id == advocate["code_id"]).first()
    if not user or not code or not user.telegram_id:
        raise HTTPException(status_code=409, detail="Telegram bot is not linked")

    message = _referral_reminder_message(user, code, advocate)
    event = ReferralReminderEvent(
        user_id=user.id,
        referral_code_id=code.id,
        segment=advocate["reminder"]["segment"],
        channel="telegram",
        status="queued",
        message=message,
        created_by=admin.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    try:
        sent = await send_dm(user.telegram_id, message)
    except Exception as exc:
        sent = False
        event.error = str(exc)[:500]

    if not sent:
        event.status = "failed"
        event.error = event.error or "Telegram DM failed; user may not have started the bot"
        db.commit()
        return {
            "ok": False,
            "event_id": event.id,
            "reason": "dm_failed",
            "message": event.error,
        }

    event.status = "sent"
    event.sent_at = datetime.now(timezone.utc)
    user.telegram_bot_started_at = event.sent_at
    db.commit()
    return {
        "ok": True,
        "event_id": event.id,
        "sent_at": event.sent_at,
        "message": f"Referral reminder sent to @{user.username}",
    }


@router.post("/growth/referral-reminders/{user_id}/preference")
def set_referral_reminder_preference(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Pause/resume referral reminders for one advocate."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    opted_out = bool(payload.get("opted_out"))
    reason = (payload.get("reason") or "").strip()[:500] or None
    pref = db.query(ReferralReminderPreference).filter(
        ReferralReminderPreference.user_id == user_id
    ).first()
    if not pref:
        pref = ReferralReminderPreference(user_id=user_id)
        db.add(pref)
    pref.opted_out = opted_out
    pref.reason = reason if opted_out else None
    pref.updated_by = admin.id
    pref.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {
        "ok": True,
        "user_id": user_id,
        "opted_out": opted_out,
        "message": "Referral reminders paused" if opted_out else "Referral reminders resumed",
    }


# ════════════════════════════════════════════════════════════════════
# FOLLOW-UPS
# ════════════════════════════════════════════════════════════════════

@router.get("/followups")
def list_followups(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(AdminFollowup)

    if status:
        if status == 'open':
            q = q.filter(AdminFollowup.status.in_(['pending', 'in_progress']))
        elif status == 'overdue':
            q = q.filter(
                AdminFollowup.status.in_(['pending', 'in_progress']),
                AdminFollowup.due_date < datetime.now(timezone.utc),
            )
        else:
            q = q.filter(AdminFollowup.status == status)

    if category:
        q = q.filter(AdminFollowup.category == category)
    if priority:
        q = q.filter(AdminFollowup.priority == priority)
    if user_id:
        q = q.filter(AdminFollowup.user_id == user_id)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            AdminFollowup.title.ilike(like),
            AdminFollowup.note.ilike(like),
        ))

    # Sort: open first by due_date asc, done last
    q = q.order_by(
        AdminFollowup.status.asc(),  # cancelled/done last alphabetically
        AdminFollowup.due_date.asc(),
    )

    items = q.all()

    def serialize(f):
        return {
            "id": f.id,
            "user_id": f.user_id,
            "user": {"id": f.user.id, "username": f.user.username} if f.user else None,
            "title": f.title,
            "note": f.note,
            "category": f.category,
            "due_date": f.due_date,
            "status": f.status,
            "priority": f.priority,
            "created_by": f.created_by,
            "creator": {"id": f.creator.id, "username": f.creator.username} if f.creator else None,
            "completed_by": f.completed_by,
            "completer": {"id": f.completer.id, "username": f.completer.username} if f.completer else None,
            "completed_at": f.completed_at,
            "created_at": f.created_at,
            "updated_at": f.updated_at,
        }

    return {"items": [serialize(f) for f in items], "total": len(items)}


@router.post("/followups", status_code=201)
def create_followup(
    data: FollowupCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    # Validate user_id exists if provided
    if data.user_id:
        target = db.query(User).filter(User.id == data.user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")

    f = AdminFollowup(
        user_id=data.user_id,
        title=data.title,
        note=data.note,
        category=data.category,
        due_date=data.due_date,
        priority=data.priority,
        status='pending',
        created_by=admin.id,
    )
    db.add(f)
    db.commit()
    db.refresh(f)

    return {"success": True, "id": f.id, "message": "Follow-up created"}


@router.post("/followups/generate")
def generate_followups(
    data: GenerateFollowupsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Retention engine — auto-create follow-ups from the subscription lifecycle:

      • renewal  → subscribers expiring within `renewal_days`
      • winback  → subscribers that lapsed within the last `winback_days`

    Idempotent: skips any user that already has an OPEN follow-up in the
    same category, so it can be run repeatedly (or on a schedule) safely.
    """
    now = datetime.now(timezone.utc)

    # Users that already have an open renewal/winback follow-up → skip them.
    existing = db.query(AdminFollowup.user_id, AdminFollowup.category).filter(
        AdminFollowup.status.in_(['pending', 'in_progress']),
        AdminFollowup.category.in_(['renewal', 'winback']),
        AdminFollowup.user_id.isnot(None),
    ).all()
    open_keys = {(uid, cat) for uid, cat in existing}

    renewal_created = 0
    winback_created = 0

    # ── Renewal: active subs expiring soon ──
    if data.renewal:
        horizon = now + timedelta(days=data.renewal_days)
        candidates = db.query(User).filter(
            User.role.in_(['premium', 'subscriber']),
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at > now,
            User.subscription_expires_at <= horizon,
        ).all()
        for u in candidates:
            if (u.id, 'renewal') in open_keys:
                continue
            days_left = max((u.subscription_expires_at - now).days, 0)
            priority = 'urgent' if days_left <= 1 else 'high' if days_left <= 3 else 'normal'
            db.add(AdminFollowup(
                user_id=u.id,
                title=f"Renewal due — @{u.username} ({days_left}d left)",
                note=(
                    f"Subscription expires {u.subscription_expires_at.strftime('%d %b %Y')}. "
                    "Reach out to secure the renewal (see the Renewal Reminder outreach template)."
                ),
                category='renewal',
                due_date=u.subscription_expires_at,
                priority=priority,
                status='pending',
                created_by=admin.id,
            ))
            open_keys.add((u.id, 'renewal'))
            renewal_created += 1

    # ── Win-back: subs that lapsed recently ──
    if data.winback:
        since = now - timedelta(days=data.winback_days)
        candidates = db.query(User).filter(
            User.role != 'admin',
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at <= now,
            User.subscription_expires_at >= since,
        ).all()
        for u in candidates:
            if (u.id, 'winback') in open_keys:
                continue
            days_ago = max((now - u.subscription_expires_at).days, 0)
            db.add(AdminFollowup(
                user_id=u.id,
                title=f"Win-back — @{u.username} (expired {days_ago}d ago)",
                note=(
                    "Subscription lapsed recently. Send a win-back offer "
                    "(see the Expired — Win Back outreach template)."
                ),
                category='winback',
                due_date=now,
                priority='normal',
                status='pending',
                created_by=admin.id,
            ))
            open_keys.add((u.id, 'winback'))
            winback_created += 1

    db.commit()

    total = renewal_created + winback_created
    return {
        "success": True,
        "renewal_created": renewal_created,
        "winback_created": winback_created,
        "total": total,
        "message": (
            f"Created {total} follow-up{'s' if total != 1 else ''} "
            f"({renewal_created} renewal, {winback_created} win-back)"
            if total else "Nothing new to generate — everyone's already queued."
        ),
    }


@router.patch("/followups/{followup_id}")
def update_followup(
    followup_id: int,
    data: FollowupUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    f = db.query(AdminFollowup).filter(AdminFollowup.id == followup_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    payload = data.model_dump(exclude_unset=True)

    # If transitioning to done/cancelled, record completion
    if 'status' in payload and payload['status'] in ('done', 'cancelled'):
        if f.status not in ('done', 'cancelled'):
            f.completed_by = admin.id
            f.completed_at = datetime.now(timezone.utc)
    elif 'status' in payload and payload['status'] not in ('done', 'cancelled'):
        # Reopened — clear completion
        f.completed_by = None
        f.completed_at = None

    for k, v in payload.items():
        setattr(f, k, v)

    db.commit()
    db.refresh(f)

    return {"success": True, "message": "Follow-up updated"}


@router.delete("/followups/{followup_id}")
def delete_followup(
    followup_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    f = db.query(AdminFollowup).filter(AdminFollowup.id == followup_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    db.delete(f)
    db.commit()
    return {"success": True, "message": "Follow-up deleted"}


# ════════════════════════════════════════════════════════════════════
# MARKETING CAMPAIGNS
# ════════════════════════════════════════════════════════════════════

@router.get("/campaigns")
def list_campaigns(
    status: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(MarketingCampaign)

    if status:
        q = q.filter(MarketingCampaign.status == status)
    if platform:
        q = q.filter(MarketingCampaign.platform == platform)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            MarketingCampaign.name.ilike(like),
            MarketingCampaign.description.ilike(like),
        ))

    q = q.order_by(MarketingCampaign.created_at.desc())
    items = q.all()
    return {"items": [_serialize_campaign(c) for c in items], "total": len(items)}


@router.post("/campaigns", status_code=201)
def create_campaign(
    data: CampaignCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    c = MarketingCampaign(
        name=data.name,
        description=data.description,
        platform=data.platform,
        budget_usd=data.budget_usd,
        spent_usd=data.spent_usd,
        extra_data=data.extra_data or {},
        line_items=data.line_items or [],
        start_date=data.start_date,
        end_date=data.end_date,
        status=data.status,
        created_by=admin.id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    return {"success": True, "id": c.id, "message": "Campaign created"}


@router.patch("/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: int,
    data: CampaignUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")

    payload = data.model_dump(exclude_unset=True)

    for k, v in payload.items():
        setattr(c, k, v)

    db.commit()
    db.refresh(c)
    return {"success": True, "message": "Campaign updated"}


@router.delete("/campaigns/{campaign_id}")
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")

    db.delete(c)
    db.commit()
    return {"success": True, "message": "Campaign deleted"}


# ════════════════════════════════════════════════════════════════════
# BRAND TODOS
# ════════════════════════════════════════════════════════════════════

@router.get("/todos")
def list_todos(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(BrandTodo)

    if status:
        if status == 'open':
            q = q.filter(BrandTodo.status.in_(['backlog', 'in_progress']))
        else:
            q = q.filter(BrandTodo.status == status)

    if category:
        q = q.filter(BrandTodo.category == category)
    if priority:
        q = q.filter(BrandTodo.priority == priority)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            BrandTodo.title.ilike(like),
            BrandTodo.description.ilike(like),
        ))

    # Sort: priority urgent first, then by created
    priority_order = {'urgent': 0, 'high': 1, 'normal': 2, 'low': 3}
    items = q.all()
    items.sort(key=lambda t: (
        0 if t.status in ('backlog', 'in_progress') else 1,
        priority_order.get(t.priority, 99),
        -(t.created_at.timestamp() if t.created_at else 0),
    ))

    def serialize(t):
        return {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "category": t.category,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date,
            "tags": t.tags or [],
            "created_by": t.created_by,
            "creator": {"id": t.creator.id, "username": t.creator.username} if t.creator else None,
            "completed_by": t.completed_by,
            "completer": {"id": t.completer.id, "username": t.completer.username} if t.completer else None,
            "completed_at": t.completed_at,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }

    return {"items": [serialize(t) for t in items], "total": len(items)}


@router.post("/todos", status_code=201)
def create_todo(
    data: TodoCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    t = BrandTodo(
        title=data.title,
        description=data.description,
        category=data.category,
        priority=data.priority,
        due_date=data.due_date,
        tags=data.tags or [],
        status='backlog',
        created_by=admin.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    return {"success": True, "id": t.id, "message": "Todo created"}


@router.patch("/todos/{todo_id}")
def update_todo(
    todo_id: int,
    data: TodoUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    t = db.query(BrandTodo).filter(BrandTodo.id == todo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Todo not found")

    payload = data.model_dump(exclude_unset=True)

    # Completion tracking
    if 'status' in payload and payload['status'] in ('done', 'cancelled'):
        if t.status not in ('done', 'cancelled'):
            t.completed_by = admin.id
            t.completed_at = datetime.now(timezone.utc)
    elif 'status' in payload and payload['status'] not in ('done', 'cancelled'):
        t.completed_by = None
        t.completed_at = None

    for k, v in payload.items():
        setattr(t, k, v)

    db.commit()
    db.refresh(t)
    return {"success": True, "message": "Todo updated"}


@router.delete("/todos/{todo_id}")
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    t = db.query(BrandTodo).filter(BrandTodo.id == todo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Todo not found")

    db.delete(t)
    db.commit()
    return {"success": True, "message": "Todo deleted"}


# ════════════════════════════════════════════════════════════════════
# PAYMENT RECORD AUDIT — premium/subscriber must have a confirmed payment
# ════════════════════════════════════════════════════════════════════
# New system applies from 2026-06-17: any active premium/subscriber created on
# or after the cutoff with NO confirmed payment is flagged and can be assigned
# to an admin to record. Users before the cutoff are grandfathered (exempt).

from pydantic import BaseModel as _AuditBaseModel
from app.models.payment_audit import PaymentRecordAssignment

PAYMENT_AUDIT_CUTOFF = datetime(2026, 6, 17, tzinfo=timezone.utc)
_AUDIT_STATUSES = {"pending", "recorded", "waived"}


class PaymentAuditAssign(_AuditBaseModel):
    assigned_admin_id: Optional[int] = None
    status: Optional[str] = None
    note: Optional[str] = None


@router.get("/payment-audit")
def payment_audit(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    now = datetime.now(timezone.utc)
    paid_ids = {
        r[0] for r in db.query(Payment.user_id)
        .filter(Payment.status == "confirmed", Payment.deleted_at.is_(None)).all()
    }
    assigns = {a.user_id: a for a in db.query(PaymentRecordAssignment).all()}
    admins = db.query(User).filter(User.role == "admin").all()
    admin_names = {u.id: (u.username or getattr(u, "email", None)) for u in admins}

    candidates = db.query(User).filter(
        User.role.in_(["premium", "subscriber"]),
        User.created_at >= PAYMENT_AUDIT_CUTOFF,
    ).all()

    users = []
    for u in candidates:
        active = u.subscription_expires_at is None or u.subscription_expires_at > now
        if not active or u.id in paid_ids:
            continue
        a = assigns.get(u.id)
        users.append({
            "user_id": u.id,
            "username": u.username,
            "email": getattr(u, "email", None),
            "role": u.role,
            "subscription_source": getattr(u, "subscription_source", None),
            "subscription_expires_at": u.subscription_expires_at,
            "created_at": u.created_at,
            "assigned_admin_id": a.assigned_admin_id if a else None,
            "assigned_admin_name": admin_names.get(a.assigned_admin_id) if (a and a.assigned_admin_id) else None,
            "status": a.status if a else "pending",
            "note": a.note if a else None,
        })
    users.sort(key=lambda x: (x["status"] != "pending", x["created_at"] or now))

    summary = {
        "total": len(users),
        "pending": sum(1 for x in users if x["status"] == "pending"),
        "assigned": sum(1 for x in users if x["assigned_admin_id"]),
        "waived": sum(1 for x in users if x["status"] == "waived"),
    }
    return {
        "cutoff": PAYMENT_AUDIT_CUTOFF.isoformat(),
        "summary": summary,
        "users": users,
        "admins": [{"id": u.id, "username": u.username or getattr(u, "email", None)} for u in admins],
    }


@router.post("/payment-audit/{user_id}")
def assign_payment_audit(
    user_id: int,
    body: PaymentAuditAssign,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    a = db.query(PaymentRecordAssignment).filter(PaymentRecordAssignment.user_id == user_id).first()
    if not a:
        a = PaymentRecordAssignment(user_id=user_id)
        db.add(a)

    if body.assigned_admin_id is not None:
        a.assigned_admin_id = body.assigned_admin_id or None
    if body.status is not None:
        if body.status not in _AUDIT_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {sorted(_AUDIT_STATUSES)}")
        a.status = body.status
    if body.note is not None:
        a.note = body.note

    db.commit()
    return {"success": True, "user_id": user_id, "status": a.status, "assigned_admin_id": a.assigned_admin_id}


# ════════════════════════════════════════════════════════════════════
# PROFIT-SHARING — recap with per-payment scheme (regular 80/20 vs Canada)
# ════════════════════════════════════════════════════════════════════

from app.services.profit_sharing import compute_split, normalize_source, SCHEMES


class PartnerSourceUpdate(_AuditBaseModel):
    partner_source: str


def _parse_day(v: Optional[str], end: bool = False) -> Optional[datetime]:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(v)
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d + timedelta(days=1) if end else d


@router.post("/payments/{payment_id}/partner-source")
def set_partner_source(
    payment_id: int,
    body: PartnerSourceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    p.partner_source = normalize_source(body.partner_source)
    db.commit()
    return {"success": True, "payment_id": payment_id, "partner_source": p.partner_source}


@router.get("/profit-sharing")
def profit_sharing(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(Payment).filter(Payment.status == "confirmed", Payment.deleted_at.is_(None))
    d_from, d_to = _parse_day(from_date), _parse_day(to_date, end=True)
    if d_from:
        q = q.filter(Payment.created_at >= d_from)
    if d_to:
        q = q.filter(Payment.created_at < d_to)
    payments = q.order_by(Payment.created_at.desc()).all()

    user_ids = {p.user_id for p in payments}
    unames = {u.id: (u.username or getattr(u, "email", None)) for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    rows = []
    totals = {"gross": 0.0, "external": 0.0, "owner": 0.0, "bigstar": 0.0}
    by_scheme: dict[str, dict] = {}
    for p in payments:
        gross = p.final_amount if p.final_amount is not None else p.amount_usdt
        split = compute_split(gross, getattr(p, "partner_source", "regular"))
        rows.append({
            "payment_id": p.id,
            "user_id": p.user_id,
            "username": unames.get(p.user_id),
            "created_at": p.created_at,
            "method": p.method,
            "tx_hash": p.tx_hash,
            "reference": p.reference,
            **split,
        })
        for k in ("gross", "external", "owner", "bigstar"):
            totals[k] = round(totals[k] + split[k], 2)
        sc = by_scheme.setdefault(split["scheme"], {"count": 0, "gross": 0.0, "external": 0.0, "owner": 0.0, "bigstar": 0.0})
        sc["count"] += 1
        for k in ("gross", "external", "owner", "bigstar"):
            sc[k] = round(sc[k] + split[k], 2)

    return {
        "from": from_date, "to": to_date,
        "rows": rows, "totals": totals, "by_scheme": by_scheme,
        "schemes": {k: v.get("label") for k, v in SCHEMES.items()},
    }
