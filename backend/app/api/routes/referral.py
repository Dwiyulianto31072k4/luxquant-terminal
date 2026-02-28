# backend/app/api/routes/referral.py
"""
Referral System Routes

Endpoints:
  POST /generate         → generate referral code
  GET  /my-code          → get user's referral code
  GET  /stats            → referral dashboard stats
  GET  /validate/{code}  → check if code is valid (public)
  POST /apply            → apply code to current user (at registration)
  POST /payout           → request commission payout
  GET  /payouts          → payout history
"""
import secrets
import string
import logging
from decimal import Decimal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.referral import ReferralCode, ReferralUse, ReferralPayout
from app.schemas.referral import (
    ReferralCodeCreate,
    ReferralCodeResponse,
    ReferralStatsResponse,
    ReferralApply,
    ReferralValidateResponse,
    PayoutRequest,
    PayoutResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/referral", tags=["Referral"])


def _generate_code(length=8) -> str:
    """Generate a random referral code like LUXQ-A3F8K2"""
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(secrets.choice(chars) for _ in range(length))
    return f"LUXQ-{random_part}"


# ============================================
# POST /generate — Generate referral code
# ============================================

@router.post("/generate", response_model=ReferralCodeResponse)
async def generate_referral_code(
    data: ReferralCodeCreate = ReferralCodeCreate(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a referral code for the current user"""

    # Check if user already has an active code
    existing = db.query(ReferralCode).filter(
        ReferralCode.user_id == current_user.id,
        ReferralCode.is_active == True,
    ).first()

    if existing:
        return existing

    # Generate or use custom code
    if data.custom_code:
        # Check uniqueness
        taken = db.query(ReferralCode).filter(
            ReferralCode.code == data.custom_code
        ).first()
        if taken:
            raise HTTPException(status_code=400, detail="Code already taken")
        code = data.custom_code
    else:
        # Auto-generate unique code
        for _ in range(10):
            code = _generate_code()
            exists = db.query(ReferralCode).filter(ReferralCode.code == code).first()
            if not exists:
                break
        else:
            raise HTTPException(status_code=500, detail="Failed to generate unique code")

    referral = ReferralCode(
        user_id=current_user.id,
        code=code,
        discount_pct=Decimal("10.00"),
        commission_pct=Decimal("10.00"),
    )
    db.add(referral)
    db.commit()
    db.refresh(referral)

    logger.info(f"🎟️ Referral code generated: {code} for user {current_user.id}")
    return referral


# ============================================
# GET /my-code — Get user's referral code
# ============================================

@router.get("/my-code")
async def get_my_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current user's active referral code"""
    code = db.query(ReferralCode).filter(
        ReferralCode.user_id == current_user.id,
        ReferralCode.is_active == True,
    ).first()

    if not code:
        return {"code": None, "message": "No referral code yet. Generate one first."}

    return {
        "id": code.id,
        "code": code.code,
        "discount_pct": float(code.discount_pct),
        "commission_pct": float(code.commission_pct),
        "times_used": code.times_used,
        "max_uses": code.max_uses,
        "is_active": code.is_active,
        "link": f"https://luxquant.com/register?ref={code.code}",
    }


# ============================================
# GET /stats — Referral dashboard stats
# ============================================

@router.get("/stats", response_model=ReferralStatsResponse)
async def get_referral_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get referral performance stats for current user"""

    # Get all referral uses where current user is the referrer
    uses = db.query(ReferralUse).filter(
        ReferralUse.referrer_id == current_user.id
    ).all()

    total_referrals = len(uses)
    confirmed = [u for u in uses if u.status == "confirmed"]
    pending = [u for u in uses if u.status == "pending"]

    total_commission = sum(float(u.commission_amount or 0) for u in confirmed)

    # Total paid out
    total_paid = db.query(
        sql_func.coalesce(sql_func.sum(ReferralPayout.amount_usdt), 0)
    ).filter(
        ReferralPayout.user_id == current_user.id,
        ReferralPayout.status == "completed",
    ).scalar()
    total_paid = float(total_paid)

    available_balance = total_commission - total_paid

    # Recent referrals (last 20)
    recent = []
    recent_uses = db.query(ReferralUse).filter(
        ReferralUse.referrer_id == current_user.id
    ).order_by(ReferralUse.created_at.desc()).limit(20).all()

    for u in recent_uses:
        referred_user = db.query(User).filter(User.id == u.referred_id).first()
        recent.append({
            "id": u.id,
            "username": referred_user.username if referred_user else "Unknown",
            "commission": float(u.commission_amount or 0),
            "discount": float(u.discount_amount or 0),
            "status": u.status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    return ReferralStatsResponse(
        total_referrals=total_referrals,
        confirmed_referrals=len(confirmed),
        pending_referrals=len(pending),
        total_commission=total_commission,
        available_balance=max(0, available_balance),
        total_paid_out=total_paid,
        recent_referrals=recent,
    )


# ============================================
# GET /validate/{code} — Check code validity (public)
# ============================================

@router.get("/validate/{code}", response_model=ReferralValidateResponse)
async def validate_referral_code(
    code: str,
    db: Session = Depends(get_db),
):
    """Check if a referral code is valid (no auth required)"""
    code = code.strip().upper()

    referral = db.query(ReferralCode).filter(
        ReferralCode.code == code,
        ReferralCode.is_active == True,
    ).first()

    if not referral:
        return ReferralValidateResponse(valid=False, message="Invalid referral code")

    # Check expiry
    if referral.expires_at and referral.expires_at < datetime.now(timezone.utc):
        return ReferralValidateResponse(valid=False, message="Referral code has expired")

    # Check max uses
    if referral.max_uses and referral.times_used >= referral.max_uses:
        return ReferralValidateResponse(valid=False, message="Referral code has reached max uses")

    return ReferralValidateResponse(
        valid=True,
        code=referral.code,
        discount_pct=float(referral.discount_pct),
        message=f"{float(referral.discount_pct)}% discount will be applied",
    )


# ============================================
# POST /apply — Apply referral code to user
# ============================================

@router.post("/apply")
async def apply_referral_code(
    data: ReferralApply,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a referral code to current user (typically at registration)"""

    # Check if user already has a referral
    if current_user.referred_by or current_user.referral_code_used:
        raise HTTPException(status_code=400, detail="You already used a referral code")

    # Validate code
    referral = db.query(ReferralCode).filter(
        ReferralCode.code == data.code,
        ReferralCode.is_active == True,
    ).first()

    if not referral:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    # Can't refer yourself
    if referral.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")

    # Check expiry & max uses
    if referral.expires_at and referral.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Referral code has expired")

    if referral.max_uses and referral.times_used >= referral.max_uses:
        raise HTTPException(status_code=400, detail="Referral code has reached max uses")

    # Apply referral to user
    current_user.referred_by = referral.user_id
    current_user.referral_code_used = referral.code

    # Create referral_use record (pending until payment)
    use = ReferralUse(
        referral_code_id=referral.id,
        referrer_id=referral.user_id,
        referred_id=current_user.id,
        status="pending",
    )
    db.add(use)

    # Increment times_used
    referral.times_used += 1

    db.commit()

    logger.info(f"🎟️ Referral {referral.code} applied by user {current_user.id}")

    return {
        "status": "applied",
        "code": referral.code,
        "discount_pct": float(referral.discount_pct),
        "message": f"{float(referral.discount_pct)}% discount will apply to your first subscription",
    }


# ============================================
# POST /payout — Request commission payout
# ============================================

@router.post("/payout", response_model=PayoutResponse)
async def request_payout(
    data: PayoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Request withdrawal of referral commissions"""

    # Calculate available balance
    total_commission = db.query(
        sql_func.coalesce(sql_func.sum(ReferralUse.commission_amount), 0)
    ).filter(
        ReferralUse.referrer_id == current_user.id,
        ReferralUse.status == "confirmed",
    ).scalar()

    total_paid = db.query(
        sql_func.coalesce(sql_func.sum(ReferralPayout.amount_usdt), 0)
    ).filter(
        ReferralPayout.user_id == current_user.id,
        ReferralPayout.status.in_(["pending", "processing", "completed"]),
    ).scalar()

    available = float(total_commission) - float(total_paid)

    if data.amount_usdt > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Available: ${available:.2f}"
        )

    # Check no pending payout
    pending = db.query(ReferralPayout).filter(
        ReferralPayout.user_id == current_user.id,
        ReferralPayout.status.in_(["pending", "processing"]),
    ).first()

    if pending:
        raise HTTPException(status_code=400, detail="You already have a pending payout request")

    payout = ReferralPayout(
        user_id=current_user.id,
        amount_usdt=Decimal(str(data.amount_usdt)),
        wallet_address=data.wallet_address,
        network=data.network,
        status="pending",
    )
    db.add(payout)
    db.commit()
    db.refresh(payout)

    logger.info(f"💰 Payout requested: ${data.amount_usdt} by user {current_user.id}")
    return payout


# ============================================
# GET /payouts — Payout history
# ============================================

@router.get("/payouts")
async def get_payouts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user's payout history"""
    payouts = db.query(ReferralPayout).filter(
        ReferralPayout.user_id == current_user.id
    ).order_by(ReferralPayout.requested_at.desc()).all()

    return [{
        "id": p.id,
        "amount_usdt": float(p.amount_usdt),
        "wallet_address": p.wallet_address,
        "network": p.network,
        "status": p.status,
        "requested_at": p.requested_at.isoformat() if p.requested_at else None,
        "completed_at": p.completed_at.isoformat() if p.completed_at else None,
    } for p in payouts]