# backend/app/services/chat_autoreply_worker.py
"""
Chat follow-up worker — the two time-delayed halves of support.

Runs in luxquant-poller.service behind the leader gate, same shape as
whale_worker.py. Two jobs, both of which only make sense after time has passed
(the immediate away auto-reply is inline in the send handler instead):

  1. Nudge the ADMIN when a user has been waiting too long. Response time is
     the metric this whole feature lives on, and the admin is the one person we
     know is reachable on Telegram.

  2. Pull the USER back when an admin reply has gone unread. This is the only
     offline channel that reaches everyone: most accounts are Google or Discord
     with no telegram_id, and the backend has no email sender at all — so the
     in-app bell is the floor, and a Telegram DM is a bonus for the minority
     who linked one.

Never raises to the caller; a failure here must never take the poller down.
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from typing import Any, Dict, List

from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.leader import is_leader
from app.services import chat_service
from app.services.notifier import create_notification, notification_exists

logger = logging.getLogger(__name__)

INTERVAL = 120
STARTUP_DELAY = 45

ADMIN_ALERT_TYPE = "chat_admin_waiting"
USER_REPLY_TYPE = "chat_reply"

# Telegram DM is best-effort garnish on top of the in-app notification, so a
# dead bot or a revoked token degrades reach rather than breaking it.
_TG_PREVIEW_CHARS = 300


def _preview(body: str, limit: int = 120) -> str:
    body = " ".join((body or "").split())
    return body if len(body) <= limit else body[: limit - 1] + "…"


# ════════════════════════════════════════════════════════════════════
# 1 — admin is sitting on an unanswered conversation
# ════════════════════════════════════════════════════════════════════

def _collect_admin_alerts() -> List[Dict[str, Any]]:
    """Pure DB work, returns rows to DM. Runs in a thread."""
    db = SessionLocal()
    try:
        settings = chat_service.get_settings(db)
        after_min = settings.get("nudge_after_min") or 30
        if after_min <= 0:
            return []

        pending = chat_service.conversations_awaiting_admin(db, after_min)
        if not pending:
            return []

        admins = db.execute(
            text(
                "SELECT id, telegram_id FROM users "
                "WHERE role = 'admin' AND is_active = true AND telegram_id IS NOT NULL"
            )
        ).mappings().all()

        out = []
        for row in pending:
            # One alert per user message, not per scan — source_id pins it to
            # the conversation's current seq, so the next unanswered message
            # alerts again but this one never repeats.
            source_id = f"conv:{row['id']}:seq:{row['last_seq']}"
            if notification_exists(db, type=ADMIN_ALERT_TYPE, source_id=source_id):
                continue

            waited = int(row.get("waiting_min") or 0)
            title = f"{row['username']} waiting {waited}m"
            body = _preview(row.get("last_body") or "")

            for admin in admins:
                create_notification(
                    db,
                    type=ADMIN_ALERT_TYPE,
                    title=title,
                    body=body,
                    data={"conversation_id": row["id"], "user_id": row["user_id"]},
                    source_type="chat",
                    source_id=source_id,
                    user_id=admin["id"],
                )
            out.append({
                "telegram_ids": [a["telegram_id"] for a in admins],
                "text": (
                    f"💬 <b>{row['username']}</b> has been waiting {waited}m\n\n"
                    f"{_preview(row.get('last_body') or '', _TG_PREVIEW_CHARS)}\n\n"
                    f"Reply: https://luxquant.tw/admin/workspace#chat"
                ),
            })
        return out
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════
# 2 — user hasn't seen the admin's reply
# ════════════════════════════════════════════════════════════════════

def _collect_user_pings() -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = chat_service.replies_unseen_by_user(db, chat_service.REPLY_UNSEEN_AFTER_MIN)
        out = []
        for row in rows:
            source_id = str(row["message_id"])
            if notification_exists(db, type=USER_REPLY_TYPE, source_id=source_id):
                continue

            create_notification(
                db,
                type=USER_REPLY_TYPE,
                title="New reply from LuxQuant",
                body=_preview(row["body"]),
                data={"conversation_id": row["conversation_id"]},
                source_type="chat",
                source_id=source_id,
                user_id=row["user_id"],
            )

            # Bonus channel, only where the bot is known to reach them.
            reachable = bool(row.get("telegram_id")) and (
                bool(row.get("telegram_bot_started_at")) or bool(row.get("telegram_in_group"))
            )
            if reachable:
                out.append({
                    "telegram_ids": [row["telegram_id"]],
                    "text": (
                        "💬 You have a new reply from the LuxQuant team:\n\n"
                        f"{_preview(row['body'], _TG_PREVIEW_CHARS)}\n\n"
                        "Read and reply: https://luxquant.tw"
                    ),
                })
        return out
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════
# Loop
# ════════════════════════════════════════════════════════════════════

async def _deliver(batches: List[Dict[str, Any]]) -> None:
    """Fire the Telegram DMs. Import is local so a Telegram problem can never
    stop this module from importing and the in-app half from working."""
    if not batches:
        return
    try:
        from app.services.telegram_group import send_dm
    except Exception as e:
        logger.warning("chat follow-up: telegram unavailable (%s) — in-app only", e)
        return

    for batch in batches:
        for tg_id in batch["telegram_ids"]:
            try:
                await send_dm(tg_id, batch["text"])
            except Exception as e:
                logger.warning("chat follow-up DM to %s failed: %s", tg_id, e)


async def chat_followup_loop():
    await asyncio.sleep(STARTUP_DELAY)
    while True:
        if not is_leader():
            await asyncio.sleep(15)
            continue
        try:
            # DB work off the event loop — chat_service is sync SQLAlchemy.
            admin_alerts = await asyncio.to_thread(_collect_admin_alerts)
            user_pings = await asyncio.to_thread(_collect_user_pings)
            await _deliver(admin_alerts)
            await _deliver(user_pings)
            if admin_alerts or user_pings:
                logger.info(
                    "chat follow-up: %d admin alert(s), %d user ping(s)",
                    len(admin_alerts), len(user_pings),
                )
        except Exception:
            traceback.print_exc()
        await asyncio.sleep(INTERVAL)


def start_chat_followup_worker():
    asyncio.get_event_loop().create_task(chat_followup_loop())
