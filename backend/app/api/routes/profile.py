# backend/app/api/routes/profile.py
"""
Profile Management Routes

Endpoints:
  PUT   /profile          → Update username
  POST  /profile/avatar   → Upload avatar image
  DELETE /profile/avatar   → Remove avatar (revert to provider avatar or none)
  POST  /profile/link-google   → Link Google account to current user
  POST  /profile/link-telegram → Link Telegram account to current user
  POST  /profile/link-discord  → Link Discord account (via OAuth2 redirect)
  DELETE /profile/unlink-google   → Unlink Google
  DELETE /profile/unlink-telegram → Unlink Telegram
  DELETE /profile/unlink-discord  → Unlink Discord
  GET   /profile/connections     → Get linked accounts status
"""
import os
import re
import uuid
import logging
import secrets
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.subscription import Payment
from app.schemas.user import UserResponse
from app.schemas.profile import ProfileUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["Profile"])

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com"
)

# Discord config
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID", "")
DISCORD_PREMIUM_ROLE_ID = os.getenv("DISCORD_PREMIUM_ROLE_ID", "")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "https://luxquant.tw/api/v1/auth/discord/callback")
DISCORD_API = "https://discord.com/api/v10"

# Avatar upload config
AVATAR_DIR = Path(os.getenv("AVATAR_DIR", "./avatars"))
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


# ════════════════════════════════════════════
# 0. UI Preferences (per-user, remembered client settings)
# ════════════════════════════════════════════
# Disimpan di users.ui_prefs (JSONB). Pola: ABSENCE = DEFAULT.
# Whitelist key + default supaya frontend & backend sinkron dan aman dari
# key sembarangan. Tambah pref baru = cukup tambah 1 baris di UI_PREF_DEFAULTS.
UI_PREF_DEFAULTS = {
    "chart_indicators": True,   # SignalModal: tampilkan MACD/RSI/BB di chart
}


@router.get("/ui-prefs")
async def get_ui_prefs(current_user: User = Depends(get_current_user)):
    """Ambil UI preferences user (merge default + tersimpan)."""
    saved = current_user.ui_prefs or {}
    return {k: saved.get(k, d) for k, d in UI_PREF_DEFAULTS.items()}


