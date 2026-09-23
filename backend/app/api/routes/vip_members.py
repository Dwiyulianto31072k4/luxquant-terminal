"""VIP group membership — admin endpoints for Management System › VIP Members.

  GET  /api/v1/workspace/vip-members                list + counts (filter, search)
  GET  /api/v1/workspace/vip-members/{tg}/events    that member's history
  POST /api/v1/workspace/vip-members/{tg}/note      write/clear a note
  POST /api/v1/workspace/vip-members/{tg}/remove    take the seat back (bot kick)
  POST /api/v1/workspace/vip-members/scan           re-read the member list now

See app/services/vip_members.py for where the data comes from.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User
from app.services import vip_members

router = APIRouter(prefix="/api/v1/workspace/vip-members", tags=["vip-members"])

SCAN_UNIT = "luxquant-vip-scan.service"


@router.get("")
def list_vip_members(
    trace: Optional[str] = Query(None),
    q: Optional[str] = Query(None, max_length=80),
    present: bool = Query(True),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    return vip_members.list_members(db, trace=trace, q=q, present=present)


@router.get("/{telegram_id}/events")
def member_history(
    telegram_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    return {"items": vip_members.member_events(db, telegram_id)}


class NoteIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


@router.post("/{telegram_id}/note")
def write_note(
    telegram_id: int,
    data: NoteIn,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    vip_members.set_note(db, telegram_id, data.note, admin.id)
    return {"ok": True}


@router.post("/{telegram_id}/remove")
async def remove_member(
    telegram_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Take a seat back. Ban + unban, so the person can rejoin if they pay."""
    from app.services.telegram_group import kick_member

    if not await kick_member(telegram_id):
        raise HTTPException(status_code=502, detail="Telegram refused the removal")
    vip_members.record_removal(db, telegram_id, admin.id, admin.username or f"admin:{admin.id}")
    return {"ok": True}


@router.post("/scan")
def scan_now(admin: User = Depends(get_admin_user)):
    """Ask the Telethon session to re-read the member list (the Bot API cannot)."""
    import subprocess

    try:
        r = subprocess.run(["systemctl", "start", SCAN_UNIT], capture_output=True, text=True, timeout=10)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not start the scan: {type(e).__name__}")
    if r.returncode != 0:
        raise HTTPException(status_code=500, detail=(r.stderr or "").strip()[:200] or "scan failed to start")
    return {"ok": True, "started": SCAN_UNIT}
