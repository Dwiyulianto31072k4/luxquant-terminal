# backend/app/api/routes/auth.py
"""
Authentication routes — OAuth-only.

Email/password (/register, /login) udah di-deprecate karena auth flow
sekarang Google + Telegram + Discord. File ini cuma handle:
  - POST /auth/google      : Google OAuth login (popup id_token)
  - POST /auth/refresh     : refresh JWT
  - GET  /auth/me          : current user info
  - POST /auth/logout      : stateless logout

Telegram = telegram_auth.py
Discord  = discord_auth.py
"""
import os
import re
import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.core.database import get_db
from app.core.security import create_cryptobot_exchange_token, create_tokens, decode_token
from app.models.user import User
from app.schemas.user import (
    GoogleLogin,
    TokenRefresh,
    UserResponse,
    TokenResponse,
    MessageResponse,
)
from app.api.deps import get_current_user
from app.services.referral_helpers import (
    apply_referral_to_user,
    track_user_login,
)
from app.services.role_resolver import resolve_role_for_google

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com"
)


# ════════════════════════════════════════════════════════════════════
# GOOGLE OAUTH LOGIN
# ════════════════════════════════════════════════════════════════════

@router.post("/google", response_model=TokenResponse)
async def google_login(data: GoogleLogin, db: Session = Depends(get_db)):
    """
    Login/Register dengan Google OAuth.
    Optional: referral_code dari ?ref di URL atau localStorage.
    """
    try:
        idinfo = google_id_token.verify_oauth2_token(
            data.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token tidak valid: {str(e)}"
        )

    google_id = idinfo.get('sub')
    email = idinfo.get('email')
    name = idinfo.get('name', '')
    picture = idinfo.get('picture', '')
    email_verified = idinfo.get('email_verified', False)

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email tidak tersedia dari Google"
        )

    # Cari user by google_id dulu
    user = db.query(User).filter(User.google_id == google_id).first()
    is_new_user = False

    if not user:
        # Cari by email (mungkin user existing via provider lain dengan email yang sama)
        user = db.query(User).filter(User.email == email).first()

        if user:
            # Link Google ke user existing — BUKAN user baru, jangan apply referral
            user.google_id = google_id
            if picture and not user.avatar_url:
                user.avatar_url = picture

            # Google ga punya role signal, tapi tetap call resolver buat konsistensi
            new_role, new_source = resolve_role_for_google(user)
            if user.role != new_role or user.subscription_source != new_source:
                user.role = new_role
                user.subscription_source = new_source

            db.commit()
            db.refresh(user)
        else:
            # User baru — auto-create
            username = _generate_username(name, email, db)

            user = User(
                email=email,
                username=username,
                password_hash=None,
                auth_provider='google',
                google_id=google_id,
                avatar_url=picture,
                is_active=True,
                is_verified=email_verified,
                role='free',
                subscription_source=None,
            )

            db.add(user)
            db.commit()
            db.refresh(user)
            is_new_user = True
    else:
        # User udah ada via google_id — update avatar kalo berubah
        if picture and user.avatar_url != picture:
            user.avatar_url = picture
            db.commit()
            db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun tidak aktif"
        )

    # ─── Apply referral KHUSUS user baru ───
    if is_new_user and data.referral_code:
        success, msg, _use = apply_referral_to_user(
            db, user, data.referral_code, commit=True
        )
        if not success:
            logger.info(
                f"Google referral apply failed for user {user.id} "
                f"with code='{data.referral_code}': {msg}"
            )
        db.refresh(user)

    # ─── Track login ───
    track_user_login(db, user, commit=True)

    tokens = create_tokens(user.id, user.email)

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user),
        cryptobot_token=create_cryptobot_exchange_token(user.id, user.email)
    )


def _generate_username(name: str, email: str, db: Session) -> str:
    """Generate unique username dari Google name atau email."""
    if name:
        base = re.sub(r'[^a-zA-Z0-9]', '_', name.lower()).strip('_')
        base = re.sub(r'_+', '_', base)
    else:
        base = email.split('@')[0].lower()
        base = re.sub(r'[^a-z0-9_]', '_', base)

    if len(base) < 3:
        base = base + '_user'

    base = base[:40]

    existing = db.query(User).filter(User.username == base).first()
    if not existing:
        return base

    for _ in range(10):
        suffix = secrets.token_hex(2)
        candidate = f"{base}_{suffix}"
        if len(candidate) > 50:
            candidate = candidate[:50]
        existing = db.query(User).filter(User.username == candidate).first()
        if not existing:
            return candidate

    return f"user_{secrets.token_hex(4)}"


# ════════════════════════════════════════════════════════════════════
# REFRESH / ME / LOGOUT
# ════════════════════════════════════════════════════════════════════

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(token_data: TokenRefresh, db: Session = Depends(get_db)):
    """Refresh access token menggunakan refresh token"""

    payload = decode_token(token_data.refresh_token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token tidak valid atau expired"
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token type tidak valid"
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User tidak ditemukan atau tidak aktif"
        )

    # Note: refresh tidak track login (user baru aja login, ga perlu double-count)

    tokens = create_tokens(user.id, user.email)

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user),
        cryptobot_token=create_cryptobot_exchange_token(user.id, user.email)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current logged in user info"""
    return UserResponse.model_validate(current_user)


@router.get("/me/cryptobot-token")
async def get_cryptobot_token(current_user: User = Depends(get_current_user)):
    """Return a fresh LuxQuant JWT for Cryptobot token exchange."""
    token = create_cryptobot_exchange_token(current_user.id, current_user.email)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LUXQUANT_JWT_SECRET is not configured"
        )

    return {"cryptobot_token": token}


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: User = Depends(get_current_user)):
    """Logout — JWT stateless, cukup hapus token di client side."""
    return MessageResponse(
        message="Logout berhasil",
        success=True
    )
