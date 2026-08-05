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
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services.social_generation_job import get_job, start_job
from app.services.social_news_worker import generate_drafts
from app.services.social_post_publisher import publish_ready_posts


logger = logging.getLogger(__name__)

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


_GEN_META_READY = False


def _ensure_gen_meta(db) -> None:
    """Make sure the cost column exists before we SELECT it (self-heal on fresh DBs).

    Once per process, not once per request: `ADD COLUMN IF NOT EXISTS` takes an
    ACCESS EXCLUSIVE lock even when the column already exists, and anything
    reading `social_posts` queues behind it. See app/core/database.py for what
    this cost on the `users` table.
    """
    global _GEN_META_READY
    if _GEN_META_READY:
        return
    try:
        db.execute(text("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS gen_meta JSONB"))
        db.commit()
        _GEN_META_READY = True
    except Exception:
        db.rollback()


def _build_caption_slide(post_id: int, headline: str, caption: str) -> Optional[str]:
    """Slide 2 of the carousel: the story as type, on our own ground.

    Free — no API call, just PIL — so it is rebuilt every time the poster is,
    and a caption edit is never left with a stale slide.
    """
    from app.services.social_image_generator import compose_caption_slide

    # A caption ends with furniture — source credit, the AI-illustration note,
    # the disclaimer, the read-more line, hashtags. On a slide those are noise,
    # and worse: the last paragraph gets the gold accent, so leaving them in put
    # the emphasis on a row of hashtags instead of on the point.
    skip = re.compile(
        r"^\s*(source\s*:|illustration|image generated|not financial advice|"
        r"disclaimer|read more|click the link|link in bio|#\S+(\s+#\S+)*\s*$)",
        re.I,
    )
    kept = [
        para.strip()
        for para in re.split(r"\n\s*\n", (caption or "").strip())
        if para.strip() and not skip.match(para.strip())
    ]
    body = "\n\n".join(kept)
    if len(body) < 40:                      # nothing worth a slide of its own
        return None
    out = str(Path(SOCIAL_POST_ASSETS_DIR) / f"slide2_{post_id}.png")
    try:
        return compose_caption_slide(body, out)
    except Exception:
        logger.warning("caption slide failed for post %s", post_id, exc_info=True)
        return None


def _asset_url(path: Optional[str]) -> Optional[str]:
    """Public URL for a rendered asset, stamped with the file's mtime.

    A re-compose writes the SAME filename, so without the stamp the browser
    keeps showing the previous render — which is exactly how a card that had
    already been fixed still looked wrong on screen.
    """
    if not path:
        return None
    try:
        rel = os.path.relpath(path, SOCIAL_POST_ASSETS_DIR)
        if rel.startswith(".."):
            return path
    except ValueError:
        return path
    try:
        stamp = int(os.path.getmtime(path))
    except OSError:
        stamp = 0
    return f"/api/v1/social-post-images/{rel}?v={stamp}"


