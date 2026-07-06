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
from app.services.social_post_publisher import publish_ready_posts


router = APIRouter(prefix="/api/v1/admin/social-posts", tags=["admin-social-posts"])
SOCIAL_POST_ASSETS_DIR = os.environ.get("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts")


class GenerateDraftIn(BaseModel):
    news_id: Optional[int] = None
    platform: str = "x"
    limit: int = 1


class StatusIn(BaseModel):
    status: str
    scheduled_at: Optional[datetime] = None


class PublishApprovedIn(BaseModel):
    limit: int = 5
    dry_run: bool = False


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
               image_mode, image_prompt, reference_image_url, reference_image_path,
               gen_meta, created_at, updated_at
        FROM social_posts
        {where}
        ORDER BY created_at DESC
        LIMIT :limit
    """), params).mappings().all()
    return [_row_to_dict(r) for r in rows]


@router.get("/cost-summary")
async def social_post_cost_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Aggregate generation-cost estimates for business monitoring."""
    def _agg(where: str) -> dict:
        row = db.execute(text(f"""
            SELECT
                count(*) FILTER (WHERE gen_meta ? 'total_usd')                AS posts,
                coalesce(sum((gen_meta->>'total_usd')::numeric), 0)           AS total_usd,
                coalesce(sum((gen_meta->>'chat_usd')::numeric), 0)            AS chat_usd,
                coalesce(sum((gen_meta->>'image_usd')::numeric), 0)           AS image_usd,
                coalesce(sum((gen_meta->>'search_usd')::numeric), 0)          AS search_usd,
                coalesce(sum((gen_meta->>'prompt_tokens')::int), 0)           AS prompt_tokens,
                coalesce(sum((gen_meta->>'completion_tokens')::int), 0)       AS completion_tokens,
                coalesce(sum((gen_meta->>'image_count')::int), 0)             AS images,
                coalesce(sum((gen_meta->>'search_count')::int), 0)            AS searches
            FROM social_posts
            {where}
        """)).mappings().first()
        d = {k: float(v) if k.endswith("usd") else int(v) for k, v in dict(row).items()}
        d["avg_usd"] = round(d["total_usd"] / d["posts"], 6) if d["posts"] else 0.0
        return d

    return {
        "all_time": _agg("WHERE gen_meta IS NOT NULL"),
        "last_7d": _agg("WHERE gen_meta IS NOT NULL AND created_at > now() - interval '7 days'"),
        "today": _agg("WHERE gen_meta IS NOT NULL AND created_at::date = now()::date"),
    }


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


@router.post("/publish-approved")
async def publish_approved_social_posts(
    payload: PublishApprovedIn,
    admin: User = Depends(get_admin_user),
):
    if payload.limit < 1 or payload.limit > 25:
        raise HTTPException(400, "limit must be between 1 and 25")
    results = publish_ready_posts(limit=payload.limit, dry_run=payload.dry_run)
    return {"ok": True, "results": results}


@router.patch("/{post_id}/status")
async def update_social_post_status(
    post_id: int,
    payload: StatusIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if payload.status not in {"draft", "approved", "publishing", "posted", "rejected", "error"}:
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
