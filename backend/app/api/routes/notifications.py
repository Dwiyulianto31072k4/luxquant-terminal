# backend/app/api/routes/notifications.py
"""
LuxQuant Terminal - Notifications API Routes

HYBRID READ TRACKING (v2)
-------------------------
A notification is UNREAD for user X if ALL conditions met:

  1. Visible: n.user_id = X  OR  n.user_id IS NULL (broadcast)
  2. Newer than cutoff: n.created_at > X.notifications_read_at
  3. Not individually read:
       Personal  -> n.is_read = false
       Broadcast -> no row in notification_reads

"Mark all read" = UPDATE users.notifications_read_at = NOW().
  All notifs below cutoff become "read", persistent in DB,
  safe across backend restarts.

"Click single notif" = update is_read=true (personal) or insert
  notification_reads (broadcast). Per-notif tracking preserved
  for granular UX in notification list.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ============ Schemas ============

class NotificationItem(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str] = None
    data: Optional[dict] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: List[NotificationItem]
    total: int
    unread_count: int


class NotificationUnreadCount(BaseModel):
    unread_count: int


class AdminBroadcast(BaseModel):
    title: str
    body: str
    type: str = "admin_broadcast"


# ============ Helpers ============

def require_admin(user: User):
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )


def _get_read_cutoff(db: Session, user_id: int) -> datetime:
    """
    Fetch user's notifications_read_at cutoff timestamp.
    Defensive: if null (legacy edge case), fallback to epoch.
    """
    result = db.execute(
        text("SELECT notifications_read_at FROM users WHERE id = :uid"),
        {"uid": user_id}
    ).scalar()
    if result is None:
        return datetime(1970, 1, 1)
    return result


# ============ SQL Fragments (DRY) ============
# Use :uid and :read_at as bound params

_VISIBLE = "(n.user_id = :uid OR n.user_id IS NULL)"

_UNREAD_PREDICATE = """
    n.created_at > :read_at
    AND NOT (
        (n.user_id = :uid AND n.is_read = true)
        OR
        (n.user_id IS NULL AND EXISTS (
            SELECT 1 FROM notification_reads nr
            WHERE nr.notification_id = n.id AND nr.user_id = :uid
        ))
    )
"""

_IS_READ_FIELD = """
    CASE
        WHEN n.created_at <= :read_at THEN true
        WHEN n.user_id = :uid AND n.is_read = true THEN true
        WHEN n.user_id IS NULL AND EXISTS (
            SELECT 1 FROM notification_reads nr
            WHERE nr.notification_id = n.id AND nr.user_id = :uid
        ) THEN true
        ELSE false
    END
