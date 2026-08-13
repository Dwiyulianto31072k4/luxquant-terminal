"""Agent acknowledgement log + PDF (user submit, admin read)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user, get_current_user
from app.core.database import get_db
from app.models.agent_disclaimer import AgentDisclaimerAck
from app.models.user import User
from app.services.agent_disclaimer_pdf import build_ack_pdf
from app.services.geo_helpers import client_ip_from_request

router = APIRouter(tags=["agent-disclaimer"])

ALLOWED_KINDS = {"assistant", "live"}


def _ensure(db: Session) -> None:
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS agent_disclaimer_acks (
                id            SERIAL PRIMARY KEY,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                kind          VARCHAR(32) NOT NULL,
                version       VARCHAR(32) NOT NULL,
                accepted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                ip            VARCHAR(64),
                user_agent    TEXT,
                title         VARCHAR(240),
                checks        JSONB NOT NULL DEFAULT '[]'::jsonb,
                form_snapshot JSONB
            )
            """
        )
    )
    db.execute(
        text(
            "CREATE INDEX IF NOT EXISTS idx_agent_disclaimer_user_time "
            "ON agent_disclaimer_acks (user_id, accepted_at DESC)"
        )
    )
    db.commit()


class CheckItem(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=600)
    checked: bool = True


class SectionItem(BaseModel):
    title: str = Field(default="", max_length=200)
    body: str = Field(default="", max_length=4000)


class AckBody(BaseModel):
    kind: str = Field(min_length=3, max_length=32)
    version: str = Field(min_length=1, max_length=32)
    title: str = Field(default="", max_length=240)
    checks: list[CheckItem] = Field(min_length=1, max_length=12)
    sections: list[SectionItem] = Field(default_factory=list, max_length=12)


def _serialize(row: AgentDisclaimerAck) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "kind": row.kind,
        "version": row.version,
        "title": row.title,
        "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
        "ip": row.ip,
        "user_agent": row.user_agent,
        "checks": row.checks or [],
        "form_snapshot": row.form_snapshot,
        "pdf_url": f"/api/v1/admin/users/{row.user_id}/agent-acks/{row.id}/pdf",
    }


@router.post("/agent/disclaimer-acks")
def submit_ack(
    body: AckBody,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kind = body.kind.strip().lower()
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=422, detail="kind must be assistant or live")
    if not all(item.checked for item in body.checks):
        raise HTTPException(status_code=422, detail="Every box on the form must be checked")
    _ensure(db)
    row = AgentDisclaimerAck(
        user_id=user.id,
        kind=kind,
        version=body.version.strip(),
        accepted_at=datetime.now(timezone.utc),
        ip=client_ip_from_request(request),
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        title=body.title.strip() or None,
        checks=[item.model_dump() for item in body.checks],
        form_snapshot={
            "title": body.title,
            "sections": [item.model_dump() for item in body.sections],
            "checks": [item.model_dump() for item in body.checks],
        },
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "item": _serialize(row)}


@router.get("/agent/disclaimer-acks")
def my_acks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure(db)
    rows = (
        db.query(AgentDisclaimerAck)
        .filter(AgentDisclaimerAck.user_id == user.id)
        .order_by(AgentDisclaimerAck.accepted_at.desc())
        .limit(50)
        .all()
    )
    return {"items": [_serialize(row) for row in rows]}


@router.get("/agent/disclaimer-acks/{ack_id}/pdf")
def my_ack_pdf(
    ack_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure(db)
    row = db.query(AgentDisclaimerAck).filter(AgentDisclaimerAck.id == ack_id).first()
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Acknowledgement not found")
    return _pdf_response(row, user)


@router.get("/admin/users/{user_id}/agent-acks")
def admin_list_acks(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    _ = admin
    _ensure(db)
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    rows = (
        db.query(AgentDisclaimerAck)
        .filter(AgentDisclaimerAck.user_id == user_id)
        .order_by(AgentDisclaimerAck.accepted_at.desc())
        .limit(100)
        .all()
    )
    return {
        "user": {"id": target.id, "username": target.username, "email": target.email},
        "items": [_serialize(row) for row in rows],
    }


@router.get("/admin/users/{user_id}/agent-acks/{ack_id}/pdf")
def admin_ack_pdf(
    user_id: int,
    ack_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    _ = admin
    _ensure(db)
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    row = (
        db.query(AgentDisclaimerAck)
        .filter(AgentDisclaimerAck.id == ack_id, AgentDisclaimerAck.user_id == user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Acknowledgement not found")
    return _pdf_response(row, target)


def _pdf_response(row: AgentDisclaimerAck, user: User) -> Response:
    payload = build_ack_pdf(ack=row, user=user)
    filename = f"luxquant-agent-{row.kind}-{row.id}.pdf"
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
