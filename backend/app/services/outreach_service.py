# backend/app/services/outreach_service.py
"""
Outreach service — message templates + deep link builders for admin
follow-up workflow (Layer Admin Outreach).

Channels supported:
  - telegram   : https://t.me/{username}  (requires @username)
  - discord    : https://discord.com/users/{discord_id}  (requires id)
  - email      : mailto:{email}  (requires non-placeholder email)
  - generic    : copy-only, no channel (fallback when nothing reachable)

Templates use Python str.format() with named placeholders. Available
placeholders (resolved from user object):
  {username}            user.username
  {role}                user.role (e.g. 'free', 'subscriber')
  {plan_name}           current plan label if subscriber
  {expires_at}          subscription_expires_at, formatted human-readable
  {expires_in_days}     days until expiry (or '∞' for lifetime)
  {first_login}         first_login_at, human-readable
  {last_login}          last_login_at, human-readable
  {referrer_username}   if user was referred, the referrer's username

Missing placeholders render as '—' instead of failing.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import logging

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.referral import ReferralUse

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════
# Templates
# ════════════════════════════════════════════════════════════════════

# Template structure:
#   id          unique key
#   label       display name in admin UI
#   description short helper text
#   channels    which channels this template targets (filters channel buttons)
#   body        Python format string
#   subject     for email channel only (optional)
#
# Tone: warm, professional English — friendly, concise, and conversion-minded.

TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "welcome_subscriber",
        "label": "Welcome Subscriber",
        "description": "Greet a new subscriber and share a quick start",
        "channels": ["telegram", "discord", "email"],
        "subject": "Welcome to LuxQuant Premium 🎉",
        "body": (
            "Hi {username},\n\n"
            "Welcome to LuxQuant Premium 🎉 Your subscription is active"
            " until {expires_at}.\n\n"
            "Here's what you can access right now:\n"
            "• Real-time trading signals\n"
            "• AI Arena verdicts, 4x a day\n"
            "• Top performers & coin intelligence\n"
            "• Auto-trade integration\n\n"
            "Just reply to this message if you have any questions.\n\n"
            "Happy trading!"
        ),
    },
    {
        "id": "renewal_reminder",
        "label": "Renewal Reminder",
        "description": "Reminder ~7 days before expiry",
        "channels": ["telegram", "discord", "email"],
        "subject": "Your LuxQuant subscription expires in {expires_in_days} days",
        "body": (
            "Hi {username},\n\n"
            "Your LuxQuant subscription expires in {expires_in_days} days"
            " ({expires_at}).\n\n"
            "To renew, log in at luxquant.tw → Pricing → pick a plan. Or"
            " just reply here and we'll activate it for you directly.\n\n"
            "Thanks!"
        ),
    },
    {
        "id": "expired_winback",
        "label": "Expired — Win Back",
        "description": "Win back a recently expired subscriber",
        "channels": ["telegram", "discord", "email"],
        "subject": "Come back to LuxQuant?",
        "body": (
            "Hi {username},\n\n"
            "Your LuxQuant subscription has expired. Missing the signals"
            " & AI Arena? 😊\n\n"
            "Renew now and your access is back within minutes:\n"
            "luxquant.tw/pricing\n\n"
            "And if there's a reason you haven't renewed yet, let us know"
            " — we're always looking to improve."
        ),
    },
    {
        "id": "reengage_dormant",
        "label": "Re-engage Dormant",
        "description": "Free user who hasn't logged in for a while",
        "channels": ["telegram", "discord", "email"],
        "subject": "What's new at LuxQuant 👀",
        "body": (
            "Hi {username},\n\n"
            "It's been a while since your last visit. Here's what's new"
            " since then:\n\n"
            "• AI Arena v6 — 3-stage AI pipeline (verdicts 4x a day)\n"
            "• Coin Intelligence — per-pair analytics\n"
            "• Auto-trade integration (Binance/Bybit/OKX/Bitget/MEXC)\n\n"
            "Log back in: luxquant.tw\n\n"
            "Anything we can help with? Just reply to this message."
        ),
    },
    {
        "id": "connect_telegram",
        "label": "Connect Telegram",
        "description": "Paid user who hasn't linked Telegram yet",
        "channels": ["telegram", "discord", "email"],
        "subject": "One step left to unlock your VIP signal group",
        "body": (
            "Hi {username},\n\n"
            "Your LuxQuant subscription is active — there's just one quick"
            " step left to join the VIP signal group on Telegram:\n\n"
            "1. Open Profile → Settings → Connected Accounts\n"
            "2. Link your Telegram account\n"
            "3. Click \"Join VIP Group\"\n\n"
            "That's it. Reply here if you get stuck and we'll walk you"
            " through it."
        ),
    },
    {
        "id": "vip_lifetime_thanks",
        "label": "VIP Lifetime — Thanks",
        "description": "Thank a lifetime Telegram/Discord VIP",
        "channels": ["telegram", "discord"],
        "body": (
            "Hi {username},\n\n"
            "Thanks for being a VIP member 🙏 Your LuxQuant Premium access"
            " stays active for as long as you're in the VIP group.\n\n"
            "Got feedback, a feature request, or a bug? Let us know anytime"
            " — we're always listening."
        ),
    },
    {
        "id": "custom",
        "label": "Custom Message",
        "description": "Compose a custom message (write your own)",
        "channels": ["telegram", "discord", "email", "generic"],
        "body": "",  # filled by custom_message at render time
    },
]


def list_templates() -> List[Dict[str, Any]]:
    """Return all available templates (for admin UI picker)."""
    return [
        {
            "id": t["id"],
            "label": t["label"],
            "description": t["description"],
            "channels": t["channels"],
            "has_subject": bool(t.get("subject")),
        }
        for t in TEMPLATES
    ]


def _get_template(template_id: str) -> Optional[Dict[str, Any]]:
    return next((t for t in TEMPLATES if t["id"] == template_id), None)


# ════════════════════════════════════════════════════════════════════
# Placeholder resolution
# ════════════════════════════════════════════════════════════════════

class _SafeDict(dict):
    """Dict that returns '—' for missing keys instead of raising KeyError."""

    def __missing__(self, key):
        return "—"


def _format_human_date(dt: Optional[datetime]) -> str:
    if dt is None:
        return "—"
    try:
        return dt.strftime("%d %b %Y")
    except Exception:
        return "—"


def _days_until(dt: Optional[datetime]) -> str:
    if dt is None:
        return "∞"
    try:
        delta = dt - datetime.now(timezone.utc)
        days = delta.days
        if days < 0:
            return "0 (expired)"
        return str(days)
    except Exception:
        return "—"


def _build_placeholders(user: User, db: Session) -> Dict[str, str]:
    """Resolve all placeholder values for a user."""
    # Lookup referrer if applicable
    referrer_username = "—"
    if user.referred_by:
        ref = db.query(User).filter(User.id == user.referred_by).first()
        if ref:
            referrer_username = ref.username

    # Plan name approximation — from subscription_note or generic
    plan_name = user.subscription_note or (
        "Lifetime" if user.role == "subscriber" and user.subscription_expires_at is None
        else "Premium"
    )

    return {
        "username": user.username or "—",
        "role": user.role or "free",
        "plan_name": plan_name,
        "expires_at": _format_human_date(user.subscription_expires_at),
        "expires_in_days": _days_until(user.subscription_expires_at),
        "first_login": _format_human_date(getattr(user, "first_login_at", None)),
        "last_login": _format_human_date(getattr(user, "last_login_at", None)),
        "referrer_username": referrer_username,
    }


# ════════════════════════════════════════════════════════════════════
# Deep link builders
# ════════════════════════════════════════════════════════════════════

def _telegram_deep_link(user: User) -> Optional[str]:
    """Build https://t.me/{username} if reachable."""
    username = None
    if user.telegram_username:
        username = user.telegram_username.strip().lstrip("@")
    elif user.admin_telegram_username:
        username = user.admin_telegram_username.strip().lstrip("@")
    if not username:
        return None
    return f"https://t.me/{username}"


