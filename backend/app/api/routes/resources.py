# app/api/routes/resources.py
# ════════════════════════════════════════════════════════════════════
# Resource Hub — unified content CMS (research articles / PDF tips /
# YouTube videos / external links), CoinGecko-Research style.
#
# Public read path + admin write path live together here.
#   • article  — HTML/Markdown body authored in-app
#   • pdf      — uploaded PDF module (legacy "Tips")
#   • video    — YouTube/Vimeo link, embed + thumbnail via oEmbed
#   • link     — any URL, preview card via Open Graph tags
# ════════════════════════════════════════════════════════════════════
import os
import re
import uuid
import shutil
from datetime import datetime
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_
from pydantic import BaseModel

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.resource import Resource

router = APIRouter(prefix="/resources", tags=["resources"])

# ============ Config ============
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
UPLOAD_DIR = os.path.join(_ROOT, "uploads", "resources")
PDF_DIR = os.path.join(UPLOAD_DIR, "pdfs")
COVER_DIR = os.path.join(UPLOAD_DIR, "covers")
# Legacy tips dirs — kept for serving already-migrated files.
LEGACY_PDF_DIR = os.path.join(_ROOT, "uploads", "tips", "pdfs")
LEGACY_COVER_DIR = os.path.join(_ROOT, "uploads", "tips", "covers")

os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(COVER_DIR, exist_ok=True)

VALID_TYPES = {"article", "pdf", "video", "link"}


# ============ Schemas ============

class ResourceOut(BaseModel):
    id: int
    type: str
    title: str
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    content_format: str = "html"
    cover_image: Optional[str] = None
    cover_is_external: bool = False
    pdf_path: Optional[str] = None
    source_url: Optional[str] = None
    embed_html: Optional[str] = None
    provider: Optional[str] = None
    category: str = "General"
    tags: Optional[str] = None
    author_name: Optional[str] = None
    reading_time: Optional[int] = None
    view_count: int = 0
    status: str = "published"
    is_featured: bool = False
    is_active: bool = True
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ResourceCard(BaseModel):
    """Lighter payload for grid/list views (no full article body)."""
    id: int
    type: str
    title: str
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content_format: str = "html"
    cover_image: Optional[str] = None
    cover_is_external: bool = False
    pdf_path: Optional[str] = None
    source_url: Optional[str] = None
    provider: Optional[str] = None
    category: str = "General"
    tags: Optional[str] = None
    author_name: Optional[str] = None
    reading_time: Optional[int] = None
    view_count: int = 0
    status: str = "published"
    is_featured: bool = False
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


class ResourceListResponse(BaseModel):
    items: List[ResourceCard]
    total: int


class UrlPreviewIn(BaseModel):
    url: str


class UrlPreviewOut(BaseModel):
    provider: str
    type: str                       # video | link
    title: Optional[str] = None
    author_name: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    embed_html: Optional[str] = None
    source_url: str


# ============ Helpers ============

def require_admin(user: User):
    if not (user.is_admin or user.role == "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def save_upload_file(upload_file: UploadFile, directory: str, allowed_extensions: list) -> str:
    ext = os.path.splitext(upload_file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {ext} not allowed. Allowed: {', '.join(allowed_extensions)}",
        )
    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(directory, filename), "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return filename


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or "resource"


def unique_slug(db: Session, base: str, exclude_id: Optional[int] = None) -> str:
    slug = base
    n = 1
    while True:
        q = db.query(Resource).filter(Resource.slug == slug)
        if exclude_id:
            q = q.filter(Resource.id != exclude_id)
        if not q.first():
            return slug
        n += 1
        slug = f"{base}-{n}"


_SCRIPT_RE = re.compile(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL)
_ON_ATTR_RE = re.compile(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.IGNORECASE)


def sanitize_html(html: Optional[str]) -> Optional[str]:
    """Very light guard on admin-authored HTML — drop <script> and inline on* handlers."""
    if not html:
        return html
    html = _SCRIPT_RE.sub("", html)
    html = _ON_ATTR_RE.sub("", html)
    return html


def estimate_reading_time(content: Optional[str]) -> Optional[int]:
    if not content:
        return None
    words = len(re.sub(r"<[^>]+>", " ", content).split())
    return max(1, round(words / 200)) if words else None


# ── URL preview (oEmbed / Open Graph) ──

_YT_RE = re.compile(r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,})")
_VIMEO_RE = re.compile(r"vimeo\.com/(?:video/)?(\d+)")


