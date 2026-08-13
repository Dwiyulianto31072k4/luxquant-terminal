# backend/app/services/chat_service.py
"""
In-app live chat — Postgres layer.

Deliberately pure and synchronous: no Redis, no HTTP, no Telegram. Route
handlers here are plain `def` (see the header of app/api/deps.py for why sync
SQLAlchemy must never run inside `async def` in this codebase), and the phase-2
poller loops reach the same functions through `asyncio.to_thread`. Keeping this
module free of I/O is what lets both callers share it.

Tables live in database/migration-chat-v1.sql — that file is the source of
truth. Nothing here creates schema.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MAX_BODY_CHARS = 4000
DEFAULT_PAGE = 200

# How long an admin reply sits unread before we assume the person walked away
# and is worth pulling back. Short enough to still be a live conversation,
# long enough that someone reading the panel right now is never pinged.
REPLY_UNSEEN_AFTER_MIN = 2

DEFAULT_AWAY_MESSAGE = (
    "Thanks for the message — we're not at the desk right now, but we read "
    "every one and will reply as soon as we're back."
)

SENDERS = frozenset(("user", "admin", "system", "ai"))
# `welcome_auto` is its own source rather than reusing `system`: it is what
# answers "have we already greeted this account", and folding it in with away
# replies would make that question unanswerable.
SOURCES = frozenset(
    ("web", "admin_panel", "telegram_topic", "telegram_dm", "system", "welcome_auto")
)


class ChatSchemaMissing(RuntimeError):
    """Raised when the chat tables aren't migrated yet.

    Routes turn this into a 503 with an actionable message. Without it a fresh
    deploy that skipped the .sql just emits 'relation does not exist' 500s.
    """


def _guard_schema(exc: Exception) -> None:
    """Re-raise an undefined-table error as something the API can explain."""
    if isinstance(exc, ProgrammingError) and "does not exist" in str(exc.orig or exc):
        raise ChatSchemaMissing(
            "Chat tables are missing — run database/migration-chat-v1.sql"
        ) from exc


# ════════════════════════════════════════════════════════════════════
# Conversations
# ════════════════════════════════════════════════════════════════════

_CONV_COLS = """
    id, user_id, status, last_seq, user_last_read_seq, admin_last_read_seq,
    last_message_at, last_user_message_at, last_admin_message_at,
    tg_chat_id, tg_topic_id, tg_topic_state, dm_bound_at, handoff_sent_at,
    assigned_admin_id, answer_mode, created_at
