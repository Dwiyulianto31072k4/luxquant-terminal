# backend/app/api/routes/referral.py
"""
Referral Routes — Referral codes, uses, credit redeem, cashout

User endpoints:
  GET    /referral/my-code               → my referral code (auto-create on first call)
  GET    /referral/my-uses               → referees who used my code
  GET    /referral/my-ledger             → credit ledger history
  GET    /referral/funnel                → funnel stats (referrals → trial → subscribed)
  POST   /referral/apply                 → user applies referral code on signup
  GET    /referral/check/{code}          → validate referral code (public)
  
  # Layer 8 — Credit & Cashout
  GET    /referral/redeem/preview        → preview pricing if user subscribes now
  GET    /referral/cashout/balance       → user's current redeemable balance + active cashout
  POST   /referral/cashout/request       → submit new cashout request
  GET    /referral/cashout/my            → my cashout history (newest first)
  POST   /referral/cashout/{id}/cancel   → cancel pending cashout (refund balance)
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
import logging

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.referral import ReferralCode, ReferralUse
from app.models.credit import CreditLedger
from app.models.cashout import CashoutRequest, ACTIVE_STATUSES
from app.models.subscription import SubscriptionPlan
from app.schemas.cashout import (
    CashoutRequestCreate,
    CashoutRequestResponse,
    RedeemPreviewResponse,
)
from app.services.commission_service import (
    apply_referral_discount,
    apply_credit_redeem,
)
from app.services.cashout_service import (
    submit_cashout_request,
    cancel_cashout_request,
    get_user_cashouts,
    get_user_active_cashout,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/referral", tags=["Referral"])


# ════════════════════════════════════════════════
# Helper: generate referral code
# ════════════════════════════════════════════════

def _generate_code_for_user(user: User, db: Session) -> ReferralCode:
    """Auto-generate referral code based on username pattern."""
    import secrets

    # Try username-based: first 6 chars + 2 random alphanumeric
    base = "".join(c for c in (user.username or "user")[:6] if c.isalnum()).upper()
    if len(base) < 3:
        base = "USER"

    attempt = 0
    while attempt < 10:
        suffix = secrets.token_hex(1).upper()  # 2 hex chars
        candidate = f"{base}{suffix}"
        exists = db.query(ReferralCode).filter(ReferralCode.code == candidate).first()
        if not exists:
            code = ReferralCode(
                code=candidate,
                owner_id=user.id,
                is_active=True,
                discount_pct=Decimal("10.00"),
                commission_pct=Decimal("10.00"),
            )
            db.add(code)
            db.commit()
            db.refresh(code)
            return code
        attempt += 1

    raise HTTPException(
        status_code=500,
        detail="Failed to generate unique referral code. Try again.",
    )


# ════════════════════════════════════════════════
# GET /my-code
# ════════════════════════════════════════════════

@router.get("/my-code")
async def get_my_referral_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user's referral code (auto-create if not exists)."""
    code = db.query(ReferralCode).filter(
        ReferralCode.owner_id == current_user.id,
        ReferralCode.is_active == True,
    ).first()

    if not code:
        code = _generate_code_for_user(current_user, db)

    return {
        "code": code.code,
        "discount_pct": float(code.discount_pct),
        "commission_pct": float(code.commission_pct),
        "is_active": code.is_active,
        "created_at": code.created_at.isoformat() if code.created_at else None,
    }


# ════════════════════════════════════════════════
# GET /my-uses
# ════════════════════════════════════════════════

