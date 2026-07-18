# backend/app/services/cashout_service.py
"""
Cashout Service — Layer 8

Handles user cashout requests with Hard Reserve architecture:
  - User submits request → balance immediately deducted (reserved)
  - Admin approves & sends → status='completed' (no balance change, fund already gone)
  - Admin rejects → balance refunded
  - User cancels (while still pending) → balance refunded

Every state transition creates a CreditLedger entry for full audit trail.

Transactional safety:
  - Operations are atomic (single commit per state change)
  - Idempotency: re-submit blocked by unique index (uq_cashout_one_active_per_user)
  - DB-level CHECK constraints prevent invalid status/method/amount values
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.user import User
from app.models.cashout import (
    CashoutRequest,
    STATUS_PENDING,
    STATUS_APPROVED,
    STATUS_COMPLETED,
    STATUS_REJECTED,
    STATUS_CANCELLED,
    ACTIVE_STATUSES,
    METHOD_TELEGRAM,
)
from app.models.credit import (
    CreditLedger,
    LEDGER_TYPE_CASHOUT_PENDING,
    LEDGER_TYPE_CASHOUT_COMPLETED,
    LEDGER_TYPE_REFUND,
)

logger = logging.getLogger(__name__)


def _quantize(amount: Decimal) -> Decimal:
    """Round to 2 decimals (USDT precision)."""
    from decimal import ROUND_HALF_UP
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ════════════════════════════════════════════════
# User-side: submit / cancel
# ════════════════════════════════════════════════

def submit_cashout_request(
    user: User,
    amount: Decimal,
    destination_telegram: str,
    destination_note: Optional[str],
    db: Session,
) -> CashoutRequest:
    """
    Create a new cashout request and reserve balance.

    Validation:
      - Amount > 0
      - User has at least `amount` in referral_credit_usdt
      - No other active request exists (DB unique index enforces)

    Side effects (atomic transaction):
      1. cashout_requests row inserted (status='pending')
      2. users.referral_credit_usdt -= amount
      3. credit_ledger entry created (type='cashout_pending', amount=-X)
      4. cashout_requests.ledger_reserve_id linked

    Raises: HTTPException on validation failure or active request exists.
    """
    # ── Validation ──
    if amount <= Decimal("0"):
        raise HTTPException(
            status_code=400,
            detail="Cashout amount must be greater than 0.",
        )

    current_balance = Decimal(str(user.referral_credit_usdt or 0))
    if amount > current_balance:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Saldo tidak cukup. Saldo: ${current_balance}, "
                f"diminta: ${amount}."
            ),
        )

    # Check active request (also enforced by DB unique index, but check first for friendlier error)
    active = db.query(CashoutRequest).filter(
        CashoutRequest.user_id == user.id,
        CashoutRequest.status.in_(list(ACTIVE_STATUSES)),
    ).first()

    if active:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Kamu masih punya cashout request aktif (#{active.id}, status: {active.status}). "
                f"Tunggu admin proses atau cancel dulu sebelum buat baru."
            ),
        )

    amount = _quantize(amount)
    now = datetime.now(timezone.utc)

    try:
        # ── 1. Reserve balance ──
        new_balance = _quantize(current_balance - amount)
        user.referral_credit_usdt = new_balance

        # ── 2. Create ledger entry (cashout_pending) ──
        ledger = CreditLedger(
            user_id=user.id,
            amount=-amount,  # negative: balance reduction
            type=LEDGER_TYPE_CASHOUT_PENDING,
            balance_after=new_balance,
            note=f"Cashout request reserve to @{destination_telegram}",
            created_at=now,
        )
        db.add(ledger)
        db.flush()  # populate ledger.id

        # ── 3. Create cashout request ──
        cashout = CashoutRequest(
            user_id=user.id,
            amount_usdt=amount,
            method=METHOD_TELEGRAM,
            destination_telegram=destination_telegram,
            destination_note=destination_note,
            status=STATUS_PENDING,
            requested_at=now,
            ledger_reserve_id=ledger.id,
        )
        db.add(cashout)
        db.flush()  # populate cashout.id

        db.commit()
        db.refresh(cashout)

        logger.info(
            f"💸 Cashout request #{cashout.id} created: user={user.id} "
            f"amount={amount} → @{destination_telegram} (balance: {current_balance} → {new_balance})"
        )

        return cashout

    except IntegrityError as e:
        db.rollback()
        # Most likely cause: unique index violation (active request already exists, race)
        logger.warning(
            f"⚠️  Cashout submission integrity error for user={user.id}: {e}"
        )
        raise HTTPException(
            status_code=409,
            detail=(
                "Cashout request konflik. Kamu mungkin sudah punya request aktif. "
                "Refresh dan coba lagi."
            ),
        )


def cancel_cashout_request(
    user: User,
    cashout_id: int,
    db: Session,
) -> CashoutRequest:
    """
    User cancels their own pending cashout. Balance is refunded.

    Only allowed if status='pending' (not approved yet).
    If admin already approved, user can't cancel — must go through admin.
    """
    cashout = db.query(CashoutRequest).filter(
        CashoutRequest.id == cashout_id,
        CashoutRequest.user_id == user.id,
    ).first()

    if not cashout:
        raise HTTPException(
            status_code=404,
            detail="Cashout request not found.",
        )

    if cashout.status != STATUS_PENDING:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cashout tidak bisa di-cancel (status: {cashout.status}). "
                f"Hanya request 'pending' yang bisa di-cancel."
            ),
        )

    return _refund_cashout(
        cashout=cashout,
        user=user,
        new_status=STATUS_CANCELLED,
        admin_note="Cancelled by user",
        reviewed_by_admin_id=None,
        db=db,
    )


# ════════════════════════════════════════════════
# Admin-side: approve / reject / complete
# ════════════════════════════════════════════════

def admin_approve_cashout(
    cashout_id: int,
    admin_user: User,
    admin_note: Optional[str],
    db: Session,
) -> CashoutRequest:
    """
    Admin approves a pending cashout. Status: pending → approved.

    No balance change (balance already reserved at submit time).
    This step is informational — signals "admin sedang proses, akan kirim soon".
    """
    cashout = _get_cashout_for_admin(cashout_id, db)

    if cashout.status != STATUS_PENDING:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Hanya request 'pending' yang bisa di-approve. "
                f"Status saat ini: {cashout.status}."
            ),
        )

    now = datetime.now(timezone.utc)
    cashout.status = STATUS_APPROVED
    cashout.reviewed_at = now
    cashout.reviewed_by_admin_id = admin_user.id
    if admin_note:
        cashout.admin_note = admin_note

    db.commit()
    db.refresh(cashout)

    logger.info(
        f"✅ Cashout #{cashout.id} approved by admin={admin_user.id} "
        f"(user={cashout.user_id}, amount={cashout.amount_usdt})"
    )

    return cashout


def admin_complete_cashout(
    cashout_id: int,
    admin_user: User,
    tx_hash: Optional[str],
    admin_note: Optional[str],
    db: Session,
) -> CashoutRequest:
    """
    Admin marks cashout as completed (funds sent to user).

    Status: pending|approved → completed.
    Creates audit-only ledger entry (type='cashout_completed', amount=0).
    No balance change (already deducted at submit).
    """
    cashout = _get_cashout_for_admin(cashout_id, db)

    if cashout.status not in (STATUS_PENDING, STATUS_APPROVED):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Hanya request 'pending' atau 'approved' yang bisa di-complete. "
                f"Status saat ini: {cashout.status}."
            ),
        )

    user = db.query(User).filter(User.id == cashout.user_id).first()
    if not user:
        raise HTTPException(
            status_code=500,
            detail=f"User #{cashout.user_id} not found (data inconsistent).",
        )

    now = datetime.now(timezone.utc)

    # Audit-only ledger entry (no balance change)
    ledger = CreditLedger(
        user_id=user.id,
        amount=Decimal("0"),  # informational only
        type=LEDGER_TYPE_CASHOUT_COMPLETED,
        balance_after=Decimal(str(user.referral_credit_usdt or 0)),
        note=(
            f"Cashout #{cashout.id} fulfilled by admin={admin_user.id}"
            + (f" (tx: {tx_hash})" if tx_hash else "")
        ),
        created_at=now,
    )
    db.add(ledger)
    db.flush()

    # Update cashout
    cashout.status = STATUS_COMPLETED
    cashout.completed_at = now
    if not cashout.reviewed_at:
        cashout.reviewed_at = now
    cashout.reviewed_by_admin_id = admin_user.id
    if tx_hash:
        cashout.tx_hash = tx_hash
    if admin_note:
        cashout.admin_note = admin_note
    cashout.ledger_final_id = ledger.id

    db.commit()
    db.refresh(cashout)

    logger.info(
        f"✅ Cashout #{cashout.id} completed by admin={admin_user.id} "
        f"(user={cashout.user_id}, amount={cashout.amount_usdt}"
        + (f", tx={tx_hash}" if tx_hash else "")
        + ")"
    )

    return cashout


def admin_reject_cashout(
    cashout_id: int,
    admin_user: User,
    admin_note: str,
    db: Session,
) -> CashoutRequest:
    """
    Admin rejects pending/approved cashout. Balance refunded to user.

    Status: pending|approved → rejected.
    """
    cashout = _get_cashout_for_admin(cashout_id, db)

    if cashout.status not in (STATUS_PENDING, STATUS_APPROVED):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Hanya request 'pending' atau 'approved' yang bisa di-reject. "
                f"Status saat ini: {cashout.status}."
            ),
        )

    if not admin_note or not admin_note.strip():
        raise HTTPException(
            status_code=400,
            detail="Admin note wajib diisi saat reject (alasan).",
        )

    user = db.query(User).filter(User.id == cashout.user_id).first()
    if not user:
        raise HTTPException(
            status_code=500,
            detail=f"User #{cashout.user_id} not found (data inconsistent).",
        )

    return _refund_cashout(
        cashout=cashout,
        user=user,
        new_status=STATUS_REJECTED,
        admin_note=admin_note,
        reviewed_by_admin_id=admin_user.id,
        db=db,
    )


# ════════════════════════════════════════════════
# Internal helpers
# ════════════════════════════════════════════════

def _get_cashout_for_admin(cashout_id: int, db: Session) -> CashoutRequest:
    """Fetch cashout request by ID, 404 if not found."""
    cashout = db.query(CashoutRequest).filter(
        CashoutRequest.id == cashout_id
    ).first()

    if not cashout:
        raise HTTPException(
            status_code=404,
            detail=f"Cashout request #{cashout_id} not found.",
        )

    return cashout


def _refund_cashout(
    cashout: CashoutRequest,
    user: User,
    new_status: str,
    admin_note: Optional[str],
    reviewed_by_admin_id: Optional[int],
    db: Session,
) -> CashoutRequest:
    """
    Shared refund logic (used by user cancel and admin reject).

    Atomic transaction:
      1. users.referral_credit_usdt += amount
      2. credit_ledger entry (type='refund', amount=+X)
      3. cashout_requests.status = new_status, ledger_final_id linked
    """
    now = datetime.now(timezone.utc)
    amount = Decimal(str(cashout.amount_usdt))

    # Refund balance
    current_balance = Decimal(str(user.referral_credit_usdt or 0))
    new_balance = _quantize(current_balance + amount)
    user.referral_credit_usdt = new_balance

    # Ledger entry
    ledger = CreditLedger(
        user_id=user.id,
        amount=amount,  # positive: balance refund
        type=LEDGER_TYPE_REFUND,
        balance_after=new_balance,
        note=(
            f"Refund from cashout #{cashout.id} "
            f"({new_status}): {admin_note or 'no note'}"
        ),
        created_at=now,
    )
    db.add(ledger)
    db.flush()

    # Update cashout
    cashout.status = new_status
    cashout.reviewed_at = now
    if reviewed_by_admin_id:
        cashout.reviewed_by_admin_id = reviewed_by_admin_id
    if admin_note:
        cashout.admin_note = admin_note
    cashout.ledger_final_id = ledger.id

    db.commit()
    db.refresh(cashout)

    logger.info(
        f"💰 Cashout #{cashout.id} {new_status}: "
        f"refunded {amount} to user={user.id} (balance: {current_balance} → {new_balance})"
    )

    return cashout


# ════════════════════════════════════════════════
# Query helpers
# ════════════════════════════════════════════════

def get_user_cashouts(
    user_id: int,
    db: Session,
    limit: int = 50,
) -> list[CashoutRequest]:
    """Get user's cashout history (all statuses, newest first)."""
    return db.query(CashoutRequest).filter(
        CashoutRequest.user_id == user_id
    ).order_by(
        CashoutRequest.requested_at.desc()
    ).limit(limit).all()


