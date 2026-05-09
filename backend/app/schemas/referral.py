# backend/app/schemas/referral.py
import re
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


# ════════════════════════════════════════════════════════════════════
# CUSTOM SLUG VALIDATION RULES
# ════════════════════════════════════════════════════════════════════
# - 4-20 chars
# - Alphanumeric + dash + underscore
# - Tidak boleh start/end dengan dash/underscore
# - Tidak boleh consecutive special chars (--, __, -_, _-)
# - Tidak boleh match reserved words (admin, api, login, register, dll)
# - Profanity filter ringan
# ════════════════════════════════════════════════════════════════════

RESERVED_SLUGS = {
    # Routes
    "admin", "api", "login", "register", "logout", "auth", "oauth",
    "terminal", "dashboard", "home", "settings", "profile", "support",
    "help", "about", "contact", "pricing", "payment", "checkout",
    "referral", "referrals", "ref", "invite",
    # System
    "root", "null", "undefined", "system", "test", "demo",
    # Brand
    "luxquant", "luxq", "lux",
}

# Profanity filter ringan (EN/ID basic) — bisa di-extend nanti
PROFANITY_TOKENS = {
    "fuck", "shit", "bitch", "asshole", "dick", "cunt",
    "anjing", "babi", "kontol", "memek",
    "fk", "sht",
}

SLUG_REGEX = re.compile(r'^[A-Z0-9]([A-Z0-9_-]{2,18})[A-Z0-9]$', re.IGNORECASE)


def validate_slug(value: str) -> str:
    """Validate & normalize custom referral slug. Returns uppercase canonical."""
    if value is None:
        return None

    v = value.strip().upper()

    if len(v) < 4 or len(v) > 20:
        raise ValueError('Code must be 4-20 characters')

    if not SLUG_REGEX.match(v):
        raise ValueError('Code can only contain letters, numbers, dash (-), underscore (_), and cannot start/end with special chars')

    # Cek consecutive special chars
    if re.search(r'[-_]{2,}', v):
        raise ValueError('Code cannot contain consecutive dashes or underscores')

    # Reserved words check (case-insensitive)
    if v.lower() in RESERVED_SLUGS:
        raise ValueError('This code is reserved and cannot be used')

    # Profanity check
    v_lower = v.lower()
    for token in PROFANITY_TOKENS:
        if token in v_lower:
            raise ValueError('Code contains inappropriate language')

    return v


# ════════════════════════════════════════════════════════════════════
# REFERRAL CODE
# ════════════════════════════════════════════════════════════════════

class ReferralCodeCreate(BaseModel):
    """User generates a new referral code"""
    custom_code: Optional[str] = None

    @field_validator('custom_code')
    @classmethod
    def validate_custom_code(cls, v):
        if v is None or v == "":
            return None
        return validate_slug(v)


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


# ════════════════════════════════════════════════════════════════════
# REFERRAL APPLY & VALIDATE
# ════════════════════════════════════════════════════════════════════

class ReferralApply(BaseModel):
    """New user applies a referral code at registration"""
    code: str

    @field_validator('code')
    @classmethod
    def validate_code(cls, v):
        return v.strip().upper()


class ReferralValidateResponse(BaseModel):
    valid: bool
    code: Optional[str] = None
    discount_pct: Optional[float] = None
    message: str


# ════════════════════════════════════════════════════════════════════
# STATS — Funnel + Earnings
# ════════════════════════════════════════════════════════════════════

class ReferralFunnelResponse(BaseModel):
    """Funnel breakdown: signup → active (login) → subscribed → churned"""
    signed_up: int        # total referee yang apply code
    active: int           # yang udah login min 1x
    subscribed: int       # yang udah bayar min 1x
    churned: int          # subscription expired & ga renew


class ReferralEarningsResponse(BaseModel):
    """Earnings summary referrer"""
    available_balance: float        # current credit balance (yg bisa di-redeem)
    lifetime_earned: float          # total all-time earned (immutable counter)
    total_redeemed: float           # total udah di-redeem ke subscription
    pending_commission: float       # estimasi commission referee yang masih active tapi belum bayar
    this_month_earned: float        # earned dalam 30 hari terakhir


class ReferralStatsResponse(BaseModel):
    """Combined dashboard stats (backward compat dengan stats endpoint lama)"""
    # Funnel
    total_referrals: int
    confirmed_referrals: int        # alias subscribed
    pending_referrals: int          # alias pending+active
    funnel: ReferralFunnelResponse

    # Earnings
    earnings: ReferralEarningsResponse

    # Recent activity
    recent_referrals: List[dict]


# ════════════════════════════════════════════════════════════════════
# CREDIT REDEMPTION
# ════════════════════════════════════════════════════════════════════

class RedeemRequest(BaseModel):
    """Request redeem credit untuk potong invoice subscription"""
    amount_usdt: float
    payment_id: int                 # invoice ID yang mau di-potong

    @field_validator('amount_usdt')
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        if v > 10000:
            raise ValueError('Amount exceeds maximum redeemable')
        # Round ke 2 desimal
        return round(v, 2)


class RedeemPreviewRequest(BaseModel):
    """Preview redeem (calculate tanpa commit)"""
    amount_usdt: float
    payment_id: int

    @field_validator('amount_usdt')
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        return round(v, 2)


class RedeemPreviewResponse(BaseModel):
    """Preview result"""
    requested_amount: float
    available_balance: float
    invoice_amount: float
    discount_amount: float          # discount referral kalo first payment
    final_amount_after_credit: float
    redeem_amount: float            # actual yang akan di-redeem (mungkin di-cap)
    will_succeed: bool
    message: str


class RedeemResponse(BaseModel):
    """Hasil redeem berhasil"""
    redeemed_amount: float
    new_balance: float
    invoice_amount_after: float
    ledger_id: int
    message: str


# ════════════════════════════════════════════════════════════════════
# CREDIT LEDGER (audit trail history untuk user)
# ════════════════════════════════════════════════════════════════════

class CreditLedgerEntry(BaseModel):
    id: int
    amount: float
    type: str
    balance_after: float
    note: Optional[str] = None
    ref_payment_id: Optional[int] = None
    ref_use_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CreditLedgerResponse(BaseModel):
    entries: List[CreditLedgerEntry]
    total: int
    current_balance: float


# ════════════════════════════════════════════════════════════════════
# DEPRECATED — kept for backward compat ke frontend lama
# ════════════════════════════════════════════════════════════════════

class PayoutRequest(BaseModel):
    """DEPRECATED — sekarang pake RedeemRequest. Schema ini di-keep biar
    backend ga error kalo masih ada client lama yang hit /payout"""
    amount_usdt: float
    wallet_address: str
    network: Optional[str] = "BSC"


class PayoutResponse(BaseModel):
    """DEPRECATED"""
    id: int
    amount_usdt: float
    status: str
    message: Optional[str] = None
    requested_at: Optional[datetime] = None

    class Config:
        from_attributes = True
