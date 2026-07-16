# backend/app/api/deps.py
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

# Safe methods for view-only staff (co_admin / founder)
_VIEW_ONLY_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current user from JWT token"""
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid atau expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token type tidak valid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == int(user_id)).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User tidak ditemukan",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun tidak aktif"
        )

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Optional authentication"""
    if credentials is None:
        return None

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        return None

    return user


async def get_admin_user(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Require admin-panel staff access.

    - admin: full read + write
    - co_admin / founder: GET/HEAD/OPTIONS only (view-only)
    """
    if not current_user.is_admin_staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    if (
        current_user.is_admin_view_only
        and request.method not in _VIEW_ONLY_METHODS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="View-only staff cannot perform write actions",
        )
    return current_user


async def get_full_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require full admin (role=admin). Used for role assignment & destructive ops."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Full admin access required",
        )
    return current_user


async def require_subscription(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require active subscription or staff"""
    # Staff (admin / co_admin / founder) bypass
    if current_user.is_admin_staff:
        return current_user

    # Check subscriber/premium role + expiry
    if current_user.role in ('premium', 'subscriber'):
        if current_user.subscription_expires_at is None:
            return current_user  # lifetime
        if current_user.subscription_expires_at > datetime.now(timezone.utc):
            return current_user  # not expired

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Subscription aktif diperlukan untuk mengakses fitur ini"
    )