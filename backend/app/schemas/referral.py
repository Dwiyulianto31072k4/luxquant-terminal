# backend/app/schemas/referral.py
import re
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


# ════════════════════════════════════════════════════════════════════
# CUSTOM SLUG VALIDATION RULES
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

    if re.search(r'[-_]{2,}', v):
        raise ValueError('Code cannot contain consecutive dashes or underscores')

    if v.lower() in RESERVED_SLUGS:
        raise ValueError('This code is reserved and cannot be used')

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
    """Code dengan share-ready fields"""
    id: int
    code: str
    discount_pct: float
    commission_pct: float
    max_uses: Optional[int] = None
    times_used: int
    is_active: bool
    expires_at: Optional[datetime] = None
    created_at: datetime

    # ─── Share-ready fields (computed) ───
    share_link: str           # https://luxquant.tw/?ref=XXX
    qr_url: str               # https://luxquant.tw/api/v1/referral/qr/XXX

    # ─── Tracking metrics ───
    share_count: int = 0
    qr_count: int = 0
    last_shared_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════════
# REFERRAL APPLY & VALIDATE
# ════════════════════════════════════════════════════════════════════

class ReferralApply(BaseModel):
    """Manual apply (legacy, ga dipake frontend baru)"""
    code: str

    @field_validator('code')
    @classmethod
    def validate_code(cls, v):
        return v.strip().upper()


class ReferralValidateResponse(BaseModel):
    """Public endpoint untuk validate code (e.g. dari LandingPage banner)"""
    valid: bool
    code: Optional[str] = None
    discount_pct: Optional[float] = None
    referrer_username: Optional[str] = None  # Untuk banner: "Referred by @saptadi"
    message: str


# ════════════════════════════════════════════════════════════════════
# SHARE TRACKING
# ════════════════════════════════════════════════════════════════════

class TrackShareRequest(BaseModel):
    """Track share event (copy link, QR download, social share)"""
    code: str
    channel: str  # "copy_link" | "qr_download" | "twitter" | "telegram" | "whatsapp" | "other"

    @field_validator('code')
    @classmethod
    def normalize_code(cls, v):
        return v.strip().upper()

    @field_validator('channel')
    @classmethod
    def validate_channel(cls, v):
        allowed = {"copy_link", "qr_download", "twitter", "telegram", "whatsapp", "other"}
        if v not in allowed:
            raise ValueError(f"channel must be one of: {', '.join(allowed)}")
        return v


class TrackShareResponse(BaseModel):
    success: bool
    share_count: int
    qr_count: int


# ════════════════════════════════════════════════════════════════════
# FUNNEL & EARNINGS
# ════════════════════════════════════════════════════════════════════

class ReferralFunnelResponse(BaseModel):
    """Funnel breakdown: signup → active → subscribed → churned"""
    signed_up: int        # Total referee yang apply code
    active: int           # Yang udah login min 1x
    subscribed: int       # Yang udah bayar min 1x
    churned: int          # Subscription expired & ga renew

    # Conversion rates (helper, frontend bisa display %)
    activation_rate: float = 0       # active / signed_up
    subscription_rate: float = 0     # subscribed / active


class ReferralEarningsResponse(BaseModel):
    """Earnings card data"""
    available_balance: float        # Current credit balance (yg bisa di-redeem)
    lifetime_earned: float          # Total all-time earned (immutable counter)
    total_redeemed: float           # Total udah di-redeem
    pending_commission: float       # Estimasi commission referee yang masih active
    this_month_earned: float        # Earned dalam 30 hari terakhir
    has_earnings: bool              # True kalau lifetime_earned > 0


# ════════════════════════════════════════════════════════════════════
# REFEREE LIST (privacy: Level 3 — full disclosure)
# ════════════════════════════════════════════════════════════════════

class RefereeItem(BaseModel):
    """Satu referee di list"""
    user_id: int                          # Internal ID (frontend bisa abaikan)
    username: str
    avatar_url: Optional[str] = None
    status: str                           # pending | active | subscribed | churned | cancelled
    joined_at: datetime                   # Kapan referee register pake code lo
    first_login_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    login_count: int = 0
    total_payments: int = 0
    total_commission_earned: float = 0    # Commission yg lo dapet dari user ini

    class Config:
        from_attributes = True


class RefereeListResponse(BaseModel):
    """Paginated referee list"""
    items: List[RefereeItem]
    total: int
    page: int
    page_size: int
    has_more: bool


# ════════════════════════════════════════════════════════════════════
# CREDIT REDEMPTION
# ════════════════════════════════════════════════════════════════════

class RedeemRequest(BaseModel):
    amount_usdt: float
    payment_id: int

    @field_validator('amount_usdt')
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        if v > 10000:
            raise ValueError('Amount exceeds maximum redeemable')
        return round(v, 2)


class RedeemPreviewRequest(BaseModel):
    amount_usdt: float
    payment_id: int

    @field_validator('amount_usdt')
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        return round(v, 2)


class RedeemPreviewResponse(BaseModel):
    requested_amount: float
    available_balance: float
    invoice_amount: float
    discount_amount: float
    final_amount_after_credit: float
    redeem_amount: float
    will_succeed: bool
    message: str


class RedeemResponse(BaseModel):
    redeemed_amount: float
    new_balance: float
    invoice_amount_after: float
    ledger_id: int
    message: str


# ════════════════════════════════════════════════════════════════════
# CREDIT LEDGER
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
    page: int = 1
    page_size: int = 20
    has_more: bool = False


# ════════════════════════════════════════════════════════════════════
# COMBINED STATS (dashboard summary)
# ════════════════════════════════════════════════════════════════════

class ReferralStatsResponse(BaseModel):
    """One-shot endpoint buat dashboard load"""
    code: Optional[ReferralCodeResponse] = None       # User's code (None kalau belum generate)
    funnel: ReferralFunnelResponse
    earnings: ReferralEarningsResponse
    recent_referees: List[RefereeItem] = []           # Last 5 referees (for dashboard preview)


# ════════════════════════════════════════════════════════════════════
# DEPRECATED — kept untuk backward compat
# ════════════════════════════════════════════════════════════════════

class PayoutRequest(BaseModel):
    """DEPRECATED — sekarang pake RedeemRequest."""
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
