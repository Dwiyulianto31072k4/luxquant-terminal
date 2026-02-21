# backend/app/api/routes/admin.py
"""
Admin User Management API

Features:
- List all users with search/filter/pagination
- Grant subscription (1 month, 1 year, lifetime)
- Revoke subscription
- User stats & dashboard data
- Expiring subscription alerts
- Auto-downgrade expired subscribers
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, case

from app.core.database import get_db
from app.models.user import User
from app.api.deps import get_admin_user
from app.schemas.user import (
    AdminUserResponse,
    GrantSubscription,
    MessageResponse,
)

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
        User.role == 'subscriber',
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
        User.role == 'subscriber',
        User.is_active == True,
        User.subscription_expires_at.isnot(None),
        User.subscription_expires_at > now,
        User.subscription_expires_at <= seven_days
    ).scalar()
    
    # Already expired (masih role subscriber tapi sudah lewat)
    expired = db.query(func.count(User.id)).filter(
        User.role == 'subscriber',
        User.subscription_expires_at.isnot(None),
        User.subscription_expires_at <= now
    ).scalar()
    
    # Lifetime subscribers (no expiry)
    lifetime = db.query(func.count(User.id)).filter(
        User.role == 'subscriber',
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
    
    return {
        "total_users": total_users,
        "active_subscribers": active_subscribers,
        "free_users": free_users,
        "admin_count": admin_count,
        "lifetime_subscribers": lifetime,
        "expiring_soon": expiring_soon,
        "expired_not_downgraded": expired,
        "new_users_30d": new_users_30d,
        "auth_providers": {provider: count for provider, count in provider_stats}
    }


# ════════════════════════════════════════════
# 2. List Users (with search/filter/pagination)
# ════════════════════════════════════════════

@router.get("/users")
async def list_users(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None, description="Search by username, email, or telegram username"),
    role: Optional[str] = Query(None, description="Filter by role: free, subscriber, admin"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter: active, inactive, expiring, expired"),
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
    
    # Search
    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(User.username).like(search_term),
                func.lower(User.email).like(search_term),
                func.lower(User.telegram_username).like(search_term),
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
            User.role == 'subscriber',
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at > now,
            User.subscription_expires_at <= seven_days
        )
    elif status_filter == "expired":
        query = query.filter(
            User.role == 'subscriber',
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at <= now
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
    }.get(sort_by, User.created_at)
    
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())
    
    # Pagination
    offset = (page - 1) * page_size
    users = query.offset(offset).limit(page_size).all()
    
    return {
        "users": [AdminUserResponse.model_validate(u) for u in users],
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
        if user.role == 'subscriber' and user.subscription_expires_at and user.subscription_expires_at > now:
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
    else:
        raise HTTPException(status_code=400, detail="Duration tidak valid")
    
    user.role = 'subscriber'
    user.subscription_expires_at = expires_at
    user.subscription_granted_by = admin.id
    user.subscription_granted_at = now
    user.subscription_note = data.note
    
    db.commit()
    db.refresh(user)
    
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
    
    old_expires = user.subscription_expires_at
    
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
        User.role == 'subscriber',
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
    Bisa juga dipanggil periodik via cron/background worker.
    """
    now = datetime.now(timezone.utc)
    
    expired_users = db.query(User).filter(
        User.role == 'subscriber',
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