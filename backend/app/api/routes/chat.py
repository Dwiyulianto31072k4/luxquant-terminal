# backend/app/api/routes/chat.py
"""
In-app live chat — user-facing side.

Logged-in users only; there is no anonymous entry point by design (no spam
surface, no identity merging, and the admin always knows who they're talking
to). Transport is plain HTTP polling: the panel polls only while it is open and
visible. A WebSocket push path is planned but the client talks to a swappable
transport module, so it lands without touching these endpoints.

All handlers are plain `def` — see the header of app/api/deps.py.
"""
from __future__ import annotations

import logging
import secrets
import time
from typing import Optional

import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.redis import get_redis
from app.models.user import User
from app.services import chat_service
from app.services.chat_service import ChatSchemaMissing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

SEND_LIMIT_PER_MIN = 10


class SendIn(BaseModel):
    body: str = Field(min_length=1, max_length=chat_service.MAX_BODY_CHARS)
    # "text" or "image". For an image the body carries the URL returned by
    # /chat/upload; anything else is rejected rather than stored, so a client
    # cannot invent kinds the renderers do not know how to draw.
    kind: str = Field(default="text", pattern="^(text|image)$")
    # Client-generated UUID. Makes send idempotent so an optimistic-UI retry or
    # a double-click can't post twice.
    client_msg_id: Optional[str] = Field(default=None, max_length=64)


class ReadIn(BaseModel):
    seq: int = Field(ge=0)


def _schema_guard(e: ChatSchemaMissing):
    logger.error("chat schema missing: %s", e)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Chat is not available yet.",
    )


def _rate_limit_send(user_id: int) -> None:
    """Sliding-window send cap, same ZSET shape as _check_rate_limit in
    app/api/deps_public.py but on its own key so chat and the public API don't
    share a budget. Fails open — a Redis outage must not silence support.
    """
    try:
        r = get_redis()
        if r is None:
            return
        key = f"rl:chat:{user_id}"
        now_ms = int(time.time() * 1000)
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, now_ms - 60_000)
        pipe.zcard(key)
        _, used = pipe.execute()

        if used >= SEND_LIMIT_PER_MIN:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You're sending messages too quickly. Give it a moment.",
                headers={"Retry-After": "60"},
            )

        pipe = r.pipeline()
        pipe.zadd(key, {f"{now_ms}-{secrets.token_hex(4)}": now_ms})
        pipe.expire(key, 60)
        pipe.execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("chat rate limiter fail-open: %s", e)


@router.get("/conversation")
def get_conversation(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Open the panel: the thread, its tail, and the copy the widget needs.

    One round trip on open so the panel paints immediately instead of
    flashing empty while a second request lands.
    """
    try:
        conv = chat_service.get_or_create_conversation(db, user.id)
        messages = chat_service.list_messages(db, conv["id"], after_seq=0)
        settings = chat_service.get_settings(db)
        # Same predicate the send handler uses, so the banner can never promise
        # a live reply at a moment the auto-reply would say otherwise.
        away = chat_service.is_away(settings)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)

    return {
        "conversation_id": conv["id"],
        "status": conv["status"],
        "last_seq": conv["last_seq"],
        "unread": max(0, conv["last_seq"] - conv["user_last_read_seq"]),
        # Lets the user UI show "Seen" on their bubbles once admin has read.
        "admin_last_read_seq": conv["admin_last_read_seq"],
        "user_last_read_seq": conv["user_last_read_seq"],
        "messages": messages,
        "welcome_message": settings.get("welcome_message"),
        "away_enabled": away,
        # Gated here rather than in the client: an API should not hand out copy
        # that must not be shown, or every consumer has to remember the rule.
        "away_message": (settings.get("away_message") or chat_service.DEFAULT_AWAY_MESSAGE) if away else None,
    }


@router.get("/messages")
def list_messages(
    after: int = Query(0, ge=0, description="Return messages with seq greater than this"),
    limit: int = Query(chat_service.DEFAULT_PAGE, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Poll for the tail. `after` is a per-conversation seq, never a row id —
    ids can commit out of order and silently skip a message.
    """
    try:
        conv = chat_service.get_or_create_conversation(db, user.id)
        messages = chat_service.list_messages(db, conv["id"], after_seq=after, limit=limit)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)

    # Re-fetch after list so admin_last_read_seq is current (admin may have
    # opened the thread between polls — that's how "Seen" appears live).
    try:
        conv = chat_service.get_conversation(db, conv["id"]) or conv
    except Exception:
        pass

    return {
        "messages": messages,
        "last_seq": conv["last_seq"],
        "status": conv["status"],
        "admin_last_read_seq": conv.get("admin_last_read_seq", 0),
        "user_last_read_seq": conv.get("user_last_read_seq", 0),
    }


