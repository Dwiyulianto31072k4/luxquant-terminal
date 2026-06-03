# backend/app/api/routes/discord_auth.py
"""
Discord OAuth2 Login + Role Verification + Referral

Flow:
1. Frontend: GET /auth/discord/url?referral_code=XYZ
2. Backend: generate Discord OAuth URL dengan state="ref:XYZ:randomtoken"
3. User authorize di Discord → redirect ke /auth/discord/callback?code=xxx&state=...
4. Backend: parse state → ekstrak referral_code → exchange code → fetch user → check role
5. Apply referral_code KHUSUS user baru, track login
6. Redirect to frontend dengan JWT tokens

State parameter format:
  "ref:<UPPERCASED_REFERRAL_CODE>:<RANDOM_CSRF_TOKEN>"   → user baru via referral
  "link:<USER_ID>:<RANDOM_CSRF_TOKEN>"                    → link Discord ke existing user
  "csrf:<RANDOM_TOKEN>"                                   → no special context

Role resolution: pake role_resolver shared (respect subscription_source).
"""
import os
import re
import secrets
import logging
import json
from urllib.parse import urlencode, quote
from typing import Optional, Tuple

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_tokens
from app.models.user import User
from app.schemas.user import UserResponse
from app.api.deps import get_current_user
from app.services.referral_helpers import (
    apply_referral_to_user,
    track_user_login,
)
from app.services.role_resolver import (
    resolve_role_for_discord,
    is_role_protected,
    PROVIDER_DISCORD,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Discord Auth"])

# ── Config ──
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "1418592983745429638")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID", "1199773381097181317")
DISCORD_PREMIUM_ROLE_ID = os.getenv("DISCORD_PREMIUM_ROLE_ID", "1419900487364382810")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "https://luxquant.tw/api/v1/auth/discord/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://luxquant.tw")

DISCORD_API = "https://discord.com/api/v10"
DISCORD_OAUTH_URL = "https://discord.com/api/oauth2"

SCOPES = "identify guilds.members.read"


# ════════════════════════════════════════════════════════════════════
# State param encode/decode
# ════════════════════════════════════════════════════════════════════

def _encode_state(referral_code: Optional[str] = None, link_user_id: Optional[int] = None) -> str:
    """Encode state param untuk OAuth2 round-trip."""
    csrf = secrets.token_urlsafe(16)
    if referral_code:
        clean = re.sub(r'[^A-Z0-9_-]', '', referral_code.upper())[:20]
        if clean:
            return f"ref:{clean}:{csrf}"
    if link_user_id:
        return f"link:{link_user_id}:{csrf}"
    return f"csrf:{csrf}"


def _decode_state(state: str) -> Tuple[Optional[str], Optional[int]]:
    """Decode state param. Return (referral_code, link_user_id)."""
    if not state:
        return None, None

    parts = state.split(":", 2)
    if len(parts) < 2:
        return None, None

    kind = parts[0]
    payload = parts[1]

    if kind == "ref":
        clean = re.sub(r'[^A-Z0-9_-]', '', payload.upper())[:20]
        return (clean if clean else None), None

    if kind == "link":
        try:
            return None, int(payload)
        except (ValueError, TypeError):
            return None, None

    return None, None


# ════════════════════════════════════════════════════════════════════
# 1. Get Discord OAuth2 URL
# ════════════════════════════════════════════════════════════════════

@router.get("/discord/url")
async def get_discord_auth_url(referral_code: Optional[str] = None):
    """
    Return Discord OAuth2 authorization URL.
    Optional: referral_code (carried lewat state param).
    """
    state = _encode_state(referral_code=referral_code)

    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "prompt": "consent",
        "state": state,
    }
    url = f"https://discord.com/oauth2/authorize?{urlencode(params)}"
    return {"url": url}


# ════════════════════════════════════════════════════════════════════
# 2. Discord OAuth2 Callback
# ════════════════════════════════════════════════════════════════════

