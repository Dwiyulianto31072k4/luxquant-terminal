"""Move a login identity onto the account the person is using.

They must prove both sides: logged into the target, and they just completed
Google / Discord / Telegram auth for that identity. The better of the two
subscriptions (lifetime / later expiry) lands on the target. Payments and
exchange keys stay on the source row. Staff accounts cannot be stripped.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.redis import cache_get, cache_set, get_redis
from app.models.subscription import Payment
from app.models.user import User

logger = logging.getLogger(__name__)

XFER_TTL = 600


def login_methods(user: User) -> list[str]:
    out: list[str] = []
    if user.telegram_id:
        out.append("telegram")
    if user.discord_id:
        out.append("discord")
    if user.google_id:
        out.append("google")
    if user.password_hash:
        out.append("password")
    return out


def refuse_transfer(source: User) -> str | None:
    staff = getattr(User, "STAFF_ROLES", ("admin", "co_admin", "founder"))
    if source.role in staff:
        return "That login belongs to a staff account. An admin has to move it."
    return None


def _stranded(db: Session, user_id: int):
    try:
        return db.execute(
            text(
                """
            SELECT
              EXISTS (SELECT 1 FROM credit_ledger     WHERE user_id = :uid) AS credits,
              EXISTS (SELECT 1 FROM referral_payouts  WHERE user_id = :uid) AS payouts,
              EXISTS (SELECT 1 FROM cashout_requests  WHERE user_id = :uid) AS cashouts,
              EXISTS (SELECT 1 FROM exchange_accounts WHERE user_id = :uid) AS exchanges,
              EXISTS (SELECT 1 FROM api_keys          WHERE user_id = :uid) AS api_keys
        """
            ),
            {"uid": user_id},
        ).first()
    except Exception:
        return None


def _access_rank(user: User) -> float:
    """Higher is better. 0 = no paid access. inf = lifetime. Staff is not transferable."""
    staff = getattr(User, "STAFF_ROLES", ("admin", "co_admin", "founder"))
    if user.role in staff:
        return 0
    if user.role not in ("subscriber", "premium"):
        return 0
    if not user.has_active_access:
        return 0
    if user.subscription_expires_at is None:
        return float("inf")
    return user.subscription_expires_at.timestamp()


def _access_label(user: User) -> str | None:
    if _access_rank(user) == 0:
        return None
    if user.subscription_expires_at is None:
        src = user.subscription_source or "lifetime"
        return f"lifetime ({src})"
    exp = user.subscription_expires_at.strftime("%Y-%m-%d")
    src = user.subscription_source or "subscription"
    return f"{src} until {exp}"


def align_entitlement(source: User, target: User) -> str | None:
    """Give the target the better subscription. Never copy staff. Never downgrade."""
    staff = getattr(User, "STAFF_ROLES", ("admin", "co_admin", "founder"))
    if target.role in staff:
        return None
    src_rank = _access_rank(source)
    tgt_rank = _access_rank(target)
    copied = None
    if src_rank > tgt_rank:
        target.role = source.role if source.role in ("subscriber", "premium") else "subscriber"
        target.subscription_expires_at = source.subscription_expires_at
        target.subscription_tier = source.subscription_tier
        target.subscription_source = source.subscription_source
        target.subscription_granted_by = source.subscription_granted_by
        target.subscription_granted_at = source.subscription_granted_at
        note = f"Access aligned from account '{source.username}' (id={source.id})."
        target.subscription_note = (
            f"{target.subscription_note}\n{note}" if target.subscription_note else note
        )
        if source.telegram_in_group:
            target.telegram_in_group = True
        if source.telegram_grace_until and (
            not target.telegram_grace_until
            or source.telegram_grace_until > target.telegram_grace_until
        ):
            target.telegram_grace_until = source.telegram_grace_until
        copied = _access_label(target)

    leftover = login_methods(source)
    if not leftover and source.role in ("subscriber", "premium"):
        source.role = "free"
        source.subscription_expires_at = None
        source.subscription_tier = None
        source.subscription_source = None
    return copied


def transfer_warnings(db: Session, source: User, target: User, *, moving: str) -> tuple[list[str], bool]:
    left = [m for m in login_methods(source) if m != moving]
    warnings: list[str] = []
    src_access = _access_label(source)
    tgt_access = _access_label(target)
    if src_access and (not tgt_access or _access_rank(source) > _access_rank(target)):
        warnings.append(f"this account will get their access ({src_access})")
    elif tgt_access:
        warnings.append(f"this account already has access ({tgt_access})")
    if (
        db.query(Payment.id)
        .filter(Payment.user_id == source.id, Payment.status == "confirmed")
        .first()
    ):
        warnings.append("payment receipts stay on the other account")
    stranded = _stranded(db, source.id)
    if stranded:
        if stranded.exchanges:
            warnings.append("exchange keys stay there")
        if stranded.credits or stranded.payouts or stranded.cashouts:
            warnings.append("credits / referral earnings stay there")
        if stranded.api_keys:
            warnings.append("API keys stay there")
    others = [m for m in left if m != "password"]
    if others:
        warnings.append("other logins on that account stay (" + ", ".join(others) + ")")
    return warnings, len(left) == 0


def collision_detail(db: Session, source: User, *, moving: str, target: User | None = None) -> dict:
    refuse = refuse_transfer(source)
    label = moving.title()
    if refuse:
        return {
            "code": f"{moving}_linked_elsewhere_locked",
            "transferable": False,
            "provider": moving,
            "from_username": source.username,
            "from_user_id": source.id,
            "message": refuse,
        }
    warnings, lose = transfer_warnings(db, source, target or source, moving=moving)
    lines = [
        f"This {label} is already connected to '{source.username}'.",
        f"Move the {label} login to the account you are on now?",
        "",
        f"Moves: {label} sign-in, plus the better subscription / access of the two.",
        "Does not move: payment receipts, exchange keys, referral credit.",
    ]
    if warnings:
        lines.append("Note: " + "; ".join(warnings) + ".")
    if lose:
        lines.append(
            f"After this, '{source.username}' will have no way to sign in."
        )
    return {
        "code": f"{moving}_linked_elsewhere",
        "transferable": True,
        "provider": moving,
        "from_username": source.username,
        "from_user_id": source.id,
        "warnings": warnings,
        "source_will_lose_login": lose,
        "message": "\n".join(lines),
    }


def _note(source: User, target: User, what: str, actor: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    src_note = (
        f"[{stamp}] {what} dipindahkan ke akun '{target.username}' "
        f"(id={target.id}) {actor}."
    )
    dst_note = (
        f"[{stamp}] {what} dipindahkan dari akun '{source.username}' "
        f"(id={source.id}) {actor}."
    )
    source.admin_notes = f"{source.admin_notes}\n{src_note}" if source.admin_notes else src_note
    target.admin_notes = f"{target.admin_notes}\n{dst_note}" if target.admin_notes else dst_note


def apply_discord_transfer(
    db: Session,
    *,
    source: User,
    target: User,
    discord_id: int,
    discord_username: str | None,
    actor: str,
) -> None:
    if source.discord_id != discord_id:
        raise ValueError("Source no longer holds that Discord")
    _note(source, target, f"Discord @{discord_username} ({discord_id})", actor)
    source.discord_id = None
    source.discord_username = None
    if source.auth_provider == "discord":
        source.auth_provider = "local"
    db.flush()
    target.discord_id = discord_id
    target.discord_username = discord_username
    align_entitlement(source, target)
    logger.warning(
        "identity_transfer discord_id=%s from=%s(%s) to=%s(%s)",
        discord_id,
        source.username,
        source.id,
        target.username,
        target.id,
    )


def apply_google_transfer(
    db: Session,
    *,
    source: User,
    target: User,
    google_id: str,
    google_email: str | None,
    actor: str,
) -> None:
    if source.google_id != google_id:
        raise ValueError("Source no longer holds that Google")
    _note(source, target, f"Google ({google_email or google_id})", actor)
    source.google_id = None
    if source.auth_provider == "google":
        source.auth_provider = "local"
    db.flush()
    target.google_id = google_id
    align_entitlement(source, target)
    logger.warning(
        "identity_transfer google_id=%s from=%s(%s) to=%s(%s)",
        google_id,
        source.username,
        source.id,
        target.username,
        target.id,
    )


def apply_telegram_transfer(
    db: Session,
    *,
    source: User,
    target: User,
    telegram_id: int,
    telegram_username: str | None,
    actor: str,
) -> None:
    if source.telegram_id != telegram_id:
        raise ValueError("Source no longer holds that Telegram")
    _note(source, target, f"Telegram @{telegram_username} ({telegram_id})", actor)
    source.telegram_id = None
    source.telegram_username = None
    if source.auth_provider == "telegram":
        source.auth_provider = "local"
    db.flush()
    target.telegram_id = telegram_id
    target.telegram_username = telegram_username
    align_entitlement(source, target)
    logger.warning(
        "identity_transfer telegram_id=%s from=%s(%s) to=%s(%s)",
        telegram_id,
        source.username,
        source.id,
        target.username,
        target.id,
    )


def stash_discord_transfer(target_id: int, payload: dict) -> None:
    cache_set(f"lq:discord_xfer:{target_id}", payload, ttl=XFER_TTL)


def peek_discord_transfer(target_id: int) -> dict | None:
    data = cache_get(f"lq:discord_xfer:{target_id}")
    return data if isinstance(data, dict) else None


def pop_discord_transfer(target_id: int) -> dict | None:
    key = f"lq:discord_xfer:{target_id}"
    data = cache_get(key)
    try:
        get_redis().delete(key)
    except Exception:
        pass
    return data if isinstance(data, dict) else None
