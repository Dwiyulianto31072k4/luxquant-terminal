# backend/app/api/routes/profile.py
"""
Profile Management Routes

Endpoints:
  PUT   /profile          → Update username
  POST  /profile/avatar   → Upload avatar image
  DELETE /profile/avatar   → Remove avatar (revert to provider avatar or none)
  POST  /profile/link-google   → Link Google account to current user
  POST  /profile/link-telegram → Link Telegram account to current user
  DELETE /profile/unlink-google   → Unlink Google
  DELETE /profile/unlink-telegram → Unlink Telegram
  GET   /profile/connections     → Get linked accounts status
"""
import os
import re
import uuid
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse
from app.schemas.profile import ProfileUpdate

router = APIRouter(prefix="/profile", tags=["Profile"])

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com"
)

# Avatar upload config
AVATAR_DIR = Path(os.getenv("AVATAR_DIR", "./avatars"))
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


# ════════════════════════════════════════════
# 1. Update Profile (username)
# ════════════════════════════════════════════

@router.put("", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update username"""

    if data.username is not None:
        new_username = data.username.strip().lower()

        # Validate format
        if len(new_username) < 3:
            raise HTTPException(status_code=400, detail="Username minimal 3 karakter")
        if len(new_username) > 50:
            raise HTTPException(status_code=400, detail="Username maksimal 50 karakter")
        if not re.match(r'^[a-z0-9_]+$', new_username):
            raise HTTPException(status_code=400, detail="Username hanya boleh huruf kecil, angka, dan underscore")

        # Check unique
        if new_username != current_user.username:
            existing = db.query(User).filter(User.username == new_username).first()
            if existing:
                raise HTTPException(status_code=400, detail="Username sudah dipakai")
            current_user.username = new_username

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 2. Upload Avatar
# ════════════════════════════════════════════

@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload avatar image"""

    # Validate content type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.")

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Ukuran file maksimal 2MB")

    # Generate filename
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif'):
        ext = 'jpg'
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = AVATAR_DIR / filename

    # Delete old avatar file if exists (only local uploads, not Google/Telegram URLs)
    if current_user.avatar_url and '/avatars/' in current_user.avatar_url:
        old_filename = current_user.avatar_url.split('/avatars/')[-1]
        old_path = AVATAR_DIR / old_filename
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    # Save file
    with open(filepath, 'wb') as f:
        f.write(content)

    # Update user avatar URL
    current_user.avatar_url = f"/api/v1/avatars/{filename}"
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 3. Remove Avatar
# ════════════════════════════════════════════

@router.delete("/avatar", response_model=UserResponse)
async def remove_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove custom avatar"""

    # Delete file if local upload
    if current_user.avatar_url and '/avatars/' in current_user.avatar_url:
        old_filename = current_user.avatar_url.split('/avatars/')[-1]
        old_path = AVATAR_DIR / old_filename
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    current_user.avatar_url = None
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 4. Get Connected Accounts
# ════════════════════════════════════════════

@router.get("/connections")
async def get_connections(current_user: User = Depends(get_current_user)):
    """Get linked account status"""
    return {
        "google": {
            "linked": current_user.google_id is not None,
            "email": current_user.email if current_user.google_id else None,
        },
        "telegram": {
            "linked": current_user.telegram_id is not None,
            "username": current_user.telegram_username if current_user.telegram_id else None,
            "id": current_user.telegram_id,
        },
        "auth_provider": current_user.auth_provider,
    }


# ════════════════════════════════════════════
# 5. Link Google Account
# ════════════════════════════════════════════

@router.post("/link-google", response_model=UserResponse)
async def link_google(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Link Google account to current user"""

    id_token_str = data.get("id_token")
    if not id_token_str:
        raise HTTPException(status_code=400, detail="id_token diperlukan")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Google token tidak valid: {str(e)}")

    google_id = idinfo.get('sub')
    google_email = idinfo.get('email')
    picture = idinfo.get('picture', '')

    if not google_id:
        raise HTTPException(status_code=400, detail="Google ID tidak tersedia")

    # Check if google_id already linked to another user
    existing = db.query(User).filter(User.google_id == google_id).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=400, detail="Akun Google ini sudah terhubung dengan akun lain")

    # Link
    current_user.google_id = google_id
    if not current_user.avatar_url and picture:
        current_user.avatar_url = picture

    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 6. Unlink Google Account
# ════════════════════════════════════════════

@router.delete("/unlink-google", response_model=UserResponse)
async def unlink_google(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unlink Google account — must have at least one other login method"""

    if not current_user.google_id:
        raise HTTPException(status_code=400, detail="Akun Google tidak terhubung")

    # Must have at least one other login method
    has_telegram = current_user.telegram_id is not None
    has_password = current_user.password_hash is not None

    if not has_telegram and not has_password:
        raise HTTPException(
            status_code=400,
            detail="Tidak bisa melepas Google. Hubungkan Telegram terlebih dahulu agar tetap bisa login."
        )

    current_user.google_id = None
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ════════════════════════════════════════════
# 7. Unlink Telegram Account
# ════════════════════════════════════════════

@router.delete("/unlink-telegram", response_model=UserResponse)
async def unlink_telegram(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unlink Telegram account — must have at least one other login method"""

    if not current_user.telegram_id:
        raise HTTPException(status_code=400, detail="Akun Telegram tidak terhubung")

    # Must have at least one other login method
    has_google = current_user.google_id is not None
    has_password = current_user.password_hash is not None

    if not has_google and not has_password:
        raise HTTPException(
            status_code=400,
            detail="Tidak bisa melepas Telegram. Hubungkan Google terlebih dahulu agar tetap bisa login."
        )

    current_user.telegram_id = None
    current_user.telegram_username = None
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)