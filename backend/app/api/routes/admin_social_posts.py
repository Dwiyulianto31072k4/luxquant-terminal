"""
Admin Social Posts

Draft/approval API for social media post automation. Generation creates draft
artifacts only; publishing remains a separate explicit step.

Materials workflow:
  1. AI extracts entities (orgs/people) → gen_meta.visual_materials
  2. Missing logos/faces are listed as needs_materials for admin upload
  3. Admin uploads file → asset library → re-render image
"""

import json
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services.social_generation_job import get_job, start_job
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


def _ensure_gen_meta(db) -> None:
    """Make sure the cost column exists before we SELECT it (self-heal on fresh DBs)."""
    try:
        db.execute(text("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS gen_meta JSONB"))
        db.commit()
    except Exception:
        db.rollback()


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
    # Normalize gen_meta JSON
    meta = data.get("gen_meta")
    if isinstance(meta, str):
        try:
            data["gen_meta"] = json.loads(meta)
        except Exception:
            pass
    return data


@router.get("")
async def list_social_posts(
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    _ensure_gen_meta(db)
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
    _ensure_gen_meta(db)

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


@router.get("/generation-status")
async def generation_status(
    admin: User = Depends(get_admin_user),
):
    """Live generation job status (survives page refresh). Client polls this."""
    job = get_job()
    if not job:
        return {"active": False, "status": "idle", "job": None}
    return {
        "active": job.get("status") == "running",
        "status": job.get("status") or "idle",
        "job": job,
    }


@router.post("/generate-draft")
async def generate_social_post_draft(
    payload: GenerateDraftIn,
    background_tasks: BackgroundTasks,
    admin: User = Depends(get_admin_user),
):
    if payload.limit < 1 or payload.limit > 5:
        raise HTTPException(400, "limit must be between 1 and 5")

    # Block concurrent runs so progress UI stays accurate.
    existing = get_job()
    if existing and existing.get("status") == "running":
        raise HTTPException(
            409,
            detail={
                "message": "A generation job is already running",
                "job": existing,
            },
        )

    # The full pipeline (search + AI text + AI image) can take 1-2 minutes, which
    # exceeds Cloudflare's ~100s origin timeout. Run it in the background and return
    # immediately; the client polls /generation-status for live progress.
    admin_name = getattr(admin, "email", None) or getattr(admin, "username", "") or str(getattr(admin, "id", ""))
    job = start_job(
        news_id=payload.news_id,
        platform=payload.platform,
        limit=payload.limit,
        admin=str(admin_name or ""),
    )
    background_tasks.add_task(
        generate_drafts,
        news_id=payload.news_id,
        platform=payload.platform,
        limit=payload.limit,
        dry_run=False,
        track_job=True,
    )
    return {"ok": True, "status": "generating", "job": job}


@router.post("/publish-approved")
async def publish_approved_social_posts(
    payload: PublishApprovedIn,
    admin: User = Depends(get_admin_user),
):
    if payload.limit < 1 or payload.limit > 25:
        raise HTTPException(400, "limit must be between 1 and 25")
    results = publish_ready_posts(limit=payload.limit, dry_run=payload.dry_run)
    return {"ok": True, "results": results}


@router.delete("/{post_id}")
async def delete_social_post(
    post_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Delete a social post draft (any status)."""
    res = db.execute(text("DELETE FROM social_posts WHERE id = :id"), {"id": post_id})
    db.commit()
    if res.rowcount == 0:
        raise HTTPException(404, "social post not found")
    return {"ok": True, "deleted": post_id}


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


def _get_post_row(db: Session, post_id: int):
    row = db.execute(text("""
        SELECT id, news_id, platform, status, angle, headline, caption, hashtags,
               image_path, image_mode, image_prompt, source_domain, source_url,
               sources_json, gen_meta, reference_image_url, reference_image_path
        FROM social_posts WHERE id = :id
    """), {"id": post_id}).mappings().first()
    if not row:
        raise HTTPException(404, "social post not found")
    return dict(row)


@router.get("/{post_id}/materials")
async def get_post_materials(
    post_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """List AI-detected entities and which materials are still missing for admin upload."""
    from app.services.social_entity_assets import resolve_entity_assets

    row = _get_post_row(db, post_id)
    meta = row.get("gen_meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    entities = meta.get("entities") or []
    featured = meta.get("featured_person")
    assets = resolve_entity_assets(entities, featured_person=featured)
    return {
        "post_id": post_id,
        "headline": row.get("headline"),
        "entities": entities,
        "featured_person": featured,
        "inventory": assets.get("inventory") or [],
        "needs_materials": bool(assets.get("needs_materials")),
        "missing_count": int(assets.get("missing_count") or 0),
        "qc_flags": assets.get("qc_flags") or [],
        "requests": [
            {
                "name": i["name"],
                "kind": i["kind"],
                "type": i["type"],
                "role": i.get("role"),
                "message": i.get("request"),
                "status": i["status"],
            }
            for i in (assets.get("inventory") or [])
            if i.get("status") == "missing"
        ],
    }


@router.post("/{post_id}/materials")
async def upload_post_material(
    post_id: int,
    name: str = Form(...),
    kind: str = Form("logo"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Admin supplies a missing logo/face. Saves into the asset library."""
    from app.services.social_entity_assets import save_admin_upload

    _get_post_row(db, post_id)
    kind = (kind or "logo").lower().strip()
    if kind not in ("logo", "face"):
        raise HTTPException(400, "kind must be logo or face")
    data = await file.read()
    if not data or len(data) < 500:
        raise HTTPException(400, "file too small")
    if len(data) > 8_000_000:
        raise HTTPException(400, "file too large (max 8MB)")
    ctype = file.content_type or "image/png"
    if not ctype.startswith("image/"):
        raise HTTPException(400, "file must be an image")
    try:
        path = save_admin_upload(name=name, kind=kind, file_bytes=data, content_type=ctype)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"ok": True, "name": name, "kind": kind, "path": path}


@router.post("/{post_id}/re-render")
async def re_render_post_image(
    post_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Re-generate the image using current entity assets (after admin uploads)."""
    from app.services.social_image_generator import generate_ai_social_image

    row = _get_post_row(db, post_id)
    meta = row.get("gen_meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    entities = meta.get("entities") or []
    featured = meta.get("featured_person")
    article_summary = row.get("caption") or row.get("headline") or ""

    result = generate_ai_social_image(
        news_id=int(row["news_id"] or post_id),
        headline=row.get("headline") or "News",
        article_summary=article_summary,
        source_domain=row.get("source_domain"),
        angle=row.get("angle"),
        reference_image_url=row.get("reference_image_url"),
        override_prompt=row.get("image_prompt"),
        featured_person=featured,
        entities=entities,
    )
    if not result.image_path:
        raise HTTPException(500, result.error_message or "re-render failed")

    # Merge visual materials into gen_meta
    if result.visual_materials:
        meta["visual_materials"] = result.visual_materials
        meta["needs_materials"] = bool(result.visual_materials.get("needs_materials"))
        meta["qc_flags"] = result.visual_materials.get("qc_flags") or []

    db.execute(text("""
        UPDATE social_posts
        SET image_path = :image_path,
            image_mode = :image_mode,
            image_prompt = COALESCE(:image_prompt, image_prompt),
            reference_image_path = :reference_image_path,
            gen_meta = CAST(:gen_meta AS jsonb),
            updated_at = now()
        WHERE id = :id
    """), {
        "id": post_id,
        "image_path": result.image_path,
        "image_mode": result.image_mode,
        "image_prompt": result.image_prompt,
        "reference_image_path": result.reference_image_path,
        "gen_meta": json.dumps(meta),
    })
    db.commit()
    out = _row_to_dict(_get_post_row(db, post_id))
    return {"ok": True, "post": out, "visual_materials": result.visual_materials}


@router.post("/seed-logos")
async def seed_logos(
    admin: User = Depends(get_admin_user),
):
    """Best-effort seed of high-value brand logos into the asset library."""
    from app.services.social_entity_assets import seed_high_value_logos
    saved = seed_high_value_logos()
    return {"ok": True, "saved": saved, "count": len(saved)}
