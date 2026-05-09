# backend/app/services/role_resolver.py
"""
Cross-OAuth provider role resolver.

Centralized logic biar telegram_auth.py & discord_auth.py ga duplicate code
+ konsisten handle subscription_source rules.

Rules:
  admin              → never touched
  lifetime           → never touched (admin granted, no expiry)
  payment (active)   → never touched (user paid, expires_at NOT expired)
  payment (expired)  → fall through ke OAuth check, role = 'free' kalo no signal
  telegram_vip       → only re-evaluated by Telegram login (other providers respect it)
  discord_premium    → only re-evaluated by Discord login (other providers respect it)
  NULL source        → free user, OAuth signal langsung berlaku
"""
from datetime import datetime, timezone
from typing import Optional

from app.models.user import User


# Source constants
SOURCE_LIFETIME = "lifetime"
SOURCE_ADMIN = "admin"
SOURCE_PAYMENT = "payment"
SOURCE_TELEGRAM_VIP = "telegram_vip"
SOURCE_DISCORD_PREMIUM = "discord_premium"

# Provider constants (passed to is_role_protected)
PROVIDER_TELEGRAM = "telegram"
PROVIDER_DISCORD = "discord"
PROVIDER_GOOGLE = "google"


def _has_unexpired_subscription(user: User) -> bool:
    """True kalau user.subscription_expires_at belum expired (atau NULL = lifetime)"""
    if user.subscription_expires_at is None:
        return True
    return user.subscription_expires_at > datetime.now(timezone.utc)


def is_role_protected(user: User, current_provider: Optional[str] = None) -> bool:
    """
    Check apakah role user PROTECTED dari current OAuth provider check.

    Args:
        user: User object
        current_provider: 'telegram' | 'discord' | 'google' | None

    Returns:
        True  → role TIDAK boleh diubah, keep as-is
        False → role boleh di-evaluate ulang berdasarkan provider signal
    """
    # Admin: selalu protected
    if user.role == "admin":
        return True

    # Free user atau no source: ga ada yang perlu di-protect
    if user.role not in ("subscriber", "premium") or not user.subscription_source:
        return False

    source = user.subscription_source

    # Lifetime: PROTECTED dari semua provider
    if source == SOURCE_LIFETIME:
        return True

    # Admin grant: PROTECTED selama belum expired
    if source == SOURCE_ADMIN:
        return _has_unexpired_subscription(user)

    # Payment: PROTECTED selama belum expired
    if source == SOURCE_PAYMENT:
        return _has_unexpired_subscription(user)

    # Telegram VIP: PROTECTED dari NON-Telegram providers
    # (Telegram login akan re-evaluate VIP membership)
    if source == SOURCE_TELEGRAM_VIP:
        return current_provider != PROVIDER_TELEGRAM

    # Discord Premium: PROTECTED dari NON-Discord providers
    if source == SOURCE_DISCORD_PREMIUM:
        return current_provider != PROVIDER_DISCORD

    # Unknown source — defensive, treat as protected
    return True


def resolve_role_for_telegram(user: User, is_vip_member: bool) -> tuple[str, Optional[str]]:
    """
    Determine final (role, source) untuk user yang baru login via Telegram.

    Returns:
        (role, source) — tuple. Source bisa None kalo role jadi 'free'.
    """
    # Protected? jangan touch
    if is_role_protected(user, current_provider=PROVIDER_TELEGRAM):
        return user.role, user.subscription_source

    # Not protected → evaluate berdasarkan VIP membership
    if is_vip_member:
        return "subscriber", SOURCE_TELEGRAM_VIP

    # No VIP & no other protection → free
    return "free", None


def resolve_role_for_discord(user: User, has_premium_role: bool) -> tuple[str, Optional[str]]:
    """
    Determine final (role, source) untuk user yang baru login via Discord.
    """
    if is_role_protected(user, current_provider=PROVIDER_DISCORD):
        return user.role, user.subscription_source

    if has_premium_role:
        return "subscriber", SOURCE_DISCORD_PREMIUM

    return "free", None


def resolve_role_for_google(user: User) -> tuple[str, Optional[str]]:
    """
    Google OAuth ga punya role signal sendiri (no premium check).
    Cuma respect existing protection.
    """
    if is_role_protected(user, current_provider=PROVIDER_GOOGLE):
        return user.role, user.subscription_source

    # Google ga punya signal, jadi role tetep dari source kalau ada
    # (mis. user lifetime tapi udah expired-payment-source → tetep free)
    return user.role, user.subscription_source
