"""
Admin Social Posts

Draft/approval API for social media post automation. Generation creates draft
artifacts only; publishing remains a separate explicit step.
"""

import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services.social_news_worker import generate_drafts


router = APIRouter(prefix="/api/v1/admin/social-posts", tags=["admin-social-posts"])
SOCIAL_POST_ASSETS_DIR = os.environ.get("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts")


class GenerateDraftIn(BaseModel):
    news_id: Optional[int] = None
    platform: str = "x"
    limit: int = 1


class StatusIn(BaseModel):
    status: str
    scheduled_at: Optional[datetime] = None


def _row_to_dict(row) -> dict:
    data = dict(row)
    image_path = data.get("image_path")
    if image_path:
        try:
            rel = os.path.relpath(image_path, SOCIAL_POST_ASSETS_DIR)
            if not rel.startswith(".."):
                data["image_url"] = f"/api/v1/social-post-images/{rel}"
        except ValueError:
            data["image_url"] = image_path
    return data


@router.get("")
async def list_social_posts(
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    limit = max(1, min(limit, 100))
    where = ""
    params = {"limit": limit}
    if status:
        where = "WHERE status = :status"
        params["status"] = status

    rows = db.execute(text(f"""
        SELECT id, news_id, platform, status, angle, template_style, headline,
               caption, hashtags, image_path, score, source_url, source_domain,
               sources_json, scheduled_at, posted_at, posted_url, error_message,
               created_at, updated_at
        FROM social_posts
        {where}
        ORDER BY created_at DESC
        LIMIT :limit
    """), params).mappings().all()
    return [_row_to_dict(r) for r in rows]


@router.post("/generate-draft")
async def generate_social_post_draft(
    payload: GenerateDraftIn,
    admin: User = Depends(get_admin_user),
):
    if payload.limit < 1 or payload.limit > 5:
        raise HTTPException(400, "limit must be between 1 and 5")
    drafts = generate_drafts(
        news_id=payload.news_id,
        platform=payload.platform,
        limit=payload.limit,
        dry_run=False,
    )
    return {"ok": True, "drafts": drafts}


@router.patch("/{post_id}/status")
async def update_social_post_status(
    post_id: int,
    payload: StatusIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if payload.status not in {"draft", "approved", "posted", "rejected", "error"}:
        raise HTTPException(400, "invalid status")

    row = db.execute(text("SELECT id FROM social_posts WHERE id = :id"), {"id": post_id}).first()
    if not row:
        raise HTTPException(404, "social post not found")

    db.execute(text("""
        UPDATE social_posts
        SET status = :status,
            scheduled_at = :scheduled_at,
            updated_at = now()
        WHERE id = :id
    """), {
        "id": post_id,
        "status": payload.status,
        "scheduled_at": payload.scheduled_at,
    })
    db.commit()
    return {"ok": True}
