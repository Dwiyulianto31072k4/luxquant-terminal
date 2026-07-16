# backend/app/services/role_resolver.py
"""
Cross-OAuth provider role resolver.

Centralized logic biar telegram_auth.py & discord_auth.py ga duplicate code
+ konsisten handle subscription_source rules.

INVARIANT (v3 — sticky grant):
  Pencabutan akses VIP HANYA boleh terjadi lewat 2 jalur:
    1. Admin revoke (eksplisit, revoke_subscription)
    2. Expiry worker (subscription_expires_at lewat — time-bound: payment/admin)
  Pengecekan OAuth (telegram/discord/google) bersifat PROMOTE-ONLY:
  boleh menaikkan/menegaskan akses, TIDAK PERNAH menurunkan ke free.

Rules:
  admin              → never touched
  lifetime           → never touched (admin granted, no expiry)
  legacy             → never touched (member lama pre-webapp, no expiry)
  payment (active)   → never touched (user paid, expires_at NOT expired)
  payment (expired)  → dibiarkan apa adanya di sini; downgrade-nya tugas worker
  telegram_vip       → di-refresh oleh Telegram login; TIDAK di-downgrade
  discord_premium    → di-refresh oleh Discord login; TIDAK di-downgrade
  NULL source        → kalau sudah subscriber/premium, tetap dipertahankan
                       (promote-only); kalau free, OAuth signal langsung berlaku
"""
from datetime import datetime, timezone
from typing import Optional

from app.models.user import User


# Source constants
SOURCE_LIFETIME = "lifetime"
SOURCE_LEGACY = "legacy"
SOURCE_ADMIN = "admin"
SOURCE_PAYMENT = "payment"
SOURCE_TELEGRAM_VIP = "telegram_vip"
SOURCE_DISCORD_PREMIUM = "discord_premium"

# Provider constants (passed to is_role_protected)
PROVIDER_TELEGRAM = "telegram"
PROVIDER_DISCORD = "discord"
PROVIDER_GOOGLE = "google"

# Role yang dianggap "punya akses VIP" (untuk guard promote-only).
ACCESS_ROLES = ("subscriber", "premium")


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
                (tapi ingat: resolver tetap PROMOTE-ONLY, gak akan downgrade)
    """
    # Staff (admin / co_admin / founder): selalu protected dari OAuth re-resolve
    if user.role in getattr(User, "STAFF_ROLES", ("admin", "co_admin", "founder")):
        return True

    # Free user atau no source: ga ada yang perlu di-protect
    if user.role not in ACCESS_ROLES or not user.subscription_source:
        return False

    source = user.subscription_source

    # Lifetime: PROTECTED dari semua provider
    if source == SOURCE_LIFETIME:
        return True

    # Legacy (member lama pre-webapp): PROTECTED dari semua provider, lifetime
    if source == SOURCE_LEGACY:
        return True

    # Admin grant: PROTECTED selama belum expired
    if source == SOURCE_ADMIN:
        return _has_unexpired_subscription(user)

    # Payment: PROTECTED selama belum expired
    if source == SOURCE_PAYMENT:
        return _has_unexpired_subscription(user)

    # Telegram VIP: PROTECTED dari NON-Telegram providers
    # (Telegram login boleh re-affirm membership; tapi resolver promote-only,
    #  jadi walau "not protected" dari Telegram, tetap ga akan di-downgrade)
    if source == SOURCE_TELEGRAM_VIP:
        return current_provider != PROVIDER_TELEGRAM

    # Discord Premium: PROTECTED dari NON-Discord providers
    if source == SOURCE_DISCORD_PREMIUM:
        return current_provider != PROVIDER_DISCORD

    # Unknown source — defensive, treat as protected
    return True


def _keep(user: User) -> tuple[str, Optional[str]]:
    """Pertahankan role & source user apa adanya."""
    return user.role, user.subscription_source


def resolve_role_for_telegram(
    user: User,
    is_vip_member: bool,
    is_legacy: bool = False,
) -> tuple[str, Optional[str]]:
    """
    Determine final (role, source) untuk user yang login/link via Telegram.

    PROMOTE-ONLY: fungsi ini tidak akan pernah menurunkan akses ke 'free'.
    Pencabutan akses hanya lewat admin revoke atau expiry worker.

    Args:
        user: User object
        is_vip_member: apakah user saat ini ada di VIP group
        is_legacy: apakah telegram_id ada di snapshot legacy_members (lifetime)

    Returns:
        (role, source) — tuple. Source bisa None hanya kalau user genuinely free.
    """
    # Protected (admin / lifetime / legacy / payment aktif / cross-provider) → keep.
    if is_role_protected(user, current_provider=PROVIDER_TELEGRAM):
        return _keep(user)

    # Legacy member (pre-webapp) → PROMOTE ke lifetime. Menang atas VIP biasa.
    if is_legacy:
        return "premium", SOURCE_LEGACY

    # Masih di group → (re)affirm telegram_vip.
    if is_vip_member:
        return "subscriber", SOURCE_TELEGRAM_VIP

    # ── PROMOTE-ONLY GUARD ──
    # Sampai sini: user TIDAK di group & TIDAK protected. JANGAN downgrade.
    # Kalau dia sudah punya akses VIP (telegram_vip sesi lalu, atau subscriber
    # warisan source-NULL), pertahankan. Pencabutan = revoke / expiry saja.
    if user.role in ACCESS_ROLES:
        return _keep(user)

    # Genuinely free, tidak ada sinyal apa pun.
    return "free", None


def resolve_role_for_discord(user: User, has_premium_role: bool) -> tuple[str, Optional[str]]:
    """
    Determine final (role, source) untuk user yang login/link via Discord.

    PROMOTE-ONLY: tidak pernah menurunkan akses ke 'free'.
    """
    if is_role_protected(user, current_provider=PROVIDER_DISCORD):
        return _keep(user)

    if has_premium_role:
        return "subscriber", SOURCE_DISCORD_PREMIUM

    # PROMOTE-ONLY GUARD — jangan downgrade user yang sudah punya akses.
    if user.role in ACCESS_ROLES:
        return _keep(user)

    return "free", None


def resolve_role_for_google(user: User) -> tuple[str, Optional[str]]:
    """
    Google OAuth ga punya role signal sendiri (no premium check).
    Sudah non-destruktif by design: cuma respect state yang ada.
    """
    if is_role_protected(user, current_provider=PROVIDER_GOOGLE):
        return _keep(user)

    # Google ga punya signal apa pun → pertahankan role/source apa adanya.
    # (Promote-only otomatis terpenuhi: tidak ada cabang yang men-set 'free'.)
    return _keep(user)
