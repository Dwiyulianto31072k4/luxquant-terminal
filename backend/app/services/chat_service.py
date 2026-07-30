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

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MAX_BODY_CHARS = 4000
DEFAULT_PAGE = 200

SENDERS = frozenset(("user", "admin", "system", "ai"))
SOURCES = frozenset(("web", "admin_panel", "telegram_topic", "telegram_dm", "system"))


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
    return {
        "id": row["id"],
        "seq": row["seq"],
        "sender": row["sender"],
        "body": row["body"],
        "kind": row["kind"],
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
                    SELECT id, seq, sender, body, kind, client_msg_id, created_at
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
                RETURNING id, seq, sender, body, kind, client_msg_id, created_at
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
) -> List[Dict[str, Any]]:
    """Messages with seq > after_seq, oldest first.

    `include_admin_only=False` hides visibility='admin' rows — AI drafts and
    internal notes (phase 6). The user-facing route must never pass True.
    """
    limit = max(1, min(limit, 500))
    vis_clause = "" if include_admin_only else "AND visibility = 'all'"
    try:
        rows = db.execute(
            text(f"""
                SELECT id, seq, sender, body, kind, client_msg_id, created_at
                  FROM chat_messages
                 WHERE conversation_id = :cid
                   AND seq > :after
                   {vis_clause}
                 ORDER BY seq ASC
                 LIMIT :lim
            """),
            {"cid": conversation_id, "after": after_seq, "lim": limit},
        ).mappings().all()
    except Exception as e:
        _guard_schema(e)
        raise
    return [_msg_dict(r) for r in rows]


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


# ════════════════════════════════════════════════════════════════════
# Admin inbox
# ════════════════════════════════════════════════════════════════════

def admin_conversation_list(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    unread_only: bool = False,
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

    clause = " AND ".join(where)

    try:
        rows = db.execute(
            text(f"""
                SELECT c.id, c.user_id, c.status, c.last_seq,
                       c.admin_last_read_seq,
                       (c.last_seq - c.admin_last_read_seq) AS unread,
                       c.last_message_at, c.last_user_message_at,
                       c.last_admin_message_at, c.tg_topic_state,
                       c.handoff_sent_at, c.dm_bound_at,
                       u.username, u.email, u.role,
                       u.subscription_expires_at, u.telegram_id,
                       u.telegram_username, u.telegram_in_group,
                       u.last_active_at, u.created_at AS user_created_at,
                       (SELECT m.body FROM chat_messages m
                         WHERE m.conversation_id = c.id AND m.visibility = 'all'
                         ORDER BY m.seq DESC LIMIT 1) AS last_body,
                       (SELECT m.sender FROM chat_messages m
                         WHERE m.conversation_id = c.id AND m.visibility = 'all'
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

    assignments = ", ".join(f"{k} = :{k}" for k in fields)
    params = dict(fields)
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
