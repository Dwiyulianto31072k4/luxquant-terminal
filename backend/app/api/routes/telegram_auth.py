# backend/app/api/routes/telegram_auth.py
"""
Telegram Login + VIP Group Membership Verification + Referral

Flow:
1. User klik "Login with Telegram" -> Telegram Login Widget popup
2. Frontend kirim auth data (+ optional referral_code) ke POST /auth/telegram
3. Backend verify hash (keamanan dari Telegram)
4. Backend cek membership di VIP group via Bot API getChatMember
5. Cek legacy_members snapshot (member lama pre-webapp -> lifetime)
6. Resolve role via role_resolver (respect subscription_source)
7. Sinkron flag telegram_in_group + claim legacy kalau match
8. Apply referral_code (kalo user baru) + track login
9. Return JWT tokens

Plus: POST /auth/telegram/join-vip -> generate invite link sekali-pakai
untuk user dengan akses aktif (syarat: telegram_id sudah ter-link).
"""
import hashlib
import hmac
import time
import os
import re
import secrets
import logging
from datetime import datetime, timezone

import httpx

_TG_PROXY = os.getenv("TELEGRAM_PROXY") or None
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_cryptobot_exchange_token, create_tokens
from app.models.user import User
from app.models.legacy_member import LegacyMember
from app.schemas.user import (
    TelegramLogin,
    UserResponse,
    TokenResponse,
)
from app.api.deps import get_current_user
from app.services.referral_helpers import (
    apply_referral_to_user,
    track_user_login,
)
from app.services.role_resolver import (
    resolve_role_for_telegram,
    is_role_protected,
    SOURCE_LEGACY,
    PROVIDER_TELEGRAM,
)
from app.services.telegram_group import create_one_time_invite_link

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Telegram Auth"])

# -- Config --
TELEGRAM_BOT_TOKEN = os.getenv(
    "TELEGRAM_BOT_TOKEN",
    "8398445725:AAF4zg1TEG_qUMrgwyOSlgXXQB-tyG64SqU"
)
VIP_GROUP_CHAT_ID = int(os.getenv("VIP_GROUP_CHAT_ID", "-1002670915863"))
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Berapa lama invite link valid (detik). Default 1 jam.
INVITE_LINK_TTL = int(os.getenv("VIP_INVITE_LINK_TTL", "3600"))


# ====================================================================
# 1. Telegram Login
# ====================================================================

@router.post("/telegram", response_model=TokenResponse)
async def telegram_login(data: TelegramLogin, db: Session = Depends(get_db)):
    """Login/Register via Telegram Login Widget."""

    # Verify hash
    if not _verify_telegram_hash(data):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram data"
        )

    # Cek auth_date tidak terlalu lama (max 1 hari)
    if time.time() - data.auth_date > 86400:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram authentication has expired, please try again"
        )

    # Cek VIP membership (sedang ada di group atau ga)
    is_vip_member = await _check_vip_membership(data.id)
    # Cek legacy snapshot (member lama pre-webapp -> lifetime)
    is_legacy = _check_legacy_member(db, data.id)

    # Find or create user
    user = db.query(User).filter(User.telegram_id == data.id).first()
    is_new_user = False

    if user:
        # User existing -- update info & resolve role
        user.telegram_username = data.username
        if data.photo_url:
            user.avatar_url = data.photo_url

        new_role, new_source = resolve_role_for_telegram(user, is_vip_member, is_legacy)
        user.role = new_role
        user.subscription_source = new_source
        user.telegram_in_group = is_vip_member
        _maybe_claim_legacy(db, user, new_source, is_legacy)

        db.commit()
        db.refresh(user)
    else:
        # User baru
        username = _generate_username(data, db)
        email = f"tg_{data.id}@telegram.luxquant.tw"

        # Cek email collision
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            # Link Telegram ke existing user (BUKAN user baru, no referral apply)
            existing_email.telegram_id = data.id
            existing_email.telegram_username = data.username
            existing_email.avatar_url = data.photo_url or existing_email.avatar_url

            new_role, new_source = resolve_role_for_telegram(existing_email, is_vip_member, is_legacy)
            existing_email.role = new_role
            existing_email.subscription_source = new_source
            existing_email.telegram_in_group = is_vip_member
            _maybe_claim_legacy(db, existing_email, new_source, is_legacy)

            db.commit()
            db.refresh(existing_email)
            user = existing_email
        else:
            # Genuinely new user
            if is_legacy:
                initial_role = 'premium'
                initial_source = SOURCE_LEGACY
            elif is_vip_member:
                initial_role = 'subscriber'
                initial_source = 'telegram_vip'
            else:
                initial_role = 'free'
                initial_source = None

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
                role=initial_role,
                subscription_source=initial_source,
                telegram_in_group=is_vip_member,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            _maybe_claim_legacy(db, user, initial_source, is_legacy)
            if is_legacy:
                db.commit()
            is_new_user = True

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )

    # --- Apply referral KHUSUS user baru ---
    if is_new_user and data.referral_code:
        success, msg, _use = apply_referral_to_user(
            db, user, data.referral_code, commit=True
        )
        if not success:
            logger.info(
                f"Telegram referral apply failed for user {user.id} "
                f"with code='{data.referral_code}': {msg}"
            )
        db.refresh(user)

    # --- Track login ---
    track_user_login(db, user, commit=True)

    tokens = create_tokens(user.id, user.email)

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user),
        cryptobot_token=create_cryptobot_exchange_token(user)
    )


