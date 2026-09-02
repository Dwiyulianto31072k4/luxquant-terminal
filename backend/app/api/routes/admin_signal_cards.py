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
import io
import json
import logging
import os
import subprocess
import zipfile
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.x_links import tweet_url

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

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
    "etf_flows_eth":  {"label": "ETF Flows (ETH)",  "group": "insight"},
    # Bundles: the leaderboard plus a Proof of Call receipt for each coin on it,
    # published as one post. image_path is the leaderboard, so everything that
    # reads a draft row keeps working; the receipts ride in images_json.
    "daily_gainers_bundle":   {"label": "Top Gainers + Proof",     "group": "gainers"},
    "weekly_gainers_bundle":  {"label": "Weekly Gainers + Proof",  "group": "gainers"},
    "monthly_gainers_bundle": {"label": "Monthly Gainers + Proof", "group": "gainers"},
    # Every card that names one of our calls ships its receipts with it.
    "daily_recap_bundle":   {"label": "Daily Recap + Proof",   "group": "recap"},
    "weekly_recap_bundle":  {"label": "Weekly Recap + Proof",  "group": "recap"},
    "monthly_recap_bundle": {"label": "Monthly Recap + Proof", "group": "recap"},
    "sector_edge_bundle":   {"label": "Sector Edge + Proof",   "group": "insight"},
    "track_record_bundle":  {"label": "Track Record (Monthly) + Proof", "group": "insight"},
    "weekly_track_record_bundle": {"label": "Track Record (Weekly) + Proof", "group": "insight"},
}
# Slot clock (UTC) — mirrors the systemd timers luxquant-card-poster-{a..g}.timer.
# (hour, minute): G fires at :30, so the clock cannot be hours alone.
SLOT_HOURS = {"A": (0, 0), "B": (10, 0), "C": (14, 0), "D": (15, 0),
              "E": (1, 0), "F": (11, 0), "G": (14, 30)}
SLOTS = ["A", "E", "B", "F", "C", "G", "D"]  # display order = chronological by time


def pick_card(d, slot: str) -> str:
    """Exact mirror of card_poster.pick_card (7 slots). "" = nothing this slot today."""
    wd = d.weekday()  # Mon=0 .. Sun=6
    if slot == "A":
        return "daily_recap_bundle"
    if slot == "B":
        return "daily_gainers_bundle"
    if slot == "C":
        return "etf_flows" if wd in (1, 2, 3, 4, 5) else ""
    if slot == "G":
        return "etf_flows_eth" if wd in (1, 2, 3, 4, 5) else ""
    if slot == "D":
        if d.day == 15:
            return "track_record_bundle"
        return {2: "sector_edge_bundle", 4: "money_flow",
                6: "weekly_track_record_bundle"}.get(wd, "")
    if slot == "E":
        if d.day == 1:
            return "monthly_recap_bundle"
        return "weekly_recap_bundle" if wd == 0 else ""
    if slot == "F":
        if d.day == 1:
            return "monthly_gainers_bundle"
        return "weekly_gainers_bundle" if wd == 0 else ""
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
    # Bundles keep their full carousel here; card_poster adds the same column, and
    # whichever process runs first must not leave the other reading a missing one.
    db.execute(text("ALTER TABLE signal_card_drafts ADD COLUMN IF NOT EXISTS images_json text"))
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
    for slot, (hh, mm) in SLOT_HOURS.items():
        nxt = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
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
        "slots": {s: "%02d:%02d UTC" % SLOT_HOURS[s] for s in SLOTS},
    }


