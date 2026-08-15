"""Authenticated, allowlisted growth milestone ingestion."""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.growth_measurement import (
    CLIENT_GROWTH_EVENTS,
    record_growth_event,
)

router = APIRouter(prefix="/api/v1/growth", tags=["growth-measurement"])

CLIENT_META_KEYS = frozenset(
    {
        "status",
        "plan_name",
        "price_usdt",
        "auto_retry",
    }
)

_RATE: dict[int, list[float]] = defaultdict(list)
_RATE_MAX = 120
_RATE_WINDOW_SECONDS = 60.0


def _rate_ok(user_id: int) -> bool:
    now = time.time()
    bucket = _RATE[int(user_id)]
    cutoff = now - _RATE_WINDOW_SECONDS
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= _RATE_MAX:
        return False
    bucket.append(now)
    return True


class GrowthEventIn(BaseModel):
    event: str = Field(..., max_length=64)
    event_id: Optional[str] = Field(None, max_length=80)
    session_id: Optional[str] = Field(None, max_length=80)
    source: Optional[str] = Field(None, max_length=80)
    path: Optional[str] = Field(None, max_length=200)
    entity_type: Optional[str] = Field(None, max_length=40)
    entity_id: Optional[str] = Field(None, max_length=100)
    meta: Optional[dict[str, Any]] = None


@router.post("/event")
def ingest_growth_event(
    body: GrowthEventIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = body.event.strip().lower()
    if event not in CLIENT_GROWTH_EVENTS:
        raise HTTPException(status_code=400, detail="unknown growth event")
    if not _rate_ok(current_user.id):
        raise HTTPException(status_code=429, detail="growth event rate limit exceeded")

    try:
        safe_meta = {
            key: value
            for key, value in (body.meta or {}).items()
            if key in CLIENT_META_KEYS
        }
        inserted = record_growth_event(
            db,
            user_id=current_user.id,
            event=event,
            event_id=body.event_id,
            session_id=body.session_id,
            source=body.source,
            path=body.path,
            entity_type=body.entity_type,
            entity_id=body.entity_id,
            meta=safe_meta,
            commit=True,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="growth measurement unavailable") from exc

    return {"ok": True, "inserted": inserted}