# ====================================================================
# 2. Check VIP Status
# ====================================================================

@router.get("/telegram/check-vip")
async def check_vip_status(current_user: User = Depends(get_current_user)):
    """Cek ulang VIP membership untuk current user."""
    if not current_user.telegram_id:
        return {
            "is_vip": False,
            "role": current_user.role,
            "message": "No Telegram account linked"
        }

    is_vip = await _check_vip_membership(current_user.telegram_id)

    return {
        "is_vip": is_vip,
        "role": current_user.role,
        "telegram_id": current_user.telegram_id
    }


# ====================================================================
# 3. Refresh VIP Status (update role)
# ====================================================================

@router.post("/telegram/refresh-vip")
async def refresh_vip_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cek ulang VIP membership dan update role."""
    if not current_user.telegram_id:
        return {
            "updated": False,
            "role": current_user.role,
            "message": "No Telegram account linked"
        }

    is_vip = await _check_vip_membership(current_user.telegram_id)
    is_legacy = _check_legacy_member(db, current_user.telegram_id)

    old_role = current_user.role
    old_source = current_user.subscription_source

    new_role, new_source = resolve_role_for_telegram(current_user, is_vip, is_legacy)

    changed = old_role != new_role or old_source != new_source
    in_group_changed = current_user.telegram_in_group != is_vip

    if changed or in_group_changed:
        current_user.role = new_role
        current_user.subscription_source = new_source
        current_user.telegram_in_group = is_vip
        _maybe_claim_legacy(db, current_user, new_source, is_legacy)
        db.commit()
        db.refresh(current_user)

    return {
        "updated": changed,
        "old_role": old_role,
        "new_role": current_user.role,
        "is_vip": is_vip,
        "is_protected": is_role_protected(current_user, current_provider=PROVIDER_TELEGRAM),
        "telegram_id": current_user.telegram_id
    }


# ====================================================================
# 4. Link Telegram to existing account
# ====================================================================

@router.post("/telegram/link", response_model=UserResponse)
async def link_telegram(
    data: TelegramLogin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Link Telegram account ke user yang sudah login (via Google/Discord)."""
    if not _verify_telegram_hash(data):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram data"
        )

    # Cek apakah telegram_id sudah dipakai user lain
    existing = db.query(User).filter(User.telegram_id == data.id).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This Telegram account is already linked to another account"
        )

    current_user.telegram_id = data.id
    current_user.telegram_username = data.username
    if data.photo_url and not current_user.avatar_url:
        current_user.avatar_url = data.photo_url

    is_vip = await _check_vip_membership(data.id)
    is_legacy = _check_legacy_member(db, data.id)
    new_role, new_source = resolve_role_for_telegram(current_user, is_vip, is_legacy)
    current_user.role = new_role
    current_user.subscription_source = new_source
    current_user.telegram_in_group = is_vip
    _maybe_claim_legacy(db, current_user, new_source, is_legacy)

    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ====================================================================
# 5. Join VIP Group (generate invite link)
# ====================================================================

