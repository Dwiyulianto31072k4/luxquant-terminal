"""LuxQuant Learning and Learning Studio API."""
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_db
from app.models.learning import (
    LearningCourse,
    LearningLesson,
    LearningModule,
    LearningNote,
    LearningProgress,
)
from app.models.user import User

router = APIRouter(prefix="/learning", tags=["learning"])

COURSE_LEVELS = {"beginner", "intermediate", "advanced"}
ACCESS_TIERS = {"free", "premium"}
LESSON_TYPES = {"slides", "video", "reading", "case", "quiz", "action"}
STATUSES = {"draft", "published", "archived"}


def _json(value: Optional[str], fallback):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


def _dump(value, fallback):
    return json.dumps(value if value is not None else fallback, ensure_ascii=False)


def _slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return result or "untitled"


def _is_admin(user: Optional[User]) -> bool:
    return bool(user and (user.is_admin or user.role in {"admin", "founder"}))


def _is_premium(user: Optional[User]) -> bool:
    return bool(user and (
        user.is_admin
        or user.role in {"admin", "founder", "co_admin", "premium", "subscriber"}
        or getattr(user, "is_admin_staff", False)
    ))


def _require_admin(user: User):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")


def _progress_map(db: Session, user: Optional[User]) -> dict[int, LearningProgress]:
    if not user:
        return {}
    return {
        row.lesson_id: row
        for row in db.query(LearningProgress).filter(LearningProgress.user_id == user.id).all()
    }


def _lesson_payload(
    lesson: LearningLesson,
    course: LearningCourse,
    progress: Optional[LearningProgress] = None,
    include_content: bool = False,
    is_preview: bool = False,
    user: Optional[User] = None,
):
    required = course.access_tier if lesson.access_tier == "inherit" else lesson.access_tier
    locked = required == "premium" and not (_is_premium(user) or is_preview)
    data = {
        "id": lesson.id,
        "module_id": lesson.module_id,
        "slug": lesson.slug,
        "title": lesson.title,
        "summary": lesson.summary,
        "lesson_type": lesson.lesson_type,
        "level": lesson.level,
        "access_tier": required,
        "status": lesson.status,
        "sort_order": lesson.sort_order,
        "estimated_minutes": lesson.estimated_minutes,
        "youtube_url": lesson.youtube_url,
        "source_url": lesson.source_url,
        "version": lesson.version,
        "locked": locked,
        "progress_pct": progress.progress_pct if progress else 0,
        "score": progress.score if progress else None,
        "completed": bool(progress and progress.completed_at),
        "last_position": progress.last_position if progress else None,
    }
    if include_content and not locked:
        data.update({
            "content": _json(lesson.content_json, []),
            "transcript": lesson.transcript,
            "state": _json(progress.state_json, {}) if progress else {},
        })
    return data


def _course_tree(
    db: Session,
    course: LearningCourse,
    progress: dict[int, LearningProgress],
    user: Optional[User],
    admin: bool = False,
):
    module_query = db.query(LearningModule).filter(LearningModule.course_id == course.id)
    modules = module_query.order_by(LearningModule.sort_order, LearningModule.id).all()
    module_ids = [m.id for m in modules]
    lesson_query = db.query(LearningLesson).filter(LearningLesson.module_id.in_(module_ids or [-1]))
    if not admin:
        lesson_query = lesson_query.filter(LearningLesson.status == "published")
    lessons = lesson_query.order_by(LearningLesson.sort_order, LearningLesson.id).all()
    by_module: dict[int, list[LearningLesson]] = {}
    for lesson in lessons:
        by_module.setdefault(lesson.module_id, []).append(lesson)

    total = done = started = minutes = 0
    module_rows = []
    for module in modules:
        rows = [
            _lesson_payload(l, course, progress.get(l.id), False, module.is_preview, user)
            for l in by_module.get(module.id, [])
        ]
        total += len(rows)
        done += sum(1 for row in rows if row["completed"])
        started += sum(1 for row in rows if row["progress_pct"] > 0)
        minutes += sum(row["estimated_minutes"] or 0 for row in rows)
        module_rows.append({
            "id": module.id,
            "course_id": module.course_id,
            "slug": module.slug,
            "title": module.title,
            "summary": module.summary,
            "sort_order": module.sort_order,
            "estimated_minutes": module.estimated_minutes,
            "is_preview": module.is_preview,
            "lessons": rows,
            "lesson_count": len(rows),
            "completed_count": sum(1 for row in rows if row["completed"]),
        })
    pct = round((done / total) * 100) if total else 0
    return {
        "id": course.id,
        "slug": course.slug,
        "title": course.title,
        "short_title": course.short_title,
        "summary": course.summary,
        "description": course.description,
        "category": course.category,
        "level": course.level,
        "access_tier": course.access_tier,
        "status": course.status,
        "is_featured": course.is_featured,
        "sort_order": course.sort_order,
        "estimated_minutes": course.estimated_minutes or minutes,
        "cover_image": course.cover_image,
        "skills": _json(course.skills_json, []),
        "outcomes": _json(course.outcomes_json, []),
        "modules": module_rows,
        "module_count": len(module_rows),
        "lesson_count": total,
        "completed_count": done,
        "started_count": started,
        "progress_pct": pct,
        "locked": course.access_tier == "premium" and not _is_premium(user),
        "updated_at": course.updated_at,
        "published_at": course.published_at,
    }