def _og(html: str, prop: str) -> Optional[str]:
    for pat in (
        rf'<meta[^>]+property=["\']{prop}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{prop}["\']',
        rf'<meta[^>]+name=["\']{prop}["\'][^>]+content=["\']([^"\']+)["\']',
    ):
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


async def fetch_url_preview(url: str) -> UrlPreviewOut:
    url = url.strip()
    headers = {"User-Agent": "Mozilla/5.0 (compatible; LuxQuantBot/1.0)"}

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
        # ── YouTube ──
        if _YT_RE.search(url):
            try:
                r = await client.get(
                    "https://www.youtube.com/oembed",
                    params={"url": url, "format": "json"},
                )
                if r.status_code == 200:
                    d = r.json()
                    return UrlPreviewOut(
                        provider="youtube", type="video",
                        title=d.get("title"), author_name=d.get("author_name"),
                        thumbnail_url=d.get("thumbnail_url"), embed_html=d.get("html"),
                        source_url=url,
                    )
            except Exception:
                pass
            # fallback: build embed from the video id
            vid = _YT_RE.search(url).group(1)
            return UrlPreviewOut(
                provider="youtube", type="video",
                thumbnail_url=f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                embed_html=f'<iframe width="560" height="315" src="https://www.youtube.com/embed/{vid}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>',
                source_url=url,
            )

        # ── Vimeo ──
        if _VIMEO_RE.search(url):
            try:
                r = await client.get("https://vimeo.com/api/oembed.json", params={"url": url})
                if r.status_code == 200:
                    d = r.json()
                    return UrlPreviewOut(
                        provider="vimeo", type="video",
                        title=d.get("title"), author_name=d.get("author_name"),
                        thumbnail_url=d.get("thumbnail_url"), embed_html=d.get("html"),
                        source_url=url,
                    )
            except Exception:
                pass

        # ── Twitter / X ──
        if re.search(r"(twitter\.com|x\.com)/\w+/status/\d+", url):
            try:
                r = await client.get(
                    "https://publish.twitter.com/oembed",
                    params={"url": url, "omit_script": "false", "dnt": "true"},
                )
                if r.status_code == 200:
                    d = r.json()
                    return UrlPreviewOut(
                        provider="twitter", type="link",
                        title=d.get("author_name"), author_name=d.get("author_name"),
                        embed_html=d.get("html"), source_url=url,
                    )
            except Exception:
                pass

        # ── Generic Open Graph ──
        try:
            r = await client.get(url)
            html = r.text[:200000] if r.status_code == 200 else ""
        except Exception:
            html = ""

    title = _og(html, "og:title") or None
    if not title:
        m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
        title = m.group(1).strip() if m else None
    return UrlPreviewOut(
        provider="web", type="link",
        title=title,
        author_name=_og(html, "og:site_name"),
        description=_og(html, "og:description"),
        thumbnail_url=_og(html, "og:image"),
        source_url=url,
    )


# ============ Public Endpoints ============