def get_user_active_cashout(user_id: int, db: Session) -> Optional[CashoutRequest]:
    """Get user's currently-active cashout request, if any."""
    return db.query(CashoutRequest).filter(
        CashoutRequest.user_id == user_id,
        CashoutRequest.status.in_(list(ACTIVE_STATUSES)),
    ).first()


def get_pending_cashouts(db: Session, limit: int = 50) -> list[CashoutRequest]:
    """Admin: get all pending cashout requests (oldest first for FIFO processing)."""
    return db.query(CashoutRequest).filter(
        CashoutRequest.status == STATUS_PENDING
    ).order_by(
        CashoutRequest.requested_at.asc()
    ).limit(limit).all()


def get_all_cashouts(
    db: Session,
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[CashoutRequest], dict]:
    """
    Admin: get cashouts with optional status filter + stats summary.

    Returns: (items, stats_dict)
    """
    base_query = db.query(CashoutRequest)

    if status_filter:
        base_query = base_query.filter(CashoutRequest.status == status_filter)

    items = base_query.order_by(
        CashoutRequest.requested_at.desc()
    ).offset(offset).limit(limit).all()

    # Compute stats (always all statuses, not just filtered)
    all_query = db.query(CashoutRequest)
    stats = {
        "total": all_query.count(),
        "pending_count": all_query.filter(CashoutRequest.status == STATUS_PENDING).count(),
        "approved_count": all_query.filter(CashoutRequest.status == STATUS_APPROVED).count(),
        "completed_count": all_query.filter(CashoutRequest.status == STATUS_COMPLETED).count(),
        "rejected_count": all_query.filter(CashoutRequest.status == STATUS_REJECTED).count(),
    }

    return items, stats
