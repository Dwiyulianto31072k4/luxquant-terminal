# Saved desk screens. Matching new calls raise signal_match notifications;
# Telegram delivery uses notification_preferences like every other type.

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.signal_filter_alerts import _build_conditions

router = APIRouter(prefix="/signal-filters", tags=["signal-filters"])

MAX_FILTERS = 5
ALLOWED_KEYS = {
    "tags",
    "tag_match",
    "exclude_tags",
    "exclude_confound",
    "runners",
    "risk_level",
    "status",
    "rating",
    "min_confidence",
    "direction",
    "pairs",
    "exclude_pairs",
    "min_mcap",
    "max_mcap",
    "max_volume_rank",
    "min_sl_pct",
    "max_sl_pct",
    "btc_decoupled",
    "min_btc_align",
    "edge_top",
    "smc_golden",
}


class FilterIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    criteria: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = False


class FilterPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    criteria: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    telegram: Optional[bool] = None


def _clean_criteria(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return {}
    out = {k: v for k, v in raw.items() if k in ALLOWED_KEYS}
    if str(out.get("tag_match") or "").lower() not in ("any", "all"):
        out.pop("tag_match", None)
    return out


def _row(r, telegram: bool) -> dict:
    return {
        "id": r[0],
        "name": r[1],
        "criteria": r[2] or {},
        "enabled": bool(r[3]),
        "telegram": bool(telegram),
        "created_at": r[4],
        "updated_at": r[5],
        "last_matched_at": r[6],
        "match_count": r[7] or 0,
    }


def _telegram_on(db: Session, user_id: int) -> bool:
    row = db.execute(
        text(
            "SELECT telegram FROM notification_preferences "
            "WHERE user_id = :uid AND notif_type = 'signal_match'"
        ),
        {"uid": user_id},
    ).fetchone()
    return bool(row and row[0])


def _set_telegram(db: Session, user: User, on: bool) -> None:
    if on and user.telegram_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LINK_TELEGRAM_REQUIRED",
        )
    db.execute(
        text(
            """
            INSERT INTO notification_preferences (user_id, notif_type, in_app, telegram, updated_at)
            VALUES (:uid, 'signal_match', true, :tg, NOW())
            ON CONFLICT (user_id, notif_type) DO UPDATE
              SET telegram = EXCLUDED.telegram,
                  in_app = true,
                  updated_at = NOW()
            """
        ),
        {"uid": user.id, "tg": on},
    )


def _require_configured(criteria: dict) -> None:
    if criteria.get("runners") or criteria.get("edge_top"):
        return
    where, _ = _build_conditions(criteria)
    if not where:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pick at least one rule — empty matches every call.",
        )


@router.get("/")
def list_filters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text(
            """
            SELECT id, name, criteria, enabled, created_at, updated_at,
                   last_matched_at, match_count
            FROM signal_alert_filters
            WHERE user_id = :uid
            ORDER BY id ASC
            """
        ),
        {"uid": current_user.id},
    ).fetchall()
    tg = _telegram_on(db, current_user.id)
    return {
        "telegram_linked": current_user.telegram_id is not None,
        "telegram": tg,
        "items": [_row(r, tg) for r in rows],
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_filter(
    data: FilterIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.execute(
        text("SELECT count(*) FROM signal_alert_filters WHERE user_id = :uid"),
        {"uid": current_user.id},
    ).scalar()
    if n >= MAX_FILTERS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILTERS} saved screens.")
    criteria = _clean_criteria(data.criteria)
    _require_configured(criteria)
    name = data.name.strip()
    try:
        row = db.execute(
            text(
                """
                INSERT INTO signal_alert_filters (user_id, name, criteria, enabled)
                VALUES (:uid, :name, CAST(:criteria AS jsonb), :en)
                RETURNING id, name, criteria, enabled, created_at, updated_at,
                          last_matched_at, match_count
                """
            ),
            {
                "uid": current_user.id,
                "name": name,
                "criteria": json.dumps(criteria),
                "en": data.enabled,
            },
        ).fetchone()
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="A screen with that name already exists.")
    return _row(row, _telegram_on(db, current_user.id))


@router.patch("/{filter_id}")
def patch_filter(
    filter_id: int,
    data: FilterPatch,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.execute(
        text(
            "SELECT id FROM signal_alert_filters WHERE id = :id AND user_id = :uid"
        ),
        {"id": filter_id, "uid": current_user.id},
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")

    enabled = data.enabled
    if data.telegram is not None:
        _set_telegram(db, current_user, data.telegram)
        if data.telegram and enabled is None:
            enabled = True

    sets = ["updated_at = now()"]
    params: dict = {"id": filter_id, "uid": current_user.id}
    if data.name is not None:
        sets.append("name = :name")
        params["name"] = data.name.strip()
    if data.criteria is not None:
        criteria = _clean_criteria(data.criteria)
        _require_configured(criteria)
        sets.append("criteria = CAST(:criteria AS jsonb)")
        params["criteria"] = json.dumps(criteria)
    if enabled is not None:
        sets.append("enabled = :en")
        params["en"] = enabled

    row = db.execute(
        text(
            f"""
            UPDATE signal_alert_filters
            SET {", ".join(sets)}
            WHERE id = :id AND user_id = :uid
            RETURNING id, name, criteria, enabled, created_at, updated_at,
                      last_matched_at, match_count
            """
        ),
        params,
    ).fetchone()
    db.commit()
    return _row(row, _telegram_on(db, current_user.id))


@router.delete("/{filter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_filter(
    filter_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = db.execute(
        text("DELETE FROM signal_alert_filters WHERE id = :id AND user_id = :uid"),
        {"id": filter_id, "uid": current_user.id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not found")
    db.commit()


class PreviewIn(BaseModel):
    criteria: dict[str, Any] = Field(default_factory=dict)


@router.post("/preview")
def preview_filter(data: PreviewIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.has_active_access:
        raise HTTPException(403, "Subscription required")
    from app.services.signal_screen import match_screen
    try:
        return {"signal_ids": match_screen(_clean_criteria(data.criteria), db)}
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid Custom criteria")