"""


# ============ User Endpoints ============

@router.get("/", response_model=NotificationListResponse)
async def get_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    type_filter: Optional[str] = Query(None, alias="type"),
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notifications for current user (personal + broadcasts)"""

    read_at = _get_read_cutoff(db, current_user.id)

    conditions = [_VISIBLE]
    params = {"uid": current_user.id, "read_at": read_at}

    if type_filter:
        conditions.append("n.type = :type_filter")
        params["type_filter"] = type_filter

    if unread_only:
        conditions.append(_UNREAD_PREDICATE)

    where = " AND ".join(conditions)

    # Count total (after filter, before pagination)
    total = db.execute(
        text(f"SELECT COUNT(*) FROM notifications n WHERE {where}"),
        params
    ).scalar() or 0

    # Count unread (always uses full unread predicate, not filter)
    unread_count = db.execute(
        text(f"""
            SELECT COUNT(*) FROM notifications n
            WHERE {_VISIBLE}
            AND {_UNREAD_PREDICATE}
        """),
        {"uid": current_user.id, "read_at": read_at}
    ).scalar() or 0

    # Fetch paginated rows
    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    rows = db.execute(text(f"""
        SELECT n.id, n.type, n.title, n.body, n.data, n.source_type, n.source_id,
               {_IS_READ_FIELD} as is_read,
               n.created_at
        FROM notifications n
        WHERE {where}
        ORDER BY n.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params).fetchall()

    items = [
        NotificationItem(
            id=r[0], type=r[1], title=r[2], body=r[3], data=r[4],
            source_type=r[5], source_id=r[6], is_read=bool(r[7]), created_at=r[8],
        )
        for r in rows
    ]

    return NotificationListResponse(items=items, total=total, unread_count=unread_count)


@router.get("/unread-count", response_model=NotificationUnreadCount)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get unread notification count (for bell badge)"""

    read_at = _get_read_cutoff(db, current_user.id)

    count = db.execute(
        text(f"""
            SELECT COUNT(*) FROM notifications n
            WHERE {_VISIBLE}
            AND {_UNREAD_PREDICATE}
        """),
        {"uid": current_user.id, "read_at": read_at}
    ).scalar() or 0

    return NotificationUnreadCount(unread_count=count)


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a single notification as read (per-notif granular).
    Personal  -> flip is_read=true
    Broadcast -> insert into notification_reads
    """

    notif = db.execute(text("""
        SELECT id, user_id FROM notifications
        WHERE id = :id AND (user_id = :uid OR user_id IS NULL)
    """), {"id": notification_id, "uid": current_user.id}).fetchone()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notif[1] == current_user.id:
        # Personal notif
        db.execute(
            text("UPDATE notifications SET is_read = true WHERE id = :id"),
            {"id": notification_id}
        )
    else:
        # Broadcast (user_id IS NULL)
        db.execute(text("""
            INSERT INTO notification_reads (notification_id, user_id)
            VALUES (:nid, :uid) ON CONFLICT (notification_id, user_id) DO NOTHING
        """), {"nid": notification_id, "uid": current_user.id})

    db.commit()
    return {"message": "Marked as read", "id": notification_id}


@router.post("/read-all")
async def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark all notifications as read using cutoff timestamp.

    Strategy:
      1. UPDATE users.notifications_read_at = NOW()
         All notifs before NOW() become "read", persistent.
      2. (Bonus) UPDATE personal is_read=true for list view consistency.

    Note: We do NOT bulk-insert into notification_reads anymore.
    The cutoff timestamp replaces that need.
    Notifs created AFTER NOW() = unread (intended behavior).
    """

    # 1. Set cutoff timestamp - the main mechanism
    db.execute(
        text("UPDATE users SET notifications_read_at = NOW() WHERE id = :uid"),
        {"uid": current_user.id}
    )

    # 2. Bonus consistency: flip personal is_read=true
    #    (not strictly needed for unread count, but nice for list view)
    db.execute(
        text("""
            UPDATE notifications SET is_read = true
            WHERE user_id = :uid AND is_read = false
        """),
        {"uid": current_user.id}
    )

    db.commit()
    return {"message": "All notifications marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a personal notification"""

    result = db.execute(text("""
        DELETE FROM notifications WHERE id = :id AND user_id = :uid
    """), {"id": notification_id, "uid": current_user.id})
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Notification not found or cannot be deleted")

    return {"message": "Notification deleted", "id": notification_id}


# ============ Channel Messages Endpoint ============

@router.get("/channel-messages")
async def get_channel_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    type_filter: Optional[str] = Query(None, alias="type"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get channel messages (price_pump, daily_results, etc.)"""

    conditions = ["1=1"]
    params = {}

    if type_filter:
        conditions.append("message_type = :type_filter")
        params["type_filter"] = type_filter

    where = " AND ".join(conditions)

    total = db.execute(
        text(f"SELECT COUNT(*) FROM channel_messages WHERE {where}"),
        params
    ).scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    rows = db.execute(text(f"""
        SELECT id, message_type, pair, percentage, direction, summary_data,
               raw_text, message_date, created_at
        FROM channel_messages
        WHERE {where}
        ORDER BY message_date DESC
        LIMIT :limit OFFSET :offset
    """), params).fetchall()

    items = [
        {
            "id": r[0], "message_type": r[1], "pair": r[2],
            "percentage": r[3], "direction": r[4], "summary_data": r[5],
            "raw_text": r[6],
            "message_date": r[7].isoformat() if r[7] else None,
            "created_at": r[8].isoformat() if r[8] else None,
        }
        for r in rows
    ]

    return {"items": items, "total": total}


# ============ Admin Endpoints ============

@router.post("/broadcast")
async def send_broadcast(
    data: AdminBroadcast,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send broadcast notification to all users (admin only)"""
    require_admin(current_user)

    db.execute(text("""
        INSERT INTO notifications (user_id, type, title, body, source_type)
        VALUES (NULL, :type, :title, :body, 'system')
    """), {"type": data.type, "title": data.title, "body": data.body})
    db.commit()

    return {"message": "Broadcast sent", "title": data.title}


@router.get("/admin/recent")
async def admin_get_recent_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all recent notifications (admin only)"""
    require_admin(current_user)

    offset = (page - 1) * page_size

    rows = db.execute(text("""
        SELECT n.id, n.user_id, n.type, n.title, n.body, n.data, n.created_at,
               u.username
        FROM notifications n
        LEFT JOIN users u ON n.user_id = u.id
        ORDER BY n.created_at DESC
        LIMIT :limit OFFSET :offset
    """), {"limit": page_size, "offset": offset}).fetchall()

    total = db.execute(text("SELECT COUNT(*) FROM notifications")).scalar() or 0

    items = [
        {
            "id": r[0], "user_id": r[1], "type": r[2], "title": r[3],
            "body": r[4], "data": r[5],
            "created_at": r[6].isoformat() if r[6] else None,
            "username": r[7] or "Broadcast",
        }
        for r in rows
    ]

    return {"items": items, "total": total}
