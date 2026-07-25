"""
Admin Signal Cards

Control panel for the automated LuxQuant social-card pipeline (Daily Recap, Top
Gainers, Track Record, Money Flow, Sector Edge, weekly/monthly variants).

The heavy lifting lives on the VPS in /root/luxquant-social-cards/card_poster.py
(renders the card + writes a humanized Claude Haiku caption). This router is a thin
control surface: read/flip draft-vs-post mode, trigger a render, review drafts, and
approve → publish. Publishing shells out to card_poster (which owns the X/Telegram
creds in its own venv) so no posting secrets live in the backend.
"""
import os
import subprocess
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/admin/signal-cards", tags=["admin-signal-cards"])

CARD_DIR = "/root/luxquant-social-cards"
POSTER_PY = "/root/luxquant-x-poster/venv/bin/python"
CARD_POSTER = f"{CARD_DIR}/card_poster.py"
POSTER_ENV = f"{CARD_DIR}/poster.env"

CARD_META = {
    "daily_recap":    {"label": "Daily Recap",     "group": "recap"},
    "weekly_recap":   {"label": "Weekly Recap",    "group": "recap"},
    "monthly_recap":  {"label": "Monthly Recap",   "group": "recap"},
    "daily_gainers":  {"label": "Top Gainers",     "group": "gainers"},
    "weekly_gainers": {"label": "Weekly Gainers",  "group": "gainers"},
    "monthly_gainers":{"label": "Monthly Gainers", "group": "gainers"},
    "track_record":   {"label": "Track Record (Monthly)", "group": "insight"},
    "weekly_track_record": {"label": "Track Record (Weekly)", "group": "insight"},
    "money_flow":     {"label": "Money Flow",       "group": "insight"},
    "sector_edge":    {"label": "Sector Edge",      "group": "insight"},
    "etf_flows":      {"label": "ETF Flows",        "group": "insight"},
}
# Slot clock (UTC) — mirrors the systemd timers luxquant-card-poster-{a..f}.timer
SLOT_HOURS = {"A": 0, "B": 10, "C": 14, "D": 15, "E": 1, "F": 11}
SLOTS = ["A", "E", "B", "F", "C", "D"]  # display order = chronological by hour


def pick_card(d, slot: str) -> str:
    """Exact mirror of card_poster.pick_card (6 slots). "" = nothing this slot today."""
    wd = d.weekday()  # Mon=0 .. Sun=6
    if slot == "A":
        return "daily_recap"
    if slot == "B":
        return "daily_gainers"
    if slot == "C":
        return "etf_flows" if wd in (1, 2, 3, 4, 5) else ""
    if slot == "D":
        if d.day == 15:
            return "track_record"
        return {2: "sector_edge", 4: "money_flow", 6: "weekly_track_record"}.get(wd, "")
    if slot == "E":
        if d.day == 1:
            return "monthly_recap"
        return "weekly_recap" if wd == 0 else ""
    if slot == "F":
        if d.day == 1:
            return "monthly_gainers"
        return "weekly_gainers" if wd == 0 else ""
    return ""


def _schedule_rows():
    """Next 7 days, each slot resolved — so the tab shows exactly what will post."""
    today = datetime.now(timezone.utc).date()
    rows = []
    for i in range(7):
        d = today + timedelta(days=i)
        row = {"day": d.strftime("%a"), "date": d.isoformat()}
        for s in SLOTS:
            row[s] = pick_card(d, s)
        rows.append(row)
    return rows


def _ensure_table(db: Session):
    db.execute(text("""CREATE TABLE IF NOT EXISTS signal_card_drafts(
        id serial PRIMARY KEY, card_key text NOT NULL, slot text, post_date date,
        image_path text, caption text, reply_text text,
        status text NOT NULL DEFAULT 'draft', mode text, tweet_id text, error text,
        created_at timestamptz DEFAULT now(), posted_at timestamptz)"""))
    db.commit()


def _read_mode() -> str:
    try:
        for line in open(POSTER_ENV):
            line = line.strip()
            if line.startswith("CARD_POST_MODE="):
                return line.split("=", 1)[1].strip() or "draft"
    except FileNotFoundError:
        pass
    return "draft"


def _write_mode(mode: str):
    lines, seen = [], False
    try:
        for line in open(POSTER_ENV):
            if line.strip().startswith("CARD_POST_MODE="):
                lines.append(f"CARD_POST_MODE={mode}\n"); seen = True
            else:
                lines.append(line)
    except FileNotFoundError:
        pass
    if not seen:
        lines.append(f"CARD_POST_MODE={mode}\n")
    with open(POSTER_ENV, "w") as f:
        f.writelines(lines)


