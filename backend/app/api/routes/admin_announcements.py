"""
Announcements — admin write path (CRUD + image upload).
Admin-only. Lives separately from the user read path (announcements.py).
Images saved to /opt/luxquant/announcement-images, served at
/api/v1/announcement-images/<file> (mounted in main.py).
"""
import os
import uuid
import shutil
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from app.core.database import get_db
from app.api.deps import get_admin_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/admin/announcements", tags=["admin-announcements"])

# ── image storage (outside repo, persists across deploy) ──
ANNOUNCEMENT_IMAGES_DIR = os.environ.get(
    "ANNOUNCEMENT_IMAGES_DIR", "/opt/luxquant/announcement-images"
)
os.makedirs(ANNOUNCEMENT_IMAGES_DIR, exist_ok=True)
ALLOWED_IMG = [".jpg", ".jpeg", ".png", ".webp", ".gif"]


# ── schemas ──
class AnnouncementIn(BaseModel):
    title: str
    body: Optional[str] = None
    image_url: Optional[str] = None
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None
    audience: str = "all"            # all|role|user|no_telegram|paid_outside
    target_role: Optional[str] = None
    target_user_id: Optional[int] = None
    max_shows: int = 3
    cooldown_hours: int = 72
    status: str = "draft"            # draft|active|archived
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AnnouncementRow(AnnouncementIn):
    id: int
    created_at: datetime
    view_count: Optional[int] = 0     # how many users have seen it


# ── helpers ──
def _row_to_dict(r) -> dict:
    return {
        "id": r["id"], "title": r["title"], "body": r["body"],
        "image_url": r["image_url"], "cta_label": r["cta_label"], "cta_url": r["cta_url"],
        "audience": r["audience"], "target_role": r["target_role"],
        "target_user_id": r["target_user_id"], "max_shows": r["max_shows"],
        "cooldown_hours": r["cooldown_hours"], "status": r["status"],
        "starts_at": r["starts_at"], "ends_at": r["ends_at"],
        "created_at": r["created_at"], "view_count": r.get("view_count", 0),
    }


# ── list ──
@router.get("")
async def list_announcements(
    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)
):
    rows = db.execute(text("""
        SELECT a.*, COALESCE(vc.cnt, 0) AS view_count
        FROM announcements a
        LEFT JOIN (
            SELECT announcement_id, COUNT(*) AS cnt
            FROM announcement_views WHERE shows > 0
            GROUP BY announcement_id
        ) vc ON vc.announcement_id = a.id
        ORDER BY a.created_at DESC
    """)).mappings().all()
    return [_row_to_dict(r) for r in rows]


# ── create ──
@router.post("")
async def create_announcement(
    payload: AnnouncementIn,
    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)
):
    r = db.execute(text("""
        INSERT INTO announcements
            (title, body, image_url, cta_label, cta_url, audience, target_role,
             target_user_id, max_shows, cooldown_hours, status, starts_at, ends_at, created_by)
        VALUES
            (:title, :body, :image_url, :cta_label, :cta_url, :audience, :target_role,
             :target_user_id, :max_shows, :cooldown_hours, :status, :starts_at, :ends_at, :created_by)
        RETURNING id
    """), {**payload.model_dump(), "created_by": admin.id}).first()
    db.commit()
    return {"ok": True, "id": r[0]}


# ── update ──
@router.put("/{ann_id}")
async def update_announcement(
    ann_id: int, payload: AnnouncementIn,
    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)
):
    exists = db.execute(text("SELECT id FROM announcements WHERE id=:id"), {"id": ann_id}).first()
    if not exists:
        raise HTTPException(404, "Announcement not found")
    db.execute(text("""
        UPDATE announcements SET
            title=:title, body=:body, image_url=:image_url, cta_label=:cta_label,
            cta_url=:cta_url, audience=:audience, target_role=:target_role,
            target_user_id=:target_user_id, max_shows=:max_shows, cooldown_hours=:cooldown_hours,
            status=:status, starts_at=:starts_at, ends_at=:ends_at, updated_at=now()
        WHERE id=:id
    """), {**payload.model_dump(), "id": ann_id})
    db.commit()
    return {"ok": True}


# ── delete ──
@router.delete("/{ann_id}")
async def delete_announcement(
    ann_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)
):
    db.execute(text("DELETE FROM announcements WHERE id=:id"), {"id": ann_id})
    db.commit()
    return {"ok": True}


# ── image upload ──
@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    admin: User = Depends(get_admin_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMG:
        raise HTTPException(400, f"File type {ext} not allowed. Allowed: {', '.join(ALLOWED_IMG)}")
    fname = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(ANNOUNCEMENT_IMAGES_DIR, fname)
    with open(fpath, "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    # public URL served via static mount
    return {"ok": True, "image_url": f"/api/v1/announcement-images/{fname}"}