"""


def get_or_create_conversation(db: Session, user_id: int, commit: bool = True) -> Dict[str, Any]:
    """Return this user's single conversation row, creating it on first use.

    ON CONFLICT rather than SELECT-then-INSERT: two tabs opening the panel at
    once would otherwise race into a unique violation on user_id.
    """
    try:
        db.execute(
            text("""
                INSERT INTO chat_conversations (user_id)
                VALUES (:uid)
                ON CONFLICT (user_id) DO NOTHING
            """),
            {"uid": user_id},
        )
        if commit:
            db.commit()
        row = db.execute(
            text(f"SELECT {_CONV_COLS} FROM chat_conversations WHERE user_id = :uid"),
            {"uid": user_id},
        ).mappings().first()
    except Exception as e:
        db.rollback()
        _guard_schema(e)
        raise
    return dict(row)


def get_conversation(db: Session, conversation_id: int) -> Optional[Dict[str, Any]]:
    row = db.execute(
        text(f"SELECT {_CONV_COLS} FROM chat_conversations WHERE id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    return dict(row) if row else None


def set_status(db: Session, conversation_id: int, status: str) -> None:
    db.execute(
        text("""
            UPDATE chat_conversations
               SET status = :st, updated_at = now()
             WHERE id = :cid
        """),
        {"cid": conversation_id, "st": status},
    )
    db.commit()


# ════════════════════════════════════════════════════════════════════
# Messages
# ════════════════════════════════════════════════════════════════════

def _msg_dict(row) -> Dict[str, Any]:
    created = row["created_at"]
    deleted_at = row.get("deleted_at")
    deleted = deleted_at is not None or row["kind"] == "deleted"
    expired = row["kind"] == "expired_image" and not deleted
    return {
        "id": row["id"],
        "seq": row["seq"],
        "sender": row["sender"],
        "body": "" if deleted or expired else row["body"],
        "kind": "deleted" if deleted else "expired_image" if expired else row["kind"],
        "deleted": deleted,
        "expired": expired,
        "deleted_at": deleted_at.isoformat() if deleted_at else None,
        "client_msg_id": row["client_msg_id"],
        "created_at": created.isoformat() if created else None,
    }


def append_message(
    db: Session,
    *,
    conversation_id: int,
    sender: str,
    body: str,
    source: str,
    sender_user_id: Optional[int] = None,
    client_msg_id: Optional[str] = None,
    kind: str = "text",
    visibility: str = "all",
    relay_state: str = "pending",
    tg_chat_id: Optional[int] = None,
    tg_message_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Append one message and return it.

    Three steps, one transaction, in this exact order:

      1. Idempotency SELECT. A client retry or double-click reuses its
         client_msg_id and must get the original row back, not a second one.
      2. UPDATE ... last_seq + 1 RETURNING. This takes the conversation row
         lock, which serialises writers (at most two per conversation) and
         hands out a gapless per-conversation sequence.
      3. INSERT with that seq.

    Do NOT fold this into a CTE with ON CONFLICT DO NOTHING: the UPDATE would
    still increment last_seq when the conflict fires, burning a number and
    leaving a permanent gap that makes every client reconcile forever. The
    unique indexes are last-resort guards, not the dedupe mechanism.
    """
    if sender not in SENDERS:
        raise ValueError(f"bad sender: {sender}")
    if source not in SOURCES:
        raise ValueError(f"bad source: {source}")

    body = (body or "").strip()
    if not body:
        raise ValueError("empty body")
    if len(body) > MAX_BODY_CHARS:
        body = body[:MAX_BODY_CHARS]

    try:
        # 1 — idempotency
        if client_msg_id:
            existing = db.execute(
                text("""
                    SELECT id, seq, sender, body, kind, deleted_at,
                           client_msg_id, created_at
                      FROM chat_messages
                     WHERE conversation_id = :cid AND client_msg_id = :cmid
                """),
                {"cid": conversation_id, "cmid": client_msg_id},
            ).mappings().first()
            if existing:
                return {**_msg_dict(existing), "duplicate": True}

        # 2 — allocate seq under the conversation row lock, and move the
        #     per-side activity clocks the nudge/away loops read in phase 3.
        seq_row = db.execute(
            text("""
                UPDATE chat_conversations
                   SET last_seq = last_seq + 1,
                       last_message_at = now(),
                       last_user_message_at = CASE WHEN :sender = 'user'
                            THEN now() ELSE last_user_message_at END,
                       last_admin_message_at = CASE WHEN :sender IN ('admin', 'ai')
                            THEN now() ELSE last_admin_message_at END,
                       updated_at = now()
                 WHERE id = :cid
             RETURNING last_seq
            """),
            {"cid": conversation_id, "sender": sender},
        ).mappings().first()
        if seq_row is None:
            raise ValueError(f"no such conversation: {conversation_id}")
        seq = seq_row["last_seq"]

        # 3 — insert
        inserted = db.execute(
            text("""
                INSERT INTO chat_messages (
                    conversation_id, seq, sender, sender_user_id, body, kind,
                    visibility, source, client_msg_id, relay_state,
                    tg_chat_id, tg_message_id
                ) VALUES (
                    :cid, :seq, :sender, :suid, :body, :kind,
                    :vis, :src, :cmid, :relay,
                    :tgc, :tgm
                )
                RETURNING id, seq, sender, body, kind, deleted_at,
                          client_msg_id, created_at
            """),
            {
                "cid": conversation_id, "seq": seq, "sender": sender,
                "suid": sender_user_id, "body": body, "kind": kind,
                "vis": visibility, "src": source, "cmid": client_msg_id,
                "relay": relay_state, "tgc": tg_chat_id, "tgm": tg_message_id,
            },
        ).mappings().first()

        db.commit()
    except Exception as e:
        db.rollback()
        _guard_schema(e)
        raise

    return {**_msg_dict(inserted), "duplicate": False}