@router.put("/ui-prefs")
async def update_ui_prefs(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update sebagian UI preferences. Hanya key yang dikenal yang disimpan."""
    current = dict(current_user.ui_prefs or {})
    for k, v in (data or {}).items():
        if k in UI_PREF_DEFAULTS:
            current[k] = bool(v)
    current_user.ui_prefs = current
    # JSONB in-place assignment butuh flag modified biar ke-persist
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "ui_prefs")
    db.commit()
    return {k: current.get(k, d) for k, d in UI_PREF_DEFAULTS.items()}


# ════════════════════════════════════════════
# 1. Update Profile (username)
# ════════════════════════════════════════════

@router.put("", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update username and/or display preferences (country & currency)"""

    # ─── Username ───
    if data.username is not None:
        new_username = data.username.strip().lower()

        # Validate format (Pydantic already validated, but double-check)
        if len(new_username) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
        if len(new_username) > 50:
            raise HTTPException(status_code=400, detail="Username must be at most 50 characters")
        if not re.match(r'^[a-z0-9_]+$', new_username):
            raise HTTPException(status_code=400, detail="Username can only contain lowercase letters, numbers, and underscores")

        # Check unique
        if new_username != current_user.username:
            existing = db.query(User).filter(User.username == new_username).first()
            if existing:
                raise HTTPException(status_code=400, detail="Username is already taken")
            current_user.username = new_username

    # ─── Country & Currency (multi-currency support) ───
    # data.country_code: None=no change, ""=clear, "XX"=set
    # data.currency_code: None=auto-resolve from country (if country provided)
    #                     "XXX"=explicit user override

    if data.country_code is not None:
        if data.country_code == "":
            current_user.country_code = None
        else:
            current_user.country_code = data.country_code  # already uppercased by validator

    if data.currency_code is not None:
        # Explicit currency choice — use as-is
        current_user.currency_code = data.currency_code
    elif data.country_code:
        # Country changed but no explicit currency → auto-resolve
        from app.services.currency_mapping import get_currency_for_country
        current_user.currency_code = get_currency_for_country(data.country_code)

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 2. Upload Avatar
# ════════════════════════════════════════════

@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload avatar image"""

    # Validate content type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use JPG, PNG, WebP, or GIF.")

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Maximum file size is 2MB")

    # Generate filename
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif'):
        ext = 'jpg'
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = AVATAR_DIR / filename

    # Delete old avatar file if exists (only local uploads, not Google/Telegram URLs)
    if current_user.avatar_url and '/avatars/' in current_user.avatar_url:
        old_filename = current_user.avatar_url.split('/avatars/')[-1]
        old_path = AVATAR_DIR / old_filename
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    # Save file
    with open(filepath, 'wb') as f:
        f.write(content)

    # Update user avatar URL
    current_user.avatar_url = f"/api/v1/avatars/{filename}"
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 3. Remove Avatar
# ════════════════════════════════════════════

@router.delete("/avatar", response_model=UserResponse)
async def remove_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove custom avatar"""

    # Delete file if local upload
    if current_user.avatar_url and '/avatars/' in current_user.avatar_url:
        old_filename = current_user.avatar_url.split('/avatars/')[-1]
        old_path = AVATAR_DIR / old_filename
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    current_user.avatar_url = None
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 4. Get Connected Accounts
# ════════════════════════════════════════════

@router.get("/connections")
async def get_connections(current_user: User = Depends(get_current_user)):
    """Get linked account status"""
    return {
        "google": {
            "linked": current_user.google_id is not None,
            "email": current_user.email if current_user.google_id else None,
        },
        "telegram": {
            "linked": current_user.telegram_id is not None,
            "username": current_user.telegram_username if current_user.telegram_id else None,
            "id": current_user.telegram_id,
        },
        "discord": {
            "linked": current_user.discord_id is not None,
            "username": current_user.discord_username if current_user.discord_id else None,
            "id": current_user.discord_id,
        },
        "auth_provider": current_user.auth_provider,
    }


# ════════════════════════════════════════════
# 5. Link Google Account
# ════════════════════════════════════════════

@router.post("/link-google", response_model=UserResponse)
async def link_google(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Link Google account to current user.

    Handles the classic "salah login pakai Google → malah kebuat akun baru" case.
    Previously this was a dead end: linking here returned 400 ("sudah terhubung
    dengan akun lain"), while unlinking from the stray account was also blocked
    because a Google-created account has no password/Telegram/Discord to fall
    back on. The user could never reach their premium account.

    Now the Google identity can be TRANSFERRED here, but only when BOTH sides
    are proven and the stray account holds nothing of value:
      • ownership of THIS account   → the JWT (get_current_user)
      • ownership of the GOOGLE id  → a freshly verified Google id_token
      • the source account has no subscription / payment / other login identity

    The source row is NEVER deleted — it only releases the Google link — so
    user counts stay exactly the same. Pass {"transfer": true} to confirm.
    """

    id_token_str = data.get("id_token")
    confirm_transfer = bool(data.get("transfer"))
    if not id_token_str:
        raise HTTPException(status_code=400, detail="id_token is required")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")

    google_id = idinfo.get('sub')
    google_email = idinfo.get('email')
    picture = idinfo.get('picture', '')

    if not google_id:
        raise HTTPException(status_code=400, detail="Google ID unavailable")

    # Is this Google identity already attached to a DIFFERENT account?
    existing = db.query(User).filter(User.google_id == google_id).first()
    if existing and existing.id != current_user.id:
        # Never strip a Google login off an account that still holds value —
        # that would be an account-takeover / lockout vector.
        blockers = []
        if existing.has_active_access:
            blockers.append("active subscription")
        if existing.telegram_id:
            blockers.append("Telegram linked")
        if existing.discord_id:
            blockers.append("Discord linked")
        if existing.password_hash:
            blockers.append("its own password")
        if db.query(Payment.id).filter(Payment.user_id == existing.id).first():
            blockers.append("payment history")

        if blockers:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "google_linked_elsewhere_locked",
                    "transferable": False,
                    "reasons": blockers,
                    "message": (
                        "This Google account is still linked to another active account ("
                        + ", ".join(blockers)
                        + "). For security, moving it has to go through an admin."
                    ),
                },
            )

        if not confirm_transfer:
            # Ask for an explicit confirmation instead of moving silently.
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "google_linked_elsewhere",
                    "transferable": True,
                    "from_username": existing.username,
                    "from_email": existing.email,
                    "message": (
                        f"This Google email is still attached to the account '{existing.username}'. "
                        "That account has no subscription or payment history, so its Google "
                        "connection can be moved to this account. Continue?"
                    ),
                },
            )

        # ── Transfer: release the link, KEEP the row (user count unchanged) ──
        existing.google_id = None
        if existing.auth_provider == "google":
            existing.auth_provider = "local"
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        note = (
            f"[{stamp}] Koneksi Google ({google_email}) dipindahkan ke akun "
            f"'{current_user.username}' (id={current_user.id}) atas permintaan "
            f"pemilik email. Akun ini dipertahankan tanpa login Google."
        )
        existing.admin_notes = (
            f"{existing.admin_notes}\n{note}" if existing.admin_notes else note
        )
        # google_id is UNIQUE — push the release UPDATE to the DB before the
        # new owner claims the same value, otherwise SQLAlchemy may emit the
        # two UPDATEs in an order that trips a duplicate-key violation.
        db.flush()
        logger.warning(
            "google_link_transfer: google_id=%s email=%s from_user=%s(id=%s) "
            "to_user=%s(id=%s)",
            google_id, google_email, existing.username, existing.id,
            current_user.username, current_user.id,
        )

    # Link to the current (authenticated) account
    current_user.google_id = google_id
    if not current_user.avatar_url and picture:
        current_user.avatar_url = picture

    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 6. Unlink Google Account
# ════════════════════════════════════════════

@router.delete("/unlink-google", response_model=UserResponse)
async def unlink_google(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unlink Google account — must have at least one other login method"""

    if not current_user.google_id:
        raise HTTPException(status_code=400, detail="No Google account linked")

    # Must have at least one other login method
    has_telegram = current_user.telegram_id is not None
    has_discord = current_user.discord_id is not None
    has_password = current_user.password_hash is not None

    if not has_telegram and not has_discord and not has_password:
        raise HTTPException(
            status_code=400,
            detail="Can't unlink Google — link Telegram or Discord first so you can still sign in."
        )

    current_user.google_id = None
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 7. Unlink Telegram Account
# ════════════════════════════════════════════

@router.delete("/unlink-telegram", response_model=UserResponse)
async def unlink_telegram(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unlink Telegram account — must have at least one other login method"""

    if not current_user.telegram_id:
        raise HTTPException(status_code=400, detail="No Telegram account linked")

    # Must have at least one other login method
    has_google = current_user.google_id is not None
    has_discord = current_user.discord_id is not None
    has_password = current_user.password_hash is not None

    if not has_google and not has_discord and not has_password:
        raise HTTPException(
            status_code=400,
            detail="Can't unlink Telegram — link Google or Discord first so you can still sign in."
        )

    current_user.telegram_id = None
    current_user.telegram_username = None
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 8. Link Discord Account (get OAuth URL)
# ════════════════════════════════════════════

@router.get("/link-discord/url")
async def link_discord_url(current_user: User = Depends(get_current_user)):
    """Get Discord OAuth2 URL for linking to existing account"""
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify guilds.members.read",
        "prompt": "consent",
        "state": f"link_{current_user.id}",
    }
    url = f"https://discord.com/oauth2/authorize?{urlencode(params)}"
    return {"url": url}


# ════════════════════════════════════════════
# 9. Link Discord Account (callback — manual link)
# ════════════════════════════════════════════

@router.post("/link-discord", response_model=UserResponse)
async def link_discord(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Link Discord to current user.
    Frontend sends { discord_id, discord_username } after OAuth flow.
    Or we can accept a code and exchange it here.
    """
    code = data.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code is required")

    # Exchange code for token
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(
                "https://discord.com/api/oauth2/token",
                data={
                    "client_id": DISCORD_CLIENT_ID,
                    "client_secret": DISCORD_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": DISCORD_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to exchange the Discord code")
            token_data = token_resp.json()

            # Fetch user info
            user_resp = await client.get(
                f"{DISCORD_API}/users/@me",
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            if user_resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch Discord profile")
            discord_user = user_resp.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Discord OAuth error: {str(e)}")

    discord_id = int(discord_user["id"])
    discord_username = discord_user.get("username", "")

    # Check if already linked to another user
    existing = db.query(User).filter(User.discord_id == discord_id).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=400, detail="This Discord account is already linked to another account")

    # Link
    current_user.discord_id = discord_id
    current_user.discord_username = discord_username

    # Update avatar if none
    discord_avatar = discord_user.get("avatar")
    if not current_user.avatar_url and discord_avatar:
        current_user.avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"

    # Check Premium+ role and update if applicable
    if DISCORD_BOT_TOKEN and DISCORD_GUILD_ID and DISCORD_PREMIUM_ROLE_ID:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                member_resp = await client.get(
                    f"{DISCORD_API}/guilds/{DISCORD_GUILD_ID}/members/{discord_id}",
                    headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
                )
                if member_resp.status_code == 200:
                    member = member_resp.json()
                    if DISCORD_PREMIUM_ROLE_ID in member.get("roles", []):
                        if current_user.role != "admin":
                            current_user.role = "subscriber"
        except Exception:
            pass  # Don't fail linking if role check fails

    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 10. Unlink Discord Account
# ════════════════════════════════════════════

@router.delete("/unlink-discord", response_model=UserResponse)
async def unlink_discord(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unlink Discord account — must have at least one other login method"""

    if not current_user.discord_id:
        raise HTTPException(status_code=400, detail="No Discord account linked")

    # Must have at least one other login method
    has_google = current_user.google_id is not None
    has_telegram = current_user.telegram_id is not None
    has_password = current_user.password_hash is not None

    if not has_google and not has_telegram and not has_password:
        raise HTTPException(
            status_code=400,
            detail="Can't unlink Discord — link Google or Telegram first so you can still sign in."
        )

    current_user.discord_id = None
    current_user.discord_username = None
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)
# ════════════════════════════════════════════
# 5b. Link Telegram Account  (POST /profile/link-telegram)
# ════════════════════════════════════════════

@router.post("/link-telegram", response_model=UserResponse)
async def link_telegram(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Link Telegram account ke user yang sedang login (mis. login via Google).

    Verifikasi hash Telegram (anti-spoof), cek collision, resolve role
    (respect subscription_source + legacy), lalu sync telegram_in_group.
    """
    from app.schemas.user import TelegramLogin
    from app.api.routes.telegram_auth import (
        _verify_telegram_hash,
        _check_vip_membership,
        _check_legacy_member,
        _maybe_claim_legacy,
    )
    from app.services.role_resolver import resolve_role_for_telegram

    # Parse + validate payload jadi TelegramLogin (sama seperti login widget)
    try:
        tg = TelegramLogin(**data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Telegram data")

    # Verifikasi hash — wajib, anti spoof
    if not _verify_telegram_hash(tg):
        raise HTTPException(status_code=401, detail="Telegram verification failed")

    # Cek telegram_id belum dipakai user lain
    existing = db.query(User).filter(User.telegram_id == tg.id).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(
            status_code=400,
            detail="This Telegram account is already linked to another account"
        )

    # Link + resolve role
    current_user.telegram_id = tg.id
    current_user.telegram_username = tg.username
    if tg.photo_url and not current_user.avatar_url:
        current_user.avatar_url = tg.photo_url

    is_vip = await _check_vip_membership(tg.id)
    is_legacy = _check_legacy_member(db, tg.id)
    new_role, new_source = resolve_role_for_telegram(current_user, is_vip, is_legacy)
    current_user.role = new_role
    current_user.subscription_source = new_source
    current_user.telegram_in_group = is_vip
    _maybe_claim_legacy(db, current_user, new_source, is_legacy)

    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)