@router.post("/mode")
def set_mode(body: ModeIn, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    if body.mode not in ("draft", "post"):
        raise HTTPException(400, "mode must be draft or post")
    _write_mode(body.mode)
    return {"mode": body.mode}


def _slides(image_path, images_json) -> list:
    """Every slide of a draft, in post order, filtered to what is still on disk.

    A bundle stores its full carousel in images_json and repeats the lead card in
    image_path; a plain card has image_path only. Falling back to image_path means
    rows written before bundles existed keep behaving exactly as they did.
    """
    paths = []
    if images_json:
        try:
            paths = [p for p in json.loads(images_json) if p]
        except Exception:
            paths = []
    if not paths and image_path:
        paths = [image_path]
    return [p for p in paths if os.path.exists(p)]


@router.get("")
def list_drafts(status: str = None, limit: int = 60,
                db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    _ensure_table(db)
    where = "" if not status or status == "all" else "WHERE status = :st"
    rows = db.execute(text(f"""SELECT id, card_key, slot, post_date, caption, reply_text,
            status, mode, tweet_id, created_at, posted_at, image_path, images_json
        FROM signal_card_drafts {where} ORDER BY created_at DESC LIMIT :lim"""),
        {"st": status, "lim": min(limit, 200)}).mappings().all()
    out = []
    for r in rows:
        d = dict(r)
        slides = _slides(r["image_path"], r.get("images_json"))
        d["label"] = CARD_META.get(r["card_key"], {}).get("label", r["card_key"])
        d["has_image"] = bool(slides)
        d["slide_count"] = len(slides)
        d["image_url"] = f"/api/v1/admin/signal-cards/{r['id']}/image"
        # Every slide addressable, so the tab can page through a carousel.
        d["slide_urls"] = [f"/api/v1/admin/signal-cards/{r['id']}/image?n={i}"
                           for i in range(len(slides))]
        d["download_url"] = f"/api/v1/admin/signal-cards/{r['id']}/download"
        # No Telegram fallback here: signal_card_drafts stores no message id.
        # Pre-cutover cards therefore get no link rather than a dead one.
        d["tweet_url"] = tweet_url(r["tweet_id"], r.get("posted_at"))
        d.pop("image_path", None)
        d.pop("images_json", None)
        out.append(d)
    return {"drafts": out}


def _thumb(path: str, width: int):
    """A small JPEG beside the original, made once and reused.

    The cards render at 2x — 2160x2700, ~4.8MB each — and the admin grid was
    downloading every one of them at full size to fill a 300px box: twelve
    drafts on screen meant 40MB before the page settled. Previews are for
    looking at, not for publishing, so they are JPEG; every download path still
    serves the untouched PNG.

    Cached as `<original>.w<width>.jpg`, which keeps it inside the drafts folder
    and therefore inside the retention sweep — no second thing to clean up.
    Returns the original on any failure, so a preview is never lost to this.
    """
    width = max(120, min(int(width), 1200))
    out = f"{path}.w{width}.jpg"
    try:
        if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(path):
            return out, "image/jpeg"
        from PIL import Image
        with Image.open(path) as im:
            if im.width <= width:
                return path, "image/png"
            im.convert("RGB").resize(
                (width, round(im.height * width / im.width)), Image.LANCZOS
            ).save(out, "JPEG", quality=82, optimize=True)
        return out, "image/jpeg"
    except Exception:
        logger.warning("thumbnail failed for %s", path, exc_info=True)
        return path, "image/png"


@router.get("/{draft_id}/image")
def draft_image(draft_id: int, n: int = 0, w: int = 0,
                db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """One slide. n defaults to 0 and w to 0 (full size), so existing callers are
    unaffected; the admin grid asks for a width and gets a thumbnail."""
    row = db.execute(text("SELECT image_path, images_json FROM signal_card_drafts WHERE id=:i"),
                     {"i": draft_id}).fetchone()
    if not row:
        raise HTTPException(404, "draft not found")
    slides = _slides(row[0], row[1])
    if not slides:
        raise HTTPException(404, "image not found")
    if n < 0 or n >= len(slides):
        raise HTTPException(404, f"slide {n} not found — this draft has {len(slides)}")
    path, media = (slides[n], "image/png") if w <= 0 else _thumb(slides[n], w)
    return FileResponse(path, media_type=media,
                        headers={"Cache-Control": "private, max-age=86400"})


@router.get("/{draft_id}/download")
def draft_download(draft_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """The whole post as one zip — every slide in post order, plus the caption.

    Slides are numbered 01, 02, … so they sort correctly in Finder and upload to
    Instagram in the order they were composed; caption.txt carries the same text
    that went to X, so nothing has to be retyped.
    """
    row = db.execute(text("""SELECT card_key, post_date, caption, reply_text, image_path, images_json
                             FROM signal_card_drafts WHERE id=:i"""), {"i": draft_id}).mappings().first()
    if not row:
        raise HTTPException(404, "draft not found")
    slides = _slides(row["image_path"], row["images_json"])
    if not slides:
        raise HTTPException(404, "no images on this draft")

    stem = f"luxquant-{row['card_key'] or 'card'}-{row['post_date'] or draft_id}"
    buf = io.BytesIO()
    # STORED, not DEFLATED: PNG is already compressed, so deflating ~25MB of
    # slides costs seconds of CPU and saves nothing.
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for i, p in enumerate(slides, start=1):
            z.write(p, f"{stem}/{i:02d}.png")
        caption = (row["caption"] or "").strip()
        if row["reply_text"]:
            caption += "\n\n--- reply ---\n" + row["reply_text"].strip()
        z.writestr(f"{stem}/caption.txt", caption + "\n")
    # Whole zip is already in memory, so hand it over as one body. Streaming a
    # BytesIO iterates it by LINE, which shreds binary data into a chunk per 0x0A.
    return Response(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{stem}.zip"'})


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
