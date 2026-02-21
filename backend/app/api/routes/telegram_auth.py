# backend/app/api/routes/telegram_auth.py
"""
Telegram Login + VIP Group Membership Verification

Flow:
1. User klik "Login with Telegram" → Telegram Login Widget popup
2. Frontend kirim auth data ke POST /auth/telegram
3. Backend verify hash (keamanan dari Telegram)
4. Backend cek membership di VIP group via Bot API getChatMember
5. Set role berdasarkan membership: subscriber / free
6. Return JWT tokens
"""
import hashlib
import hmac
import time
import os
import re
import secrets
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_tokens
from app.models.user import User
from app.schemas.user import (
    TelegramLogin,
    UserResponse,
    TokenResponse,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Telegram Auth"])

# ── Config ──
TELEGRAM_BOT_TOKEN = os.getenv(
    "TELEGRAM_BOT_TOKEN",
    "8398445725:AAF4zg1TEG_qUMrgwyOSlgXXQB-tyG64SqU"
)
VIP_GROUP_CHAT_ID = int(os.getenv("VIP_GROUP_CHAT_ID", "-1002670915863"))
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


# ════════════════════════════════════════════
# 1. Telegram Login
# ════════════════════════════════════════════

@router.post("/telegram", response_model=TokenResponse)
async def telegram_login(data: TelegramLogin, db: Session = Depends(get_db)):
    """
    Login/Register via Telegram Login Widget.
    Juga cek membership VIP group untuk set role.
    """
    
    # Step 1: Verify hash dari Telegram
    if not _verify_telegram_hash(data):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Data Telegram tidak valid"
        )
    
    # Step 2: Cek auth_date tidak terlalu lama (max 1 hari)
    if time.time() - data.auth_date > 86400:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autentikasi Telegram sudah expired, silakan coba lagi"
        )
    
    # Step 3: Cek VIP membership
    is_vip_member = await _check_vip_membership(data.id)
    target_role = 'subscriber' if is_vip_member else 'free'
    
    # Step 4: Find or create user
    user = db.query(User).filter(User.telegram_id == data.id).first()
    
    if user:
        # Update info dari Telegram
        user.telegram_username = data.username
        if data.photo_url:
            user.avatar_url = data.photo_url
        # Update role berdasarkan VIP membership
        if user.role != 'admin':  # Jangan override admin
            user.role = target_role
        db.commit()
        db.refresh(user)
    else:
        # Cek apakah ada user dengan username Telegram yang sama
        # atau buat user baru
        username = _generate_username(data, db)
        
        # Email placeholder untuk Telegram users (email required di schema)
        email = f"tg_{data.id}@telegram.luxquant.tw"
        
        # Cek email collision (harusnya tidak terjadi)
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            # Link Telegram ke existing user
            existing_email.telegram_id = data.id
            existing_email.telegram_username = data.username
            existing_email.avatar_url = data.photo_url or existing_email.avatar_url
            if existing_email.role != 'admin':
                existing_email.role = target_role
            db.commit()
            db.refresh(existing_email)
            user = existing_email
        else:
            user = User(
                email=email,
                username=username,
                password_hash=None,
                auth_provider='telegram',
                telegram_id=data.id,
                telegram_username=data.username,
                avatar_url=data.photo_url,
                is_active=True,
                is_verified=True,
                role=target_role,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun tidak aktif"
        )
    
    # Generate JWT tokens
    tokens = create_tokens(user.id, user.email)
    
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user)
    )


# ════════════════════════════════════════════
# 2. Check VIP Membership (public endpoint)
# ════════════════════════════════════════════

@router.get("/telegram/check-vip")
async def check_vip_status(current_user: User = Depends(get_current_user)):
    """
    Cek ulang VIP membership untuk current user.
    Bisa dipanggil periodik dari frontend.
    """
    if not current_user.telegram_id:
        return {
            "is_vip": False,
            "role": current_user.role,
            "message": "Akun belum terhubung dengan Telegram"
        }
    
    is_vip = await _check_vip_membership(current_user.telegram_id)
    
    return {
        "is_vip": is_vip,
        "role": current_user.role,
        "telegram_id": current_user.telegram_id
    }


# ════════════════════════════════════════════
# 3. Refresh VIP Status (update role di DB)
# ════════════════════════════════════════════

