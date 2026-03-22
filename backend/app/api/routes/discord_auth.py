# backend/app/api/routes/discord_auth.py
"""
Discord OAuth2 Login + Role Verification

Flow:
1. Frontend calls GET /auth/discord/url → gets Discord OAuth2 URL
2. User authorizes on Discord → redirects to /auth/discord/callback?code=xxx
3. Backend exchanges code for access_token
4. Backend fetches user info + checks Premium+ role via Bot API
5. Set role based on role membership: subscriber / free
6. Redirect to frontend with JWT tokens
"""
import os
import re
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_tokens
from app.models.user import User
from app.schemas.user import UserResponse, TokenResponse

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

# Scopes: identify (user info) + guilds.members.read (role check)
SCOPES = "identify guilds.members.read"


# ════════════════════════════════════════════
# 1. Get Discord OAuth2 URL
# ════════════════════════════════════════════

@router.get("/discord/url")
async def get_discord_auth_url():
    """Return Discord OAuth2 authorization URL for frontend redirect."""
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "prompt": "consent",
    }
    url = f"https://discord.com/oauth2/authorize?{urlencode(params)}"
    return {"url": url}


# ════════════════════════════════════════════
# 2. Discord OAuth2 Callback
# ════════════════════════════════════════════

@router.get("/discord/callback")
async def discord_callback(code: str, db: Session = Depends(get_db)):
    """
    Discord redirects here with ?code=xxx.
    Exchange code → token → user info → check role → create/login user → redirect to frontend.
    """

    # Step 1: Exchange code for access_token
    token_data = await _exchange_code(code)
    if not token_data:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=discord_token_failed")

    access_token = token_data["access_token"]

    # Step 2: Fetch Discord user info
    discord_user = await _get_discord_user(access_token)
    if not discord_user:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=discord_user_failed")

    discord_id = int(discord_user["id"])
    discord_username = discord_user.get("username", "")
    discord_global_name = discord_user.get("global_name") or discord_username
    discord_avatar = discord_user.get("avatar")
    discord_email = discord_user.get("email")  # might be None if no email scope

    # Step 3: Check Premium+ role via Bot API
    has_premium_role = await _check_guild_role(discord_id)
    target_role = "subscriber" if has_premium_role else "free"

    # Step 4: Find or create user
    user = db.query(User).filter(User.discord_id == discord_id).first()

    if user:
        # Update info
        user.discord_username = discord_username
        if discord_avatar:
            avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"
            user.avatar_url = avatar_url
        if user.role != "admin":
            user.role = target_role
        db.commit()
        db.refresh(user)
    else:
        # Generate username
        username = _generate_username(discord_username, discord_global_name, db)

        # Email: use Discord email or placeholder
        email = discord_email or f"dc_{discord_id}@discord.luxquant.tw"

        # Check email collision
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            # Link Discord to existing user
            existing_email.discord_id = discord_id
            existing_email.discord_username = discord_username
            if discord_avatar and not existing_email.avatar_url:
                existing_email.avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"
            if existing_email.role != "admin":
                existing_email.role = target_role
            db.commit()
            db.refresh(existing_email)
            user = existing_email
        else:
            avatar_url = None
            if discord_avatar:
                avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png?size=256"

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
                role=target_role,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user.is_active:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=account_inactive")

    # Step 5: Generate JWT tokens
    tokens = create_tokens(user.id, user.email)

    # Step 6: Redirect to frontend with tokens
    user_response = UserResponse.model_validate(user)
    import json
    from urllib.parse import quote

    user_json = quote(json.dumps(user_response.model_dump(mode="json")))

    redirect_url = (
        f"{FRONTEND_URL}/auth/discord/callback"
        f"?token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}"
        f"&user={user_json}"
    )
    return RedirectResponse(redirect_url)


# ════════════════════════════════════════════
# 3. Check Discord Role (authenticated user)
# ════════════════════════════════════════════

@router.get("/discord/check-role")
async def check_discord_role(current_user: User = Depends(__import__('app.api.deps', fromlist=['get_current_user']).get_current_user)):
    """Check Premium+ role for current user's linked Discord account."""
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


# ════════════════════════════════════════════
# 4. Refresh Discord Role (update DB)
# ════════════════════════════════════════════

@router.post("/discord/refresh-role")
async def refresh_discord_role(
    current_user: User = Depends(__import__('app.api.deps', fromlist=['get_current_user']).get_current_user),
    db: Session = Depends(get_db),
):
    """Re-check Premium+ role and update role in DB."""
    if not current_user.discord_id:
        return {
            "updated": False,
            "role": current_user.role,
            "message": "Akun belum terhubung dengan Discord",
        }

    has_role = await _check_guild_role(current_user.discord_id)
    new_role = "subscriber" if has_role else "free"

    old_role = current_user.role
    if current_user.role != "admin":
        current_user.role = new_role
        db.commit()
        db.refresh(current_user)

    return {
        "updated": old_role != new_role,
        "old_role": old_role,
        "new_role": current_user.role,
        "has_role": has_role,
        "discord_id": current_user.discord_id,
    }


# ════════════════════════════════════════════
# 5. Link Discord to existing account
# ════════════════════════════════════════════

@router.get("/discord/link")
async def link_discord_start(current_user: User = Depends(__import__('app.api.deps', fromlist=['get_current_user']).get_current_user)):
    """Get OAuth2 URL to link Discord to existing account."""
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "prompt": "consent",
        "state": f"link_{current_user.id}",
    }
    url = f"https://discord.com/oauth2/authorize?{urlencode(params)}"
    return {"url": url}


# ════════════════════════════════════════════
# Helper Functions
# ════════════════════════════════════════════


async def _exchange_code(code: str) -> dict | None:
    """Exchange authorization code for access token."""
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
                print(f"Discord token exchange failed: {response.status_code} {response.text}")
                return None
            return response.json()
    except Exception as e:
        print(f"Discord token exchange error: {e}")
        return None


async def _get_discord_user(access_token: str) -> dict | None:
    """Fetch Discord user info using OAuth2 access token."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{DISCORD_API}/users/@me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if response.status_code != 200:
                print(f"Discord user fetch failed: {response.status_code}")
                return None
            return response.json()
    except Exception as e:
        print(f"Discord user fetch error: {e}")
        return None


async def _check_guild_role(discord_user_id: int) -> bool:
    """
    Check if user has Premium+ role in the guild.
    Uses Bot token (not user OAuth token) for reliable access.
    """
    if not DISCORD_BOT_TOKEN:
        print("DISCORD_BOT_TOKEN not configured, skipping role check")
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{DISCORD_API}/guilds/{DISCORD_GUILD_ID}/members/{discord_user_id}",
                headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
            )

            if response.status_code == 404:
                # User not in guild
                return False

            if response.status_code != 200:
                print(f"Discord guild member check failed: {response.status_code}")
                return False

            member = response.json()
            roles = member.get("roles", [])

            return DISCORD_PREMIUM_ROLE_ID in roles

    except Exception as e:
        print(f"Discord role check error: {e}")
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