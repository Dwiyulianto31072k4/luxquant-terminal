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
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services import chat_service
from app.services.chat_service import ChatSchemaMissing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/chat", tags=["admin-chat"])

_STATUSES = ("open", "snoozed", "closed")


class AdminSendIn(BaseModel):
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
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if status_filter and status_filter not in _STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {_STATUSES}")
    try:
        return chat_service.admin_conversation_list(
            db, status=status_filter, search=search,
            unread_only=unread_only, limit=limit, offset=offset,
        )
    except ChatSchemaMissing as e:
        raise _schema_guard(e)


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: int,
    after: int = Query(0, ge=0),
    limit: int = Query(chat_service.DEFAULT_PAGE, ge=1, le=500),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    try:
        conv = _require_conv(db, conversation_id)
        # include_admin_only: the admin sees internal notes and AI drafts.
        messages = chat_service.list_messages(
            db, conversation_id, after_seq=after, limit=limit, include_admin_only=True,
        )
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    return {"messages": messages, "last_seq": conv["last_seq"], "status": conv["status"]}


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
            client_msg_id=payload.client_msg_id,
        )
        chat_service.mark_read(db, conversation_id, "admin", msg["seq"])
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": msg}


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
