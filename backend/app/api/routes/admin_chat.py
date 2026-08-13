# backend/app/api/routes/admin_chat.py
"""
In-app live chat — admin side.

Postgres is the single source of truth; this tab and (phase 2) the Telegram
forum-topic mirror are two views over the same rows, so a reply typed in either
place shows up in the other.

`get_admin_user` already rejects non-GET for co_admin / founder, so view-only
staff can read every thread but cannot reply. The UI hides the composer for
them rather than letting them discover it via a 403.

All handlers are plain `def` — see the header of app/api/deps.py.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services import chat_service
from app.services.chat_media import delete_chat_image
from app.services.chat_service import ChatSchemaMissing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/chat", tags=["admin-chat"])

_STATUSES = ("open", "snoozed", "closed")


class AdminSendIn(BaseModel):
    body: str = Field(min_length=1, max_length=chat_service.MAX_BODY_CHARS)
    # For an image the body carries the URL from /chat/upload, which admins
    # reuse rather than having a second upload endpoint that does the same job.
    kind: str = Field(default="text", pattern="^(text|image)$")
    client_msg_id: Optional[str] = Field(default=None, max_length=64)


class StartChatIn(BaseModel):
    user_id: int
    body: str = Field(min_length=1, max_length=chat_service.MAX_BODY_CHARS)
    client_msg_id: Optional[str] = Field(default=None, max_length=64)


class ReadIn(BaseModel):
    seq: int = Field(ge=0)


class ConvPatchIn(BaseModel):
    status: Optional[str] = None
    assigned_admin_id: Optional[int] = None


class SettingsIn(BaseModel):
    away_enabled: Optional[bool] = None
    away_message: Optional[str] = None
    office_hours: Optional[Dict[str, Any]] = None
    autoreply_cooldown_min: Optional[int] = Field(default=None, ge=0, le=10080)
    nudge_after_min: Optional[int] = Field(default=None, ge=0, le=10080)
    nudge_message: Optional[str] = None
    welcome_message: Optional[str] = None
    tg_support_chat_id: Optional[int] = None


def _schema_guard(e: ChatSchemaMissing):
    logger.error("chat schema missing: %s", e)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Chat tables are not migrated — run database/migration-chat-v1.sql",
    )


def _require_conv(db: Session, conversation_id: int) -> Dict[str, Any]:
    conv = chat_service.get_conversation(db, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.get("/conversations")
def list_conversations(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    awaiting_read_only: bool = Query(False),
    active_unread_only: bool = Query(False),
    needs_reply_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if status_filter and status_filter not in _STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {_STATUSES}")
    try:
        return chat_service.admin_conversation_list(
            db,
            status=status_filter,
            search=search,
            unread_only=unread_only,
            awaiting_read_only=awaiting_read_only,
            active_unread_only=active_unread_only,
            needs_reply_only=needs_reply_only,
            limit=limit,
            offset=offset,
        )
    except ChatSchemaMissing as e:
        raise _schema_guard(e)


@router.post("/conversations/start")
def start_conversation(
    payload: StartChatIn,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Open a thread with a user who has never written in, and say the first thing.

    This is what makes chat a follow-up tool rather than a complaints box: it
    reaches every account, including the majority who have no Telegram, no
    Discord and no real email and are therefore "unreachable" everywhere else
    in the admin UI.

    Idempotent on the conversation — a user has exactly one thread, so starting
    a second time simply appends to the existing one.
    """
    # Targeted SELECT rather than db.query(User): this needs three fields, not a
    # hydrated 40-column ORM object, and it matches how the rest of chat reads.
    target = db.execute(
        text("SELECT id, username, is_active FROM users WHERE id = :uid"),
        {"uid": payload.user_id},
    ).mappings().first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not target["is_active"]:
        raise HTTPException(status_code=400, detail="That account is deactivated.")
    if target["id"] == admin.id:
        raise HTTPException(status_code=400, detail="You can't start a chat with yourself.")

    try:
        conv = chat_service.get_or_create_conversation(db, target["id"])
        if conv["status"] == "closed":
            # Reaching out again is an implicit reopen — otherwise the message
            # would land in a thread the user is blocked from answering.
            chat_service.set_status(db, conv["id"], "open")
        msg = chat_service.append_message(
            db,
            conversation_id=conv["id"],
            sender="admin",
            sender_user_id=admin.id,
            body=payload.body,
            source="admin_panel",
            kind=getattr(payload, "kind", "text"),
            client_msg_id=payload.client_msg_id,
        )
        chat_service.mark_read(db, conv["id"], "admin", msg["seq"])
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # No push from here: the follow-up worker notices the unread reply a couple
    # of minutes later and delivers the bell notification plus a Telegram DM if
    # the bot can reach them. Same path as any other admin reply.
    return {
        "conversation_id": conv["id"],
        "message": msg,
        "username": target["username"],
    }


