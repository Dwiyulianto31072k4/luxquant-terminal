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
import json

import httpx
from urllib.parse import urlencode, quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
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
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "https://luxquant.tw/api/v1/auth/google/callback"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://luxquant.tw")


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
        cryptobot_token=create_cryptobot_exchange_token(user)
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
        cryptobot_token=create_cryptobot_exchange_token(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current logged in user info"""
    return UserResponse.model_validate(current_user)


@router.get("/me/cryptobot-token")
async def get_cryptobot_token(current_user: User = Depends(get_current_user)):
    """Return a fresh LuxQuant JWT for Cryptobot token exchange."""
    token = create_cryptobot_exchange_token(current_user)
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


# ════════════════════════════════════════════════════════════════════
# GOOGLE OAUTH — REDIRECT FLOW (full-page, Cloudflare-style)
# ════════════════════════════════════════════════════════════════════

def _encode_google_state(referral_code=None):
    csrf = secrets.token_urlsafe(16)
    if referral_code:
        clean = re.sub(r'[^A-Z0-9_-]', '', referral_code.upper())[:20]
        if clean:
            return f"ref:{clean}:{csrf}"
    return f"csrf:{csrf}"


def _decode_google_state(state):
    if not state:
        return None
    parts = state.split(":", 2)
    if len(parts) >= 2 and parts[0] == "ref":
        clean = re.sub(r'[^A-Z0-9_-]', '', parts[1].upper())[:20]
        return clean if clean else None
    return None


@router.get("/google/url")
async def get_google_auth_url(referral_code: str = None):
    """Return Google OAuth2 authorization URL (redirect flow)."""
    state = _encode_google_state(referral_code=referral_code)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"url": url}


@router.get("/google/callback")
async def google_callback(
    code: str = None,
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db),
):
    """Google redirect ke sini dengan ?code=xxx&state=xxx."""
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_cancelled")

    referral_code = _decode_google_state(state or "")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": GOOGLE_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if resp.status_code != 200:
            logger.error(f"Google token exchange failed: {resp.status_code} {resp.text}")
            return RedirectResponse(f"{FRONTEND_URL}/login?error=google_token_failed")
        token_data = resp.json()
    except Exception as e:
        logger.error(f"Google token exchange error: {e}")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_token_failed")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            token_data["id_token"],
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except (ValueError, KeyError) as e:
        logger.error(f"Google id_token verify failed: {e}")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_token_invalid")

    google_id = idinfo.get('sub')
    email = idinfo.get('email')
    name = idinfo.get('name', '')
    picture = idinfo.get('picture', '')
    email_verified = idinfo.get('email_verified', False)

    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_no_email")

    user = db.query(User).filter(User.google_id == google_id).first()
    is_new_user = False

    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
            if picture and not user.avatar_url:
                user.avatar_url = picture
            new_role, new_source = resolve_role_for_google(user)
            if user.role != new_role or user.subscription_source != new_source:
                user.role = new_role
                user.subscription_source = new_source
            db.commit()
            db.refresh(user)
        else:
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
        if picture and user.avatar_url != picture:
            user.avatar_url = picture
            db.commit()
            db.refresh(user)

    if not user.is_active:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=account_inactive")

    if is_new_user and referral_code:
        success, msg, _use = apply_referral_to_user(db, user, referral_code, commit=True)
        if not success:
            logger.info(
                f"Google referral apply failed for user {user.id} "
                f"with code='{referral_code}': {msg}"
            )
        db.refresh(user)

    track_user_login(db, user, commit=True)

    tokens = create_tokens(user.id, user.email)
    cryptobot_token = create_cryptobot_exchange_token(user)

    user_response = UserResponse.model_validate(user)
    user_json = quote(json.dumps(user_response.model_dump(mode="json")))

    redirect_url = (
        f"{FRONTEND_URL}/auth/google/callback"
        f"?token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}"
        f"&user={user_json}"
    )
    if cryptobot_token:
        redirect_url += f"&cryptobot_token={cryptobot_token}"

    return RedirectResponse(redirect_url)
