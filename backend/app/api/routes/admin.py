# backend/app/api/routes/admin.py
"""
Admin User Management API

Features:
- List all users with search/filter/pagination (8 filter dimensions)
- Grant subscription (1 month, 1 year, lifetime)
- Revoke subscription
- User stats & dashboard data
- Expiring subscription alerts
- Auto-downgrade expired subscribers
- Subscription Plans management
- Payments management
- ─── Admin Outreach (Layer Outreach) ───
- Per-user full detail (drawer)
- Contact enrichment (admin manual TG/DC/notes)
- Message templates + render for follow-up
- Contact reach stats
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, case, desc

from app.core.database import get_db
from app.models.user import User
from app.models.subscription import SubscriptionPlan, Payment
from app.api.deps import get_admin_user
from app.schemas.user import (
    AdminUserResponse,
    AdminContactUpdate,
    TemplateRenderRequest,
    TemplateRenderResponse,
    GrantSubscription,
    MessageResponse,
)
from app.schemas.subscription import PlanResponse, PlanUpdate

# Outreach service (Layer Outreach)
from app.services.outreach_service import (
    list_templates,
    render_template,
    get_reach_summary,
)

# Optional models for /users/{id}/full detail (referral activity)
# Wrapped in try/except so admin.py still loads even if these don't exist.
try:
    from app.models.referral import ReferralUse, ReferralCode
    HAS_REFERRAL_MODELS = True
except ImportError:
    HAS_REFERRAL_MODELS = False


router = APIRouter(prefix="/admin", tags=["Admin"])


# ════════════════════════════════════════════
# 1. Dashboard Stats
# ════════════════════════════════════════════

@router.get("/stats")
async def get_admin_stats(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Overview stats untuk admin dashboard.
    """
    now = datetime.now(timezone.utc)
    seven_days = now + timedelta(days=7)
    thirty_days = now - timedelta(days=30)

    total_users = db.query(func.count(User.id)).scalar()

    active_subscribers = db.query(func.count(User.id)).filter(
        User.role.in_(['premium', 'subscriber']),
        User.is_active == True,
        or_(
            User.subscription_expires_at.is_(None),       # lifetime
            User.subscription_expires_at > now              # belum expired
        )
    ).scalar()

    free_users = db.query(func.count(User.id)).filter(
        User.role == 'free',
        User.is_active == True
    ).scalar()

    admin_count = db.query(func.count(User.id)).filter(User.role == 'admin').scalar()

    # Expiring soon (dalam 7 hari)
    expiring_soon = db.query(func.count(User.id)).filter(
        User.role.in_(['premium', 'subscriber']),
        User.is_active == True,
        User.subscription_expires_at.isnot(None),
        User.subscription_expires_at > now,
        User.subscription_expires_at <= seven_days
    ).scalar()

    # Already expired (masih role subscriber tapi sudah lewat)
    expired = db.query(func.count(User.id)).filter(
        User.role.in_(['premium', 'subscriber']),
        User.subscription_expires_at.isnot(None),
        User.subscription_expires_at <= now
    ).scalar()

    # Lifetime subscribers (no expiry)
    lifetime = db.query(func.count(User.id)).filter(
        User.role.in_(['premium', 'subscriber']),
        User.is_active == True,
        User.subscription_expires_at.is_(None)
    ).scalar()

    # New users in last 30 days
    new_users_30d = db.query(func.count(User.id)).filter(
        User.created_at >= thirty_days
    ).scalar()

    # Auth provider breakdown
    provider_stats = db.query(
        User.auth_provider,
        func.count(User.id)
    ).group_by(User.auth_provider).all()

    # Payment stats
    confirmed_payments = db.query(func.count(Payment.id)).filter(Payment.status == 'confirmed').scalar() or 0
    total_revenue = db.query(func.coalesce(func.sum(Payment.amount_usdt), 0)).filter(Payment.status == 'confirmed').scalar()
    pending_payments = db.query(func.count(Payment.id)).filter(Payment.status == 'pending').scalar() or 0

    return {
        "total_users": total_users,
        "active_subscribers": active_subscribers,
        "free_users": free_users,
        "admin_count": admin_count,
        "lifetime_subscribers": lifetime,
        "expiring_soon": expiring_soon,
        "expired_not_downgraded": expired,
        "new_users_30d": new_users_30d,
        "auth_providers": {provider: count for provider, count in provider_stats},
        "confirmed_payments": confirmed_payments,
        "total_revenue": float(total_revenue),
        "pending_payments": pending_payments,
    }