@router.get("/user/{user_id}")
def conversation_for_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Thread summary for one user, for surfaces that start from a user rather
    than from the inbox (the user drawer). Returns exists=false rather than 404
    so the caller can render "no thread yet" without treating it as an error.
    """
    try:
        row = db.execute(
            text("""
                SELECT id, status, last_seq, admin_last_read_seq, last_message_at
                  FROM chat_conversations WHERE user_id = :uid
            """),
            {"uid": user_id},
        ).mappings().first()
    except Exception as e:
        if isinstance(e, ChatSchemaMissing):
            raise _schema_guard(e)
        raise

    if not row or row["last_seq"] == 0:
        return {"exists": False, "conversation_id": row["id"] if row else None,
                "message_count": 0, "unread": 0}
    return {
        "exists": True,
        "conversation_id": row["id"],
        "status": row["status"],
        "message_count": row["last_seq"],
        "unread": max(0, row["last_seq"] - row["admin_last_read_seq"]),
        "last_message_at": row["last_message_at"].isoformat() if row["last_message_at"] else None,
    }


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: int,
    after: int = Query(0, ge=0),
    before: Optional[int] = Query(None, ge=1),
    limit: int = Query(chat_service.DEFAULT_PAGE, ge=1, le=500),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if before is not None and after:
        raise HTTPException(status_code=400, detail="Use either after or before, not both")
    try:
        conv = _require_conv(db, conversation_id)
        # include_admin_only: the admin sees internal notes and AI drafts.
        messages = chat_service.list_messages(
            db,
            conversation_id,
            after_seq=after,
            before_seq=before,
            limit=limit,
            include_admin_only=True,
        )
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    # Fresh cursors so admin UI can show "Seen by user" live while polling.
    fresh = chat_service.get_conversation(db, conversation_id) or conv
    return {
        "messages": messages,
        "message_updates": chat_service.list_message_tombstones(
            db, conversation_id, include_admin_only=True,
        ) if after else [],
        "last_seq": fresh["last_seq"],
        "has_more_before": bool(messages) and chat_service.has_messages_before(
            db, conversation_id, messages[0]["seq"], include_admin_only=True,
        ),
        "status": fresh["status"],
        "user_last_read_seq": fresh.get("user_last_read_seq", 0),
        "admin_last_read_seq": fresh.get("admin_last_read_seq", 0),
    }


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    payload: AdminSendIn,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    try:
        _require_conv(db, conversation_id)
        msg = chat_service.append_message(
            db,
            conversation_id=conversation_id,
            sender="admin",
            sender_user_id=admin.id,
            body=payload.body,
            source="admin_panel",
            kind=getattr(payload, "kind", "text"),
            client_msg_id=payload.client_msg_id,
        )
        chat_service.mark_read(db, conversation_id, "admin", msg["seq"])
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": msg}


@router.delete("/conversations/{conversation_id}/messages/{message_id}")
def delete_message(
    conversation_id: int,
    message_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Remove content while preserving the message's sequence/read cursors."""
    try:
        _require_conv(db, conversation_id)
        result = chat_service.delete_message(
            db,
            conversation_id=conversation_id,
            message_id=message_id,
            deleted_by_user_id=admin.id,
            admin=True,
        )
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    image_removed = False
    if result["deleted_kind"] == "image":
        image_removed = delete_chat_image(result["deleted_body"])
    return {
        "ok": True,
        "message": result["message"],
        "image_removed": image_removed,
        "relay_was_sent": result["relay_was_sent"],
    }