@router.get("/", response_model=ResourceListResponse)
def list_resources(
    type: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    featured: Optional[bool] = None,
    include_drafts: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    """List resources. Drafts only visible to admins (include_drafts=true)."""
    query = db.query(Resource).filter(Resource.is_active == True)

    is_admin = bool(user and (user.is_admin or user.role == "admin"))
    if include_drafts and is_admin:
        pass  # admins may request everything
    else:
        query = query.filter(Resource.status == "published")

    if type and type != "all" and type in VALID_TYPES:
        query = query.filter(Resource.type == type)
    if category and category != "all":
        query = query.filter(Resource.category == category)
    if featured is not None:
        query = query.filter(Resource.is_featured == featured)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            Resource.title.ilike(like),
            Resource.excerpt.ilike(like),
            Resource.tags.ilike(like),
        ))

    total = query.count()
    items = (
        query.order_by(desc(Resource.is_featured), desc(Resource.published_at), desc(Resource.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return ResourceListResponse(items=items, total=total)


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(Resource.category)
        .filter(Resource.is_active == True, Resource.status == "published")
        .distinct()
        .all()
    )
    categories = sorted([r[0] for r in rows if r[0]])
    return {"categories": categories}


@router.get("/meta")
def get_meta(db: Session = Depends(get_db)):
    """Counts per type for the public tab bar (published + active only)."""
    rows = (
        db.query(Resource.type, func.count(Resource.id))
        .filter(Resource.is_active == True, Resource.status == "published")
        .group_by(Resource.type)
        .all()
    )
    counts = {t: c for t, c in rows}
    counts["all"] = sum(counts.values())
    return {"counts": counts}


@router.get("/file/pdf/{filename}")
async def serve_pdf(filename: str):
    for d in (PDF_DIR, LEGACY_PDF_DIR):
        fp = os.path.join(d, filename)
        if os.path.exists(fp):
            return FileResponse(
                fp, media_type="application/pdf",
                headers={"Content-Disposition": f"inline; filename={filename}"},
            )
    raise HTTPException(status_code=404, detail="PDF not found")


@router.get("/file/cover/{filename}")
async def serve_cover(filename: str):
    for d in (COVER_DIR, LEGACY_COVER_DIR):
        fp = os.path.join(d, filename)
        if os.path.exists(fp):
            return FileResponse(fp)
    raise HTTPException(status_code=404, detail="Image not found")


@router.get("/{id_or_slug}", response_model=ResourceOut)
def get_resource(
    id_or_slug: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    q = db.query(Resource).filter(Resource.is_active == True)
    if id_or_slug.isdigit():
        res = q.filter(Resource.id == int(id_or_slug)).first()
    else:
        res = q.filter(Resource.slug == id_or_slug).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")

    is_admin = bool(user and (user.is_admin or user.role == "admin"))
    if res.status != "published" and not is_admin:
        raise HTTPException(status_code=404, detail="Resource not found")

    # count a view (best-effort, skip for admins to keep numbers honest)
    if not is_admin:
        try:
            res.view_count = (res.view_count or 0) + 1
            db.commit()
            db.refresh(res)
        except Exception:
            db.rollback()
    return res


# ============ Admin Endpoints ============

@router.post("/url-preview", response_model=UrlPreviewOut)
async def url_preview(
    payload: UrlPreviewIn,
    current_user: User = Depends(get_current_user),
):
    """Fetch oEmbed / Open Graph metadata for a pasted URL (admin only)."""
    require_admin(current_user)
    if not payload.url or not payload.url.strip():
        raise HTTPException(status_code=400, detail="URL is required")
    return await fetch_url_preview(payload.url)


@router.post("/", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
async def create_resource(
    type: str = Form("article"),
    title: str = Form(...),
    excerpt: str = Form(None),
    content: str = Form(None),
    content_format: str = Form("html"),
    category: str = Form("General"),
    tags: str = Form(None),
    author_name: str = Form(None),
    source_url: str = Form(None),
    embed_html: str = Form(None),
    provider: str = Form(None),
    cover_url: str = Form(None),               # external cover (oEmbed thumbnail)
    resource_status: str = Form("published"),  # draft | published
    is_featured: bool = Form(False),
    pdf_file: Optional[UploadFile] = File(None),
    cover_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(current_user)

    if type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type. Allowed: {', '.join(VALID_TYPES)}")

    # Type-specific requirements
    pdf_filename = None
    if type == "pdf":
        if not (pdf_file and pdf_file.filename):
            raise HTTPException(status_code=400, detail="PDF file is required for pdf resources")
        pdf_filename = save_upload_file(pdf_file, PDF_DIR, [".pdf"])
    if type in ("video", "link") and not source_url:
        raise HTTPException(status_code=400, detail="source_url is required for video/link resources")

    # Cover: uploaded file wins; otherwise external URL (thumbnail).
    cover_image, cover_is_external = None, False
    if cover_file and cover_file.filename:
        cover_image = save_upload_file(cover_file, COVER_DIR, [".jpg", ".jpeg", ".png", ".webp", ".gif"])
    elif cover_url:
        cover_image, cover_is_external = cover_url, True

    body = sanitize_html(content) if content_format == "html" else content
    reading_time = estimate_reading_time(body) if type == "article" else None

    slug = unique_slug(db, slugify(title))
    now = datetime.utcnow()
    res = Resource(
        type=type,
        title=title.strip(),
        slug=slug,
        excerpt=(excerpt or "").strip() or None,
        content=body,
        content_format=content_format if content_format in ("html", "markdown") else "html",
        cover_image=cover_image,
        cover_is_external=cover_is_external,
        pdf_path=pdf_filename,
        source_url=(source_url or "").strip() or None,
        embed_html=embed_html or None,
        provider=provider or None,
        category=(category or "General").strip() or "General",
        tags=(tags or "").strip() or None,
        author_name=(author_name or "").strip() or None,
        reading_time=reading_time,
        status="draft" if resource_status == "draft" else "published",
        is_featured=bool(is_featured),
        created_by=current_user.id,
        published_at=now,
    )
    db.add(res)
    db.commit()
    db.refresh(res)
    return res


@router.put("/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: int,
    type: str = Form(None),
    title: str = Form(None),
    excerpt: str = Form(None),
    content: str = Form(None),
    content_format: str = Form(None),
    category: str = Form(None),
    tags: str = Form(None),
    author_name: str = Form(None),
    source_url: str = Form(None),
    embed_html: str = Form(None),
    provider: str = Form(None),
    cover_url: str = Form(None),
    resource_status: str = Form(None),
    is_featured: Optional[bool] = Form(None),
    pdf_file: Optional[UploadFile] = File(None),
    cover_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(current_user)

    res = db.query(Resource).filter(Resource.id == resource_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")

    if type is not None and type in VALID_TYPES:
        res.type = type
    if title is not None:
        res.title = title.strip()
    if excerpt is not None:
        res.excerpt = excerpt.strip() or None
    if category is not None:
        res.category = category.strip() or "General"
    if tags is not None:
        res.tags = tags.strip() or None
    if author_name is not None:
        res.author_name = author_name.strip() or None
    if source_url is not None:
        res.source_url = source_url.strip() or None
    if embed_html is not None:
        res.embed_html = embed_html or None
    if provider is not None:
        res.provider = provider or None
    if content_format is not None and content_format in ("html", "markdown"):
        res.content_format = content_format
    if content is not None:
        res.content = sanitize_html(content) if (res.content_format == "html") else content
        if res.type == "article":
            res.reading_time = estimate_reading_time(res.content)
    if resource_status is not None:
        res.status = "draft" if resource_status == "draft" else "published"
    if is_featured is not None:
        res.is_featured = bool(is_featured)

    # Cover replacement
    if cover_file and cover_file.filename:
        if res.cover_image and not res.cover_is_external:
            old = os.path.join(COVER_DIR, res.cover_image)
            if os.path.exists(old):
                os.remove(old)
        res.cover_image = save_upload_file(cover_file, COVER_DIR, [".jpg", ".jpeg", ".png", ".webp", ".gif"])
        res.cover_is_external = False
    elif cover_url is not None and cover_url:
        res.cover_image = cover_url
        res.cover_is_external = True

    # PDF replacement
    if pdf_file and pdf_file.filename:
        if res.pdf_path:
            old = os.path.join(PDF_DIR, res.pdf_path)
            if os.path.exists(old):
                os.remove(old)
        res.pdf_path = save_upload_file(pdf_file, PDF_DIR, [".pdf"])

    db.commit()
    db.refresh(res)
    return res


@router.delete("/{resource_id}")
def delete_resource(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete."""
    require_admin(current_user)
    res = db.query(Resource).filter(Resource.id == resource_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    res.is_active = False
    db.commit()
    return {"message": "Resource deleted", "id": resource_id}


@router.delete("/{resource_id}/permanent")
def delete_resource_permanent(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(current_user)
    res = db.query(Resource).filter(Resource.id == resource_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    if res.pdf_path:
        fp = os.path.join(PDF_DIR, res.pdf_path)
        if os.path.exists(fp):
            os.remove(fp)
    if res.cover_image and not res.cover_is_external:
        fp = os.path.join(COVER_DIR, res.cover_image)
        if os.path.exists(fp):
            os.remove(fp)
    db.delete(res)
    db.commit()
    return {"message": "Resource permanently deleted", "id": resource_id}
