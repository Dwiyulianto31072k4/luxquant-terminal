"""
Admin Social Posts

Draft/approval API for social media post automation. Generation creates draft
artifacts only; publishing remains a separate explicit step.

Materials workflow (cost-aware):
  1. AI writes caption + detects entities
  2. Resolve logos/faces from library — if critical missing, save draft WITHOUT
     paying for AI image (image_mode=awaiting_materials)
  3. Admin uploads materials → re-render generates image once (or free recompose
     if raw background already exists)
"""

import json
import os
from datetime import datetime
from pathlib import Path
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
def list_social_posts(
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
def social_post_cost_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Aggregate generation costs (actual when tracked from API usage / billing schedule)."""
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
                coalesce(sum((gen_meta->>'search_count')::int), 0)            AS searches,
                count(*) FILTER (
                    WHERE gen_meta->>'cost_source' = 'actual'
                       OR gen_meta->>'cost_actual' = 'true'
                ) AS posts_actual,
                count(*) FILTER (
                    WHERE gen_meta ? 'total_usd'
                      AND coalesce(gen_meta->>'cost_source', 'estimated') NOT IN ('actual')
                      AND coalesce(gen_meta->>'cost_actual', 'false') <> 'true'
                ) AS posts_estimated
            FROM social_posts
            {where}
        """)).mappings().first()
        d = {k: float(v) if k.endswith("usd") else int(v) for k, v in dict(row).items()}
        d["avg_usd"] = round(d["total_usd"] / d["posts"], 6) if d["posts"] else 0.0
        d["tracking"] = "actual" if d.get("posts_actual") and not d.get("posts_estimated") else (
            "mixed" if d.get("posts_actual") else "estimated"
        )
        return d

    return {
        "all_time": _agg("WHERE gen_meta IS NOT NULL"),
        "last_7d": _agg("WHERE gen_meta IS NOT NULL AND created_at > now() - interval '7 days'"),
        "today": _agg("WHERE gen_meta IS NOT NULL AND created_at::date = now()::date"),
        "note": (
            "Chat: actual API tokens. OpenAI image: API usage when present, else official "
            "size×quality token schedule × published rates. xAI image / Tavily: published unit rates."
        ),
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
def delete_social_post(
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
def update_social_post_status(
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
    # Only primary brand + featured face block / show as required materials
    assets = resolve_entity_assets(
        entities,
        featured_person=featured,
        headline=row.get("headline") or "",
        visual_only=True,
    )
    return {
        "post_id": post_id,
        "headline": row.get("headline"),
        "entities": entities,
        "featured_person": featured,
        "primary_org": assets.get("primary_org"),
        "story_orgs": assets.get("story_orgs") or [],
        "verified_brand_names": assets.get("verified_brand_names") or [],
        "inventory": assets.get("inventory") or [],
        "needs_materials": bool(assets.get("needs_materials")),
        "missing_count": int(assets.get("missing_count") or 0),
        "qc_flags": assets.get("qc_flags") or [],
        "safe_mode": bool(assets.get("safe_mode")),
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
            if i.get("status") in ("missing", "needs_upload")
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
    admin_name = getattr(admin, "email", None) or getattr(admin, "username", "") or "admin"
    try:
        path = save_admin_upload(
            name=name,
            kind=kind,
            file_bytes=data,
            content_type=ctype,
            admin=str(admin_name),
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"ok": True, "name": name, "kind": kind, "path": path, "trusted": True, "source": "admin"}


@router.post("/{post_id}/materials/confirm")
async def confirm_post_material(
    post_id: int,
    name: str = Form(...),
    kind: str = Form("logo"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Confirm an existing library file as accurate (no re-upload). Safe-mode unlock."""
    from app.services.social_entity_assets import confirm_library_asset

    _get_post_row(db, post_id)
    kind = (kind or "logo").lower().strip()
    if kind not in ("logo", "face"):
        raise HTTPException(400, "kind must be logo or face")
    admin_name = getattr(admin, "email", None) or getattr(admin, "username", "") or "admin"
    path = confirm_library_asset(name=name, kind=kind, admin=str(admin_name))
    if not path:
        raise HTTPException(404, "No library file found to confirm — please upload instead")
    return {"ok": True, "name": name, "kind": kind, "path": path, "trusted": True, "source": "confirmed"}


@router.post("/{post_id}/re-render")
def re_render_post_image(
    post_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Generate or recompose image after admin uploads materials.

    Cost-aware:
      - If a raw AI background already exists → free recompose (logos + type only)
      - Else → one paid AI image generation with current materials
    """
    from app.services.social_entity_assets import resolve_entity_assets
    from app.services.social_image_generator import (
        find_raw_image,
        generate_ai_social_image,
        recompose_from_raw,
    )

    row = _get_post_row(db, post_id)
    meta = row.get("gen_meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    entities = meta.get("entities") or []
    featured = meta.get("featured_person")
    headline = row.get("headline") or "News"
    news_id = int(row["news_id"] or post_id)
    angle = row.get("angle")
    article_summary = row.get("caption") or headline

    assets = resolve_entity_assets(
        entities,
        featured_person=featured,
        headline=headline or "",
        visual_only=True,
    )
    if assets.get("needs_materials"):
        raise HTTPException(
            400,
            detail={
                "message": "Still missing primary materials — upload primary brand logo / face first",
                "missing": assets.get("critical_missing") or [],
                "missing_count": assets.get("missing_count") or 0,
            },
        )

    entity_logos = assets.get("logos") or []
    primary_logo = assets.get("primary_logo")
    raw_path = meta.get("raw_image_path") or find_raw_image(news_id)
    composed_free = False
    result_path = None
    image_mode = row.get("image_mode") or "ai_xai_poster"
    image_prompt = row.get("image_prompt")
    ref_path = row.get("reference_image_path")
    visual_materials = {
        "inventory": assets.get("inventory") or [],
        "needs_materials": False,
        "missing_count": 0,
        "qc_flags": assets.get("qc_flags") or [],
        "logos_resolved": len(entity_logos),
        "faces_resolved": len(assets.get("people") or []),
        "primary_org": assets.get("primary_org"),
        "primary_logo": primary_logo,
    }

    # Free recompose only for type-only fixes when brand is already baked into raw
    # (or no primary logo). If primary logo exists but prior mode wasn't brand-in-scene,
    # force a full AI pass so the mark is integrated into the photograph — never corner paste.
    prior_mode = str(row.get("image_mode") or "")
    brand_already_in_scene = "brand" in prior_mode
    can_free = (
        raw_path
        and Path(raw_path).exists()
        and (not primary_logo or brand_already_in_scene)
    )
    if can_free:
        try:
            slug_part = Path(raw_path).name.replace("ai_raw_", "ai_", 1)
            out_path = str(Path(raw_path).parent / slug_part)
            if out_path == raw_path:
                out_path = str(Path(SOCIAL_POST_ASSETS_DIR) / f"ai_{news_id}_recompose.png")
            recompose_from_raw(
                raw_path=raw_path,
                out_path=out_path,
                headline=headline,
                entity_logos=None,
                angle=angle,
            )
            result_path = out_path
            image_mode = f"{image_mode}_recompose" if image_mode else "recompose"
            composed_free = True
            visual_materials["raw_image_path"] = raw_path
            visual_materials["recompose_free"] = True
        except Exception:
            composed_free = False

    if not composed_free:
        result = generate_ai_social_image(
            news_id=news_id,
            headline=headline,
            article_summary=article_summary,
            source_domain=row.get("source_domain"),
            angle=angle,
            reference_image_url=row.get("reference_image_url"),
            override_prompt=image_prompt,
            featured_person=featured,
            entities=entities,
            skip_if_needs_materials=False,
            force=True,
        )
        if not result.image_path:
            raise HTTPException(500, result.error_message or "re-render failed")
        result_path = result.image_path
        image_mode = result.image_mode
        image_prompt = result.image_prompt or image_prompt
        ref_path = result.reference_image_path or ref_path
        if result.visual_materials:
            visual_materials = result.visual_materials

    meta["visual_materials"] = visual_materials
    meta["needs_materials"] = bool(visual_materials.get("needs_materials"))
    meta["qc_flags"] = visual_materials.get("qc_flags") or []
    meta["awaiting_image"] = False
    if visual_materials.get("raw_image_path"):
        meta["raw_image_path"] = visual_materials["raw_image_path"]
    elif raw_path:
        meta["raw_image_path"] = raw_path

    # Cost: only bill image if we actually hit the AI API (actual usage when present)
    if not composed_free:
        try:
            from app.services.social_cost import build_generation_cost
            vm = visual_materials if isinstance(visual_materials, dict) else {}
            add = build_generation_cost(
                chat_usage={},
                image_usage=vm.get("image_usage") or {},
                image_count=int(vm.get("image_api_calls") or 1),
                search_count=0,
                image_model=str(vm.get("image_model") or os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")),
                image_provider=str(vm.get("image_provider") or "openai"),
                image_size=str(vm.get("image_size") or os.environ.get("OPENAI_IMAGE_SIZE", "1024x1536")),
                image_quality=str(vm.get("image_quality") or os.environ.get("OPENAI_IMAGE_QUALITY", "medium")),
                image_is_edit=bool(vm.get("image_is_edit", True)),
            )
            prev_total = float(meta.get("total_usd") or 0)
            meta["image_count"] = int(meta.get("image_count") or 0) + int(add.get("image_count") or 1)
            meta["image_usd"] = round(float(meta.get("image_usd") or 0) + float(add.get("image_usd") or 0), 6)
            meta["total_usd"] = round(prev_total + float(add.get("image_usd") or 0), 6)
            meta["cost_source"] = add.get("cost_source") or meta.get("cost_source")
            meta["cost_actual"] = add.get("cost_source") == "actual"
            meta["image_source"] = add.get("image_source")
            if add.get("image_output_tokens"):
                meta["image_output_tokens"] = int(meta.get("image_output_tokens") or 0) + int(add["image_output_tokens"])
            if vm.get("image_provider"):
                meta["image_provider"] = vm.get("image_provider")
            if vm.get("image_model"):
                meta["image_model"] = vm.get("image_model")
        except Exception:
            pass

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
        "image_path": result_path,
        "image_mode": image_mode,
        "image_prompt": image_prompt,
        "reference_image_path": ref_path,
        "gen_meta": json.dumps(meta),
    })
    db.commit()
    out = _row_to_dict(_get_post_row(db, post_id))
    return {
        "ok": True,
        "post": out,
        "visual_materials": visual_materials,
        "recompose_free": composed_free,
    }


@router.post("/seed-logos")
async def seed_logos(
    admin: User = Depends(get_admin_user),
):
    """Best-effort seed of high-value brand logos into the asset library."""
    from app.services.social_entity_assets import seed_high_value_logos
    saved = seed_high_value_logos()
    return {"ok": True, "saved": saved, "count": len(saved)}
