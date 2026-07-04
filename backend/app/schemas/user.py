# backend/app/schemas/user.py
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from datetime import datetime


# ════════════════════════════════════════════════════════════════════
# Helper: normalize referral code (uppercase, strip, None if empty)
# ════════════════════════════════════════════════════════════════════

def _normalize_referral_code(v):
    if v is None:
        return None
    v = str(v).strip().upper()
    if not v:
        return None
    return v


# ════════════════════════════════════════════════════════════════════
# OAuth Login Schemas
# ════════════════════════════════════════════════════════════════════
# Email/password (UserRegister, UserLogin) udah di-deprecate karena
# auth flow sekarang OAuth-only (Google + Telegram + Discord).
# ════════════════════════════════════════════════════════════════════


class GoogleLogin(BaseModel):
    """Schema untuk Google OAuth login — frontend kirim id_token dari Google"""
    id_token: str
    referral_code: Optional[str] = None  # ← dari ?ref di URL atau localStorage

    @field_validator('referral_code')
    @classmethod
    def normalize_ref(cls, v):
        return _normalize_referral_code(v)


class TelegramLogin(BaseModel):
    """Schema untuk Telegram Login Widget — frontend kirim auth data dari Telegram"""
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str
    referral_code: Optional[str] = None  # ← dari ?ref di URL atau localStorage

    @field_validator('referral_code')
    @classmethod
    def normalize_ref(cls, v):
        return _normalize_referral_code(v)


class TokenRefresh(BaseModel):
    refresh_token: str


# ════════════════════════════════════════════════════════════════════
# Admin Request Schemas
# ════════════════════════════════════════════════════════════════════

class GrantSubscription(BaseModel):
    """Admin grant subscription ke user"""
    duration: str  # '1_month', '1_year', 'lifetime', 'custom'
    note: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None  # Required when duration='custom'

    @field_validator('duration')
    @classmethod
    def duration_valid(cls, v):
        valid = ['1_month', '1_year', 'lifetime', 'custom']
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

    @field_validator('end_date')
    @classmethod
    def end_date_valid(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError('Format tanggal harus YYYY-MM-DD (contoh: 2025-12-31)')
        return v

    @model_validator(mode='after')
    def check_custom_duration(self):
        if self.duration == 'custom' and not self.end_date:
            raise ValueError('end_date wajib diisi saat duration=custom')
        return self


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


# ════════════════════════════════════════════════════════════════════
# Admin Enrichment (Layer Outreach)
# ════════════════════════════════════════════════════════════════════

class AdminContactUpdate(BaseModel):
    """Admin updates a user's outreach contact fields."""
    admin_telegram_username: Optional[str] = None
    admin_discord_handle: Optional[str] = None
    admin_notes: Optional[str] = None

    @field_validator('admin_telegram_username')
    @classmethod
    def normalize_tg(cls, v):
        if v is None or v == '':
            return None
        v = v.strip().lstrip('@')
        if not v:
            return None
        if len(v) > 100:
            raise ValueError('Telegram username terlalu panjang (max 100 karakter)')
        return v

    @field_validator('admin_discord_handle')
    @classmethod
    def normalize_dc(cls, v):
        if v is None or v == '':
            return None
        v = v.strip()
        if not v:
            return None
        if len(v) > 100:
            raise ValueError('Discord handle terlalu panjang (max 100 karakter)')
        return v

    @field_validator('admin_notes')
    @classmethod
    def normalize_notes(cls, v):
        if v is None:
            return None
        v = v.strip()
        return v or None


class TemplateRenderRequest(BaseModel):
    """Render a message template for a specific user."""
    template_id: str
    user_id: int
    custom_message: Optional[str] = None  # for 'custom' template


class TemplateRenderResponse(BaseModel):
    template_id: str
    channel: str  # telegram | discord | email | generic
    subject: Optional[str] = None
    body: str
    deep_link: Optional[str] = None
    fallback_link: Optional[str] = None
    can_send: bool


# ════════════════════════════════════════════════════════════════════
# Response Schemas
# ════════════════════════════════════════════════════════════════════

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
    subscription_source: Optional[str] = None  # ← v2.1
    # ← Telegram VIP sync
    telegram_in_group: Optional[bool] = False
    telegram_grace_until: Optional[datetime] = None
    has_active_access: Optional[bool] = None

    # Referral v2
    referred_by: Optional[int] = None
    referral_code_used: Optional[str] = None
    referral_credit_usdt: Optional[float] = 0
    lifetime_credit_earned: Optional[float] = 0

    # Login tracking
    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0

    # Display preferences
    country_code: Optional[str] = None
    currency_code: Optional[str] = 'USD'

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
    telegram_in_group: Optional[bool] = False
    telegram_grace_until: Optional[datetime] = None
    telegram_bot_started_at: Optional[datetime] = None
    discord_id: Optional[int] = None
    discord_username: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    subscription_granted_by: Optional[int] = None
    subscription_granted_at: Optional[datetime] = None
    subscription_note: Optional[str] = None
    subscription_source: Optional[str] = None

    # Referral v2
    referred_by: Optional[int] = None
    referral_code_used: Optional[str] = None
    referral_credit_usdt: Optional[float] = 0
    lifetime_credit_earned: Optional[float] = 0
    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0

    # ─── Activity tracking (Growth dashboard) ───
    last_active_at: Optional[datetime] = None
    total_sessions: Optional[int] = 0
    last_feature_touched: Optional[str] = None

    # Display preferences
    country_code: Optional[str] = None
    currency_code: Optional[str] = 'USD'

    # ─── Admin enrichment (Layer Outreach) ───
    admin_telegram_username: Optional[str] = None
    admin_discord_handle: Optional[str] = None
    admin_notes: Optional[str] = None
    admin_enriched_by: Optional[int] = None
    admin_enriched_at: Optional[datetime] = None

    # Computed effective channels (priority: admin > oauth)
    effective_telegram_username: Optional[str] = None
    effective_discord_handle: Optional[str] = None

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
    cryptobot_token: Optional[str] = None


class MessageResponse(BaseModel):
    message: str
    success: bool = True
