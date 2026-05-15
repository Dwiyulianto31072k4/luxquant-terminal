# backend/app/api/routes/referral.py
"""
Referral API endpoints — v2 (credit balance model).

GET    /referral/my-code              Get user's code (with share_link, qr_url)
POST   /referral/generate             Generate new code (custom slug or random)
GET    /referral/stats                Combined dashboard stats
GET    /referral/funnel               Funnel breakdown
GET    /referral/earnings             Earnings card data
GET    /referral/referees             Paginated referee list (Level 3 disclosure)
GET    /referral/ledger               Credit ledger history (paginated)
GET    /referral/qr/{code}            QR code PNG (public)
GET    /referral/validate/{code}      Validate code (public, untuk LandingPage banner)
POST   /referral/track-share          Track share event
POST   /referral/apply                Manual apply (legacy)
POST   /referral/redeem               Redeem credit ke invoice
POST   /referral/redeem/preview       Preview redeem (no commit)

# Layer 8 — Cashout (NEW)
GET    /referral/cashout/balance      Current balance + active cashout info
POST   /referral/cashout/request      Submit cashout request (hard reserve)
GET    /referral/cashout/my           My cashout history
POST   /referral/cashout/{id}/cancel  Cancel pending cashout

DEPRECATED (return 410 Gone):
POST   /referral/payout
GET    /referral/payouts
"""
import logging
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.referral import (
    ReferralCode,
    ReferralUse,
    REFERRAL_STATUS_PENDING,
)
from app.models.credit import CreditLedger
from app.schemas.referral import (
    ReferralCodeCreate,
    ReferralCodeResponse,
    ReferralApply,
    ReferralValidateResponse,
    ReferralFunnelResponse,
    ReferralEarningsResponse,
    ReferralStatsResponse,
    RefereeItem,
    RefereeListResponse,
    TrackShareRequest,
    TrackShareResponse,
    RedeemRequest,
    RedeemPreviewRequest,
    RedeemPreviewResponse,
    RedeemResponse,
    CreditLedgerEntry,
    CreditLedgerResponse,
)
from app.api.deps import get_current_user
from app.services.referral_helpers import (
    apply_referral_to_user,
    find_referral_code,
    is_referral_code_valid,
)
from app.services.referral_service import (
    build_share_link,
    build_qr_url,
    generate_unique_code,
    is_code_taken,
    generate_qr_png,
    calculate_funnel,
    calculate_earnings,
    get_referee_list,
    track_share_event,
    preview_redemption,
    execute_redemption,
)