@router.post("/conversations/{conversation_id}/read")
def mark_read(
    conversation_id: int,
    payload: ReadIn,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    try:
        _require_conv(db, conversation_id)
        chat_service.mark_read(db, conversation_id, "admin", payload.seq)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    return {"ok": True}


@router.post("/read-all")
def read_all(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Clear every unread in the inbox at once.

    POST, so get_admin_user already refuses view-only staff. Returns how many
    threads it actually cleared — the caller shows that number rather than
    claiming success over a no-op.
    """
    try:
        cleared = chat_service.mark_all_read(db)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    return {"ok": True, "cleared": cleared}


@router.post("/conversations/{conversation_id}/unread")
def mark_unread(
    conversation_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Put one thread back in the inbox — "I read this, I'll deal with it later"."""
    try:
        _require_conv(db, conversation_id)
        chat_service.mark_unread(db, conversation_id)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    return {"ok": True}


@router.patch("/conversations/{conversation_id}")
def patch_conversation(
    conversation_id: int,
    payload: ConvPatchIn,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    try:
        _require_conv(db, conversation_id)
        if payload.status is not None:
            if payload.status not in _STATUSES:
                raise HTTPException(status_code=400, detail=f"status must be one of {_STATUSES}")
            chat_service.set_status(db, conversation_id, payload.status)
        conv = chat_service.get_conversation(db, conversation_id)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    return {"ok": True, "status": conv["status"]}


@router.get("/awaiting-reply")
def awaiting_reply(
    limit: int = Query(5, ge=1, le=25),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Threads where the user spoke last and nobody has answered.

    Different question from the unread badge. A thread can be marked read by
    whoever glanced at it and still have nobody reply — which is the failure the
    person waiting actually experiences. This compares the two sides' last
    message times instead of a read cursor, so opening a conversation does not
    make it disappear from here.

    Oldest wait first: the longest-ignored person is the one to answer next.
    """
    try:
        rows = db.execute(
            text("""
                SELECT c.id, c.user_id, c.last_user_message_at,
                       u.username, u.email,
                       EXTRACT(EPOCH FROM (now() - c.last_user_message_at)) AS waiting_seconds
                  FROM chat_conversations c
                  JOIN users u ON u.id = c.user_id
                 WHERE c.last_user_message_at IS NOT NULL
                   AND (c.last_admin_message_at IS NULL
                        OR c.last_user_message_at > c.last_admin_message_at)
                   AND c.status <> 'closed'
                 ORDER BY c.last_user_message_at ASC
                 LIMIT :lim
            """),
            {"lim": limit},
        ).mappings().all()
    except Exception as e:
        if isinstance(e, ChatSchemaMissing):
            raise _schema_guard(e)
        raise

    return {
        "count": len(rows),
        "conversations": [
            {
                "conversation_id": r["id"],
                "user_id": r["user_id"],
                "username": r["username"],
                "email": r["email"],
                "last_user_message_at": (
                    r["last_user_message_at"].isoformat()
                    if r["last_user_message_at"] else None
                ),
                "waiting_seconds": int(r["waiting_seconds"] or 0),
            }
            for r in rows
        ],
    }


@router.get("/unread-count")
def unread_count(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Workspace tab badge. Polled more often than the shell's other stats — a
    stale support badge is a slow reply, which is the metric this lives on.
    """
    try:
        return chat_service.admin_unread_total(db)
    except ChatSchemaMissing:
        return {"unread_messages": 0, "unread_conversations": 0}


@router.get("/settings")
def get_settings(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    try:
        return chat_service.get_settings(db)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)


@router.put("/settings")
def put_settings(
    payload: SettingsIn,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    try:
        return chat_service.update_settings(
            db, payload.model_dump(exclude_unset=True), updated_by=admin.id,
        )
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
