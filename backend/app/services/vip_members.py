"""Who is actually in the VIP group, and on whose authority.

Anyone holding an invite link can walk into the VIP group; nothing on the site
could say who those 278 people are, who let them in, or whether they ever paid.
The group had 278 members while the database claimed 129. This traces every
member back to a LuxQuant account (or names them as untraced), records how each
one got in, and lets an admin note or remove them from the web.

Two sources feed it, because neither is enough alone:

  * the bot's `chat_member` updates — live, and the ONLY place Telegram names
    the invite link a person used and who created it. Forward-looking only.
  * a periodic scan by the Telethon session that sits in the group (the Bot API
    cannot enumerate members at all) — fills in everyone who was already there,
    with their join date but no link attribution.

Nothing here removes anyone on its own: an untraced row is a question for a
human, and a wrong guess kicks a paying customer.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text

# Present = Telegram considers them inside the group.
PRESENT = ("creator", "administrator", "member", "restricted")

DDL = [
    """
    CREATE TABLE IF NOT EXISTS vip_members (
        telegram_id         BIGINT PRIMARY KEY,
        username            TEXT,
        full_name           TEXT,
        status              TEXT,
        present             BOOLEAN NOT NULL DEFAULT TRUE,
        joined_at           TIMESTAMPTZ,
        left_at             TIMESTAMPTZ,
        first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        invite_link         TEXT,
        invite_link_name    TEXT,
        invited_by_id       BIGINT,
        invited_by_username TEXT,
        join_source         TEXT,
        note                TEXT,
        note_at             TIMESTAMPTZ,
        note_by             INTEGER
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS vip_member_events (
        id               BIGSERIAL PRIMARY KEY,
        telegram_id      BIGINT NOT NULL,
        event            TEXT NOT NULL,
        at               TIMESTAMPTZ NOT NULL DEFAULT now(),
        old_status       TEXT,
        new_status       TEXT,
        invite_link      TEXT,
        invite_link_name TEXT,
        actor_id         BIGINT,
        actor_username   TEXT,
        source           TEXT NOT NULL DEFAULT 'chat_member',
        detail           JSONB
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_vip_events_member ON vip_member_events (telegram_id, at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_vip_members_present ON vip_members (present)",
]


def ensure_tables(db) -> None:
    for stmt in DDL:
        db.execute(text(stmt))
    db.commit()


def _name(u: dict) -> str:
    return " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip()


def record_chat_member_update(db, upd: dict) -> dict[str, Any] | None:
    """Store one `chat_member` update from the VIP group.

    This is the only moment Telegram tells us which invite link was used and who
    created it, so it is stored whether or not the person is traceable yet.
    """
    chat = upd.get("chat") or {}
    new = upd.get("new_chat_member") or {}
    old = upd.get("old_chat_member") or {}
    user = new.get("user") or {}
    tg_id = user.get("id")
    if not isinstance(tg_id, int):
        return None

    link = upd.get("invite_link") or {}
    creator = link.get("creator") or {}
    actor = upd.get("from") or {}
    new_status, old_status = new.get("status"), old.get("status")
    present = new_status in PRESENT
    was_present = old_status in PRESENT

    if present and not was_present:
        event = "joined"
    elif was_present and not present:
        # Telegram says "kicked" for a ban and "left" for a walk-out; an admin
        # removing someone shows as kicked with that admin in `from`.
        event = "kicked" if new_status == "kicked" or actor.get("id") not in (None, tg_id) else "left"
    else:
        event = f"status:{old_status}->{new_status}"

    db.execute(text("""
        INSERT INTO vip_member_events
            (telegram_id, event, old_status, new_status, invite_link, invite_link_name,
             actor_id, actor_username, source, detail)
        VALUES (:tid, :ev, :old, :new, :link, :lname, :aid, :auser, 'chat_member', CAST(:detail AS jsonb))
    """), {
        "tid": tg_id, "ev": event, "old": old_status, "new": new_status,
        "link": link.get("invite_link"), "lname": link.get("name"),
        "aid": actor.get("id"), "auser": actor.get("username"),
        "detail": json.dumps({"creator": creator.get("username") or creator.get("id"),
                              "chat_id": chat.get("id")}),
    })
    db.execute(text("""
        INSERT INTO vip_members (telegram_id, username, full_name, status, present, joined_at,
                                 left_at, invite_link, invite_link_name, invited_by_id,
                                 invited_by_username, join_source)
        VALUES (:tid, :uname, :name, :status, :present,
                CASE WHEN :joined THEN now() END, CASE WHEN :present THEN NULL ELSE now() END,
                :link, :lname, :cid, :cuser, :src)
        ON CONFLICT (telegram_id) DO UPDATE SET
            username = COALESCE(EXCLUDED.username, vip_members.username),
            full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), vip_members.full_name),
            status = EXCLUDED.status,
            present = EXCLUDED.present,
            last_seen_at = now(),
            joined_at = CASE WHEN :joined THEN now() ELSE vip_members.joined_at END,
            left_at = CASE WHEN :present THEN NULL ELSE now() END,
            -- Link attribution is only ever written by a join; a later status
            -- change must not erase how this person originally got in.
            invite_link = CASE WHEN :joined AND :link IS NOT NULL THEN :link ELSE vip_members.invite_link END,
            invite_link_name = CASE WHEN :joined AND :link IS NOT NULL THEN :lname ELSE vip_members.invite_link_name END,
            invited_by_id = CASE WHEN :joined AND :cid IS NOT NULL THEN :cid ELSE vip_members.invited_by_id END,
            invited_by_username = CASE WHEN :joined AND :cid IS NOT NULL THEN :cuser ELSE vip_members.invited_by_username END,
            join_source = CASE WHEN :joined THEN :src ELSE vip_members.join_source END
    """), {
        "tid": tg_id, "uname": user.get("username"), "name": _name(user),
        "status": new_status, "present": present, "joined": event == "joined",
        "link": link.get("invite_link"), "lname": link.get("name"),
        "cid": creator.get("id") or (actor.get("id") if actor.get("id") != tg_id else None),
        "cuser": creator.get("username") or (actor.get("username") if actor.get("id") != tg_id else None),
        "src": ("invite_link" if link else
                "added_by_admin" if actor.get("id") not in (None, tg_id) else "self"),
    })
    db.commit()
    return {"telegram_id": tg_id, "event": event, "link": link.get("name") or link.get("invite_link")}


# How a member is traced back to the site. Order matters: the first match wins.
TRACE_SQL = """
    CASE
        WHEN m.status IN ('creator', 'administrator') THEN 'admin'
        WHEN u.id IS NOT NULL AND (
                u.role IN ('admin', 'premium')
                OR (u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at > now())
             ) THEN 'account_active'
        -- Legacy outranks an expired subscription: those 219 people are
        -- entitled on their own pre-webapp terms, with or without a row here.
        WHEN l.telegram_id IS NOT NULL AND l.revoked IS NOT TRUE THEN 'legacy'
        WHEN u.id IS NOT NULL THEN 'account_expired'
        ELSE 'untraced'
    END
"""

BASE_SQL = f"""
    SELECT m.telegram_id, m.username, m.full_name, m.status, m.present,
           m.joined_at, m.left_at, m.first_seen_at, m.last_seen_at,
           m.invite_link_name, m.invited_by_username, m.invited_by_id, m.join_source,
           m.note, m.note_at,
           u.id AS user_id, u.username AS account, u.email, u.role,
           u.subscription_expires_at, u.created_at AS account_created_at,
           (l.telegram_id IS NOT NULL AND l.revoked IS NOT TRUE) AS legacy,
           {TRACE_SQL} AS trace
    FROM vip_members m
    LEFT JOIN users u ON u.telegram_id = m.telegram_id
    LEFT JOIN legacy_members l ON l.telegram_id = m.telegram_id
"""


def list_members(db, trace: str | None = None, q: str | None = None,
                 present: bool = True, limit: int = 500) -> dict[str, Any]:
    ensure_tables(db)
    where = ["m.present = :present"]
    params: dict[str, Any] = {"present": present, "limit": limit}
    if trace and trace != "all":
        where.append(f"({TRACE_SQL}) = :trace")
        params["trace"] = trace
    if q:
        where.append("(m.username ILIKE :q OR m.full_name ILIKE :q OR u.username ILIKE :q "
                     "OR u.email ILIKE :q OR CAST(m.telegram_id AS TEXT) LIKE :q)")
        params["q"] = f"%{q.strip()}%"
    rows = db.execute(text(
        BASE_SQL + " WHERE " + " AND ".join(where) +
        " ORDER BY (CASE WHEN " + TRACE_SQL + " = 'untraced' THEN 0 ELSE 1 END),"
        " m.joined_at DESC NULLS LAST, m.first_seen_at DESC LIMIT :limit"), params).fetchall()

    counts = dict(db.execute(text(f"""
        SELECT {TRACE_SQL} AS trace, count(*) FROM vip_members m
        LEFT JOIN users u ON u.telegram_id = m.telegram_id
        LEFT JOIN legacy_members l ON l.telegram_id = m.telegram_id
        WHERE m.present GROUP BY 1
    """)).fetchall())
    meta = db.execute(text("""
        SELECT max(last_seen_at), count(*) FILTER (WHERE present), count(*)
        FROM vip_members
    """)).first()
    return {
        "items": [dict(r._mapping) for r in rows],
        "counts": counts,
        "present_total": meta[1] or 0,
        "known_total": meta[2] or 0,
        "last_seen_at": meta[0].isoformat() if meta and meta[0] else None,
    }


def member_events(db, telegram_id: int, limit: int = 20) -> list[dict[str, Any]]:
    rows = db.execute(text("""
        SELECT event, at, old_status, new_status, invite_link_name, actor_username, source
        FROM vip_member_events WHERE telegram_id = :tid ORDER BY at DESC LIMIT :lim
    """), {"tid": telegram_id, "lim": limit}).fetchall()
    return [dict(r._mapping) for r in rows]


def set_note(db, telegram_id: int, note: str | None, admin_id: int) -> None:
    ensure_tables(db)
    db.execute(text("""
        INSERT INTO vip_members (telegram_id, note, note_at, note_by)
        VALUES (:tid, :note, now(), :by)
        ON CONFLICT (telegram_id) DO UPDATE
          SET note = :note, note_at = now(), note_by = :by
    """), {"tid": telegram_id, "note": (note or "").strip() or None, "by": admin_id})
    db.commit()


def record_removal(db, telegram_id: int, admin_id: int, admin_name: str) -> None:
    """Mark a removal made from the admin page, so the row explains itself."""
    db.execute(text("""
        INSERT INTO vip_member_events (telegram_id, event, new_status, actor_username, source, detail)
        VALUES (:tid, 'kicked', 'left', :who, 'admin', CAST(:d AS jsonb))
    """), {"tid": telegram_id, "who": admin_name, "d": json.dumps({"admin_user_id": admin_id})})
    db.execute(text("""
        UPDATE vip_members SET present = FALSE, status = 'left', left_at = now(), last_seen_at = now()
        WHERE telegram_id = :tid
    """), {"tid": telegram_id})
    db.commit()
