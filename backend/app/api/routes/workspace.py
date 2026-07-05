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
from app.models.referral import ReferralUse
from app.schemas.workspace import (
    FollowupCreate, FollowupUpdate, FollowupResponse,
    CampaignCreate, CampaignUpdate, CampaignResponse,
    TodoCreate, TodoUpdate, TodoResponse,
    WorkspaceStats, GenerateFollowupsRequest,
)


router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])


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
    trend = [
        {"month": m.strftime('%Y-%m') if m else None, "revenue": float(s or 0), "count": int(c or 0)}
        for m, s, c in trend_rows
    ]

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

    # ── Referral leaderboard ──
    total_referred = db.query(func.count(ReferralUse.id)).scalar() or 0
    ref_rows = (
        db.query(
            ReferralUse.referrer_id,
            func.count(ReferralUse.id),
            func.coalesce(func.sum(ReferralUse.total_commission_earned), 0),
            func.coalesce(func.sum(ReferralUse.total_payments), 0),
        )
        .group_by(ReferralUse.referrer_id)
        .order_by(func.count(ReferralUse.id).desc())
        .limit(10).all()
    )
    ref_ids = [r[0] for r in ref_rows]
    ref_names = dict(db.query(User.id, User.username).filter(User.id.in_(ref_ids)).all()) if ref_ids else {}
    top_referrers = [
        {
            "username": ref_names.get(rid, f"#{rid}"),
            "referred": int(cnt or 0),
            "commission": float(comm or 0),
            "payments": int(pmts or 0),
        }
        for rid, cnt, comm, pmts in ref_rows
    ]

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
            "referral": {"total_referred": total_referred, "top_referrers": top_referrers},
        },
        "health": {"churn_risk": churn_risk},
        "generated_at": now,
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
