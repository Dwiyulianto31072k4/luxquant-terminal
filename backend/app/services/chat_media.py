"""Filesystem helpers for chat media lifecycle."""
from __future__ import annotations

import os
import time
import logging
from pathlib import Path

from sqlalchemy import bindparam, text

logger = logging.getLogger(__name__)


CHAT_IMAGES_DIR = Path(os.environ.get("CHAT_IMAGES_DIR", "/opt/luxquant/chat-images"))
CHAT_IMAGE_URL_PREFIX = "/api/v1/chat-images/"


def delete_chat_image(url: str | None) -> bool:
    """Delete one locally hosted chat image without allowing path traversal."""
    if not url or not url.startswith(CHAT_IMAGE_URL_PREFIX):
        return False
    name = url.removeprefix(CHAT_IMAGE_URL_PREFIX)
    if not name or name != os.path.basename(name):
        return False

    target = (CHAT_IMAGES_DIR / name).resolve()
    root = CHAT_IMAGES_DIR.resolve()
    if target.parent != root:
        return False
    try:
        target.unlink()
        return True
    except FileNotFoundError:
        return False


def prune_expired_chat_images(db, max_age_hours: int = 24, batch_size: int = 500) -> dict:
    """Expire DB-backed images and remove every old file, including orphans.

    The DB row becomes a tombstone instead of leaving a broken `<img>`. A
    filesystem sweep then catches uploads whose message send failed after the
    file was stored. Running this every 15 minutes gives a practical maximum
    lifetime of 24h15m without adding cleanup work to request handlers.
    """
    max_age_hours = max(1, int(max_age_hours))
    rows = db.execute(
        text("""
            SELECT id, body
              FROM chat_messages
             WHERE kind = 'image'
               AND created_at < now() - make_interval(hours => :hours)
             ORDER BY created_at ASC
             LIMIT :lim
             FOR UPDATE SKIP LOCKED
        """),
        {"hours": max_age_hours, "lim": max(1, min(int(batch_size), 2000))},
    ).mappings().all()

    files_deleted = sum(1 for row in rows if delete_chat_image(row["body"]))
    ids = [row["id"] for row in rows]
    if ids:
        stmt = text("""
            UPDATE chat_messages
               SET body = '', kind = 'expired_image',
                   relay_state = CASE WHEN relay_state = 'pending'
                                      THEN 'skipped' ELSE relay_state END,
                   relay_error = CASE WHEN relay_state = 'pending'
                                      THEN 'image expired before relay'
                                      ELSE relay_error END
             WHERE id IN :ids
        """).bindparams(bindparam("ids", expanding=True))
        db.execute(stmt, {"ids": ids})
    db.commit()

    # Failed sends leave no message row. File mtime starts at upload and is the
    # correct retention clock for those orphans.
    orphan_deleted = 0
    cutoff = time.time() - max_age_hours * 3600
    try:
        for path in CHAT_IMAGES_DIR.iterdir():
            if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
                continue
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
                    orphan_deleted += 1
            except FileNotFoundError:
                continue
    except FileNotFoundError:
        pass

    result = {
        "messages_expired": len(ids),
        "files_deleted": files_deleted,
        "old_files_swept": orphan_deleted,
    }
    if any(result.values()):
        logger.info("chat image retention: %s", result)
    return result
