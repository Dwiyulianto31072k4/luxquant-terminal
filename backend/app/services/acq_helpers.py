"""Acquisition attribution (first-touch UTM / referrer).

Columns on `users` are created lazily so deploys don't need a migration file.
First write wins — never overwrite an existing acq_* so later visits don't
re-attribute a paid or organic user.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger("acq")

_COLS_READY = False

_SOURCE_RE = re.compile(r"^[a-zA-Z0-9_\-.]{1,40}$")
_SLUG_RE = re.compile(r"^[a-zA-Z0-9_\-.]{1,60}$")
_PATH_RE = re.compile(r"^/[\w\-./]{0,198}$")

# Friendly labels for admin UI
SOURCE_LABELS = {
    "telegram": "Telegram",
    "x": "X (Twitter)",
    "twitter": "X (Twitter)",
    "landing": "Landing",
    "direct": "Direct",
    "referral": "Referral",
    "google": "Google",
    "discord": "Discord",
}


def _ensure_columns(db: Session) -> None:
    global _COLS_READY
    if _COLS_READY:
        return
    for stmt in (
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_source VARCHAR(40)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_medium VARCHAR(40)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_campaign VARCHAR(60)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_content VARCHAR(60)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_path VARCHAR(200)",
        "CREATE INDEX IF NOT EXISTS ix_users_acq_source ON users (acq_source)",
        "CREATE INDEX IF NOT EXISTS ix_users_acq_campaign ON users (acq_campaign)",
    ):
        try:
            db.execute(text(stmt))
        except Exception:
            logger.exception("acq column ensure failed: %s", stmt[:60])
            db.rollback()
            return
    try:
        db.commit()
    except Exception:
        db.rollback()
        return
    _COLS_READY = True


def _clean(val: Optional[str], pattern: re.Pattern, max_len: int) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip().lower()[:max_len]
    if not s or not pattern.match(s):
        # allow path-like for path separately
        return None
    return s


def _clean_path(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    s = str(val).strip()[:200]
    if not s.startswith("/"):
        s = "/" + s.lstrip("/")
    if not _PATH_RE.match(s):
        return s[:200] if s.startswith("/") else None
    return s


def normalize_acq(payload: Any) -> Optional[dict]:
    """Normalize client payload → dict or None if nothing usable."""
    if not payload or not isinstance(payload, dict):
        return None
    source = _clean(payload.get("source") or payload.get("utm_source"), _SOURCE_RE, 40)
    medium = _clean(payload.get("medium") or payload.get("utm_medium"), _SOURCE_RE, 40)
    campaign = _clean(payload.get("campaign") or payload.get("utm_campaign"), _SLUG_RE, 60)
    content = _clean(payload.get("content") or payload.get("utm_content"), _SLUG_RE, 60)
    path = _clean_path(payload.get("path"))
    if not any((source, medium, campaign, content)):
        return None
    # Normalize twitter → x
    if source == "twitter":
        source = "x"
    return {
        "source": source,
        "medium": medium,
        "campaign": campaign,
        "content": content,
        "path": path,
    }


def apply_acq_to_user(db: Session, user: User, payload: Any, *, commit: bool = False) -> bool:
    """Set acq_* on user if empty. Returns True if written."""
    data = normalize_acq(payload)
    if not data or not user:
        return False
    try:
        _ensure_columns(db)
    except Exception:
        logger.exception("acq ensure failed")
        return False

    # Reload current values via attributes (may be None if column just added)
    existing = getattr(user, "acq_source", None)
    if existing:
        return False

    user.acq_source = data.get("source")
    user.acq_medium = data.get("medium")
    user.acq_campaign = data.get("campaign")
    user.acq_content = data.get("content")
    user.acq_path = data.get("path")
    if commit:
        try:
            db.commit()
            db.refresh(user)
        except Exception:
            logger.exception("acq commit failed for user %s", getattr(user, "id", None))
            db.rollback()
            return False
    return True


def label_source(source: Optional[str]) -> str:
    if not source:
        return "(unknown)"
    return SOURCE_LABELS.get(source, source)