@router.get("/my-uses")
async def get_my_referees(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    """Get referees who used my code (with their status)."""
    uses = db.query(ReferralUse).filter(
        ReferralUse.referrer_id == current_user.id
    ).order_by(ReferralUse.created_at.desc()).limit(limit).all()

    items = []
    for use in uses:
        referee = db.query(User).filter(User.id == use.referred_id).first()
        items.append({
            "id": use.id,
            "referee_username": referee.username if referee else None,
            "referee_email": referee.email if referee else None,
            "status": use.status,
            "total_payments": use.total_payments or 0,
            "total_commission_earned": float(use.total_commission_earned or 0),
            "created_at": use.created_at.isoformat() if use.created_at else None,
            "last_payment_at": use.last_payment_at.isoformat() if use.last_payment_at else None,
        })

    return {"items": items, "total": len(items)}


# ════════════════════════════════════════════════
# GET /my-ledger
# ════════════════════════════════════════════════

@router.get("/my-ledger")
async def get_my_credit_ledger(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    """Get user's full credit ledger (audit trail)."""
    entries = db.query(CreditLedger).filter(
        CreditLedger.user_id == current_user.id
    ).order_by(CreditLedger.created_at.desc()).limit(limit).all()

    items = [
        {
            "id": e.id,
            "amount": float(e.amount),
            "type": e.type,
            "balance_after": float(e.balance_after),
            "ref_payment_id": e.ref_payment_id,
            "ref_use_id": e.ref_use_id,
            "note": e.note,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]

    return {
        "items": items,
        "total": len(items),
        "current_balance": float(current_user.referral_credit_usdt or 0),
        "lifetime_earned": float(current_user.lifetime_credit_earned or 0),
    }


# ════════════════════════════════════════════════
# GET /funnel
# ════════════════════════════════════════════════

@router.get("/funnel")
async def get_funnel_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Funnel: total referrals → trial → subscribed."""
    base = db.query(ReferralUse).filter(ReferralUse.referrer_id == current_user.id)

    total_referrals = base.count()
    trial_count = base.filter(ReferralUse.status == "trial").count()
    subscribed_count = base.filter(ReferralUse.status == "subscribed").count()

    return {
        "total_referrals": total_referrals,
        "trial_count": trial_count,
        "subscribed_count": subscribed_count,
        "conversion_rate": (
            round(subscribed_count / total_referrals * 100, 1)
            if total_referrals > 0 else 0
        ),
        "current_balance": float(current_user.referral_credit_usdt or 0),
        "lifetime_earned": float(current_user.lifetime_credit_earned or 0),
    }


# ════════════════════════════════════════════════
# GET /check/{code} — public validation
# ════════════════════════════════════════════════

@router.get("/check/{code}")
async def check_referral_code(code: str, db: Session = Depends(get_db)):
    """Validate referral code (public, no auth)."""
    code_upper = code.strip().upper()

    ref = db.query(ReferralCode).filter(
        ReferralCode.code == code_upper,
        ReferralCode.is_active == True,
    ).first()

    if not ref:
        return {"valid": False, "code": code_upper}

    owner = db.query(User).filter(User.id == ref.owner_id).first()

    return {
        "valid": True,
        "code": ref.code,
        "discount_pct": float(ref.discount_pct),
        "owner_username": owner.username if owner else None,
    }


# ════════════════════════════════════════════════
# POST /apply — User applies referral code
# ════════════════════════════════════════════════

@router.post("/apply")
async def apply_referral_code(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a referral code to current user (1× only)."""
    code = (payload.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code wajib diisi.")

    # Check if user already has a referral
    existing = db.query(ReferralUse).filter(
        ReferralUse.referred_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Kamu sudah pakai kode referral (#{existing.id}). Tidak bisa apply lagi."
        )

    ref = db.query(ReferralCode).filter(
        ReferralCode.code == code,
        ReferralCode.is_active == True,
    ).first()

    if not ref:
        raise HTTPException(status_code=404, detail="Kode referral tidak ditemukan atau tidak aktif.")

    if ref.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="Kamu tidak bisa pakai kode referral sendiri.")

    use = ReferralUse(
        referrer_id=ref.owner_id,
        referred_id=current_user.id,
        referral_code_id=ref.id,
        status="trial",
        discount_amount=Decimal("0"),
        commission_amount=Decimal("0"),
        total_commission_earned=Decimal("0"),
        total_payments=0,
    )
    db.add(use)
    db.commit()
    db.refresh(use)

    logger.info(
        f"📌 Referral applied: user {current_user.id} → ref code {code} "
        f"(owner {ref.owner_id})"
    )

    return {"applied": True, "use_id": use.id, "code": code}


# ════════════════════════════════════════════════
# Layer 8: GET /redeem/preview
# ════════════════════════════════════════════════

@router.get("/redeem/preview", response_model=RedeemPreviewResponse)
async def preview_redemption(
    plan_id: int = Query(..., gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Preview what an invoice will look like with stacking applied:
      gross → referral discount → credit redeem → final.

    No DB writes. Pure calculation. Used by PaymentPage to show breakdown
    before user commits to /subscribe.
    """
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == plan_id,
        SubscriptionPlan.is_active == True,
    ).first()

    if not plan:
        raise HTTPException(status_code=404, detail="Plan tidak ditemukan.")

    gross = Decimal(str(plan.price_usdt))

    # Layer 4 discount preview
    discount, after_ref, _use_id = apply_referral_discount(
        user=current_user,
        gross_amount=gross,
        db=db,
    )

    # Layer 8 credit redeem preview
    credit_redeemed, final = apply_credit_redeem(
        user=current_user,
        after_referral_amount=after_ref,
    )

    current_balance = Decimal(str(current_user.referral_credit_usdt or 0))
    balance_after = current_balance - credit_redeemed

    return RedeemPreviewResponse(
        plan_id=plan.id,
        plan_name=plan.name,
        plan_label=plan.label,
        gross_amount=float(gross),
        referral_discount=float(discount),
        credit_redeem=float(credit_redeemed),
        final_amount=float(final),
        eligible_for_referral_discount=(discount > Decimal("0")),
        user_credit_balance=float(current_balance),
        credit_balance_after_redeem=float(balance_after),
    )


# ════════════════════════════════════════════════
# Layer 8: GET /cashout/balance
# ════════════════════════════════════════════════

@router.get("/cashout/balance")
async def get_cashout_balance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current redeemable balance + info about active cashout (if any)."""
    active = get_user_active_cashout(current_user.id, db)

    return {
        "balance_usdt": float(current_user.referral_credit_usdt or 0),
        "lifetime_earned_usdt": float(current_user.lifetime_credit_earned or 0),
        "active_cashout": (
            CashoutRequestResponse.from_orm_model(active).model_dump(mode="json")
            if active else None
        ),
        "can_request_cashout": active is None and Decimal(str(current_user.referral_credit_usdt or 0)) > Decimal("0"),
    }


# ════════════════════════════════════════════════
# Layer 8: POST /cashout/request
# ════════════════════════════════════════════════

@router.post("/cashout/request", response_model=CashoutRequestResponse)
async def create_cashout_request(
    payload: CashoutRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit new cashout request. Hard reserve: balance immediately deducted.

    Constraints (DB-enforced):
      - 1 active request per user (uq_cashout_one_active_per_user)
      - amount must be > 0
      - user must have at least `amount` in referral_credit_usdt

    Method: telegram_admin (admin will DM user for details).
    """
    cashout = submit_cashout_request(
        user=current_user,
        amount=Decimal(str(payload.amount_usdt)),
        destination_telegram=payload.destination_telegram,
        destination_note=payload.destination_note,
        db=db,
    )

    return CashoutRequestResponse.from_orm_model(cashout)


# ════════════════════════════════════════════════
# Layer 8: GET /cashout/my
# ════════════════════════════════════════════════

@router.get("/cashout/my")
async def get_my_cashouts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    """My cashout history (all statuses, newest first)."""
    items = get_user_cashouts(current_user.id, db, limit=limit)

    return {
        "items": [
            CashoutRequestResponse.from_orm_model(c).model_dump(mode="json")
            for c in items
        ],
        "total": len(items),
    }


# ════════════════════════════════════════════════
# Layer 8: POST /cashout/{id}/cancel
# ════════════════════════════════════════════════

@router.post("/cashout/{cashout_id}/cancel", response_model=CashoutRequestResponse)
async def cancel_my_cashout(
    cashout_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel my own pending cashout. Balance refunded immediately."""
    cashout = cancel_cashout_request(
        user=current_user,
        cashout_id=cashout_id,
        db=db,
    )

    return CashoutRequestResponse.from_orm_model(cashout)