# Layer 8 — Cashout imports
from app.models.cashout import CashoutRequest, ACTIVE_STATUSES
from app.schemas.cashout import (
    CashoutRequestCreate,
    CashoutRequestResponse,
)
from app.services.cashout_service import (
    submit_cashout_request,
    cancel_cashout_request,
    get_user_cashouts,
    get_user_active_cashout,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/referral", tags=["Referral"])


# ════════════════════════════════════════════════════════════════════
# Helper: enrich ReferralCode dengan share_link & qr_url
# ════════════════════════════════════════════════════════════════════

def _enrich_code(code_obj: ReferralCode) -> dict:
    """Convert ReferralCode object → dict yang match ReferralCodeResponse"""
    return {
        "id": code_obj.id,
        "code": code_obj.code,
        "discount_pct": float(code_obj.discount_pct or 10),
        "commission_pct": float(code_obj.commission_pct or 10),
        "max_uses": code_obj.max_uses,
        "times_used": code_obj.times_used or 0,
        "is_active": code_obj.is_active,
        "expires_at": code_obj.expires_at,
        "created_at": code_obj.created_at,
        "share_link": build_share_link(code_obj.code),
        "qr_url": build_qr_url(code_obj.code),
        "share_count": getattr(code_obj, 'share_count', 0) or 0,
        "qr_count": getattr(code_obj, 'qr_count', 0) or 0,
        "last_shared_at": getattr(code_obj, 'last_shared_at', None),
    }


# ════════════════════════════════════════════════════════════════════
# 1. GET MY CODE
# ════════════════════════════════════════════════════════════════════

@router.get("/my-code", response_model=Optional[ReferralCodeResponse])
async def get_my_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return user's active referral code, atau None kalau belum generate."""
    code = (
        db.query(ReferralCode)
        .filter(
            ReferralCode.user_id == current_user.id,
            ReferralCode.is_active == True,
        )
        .order_by(ReferralCode.created_at.desc())
        .first()
    )

    if not code:
        return None

    return ReferralCodeResponse(**_enrich_code(code))


# ════════════════════════════════════════════════════════════════════
# 2. GENERATE CODE
# ════════════════════════════════════════════════════════════════════

@router.post("/generate", response_model=ReferralCodeResponse, status_code=status.HTTP_201_CREATED)
async def generate_referral_code(
    data: ReferralCodeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate referral code untuk current user.

    - Custom slug optional (kalau ga ada, generate random LUXQ-XXXXXXXX)
    - User cuma boleh punya 1 active code (deactivate yg lama otomatis)
    """
    if data.custom_code:
        if is_code_taken(db, data.custom_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Code '{data.custom_code}' is already taken. Try another.",
            )
        code_str = data.custom_code
    else:
        code_str = generate_unique_code(db)

    existing = db.query(ReferralCode).filter(
        ReferralCode.user_id == current_user.id,
        ReferralCode.is_active == True,
    ).all()
    for old_code in existing:
        old_code.is_active = False

    new_code = ReferralCode(
        user_id=current_user.id,
        code=code_str,
        discount_pct=10.00,
        commission_pct=10.00,
        is_active=True,
    )
    db.add(new_code)
    db.commit()
    db.refresh(new_code)

    logger.info(f"🎟️ Code generated: {code_str} by user {current_user.id}")

    return ReferralCodeResponse(**_enrich_code(new_code))


# ════════════════════════════════════════════════════════════════════
# 3. STATS (combined dashboard)
# ════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=ReferralStatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One-shot stats endpoint untuk dashboard ReferralPage."""

    code_obj = (
        db.query(ReferralCode)
        .filter(
            ReferralCode.user_id == current_user.id,
            ReferralCode.is_active == True,
        )
        .order_by(ReferralCode.created_at.desc())
        .first()
    )
    code_data = ReferralCodeResponse(**_enrich_code(code_obj)) if code_obj else None

    funnel_data = calculate_funnel(db, current_user.id)
    earnings_data = calculate_earnings(db, current_user)

    recent_items, _total = get_referee_list(db, current_user.id, page=1, page_size=5)
    recent_referees = [RefereeItem(**item) for item in recent_items]

    return ReferralStatsResponse(
        code=code_data,
        funnel=ReferralFunnelResponse(**funnel_data),
        earnings=ReferralEarningsResponse(**earnings_data),
        recent_referees=recent_referees,
    )


# ════════════════════════════════════════════════════════════════════
# 4. FUNNEL
# ════════════════════════════════════════════════════════════════════

@router.get("/funnel", response_model=ReferralFunnelResponse)
async def get_funnel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = calculate_funnel(db, current_user.id)
    return ReferralFunnelResponse(**data)


# ════════════════════════════════════════════════════════════════════
# 5. EARNINGS
# ════════════════════════════════════════════════════════════════════

@router.get("/earnings", response_model=ReferralEarningsResponse)
async def get_earnings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = calculate_earnings(db, current_user)
    return ReferralEarningsResponse(**data)


# ════════════════════════════════════════════════════════════════════
# 6. REFEREE LIST
# ════════════════════════════════════════════════════════════════════

@router.get("/referees", response_model=RefereeListResponse)
async def get_referees(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=50, description="Items per page (max 50)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated list semua referee user."""
    items, total = get_referee_list(db, current_user.id, page=page, page_size=page_size)

    return RefereeListResponse(
        items=[RefereeItem(**item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


# ════════════════════════════════════════════════════════════════════
# 7. LEDGER
# ════════════════════════════════════════════════════════════════════

@router.get("/ledger", response_model=CreditLedgerResponse)
async def get_ledger(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Credit ledger history untuk current user."""
    total = (
        db.query(func.count(CreditLedger.id))
        .filter(CreditLedger.user_id == current_user.id)
        .scalar()
    )

    offset = (page - 1) * page_size
    rows = (
        db.query(CreditLedger)
        .filter(CreditLedger.user_id == current_user.id)
        .order_by(CreditLedger.created_at.desc())
        .limit(page_size)
        .offset(offset)
        .all()
    )

    return CreditLedgerResponse(
        entries=[
            CreditLedgerEntry(
                id=r.id,
                amount=float(r.amount),
                type=r.type,
                balance_after=float(r.balance_after),
                note=r.note,
                ref_payment_id=r.ref_payment_id,
                ref_use_id=r.ref_use_id,
                created_at=r.created_at,
            )
            for r in rows
        ],
        total=total or 0,
        current_balance=float(current_user.referral_credit_usdt or 0),
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < (total or 0),
    )


# ════════════════════════════════════════════════════════════════════
# 8. QR CODE (public PNG)
# ════════════════════════════════════════════════════════════════════

@router.get("/qr/{code}")
async def get_qr_code(
    code: str,
    db: Session = Depends(get_db),
):
    """Generate QR code PNG untuk shareable link. Public endpoint."""
    code_norm = code.strip().upper()

    referral = db.query(ReferralCode).filter(
        ReferralCode.code == code_norm,
        ReferralCode.is_active == True,
    ).first()

    if not referral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral code not found",
        )

    png_bytes = generate_qr_png(code_norm)

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600",
        },
    )


# ════════════════════════════════════════════════════════════════════
# 9. VALIDATE (public)
# ════════════════════════════════════════════════════════════════════

@router.get("/validate/{code}", response_model=ReferralValidateResponse)
async def validate_code(
    code: str,
    db: Session = Depends(get_db),
):
    """Public validate endpoint untuk LandingPage banner / RegisterPage."""
    referral = find_referral_code(db, code)
    valid, reason = is_referral_code_valid(referral)

    if not valid:
        return ReferralValidateResponse(
            valid=False,
            message=reason,
        )

    referrer = db.query(User).filter(User.id == referral.user_id).first()
    referrer_username = referrer.username if referrer else None

    return ReferralValidateResponse(
        valid=True,
        code=referral.code,
        discount_pct=float(referral.discount_pct or 10),
        referrer_username=referrer_username,
        message="Valid referral code",
    )


# ════════════════════════════════════════════════════════════════════
# 10. TRACK SHARE
# ════════════════════════════════════════════════════════════════════

@router.post("/track-share", response_model=TrackShareResponse)
async def track_share(
    data: TrackShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Track share event (frontend pake saat Copy Link / download QR / share to social)."""
    referral = db.query(ReferralCode).filter(
        func.upper(ReferralCode.code) == data.code.upper(),
        ReferralCode.user_id == current_user.id,
    ).first()

    if not referral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code not found or not owned by you",
        )

    updated = track_share_event(db, data.code, data.channel)

    return TrackShareResponse(
        success=True,
        share_count=updated.share_count or 0,
        qr_count=updated.qr_count or 0,
    )


# ════════════════════════════════════════════════════════════════════
# 11. APPLY (legacy)
# ════════════════════════════════════════════════════════════════════

@router.post("/apply", response_model=ReferralValidateResponse)
async def apply_code_legacy(
    data: ReferralApply,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manual apply referral code (legacy endpoint)."""
    success, msg, use = apply_referral_to_user(
        db, current_user, data.code, commit=True
    )

    if not success:
        return ReferralValidateResponse(
            valid=False,
            message=msg,
        )

    referral = use.referral_code
    referrer = db.query(User).filter(User.id == use.referrer_id).first()

    return ReferralValidateResponse(
        valid=True,
        code=referral.code,
        discount_pct=float(referral.discount_pct or 10),
        referrer_username=referrer.username if referrer else None,
        message=msg,
    )


# ════════════════════════════════════════════════════════════════════
# 12. REDEEM PREVIEW
# ════════════════════════════════════════════════════════════════════

@router.post("/redeem/preview", response_model=RedeemPreviewResponse)
async def preview_redeem(
    data: RedeemPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview redemption tanpa commit."""
    result = preview_redemption(db, current_user, data.amount_usdt, data.payment_id)
    return RedeemPreviewResponse(**result)


# ════════════════════════════════════════════════════════════════════
# 13. REDEEM (execute)
# ════════════════════════════════════════════════════════════════════

@router.post("/redeem", response_model=RedeemResponse)
async def redeem_credit(
    data: RedeemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute redemption: potong credit balance, log ledger, update payment."""
    try:
        result = execute_redemption(db, current_user, data.amount_usdt, data.payment_id)
        return RedeemResponse(**result)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ════════════════════════════════════════════════════════════════════
# 14. CASHOUT BALANCE (Layer 8)
# ════════════════════════════════════════════════════════════════════

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
        "can_request_cashout": (
            active is None
            and Decimal(str(current_user.referral_credit_usdt or 0)) > Decimal("0")
        ),
    }


# ════════════════════════════════════════════════════════════════════
# 15. CASHOUT REQUEST (Layer 8)
# ════════════════════════════════════════════════════════════════════

@router.post("/cashout/request", response_model=CashoutRequestResponse)
async def create_cashout_request(
    payload: CashoutRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit new cashout request. Hard reserve: balance immediately deducted.

    Constraints (DB-enforced):
      - 1 active request per user
      - amount > 0
      - user must have sufficient balance

    Method: telegram_admin (admin akan DM user untuk koordinasi).
    """
    cashout = submit_cashout_request(
        user=current_user,
        amount=Decimal(str(payload.amount_usdt)),
        destination_telegram=payload.destination_telegram,
        destination_note=payload.destination_note,
        db=db,
    )

    return CashoutRequestResponse.from_orm_model(cashout)


# ════════════════════════════════════════════════════════════════════
# 16. CASHOUT HISTORY (Layer 8)
# ════════════════════════════════════════════════════════════════════

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


# ════════════════════════════════════════════════════════════════════
# 17. CASHOUT CANCEL (Layer 8)
# ════════════════════════════════════════════════════════════════════

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


# ════════════════════════════════════════════════════════════════════
# DEPRECATED ENDPOINTS — return 410 Gone
# ════════════════════════════════════════════════════════════════════

@router.post("/payout", deprecated=True)
async def payout_deprecated():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="USDT payout has been deprecated. Use /referral/redeem instead.",
    )


@router.get("/payouts", deprecated=True)
async def payouts_deprecated():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="USDT payout history has been deprecated. Use /referral/ledger instead.",
    )
