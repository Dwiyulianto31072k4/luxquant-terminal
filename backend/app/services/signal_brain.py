"""
LuxQuant Signal Brain — BTC-only Obsidian vault
================================================
Long-term memory for **BTCUSDT trading signals** (not Compass projections).

Layout (SIGNAL_BRAIN_DIR, default /root/luxquant-signal-brain):
    lessons/<id>.md          operating rules (tag / risk / hour cohorts)
    postmortems/<sid>.md     autopsy of SL / closed_loss BTC signals
    months/<YYYY-MM>.md      monthly scorecard (retrace window)
    regimes/current.md       latest BTC tape snapshot (optional)
    README.md                index

Separate from /root/luxquant-brain (Compass). Same markdown+frontmatter
format so you can open both vaults in Obsidian.

Human pin: set `locked: true` on a lesson — reflection never overwrites it.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

BRAIN_DIR = Path(os.getenv("SIGNAL_BRAIN_DIR", "/root/luxquant-signal-brain"))
PAIR = os.getenv("SIGNAL_BRAIN_PAIR", "BTCUSDT")

LESSON_STATUSES = ("candidate", "validated", "core", "retired")
PROMPT_STATUSES = ("candidate", "validated", "core")


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


def vault_available() -> bool:
    try:
        BRAIN_DIR.mkdir(parents=True, exist_ok=True)
        (BRAIN_DIR / "lessons").mkdir(exist_ok=True)
        (BRAIN_DIR / "postmortems").mkdir(exist_ok=True)
        (BRAIN_DIR / "months").mkdir(exist_ok=True)
        (BRAIN_DIR / "regimes").mkdir(exist_ok=True)
        return True
    except Exception as exc:
        logger.warning("Signal brain vault unavailable: %s", exc)
        return False


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def lesson_path(lesson_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in lesson_id)
    return BRAIN_DIR / "lessons" / f"{safe}.md"


def list_lessons() -> list[dict[str, Any]]:
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


def list_postmortems(limit: int = 80) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    folder = BRAIN_DIR / "postmortems"
    if not folder.is_dir():
        return out
    for path in folder.glob("*.md"):
        meta, _ = read_note(path)
        if meta.get("id"):
            out.append(meta)
    out.sort(key=lambda m: str(m.get("updated", "")), reverse=True)
    return out[:limit]


def list_months(limit: int = 36) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    folder = BRAIN_DIR / "months"
    if not folder.is_dir():
        return out
    for path in sorted(folder.glob("*.md"), reverse=True):
        meta, body = read_note(path)
        if meta.get("id"):
            meta["_body"] = body
            out.append(meta)
        if len(out) >= limit:
            break
    return out


def active_lessons(limit: int = 10) -> list[dict[str, Any]]:
    """Lessons eligible for UI / future prompt inject."""
    rank = {"core": 0, "validated": 1, "candidate": 2}
    picked = [
        m
        for m in list_lessons()
        if str(m.get("status")) in PROMPT_STATUSES and m.get("prompt_line")
    ]
    picked.sort(
        key=lambda m: (
            rank.get(str(m.get("status")), 9),
            -int(m.get("evidence_n", 0) or 0),
        )
    )
    return picked[:limit]


def upsert_lesson(
    lesson_id: str,
    *,
    status: str,
    window: str,
    prompt_line: str,
    wins: int,
    losses: int,
    kind: str = "signal_cohort",
    extra: Optional[dict[str, Any]] = None,
) -> None:
    path = lesson_path(lesson_id)
    meta, body = read_note(path)
    if meta.get("locked") is True:
        return
    scored = wins + losses
    meta.update(
        {
            "id": lesson_id,
            "kind": kind,
            "pair": PAIR,
            "status": status,
            "window": window,
            "wins": wins,
            "losses": losses,
            "evidence_n": scored,
            "hit_rate": round(100 * wins / scored) if scored else 0,
            "prompt_line": prompt_line,
            "locked": meta.get("locked", False),
            "updated": _today(),
        }
    )
    if extra:
        meta.update(extra)
    if not body.strip():
        body = (
            f"\n# {lesson_id}\n\n"
            f"Auto-generated by signal_reflection from resolved {PAIR} signals.\n"
            f"Edit freely below this line — code only rewrites the frontmatter.\n"
        )
    write_note(path, meta, body)


def write_postmortem(signal_id: str, meta: dict[str, Any], body: str) -> bool:
    """Write once; never overwrite."""
    path = BRAIN_DIR / "postmortems" / f"{signal_id}.md"
    if path.exists():
        return False
    write_note(path, meta, body)
    return True


def write_month(ym: str, meta: dict[str, Any], body: str) -> None:
    """Monthly scorecard (retrace). Overwrites body stats; preserves human notes after marker."""
    path = BRAIN_DIR / "months" / f"{ym}.md"
    _, old_body = read_note(path)
    marker = "<!-- human notes below — preserved -->"
    human = ""
    if marker in old_body:
        human = old_body.split(marker, 1)[1]
    else:
        human = "\n"
    full_body = body.rstrip() + f"\n\n{marker}\n" + human.lstrip("\n")
    meta = {**meta, "id": ym, "kind": "month", "pair": PAIR, "updated": _today()}
    write_note(path, meta, full_body)


def write_index(body: str) -> None:
    write_note(
        BRAIN_DIR / "README.md",
        {
            "title": f"LuxQuant Signal Brain — {PAIR}",
            "pair": PAIR,
            "updated": _today(),
        },
        body,
    )


def write_regime_snapshot(meta: dict[str, Any], body: str) -> None:
    write_note(BRAIN_DIR / "regimes" / "current.md", meta, body)


__all__ = [
    "BRAIN_DIR",
    "PAIR",
    "active_lessons",
    "lesson_path",
    "list_lessons",
    "list_months",
    "list_postmortems",
    "parse_note",
    "read_note",
    "render_note",
    "upsert_lesson",
    "vault_available",
    "write_index",
    "write_month",
    "write_note",
    "write_postmortem",
    "write_regime_snapshot",
]