def _discord_deep_link(user: User) -> Optional[str]:
    """Build https://discord.com/users/{id} if reachable."""
    # admin override can be either numeric id or handle
    if user.admin_discord_handle:
        handle = user.admin_discord_handle.strip()
        # If it's all digits, treat as user id
        if handle.isdigit():
            return f"https://discord.com/users/{handle}"
        # else: best-effort — Discord has no universal "by-handle" deep link
        # → return None, fall back to copy
        return None
    if user.discord_id:
        return f"https://discord.com/users/{user.discord_id}"
    return None


def _email_deep_link(user: User) -> Optional[str]:
    """Build mailto:{email} if email is real (not placeholder)."""
    if not user.email:
        return None
    placeholder_domains = ("@telegram.luxquant.tw", "@discord.luxquant.tw")
    if any(user.email.endswith(d) for d in placeholder_domains):
        return None
    return f"mailto:{user.email}"


# ════════════════════════════════════════════════════════════════════
# Render
# ════════════════════════════════════════════════════════════════════

def render_template(
    template_id: str,
    user: User,
    db: Session,
    channel: Optional[str] = None,
    custom_message: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Render a template for a specific user + channel.

    If `channel` is None, auto-pick best available:
      1. telegram (if reachable)
      2. discord (if reachable)
      3. email (if real email)
      4. generic (copy-only)

    Returns:
        {
          "template_id": str,
          "channel": str,
          "subject": str | None,
          "body": str,
          "deep_link": str | None,
          "fallback_link": str | None,
          "can_send": bool,
        }
    """
    tmpl = _get_template(template_id)
    if not tmpl:
        raise ValueError(f"Unknown template_id: {template_id}")

    # Resolve placeholders
    placeholders = _SafeDict(_build_placeholders(user, db))

    # Body
    if template_id == "custom":
        raw_body = custom_message or ""
    else:
        raw_body = tmpl.get("body", "")

    try:
        body = raw_body.format_map(placeholders)
    except Exception as e:
        logger.warning(f"Template render error for {template_id}: {e}")
        body = raw_body  # fallback to raw

    # Subject (email only)
    subject = None
    if tmpl.get("subject"):
        try:
            subject = tmpl["subject"].format_map(placeholders)
        except Exception:
            subject = tmpl["subject"]

    # Resolve channel — explicit > auto-pick
    tg_link = _telegram_deep_link(user)
    dc_link = _discord_deep_link(user)
    em_link = _email_deep_link(user)

    if channel is None:
        if tg_link:
            channel = "telegram"
        elif dc_link:
            channel = "discord"
        elif em_link:
            channel = "email"
        else:
            channel = "generic"

    # Build deep link for chosen channel
    deep_link = None
    fallback_link = None
    can_send = True

    if channel == "telegram":
        deep_link = tg_link
        if not deep_link:
            can_send = False
            # Fallback to copy
    elif channel == "discord":
        deep_link = dc_link
        if not deep_link:
            can_send = False
    elif channel == "email":
        deep_link = em_link
        if not deep_link:
            can_send = False
    elif channel == "generic":
        can_send = False  # copy-only mode

    return {
        "template_id": template_id,
        "channel": channel,
        "subject": subject,
        "body": body,
        "deep_link": deep_link,
        "fallback_link": fallback_link,
        "can_send": can_send,
    }


# ════════════════════════════════════════════════════════════════════
# Reach summary (used in user detail card)
# ════════════════════════════════════════════════════════════════════

def get_reach_summary(user: User) -> Dict[str, Any]:
    """
    Return which channels are available for outreach + which source
    (admin override vs oauth).
    """
    # Telegram
    tg_source = None
    tg_value = None
    if user.telegram_username:
        tg_source = "oauth"
        tg_value = user.telegram_username.strip().lstrip("@")
    elif user.admin_telegram_username:
        tg_source = "admin"
        tg_value = user.admin_telegram_username.strip().lstrip("@")

    # Discord
    dc_source = None
    dc_value = None
    if user.admin_discord_handle:
        dc_source = "admin"
        dc_value = user.admin_discord_handle.strip()
    elif user.discord_id:
        dc_source = "oauth"
        dc_value = str(user.discord_id)

    # Email
    em_source = None
    em_value = None
    if user.email:
        placeholder_domains = ("@telegram.luxquant.tw", "@discord.luxquant.tw")
        if not any(user.email.endswith(d) for d in placeholder_domains):
            em_source = "oauth"
            em_value = user.email

    return {
        "telegram": {
            "available": tg_value is not None,
            "source": tg_source,
            "value": tg_value,
            "deep_link": _telegram_deep_link(user),
        },
        "discord": {
            "available": dc_value is not None,
            "source": dc_source,
            "value": dc_value,
            "deep_link": _discord_deep_link(user),
        },
        "email": {
            "available": em_value is not None,
            "source": em_source,
            "value": em_value,
            "deep_link": _email_deep_link(user),
        },
    }
