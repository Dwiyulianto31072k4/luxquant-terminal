# backend/app/schemas/referral.py
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


# ============ Referral Code ============

class ReferralCodeCreate(BaseModel):
    """User generates a new referral code"""
    custom_code: Optional[str] = None  # Optional custom code, auto-generated if empty

    @field_validator('custom_code')
    @classmethod
    def validate_code(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if len(v) < 4 or len(v) > 20:
            raise ValueError('Code must be 4-20 characters')
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError('Code can only contain letters, numbers, hyphens, underscores')
        return v


class ReferralCodeResponse(BaseModel):
    id: int
    code: str
    discount_pct: float
    commission_pct: float
    max_uses: Optional[int] = None
    times_used: int
    is_active: bool
    expires_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Referral Stats ============

class ReferralStatsResponse(BaseModel):
    """Dashboard stats for referrer"""
    total_referrals: int          # how many people used the code
    confirmed_referrals: int      # how many actually paid
    pending_referrals: int
    total_commission: float       # total earned
    available_balance: float      # earned - paid out
    total_paid_out: float         # already withdrawn
    recent_referrals: List[dict]  # last N referral uses


# ============ Referral Use ============

class ReferralApply(BaseModel):
    """New user applies a referral code at registration"""
    code: str

    @field_validator('code')
    @classmethod
    def validate_code(cls, v):
        return v.strip().upper()


class ReferralUseResponse(BaseModel):
    id: int
    referrer_username: Optional[str] = None
    referred_username: Optional[str] = None
    discount_amount: float
    commission_amount: float
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Referral Validate ============

class ReferralValidateResponse(BaseModel):
    """Response when checking if a referral code is valid"""
    valid: bool
    code: Optional[str] = None
    discount_pct: Optional[float] = None
    message: str


# ============ Payout ============

class PayoutRequest(BaseModel):
    amount_usdt: float
    wallet_address: str
    network: str = "BSC"

    @field_validator('amount_usdt')
    @classmethod
    def validate_amount(cls, v):
        if v < 5:
            raise ValueError('Minimum payout is $5 USDT')
        return v

    @field_validator('wallet_address')
    @classmethod
    def validate_wallet(cls, v):
        v = v.strip()
        if len(v) < 10:
            raise ValueError('Invalid wallet address')
        return v


class PayoutResponse(BaseModel):
    id: int
    amount_usdt: float
    wallet_address: Optional[str] = None
    network: Optional[str] = None
    status: str
    requested_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True