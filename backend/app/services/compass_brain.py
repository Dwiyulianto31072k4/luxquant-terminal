"""
LuxQuant BTC Compass 2.0 — Brain Vault (Obsidian-compatible memory)
=====================================================================
A plain markdown vault that acts as the Compass's long-term memory. Every
note has YAML-style frontmatter so both code AND a human (via Obsidian) can
read and edit the same brain.

Layout (COMPASS_BRAIN_DIR, default /root/luxquant-brain):
    lessons/<id>.md       one operating rule per note, with evidence + status
    postmortems/<pid>.md  5-line autopsy of every invalidated projection
    regimes/current.md    latest market-regime snapshot
    README.md             index

Lesson lifecycle (status frontmatter):
    candidate -> validated -> core        (or -> retired)
  Code promotes/demotes automatically from evidence; a human can pin any
  note by setting `locked: true` in Obsidian — reflection then never touches
  its status or prompt_line again.

No external dependencies: frontmatter is parsed/written with a minimal
flat `key: value` reader. Body text below the closing `---` is preserved
verbatim on rewrite (that's where human notes live).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

BRAIN_DIR = Path(os.getenv("COMPASS_BRAIN_DIR", "/root/luxquant-brain"))

LESSON_STATUSES = ("candidate", "validated", "core", "retired")
PROMPT_STATUSES = ("candidate", "validated", "core")  # retired never reaches the prompt


# ════════════════════════════════════════════════════════════════════
# Frontmatter (flat key: value, booleans/ints/floats auto-coerced)
# ════════════════════════════════════════════════════════════════════

def _coerce(value: str) -> Any:
    v = value.strip()
    if v.lower() in ("true", "false"):
        return v.lower() == "true"
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        pass
    return v


def parse_note(text: str) -> tuple[dict[str, Any], str]:
    """Returns (frontmatter, body). Tolerates notes without frontmatter."""
    if not text.startswith("---"):
        return {}, text
    lines = text.splitlines()
    meta: dict[str, Any] = {}
    body_start = len(lines)
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            body_start = i + 1
            break
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = _coerce(value)
    body = "\n".join(lines[body_start:])
    return meta, body


def render_note(meta: dict[str, Any], body: str) -> str:
    lines = ["---"]
    for key, value in meta.items():
        lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines) + "\n" + (body or "")


def read_note(path: Path) -> tuple[dict[str, Any], str]:
    try:
        return parse_note(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}, ""


def write_note(path: Path, meta: dict[str, Any], body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_note(meta, body), encoding="utf-8")


# ════════════════════════════════════════════════════════════════════
# Vault API
# ════════════════════════════════════════════════════════════════════

def vault_available() -> bool:
    try:
        BRAIN_DIR.mkdir(parents=True, exist_ok=True)
        return True
    except Exception:
        return False


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def lesson_path(lesson_id: str) -> Path:
    return BRAIN_DIR / "lessons" / f"{lesson_id}.md"


def list_lessons() -> list[dict[str, Any]]:
    """All lessons with their frontmatter (adds _body/_path)."""
    out: list[dict[str, Any]] = []
    folder = BRAIN_DIR / "lessons"
    if not folder.is_dir():
        return out
    for path in sorted(folder.glob("*.md")):
        meta, body = read_note(path)
        if meta.get("id"):
            meta["_body"] = body
            meta["_path"] = str(path)
            out.append(meta)
    return out


def active_lessons(regime: Optional[str] = None, limit: int = 8) -> list[dict[str, Any]]:
    """
    Lessons eligible for prompt injection: status candidate/validated/core,
    matching the current regime (or regime 'any'). core > validated > candidate.
    """
    rank = {"core": 0, "validated": 1, "candidate": 2}
    picked = [
        m for m in list_lessons()
        if str(m.get("status")) in PROMPT_STATUSES
        and str(m.get("regime", "any")) in ("any", str(regime))
        and m.get("prompt_line")
    ]
    picked.sort(key=lambda m: (rank.get(str(m.get("status")), 9), -int(m.get("evidence_n", 0) or 0)))
    return picked[:limit]


def upsert_lesson(
    lesson_id: str,
    *,
    status: str,
    regime: str,
    prompt_line: str,
    wins: int,
    losses: int,
    kind: str = "cohort_rule",
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Create or update a lesson. Human-locked notes are left untouched."""
    path = lesson_path(lesson_id)
    meta, body = read_note(path)
    if meta.get("locked") is True:
        return
    scored = wins + losses
    meta.update({
        "id": lesson_id,
        "kind": kind,
        "status": status,
        "regime": regime,
        "wins": wins,
        "losses": losses,
        "evidence_n": scored,
        "hit_rate": round(100 * wins / scored) if scored else 0,
        "prompt_line": prompt_line,
        "locked": meta.get("locked", False),
        "updated": _today(),
    })
    if extra:
        meta.update(extra)
    if not body.strip():
        body = (
            f"\n# {lesson_id}\n\n"
            f"Auto-generated by compass_reflection from first-barrier outcomes.\n"
            f"Edit freely below this line — code only rewrites the frontmatter.\n"
        )
    write_note(path, meta, body)


def write_postmortem(projection_id: str, meta: dict[str, Any], body: str) -> bool:
    """Write once; never overwrite an existing postmortem."""
    path = BRAIN_DIR / "postmortems" / f"{projection_id}.md"
    if path.exists():
        return False
    write_note(path, meta, body)
    return True


def write_regime_snapshot(meta: dict[str, Any], body: str) -> None:
    write_note(BRAIN_DIR / "regimes" / "current.md", meta, body)


def write_index(body: str) -> None:
    write_note(
        BRAIN_DIR / "README.md",
        {"title": "LuxQuant Compass Brain", "updated": _today()},
        body,
    )


def classify_regime(trend_72h_pct: Optional[float]) -> str:
    if trend_72h_pct is None:
        return "any"
    if trend_72h_pct > 1.0:
        return "trend_up"
    if trend_72h_pct < -1.0:
        return "trend_down"
    return "flat"


__all__ = [
    "BRAIN_DIR",
    "active_lessons",
    "classify_regime",
    "lesson_path",
    "list_lessons",
    "parse_note",
    "read_note",
    "render_note",
    "upsert_lesson",
    "vault_available",
    "write_index",
    "write_note",
    "write_postmortem",
    "write_regime_snapshot",
]
