# backend/app/schemas/subscription.py
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


# ============ Plan Schemas ============

class PlanResponse(BaseModel):
    id: int
    name: str
    label: str
    description: str
    price_usdt: float
    duration_days: Optional[int] = None
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class PlanUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    price_usdt: Optional[float] = None
    duration_days: Optional[int] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


# ============ Payment Schemas ============

class PaymentCreate(BaseModel):
    plan_id: int


class PaymentVerify(BaseModel):
    payment_id: int
    tx_hash: str

    @field_validator('tx_hash')
    @classmethod
    def validate_tx_hash(cls, v):
        v = v.strip()
        if not v.startswith('0x'):
            raise ValueError('TX hash harus dimulai dengan 0x')
        if len(v) != 66:
            raise ValueError('TX hash harus 66 karakter (0x + 64 hex)')
        return v.lower()


class PaymentResponse(BaseModel):
    id: int
    user_id: int
    plan_id: int
    amount_usdt: float
    tx_hash: Optional[str] = None
    wallet_from: Optional[str] = None
    wallet_to: str
    network: str
    status: str
    verified_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    plan_name: Optional[str] = None
    plan_label: Optional[str] = None

    class Config:
        from_attributes = True


class PaymentListResponse(BaseModel):
    items: List[dict]
    total: int


# ============ Subscription Status ============

class SubscriptionStatusResponse(BaseModel):
    is_subscribed: bool
    tier: str                                      # "free", "premium", "admin"
    expires_at: Optional[datetime] = None
    days_remaining: Optional[int] = None
    plan_note: Optional[str] = None


# ============ Admin Schemas ============

class AdminActivate(BaseModel):
    user_id: int
    plan_id: int
    notes: Optional[str] = None