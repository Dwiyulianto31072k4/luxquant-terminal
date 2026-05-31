# backend/app/services/telegram_group.py
"""
Telegram VIP Group management — centralized Bot API calls.

Dipakai oleh:
- telegram_auth routes (endpoint join-vip → create invite link)
- subscription_worker (grace reminder DM + kick saat expired)

Bot HARUS admin di group dengan izin:
- "Add Members"  (can_invite_users)  → createChatInviteLink
- "Ban Users"                         → banChatMember / unbanChatMember

Semua fungsi async (httpx.AsyncClient), defensive (return None/False on error,
tidak pernah raise ke caller).
"""
import os
import logging
import time as _time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv(
    "TELEGRAM_BOT_TOKEN",
    "8398445725:AAF4zg1TEG_qUMrgwyOSlgXXQB-tyG64SqU"
)
VIP_GROUP_CHAT_ID = int(os.getenv("VIP_GROUP_CHAT_ID", "-1002670915863"))
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Status yang dianggap "ada di dalam group"
_PRESENT_STATUSES = ("creator", "administrator", "member", "restricted")


async def _post(method: str, payload: dict, timeout: float = 10.0) -> Optional[dict]:
    """POST ke Bot API. Return result dict kalau ok, else None."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{TELEGRAM_API}/{method}", json=payload)
            if resp.status_code != 200:
                logger.warning(
                    f"Telegram {method} HTTP {resp.status_code}: {resp.text[:200]}"
                )
                return None
            data = resp.json()
            if not data.get("ok"):
                logger.warning(f"Telegram {method} not-ok: {data.get('description')}")
                return None
            return data.get("result")
    except Exception as e:
        logger.error(f"Telegram {method} error: {e}")
        return None


async def get_member_status(telegram_id: int) -> Optional[str]:
    """Return status member di VIP group (member/left/kicked/...) atau None kalau gagal."""
    result = await _post(
        "getChatMember",
        {"chat_id": VIP_GROUP_CHAT_ID, "user_id": telegram_id},
    )
    if result is None:
        return None
    return result.get("status", "left")


async def is_in_group(telegram_id: int) -> Optional[bool]:
    """True/False apakah user ada di group. None kalau gagal cek (jangan ambil keputusan)."""
    status = await get_member_status(telegram_id)
    if status is None:
        return None
    return status in _PRESENT_STATUSES


async def create_one_time_invite_link(
    expire_seconds: int = 3600,
    name: Optional[str] = None,
) -> Optional[str]:
    """
    Buat invite link sekali-pakai (member_limit=1) yang expire otomatis.

    Args:
        expire_seconds: berapa lama link valid (default 1 jam)
        name: label opsional buat tracking di Telegram admin panel

    Returns:
        invite_link (str) atau None kalau gagal.
    """
    payload = {
        "chat_id": VIP_GROUP_CHAT_ID,
        "member_limit": 1,
        "expire_date": int(_time.time()) + max(60, expire_seconds),
        "creates_join_request": False,
    }
    if name:
        payload["name"] = name[:32]  # Telegram limit nama invite link

    result = await _post("createChatInviteLink", payload)
    if result is None:
        return None
    return result.get("invite_link")


async def kick_member(telegram_id: int) -> bool:
    """
    Keluarkan user dari group TANPA ban permanen (biar bisa join lagi kalau perpanjang).

    banChatMember → langsung unbanChatMember.
    Return True kalau ban berhasil (unban best-effort).
    """
    banned = await _post(
        "banChatMember",
        {"chat_id": VIP_GROUP_CHAT_ID, "user_id": telegram_id},
    )
    if banned is None:
        return False

    # Unban biar status balik ke 'left' (bukan 'kicked'), jadi bisa join lagi nanti.
    await _post(
        "unbanChatMember",
        {
            "chat_id": VIP_GROUP_CHAT_ID,
            "user_id": telegram_id,
            "only_if_banned": True,
        },
    )
    return True


async def send_dm(telegram_id: int, text: str) -> bool:
    """
    Kirim DM ke user (mis. reminder grace period).

    CATATAN: hanya berhasil kalau user pernah /start bot atau pernah interaksi.
    Kalau user belum pernah, Telegram tolak — itu normal, return False.
    """
    result = await _post(
        "sendMessage",
        {
            "chat_id": telegram_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
    )
    return result is not None