def list_messages(
    db: Session,
    conversation_id: int,
    after_seq: int = 0,
    limit: int = DEFAULT_PAGE,
    include_admin_only: bool = False,
    before_seq: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """A deterministic page of messages, always returned oldest first.

    `include_admin_only=False` hides visibility='admin' rows — AI drafts and
    internal notes (phase 6). The user-facing route must never pass True.

    `after_seq` polls forward, `before_seq` pages backward, and no cursor returns
    the newest page. Returning the oldest page on first load would skip the
    middle of a long thread as soon as the client advanced to `last_seq`.
    """
    limit = max(1, min(limit, 500))
    vis_clause = "" if include_admin_only else "AND visibility = 'all'"
    if before_seq is not None and after_seq:
        raise ValueError("after_seq and before_seq are mutually exclusive")

    if before_seq is not None:
        cursor_clause = "AND seq < :cursor"
        cursor = max(1, int(before_seq))
        direction = "DESC"
    elif after_seq:
        cursor_clause = "AND seq > :cursor"
        cursor = max(0, int(after_seq))
        direction = "ASC"
    else:
        cursor_clause = ""
        cursor = 0
        direction = "DESC"

    try:
        rows = db.execute(
            text(f"""
                SELECT id, seq, sender, body, kind, deleted_at,
                       client_msg_id, created_at
                  FROM (
                    SELECT id, seq, sender, body, kind, deleted_at,
                           client_msg_id, created_at
                      FROM chat_messages
                     WHERE conversation_id = :cid
                       {cursor_clause}
                       {vis_clause}
                     ORDER BY seq {direction}
                     LIMIT :lim
                  ) page
                 ORDER BY seq ASC
            """),
            {"cid": conversation_id, "cursor": cursor, "lim": limit},
        ).mappings().all()
    except Exception as e:
        _guard_schema(e)
        raise
    return [_msg_dict(r) for r in rows]


def has_messages_before(
    db: Session,
    conversation_id: int,
    before_seq: int,
    include_admin_only: bool = False,
) -> bool:
    """Cheap existence check used by the history pager."""
    vis_clause = "" if include_admin_only else "AND visibility = 'all'"
    row = db.execute(
        text(f"""
            SELECT 1
              FROM chat_messages
             WHERE conversation_id = :cid
               AND seq < :before
               {vis_clause}
             LIMIT 1
        """),
        {"cid": conversation_id, "before": max(1, int(before_seq))},
    ).first()
    return row is not None


def list_message_tombstones(
    db: Session,
    conversation_id: int,
    include_admin_only: bool = False,
) -> List[Dict[str, Any]]:
    """Return deleted rows so an already-open client can replace old bubbles.

    Deletion does not allocate a new seq (doing so would distort read counts),
    so an `after=<last_seq>` poll cannot discover it naturally. Tombstones are
    tiny and rare; returning the conversation's set during tail polls keeps both
    sides live without introducing a second mutable cursor.
    """
    vis_clause = "" if include_admin_only else "AND visibility = 'all'"
    rows = db.execute(
        text(f"""
            SELECT id, seq, sender, body, kind, deleted_at,
                   client_msg_id, created_at
              FROM chat_messages
             WHERE conversation_id = :cid
               AND kind IN ('deleted', 'expired_image')
               {vis_clause}
             ORDER BY seq ASC
             LIMIT 500
        """),
        {"cid": conversation_id},
    ).mappings().all()
    return [_msg_dict(row) for row in rows]


def delete_message(
    db: Session,
    *,
    conversation_id: int,
    message_id: int,
    deleted_by_user_id: int,
    admin: bool,
) -> Dict[str, Any]:
    """Blank message content but preserve its sequence as a tombstone."""
    try:
        row = db.execute(
            text("""
                SELECT id, seq, sender, sender_user_id, body, kind, deleted_at,
                       client_msg_id, created_at, relay_state
                  FROM chat_messages
                 WHERE id = :mid AND conversation_id = :cid
                   FOR UPDATE
            """),
            {"mid": message_id, "cid": conversation_id},
        ).mappings().first()
        if not row:
            raise ValueError("Message not found")
        if row["sender"] == "system":
            raise ValueError("System messages cannot be deleted")
        if not admin and not (
            row["sender"] == "user" and row["sender_user_id"] == deleted_by_user_id
        ):
            raise PermissionError("You can only delete your own messages")

        original = dict(row)
        if row["deleted_at"] is None:
            updated = db.execute(
                text("""
                    UPDATE chat_messages
                       SET body = '', kind = 'deleted', deleted_at = now(),
                           deleted_by_user_id = :uid,
                           relay_state = CASE WHEN relay_state = 'pending'
                                              THEN 'skipped' ELSE relay_state END,
                           relay_error = CASE WHEN relay_state = 'pending'
                                              THEN 'message deleted before relay'
                                              ELSE relay_error END
                     WHERE id = :mid
                 RETURNING id, seq, sender, body, kind, deleted_at,
                           client_msg_id, created_at
                """),
                {"uid": deleted_by_user_id, "mid": message_id},
            ).mappings().first()
            db.execute(
                text("""
                    UPDATE chat_conversations c
                       SET last_user_message_at = (
                               SELECT max(created_at) FROM chat_messages
                                WHERE conversation_id = c.id
                                  AND sender = 'user' AND kind <> 'deleted'
                           ),
                           last_admin_message_at = (
                               SELECT max(created_at) FROM chat_messages
                                WHERE conversation_id = c.id
                                  AND sender IN ('admin', 'ai') AND kind <> 'deleted'
                           ),
                           updated_at = now()
                     WHERE c.id = :cid
                """),
                {"cid": conversation_id},
            )
            db.commit()
        else:
            updated = row
    except (ValueError, PermissionError):
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        _guard_schema(e)
        raise

    return {
        "message": _msg_dict(updated),
        "deleted_kind": original["kind"],
        "deleted_body": original["body"],
        "relay_was_sent": original["relay_state"] == "sent",
    }


def mark_read(db: Session, conversation_id: int, who: str, seq: int) -> None:
    """Advance a read cursor. Monotonic — a late poll can't rewind it."""
    col = "user_last_read_seq" if who == "user" else "admin_last_read_seq"
    db.execute(
        text(f"""
            UPDATE chat_conversations
               SET {col} = GREATEST({col}, :seq), updated_at = now()
             WHERE id = :cid
        """),
        {"cid": conversation_id, "seq": seq},
    )
    db.commit()


def mark_all_read(db: Session) -> int:
    """Advance every admin cursor to the end of its thread.

    One statement rather than a loop: the inbox can hold hundreds of threads and
    this runs from a button click. Only rows that are actually behind are
    touched, so the returned count is the number of conversations cleared and
    updated_at does not churn for threads that were already read.
    """
    res = db.execute(
        text("""
            UPDATE chat_conversations
               SET admin_last_read_seq = last_seq, updated_at = now()
             WHERE last_seq > admin_last_read_seq
        """)
    )
    db.commit()
    return res.rowcount or 0


def mark_unread(db: Session, conversation_id: int) -> None:
    """Deliberately rewind one admin cursor so the thread returns to the inbox.

    Separate from mark_read, which is monotonic on purpose — a late poll must
    never rewind a cursor. This is the only place allowed to move one backwards,
    which is why it takes no seq: the caller cannot use it to set an arbitrary
    position, only to reopen the last message.
    """
    db.execute(
        text("""
            UPDATE chat_conversations
               SET admin_last_read_seq = GREATEST(last_seq - 1, 0), updated_at = now()
             WHERE id = :cid
        """),
        {"cid": conversation_id},
    )
    db.commit()


# ════════════════════════════════════════════════════════════════════
# Admin inbox
# ════════════════════════════════════════════════════════════════════

def _derive_read_state(
    *,
    last_seq: int,
    admin_last_read_seq: int,
    user_last_read_seq: int,
    last_sender: Optional[str],
    last_admin_message_at,
    last_active_at,
) -> Dict[str, Any]:
    """Human-facing inbox state for one conversation.

    unread for admin is "they wrote, we haven't opened". awaiting_read is
    "we wrote, they haven't opened". user_active_unread is the sharp version:
    they came back to the product after our reply and still didn't open chat.
    """
    admin_unread = max(0, int(last_seq or 0) - int(admin_last_read_seq or 0))
    user_unread = max(0, int(last_seq or 0) - int(user_last_read_seq or 0))
    needs_reply = last_sender == "user"
    awaiting_read = (
        last_sender in ("admin", "ai", "system")
        and user_unread > 0
        and int(last_seq or 0) > 0
    )
    user_active_unread = False
    if awaiting_read and last_active_at and last_admin_message_at:
        try:
            user_active_unread = last_active_at > last_admin_message_at
        except TypeError:
            user_active_unread = False

    if admin_unread > 0 and needs_reply:
        label = "needs_reply"
    elif admin_unread > 0:
        label = "unread"
    elif user_active_unread:
        label = "active_unread"
    elif awaiting_read:
        label = "awaiting_read"
    elif last_seq:
        label = "seen"
    else:
        label = "empty"

    return {
        "admin_unread": admin_unread,
        "user_unread": user_unread,
        "needs_reply": needs_reply,
        "awaiting_read": awaiting_read,
        "user_active_unread": user_active_unread,
        "read_state": label,
    }


def admin_conversation_list(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    unread_only: bool = False,
    awaiting_read_only: bool = False,
    active_unread_only: bool = False,
    needs_reply_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """Inbox rows joined with the user context that makes this a conversion
    tool rather than a chat app: role, plan expiry, telegram reachability,
    last activity. Without it you're answering strangers.
    """
    limit = max(1, min(limit, 200))
    where = ["1=1"]
    params: Dict[str, Any] = {"lim": limit, "off": offset}

    if status:
        where.append("c.status = :st")
        params["st"] = status
    if search:
        where.append("(u.username ILIKE :q OR u.email ILIKE :q)")
        params["q"] = f"%{search}%"
    if unread_only:
        where.append("c.last_seq > c.admin_last_read_seq")
    if awaiting_read_only:
        # We spoke last; their read cursor has not caught last_seq.
        where.append("""
            c.last_seq > c.user_last_read_seq
            AND c.last_admin_message_at IS NOT NULL
            AND (c.last_user_message_at IS NULL
                 OR c.last_admin_message_at >= c.last_user_message_at)
        """)
    if active_unread_only:
        # Active in the product after our reply, still haven't opened the chat.
        where.append("""
            c.last_seq > c.user_last_read_seq
            AND c.last_admin_message_at IS NOT NULL
            AND u.last_active_at IS NOT NULL
            AND u.last_active_at > c.last_admin_message_at
            AND (c.last_user_message_at IS NULL
                 OR c.last_admin_message_at >= c.last_user_message_at)
        """)
    if needs_reply_only:
        where.append("""
            c.last_user_message_at IS NOT NULL
            AND (c.last_admin_message_at IS NULL
                 OR c.last_user_message_at > c.last_admin_message_at)
        """)

    clause = " AND ".join(where)

    try:
        rows = db.execute(
            text(f"""
                SELECT c.id, c.user_id, c.status, c.last_seq,
                       c.admin_last_read_seq, c.user_last_read_seq,
                       (c.last_seq - c.admin_last_read_seq) AS unread,
                       c.last_message_at, c.last_user_message_at,
                       c.last_admin_message_at, c.tg_topic_state,
                       c.handoff_sent_at, c.dm_bound_at,
                       u.username, u.email, u.avatar_url, u.role,
                       u.subscription_expires_at, u.telegram_id,
                       u.telegram_username, u.telegram_in_group,
                       u.last_active_at, u.created_at AS user_created_at,
                       (SELECT CASE WHEN m.kind = 'expired_image'
                                    THEN 'Image expired' ELSE m.body END
                          FROM chat_messages m
                         WHERE m.conversation_id = c.id AND m.visibility = 'all'
                           AND m.kind <> 'deleted'
                         ORDER BY m.seq DESC LIMIT 1) AS last_body,
                       (SELECT m.sender FROM chat_messages m
                         WHERE m.conversation_id = c.id AND m.visibility = 'all'
                           AND m.kind <> 'deleted'
                         ORDER BY m.seq DESC LIMIT 1) AS last_sender
                  FROM chat_conversations c
                  JOIN users u ON u.id = c.user_id
                 WHERE {clause}
                 ORDER BY c.last_message_at DESC NULLS LAST
                 LIMIT :lim OFFSET :off
            """),
            params,
        ).mappings().all()

        total = db.execute(
            text(f"""
                SELECT count(*) FROM chat_conversations c
                  JOIN users u ON u.id = c.user_id
                 WHERE {clause}
            """),
            {k: v for k, v in params.items() if k not in ("lim", "off")},
        ).scalar() or 0
    except Exception as e:
        _guard_schema(e)
        raise

    items = []
    for r in rows:
        d = dict(r)
        state = _derive_read_state(
            last_seq=d.get("last_seq") or 0,
            admin_last_read_seq=d.get("admin_last_read_seq") or 0,
            user_last_read_seq=d.get("user_last_read_seq") or 0,
            last_sender=d.get("last_sender"),
            last_admin_message_at=d.get("last_admin_message_at"),
            last_active_at=d.get("last_active_at"),
        )
        d.update(state)
        # Keep `unread` as admin-facing alias (existing UI).
        d["unread"] = state["admin_unread"]
        for k in ("last_message_at", "last_user_message_at", "last_admin_message_at",
                  "last_active_at", "user_created_at", "subscription_expires_at",
                  "handoff_sent_at", "dm_bound_at"):
            if d.get(k) is not None:
                d[k] = d[k].isoformat()
        # Trim the preview here so the payload stays small on a 50-row inbox.
        if d.get("last_body"):
            d["last_body"] = d["last_body"][:140]
        items.append(d)

    return {"items": items, "total": total, "limit": limit, "offset": offset}


def admin_unread_total(db: Session) -> Dict[str, int]:
    """Badge numbers for the workspace tab."""
    try:
        row = db.execute(
            text("""
                SELECT
                    coalesce(sum(GREATEST(last_seq - admin_last_read_seq, 0)), 0) AS messages,
                    count(*) FILTER (WHERE last_seq > admin_last_read_seq)        AS conversations
                  FROM chat_conversations
                 WHERE status = 'open'
            """)
        ).mappings().first()
    except Exception as e:
        _guard_schema(e)
        raise
    return {
        "unread_messages": int(row["messages"] or 0),
        "unread_conversations": int(row["conversations"] or 0),
    }


def user_unread_count(db: Session, user_id: int) -> int:
    """Unread for the floating launcher dot. Returns 0 when there's no thread
    yet, so the widget never has to special-case a first-time user."""
    try:
        row = db.execute(
            text("""
                SELECT GREATEST(last_seq - user_last_read_seq, 0) AS n
                  FROM chat_conversations WHERE user_id = :uid
            """),
            {"uid": user_id},
        ).mappings().first()
    except Exception as e:
        _guard_schema(e)
        raise
    return int(row["n"]) if row else 0


def user_unread_preview(db: Session, user_id: int) -> dict | None:
    """The latest thing we said to this user, for the launcher to show.

    A bare count tells someone a message exists and nothing about whether it is
    worth opening. The launcher can put the actual line on screen instead, which
    is the difference between a notification and an answer.

    Only the newest visible admin message, and only the head of it — this is a
    peek, not the thread.
    """
    try:
        row = db.execute(
            text("""
                SELECT m.body, m.created_at
                  FROM chat_messages m
                  JOIN chat_conversations c ON c.id = m.conversation_id
                 WHERE c.user_id = :uid
                   AND m.sender = 'admin'
                   AND m.visibility <> 'admin_only'
                   AND m.seq > c.user_last_read_seq
                 ORDER BY m.seq DESC
                 LIMIT 1
            """),
            {"uid": user_id},
        ).mappings().first()
    except Exception as e:
        _guard_schema(e)
        raise
    if not row or not row["body"]:
        return None
    body = row["body"].strip()
    return {
        "body": body[:160],
        "truncated": len(body) > 160,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


# ════════════════════════════════════════════════════════════════════
# Settings (singleton row, id = 1)
# ════════════════════════════════════════════════════════════════════

_SETTINGS_COLS = """
    away_enabled, away_message, office_hours, autoreply_cooldown_min,
    nudge_after_min, nudge_message, welcome_message, tg_support_chat_id,
    updated_at
"""

_SETTINGS_WRITABLE = (
    "away_enabled", "away_message", "office_hours", "autoreply_cooldown_min",
    "nudge_after_min", "nudge_message", "welcome_message", "tg_support_chat_id",
)

_SETTINGS_JSON_FIELDS = ("office_hours",)


def get_settings(db: Session) -> Dict[str, Any]:
    try:
        row = db.execute(
            text(f"SELECT {_SETTINGS_COLS} FROM chat_settings WHERE id = 1")
        ).mappings().first()
    except Exception as e:
        _guard_schema(e)
        raise
    if not row:
        # The migration seeds this row; only a hand-deleted row lands here.
        return {"away_enabled": True, "away_message": None, "office_hours": None,
                "autoreply_cooldown_min": 120, "nudge_after_min": 30,
                "nudge_message": None, "welcome_message": None,
                "tg_support_chat_id": None, "updated_at": None}
    d = dict(row)
    if d.get("updated_at"):
        d["updated_at"] = d["updated_at"].isoformat()
    return d


def update_settings(db: Session, patch: Dict[str, Any], updated_by: int) -> Dict[str, Any]:
    fields = {k: v for k, v in patch.items() if k in _SETTINGS_WRITABLE}
    if not fields:
        return get_settings(db)

    # office_hours is JSONB: psycopg2 cannot adapt a bare dict, and it has to be
    # CAST(... AS jsonb) rather than ::jsonb because the :: collides with
    # SQLAlchemy's named-parameter syntax. Same reasoning as notifier.py.
    assignments = ", ".join(
        f"{k} = CAST(:{k} AS jsonb)" if k in _SETTINGS_JSON_FIELDS else f"{k} = :{k}"
        for k in fields
    )
    params = dict(fields)
    for k in _SETTINGS_JSON_FIELDS:
        if k in params and params[k] is not None:
            params[k] = json.dumps(params[k])
    params["ub"] = updated_by
    db.execute(
        text(f"""
            UPDATE chat_settings
               SET {assignments}, updated_by = :ub, updated_at = now()
             WHERE id = 1
        """),
        params,
    )
    db.commit()
    return get_settings(db)


# ════════════════════════════════════════════════════════════════════
# Away / follow-up
# ════════════════════════════════════════════════════════════════════

def is_away(settings: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    """Should an incoming user message get the away auto-reply?

    Semantics, in order:
      • away_enabled = False        → never. The feature is off.
      • office_hours = NULL         → always away. This is the honest default
        for a one-person team: promise a delay rather than a fast reply you
        can't keep.
      • office_hours set            → away only outside those windows.

    office_hours = {"tz": "Asia/Jakarta", "days": [{"d": 0-6, "start": "09:00",
    "end": "18:00"}, ...]}, d = Monday 0. A malformed value falls back to
    "away", because a broken schedule must never silently promise availability.
    """
    if not settings.get("away_enabled"):
        return False

    hours = settings.get("office_hours")
    if not hours or not isinstance(hours, dict):
        return True

    days = hours.get("days")
    if not days:
        return True

    now = now or datetime.now(timezone.utc)
    tz_name = hours.get("tz") or "UTC"
    try:
        from zoneinfo import ZoneInfo

        local = now.astimezone(ZoneInfo(tz_name))
    except Exception:
        logger.warning("chat office_hours: bad tz %r, treating as away", tz_name)
        return True

    try:
        weekday = local.weekday()
        minutes_now = local.hour * 60 + local.minute
        for window in days:
            if int(window["d"]) != weekday:
                continue
            sh, sm = (int(x) for x in str(window["start"]).split(":"))
            eh, em = (int(x) for x in str(window["end"]).split(":"))
            if sh * 60 + sm <= minutes_now < eh * 60 + em:
                return False  # inside an office-hours window
    except Exception:
        logger.warning("chat office_hours: malformed window, treating as away")
        return True

    return True


def away_reply_due(db: Session, conversation_id: int, cooldown_min: int) -> bool:
    """True when this conversation has had no auto-reply inside the cooldown.

    Deduped in SQL rather than Redis so it still holds when Redis is down —
    without it, five messages in a row earn five identical "we're away" replies,
    which reads as a broken bot rather than a considerate one.
    """
    row = db.execute(
        text("""
            SELECT 1 FROM chat_messages
             WHERE conversation_id = :cid
               AND sender = 'system'
               AND kind = 'system'
               AND created_at > now() - make_interval(mins => :mins)
             LIMIT 1
        """),
        {"cid": conversation_id, "mins": max(0, cooldown_min)},
    ).fetchone()
    return row is None


def maybe_send_away_reply(db: Session, conversation_id: int) -> Optional[Dict[str, Any]]:
    """Append the away auto-reply if one is warranted. Returns it, or None.

    Called inline from the send handler rather than from the poller: it is pure
    Postgres with no external I/O, and a "we're away" that lands a minute later
    has already missed the moment it exists for.
    """
    try:
        settings = get_settings(db)
        if not is_away(settings):
            return None
        if not away_reply_due(db, conversation_id, settings.get("autoreply_cooldown_min") or 120):
            return None
        return append_message(
            db,
            conversation_id=conversation_id,
            sender="system",
            body=(settings.get("away_message") or DEFAULT_AWAY_MESSAGE),
            source="system",
            kind="system",
            # Generated by us — the admin does not need it mirrored back into
            # their own Telegram topic when phase 2 lands.
            relay_state="skipped",
        )
    except Exception as e:
        # Never let the courtesy reply break the user's actual send.
        logger.warning("away auto-reply skipped: %s", e)
        return None


# Only accounts created from this moment on are greeted. Without it, the first
# poll after deploy would have sent "Welcome to LuxQuant" to all 800 existing
# users, paying subscribers included — a mass unsolicited message dressed up as
# a welcome. Move this forward, never backward.
WELCOME_AUTO_SINCE = datetime(2026, 8, 5, 7, 0, tzinfo=timezone.utc)

# Marks the rows this function wrote, so "have we greeted them already" is one
# indexed lookup and needs no new column.
WELCOME_SOURCE = "welcome_auto"


def maybe_send_welcome(db: Session, user_id: int, created_at: Optional[datetime]) -> None:
    """Greet a genuinely new account once, on their first poll.

    Hung off the unread-count endpoint rather than off login: that is what the
    launcher polls when the app loads, so the message is already waiting when
    they arrive instead of appearing only after they think to open the chat.
    Half of all new accounts never come back after their first session, and a
    single return visit is worth six times the conversion rate — so the badge
    has to be there on that first visit or it has missed its moment.

    Silent on every failure. A greeting is never worth breaking the badge poll
    that every logged-in user makes.
    """
    try:
        if not created_at:
            return
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if created_at < WELCOME_AUTO_SINCE:
            return

        body = (get_settings(db).get("welcome_message") or "").strip()
        if not body:
            # Unset means the feature is off, which is also the kill switch:
            # clear it in the admin Chat settings and greetings stop at once.
            return

        already = db.execute(
            text("""SELECT 1 FROM chat_messages m
                    JOIN chat_conversations c ON c.id = m.conversation_id
                    WHERE c.user_id = :uid AND m.source = :src LIMIT 1"""),
            {"uid": user_id, "src": WELCOME_SOURCE},
        ).first()
        if already:
            return

        # Someone already talking to this person outranks a form letter.
        has_history = db.execute(
            text("""SELECT 1 FROM chat_messages m
                    JOIN chat_conversations c ON c.id = m.conversation_id
                    WHERE c.user_id = :uid LIMIT 1"""),
            {"uid": user_id},
        ).first()
        if has_history:
            return

        conv = get_or_create_conversation(db, user_id)
        append_message(
            db,
            conversation_id=conv["id"],
            sender="admin",
            body=body,
            source=WELCOME_SOURCE,
            # Written by us, so it must not be mirrored back into the admin's
            # own Telegram topic as though a human had typed it.
            relay_state="skipped",
        )
        logger.info("welcome sent to user_id=%s", user_id)
    except Exception as e:
        logger.warning("welcome skipped for user_id=%s: %s", user_id, e)


def conversations_awaiting_admin(db: Session, older_than_min: int, limit: int = 50) -> List[Dict[str, Any]]:
    """Open threads whose newest message is from the user and has gone
    unanswered longer than `older_than_min`. Drives the admin alert.
    """
    rows = db.execute(
        text("""
            SELECT c.id, c.user_id, c.last_seq, c.last_user_message_at,
                   u.username, u.role,
                   EXTRACT(EPOCH FROM (now() - c.last_user_message_at)) / 60 AS waiting_min,
                   (SELECT m.body FROM chat_messages m
                     WHERE m.conversation_id = c.id AND m.sender = 'user'
                     ORDER BY m.seq DESC LIMIT 1) AS last_body
              FROM chat_conversations c
              JOIN users u ON u.id = c.user_id
             WHERE c.status = 'open'
               AND c.last_user_message_at IS NOT NULL
               AND c.last_user_message_at < now() - make_interval(mins => :mins)
               AND (c.last_admin_message_at IS NULL
                    OR c.last_admin_message_at < c.last_user_message_at)
             ORDER BY c.last_user_message_at ASC
             LIMIT :lim
        """),
        {"mins": max(0, older_than_min), "lim": limit},
    ).mappings().all()
    return [dict(r) for r in rows]


def replies_unseen_by_user(db: Session, older_than_min: int, limit: int = 50) -> List[Dict[str, Any]]:
    """Admin replies the user still hasn't read after `older_than_min`.

    This is the whole offline-reach mechanism, and it works for every account
    regardless of auth provider — most users have no Telegram and the backend
    has no email sender, so the in-app bell is the only channel that reaches
    all of them.
    """
    rows = db.execute(
        text("""
            SELECT m.id AS message_id, m.conversation_id, m.seq, m.body,
                   c.user_id, u.username, u.telegram_id,
                   u.telegram_bot_started_at, u.telegram_in_group
              FROM chat_messages m
              JOIN chat_conversations c ON c.id = m.conversation_id
              JOIN users u ON u.id = c.user_id
             WHERE m.sender IN ('admin', 'ai')
               AND m.visibility = 'all'
               AND m.seq > c.user_last_read_seq
               AND m.created_at < now() - make_interval(mins => :mins)
               AND m.seq = c.last_seq
             ORDER BY m.created_at ASC
             LIMIT :lim
        """),
        {"mins": max(0, older_than_min), "lim": limit},
    ).mappings().all()
    return [dict(r) for r in rows]