# ════════════════════════════════════════════
# 2. List Users (with search/filter/pagination)
# ════════════════════════════════════════════

@router.get("/users")
async def list_users(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None, description="Search by username, email, telegram, admin TG/DC"),
    role: Optional[str] = Query(None, description="Filter by role: free, subscriber, admin"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter: active, inactive, expiring, expired"),
    provider: Optional[str] = Query(None, description="Filter by auth_provider: google/telegram/discord/local"),
    activity: Optional[str] = Query(None, description="active_7d | dormant_30d | never_logged_in"),
    reach: Optional[str] = Query(None, description="has_tg | has_dc | has_email | unreachable | admin_enriched"),
    sort_by: Optional[str] = Query("created_at", description="Sort: created_at, username, role, subscription_expires_at"),
    sort_order: Optional[str] = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """
    List semua users dengan search, filter, dan pagination.
    """
    now = datetime.now(timezone.utc)
    seven_days = now + timedelta(days=7)

    query = db.query(User)

    # Search (now includes admin enrichment fields)
    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(User.username).like(search_term),
                func.lower(User.email).like(search_term),
                func.lower(User.telegram_username).like(search_term),
                func.lower(User.discord_username).like(search_term),
                func.lower(User.admin_telegram_username).like(search_term),
                func.lower(User.admin_discord_handle).like(search_term),
            )
        )

    # Role filter
    if role:
        query = query.filter(User.role == role)

    # Status filter
    if status_filter == "active":
        query = query.filter(User.is_active == True)
    elif status_filter == "inactive":
        query = query.filter(User.is_active == False)
    elif status_filter == "expiring":
        query = query.filter(
            User.role.in_(['premium', 'subscriber']),
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at > now,
            User.subscription_expires_at <= seven_days
        )
    elif status_filter == "expired":
        query = query.filter(
            User.role.in_(['premium', 'subscriber']),
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at <= now
        )

    # Provider filter
    if provider:
        query = query.filter(User.auth_provider == provider)

    # Activity filter
    if activity == "active_7d":
        query = query.filter(User.last_login_at >= now - timedelta(days=7))
    elif activity == "dormant_30d":
        query = query.filter(
            and_(
                User.last_login_at.isnot(None),
                User.last_login_at < now - timedelta(days=30),
            )
        )
    elif activity == "never_logged_in":
        query = query.filter(User.last_login_at.is_(None))

    # Reach filter
    if reach == "has_tg":
        query = query.filter(
            or_(
                and_(User.telegram_username.isnot(None), User.telegram_username != ""),
                and_(User.admin_telegram_username.isnot(None), User.admin_telegram_username != ""),
            )
        )
    elif reach == "has_dc":
        query = query.filter(
            or_(
                User.discord_id.isnot(None),
                and_(User.admin_discord_handle.isnot(None), User.admin_discord_handle != ""),
            )
        )
    elif reach == "has_email":
        query = query.filter(
            and_(
                User.email.isnot(None),
                ~User.email.like("%@telegram.luxquant.tw"),
                ~User.email.like("%@discord.luxquant.tw"),
            )
        )
    elif reach == "admin_enriched":
        query = query.filter(User.admin_enriched_at.isnot(None))
    elif reach == "unreachable":
        query = query.filter(
            and_(
                or_(User.telegram_username.is_(None), User.telegram_username == ""),
                or_(User.admin_telegram_username.is_(None), User.admin_telegram_username == ""),
                User.discord_id.is_(None),
                or_(User.admin_discord_handle.is_(None), User.admin_discord_handle == ""),
                or_(
                    User.email.is_(None),
                    User.email.like("%@telegram.luxquant.tw"),
                    User.email.like("%@discord.luxquant.tw"),
                ),
            )
        )

    # Count total sebelum pagination
    total = query.count()

    # Sorting
    sort_column = {
        "created_at": User.created_at,
        "username": User.username,
        "role": User.role,
        "subscription_expires_at": User.subscription_expires_at,
        "email": User.email,
        "last_login_at": User.last_login_at,
    }.get(sort_by, User.created_at)

    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    # Pagination
    offset = (page - 1) * page_size
    users = query.offset(offset).limit(page_size).all()

    # Serialize with computed effective_* fields
    items = []
    for u in users:
        d = AdminUserResponse.model_validate(u).model_dump(mode="json")
        d["effective_telegram_username"] = u.effective_telegram_username
        d["effective_discord_handle"] = u.effective_discord_handle
        items.append(d)

    return {
        "users": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


# ════════════════════════════════════════════
# 3. Grant Subscription
# ════════════════════════════════════════════

@router.post("/users/{user_id}/grant-subscription")
async def grant_subscription(
    user_id: int,
    data: GrantSubscription,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Grant subscription ke user.
    Duration: 1_month, 1_year, lifetime
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if user.role == 'admin':
        raise HTTPException(status_code=400, detail="Admin sudah punya akses penuh")

    now = datetime.now(timezone.utc)

    # Custom start date (untuk user lama yang sudah subscribe sebelum app ada)
    if data.start_date:
        start = datetime.strptime(data.start_date, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    else:
        # Default: mulai dari sekarang, atau extend dari expiry yang ada
        if user.role in ('premium', 'subscriber') and user.subscription_expires_at and user.subscription_expires_at > now:
            start = user.subscription_expires_at  # extend dari tanggal expiry
        else:
            start = now

    # Calculate expiry
    if data.duration == 'lifetime':
        expires_at = None  # NULL = lifetime
    elif data.duration == '1_month':
        expires_at = start + timedelta(days=30)
    elif data.duration == '1_year':
        expires_at = start + timedelta(days=365)
    elif data.duration == 'custom':
        # end_date validated by Pydantic; must exist
        expires_at = datetime.strptime(data.end_date, '%Y-%m-%d').replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
        if expires_at <= start:
            raise HTTPException(
                status_code=400,
                detail="end_date harus setelah start_date"
            )
    else:
        raise HTTPException(status_code=400, detail="Duration tidak valid")

    user.role = 'subscriber'
    user.subscription_expires_at = expires_at
    user.subscription_granted_by = admin.id
    user.subscription_granted_at = now
    user.subscription_note = data.note

    db.commit()
    db.refresh(user)

    if data.duration == 'custom':
        duration_label = f"sampai {expires_at.strftime('%d %b %Y')}"
    else:
        duration_label = {
            '1_month': '1 Bulan',
            '1_year': '1 Tahun',
            'lifetime': 'Lifetime'
        }[data.duration]

    return {
        "success": True,
        "message": f"Subscription {duration_label} berhasil diberikan ke {user.username}",
        "user": AdminUserResponse.model_validate(user)
    }


# ════════════════════════════════════════════
# 4. Revoke Subscription
# ════════════════════════════════════════════

@router.post("/users/{user_id}/revoke-subscription")
async def revoke_subscription(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Revoke subscription — downgrade ke free.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if user.role == 'admin':
        raise HTTPException(status_code=400, detail="Tidak bisa revoke admin")

    if user.role == 'free':
        raise HTTPException(status_code=400, detail="User sudah free")

    user.role = 'free'
    user.subscription_expires_at = None
    user.subscription_note = f"Revoked by admin (ID:{admin.id}) on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": f"Subscription {user.username} berhasil dicabut",
        "user": AdminUserResponse.model_validate(user)
    }


# ════════════════════════════════════════════
# 5. Expiring Subscriptions Alert
# ════════════════════════════════════════════

@router.get("/expiring-subscriptions")
async def get_expiring_subscriptions(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    days: int = Query(7, ge=1, le=30, description="Alert dalam berapa hari ke depan"),
):
    """
    List subscribers yang subscription-nya mau habis.
    Default: 7 hari ke depan. Berguna untuk follow-up.
    """
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    expiring = db.query(User).filter(
        User.role.in_(['premium', 'subscriber']),
        User.is_active == True,
        User.subscription_expires_at.isnot(None),
        User.subscription_expires_at > now,
        User.subscription_expires_at <= cutoff
    ).order_by(User.subscription_expires_at.asc()).all()

    result = []
    for u in expiring:
        remaining = u.subscription_expires_at - now
        result.append({
            "user": AdminUserResponse.model_validate(u),
            "days_remaining": remaining.days,
            "hours_remaining": int(remaining.total_seconds() / 3600),
            "expires_at": u.subscription_expires_at.isoformat(),
        })

    return {
        "count": len(result),
        "alert_window_days": days,
        "expiring_users": result
    }


# ════════════════════════════════════════════
# 6. Auto-downgrade Expired Subscribers
# ════════════════════════════════════════════

@router.post("/cleanup-expired")
async def cleanup_expired_subscriptions(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Manual trigger: downgrade semua subscriber yang sudah expired ke free.
    """
    now = datetime.now(timezone.utc)

    expired_users = db.query(User).filter(
        User.role.in_(['premium', 'subscriber']),
        User.subscription_expires_at.isnot(None),
        User.subscription_expires_at <= now
    ).all()

    downgraded = []
    for u in expired_users:
        u.role = 'free'
        u.subscription_note = f"Auto-downgraded (expired {u.subscription_expires_at.strftime('%Y-%m-%d')})"
        downgraded.append(u.username)

    if downgraded:
        db.commit()

    return {
        "success": True,
        "downgraded_count": len(downgraded),
        "downgraded_users": downgraded,
        "message": f"{len(downgraded)} user(s) di-downgrade ke free"
    }


# ════════════════════════════════════════════
# 7. Toggle User Active Status (Ban/Unban)
# ════════════════════════════════════════════

@router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Ban atau unban user (toggle is_active).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Tidak bisa ban diri sendiri")

    if user.role == 'admin':
        raise HTTPException(status_code=400, detail="Tidak bisa ban admin lain")

    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)

    status_text = "aktif" if user.is_active else "dinonaktifkan"

    return {
        "success": True,
        "message": f"User {user.username} sekarang {status_text}",
        "user": AdminUserResponse.model_validate(user)
    }


# ════════════════════════════════════════════════════════════
# 8. Subscription Plans Management
# ════════════════════════════════════════════════════════════

@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """List all subscription plans (including inactive)"""
    return db.query(SubscriptionPlan).order_by(SubscriptionPlan.sort_order).all()


@router.put("/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: int,
    data: PlanUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Update plan price, label, status, etc"""
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan tidak ditemukan")

    for field in ['label', 'description', 'price_usdt', 'duration_days', 'is_active', 'sort_order']:
        val = getattr(data, field, None)
        if val is not None:
            setattr(plan, field, val)

    db.commit()
    db.refresh(plan)
    return plan


# ════════════════════════════════════════════════════════════
# 9. Payments Management
# ════════════════════════════════════════════════════════════

@router.get("/payments")
async def list_payments(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all crypto payments with user info"""
    query = db.query(Payment)

    if status_filter:
        query = query.filter(Payment.status == status_filter)

    total = query.count()
    payments = query.order_by(Payment.created_at.desc())\
        .offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for p in payments:
        user = db.query(User).filter(User.id == p.user_id).first()
        items.append({
            "id": p.id,
            "user_id": p.user_id,
            "email": user.email if user else None,
            "username": user.username if user else None,
            "plan_id": p.plan_id,
            "plan_name": p.plan.name if p.plan else None,
            "plan_label": p.plan.label if p.plan else None,
            "amount_usdt": float(p.amount_usdt),
            "tx_hash": p.tx_hash,
            "wallet_from": p.wallet_from,
            "wallet_to": p.wallet_to,
            "network": p.network,
            "status": p.status,
            "verified_at": p.verified_at.isoformat() if p.verified_at else None,
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            "notes": p.notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


# ════════════════════════════════════════════════════════════
# 10. Admin Outreach (Layer Outreach)
# ════════════════════════════════════════════════════════════

@router.get("/users/contact-stats")
async def get_contact_stats(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Aggregate stats: how many users reachable via each channel?
    """
    total = db.query(func.count(User.id)).scalar() or 0

    tg_reachable = db.query(func.count(User.id)).filter(
        or_(
            and_(User.telegram_username.isnot(None), User.telegram_username != ""),
            and_(User.admin_telegram_username.isnot(None), User.admin_telegram_username != ""),
        )
    ).scalar() or 0

    dc_reachable = db.query(func.count(User.id)).filter(
        or_(
            User.discord_id.isnot(None),
            and_(User.admin_discord_handle.isnot(None), User.admin_discord_handle != ""),
        )
    ).scalar() or 0

    em_reachable = db.query(func.count(User.id)).filter(
        and_(
            User.email.isnot(None),
            User.email != "",
            ~User.email.like("%@telegram.luxquant.tw"),
            ~User.email.like("%@discord.luxquant.tw"),
        )
    ).scalar() or 0

    enriched = db.query(func.count(User.id)).filter(
        User.admin_enriched_at.isnot(None)
    ).scalar() or 0

    unreachable = db.query(func.count(User.id)).filter(
        and_(
            or_(User.telegram_username.is_(None), User.telegram_username == ""),
            or_(User.admin_telegram_username.is_(None), User.admin_telegram_username == ""),
            User.discord_id.is_(None),
            or_(User.admin_discord_handle.is_(None), User.admin_discord_handle == ""),
            or_(
                User.email.is_(None),
                User.email == "",
                User.email.like("%@telegram.luxquant.tw"),
                User.email.like("%@discord.luxquant.tw"),
            ),
        )
    ).scalar() or 0

    return {
        "total": total,
        "telegram_reachable": tg_reachable,
        "discord_reachable": dc_reachable,
        "email_reachable": em_reachable,
        "admin_enriched": enriched,
        "unreachable": unreachable,
    }


@router.get("/users/{user_id}/full")
async def get_user_full_detail(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Single user dengan FULL detail untuk admin drawer:
    profile, payments, referral activity, reach summary.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    # Recent payments (last 10)
    payments = (
        db.query(Payment, SubscriptionPlan)
        .outerjoin(SubscriptionPlan, Payment.plan_id == SubscriptionPlan.id)
        .filter(Payment.user_id == user_id)
        .order_by(desc(Payment.created_at))
        .limit(10)
        .all()
    )

    payments_data = []
    for p, sp in payments:
        # final_amount / discount_amount / credit_redeemed may not exist on older payments
        final_amt = getattr(p, "final_amount", None) or p.amount_usdt
        payments_data.append({
            "id": p.id,
            "amount_usdt": float(p.amount_usdt or 0),
            "final_amount": float(final_amt or 0),
            "discount_amount": float(getattr(p, "discount_amount", 0) or 0),
            "credit_redeemed": float(getattr(p, "credit_redeemed", 0) or 0),
            "plan_label": sp.label if sp else None,
            "status": p.status,
            "tx_hash": p.tx_hash,
            "verified_at": p.verified_at.isoformat() if p.verified_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    # Referral activity (only if model available)
    referrer_data = []
    referred_data = None

    if HAS_REFERRAL_MODELS:
        try:
            as_referrer = (
                db.query(ReferralUse)
                .filter(ReferralUse.referrer_id == user_id)
                .order_by(desc(ReferralUse.created_at))
                .limit(20)
                .all()
            )
            for ru in as_referrer:
                referee = db.query(User).filter(User.id == ru.referred_id).first()
                referrer_data.append({
                    "id": ru.id,
                    "referee_id": ru.referred_id,
                    "referee_username": referee.username if referee else None,
                    "status": ru.status,
                    "commission_amount": float(ru.commission_amount or 0),
                    "total_commission_earned": float(getattr(ru, "total_commission_earned", 0) or 0),
                    "total_payments": int(getattr(ru, "total_payments", 0) or 0),
                    "created_at": ru.created_at.isoformat() if ru.created_at else None,
                })

            as_referred = (
                db.query(ReferralUse)
                .filter(ReferralUse.referred_id == user_id)
                .first()
            )
            if as_referred:
                referrer_user = db.query(User).filter(User.id == as_referred.referrer_id).first()
                referred_data = {
                    "id": as_referred.id,
                    "referrer_id": as_referred.referrer_id,
                    "referrer_username": referrer_user.username if referrer_user else None,
                    "status": as_referred.status,
                    "created_at": as_referred.created_at.isoformat() if as_referred.created_at else None,
                }
        except Exception:
            # graceful fallback if referral queries fail
            pass

    # Reach summary
    reach = get_reach_summary(user)

    # Admin who enriched
    enriched_by_user = None
    if user.admin_enriched_by:
        enricher = db.query(User).filter(User.id == user.admin_enriched_by).first()
        if enricher:
            enriched_by_user = {
                "id": enricher.id,
                "username": enricher.username,
            }

    # Serialize user with effective_* fields
    user_dict = AdminUserResponse.model_validate(user).model_dump(mode="json")
    user_dict["effective_telegram_username"] = user.effective_telegram_username
    user_dict["effective_discord_handle"] = user.effective_discord_handle

    return {
        "user": user_dict,
        "reach": reach,
        "payments": payments_data,
        "as_referrer": referrer_data,
        "as_referred": referred_data,
        "enriched_by_user": enriched_by_user,
    }


@router.patch("/users/{user_id}/contact")
async def update_user_contact(
    user_id: int,
    data: AdminContactUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Admin updates user's outreach contact info (admin enrichment).
    Track who & when via admin_enriched_by / admin_enriched_at.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    # Apply only provided fields (model_fields_set detects what admin sent)
    sent_fields = data.model_fields_set
    changed = False

    if "admin_telegram_username" in sent_fields:
        user.admin_telegram_username = data.admin_telegram_username
        changed = True
    if "admin_discord_handle" in sent_fields:
        user.admin_discord_handle = data.admin_discord_handle
        changed = True
    if "admin_notes" in sent_fields:
        user.admin_notes = data.admin_notes
        changed = True

    if changed:
        user.admin_enriched_by = admin.id
        user.admin_enriched_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)

    user_dict = AdminUserResponse.model_validate(user).model_dump(mode="json")
    user_dict["effective_telegram_username"] = user.effective_telegram_username
    user_dict["effective_discord_handle"] = user.effective_discord_handle

    return {
        "success": True,
        "message": "Contact info updated" if changed else "No changes",
        "user": user_dict,
    }


@router.get("/outreach/templates")
async def list_outreach_templates(
    admin: User = Depends(get_admin_user),
):
    """List all available message templates for admin UI picker."""
    return {"templates": list_templates()}


@router.post("/outreach/render", response_model=TemplateRenderResponse)
async def render_outreach_template(
    payload: TemplateRenderRequest,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Render a template for a specific user.
    Returns: subject (email), body, deep_link (tg/dc/mailto), can_send.
    """
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    try:
        result = render_template(
            template_id=payload.template_id,
            user=user,
            db=db,
            channel=None,  # auto-pick best
            custom_message=payload.custom_message,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return TemplateRenderResponse(**result)
