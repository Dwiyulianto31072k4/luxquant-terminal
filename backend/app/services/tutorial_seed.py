"""Sync the Tutorials curriculum from markdown on disk into `resources`.

Lessons are product copy, not CMS filler — they live in git
(`backend/knowledge/tutorials/*.md`) so a definition cannot drift from the
truth sheet without a review. The `resources` row is what `/tips` already
reads; this module is the bridge, run at API startup and safe to re-run.

A row with tag `curriculum` and a slug we own is overwritten on every boot.
Admin-authored lessons with any other slug are left alone. Two gunicorn
workers racing an insert of the same slug is possible on a cold start; the
IntegrityError path falls through to an update.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.resource import Resource
from app.services.learn import TRACK_SLUGS, LEVELS, estimate_minutes

log = logging.getLogger(__name__)

CURRICULUM_TAG = "curriculum"
AUTHOR = "LuxQuant"
CATEGORY = "Tutorials"

# backend/app/services/tutorial_seed.py → backend/knowledge/tutorials
_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "tutorials")
)

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_KV_RE = re.compile(r"^([A-Za-z0-9_]+)\s*:\s*(.*)$")


def lessons_dir() -> str:
    return _DIR


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split `--- key: value ---` from the markdown body.

    Values are unquoted strings, or a quoted string if wrapped in " or '.
    Unknown keys are kept; the seeder validates the ones it needs.
    """
    raw = text.lstrip("\ufeff")
    m = _FRONTMATTER_RE.match(raw)
    if not m:
        return {}, raw
    meta: dict = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        kv = _KV_RE.match(line)
        if not kv:
            continue
        key, val = kv.group(1), kv.group(2).strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        meta[key] = val
    return meta, raw[m.end() :]


def load_lesson_files(directory: str | None = None) -> list[dict]:
    """Every `*.md` in the curriculum folder, excluding README."""
    folder = directory or _DIR
    if not os.path.isdir(folder):
        return []
    out: list[dict] = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".md") or name.lower().startswith("readme"):
            continue
        path = os.path.join(folder, name)
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        meta, body = parse_frontmatter(raw)
        meta["_path"] = path
        meta["_body"] = body.strip() + "\n"
        out.append(meta)
    return out


def _as_int(value, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def validate_lesson(meta: dict) -> list[str]:
    errors: list[str] = []
    slug = (meta.get("slug") or "").strip()
    if not slug or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        errors.append(f"bad slug {slug!r}")
    track = (meta.get("track") or "").strip()
    if track not in TRACK_SLUGS:
        errors.append(f"unknown track {track!r}")
    if not (meta.get("title") or "").strip():
        errors.append("missing title")
    if not (meta.get("_body") or "").strip():
        errors.append("empty body")
    level = (meta.get("level") or "").strip()
    if level and level not in LEVELS:
        errors.append(f"unknown level {level!r}")
    return errors


def iter_official_lessons(directory: str | None = None) -> Iterable[dict]:
    seen_slugs: set[str] = set()
    for meta in load_lesson_files(directory):
        problems = validate_lesson(meta)
        if problems:
            raise ValueError(f"{meta.get('_path')}: {'; '.join(problems)}")
        slug = meta["slug"].strip()
        if slug in seen_slugs:
            raise ValueError(f"duplicate slug {slug!r} in {meta.get('_path')}")
        seen_slugs.add(slug)
        yield meta


def _apply(row: Resource, meta: dict) -> None:
    body = meta["_body"]
    minutes = _as_int(meta.get("minutes")) or estimate_minutes(body)
    tags = (row.tags or "").strip()
    parts = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    if CURRICULUM_TAG not in parts:
        parts.append(CURRICULUM_TAG)
    row.type = "article"
    row.title = meta["title"].strip()
    row.slug = meta["slug"].strip()
    row.excerpt = (meta.get("excerpt") or "").strip() or None
    row.content = body
    row.content_format = "markdown"
    row.category = CATEGORY
    row.tags = ", ".join(parts)
    row.author_name = AUTHOR
    row.track = meta["track"].strip()
    row.order_index = _as_int(meta.get("order"), 0) or 0
    row.level = (meta.get("level") or "").strip() or None
    row.est_minutes = minutes
    row.reading_time = minutes
    row.status = "published"
    row.is_active = True
    # Featured would pin all 24 on the old Resources shelf. The course is `/tips`.
    row.is_featured = False


def seed_tutorials(db: Session, directory: str | None = None) -> int:
    """Upsert every official lesson. Returns the number of files applied."""
    applied = 0
    for meta in iter_official_lessons(directory):
        slug = meta["slug"].strip()
        row = db.query(Resource).filter(Resource.slug == slug).first()
        if row is None:
            row = Resource(slug=slug)
            _apply(row, meta)
            db.add(row)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                row = db.query(Resource).filter(Resource.slug == slug).first()
                if row is None:
                    raise
                _apply(row, meta)
                db.commit()
        else:
            _apply(row, meta)
            db.commit()
        applied += 1
    return applied


if __name__ == "__main__":
    import sys

    sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..")))
    from app.core.database import SessionLocal

    session = SessionLocal()
    try:
        n = seed_tutorials(session)
        print(f"synced {n} lessons")
    finally:
        session.close()
