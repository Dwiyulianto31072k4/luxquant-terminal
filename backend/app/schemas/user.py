# backend/app/schemas/user.py
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


# ============ Request Schemas ============

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
    
    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        if len(v) < 3:
            raise ValueError('Username minimal 3 karakter')
        if len(v) > 50:
            raise ValueError('Username maksimal 50 karakter')
        if not v.replace('_', '').isalnum():
            raise ValueError('Username hanya boleh huruf, angka, dan underscore')
        return v.lower()
    
    @field_validator('password')
    @classmethod
    def password_valid(cls, v):
        if len(v) < 8:
            raise ValueError('Password minimal 8 karakter')
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleLogin(BaseModel):
    """Schema untuk Google OAuth login — frontend kirim id_token dari Google"""
    id_token: str


class TelegramLogin(BaseModel):
    """Schema untuk Telegram Login Widget — frontend kirim auth data dari Telegram"""
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


class TokenRefresh(BaseModel):
    refresh_token: str


# ============ Admin Request Schemas ============

class GrantSubscription(BaseModel):
    """Admin grant subscription ke user"""
    duration: str  # '1_month', '1_year', 'lifetime'
    note: Optional[str] = None
    start_date: Optional[str] = None  # ISO format: '2025-01-15' — kalau None = hari ini
    
    @field_validator('duration')
    @classmethod
    def duration_valid(cls, v):
        valid = ['1_month', '1_year', 'lifetime']
        if v not in valid:
            raise ValueError(f'Duration harus salah satu dari: {", ".join(valid)}')
        return v
    
    @field_validator('start_date')
    @classmethod
    def start_date_valid(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError('Format tanggal harus YYYY-MM-DD (contoh: 2025-01-15)')
        return v


class UpdateUserRole(BaseModel):
    """Admin update user role"""
    role: str
    
    @field_validator('role')
    @classmethod
    def role_valid(cls, v):
        valid = ['free', 'subscriber', 'admin']
        if v not in valid:
            raise ValueError(f'Role harus salah satu dari: {", ".join(valid)}')
        return v


# ============ Response Schemas ============

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    is_verified: bool
    role: Optional[str] = 'free'
    auth_provider: Optional[str] = 'local'
    avatar_url: Optional[str] = None
    telegram_id: Optional[int] = None
    telegram_username: Optional[str] = None
    discord_id: Optional[int] = None
    discord_username: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    subscription_granted_at: Optional[datetime] = None
    subscription_note: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class AdminUserResponse(BaseModel):
    """Extended user info untuk admin panel"""
    id: int
    email: str
    username: str
    is_active: bool
    is_verified: bool
    role: Optional[str] = 'free'
    auth_provider: Optional[str] = 'local'
    avatar_url: Optional[str] = None
    telegram_id: Optional[int] = None
    telegram_username: Optional[str] = None
    discord_id: Optional[int] = None
    discord_username: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    subscription_granted_by: Optional[int] = None
    subscription_granted_at: Optional[datetime] = None
    subscription_note: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
    success: bool = True