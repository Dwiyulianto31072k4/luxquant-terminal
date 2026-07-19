"""
Announcements — user-facing read path.
Serves the single most relevant active announcement for the current user,
honoring audience targeting, schedule, per-user frequency (max_shows +
cooldown), and stop-after-action.

Admin write path (create/edit/upload) lives in admin routes (separate layer).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/announcements", tags=["announcements"])


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: Optional[str] = None
    image_url: Optional[str] = None
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None


# ── audience predicate (server-side mirror of nudge conditions) ──
def _user_matches_audience(user: User, row) -> bool:
    aud = row["audience"]
    if aud == "all":
        return True
    if aud == "role":
        return (user.role or "free") == (row["target_role"] or "")
    if aud == "user":
        return user.id == row["target_user_id"]
    if aud == "no_telegram":
        return not user.telegram_id
    if aud == "paid_outside":
        has_access = user.has_active_access if hasattr(user, "has_active_access") else \
            (user.role in ("admin", "premium", "subscriber"))
        return bool(has_access) and bool(user.telegram_id) and not bool(user.telegram_in_group)
    return False


@router.get("/active", response_model=Optional[AnnouncementOut])
def get_active_announcement(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the single most relevant announcement to show right now, or null."""
    now = datetime.utcnow()

    # candidate set: active + in schedule window
    rows = db.execute(text("""
        SELECT a.id, a.title, a.body, a.image_url, a.cta_label, a.cta_url,
               a.audience, a.target_role, a.target_user_id,
               a.max_shows, a.cooldown_hours, a.created_at,
               v.shows, v.last_shown_at, v.acted_at
        FROM announcements a
        LEFT JOIN announcement_views v
               ON v.announcement_id = a.id AND v.user_id = :uid
        WHERE a.status = 'active'
          AND (a.starts_at IS NULL OR a.starts_at <= now())
          AND (a.ends_at   IS NULL OR a.ends_at   >= now())
        ORDER BY a.created_at DESC
    """), {"uid": user.id}).mappings().all()

    for row in rows:
        # audience filter
        if not _user_matches_audience(user, row):
            continue
        # already acted on CTA → never show again
        if row["acted_at"]:
            continue
        shows = row["shows"] or 0
        # exhausted max_shows
        if shows >= row["max_shows"]:
            continue
        # within cooldown?
        if row["last_shown_at"]:
            elapsed = (now - row["last_shown_at"].replace(tzinfo=None)).total_seconds()
            if elapsed < row["cooldown_hours"] * 3600:
                continue
        # first eligible wins (newest first)
        return AnnouncementOut(
            id=row["id"], title=row["title"], body=row["body"],
            image_url=row["image_url"], cta_label=row["cta_label"],
            cta_url=row["cta_url"],
        )
    return None


def _upsert_view(db: Session, ann_id: int, uid: int, field: Optional[str] = None, bump_show: bool = False):
    """Ensure a view row exists; optionally bump shows / set a timestamp field."""
    db.execute(text("""
        INSERT INTO announcement_views (announcement_id, user_id, shows)
        VALUES (:aid, :uid, 0)
        ON CONFLICT (announcement_id, user_id) DO NOTHING
    """), {"aid": ann_id, "uid": uid})
    if bump_show:
        db.execute(text("""
            UPDATE announcement_views
            SET shows = shows + 1, last_shown_at = now()
            WHERE announcement_id = :aid AND user_id = :uid
        """), {"aid": ann_id, "uid": uid})
    if field in ("dismissed_at", "acted_at"):
        db.execute(text(f"""
            UPDATE announcement_views
            SET {field} = now()
            WHERE announcement_id = :aid AND user_id = :uid
        """), {"aid": ann_id, "uid": uid})
    db.commit()


@router.post("/{ann_id}/seen")
async def mark_seen(ann_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Called when the modal is actually shown — bumps shows + cooldown clock."""
    _upsert_view(db, ann_id, user.id, bump_show=True)
    return {"ok": True}


@router.post("/{ann_id}/dismiss")
async def mark_dismiss(ann_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Called when user closes the modal (X / later / outside click)."""
    _upsert_view(db, ann_id, user.id, field="dismissed_at")
    return {"ok": True}


@router.post("/{ann_id}/act")
async def mark_act(ann_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Called when user clicks the CTA — stop showing this announcement."""
    _upsert_view(db, ann_id, user.id, field="acted_at")
    return {"ok": True}