@router.get("/discord/callback")
async def discord_callback(
    code: str,
    state: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Discord redirect ke sini dengan ?code=xxx&state=xxx."""

    referral_code, _link_user_id = _decode_state(state or "")

    # Exchange code for access_token
    token_data = await _exchange_code(code)
    if not token_data:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=discord_token_failed")

    access_token = token_data["access_token"]

    # Fetch Discord user info
    discord_user = await _get_discord_user(access_token)
    if not discord_user:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=discord_user_failed")

    discord_id = int(discord_user["id"])
    discord_username = discord_user.get("username", "")
    discord_global_name = discord_user.get("global_name") or discord_username
    discord_avatar = discord_user.get("avatar")
    discord_email = discord_user.get("email")

    # Check Premium role di guild
    has_premium_role = await _check_guild_role(discord_id)

    # ─── LINK MODE: state=link:<user_id> → link ke user yg sedang login ───
    # OAuth redirect ga bawa Bearer token, jadi identitas user diambil dari state.
    if _link_user_id is not None:
        link_user = db.query(User).filter(User.id == _link_user_id).first()
        if not link_user:
            return RedirectResponse(f"{FRONTEND_URL}/profile?error=link_user_not_found")

        # Guard collision: discord_id ga boleh dipakai user lain
        existing = db.query(User).filter(User.discord_id == discord_id).first()
        if existing and existing.id != link_user.id:
            return RedirectResponse(f"{FRONTEND_URL}/profile?error=discord_already_linked")

        link_user.discord_id = discord_id
        link_user.discord_username = discord_username
        if discord_avatar and not link_user.avatar_url:
            link_user.avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"

        # Resolve role (respect protection — admin/lifetime/legacy/payment aman)
        new_role, new_source = resolve_role_for_discord(link_user, has_premium_role)
        link_user.role = new_role
        link_user.subscription_source = new_source

        db.commit()
        db.refresh(link_user)

        track_user_login(db, link_user, commit=True)
        tokens = create_tokens(link_user.id, link_user.email)
        user_response = UserResponse.model_validate(link_user)
        user_json = quote(json.dumps(user_response.model_dump(mode="json")))
        redirect_url = (
            f"{FRONTEND_URL}/auth/discord/callback"
            f"?token={tokens['access_token']}"
            f"&refresh_token={tokens['refresh_token']}"
            f"&user={user_json}"
        )
        return RedirectResponse(redirect_url)

    # ─── LOGIN MODE: ga ada link context → flow lama (lookup discord_id / email) ───
    # Find or create user
    user = db.query(User).filter(User.discord_id == discord_id).first()
    is_new_user = False

    if user:
        # User existing — update info
        user.discord_username = discord_username
        if discord_avatar:
            user.avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"

        new_role, new_source = resolve_role_for_discord(user, has_premium_role)
        user.role = new_role
        user.subscription_source = new_source

        db.commit()
        db.refresh(user)
    else:
        username = _generate_username(discord_username, discord_global_name, db)
        email = discord_email or f"dc_{discord_id}@discord.luxquant.tw"

        # Cek email collision
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            # Link Discord ke existing user (BUKAN user baru → no referral apply)
            existing_email.discord_id = discord_id
            existing_email.discord_username = discord_username
            if discord_avatar and not existing_email.avatar_url:
                existing_email.avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"

            new_role, new_source = resolve_role_for_discord(existing_email, has_premium_role)
            existing_email.role = new_role
            existing_email.subscription_source = new_source

            db.commit()
            db.refresh(existing_email)
            user = existing_email
        else:
            # Genuinely new user
            avatar_url = None
            if discord_avatar:
                avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"

            initial_role = 'subscriber' if has_premium_role else 'free'
            initial_source = 'discord_premium' if has_premium_role else None

            user = User(
                email=email,
                username=username,
                password_hash=None,
                auth_provider="discord",
                discord_id=discord_id,
                discord_username=discord_username,
                avatar_url=avatar_url,
                is_active=True,
                is_verified=True,
                role=initial_role,
                subscription_source=initial_source,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new_user = True

    if not user.is_active:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=account_inactive")

    # ─── Apply referral KHUSUS user baru ───
    if is_new_user and referral_code:
        success, msg, _use = apply_referral_to_user(
            db, user, referral_code, commit=True
        )
        if not success:
            logger.info(
                f"Discord referral apply failed for user {user.id} "
                f"with code='{referral_code}': {msg}"
            )
        db.refresh(user)

    # ─── Track login ───
    track_user_login(db, user, commit=True)

    tokens = create_tokens(user.id, user.email)

    user_response = UserResponse.model_validate(user)
    user_json = quote(json.dumps(user_response.model_dump(mode="json")))

    redirect_url = (
        f"{FRONTEND_URL}/auth/discord/callback"
        f"?token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}"
        f"&user={user_json}"
    )
    return RedirectResponse(redirect_url)


# ════════════════════════════════════════════════════════════════════
# 3. Check Discord Role (authenticated user)
# ════════════════════════════════════════════════════════════════════

@router.get("/discord/check-role")
async def check_discord_role(current_user: User = Depends(get_current_user)):
    """Check Premium role for current user's linked Discord account."""
    if not current_user.discord_id:
        return {
            "has_role": False,
            "role": current_user.role,
            "message": "Akun belum terhubung dengan Discord",
        }

    has_role = await _check_guild_role(current_user.discord_id)
    return {
        "has_role": has_role,
        "role": current_user.role,
        "discord_id": current_user.discord_id,
    }


# ════════════════════════════════════════════════════════════════════
# 4. Refresh Discord Role (update DB)
# ════════════════════════════════════════════════════════════════════

@router.post("/discord/refresh-role")
async def refresh_discord_role(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-check Premium role and update via role_resolver."""
    if not current_user.discord_id:
        return {
            "updated": False,
            "role": current_user.role,
            "message": "Akun belum terhubung dengan Discord",
        }

    has_role = await _check_guild_role(current_user.discord_id)

    old_role = current_user.role
    old_source = current_user.subscription_source

    new_role, new_source = resolve_role_for_discord(current_user, has_role)

    if old_role != new_role or old_source != new_source:
        current_user.role = new_role
        current_user.subscription_source = new_source
        db.commit()
        db.refresh(current_user)

    return {
        "updated": old_role != new_role or old_source != new_source,
        "old_role": old_role,
        "new_role": current_user.role,
        "has_role": has_role,
        "is_protected": is_role_protected(current_user, current_provider=PROVIDER_DISCORD),
        "discord_id": current_user.discord_id,
    }


# ════════════════════════════════════════════════════════════════════
# 5. Link Discord to existing account
# ════════════════════════════════════════════════════════════════════

@router.get("/discord/link")
async def link_discord_start(current_user: User = Depends(get_current_user)):
    """Get OAuth2 URL to link Discord to existing account."""
    state = _encode_state(link_user_id=current_user.id)

    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "prompt": "consent",
        "state": state,
    }
    url = f"https://discord.com/oauth2/authorize?{urlencode(params)}"
    return {"url": url}


# ════════════════════════════════════════════════════════════════════
# Helper Functions (HTTP calls)
# ════════════════════════════════════════════════════════════════════

async def _exchange_code(code: str) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{DISCORD_OAUTH_URL}/token",
                data={
                    "client_id": DISCORD_CLIENT_ID,
                    "client_secret": DISCORD_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": DISCORD_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if response.status_code != 200:
                logger.error(f"Discord token exchange failed: {response.status_code} {response.text}")
                return None
            return response.json()
    except Exception as e:
        logger.error(f"Discord token exchange error: {e}")
        return None


async def _get_discord_user(access_token: str) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{DISCORD_API}/users/@me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if response.status_code != 200:
                logger.error(f"Discord user fetch failed: {response.status_code}")
                return None
            return response.json()
    except Exception as e:
        logger.error(f"Discord user fetch error: {e}")
        return None


async def _check_guild_role(discord_user_id: int) -> bool:
    if not DISCORD_BOT_TOKEN:
        logger.warning("DISCORD_BOT_TOKEN not configured, skipping role check")
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{DISCORD_API}/guilds/{DISCORD_GUILD_ID}/members/{discord_user_id}",
                headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
            )

            if response.status_code == 404:
                return False

            if response.status_code != 200:
                logger.error(f"Discord guild member check failed: {response.status_code}")
                return False

            member = response.json()
            roles = member.get("roles", [])

            return DISCORD_PREMIUM_ROLE_ID in roles

    except Exception as e:
        logger.error(f"Discord role check error: {e}")
        return False


def _generate_username(username: str, global_name: str, db: Session) -> str:
    """Generate unique username from Discord data."""
    if username:
        base = re.sub(r"[^a-zA-Z0-9_]", "", username.lower())
    elif global_name:
        base = re.sub(r"[^a-zA-Z0-9]", "_", global_name.lower()).strip("_")
        base = re.sub(r"_+", "_", base)
    else:
        base = "dc_user"

    if len(base) < 3:
        base = base + "_user"

    base = base[:40]

    existing = db.query(User).filter(User.username == base).first()
    if not existing:
        return base

    for _ in range(10):
        suffix = secrets.token_hex(2)
        candidate = f"{base}_{suffix}"[:50]
        if not db.query(User).filter(User.username == candidate).first():
            return candidate

    return f"dc_{secrets.token_hex(4)}"
