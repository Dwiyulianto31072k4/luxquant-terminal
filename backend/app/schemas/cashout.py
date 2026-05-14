# backend/app/schemas/cashout.py
"""
Pydantic schemas for cashout endpoints.

User-facing:
  - CashoutRequestCreate     : POST /referral/cashout/request payload
  - CashoutRequestResponse   : returned to user (their own requests)
  - CashoutCancelRequest     : POST /referral/cashout/{id}/cancel payload

Admin-facing:
  - CashoutAdminResponse     : returned to admin (includes user info)
  - CashoutApprovePayload    : POST /admin/cashouts/{id}/approve payload
  - CashoutRejectPayload     : POST /admin/cashouts/{id}/reject payload
  - CashoutCompletePayload   : POST /admin/cashouts/{id}/complete payload
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator


# ════════════════════════════════════════════════
# User-facing schemas
# ════════════════════════════════════════════════

class CashoutRequestCreate(BaseModel):
    """Payload for user creating a cashout request."""
    amount_usdt: Decimal = Field(..., gt=0, description="Amount to withdraw (must be > 0)")
    destination_telegram: str = Field(..., min_length=2, max_length=100, description="User's Telegram @username")
    destination_note: Optional[str] = Field(None, max_length=500, description="Optional notes")

    @field_validator("destination_telegram")
    @classmethod
    def normalize_telegram_username(cls, v: str) -> str:
        """Normalize Telegram username — strip @ prefix, lowercase."""
        v = v.strip().lstrip("@")
        if not v:
            raise ValueError("Telegram username cannot be empty")
        # Basic validation: alphanumeric + underscore, 5-32 chars (Telegram rules)
        import re
        if not re.match(r"^[a-zA-Z0-9_]{5,32}$", v):
            raise ValueError(
                "Invalid Telegram username. Use 5-32 chars (letters, digits, underscore only)."
            )
        return v


class CashoutRequestResponse(BaseModel):
    """Cashout request as returned to the requesting user."""
    id: int
    amount_usdt: float
    method: str
    destination_telegram: Optional[str]
    destination_note: Optional[str]
    status: str
    admin_note: Optional[str]
    tx_hash: Optional[str]
    requested_at: datetime
    reviewed_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_model(cls, req) -> "CashoutRequestResponse":
        """Construct from CashoutRequest ORM model with type coercion."""
        return cls(
            id=req.id,
            amount_usdt=float(req.amount_usdt),
            method=req.method,
            destination_telegram=req.destination_telegram,
            destination_note=req.destination_note,
            status=req.status,
            admin_note=req.admin_note,
            tx_hash=req.tx_hash,
            requested_at=req.requested_at,
            reviewed_at=req.reviewed_at,
            completed_at=req.completed_at,
        )


# ════════════════════════════════════════════════
# Preview schemas (for /redeem/preview)
# ════════════════════════════════════════════════

class RedeemPreviewRequest(BaseModel):
    """Preview what an invoice would look like with credit redemption."""
    plan_id: int = Field(..., gt=0)


class RedeemPreviewResponse(BaseModel):
    """Preview breakdown of pricing if user proceeds with redemption."""
    plan_id: int
    plan_name: str
    plan_label: str

    gross_amount: float                       # Plan price
    referral_discount: float                  # 10% if eligible, else 0
    credit_redeem: float                      # User's redeemable balance (capped at remaining)
    final_amount: float                       # What user pays

    eligible_for_referral_discount: bool
    user_credit_balance: float                # Current full balance
    credit_balance_after_redeem: float        # What's left after this redemption


# ════════════════════════════════════════════════
# Admin-facing schemas
# ════════════════════════════════════════════════

class CashoutAdminUserSummary(BaseModel):
    """Minimal user info embedded in admin cashout view."""
    id: int
    username: Optional[str]
    email: Optional[str]
    referral_credit_usdt: float
    lifetime_credit_earned: float


class CashoutAdminResponse(BaseModel):
    """Cashout request as returned to admin (with user details)."""
    id: int
    user: CashoutAdminUserSummary
    amount_usdt: float
    method: str
    destination_telegram: Optional[str]
    destination_note: Optional[str]
    status: str
    admin_note: Optional[str]
    tx_hash: Optional[str]
    requested_at: datetime
    reviewed_at: Optional[datetime]
    completed_at: Optional[datetime]
    reviewed_by_admin_id: Optional[int]


class CashoutApprovePayload(BaseModel):
    """Admin marks cashout as approved (in-progress, not yet completed)."""
    admin_note: Optional[str] = Field(None, max_length=500)


class CashoutCompletePayload(BaseModel):
    """Admin marks cashout as completed (fund sent)."""
    tx_hash: Optional[str] = Field(None, max_length=100, description="Proof of send (optional)")
    admin_note: Optional[str] = Field(None, max_length=500)


class CashoutRejectPayload(BaseModel):
    """Admin rejects cashout. Balance will be auto-refunded."""
    admin_note: str = Field(..., min_length=1, max_length=500, description="Reason for rejection (required)")


class CashoutListResponse(BaseModel):
    """Paginated list of cashout requests."""
    items: list[CashoutAdminResponse]
    total: int
    pending_count: int
    approved_count: int
    completed_count: int
    rejected_count: int