@router.post("/telegram/join-vip")
async def join_vip_group(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate invite link sekali-pakai ke VIP group.

    Syarat:
    - User punya akses aktif (premium/subscriber belum expired, atau lifetime/legacy/admin)
    - telegram_id sudah ter-link (biar bisa di-track & di-kick saat expired)
    """
    # 1. Harus punya akses aktif
    if not current_user.has_active_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active subscription. Subscribe first to join the VIP group."
        )

    # 2. Harus sudah link Telegram (krusial buat auto-kick saat expired)
    if not current_user.telegram_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link your Telegram account before joining the VIP group."
        )

    # 3. Kalau sudah di group, ga perlu link baru
    already_in = await _check_vip_membership(current_user.telegram_id)
    if already_in:
        if not current_user.telegram_in_group:
            current_user.telegram_in_group = True
            db.commit()
        return {
            "already_member": True,
            "invite_link": None,
            "message": "You're already a member of the VIP group."
        }

    # 4. Generate invite link sekali-pakai
    invite_link = await create_one_time_invite_link(
        expire_seconds=INVITE_LINK_TTL,
        name=f"u{current_user.id}",
    )
    if not invite_link:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't create an invite link, please try again shortly."
        )

    return {
        "already_member": False,
        "invite_link": invite_link,
        "expires_in": INVITE_LINK_TTL,
        "message": "Single-use link. Click to join the VIP group."
    }


# ====================================================================
# Helper Functions
# ====================================================================

def _verify_telegram_hash(data: TelegramLogin) -> bool:
    """
    Verify data authenticity via HMAC-SHA256.
    https://core.telegram.org/widgets/login#checking-authorization

    PENTING: referral_code BUKAN data dari Telegram, exclude dari hash check.
    """
    check_dict = data.model_dump(exclude={'hash', 'referral_code'})
    check_dict = {k: v for k, v in check_dict.items() if v is not None}
    check_string = '\n'.join(
        f"{k}={v}" for k, v in sorted(check_dict.items())
    )

    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    computed_hash = hmac.new(
        secret_key,
        check_string.encode(),
        hashlib.sha256
    ).hexdigest()

    return computed_hash == data.hash


def _check_legacy_member(db: Session, telegram_user_id: int) -> bool:
    """Cek apakah telegram_id ada di snapshot legacy_members (member lama -> lifetime).

    Row yang sudah di-revoke admin (revoked=True) TIDAK dianggap legacy lagi,
    supaya akses tidak di-grant ulang tiap user login via Telegram.
    """
    row = db.query(LegacyMember).filter(
        LegacyMember.telegram_id == telegram_user_id,
        LegacyMember.revoked.is_(False),
    ).first()
    return row is not None


def _maybe_claim_legacy(db: Session, user: User, final_source: str, is_legacy: bool) -> None:
    """Tandai legacy_members.claimed = True kalau user ini di-grant via legacy.

    Tidak commit sendiri -- caller yang commit (biar atomic sama perubahan user).
    """
    if not is_legacy or final_source != SOURCE_LEGACY or not user.telegram_id:
        return
    row = db.query(LegacyMember).filter(
        LegacyMember.telegram_id == user.telegram_id
    ).first()
    if row and not row.claimed:
        row.claimed = True
        row.claimed_at = datetime.now(timezone.utc)


async def _check_vip_membership(telegram_user_id: int) -> bool:
    """Cek apakah Telegram user adalah member VIP group."""
    try:
        async with httpx.AsyncClient(timeout=10.0, proxy=_TG_PROXY) as client:
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

            member_status = result.get("result", {}).get("status", "left")
            return member_status in ("creator", "administrator", "member", "restricted")

    except Exception as e:
        logger.error(f"Error checking VIP membership: {e}")
        return False


def _generate_username(data: TelegramLogin, db: Session) -> str:
    """Generate unique username dari Telegram data."""
    if data.username:
        base = re.sub(r'[^a-zA-Z0-9_]', '', data.username.lower())
    elif data.first_name:
        base = re.sub(r'[^a-zA-Z0-9]', '_', data.first_name.lower()).strip('_')
        base = re.sub(r'_+', '_', base)
    else:
        base = "tg_user"

    if len(base) < 3:
        base = base + '_user'

    base = base[:40]

    existing = db.query(User).filter(User.username == base).first()
    if not existing:
        return base

    for _ in range(10):
        suffix = secrets.token_hex(2)
        candidate = f"{base}_{suffix}"[:50]
        if not db.query(User).filter(User.username == candidate).first():
            return candidate

    return f"tg_{secrets.token_hex(4)}"
