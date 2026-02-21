# backend/app/api/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
import os
import re
import secrets

from app.core.database import get_db
from app.core.security import (
    hash_password, 
    verify_password, 
    create_tokens,
    decode_token
)
from app.models.user import User
from app.schemas.user import (
    UserRegister, 
    UserLogin,
    GoogleLogin,
    TokenRefresh,
    UserResponse, 
    TokenResponse, 
    MessageResponse
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Google Client ID — dari environment variable atau hardcoded fallback
GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com"
)


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register user baru"""
    
    # Cek email sudah terdaftar
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email sudah terdaftar"
        )
    
    # Cek username sudah dipakai
    existing_username = db.query(User).filter(User.username == user_data.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username sudah dipakai"
        )
    
    # Create user
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        auth_provider='local'
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Generate tokens
    tokens = create_tokens(new_user.id, new_user.email)
    
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(new_user)
    )


@router.post("/login", response_model=TokenResponse)
async def login(login_data: UserLogin, db: Session = Depends(get_db)):
    """Login dengan email dan password"""
    
    # Cari user by email
    user = db.query(User).filter(User.email == login_data.email).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah"
        )
    
    # Cek apakah user pakai Google (tidak punya password)
    if user.auth_provider == 'google' and not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Akun ini terdaftar via Google. Silakan login dengan Google."
        )
    
    # Verify password
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah"
        )
    
    # Check if user active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun tidak aktif"
        )
    
    # Generate tokens
    tokens = create_tokens(user.id, user.email)
    
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user)
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(data: GoogleLogin, db: Session = Depends(get_db)):
    """
    Login/Register dengan Google OAuth.
    Frontend kirim id_token dari Google Identity Services (GSI).
    Backend verify token dan create/login user.
    """
    try:
        # Verify Google id_token
        idinfo = google_id_token.verify_oauth2_token(
            data.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token tidak valid: {str(e)}"
        )
    
    # Extract info dari Google token
    google_id = idinfo.get('sub')
    email = idinfo.get('email')
    name = idinfo.get('name', '')
    picture = idinfo.get('picture', '')
    email_verified = idinfo.get('email_verified', False)
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email tidak tersedia dari Google"
        )
    
    # Cari user by google_id dulu
    user = db.query(User).filter(User.google_id == google_id).first()
    
    if not user:
        # Cari by email (mungkin user sudah register manual dengan email yang sama)
        user = db.query(User).filter(User.email == email).first()
        
        if user:
            # Link Google account ke user existing
            user.google_id = google_id
            user.avatar_url = picture or user.avatar_url
            # Jika user register manual, tetap keep auth_provider = 'local'
            # tapi tambahkan google_id supaya bisa login pakai Google juga
            if not user.avatar_url:
                user.avatar_url = picture
            db.commit()
            db.refresh(user)
        else:
            # User baru — auto-create
            username = _generate_username(name, email, db)
            
            user = User(
                email=email,
                username=username,
                password_hash=None,  # Google user tidak punya password
                auth_provider='google',
                google_id=google_id,
                avatar_url=picture,
                is_active=True,
                is_verified=email_verified
            )
            
            db.add(user)
            db.commit()
            db.refresh(user)
    else:
        # User sudah ada via google_id — update avatar jika berubah
        if picture and user.avatar_url != picture:
            user.avatar_url = picture
            db.commit()
            db.refresh(user)
    
    # Check if user active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun tidak aktif"
        )
    
    # Generate JWT tokens
    tokens = create_tokens(user.id, user.email)
    
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user)
    )


def _generate_username(name: str, email: str, db: Session) -> str:
    """
    Generate unique username dari Google name atau email.
    Contoh: "John Doe" -> "john_doe", kalau sudah ada -> "john_doe_a3f2"
    """
    # Bersihkan name jadi username-friendly
    if name:
        base = re.sub(r'[^a-zA-Z0-9]', '_', name.lower()).strip('_')
        # Collapse multiple underscores
        base = re.sub(r'_+', '_', base)
    else:
        # Fallback ke bagian email sebelum @
        base = email.split('@')[0].lower()
        base = re.sub(r'[^a-z0-9_]', '_', base)
    
    # Pastikan minimal 3 karakter
    if len(base) < 3:
        base = base + '_user'
    
    # Truncate ke max 40 karakter (sisakan ruang untuk suffix)
    base = base[:40]
    
    # Cek apakah username sudah dipakai
    existing = db.query(User).filter(User.username == base).first()
    if not existing:
        return base
    
    # Tambah random suffix
    for _ in range(10):
        suffix = secrets.token_hex(2)  # 4 karakter hex
        candidate = f"{base}_{suffix}"
        if len(candidate) > 50:
            candidate = candidate[:50]
        existing = db.query(User).filter(User.username == candidate).first()
        if not existing:
            return candidate
    
    # Fallback: gunakan random penuh
    return f"user_{secrets.token_hex(4)}"


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(token_data: TokenRefresh, db: Session = Depends(get_db)):
    """Refresh access token menggunakan refresh token"""
    
    payload = decode_token(token_data.refresh_token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token tidak valid atau expired"
        )
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token type tidak valid"
        )
    
    user_id = payload.get("sub")
    
    # Fetch user untuk memastikan masih aktif
    user = db.query(User).filter(User.id == int(user_id)).first()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User tidak ditemukan atau tidak aktif"
        )
    
    # Generate new tokens
    tokens = create_tokens(user.id, user.email)
    
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current logged in user info"""
    return UserResponse.model_validate(current_user)


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: User = Depends(get_current_user)):
    """
    Logout - untuk JWT stateless, cukup hapus token di client side.
    Endpoint ini untuk konsistensi API.
    """
    return MessageResponse(
        message="Logout berhasil",
        success=True
    )