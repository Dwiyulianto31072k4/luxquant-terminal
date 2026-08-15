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
import json
import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

import httpx

_TG_PROXY = os.getenv("TELEGRAM_PROXY") or None
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.avatar_storage import is_uploaded_avatar
from app.core.security import create_cryptobot_exchange_token, create_tokens
from app.models.user import User
from app.models.legacy_member import LegacyMember
from app.schemas.user import (
    AcqPayload,
    TelegramLogin,
    UserResponse,
    TokenResponse,
)
from app.api.deps import get_current_user
from app.services.referral_helpers import (
    apply_referral_to_user,
    track_user_login,
)
from app.services.acq_helpers import apply_acq_to_user
from app.services.geo_helpers import location_from_request
from app.services.role_resolver import (
    resolve_role_for_telegram,
    is_role_protected,
    SOURCE_LEGACY,
    PROVIDER_TELEGRAM,
)
from app.services.telegram_group import create_one_time_invite_link
from app.services.telegram_attribution import acq_from_telegram_start_param
from app.services.telegram_bot_onboarding import (
    command_from_text,
    reply_for_command,
    webhook_secret,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Telegram Auth"])

# -- Config --
TELEGRAM_BOT_TOKEN = os.getenv(
    "TELEGRAM_BOT_TOKEN",
    "",
)
VIP_GROUP_CHAT_ID = int(os.getenv("VIP_GROUP_CHAT_ID", "-1002670915863"))
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Berapa lama invite link valid (detik). Default 1 jam.
INVITE_LINK_TTL = int(os.getenv("VIP_INVITE_LINK_TTL", "3600"))
TELEGRAM_MINI_APP_URL = os.getenv("TELEGRAM_MINI_APP_URL", "https://luxquant.tw/")
TELEGRAM_PERFORMANCE_URL = os.getenv(
    "TELEGRAM_PERFORMANCE_URL",
    "https://t.me/LuxQuantTerminalBot/terminal?startapp=lq1c_bot_performance",
)
TELEGRAM_SUPPORT_URL = os.getenv("TELEGRAM_SUPPORT_URL", "https://t.me/luxquantadmin")


def _bot_reply_markup(command: str) -> dict:
    rows = [
        [
            {
                "text": "Open LuxQuant Terminal",
                "web_app": {"url": TELEGRAM_MINI_APP_URL},
            }
        ],
        [{"text": "View Performance", "url": TELEGRAM_PERFORMANCE_URL}],
    ]
    if command == "help":
        rows.append([{"text": "Contact Support", "url": TELEGRAM_SUPPORT_URL}])
    return {"inline_keyboard": rows}


async def _send_terminal_bot_message(chat_id: int, command: str) -> None:
    if not TELEGRAM_BOT_TOKEN:
        logger.error("Terminal Bot reply skipped: TELEGRAM_BOT_TOKEN is not configured")
        return
    payload = {
        "chat_id": chat_id,
        "text": reply_for_command(command),
        "reply_markup": _bot_reply_markup(command),
        "disable_web_page_preview": True,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0, proxy=_TG_PROXY) as client:
            response = await client.post(f"{TELEGRAM_API}/sendMessage", json=payload)
            if response.status_code != 200 or not response.json().get("ok"):
                logger.warning(
                    "Terminal Bot sendMessage failed: status=%s body=%s",
                    response.status_code,
                    response.text[:200],
                )
    except Exception:
        logger.exception("Terminal Bot sendMessage request failed")


@router.post("/telegram/bot/webhook", include_in_schema=False)
async def telegram_bot_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Welcome real bot conversations and expose the Mini App front door.

    Telegram sends a secret header configured by the deployment script.  Old
    queued messages are acknowledged without a reply so enabling the webhook
    cannot produce a historical message storm.
    """
    expected_secret = webhook_secret(TELEGRAM_BOT_TOKEN)
    supplied_secret = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not expected_secret or not hmac.compare_digest(expected_secret, supplied_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    try:
        update = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid update")

    message = update.get("message") if isinstance(update, dict) else None
    if not isinstance(message, dict):
        return {"ok": True, "handled": False}

    message_date = int(message.get("date") or 0)
    if not message_date or time.time() - message_date > 300:
        return {"ok": True, "handled": False, "reason": "stale"}

    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    chat_id = chat.get("id")
    if chat.get("type") != "private" or not isinstance(chat_id, int):
        return {"ok": True, "handled": False, "reason": "not_private"}

    command = command_from_text(message.get("text"))
    if command not in {"start", "terminal", "performance", "help"}:
        command = "help"

    sender_id = sender.get("id")
    if command == "start" and isinstance(sender_id, int):
        user = db.query(User).filter(User.telegram_id == sender_id).first()
        if user is not None and not user.telegram_bot_started_at:
            user.telegram_bot_started_at = datetime.now(timezone.utc)
            try:
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Could not record Terminal Bot start for user_id=%s", user.id)

    await _send_terminal_bot_message(chat_id, command)
    return {"ok": True, "handled": True, "command": command}


# ====================================================================
# 1. Telegram Login
# ====================================================================

@router.post("/telegram", response_model=TokenResponse)
async def telegram_login(
    data: TelegramLogin,
    request: Request,
    db: Session = Depends(get_db),
):
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

    # Everything past authentication is shared with the Mini App entry point
    # (/telegram/webapp). It is the same account: same VIP resolution, same
    # legacy claim, same referral and first-touch acquisition. Two copies of
    # this would drift, and the drift would be silent — one door granting a
    # role the other does not.
    return await _issue_telegram_session(data, request, db)




async def _issue_telegram_session(
    data: TelegramLogin,
    request: Request,
    db: Session,
) -> TokenResponse:
    """Find-or-create the account and issue tokens. AUTHENTICATION IS THE
    CALLER'S JOB — by the time this runs, the caller must already have proved
    the payload came from Telegram (widget HMAC, or Mini App initData).

    `data.hash` is deliberately not read here; the two entry points sign with
    different schemes and neither signature means anything at this point.
    """
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
        # Refresh foto Telegram, tapi jangan timpa avatar upload-an user sendiri
        if data.photo_url and not is_uploaded_avatar(user.avatar_url):
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
            if data.photo_url and not is_uploaded_avatar(existing_email.avatar_url):
                existing_email.avatar_url = data.photo_url

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

    # --- First-touch acquisition (UTM) — new users, or empty acq on existing ---
    if getattr(data, "acq", None) is not None:
        apply_acq_to_user(
            db, user, data.acq.model_dump() if hasattr(data.acq, "model_dump") else data.acq,
            commit=True,
        )

    # --- Track login + geo ---
    track_user_login(db, user, commit=True, **location_from_request(request))

    tokens = create_tokens(user.id, user.email)

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user),
        cryptobot_token=create_cryptobot_exchange_token(user),
        is_new_user=is_new_user,
    )


# ====================================================================
# 1b. Telegram Mini App login (initData)
# ====================================================================

class TelegramWebAppLogin(BaseModel):
    """Raw initData string exactly as Telegram handed it to the page."""
    init_data: str = Field(..., max_length=4096)
    referral_code: Optional[str] = None
    acq: Optional[AcqPayload] = None


def _verify_webapp_init_data(init_data: str, max_age: int = 86400):
    """Validate Telegram Mini App initData. Returns the parsed dict, or None.

    NOTE the secret differs from the Login Widget. Widget:
        secret = sha256(bot_token)
    Mini App:
        secret = HMAC_SHA256(key=b"WebAppData", msg=bot_token)
    Using the widget recipe here rejects every genuine login, and the failure
    looks exactly like a forged one — so it is worth being explicit.

    Values are taken from parse_qsl, which url-decodes once. The check string is
    built from those decoded values (Telegram signs the decoded form), and
    `user` stays the raw JSON string it arrives as — re-serialising it would
    change the bytes and break the hash.
    """
    try:
        pairs = urllib.parse.parse_qsl(init_data, strict_parsing=True, keep_blank_values=True)
    except Exception:
        return None

    fields = dict(pairs)
    received = fields.pop("hash", None)
    if not received:
        return None

    check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed, received):
        logger.warning(
            "webapp initData hash mismatch: signed_fields=%s", sorted(fields.keys())
        )
        return None

    # Freshness. Without this, one captured initData string logs someone in
    # forever.
    try:
        auth_date = int(fields.get("auth_date", "0"))
    except (TypeError, ValueError):
        return None
    if auth_date <= 0 or (time.time() - auth_date) > max_age:
        logger.warning("webapp initData expired: auth_date=%s", auth_date)
        return None

    return fields


@router.post("/telegram/webapp", response_model=TokenResponse)
async def telegram_webapp_login(
    payload: TelegramWebAppLogin,
    request: Request,
    db: Session = Depends(get_db),
):
    """Sign in from inside Telegram, with no OAuth round trip.

    Why this exists: the Login Widget opens a popup and waits for it to talk
    back. Inside an in-app browser that conversation can simply never happen —
    measured 2026-08-07, 38 auth_start produced only 10 requests that reached
    this service. A Mini App is already inside Telegram, so Telegram hands us a
    signed identity directly and there is no popup to lose.
    """
    fields = _verify_webapp_init_data(payload.init_data)
    if fields is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Telegram data",
        )

    try:
        tg_user = json.loads(fields.get("user") or "{}")
    except Exception:
        tg_user = {}
    if not tg_user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram data has no user",
        )

    # Attribution that arrives already authenticated.
    #
    # UTM cannot survive a t.me link — Telegram forwards no query string and
    # nginx never sees one, which is why the channel buttons carry none. The
    # Mini App has `startapp`, delivered inside the SIGNED initData as
    # start_param, so it reaches us tamper-evident rather than as a parameter
    # anyone could edit. Shape is "<event>_<coin>_<key>", written by
    # caption_builder._startapp.
    acq = payload.acq
    start_param = (fields.get("start_param") or "").strip()
    if acq is None and start_param:
        acq = acq_from_telegram_start_param(start_param)

    data = TelegramLogin(
        id=int(tg_user["id"]),
        first_name=tg_user.get("first_name") or "Telegram",
        last_name=tg_user.get("last_name"),
        username=tg_user.get("username"),
        photo_url=tg_user.get("photo_url"),
        auth_date=int(fields["auth_date"]),
        # Already authenticated above; the shared path never reads this.
        hash="webapp",
        referral_code=payload.referral_code,
        acq=acq,
    )
    return await _issue_telegram_session(data, request, db)


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
        from app.services.identity_transfer import apply_telegram_transfer, collision_detail

        body = data.model_dump() if hasattr(data, "model_dump") else {}
        offer = collision_detail(db, existing, moving="telegram", target=current_user)
        if not offer["transferable"] or not bool(body.get("transfer")):
            raise HTTPException(status_code=409, detail=offer)
        apply_telegram_transfer(
            db,
            source=existing,
            target=current_user,
            telegram_id=data.id,
            telegram_username=data.username,
            actor="atas permintaan pemilik Telegram",
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

    # 3. Membership check — if previously kicked, unban so the invite can work.
    #    Telegram keeps "kicked" until unban; without this the invite opens but
    #    join fails with no useful UI feedback on the web side.
    from app.services.telegram_group import (
        get_member_status,
        VIP_GROUP_CHAT_ID as _VIP_CHAT,
        _post as tg_post,
    )

    member_status = await get_member_status(current_user.telegram_id)
    if member_status in ("creator", "administrator", "member", "restricted"):
        if not current_user.telegram_in_group:
            current_user.telegram_in_group = True
            db.commit()
        return {
            "already_member": True,
            "invite_link": None,
            "message": "You're already a member of the VIP group.",
        }

    if member_status == "kicked":
        await tg_post(
            "unbanChatMember",
            {
                "chat_id": _VIP_CHAT,
                "user_id": current_user.telegram_id,
                "only_if_banned": True,
            },
        )

    # 4. Generate invite link sekali-pakai
    invite_link = await create_one_time_invite_link(
        expire_seconds=INVITE_LINK_TTL,
        name=f"u{current_user.id}",
    )
    if not invite_link:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't create an invite link, please try again shortly.",
        )

    return {
        "already_member": False,
        "invite_link": invite_link,
        "expires_in": INVITE_LINK_TTL,
        "message": "Single-use link. Click to join the VIP group.",
    }


# ====================================================================
# Helper Functions
# ====================================================================

def _verify_telegram_hash(data: TelegramLogin) -> bool:
    """
    Verify data authenticity via HMAC-SHA256.
    https://core.telegram.org/widgets/login#checking-authorization

    PENTING: hanya field yang BENAR-BENAR dikirim Telegram boleh masuk
    check_string. `referral_code` dan `acq` sama-sama kita sendiri yang
    tempelkan ke body — dan `acq` sempat terlewat di sini.

    Akibatnya spesifik dan mahal: `acq` diambil dari localStorage (first-touch),
    jadi ia terkirim untuk siapa pun yang PERNAH mendarat lewat link ber-UTM.
    Karena AcqPayload sebuah objek, repr dict-nya ikut ter-hash dan hash-nya
    dijamin meleset -> 401. Pengunjung tanpa UTM tetap lolos, jadi jumlah
    signup Telegram harian terlihat normal sementara yang ditolak justru
    pengunjung dari kanal pemasaran. Terukur pada 2026-08-07: Telegram
    38 auth_start -> 5 sukses (13%), Google 33 -> 26 (79%).
    """
    check_dict = data.model_dump(exclude={'hash', 'referral_code', 'acq'})
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

    ok = hmac.compare_digest(computed_hash, data.hash or "")
    if not ok:
        # Sebelumnya gagal tanpa jejak apa pun: 401 sampai ke klien sementara
        # journald sunyi, jadi tidak ada cara mendiagnosis dari sisi server.
        # Nama field saja — jangan pernah hash/token.
        logger.warning(
            "telegram hash mismatch: tg_id=%s auth_date=%s signed_fields=%s",
            getattr(data, "id", "?"),
            getattr(data, "auth_date", "?"),
            sorted(check_dict.keys()),
        )
    return ok


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
