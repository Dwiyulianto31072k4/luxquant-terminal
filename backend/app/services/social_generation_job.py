"""
Persistent generation-job status for Social Posts admin UI.

Survives page refresh: client polls GET /generation-status and sees live steps
even if the browser was reloaded mid-run.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

JOB_KEY = "luxquant:social:generation_job"
JOB_TTL_SEC = int(os.environ.get("SOCIAL_GEN_JOB_TTL", "900"))  # 15 min
ASSETS_DIR = Path(os.environ.get("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts"))
FILE_FALLBACK = ASSETS_DIR / "generation_job.json"

# Ordered steps for the progress UI
STEPS = [
    {"id": "queued", "label": "Queued"},
    {"id": "pick_news", "label": "Picking news"},
    {"id": "extract", "label": "Extracting article"},
    {"id": "search", "label": "Enriching sources"},
    {"id": "editorial", "label": "Writing caption (AI)"},
    {"id": "entities", "label": "Detecting logos & people"},
    {"id": "image", "label": "Generating image (AI)"},
    {"id": "compose", "label": "Composing card"},
    {"id": "save", "label": "Saving draft"},
    {"id": "done", "label": "Done"},
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_file(payload: dict) -> None:
    try:
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        FILE_FALLBACK.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        pass


def _read_file() -> Optional[dict]:
    try:
        if not FILE_FALLBACK.exists():
            return None
        data = json.loads(FILE_FALLBACK.read_text(encoding="utf-8"))
        # Expire stale file jobs
        started = data.get("started_at")
        if started:
            try:
                ts = datetime.fromisoformat(started.replace("Z", "+00:00")).timestamp()
                if time.time() - ts > JOB_TTL_SEC:
                    return None
            except Exception:
                pass
        return data
    except Exception:
        return None


def set_job(payload: dict) -> dict:
    payload = {**payload, "updated_at": _now_iso()}
    try:
        from app.core.redis import get_redis, is_redis_available
        if is_redis_available():
            get_redis().setex(JOB_KEY, JOB_TTL_SEC, json.dumps(payload))
    except Exception:
        pass
    _write_file(payload)
    return payload


def get_job() -> Optional[dict]:
    try:
        from app.core.redis import get_redis, is_redis_available
        if is_redis_available():
            raw = get_redis().get(JOB_KEY)
            if raw:
                return json.loads(raw)
    except Exception:
        pass
    return _read_file()


def clear_job() -> None:
    try:
        from app.core.redis import get_redis, is_redis_available
        if is_redis_available():
            get_redis().delete(JOB_KEY)
    except Exception:
        pass
    try:
        if FILE_FALLBACK.exists():
            FILE_FALLBACK.unlink()
    except Exception:
        pass


def start_job(*, news_id: Optional[int], platform: str, limit: int, admin: str = "") -> dict:
    job = {
        "id": str(uuid.uuid4())[:8],
        "status": "running",  # running | done | error
        "step": "queued",
        "step_label": "Queued",
        "progress": 0,
        "message": "Generation started…",
        "news_id": news_id,
        "platform": platform,
        "limit": limit,
        "admin": admin,
        "started_at": _now_iso(),
        "finished_at": None,
        "result": None,
        "error": None,
        "steps": STEPS,
    }
    return set_job(job)


def update_job(
    step: str,
    message: str = "",
    *,
    progress: Optional[int] = None,
    result: Any = None,
    error: Optional[str] = None,
    status: Optional[str] = None,
) -> Optional[dict]:
    job = get_job() or {}
    if not job:
        return None
    labels = {s["id"]: s["label"] for s in STEPS}
    order = [s["id"] for s in STEPS]
    job["step"] = step
    job["step_label"] = labels.get(step, step)
    if progress is None and step in order:
        progress = int(100 * order.index(step) / max(1, len(order) - 1))
    if progress is not None:
        job["progress"] = max(0, min(100, progress))
    if message:
        job["message"] = message
    if result is not None:
        job["result"] = result
    if error is not None:
        job["error"] = error
        job["status"] = "error"
        job["finished_at"] = _now_iso()
        job["progress"] = 100
    if status:
        job["status"] = status
        if status in ("done", "error"):
            job["finished_at"] = _now_iso()
            job["progress"] = 100
    return set_job(job)


def finish_job(result: Any = None, *, error: Optional[str] = None) -> Optional[dict]:
    if error:
        return update_job("done", error, error=error, status="error", progress=100)
    return update_job(
        "done",
        "Draft ready" if result else "Finished",
        progress=100,
        result=result,
        status="done",
    )