def _row_to_dict(row) -> dict:
    data = dict(row)
    image_path = data.get("image_path")
    if image_path:
        data["image_url"] = _asset_url(image_path)
    meta_raw = data.get("gen_meta")
    _m = meta_raw if isinstance(meta_raw, dict) else {}
    slide2 = _m.get("slide2_path") if isinstance(_m, dict) else None
    if slide2:
        data["slide2_url"] = _asset_url(slide2)

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

    # Rows only live for the retention window now, so the spend of everything
    # older was rolled into social_post_spend_archive before deletion. Without
    # adding it back, "all time" would silently mean "the last two days".
    _has_archive = db.execute(
        text("SELECT to_regclass('public.social_post_spend_archive') IS NOT NULL")).scalar()

    _ARCHIVE_COLS = ("posts", "posts_actual", "posts_estimated", "total_usd", "chat_usd",
                     "image_usd", "search_usd", "prompt_tokens", "completion_tokens",
                     "images", "searches")

    def _archived(where: str) -> dict:
        if not _has_archive:
            return {k: 0 for k in _ARCHIVE_COLS}
        cols = ", ".join(f"coalesce(sum({c}), 0) AS {c}" for c in _ARCHIVE_COLS)
        row = db.execute(text(
            f"SELECT {cols} FROM social_post_spend_archive {where}")).mappings().first()
        return {k: float(v) if k.endswith("usd") else int(v) for k, v in dict(row).items()}

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
        return d

    def _window(live_where: str, archive_where: str) -> dict:
        d = _agg(live_where)
        for k, v in _archived(archive_where).items():
            d[k] = d.get(k, 0) + v
        d["avg_usd"] = round(d["total_usd"] / d["posts"], 6) if d["posts"] else 0.0
        d["tracking"] = "actual" if d.get("posts_actual") and not d.get("posts_estimated") else (
            "mixed" if d.get("posts_actual") else "estimated"
        )
        return d

    return {
        "all_time": _window("WHERE gen_meta IS NOT NULL", ""),
        # Counted in whole days on BOTH sides. The archive can only be per-day,
        # so an hour-based live boundary would split the edge day and make the
        # total drift either way depending on what time it is. Same boundary on
        # both = the last 7 calendar days, consistently.
        "last_7d": _window(
            "WHERE gen_meta IS NOT NULL AND created_at::date > (now() - interval '7 days')::date",
            "WHERE day > (now() - interval '7 days')::date"),
        "today": _window(
            "WHERE gen_meta IS NOT NULL AND created_at::date = now()::date",
            "WHERE day = now()::date"),
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
    _meta = _post_meta(row) or {}

    # The draft stores a snapshot of what was missing when it was written, so the
    # card list does not have to re-resolve every asset to render. But assets get
    # uploaded AFTER a draft exists, and then the snapshot is a lie that keeps
    # Approve greyed out while this very panel shows every logo as OK. We have
    # just resolved the truth — write it back.
    _live_needs = bool(assets.get("needs_materials"))
    _live_missing = int(assets.get("missing_count") or 0)
    if (bool(_meta.get("needs_materials")) != _live_needs
            or int((_meta.get("visual_materials") or {}).get("missing_count") or 0) != _live_missing):
        try:
            db.execute(text("""
                UPDATE social_posts
                SET gen_meta = COALESCE(gen_meta, '{}'::jsonb)
                    || jsonb_build_object('needs_materials', :needs)
                    || jsonb_build_object('visual_materials',
                           COALESCE(gen_meta->'visual_materials', '{}'::jsonb)
                           || jsonb_build_object('needs_materials', :needs,
                                                 'missing_count', :missing))
                WHERE id = :id
            """), {"id": post_id, "needs": _live_needs, "missing": _live_missing})
            db.commit()
            _meta["needs_materials"] = _live_needs
        except Exception:
            db.rollback()

    return {
        "post_id": post_id,
        "headline": row.get("headline"),
        # Carried so the panel can show WHY the last attempt failed: the HTTP
        # response that held the error usually died at the edge timeout.
        "last_image_error": _meta.get("last_image_error"),
        "last_image_error_at": _meta.get("last_image_error_at"),
        "last_image_attempt": _meta.get("last_image_attempt"),
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
    model: Optional[str] = None,
    quality: Optional[str] = None,
    provider: Optional[str] = None,
    # One-shot direction for THIS click only. The reusable one lives on the
    # draft (PUT /direction); this is for "same again but wider", which you do
    # not want stored and silently re-applied to every later render.
    note: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Generate or recompose the image on demand.

    Cost-aware:
      - If a raw background already exists → free recompose (type + lockup only)
      - Else → one paid AI image, on the model/quality the caller picked
    """
    # Log what was ASKED for, at the door. A poster came back from Grok when the
    # click was meant for GPT Image 2, and nothing in the logs said which
    # provider the request carried — so the diagnosis had to be reconstructed
    # from file timestamps and a suspiciously short 11-second run.
    logger.info(
        "re-render post=%s requested provider=%s model=%s quality=%s",
        post_id, provider or "auto", model or "default", quality or "default",
    )

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
    # Saved direction + this click's note, in that order: the standing
    # instruction first, the ad-hoc correction last so it wins.
    extra_prompt = "\n".join(
        p for p in [str(meta.get("custom_prompt") or "").strip(), (note or "").strip()] if p
    ) or None
    extra_refs = [r for r in (meta.get("extra_refs") or []) if isinstance(r, dict)]
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
        # Recompose only repaints the headline over the SAME background, so it
        # would silently ignore a new note or a newly attached reference and
        # hand back a picture that looks unchanged. If the editor is directing,
        # the render has to be real.
        and not (note or "").strip()
        and not extra_refs
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

    def _record_failure(message: str) -> None:
        """Write the error onto the draft.

        The HTTP response is often lost — Cloudflare cuts the connection at
        ~100s and a high-quality render runs past that — so an error that only
        travels in the response body is an error the admin never sees.
        """
        try:
            db.execute(text("""
                UPDATE social_posts
                SET gen_meta = COALESCE(gen_meta, '{}'::jsonb) || jsonb_build_object(
                        'last_image_error', :msg,
                        'last_image_error_at', to_char(now() at time zone 'utc',
                                                       'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                        'last_image_attempt', :attempt),
                    updated_at = now()
                WHERE id = :id
            """), {"id": post_id, "msg": message[:600],
                   "attempt": f"{provider or 'auto'} · {model or 'default'} · {quality or 'default'}"})
            db.commit()
        except Exception:
            db.rollback()

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
            # Chosen in the panel, per click: the same poster runs $0.013 on the
            # mini model and $0.19 at high quality. Anything unrecognised falls
            # back to the configured default inside the generator.
            image_model=model,
            image_quality=quality,
            force_provider=provider if provider in ("openai", "xai") else None,
            extra_prompt=extra_prompt,
            extra_refs=extra_refs,
        )
        if not result.image_path:
            _record_failure(result.error_message or "image generation returned nothing")
            raise HTTPException(
                502,
                {"message": result.error_message or "Image generation failed",
                 "attempt": f"{provider or 'auto'} · {model or 'default'}"},
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

    # The session was checked out before the image call and sat idle through it.
    # A high-quality render takes minutes, and Postgres closes the connection
    # underneath us in the meantime — pool_pre_ping only tests a connection when
    # it LEAVES the pool, so it cannot help here. That is how a poster that had
    # been generated and paid for still showed as "image paused": the file was
    # on disk and this UPDATE was the thing that died.
    #
    # One retry: rollback invalidates the dead connection, and the next
    # statement checks out a fresh (pre-pinged) one.
    meta["requested_provider"] = provider or "auto"
    meta["requested_model"] = model or "default"

    slide2 = _build_caption_slide(post_id, headline, row.get("caption") or "")
    if slide2:
        meta["slide2_path"] = slide2

    def _persist() -> None:
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
        db.execute(
            text("UPDATE social_posts SET gen_meta = gen_meta - 'last_image_error' "
                 "- 'last_image_error_at' - 'last_image_attempt' WHERE id = :id"),
            {"id": post_id},
        )
        db.commit()

    try:
        _persist()
    except OperationalError:
        try:
            db.rollback()
        except Exception:
            pass
        _persist()

    out = _row_to_dict(_get_post_row(db, post_id))
    return {
        "ok": True,
        "post": out,
        "visual_materials": visual_materials,
        "recompose_free": composed_free,
    }


def _post_meta(row) -> dict:
    meta = row.get("gen_meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    return meta or {}


@router.get("/spend-by-model")
def spend_by_model(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """What this feature has actually spent, split by what was chosen at generate time.

    Every draft carries its own cost block in gen_meta, written from the API's
    reported usage where available. This only reads those blocks — it never
    estimates on the fly, so a number here is a number that was recorded.
    """
    _ensure_gen_meta(db)
    days = max(1, min(int(days or 30), 365))

    totals = db.execute(text(f"""
        SELECT count(*) FILTER (WHERE gen_meta ? 'total_usd')                      AS drafts,
               round(coalesce(sum((gen_meta->>'total_usd')::numeric), 0), 4)       AS total_usd,
               round(coalesce(sum((gen_meta->>'image_usd')::numeric), 0), 4)       AS image_usd,
               round(coalesce(sum((gen_meta->>'chat_usd')::numeric), 0), 4)        AS chat_usd,
               round(coalesce(sum((gen_meta->>'search_usd')::numeric), 0), 4)      AS search_usd,
               count(*) FILTER (WHERE coalesce((gen_meta->>'image_usd')::numeric, 0) > 0) AS paid_images
        FROM social_posts
        WHERE created_at > now() - interval '{days} days'
    """)).fetchone()

    by_model = db.execute(text(f"""
        SELECT coalesce(nullif(gen_meta->>'image_model', ''), 'no image')          AS model,
               coalesce(nullif(gen_meta->>'image_quality', ''), '-')               AS quality,
               count(*)                                                            AS n,
               round(coalesce(sum((gen_meta->>'image_usd')::numeric), 0), 4)       AS usd,
               round(coalesce(avg(nullif((gen_meta->>'image_usd')::numeric, 0)), 0), 4) AS avg_usd
        FROM social_posts
        WHERE created_at > now() - interval '{days} days' AND gen_meta ? 'total_usd'
        GROUP BY 1, 2
        ORDER BY usd DESC
    """)).fetchall()

    daily = db.execute(text(f"""
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD')                AS day,
               count(*)                                                            AS n,
               round(coalesce(sum((gen_meta->>'total_usd')::numeric), 0), 4)       AS usd
        FROM social_posts
        WHERE created_at > now() - interval '{days} days' AND gen_meta ? 'total_usd'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    drafts = int(totals[0] or 0)
    total_usd = float(totals[1] or 0)
    return {
        "days": days,
        "drafts": drafts,
        "total_usd": total_usd,
        "avg_per_draft": round(total_usd / drafts, 4) if drafts else 0.0,
        "image_usd": float(totals[2] or 0),
        "chat_usd": float(totals[3] or 0),
        "search_usd": float(totals[4] or 0),
        "paid_images": int(totals[5] or 0),
        "by_model": [
            {"model": r[0], "quality": r[1], "count": int(r[2]),
             "usd": float(r[3]), "avg_usd": float(r[4])}
            for r in by_model
        ],
        "daily": [{"day": r[0], "count": int(r[1]), "usd": float(r[2])} for r in daily],
    }


@router.get("/{post_id}/manual-brief")
def manual_image_brief(
    post_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Copy-paste brief for generating the image yourself (e.g. Gemini): a ready prompt
    plus the exact brands/person to attach as references so the result stays accurate."""
    from app.services.social_entity_assets import resolve_entity_assets
    from app.services.social_image_generator import (
        BRAND_VISUAL_SIGNATURE,
        STYLE_KIT_NOTE,
        build_visual_prompt,
        strip_lighting,
    )

    row = _get_post_row(db, post_id)
    meta = _post_meta(row)
    entities = meta.get("entities") or []
    featured = meta.get("featured_person")
    headline = row.get("headline") or "News"
    angle = row.get("angle")
    summary = row.get("caption") or headline

    assets = resolve_entity_assets(
        entities, featured_person=featured, headline=headline or "", visual_only=True
    )
    # Only the brand the headline names goes into the frame; the rest are story
    # context and get an explicit "do not draw", or Gemini builds them too.
    brands = [b for b in (assets.get("hero_brand_names") or []) if b]
    context_brands = [b for b in (assets.get("support_brand_names") or []) if b]
    if not brands and assets.get("primary_org"):
        po = assets.get("primary_org") or {}
        if po.get("name"):
            brands = [po["name"]]

    # Prefer the editorial AI's story-specific scene (it was written with the full article
    # context), so the manual image stays tied to the actual news; fall back to the template.
    scene = (row.get("image_prompt") or "").strip() or build_visual_prompt(
        headline=headline,
        article_summary=summary,
        source_domain=row.get("source_domain"),
        angle=angle,
        reference_image_url=None,
    )

    # Plain, factual story context from the news row so the scene matches the event.
    story = ""
    try:
        nid = row.get("news_id")
        if nid:
            nr = db.execute(
                text("SELECT description, title FROM crypto_news WHERE id = :i"), {"i": int(nid)}
            ).fetchone()
            if nr:
                story = (nr[0] or nr[1] or "").strip()
    except Exception:
        story = ""
    if not story:
        story = (summary or "").strip()
    story = " ".join(story.split())[:600]

    # The stored image_prompt is the editorial scene plus ~250 words of style and
    # negatives glued on. Recover just the scene: the boilerplate is re-stated
    # below in a better order, and repeating it twice only dilutes it.
    for marker in (" Story institutions:", "Photorealistic premium financial-news"):
        cut = scene.find(marker)
        if cut > 40:
            scene = scene[:cut]
            break
    scene = strip_lighting(" ".join(scene.split()).strip())

    attach = [f"STYLE KIT: {STYLE_KIT_NOTE}"]
    if featured:
        attach.append(
            f"a real photo of {featured} — the face must be 1:1 identical, do not invent a "
            f"different person; place them centred, half to full body, not a floating head"
        )
    for b in brands:
        attach.append(
            f"the official {b} mark — build it LARGE and physical in the scene: a backlit sign on "
            f"the wall, a moulded 3D emblem, or the face of a product on a pedestal. This is the "
            f"prop that tells the reader what the story is about, so it should be unmistakable and "
            f"solid — never a flat corner sticker, never a faint ghost"
        )

    parts = [
        BRAND_VISUAL_SIGNATURE,
        "",
        "THIS STORY — the only part that changes between posters:",
        scene or headline,
        "",
        "STORY CONTEXT — the scene must match this event (never render any of this as text):",
        headline.rstrip(".") + ".",
        story,
        f"Source: {row.get('source_domain') or 'news'}. Angle: {(angle or 'news brief').replace('_', ' ')}.",
        "",
        "ATTACH, in this order:",
        "\n".join(f"{i}. {a}" for i, a in enumerate(attach, 1)),
        "If you cannot attach a face or a mark, show that subject through architecture and "
        "atmosphere instead — never guess a face and never invent a logo.",
        *(
            [
                "",
                "IN THE STORY BUT NOT IN THE PICTURE: "
                + ", ".join(context_brands)
                + ". The headline never names them, so do not draw their logo or wordmark "
                "anywhere — the poster must be about the headline and nothing else.",
            ]
            if context_brands
            else []
        ),
        "",
        "OUTPUT: vertical 4:5, 1024x1536.",
        "AVOID: readable text, captions or wordmarks drawn as typography anywhere in the frame; "
        "invented brand marks; fake chart labels or UI text; corner stickers; collage seams; "
        "daylight or flat white backgrounds; chains-on-books, padlocks, floating holographic coins, "
        "raining money and the rest of the crypto-cliché drawer.",
    ]
    prompt = "\n".join(parts)

    return {
        "post_id": post_id,
        "headline": headline,
        "story": story,
        "prompt": prompt,
        "aspect": "4:5 portrait (1024x1536)",
        "face": featured,
        "brands": brands,
        "context_brands": context_brands,
        "inventory": assets.get("inventory") or [],
    }


def _save_manual_image(db: Session, post_id: int, data: bytes) -> dict:
    """Write the uploaded background, compose the card, persist the result.

    Module-level and synchronous on purpose: a PIL compose plus two DB round-trips is
    far too slow for the event loop, so the async endpoint hands this to the threadpool
    in one hop (see backend/scripts/check_sync_db_on_loop.py for the incident behind it).
    """
    from app.services.social_image_generator import recompose_from_raw

    row = _get_post_row(db, post_id)
    news_id = int(row.get("news_id") or post_id)
    headline = row.get("headline") or "News"
    angle = row.get("angle")
    Path(SOCIAL_POST_ASSETS_DIR).mkdir(parents=True, exist_ok=True)
    raw_path = str(Path(SOCIAL_POST_ASSETS_DIR) / f"manual_raw_{post_id}.png")
    out_path = str(Path(SOCIAL_POST_ASSETS_DIR) / f"ai_{news_id}_manual_{post_id}.png")
    # PIL sniffs the real format on open, so a .png name is fine for jpg/webp bytes too.
    with open(raw_path, "wb") as fh:
        fh.write(data)
    try:
        recompose_from_raw(
            raw_path=raw_path,
            out_path=out_path,
            headline=headline,
            entity_logos=None,
            angle=angle,
        )
    except Exception as exc:
        raise HTTPException(400, f"could not process image: {type(exc).__name__}") from exc

    meta = _post_meta(row)
    meta["awaiting_image"] = False
    meta["needs_materials"] = False
    meta["manual_image"] = True
    meta["raw_image_path"] = raw_path
    meta["image_provider"] = "manual"
    meta["image_model"] = "manual_upload"
    vm = meta.get("visual_materials") or {}
    vm["needs_materials"] = False
    vm["manual_image"] = True
    meta["visual_materials"] = vm
    slide2 = _build_caption_slide(post_id, row.get("headline") or "", row.get("caption") or "")
    if slide2:
        meta["slide2_path"] = slide2

    db.execute(text("""
        UPDATE social_posts
        SET image_path = :image_path,
            image_mode = 'manual_upload',
            gen_meta = CAST(:gen_meta AS jsonb),
            updated_at = now()
        WHERE id = :id
    """), {"id": post_id, "image_path": out_path, "gen_meta": json.dumps(meta)})
    db.commit()
    return _row_to_dict(_get_post_row(db, post_id))


@router.post("/{post_id}/manual-image")
async def upload_manual_image(
    post_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Bring-your-own image: admin uploads an externally-generated background (e.g. from
    Gemini). We run the free LuxQuant compose (crop + gradient + red headline + logo) —
    no paid AI image call is made, so it adds $0 to the draft's cost."""
    data = await file.read()
    if not data or len(data) < 2_000:
        raise HTTPException(400, "image too small")
    if len(data) > 20_000_000:
        raise HTTPException(400, "image too large (max 20MB)")
    ctype = file.content_type or "image/png"
    if not ctype.startswith("image/"):
        raise HTTPException(400, "file must be an image")

    post = await run_in_threadpool(_save_manual_image, db, post_id, data)
    return {"ok": True, "post": post}


@router.post("/seed-logos")
async def seed_logos(
    admin: User = Depends(get_admin_user),
):
    """Best-effort seed of high-value brand logos into the asset library."""
    from app.services.social_entity_assets import seed_high_value_logos
    saved = seed_high_value_logos()
    return {"ok": True, "saved": saved, "count": len(saved)}


# ════════════════════════════════════════════════════════════════════════════
# Editor's own art direction: a saved prompt, one-shot notes, and extra
# reference images. Everything the pipeline could be told about a picture used
# to come from the editorial AI; the admin's only lever was to pick a model.
#
# Stored in gen_meta rather than new columns: the rows are pruned after two days
# anyway, so a migration would buy nothing that a jsonb key does not.
# ════════════════════════════════════════════════════════════════════════════

REF_DIR = Path(SOCIAL_POST_ASSETS_DIR) / "refs"
REF_ROLES_ALLOWED = ("subject", "scene", "style")
MAX_REFS_PER_POST = int(os.environ.get("SOCIAL_MAX_EXTRA_REFS", "6"))
_REF_EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


class CustomPromptIn(BaseModel):
    custom_prompt: str = ""


def _meta_of(row) -> dict:
    meta = row.get("gen_meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    return meta if isinstance(meta, dict) else {}


def _save_meta(db: Session, post_id: int, patch: dict) -> None:
    db.execute(
        text("""UPDATE social_posts
                   SET gen_meta = COALESCE(gen_meta, '{}'::jsonb) || CAST(:patch AS jsonb),
                       updated_at = now()
                 WHERE id = :id"""),
        {"id": post_id, "patch": json.dumps(patch)},
    )
    db.commit()


def _refs_of(row) -> list[dict]:
    refs = _meta_of(row).get("extra_refs") or []
    return [r for r in refs if isinstance(r, dict)]


@router.get("/image-models")
def list_image_models(admin: User = Depends(get_admin_user)):
    """Every selectable model with its computed price, for the picker.

    Computed, not typed: the four price strings the UI carried were right the
    day they were written and nothing kept them tied to the rate tables that do
    the billing.
    """
    from app.services.social_cost import estimate_image_usd, image_model_catalog

    size = os.environ.get("OPENAI_IMAGE_SIZE", "1024x1536")
    catalog = image_model_catalog(size)
    default_model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")
    default_quality = os.environ.get("OPENAI_IMAGE_QUALITY", "medium")
    max_calls = int(os.environ.get("SOCIAL_IMAGE_MAX_CALLS", "2"))
    for row in catalog:
        # What a story with BOTH a face and a brand really costs: the identity
        # pass plus the brand pass. That is the number that surprised us at
        # $0.40, and it is invisible if the picker only quotes one image.
        row["usd_two_pass"] = estimate_image_usd(
            model=row["model"], quality=row["quality"] or "medium", size=size, calls=max_calls
        )
        row["is_default"] = (
            row["model"] == default_model
            and (row["quality"] or default_quality) == default_quality
        )
    return {
        "models": catalog,
        "size": size,
        "max_calls": max_calls,
        "default": {"model": default_model, "quality": default_quality},
        "note": (
            "Prices are the OpenAI size×quality token schedule × published rates "
            "(xAI is flat per image). Measured against real drafts the schedule reads "
            "slightly high — $0.1872 where OpenAI billed $0.1736 — so treat it as a ceiling."
        ),
        "quality_note": (
            "Ranked by Artificial Analysis' image-EDITING Elo, not text-to-image: this "
            "pipeline sends an edit on nearly every render. The two boards disagree — "
            "gpt-image-2 leads text-to-image by 135 Elo over grok-imagine-image-quality "
            "but by only 28 on editing, at 3.7x the price. Tier scores are VibeDex's "
            "0-5 benchmark over 50 prompts (gpt-image-2 only; the arena measures one "
            "tier per model). Model strength and tier are separate axes and are not "
            "combined, because no benchmark has compared one model's low tier against "
            "another model."
        ),
    }


@router.get("/{post_id}/direction")
def get_post_direction(
    post_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """The saved prompt + attached references for this draft."""
    row = _get_post_row(db, post_id)
    meta = _meta_of(row)
    return {
        "custom_prompt": meta.get("custom_prompt") or "",
        "refs": [
            {k: r.get(k) for k in ("id", "role", "label", "filename", "added_at")}
            for r in _refs_of(row)
        ],
        "roles": list(REF_ROLES_ALLOWED),
        "max_refs": MAX_REFS_PER_POST,
    }


@router.put("/{post_id}/direction")
def set_post_direction(
    post_id: int,
    payload: CustomPromptIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Save the reusable prompt. Survives re-renders; one-shot notes do not."""
    _get_post_row(db, post_id)
    prompt = (payload.custom_prompt or "").strip()[:2000]
    _save_meta(db, post_id, {"custom_prompt": prompt})
    return {"ok": True, "custom_prompt": prompt}


@router.post("/{post_id}/refs")
async def add_post_ref(
    post_id: int,
    role: str = Form("style"),
    label: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Attach an extra reference image beyond the auto-resolved logos and faces.

    The materials endpoint only accepts a logo or a face, keyed to an entity the
    editorial AI already named — so a style board, a composition reference or a
    product shot had nowhere to go.
    """
    row = _get_post_row(db, post_id)
    role = (role or "style").lower().strip()
    if role not in REF_ROLES_ALLOWED:
        raise HTTPException(400, f"role must be one of {', '.join(REF_ROLES_ALLOWED)}")

    existing = _refs_of(row)
    if len(existing) >= MAX_REFS_PER_POST:
        raise HTTPException(400, f"at most {MAX_REFS_PER_POST} reference images per draft")

    data = await file.read()
    if not data or len(data) < 500:
        raise HTTPException(400, "file too small")
    if len(data) > 8_000_000:
        raise HTTPException(400, "file too large (max 8MB)")
    ctype = (file.content_type or "").split(";")[0].strip()
    if ctype not in _REF_EXT:
        raise HTTPException(400, "file must be a PNG, JPEG or WebP image")

    import uuid as _uuid

    ref_id = _uuid.uuid4().hex[:12]
    dest_dir = REF_DIR / str(post_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{ref_id}{_REF_EXT[ctype]}"
    dest.write_bytes(data)

    entry = {
        "id": ref_id,
        "role": role,
        "label": (label or "").strip()[:80],
        "path": str(dest),
        "filename": file.filename or dest.name,
        "added_at": datetime.utcnow().isoformat() + "Z",
    }
    _save_meta(db, post_id, {"extra_refs": existing + [entry]})
    return {"ok": True, "ref": {k: entry[k] for k in ("id", "role", "label", "filename", "added_at")}}


@router.get("/{post_id}/refs/{ref_id}/image")
def get_post_ref_image(
    post_id: int,
    ref_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    from fastapi.responses import FileResponse

    row = _get_post_row(db, post_id)
    for r in _refs_of(row):
        if r.get("id") == ref_id:
            p = Path(str(r.get("path") or ""))
            # Confine to the refs tree: the id comes from the URL, and a stored
            # path is only trustworthy because we wrote it.
            try:
                p.resolve().relative_to(REF_DIR.resolve())
            except (ValueError, OSError):
                raise HTTPException(404, "reference not found")
            if not p.exists():
                raise HTTPException(404, "reference file missing")
            return FileResponse(str(p))
    raise HTTPException(404, "reference not found")


@router.delete("/{post_id}/refs/{ref_id}")
def delete_post_ref(
    post_id: int,
    ref_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    row = _get_post_row(db, post_id)
    refs = _refs_of(row)
    keep = [r for r in refs if r.get("id") != ref_id]
    if len(keep) == len(refs):
        raise HTTPException(404, "reference not found")
    for r in refs:
        if r.get("id") == ref_id:
            try:
                p = Path(str(r.get("path") or ""))
                if p.exists() and p.resolve().is_relative_to(REF_DIR.resolve()):
                    p.unlink()
            except Exception:
                pass
    _save_meta(db, post_id, {"extra_refs": keep})
    return {"ok": True, "remaining": len(keep)}