def _next_runs():
    """Upcoming slot firings that actually have a card, soonest first."""
    now = datetime.now(timezone.utc)
    out = []
    for slot, hh in SLOT_HOURS.items():
        nxt = now.replace(hour=hh, minute=0, second=0, microsecond=0)
        for _ in range(8):                       # walk forward to the next day that has one
            if nxt > now:
                card = pick_card(nxt.date(), slot)
                if card:
                    out.append({"slot": slot, "at": nxt.isoformat(), "card_key": card,
                                "label": CARD_META.get(card, {}).get("label", card)})
                    break
            nxt += timedelta(days=1)
    out.sort(key=lambda r: r["at"])
    return out


def _run_poster(args: list):
    subprocess.run([POSTER_PY, CARD_POSTER, *args],
                   cwd=CARD_DIR, capture_output=True, text=True, timeout=300)


class ModeIn(BaseModel):
    mode: str  # draft | post


class RenderIn(BaseModel):
    card_key: str


class StatusIn(BaseModel):
    status: str  # approved | rejected


@router.get("/config")
def get_config(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    return {
        "mode": _read_mode(),
        "schedule": _schedule_rows(),
        "cards": [{"key": k, **v} for k, v in CARD_META.items()],
        "next_runs": _next_runs(),
        "slot_order": SLOTS,
        "slots": {s: f"{SLOT_HOURS[s]:02d}:00 UTC" for s in SLOTS},
    }


@router.post("/mode")
def set_mode(body: ModeIn, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    if body.mode not in ("draft", "post"):
        raise HTTPException(400, "mode must be draft or post")
    _write_mode(body.mode)
    return {"mode": body.mode}


@router.get("")
def list_drafts(status: str = None, limit: int = 60,
                db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    _ensure_table(db)
    where = "" if not status or status == "all" else "WHERE status = :st"
    rows = db.execute(text(f"""SELECT id, card_key, slot, post_date, caption, reply_text,
            status, mode, tweet_id, created_at, posted_at, image_path
        FROM signal_card_drafts {where} ORDER BY created_at DESC LIMIT :lim"""),
        {"st": status, "lim": min(limit, 200)}).mappings().all()
    out = []
    for r in rows:
        d = dict(r)
        d["label"] = CARD_META.get(r["card_key"], {}).get("label", r["card_key"])
        d["has_image"] = bool(r["image_path"] and os.path.exists(r["image_path"]))
        d["image_url"] = f"/api/v1/admin/signal-cards/{r['id']}/image"
        d["tweet_url"] = f"https://x.com/luxquantcrypto/status/{r['tweet_id']}" if r["tweet_id"] else None
        d.pop("image_path", None)
        out.append(d)
    return {"drafts": out}


@router.get("/{draft_id}/image")
def draft_image(draft_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    row = db.execute(text("SELECT image_path FROM signal_card_drafts WHERE id=:i"), {"i": draft_id}).fetchone()
    if not row or not row[0] or not os.path.exists(row[0]):
        raise HTTPException(404, "image not found")
    return FileResponse(row[0], media_type="image/png")


@router.post("/render")
def render_now(body: RenderIn, background: BackgroundTasks,
               db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    if body.card_key not in CARD_META:
        raise HTTPException(400, "unknown card_key")
    background.add_task(_run_poster, ["--card", body.card_key, "--mode", "draft"])
    return {"ok": True, "card_key": body.card_key, "note": "rendering — refresh in a few seconds"}


@router.patch("/{draft_id}/status")
def set_status(draft_id: int, body: StatusIn,
               db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    if body.status not in ("approved", "rejected", "draft"):
        raise HTTPException(400, "invalid status")
    db.execute(text("UPDATE signal_card_drafts SET status=:s WHERE id=:i AND status<>'posted'"),
               {"s": body.status, "i": draft_id})
    db.commit()
    return {"ok": True, "id": draft_id, "status": body.status}


@router.post("/{draft_id}/post")
def post_draft(draft_id: int, background: BackgroundTasks,
               db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    row = db.execute(text("SELECT status FROM signal_card_drafts WHERE id=:i"), {"i": draft_id}).fetchone()
    if not row:
        raise HTTPException(404, "draft not found")
    if row[0] == "posted":
        raise HTTPException(400, "already posted")
    background.add_task(_run_poster, ["--post-draft", str(draft_id)])
    return {"ok": True, "id": draft_id, "note": "publishing to X + Telegram"}


@router.delete("/{draft_id}")
def delete_draft(draft_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    db.execute(text("DELETE FROM signal_card_drafts WHERE id=:i AND status<>'posted'"), {"i": draft_id})
    db.commit()
    return {"ok": True}