@router.post("/telegram/refresh-vip")
async def refresh_vip_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cek ulang VIP membership dan update role di database.
    Dipanggil periodik oleh frontend atau background worker.
    """
    if not current_user.telegram_id:
        return {
            "updated": False,
            "role": current_user.role,
            "message": "Akun belum terhubung dengan Telegram"
        }
    
    is_vip = await _check_vip_membership(current_user.telegram_id)
    new_role = 'subscriber' if is_vip else 'free'
    
    # Update role (jangan override admin)
    old_role = current_user.role
    if current_user.role != 'admin':
        current_user.role = new_role
        db.commit()
        db.refresh(current_user)
    
    return {
        "updated": old_role != new_role,
        "old_role": old_role,
        "new_role": current_user.role,
        "is_vip": is_vip,
        "telegram_id": current_user.telegram_id
    }


# ════════════════════════════════════════════
# 4. Link Telegram to existing account
# ════════════════════════════════════════════

@router.post("/telegram/link", response_model=UserResponse)
async def link_telegram(
    data: TelegramLogin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Link Telegram account ke user yang sudah login (via email/Google).
    Berguna kalau user sudah register via email tapi mau connect Telegram untuk VIP check.
    """
    # Verify hash
    if not _verify_telegram_hash(data):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Data Telegram tidak valid"
        )
    
    # Cek apakah telegram_id sudah dipakai user lain
    existing = db.query(User).filter(User.telegram_id == data.id).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Akun Telegram ini sudah terhubung dengan akun lain"
        )
    
    # Link
    current_user.telegram_id = data.id
    current_user.telegram_username = data.username
    if data.photo_url and not current_user.avatar_url:
        current_user.avatar_url = data.photo_url
    
    # Check VIP
    is_vip = await _check_vip_membership(data.id)
    if current_user.role != 'admin':
        current_user.role = 'subscriber' if is_vip else current_user.role
    
    db.commit()
    db.refresh(current_user)
    
    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# Helper Functions
# ════════════════════════════════════════════

def _verify_telegram_hash(data: TelegramLogin) -> bool:
    """
    Verify data authenticity menggunakan HMAC-SHA256.
    https://core.telegram.org/widgets/login#checking-authorization
    """
    # Build check string (sorted key=value pairs, excluding hash)
    check_dict = data.model_dump(exclude={'hash'})
    # Remove None values
    check_dict = {k: v for k, v in check_dict.items() if v is not None}
    check_string = '\n'.join(
        f"{k}={v}" for k, v in sorted(check_dict.items())
    )
    
    # Secret key = SHA256(bot_token)
    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    
    # HMAC-SHA256
    computed_hash = hmac.new(
        secret_key,
        check_string.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return computed_hash == data.hash


async def _check_vip_membership(telegram_user_id: int) -> bool:
    """
    Cek apakah Telegram user adalah member VIP group.
    Menggunakan Bot API getChatMember.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{TELEGRAM_API}/getChatMember",
                params={
                    "chat_id": VIP_GROUP_CHAT_ID,
                    "user_id": telegram_user_id
                }
            )
            
            if response.status_code != 200:
                return False
            
            result = response.json()
            
            if not result.get("ok"):
                return False
            
            # Status bisa: creator, administrator, member, restricted, left, kicked
            member_status = result.get("result", {}).get("status", "left")
            
            # Dianggap VIP member jika statusnya salah satu dari:
            return member_status in ("creator", "administrator", "member", "restricted")
    
    except Exception as e:
        print(f"Error checking VIP membership: {e}")
        return False


def _generate_username(data: TelegramLogin, db: Session) -> str:
    """Generate unique username dari Telegram data."""
    # Prioritas: telegram username > first_name > fallback
    if data.username:
        base = re.sub(r'[^a-zA-Z0-9_]', '', data.username.lower())
    elif data.first_name:
        base = re.sub(r'[^a-zA-Z0-9]', '_', data.first_name.lower()).strip('_')
        base = re.sub(r'_+', '_', base)
    else:
        base = f"tg_user"
    
    if len(base) < 3:
        base = base + '_user'
    
    base = base[:40]
    
    # Cek uniqueness
    existing = db.query(User).filter(User.username == base).first()
    if not existing:
        return base
    
    for _ in range(10):
        suffix = secrets.token_hex(2)
        candidate = f"{base}_{suffix}"[:50]
        if not db.query(User).filter(User.username == candidate).first():
            return candidate
    
    return f"tg_{secrets.token_hex(4)}"