@router.get("/catalog")
def catalog(
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    courses = (
        db.query(LearningCourse)
        .filter(LearningCourse.status == "published")
        .order_by(LearningCourse.sort_order, LearningCourse.id)
        .all()
    )
    progress = _progress_map(db, user)
    trees = [_course_tree(db, c, progress, user) for c in courses]
    all_lessons = [l for c in trees for m in c["modules"] for l in m["lessons"]]
    completed = sum(1 for lesson in all_lessons if lesson["completed"])
    started = sum(1 for lesson in all_lessons if lesson["progress_pct"] > 0)
    next_lesson = next((l for l in all_lessons if not l["completed"] and not l["locked"]), None)
    skill_rows = []
    for course in trees:
        for skill in course["skills"]:
            skill_rows.append({"name": skill, "readiness": course["progress_pct"], "course_slug": course["slug"]})
    return {
        "courses": trees,
        "signed_in": bool(user),
        "premium": _is_premium(user),
        "totals": {
            "courses": len(trees),
            "lessons": len(all_lessons),
            "started": started,
            "completed": completed,
            "minutes": sum(c["estimated_minutes"] or 0 for c in trees),
        },
        "next_lesson": next_lesson,
        "skills": skill_rows,
    }


@router.get("/courses/{course_slug}")
def get_course(
    course_slug: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    course = db.query(LearningCourse).filter(
        LearningCourse.slug == course_slug, LearningCourse.status == "published"
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return _course_tree(db, course, _progress_map(db, user), user)


def _find_lesson(db: Session, value: str):
    query = db.query(LearningLesson)
    return query.filter(LearningLesson.id == int(value)).first() if value.isdigit() else query.filter(LearningLesson.slug == value).first()


@router.get("/lessons/{id_or_slug}")
def get_lesson(
    id_or_slug: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    lesson = _find_lesson(db, id_or_slug)
    if not lesson or (lesson.status != "published" and not _is_admin(user)):
        raise HTTPException(status_code=404, detail="Lesson not found")
    module = db.query(LearningModule).filter(LearningModule.id == lesson.module_id).first()
    course = db.query(LearningCourse).filter(LearningCourse.id == module.course_id).first()
    progress = None
    if user:
        progress = db.query(LearningProgress).filter(
            LearningProgress.user_id == user.id, LearningProgress.lesson_id == lesson.id
        ).first()
    payload = _lesson_payload(lesson, course, progress, True, module.is_preview, user)
    payload.update({
        "course": {"id": course.id, "slug": course.slug, "title": course.title, "access_tier": course.access_tier},
        "module": {"id": module.id, "slug": module.slug, "title": module.title, "is_preview": module.is_preview},
    })
    if payload["locked"]:
        raise HTTPException(status_code=403, detail="Premium course")
    return payload


class ProgressIn(BaseModel):
    progress_pct: int = Field(ge=0, le=100)
    score: Optional[float] = None
    last_position: Optional[str] = None
    state: dict[str, Any] = {}


@router.put("/lessons/{lesson_id}/progress")
def set_progress(
    lesson_id: int,
    payload: ProgressIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lesson = db.query(LearningLesson).filter(LearningLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    row = db.query(LearningProgress).filter(
        LearningProgress.user_id == user.id, LearningProgress.lesson_id == lesson_id
    ).first()
    if not row:
        row = LearningProgress(user_id=user.id, lesson_id=lesson_id)
        db.add(row)
    row.progress_pct = payload.progress_pct
    row.score = payload.score
    row.last_position = payload.last_position
    row.state_json = _dump(payload.state, {})
    row.completed_at = datetime.now(timezone.utc) if payload.progress_pct >= 100 else None
    db.commit()
    db.refresh(row)
    return {"lesson_id": lesson_id, "progress_pct": row.progress_pct, "completed": bool(row.completed_at)}


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    anchor: Optional[str] = None


@router.get("/lessons/{lesson_id}/notes")
def list_notes(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(LearningNote).filter(
        LearningNote.user_id == user.id, LearningNote.lesson_id == lesson_id
    ).order_by(LearningNote.created_at.desc()).all()
    return [{"id": n.id, "body": n.body, "anchor": n.anchor, "created_at": n.created_at, "updated_at": n.updated_at} for n in rows]


@router.post("/lessons/{lesson_id}/notes")
def create_note(lesson_id: int, payload: NoteIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = LearningNote(user_id=user.id, lesson_id=lesson_id, body=payload.body.strip(), anchor=payload.anchor)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "body": row.body, "anchor": row.anchor, "created_at": row.created_at}


class CourseIn(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    slug: Optional[str] = None
    short_title: Optional[str] = None
    summary: Optional[str] = None
    description: Optional[str] = None
    category: str = "LuxQuant"
    level: str = "beginner"
    access_tier: str = "free"
    status: str = "draft"
    is_featured: bool = False
    sort_order: int = 0
    estimated_minutes: int = 0
    cover_image: Optional[str] = None
    skills: list[str] = []
    outcomes: list[str] = []


class ModuleIn(BaseModel):
    course_id: int
    title: str = Field(min_length=1, max_length=240)
    slug: Optional[str] = None
    summary: Optional[str] = None
    sort_order: int = 0
    estimated_minutes: int = 0
    is_preview: bool = False


class LessonIn(BaseModel):
    module_id: int
    title: str = Field(min_length=1, max_length=300)
    slug: Optional[str] = None
    summary: Optional[str] = None
    lesson_type: str = "slides"
    level: str = "beginner"
    access_tier: str = "inherit"
    status: str = "draft"
    sort_order: int = 0
    estimated_minutes: int = 4
    content: list[dict[str, Any]] = []
    transcript: Optional[str] = None
    youtube_url: Optional[str] = None
    source_url: Optional[str] = None


@router.get("/admin/catalog")
def admin_catalog(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    courses = db.query(LearningCourse).order_by(LearningCourse.sort_order, LearningCourse.id).all()
    trees = [_course_tree(db, c, {}, user, admin=True) for c in courses]
    lesson_ids = [l["id"] for c in trees for m in c["modules"] for l in m["lessons"]]
    starts = db.query(func.count(func.distinct(LearningProgress.user_id))).filter(
        LearningProgress.lesson_id.in_(lesson_ids or [-1])
    ).scalar() or 0
    completions = db.query(func.count(LearningProgress.id)).filter(
        LearningProgress.lesson_id.in_(lesson_ids or [-1]), LearningProgress.completed_at.isnot(None)
    ).scalar() or 0
    return {
        "courses": trees,
        "stats": {
            "courses": len(trees),
            "modules": sum(len(c["modules"]) for c in trees),
            "lessons": len(lesson_ids),
            "published": sum(1 for c in trees for m in c["modules"] for l in m["lessons"] if l["status"] == "published"),
            "drafts": sum(1 for c in trees for m in c["modules"] for l in m["lessons"] if l["status"] == "draft"),
            "learners": starts,
            "completions": completions,
        },
    }


def _validate_course(payload: CourseIn):
    if payload.level not in COURSE_LEVELS or payload.access_tier not in ACCESS_TIERS or payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid course level, access tier, or status")


@router.post("/admin/courses")
def create_course(payload: CourseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user)
    _validate_course(payload)
    slug = _slug(payload.slug or payload.title)
    if db.query(LearningCourse).filter(LearningCourse.slug == slug).first():
        raise HTTPException(status_code=409, detail="Course slug already exists")
    values = payload.model_dump(exclude={"skills", "outcomes"})
    values["slug"] = slug
    values["skills_json"] = _dump(payload.skills, [])
    values["outcomes_json"] = _dump(payload.outcomes, [])
    values["created_by"] = user.id
    if payload.status == "published": values["published_at"] = datetime.now(timezone.utc)
    row = LearningCourse(**values)
    db.add(row); db.commit(); db.refresh(row)
    return _course_tree(db, row, {}, user, admin=True)


@router.put("/admin/courses/{course_id}")
def update_course(course_id: int, payload: CourseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user); _validate_course(payload)
    row = db.query(LearningCourse).filter(LearningCourse.id == course_id).first()
    if not row: raise HTTPException(status_code=404, detail="Course not found")
    for key, value in payload.model_dump(exclude={"skills", "outcomes", "slug"}).items(): setattr(row, key, value)
    row.slug = _slug(payload.slug or payload.title)
    row.skills_json = _dump(payload.skills, []); row.outcomes_json = _dump(payload.outcomes, [])
    if payload.status == "published" and not row.published_at: row.published_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(row)
    return _course_tree(db, row, {}, user, admin=True)


@router.post("/admin/modules")
def create_module(payload: ModuleIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user)
    if not db.query(LearningCourse).filter(LearningCourse.id == payload.course_id).first(): raise HTTPException(status_code=404, detail="Course not found")
    values = payload.model_dump(); values["slug"] = _slug(payload.slug or payload.title)
    row = LearningModule(**values); db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id, **payload.model_dump(), "slug": row.slug}


@router.put("/admin/modules/{module_id}")
def update_module(module_id: int, payload: ModuleIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user)
    row = db.query(LearningModule).filter(LearningModule.id == module_id).first()
    if not row: raise HTTPException(status_code=404, detail="Module not found")
    for key, value in payload.model_dump(exclude={"slug"}).items(): setattr(row, key, value)
    row.slug = _slug(payload.slug or payload.title); db.commit(); db.refresh(row)
    return {"id": row.id, **payload.model_dump(), "slug": row.slug}


def _validate_lesson(payload: LessonIn):
    if payload.lesson_type not in LESSON_TYPES or payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lesson type or status")
    if payload.access_tier not in ACCESS_TIERS | {"inherit"}:
        raise HTTPException(status_code=400, detail="Invalid access tier")


@router.post("/admin/lessons")
def create_lesson(payload: LessonIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user); _validate_lesson(payload)
    if not db.query(LearningModule).filter(LearningModule.id == payload.module_id).first(): raise HTTPException(status_code=404, detail="Module not found")
    values = payload.model_dump(exclude={"content", "slug"}); values["slug"] = _slug(payload.slug or payload.title)
    values["content_json"] = _dump(payload.content, []); values["created_by"] = user.id
    if payload.status == "published": values["published_at"] = datetime.now(timezone.utc)
    row = LearningLesson(**values); db.add(row); db.commit(); db.refresh(row)
    return _lesson_payload(row, db.query(LearningCourse).join(LearningModule, LearningCourse.id == LearningModule.course_id).filter(LearningModule.id == row.module_id).first(), None, True, True, user)


@router.put("/admin/lessons/{lesson_id}")
def update_lesson(lesson_id: int, payload: LessonIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user); _validate_lesson(payload)
    row = db.query(LearningLesson).filter(LearningLesson.id == lesson_id).first()
    if not row: raise HTTPException(status_code=404, detail="Lesson not found")
    for key, value in payload.model_dump(exclude={"content", "slug"}).items(): setattr(row, key, value)
    row.slug = _slug(payload.slug or payload.title); row.content_json = _dump(payload.content, []); row.version += 1
    if payload.status == "published" and not row.published_at: row.published_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(row)
    module = db.query(LearningModule).filter(LearningModule.id == row.module_id).first()
    course = db.query(LearningCourse).filter(LearningCourse.id == module.course_id).first()
    return _lesson_payload(row, course, None, True, module.is_preview, user)


@router.delete("/admin/{kind}/{item_id}")
def archive_learning_item(kind: str, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user)
    model = {"courses": LearningCourse, "modules": LearningModule, "lessons": LearningLesson}.get(kind)
    if not model: raise HTTPException(status_code=400, detail="Invalid item kind")
    row = db.query(model).filter(model.id == item_id).first()
    if not row: raise HTTPException(status_code=404, detail="Item not found")
    if hasattr(row, "status"):
        row.status = "archived"
    else:
        db.delete(row)
    db.commit()
    return {"success": True, "id": item_id, "kind": kind}
