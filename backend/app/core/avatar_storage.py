# backend/app/core/avatar_storage.py
"""
Where uploaded avatars live, and how to tell them apart from provider avatars.

Prod serves /api/v1/avatars/ straight off disk (nginx alias
/opt/luxquant/avatars/), so uploads MUST land there or every avatar 404s.
Dev boxes have no /opt/luxquant → fall back to ./avatars, which main.py mounts
as StaticFiles so the same URL works without nginx.
"""
import os
from pathlib import Path
from typing import Optional

# Public URL prefix for uploaded avatars (nginx + StaticFiles both serve it).
AVATAR_URL_PREFIX = "/api/v1/avatars/"


def _resolve_avatar_dir() -> Path:
    for candidate in (os.getenv("AVATAR_DIR"), "/opt/luxquant/avatars", "./avatars"):
        if not candidate:
            continue
        path = Path(candidate)
        try:
            path.mkdir(parents=True, exist_ok=True)
            return path
        except OSError:
            continue
    return Path("./avatars")


AVATAR_DIR = _resolve_avatar_dir()


def is_uploaded_avatar(url: Optional[str]) -> bool:
    """True if this avatar is a file the user uploaded to us (not Google/Discord/TG)."""
    return bool(url) and AVATAR_URL_PREFIX in url


def uploaded_avatar_path(url: Optional[str]) -> Optional[Path]:
    """Local file behind an uploaded-avatar URL, or None if it isn't one of ours."""
    if not is_uploaded_avatar(url):
        return None
    filename = url.rsplit(AVATAR_URL_PREFIX, 1)[-1]
    # Defensive: the URL is user-visible, never let it escape AVATAR_DIR.
    filename = os.path.basename(filename)
    if not filename:
        return None
    return AVATAR_DIR / filename
