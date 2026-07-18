# backend/app/api/routes/api_keys.py
"""
API Key Management (dashboard side, JWT-auth).

User bikin & kelola key dari sini. Ini BUKAN public data API — ini jalur
web app biasa (get_current_user). Final path: /api/v1/api-keys

Endpoints:
    POST   /api-keys          -> bikin key (balikin key utuh SEKALI)
    GET    /api-keys          -> list key milik user (ter-mask, tanpa hash/key)
    PATCH  /api-keys/{id}     -> rename
    DELETE /api-keys/{id}     -> revoke (soft: is_active=False)
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.api_key import ApiKey, generate_api_key

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

# Batas key aktif per user (cegah spam). Revoke dulu kalau mau bikin lagi.
MAX_ACTIVE_KEYS_PER_USER = 2


# ── Schemas ──
class ApiKeyCreate(BaseModel):
    name: Optional[str] = None


class ApiKeyRename(BaseModel):
    name: str


class ApiKeyCreated(BaseModel):
    """Response saat bikin key — satu-satunya tempat `key` utuh muncul."""
    id: int
    name: Optional[str] = None
    key: str
    key_prefix: str
    created_at: datetime
    message: str = "Simpan key ini sekarang — tidak akan ditampilkan lagi."


class ApiKeyOut(BaseModel):
    """Response list — TANPA key/hash. Aman ditampilkan."""
    id: int
    name: Optional[str] = None
    key_prefix: str
    is_active: bool
    rate_limit_per_min: Optional[int] = None
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ──
@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bikin API key baru. Key utuh dibalikin SEKALI di response ini."""
    active_count = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == current_user.id, ApiKey.is_active == True)  # noqa: E712
        .count()
    )
    if active_count >= MAX_ACTIVE_KEYS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_ACTIVE_KEYS_PER_USER} active keys. Revoke one first.",
        )

    full_key, key_prefix, key_hash = generate_api_key()
    row = ApiKey(
        user_id=current_user.id,
        key_prefix=key_prefix,
        key_hash=key_hash,
        name=payload.name,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return ApiKeyCreated(
        id=row.id,
        name=row.name,
        key=full_key,          # <- satu-satunya kali key utuh dikirim
        key_prefix=key_prefix,
        created_at=row.created_at,
    )


@router.get("", response_model=List[ApiKeyOut])
def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List semua key milik user (aktif & ter-revoke), tanpa key/hash."""
    return (
        db.query(ApiKey)
        .filter(ApiKey.user_id == current_user.id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )


@router.patch("/{key_id}", response_model=ApiKeyOut)
def rename_api_key(
    key_id: int,
    payload: ApiKeyRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ganti label key."""
    row = (
        db.query(ApiKey)
        .filter(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    row.name = payload.name
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{key_id}")
def revoke_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke key (soft: is_active=False). Setelah ini key langsung nggak bisa dipakai."""
    row = (
        db.query(ApiKey)
        .filter(
            ApiKey.id == key_id,
            ApiKey.user_id == current_user.id,
            ApiKey.is_active == True,  # noqa: E712
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active API key not found")
    row.is_active = False
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "message": "API key di-revoke."}