@router.post("/messages")
def send_message(
    payload: SendIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _rate_limit_send(user.id)

    try:
        conv = chat_service.get_or_create_conversation(db, user.id)
        if conv["status"] == "closed":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This conversation has been closed.",
            )
        msg = chat_service.append_message(
            db,
            conversation_id=conv["id"],
            sender="user",
            sender_user_id=user.id,
            body=payload.body,
            source="web",
            kind=payload.kind,
            client_msg_id=payload.client_msg_id,
        )
        # Sending is also reading everything before it.
        chat_service.mark_read(db, conv["id"], "user", msg["seq"])

        # Set expectations immediately when nobody is at the desk. Inline
        # rather than in the poller: it is pure Postgres, and an away notice
        # that arrives a minute later has missed the moment it exists for.
        # Skipped on a duplicate send so a retry can't re-trigger it.
        away = None
        if not msg.get("duplicate"):
            away = chat_service.maybe_send_away_reply(db, conv["id"])
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"message": msg, "auto_reply": away, "conversation_id": conv["id"]}


@router.post("/read")
def mark_read(
    payload: ReadIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        conv = chat_service.get_or_create_conversation(db, user.id)
        chat_service.mark_read(db, conv["id"], "user", payload.seq)
    except ChatSchemaMissing as e:
        raise _schema_guard(e)
    return {"ok": True}


# --- image messages ----------------------------------------------
# Stored outside the repo so a deploy never wipes what people sent, matching how
# announcement and news images are already handled.
CHAT_IMAGES_DIR = os.environ.get("CHAT_IMAGES_DIR", "/opt/luxquant/chat-images")
ALLOWED_IMG = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
# Unlike the admin upload endpoints this one is open to every logged-in user, so
# it needs a ceiling. A phone photo sits comfortably under this; a video renamed
# to .jpg does not.
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def validate_chat_image(filename: Optional[str], blob: bytes) -> str:
    """Return the stored extension, or raise. Pure so the rules can be tested.

    Extension-only: the bytes are never trusted to say what they are, and are
    never executed — they are written under a random name and served by
    StaticFiles, which types the response from this same extension. SVG is
    absent on purpose; it can carry script and would run on our own origin.
    """
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_IMG:
        raise HTTPException(400, f"{ext or 'That file type'} is not an image we accept")
    if len(blob) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is larger than 8 MB")
    if not blob:
        raise HTTPException(400, "That file is empty")
    return ext


@router.post("/upload")
async def upload_chat_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Store one image and return the path to send as a message body.

    Deliberately does not create the message. The client uploads, then sends a
    normal message with kind='image', which keeps the retry story simple: a
    failed send can be retried without re-uploading, and an upload nobody sends
    is an orphaned file rather than half a thread.
    """
    # Read against a cap rather than trusting content-length, which the client
    # sets; the extra byte is what makes an over-size file detectable.
    blob = await file.read(MAX_IMAGE_BYTES + 1)
    ext = validate_chat_image(file.filename, blob)

    # Created here, not at import: a filesystem side effect at import time makes
    # the module unimportable anywhere the path does not exist, tests included.
    os.makedirs(CHAT_IMAGES_DIR, exist_ok=True)
    fname = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(CHAT_IMAGES_DIR, fname), "wb") as buf:
        buf.write(blob)
    return {"ok": True, "url": f"/api/v1/chat-images/{fname}"}


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Drives the launcher when the panel is closed.

    Carries the newest unread line as well as the count, so the launcher can
    show what was said rather than only that something was. Same round trip it
    already polls; the preview is skipped entirely when there is nothing unread.
    """
    try:
        # A new account is greeted here, before the count is taken, so the badge
        # it creates is visible on the very first poll rather than one poll
        # later. Bounded to accounts created after a cutoff and to one message
        # ever; see maybe_send_welcome.
        chat_service.maybe_send_welcome(db, user.id, getattr(user, "created_at", None))
        n = chat_service.user_unread_count(db, user.id)
        return {
            "unread": n,
            "preview": chat_service.user_unread_preview(db, user.id) if n else None,
        }
    except ChatSchemaMissing:
        # The launcher polls this; a missing table shouldn't spam 503s into the
        # console of every logged-in user. Report "nothing unread" instead.
        return {"unread": 0}
