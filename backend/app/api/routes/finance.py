# backend/app/api/routes/finance.py
"""
Finance management endpoints for admin workspace.
v2: explicit JOIN + manual hydration, no SQLAlchemy relationship() needed.
v3: wallet exchange labeling (Binance/Indodax/etc) via receiving_wallets.
v4: manual payment recording (admin can record TX hashes paid out-of-band
    via Telegram support, with on-chain verification + optional user create).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Literal, Union
from pydantic import BaseModel, Field, EmailStr, validator
import re
import logging

from app.core.database import get_db
from app.api.deps import get_admin_user
from app.models.user import User
from app.models.subscription import Payment, SubscriptionPlan
from app.models.wallet import ReceivingWallet
from app.services.bscscan import fetch_tx_details


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/workspace/finance", tags=["finance"])

MANUAL_EMAIL_DOMAIN = "manual.luxquant.tw"
MIN_CONFIRMATIONS_WARN = 12
OLD_TX_WARN_DAYS = 7
AMOUNT_TOLERANCE = Decimal("0.50")  # warn if abs diff > this


# ════════════════════════════════════════════════════════════════════
# Schemas
# ════════════════════════════════════════════════════════════════════

class PaymentActionPayload(BaseModel):
    note: Optional[str] = None


class PaymentNotePayload(BaseModel):
    note: str = Field(..., min_length=1)


class VerifyTxPayload(BaseModel):
    tx_hash: str = Field(..., min_length=66, max_length=66)

    @validator("tx_hash")
    def must_be_hex(cls, v):
        if not re.match(r"^0x[0-9a-fA-F]{64}$", v):
            raise ValueError("Invalid TX hash format")
        return v.lower()


class NewUserPayload(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    telegram_username: Optional[str] = None
    discord_handle: Optional[str] = None

    @validator("username")
    def clean_username(cls, v):
        v = v.strip().lstrip("@")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username may only contain letters, numbers, and underscore")
        return v


class ManualPaymentPayload(BaseModel):
    # On-chain only — optional now; required when method == "onchain_bsc"
    tx_hash: Optional[str] = Field(None, min_length=66, max_length=66)
    plan_id: int
    admin_note: str = Field(..., min_length=10)

    # Payment method. Default preserves the original on-chain behavior so
    # existing callers (which send no `method`) are unaffected.
    method: Literal["onchain_bsc", "binance_uid", "bank_transfer", "other"] = "onchain_bsc"
    method_label: Optional[str] = None     # for "other": free-text method name (OVO/GoPay/Cash/...)
    reference: Optional[str] = None        # Binance UID / bank ref / free note
    paid_currency: Optional[str] = None    # "USDT" | "IDR" | ...
    paid_amount: Optional[Decimal] = None  # amount in paid_currency (audit)
    fx_rate: Optional[Decimal] = None      # rate to USD for non-USD methods (audit)
    amount_usd: Optional[Decimal] = None   # USD value received — required for non-on-chain

    # User reference — exactly one of these must be set
    user_id: Optional[int] = None
    new_user: Optional[NewUserPayload] = None

    # Admin acknowledges discrepancies (on-chain only)
    accept_amount_mismatch: bool = False
    accept_wallet_not_in_pool: bool = False

    # Override payment date (defaults to on-chain TX timestamp, else now).
    # ISO 8601 date string e.g. "2026-05-14" — time is set to 00:00 UTC.
    payment_date_override: Optional[str] = None

    @validator("tx_hash")
    def lower_hash(cls, v):
        return v.lower() if v else v

    @validator("payment_date_override")
    def validate_payment_date(cls, v):
        if v is None or v == "":
            return None
        try:
            # Accept "YYYY-MM-DD" or full ISO 8601
            if len(v) == 10:
                datetime.strptime(v, "%Y-%m-%d")
            else:
                datetime.fromisoformat(v.replace("Z", "+00:00"))
            return v
        except ValueError:
            raise ValueError("payment_date_override must be YYYY-MM-DD or ISO 8601")


# ════════════════════════════════════════════════════════════════════
# Serialize / hydrate helpers (unchanged from v3)
# ════════════════════════════════════════════════════════════════════

def _serialize_row(payment, user, plan, include_bscscan=False, wallet_map=None):
    is_stale = False
    age_hours = None
    if payment.status == 'pending' and payment.created_at:
        delta = datetime.now(timezone.utc) - payment.created_at
        age_hours = round(delta.total_seconds() / 3600, 1)
        is_stale = age_hours > 24

    is_expired = False
    if payment.expires_at and payment.status == 'pending':
        is_expired = datetime.now(timezone.utc) > payment.expires_at

    user_dict = None
    if user:
        user_dict = {
            "id": user.id,
            "username": getattr(user, 'username', None),
            "email": getattr(user, 'email', None),
            "role": getattr(user, 'role', None),
            "avatar_url": getattr(user, 'avatar_url', None),
            "subscription_source": getattr(user, 'subscription_source', None),
        }

    plan_dict = None
    if plan:
        plan_dict = {
            "id": plan.id,
            "name": getattr(plan, 'name', None),
            "label": getattr(plan, 'label', None),
            "duration_days": getattr(plan, 'duration_days', None),
        }

    wallet_info = (wallet_map or {}).get(payment.wallet_to) if payment.wallet_to else None
    wallet_to_exchange = wallet_info.get("exchange_name") if wallet_info else None
    wallet_to_label = wallet_info.get("label") if wallet_info else None

    d = {
        "id": payment.id,
        "user_id": payment.user_id,
        "user": user_dict,
        "plan_id": payment.plan_id,
        "plan": plan_dict,
        "amount_usdt": float(payment.amount_usdt or 0),
        "discount_amount": float(payment.discount_amount or 0),
        "credit_redeemed": float(payment.credit_redeemed or 0),
        "final_amount": float(payment.final_amount or payment.amount_usdt or 0),
        "status": payment.status,
        "tx_hash": payment.tx_hash,
        "wallet_from": payment.wallet_from,
        "wallet_to": payment.wallet_to,
        "wallet_to_exchange": wallet_to_exchange,
        "wallet_to_label": wallet_to_label,
        "network": payment.network,
        "method": getattr(payment, "method", None),
        "reference": getattr(payment, "reference", None),
        "paid_currency": getattr(payment, "paid_currency", None),
        "paid_amount": float(payment.paid_amount) if getattr(payment, "paid_amount", None) is not None else None,
        "fx_rate": float(payment.fx_rate) if getattr(payment, "fx_rate", None) is not None else None,
        "verified_at": payment.verified_at,
        "expires_at": payment.expires_at,
        "notes": payment.notes,
        "created_at": payment.created_at,
        "updated_at": payment.updated_at,
        "deleted_at": payment.deleted_at,
        "is_deleted": payment.deleted_at is not None,
        "is_stale": is_stale,
        "age_hours": age_hours,
        "is_expired": is_expired,
        # v4: surface payment source so frontend can show MANUAL badge
        "is_manual": user.subscription_source == 'manual_admin_record' if user else False,
    }

    if include_bscscan:
        d["bscscan_data"] = payment.bscscan_data

    return d


def _build_wallet_map(db: Session, addresses: list) -> dict:
    if not addresses:
        return {}
    rows = db.query(ReceivingWallet).filter(
        ReceivingWallet.address.in_(addresses)
    ).all()
    return {
        w.address: {"exchange_name": w.exchange_name, "label": w.label}
        for w in rows
    }


def _hydrate(db: Session, payments: list) -> list:
    if not payments:
        return []
    user_ids = list({p.user_id for p in payments if p.user_id is not None})
    plan_ids = list({p.plan_id for p in payments if p.plan_id is not None})
    wallet_addrs = list({p.wallet_to for p in payments if p.wallet_to})

    users_map = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        users_map = {u.id: u for u in users}

    plans_map = {}
    if plan_ids:
        plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.id.in_(plan_ids)).all()
        plans_map = {p.id: p for p in plans}

    wallet_map = _build_wallet_map(db, wallet_addrs)

    return [
        _serialize_row(
            p,
            users_map.get(p.user_id),
            plans_map.get(p.plan_id),
            wallet_map=wallet_map,
        )
        for p in payments
    ]


# ════════════════════════════════════════════════════════════════════
# STATS
# ════════════════════════════════════════════════════════════════════

@router.get("/stats")
def finance_stats(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(hours=24)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    active = Payment.deleted_at.is_(None)
    total_revenue = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', active).scalar() or 0
    revenue_this_month = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', active, Payment.verified_at >= month_start).scalar() or 0
    revenue_today = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', active, Payment.verified_at >= today_start).scalar() or 0
    pending_count = db.query(Payment).filter(Payment.status == 'pending', active).count()
    pending_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending', active).scalar() or 0
    stale_count = db.query(Payment).filter(Payment.status == 'pending', active, Payment.created_at < stale_cutoff).count()
    stale_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending', active, Payment.created_at < stale_cutoff).scalar() or 0
    failed_count = db.query(Payment).filter(Payment.status == 'failed', active).count()
    failed_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'failed', active).scalar() or 0
    cancelled_count = db.query(Payment).filter(Payment.status == 'cancelled', active).count()
    total_count = db.query(Payment).filter(active).count()
    total_credit_redeemed = db.query(func.coalesce(func.sum(Payment.credit_redeemed), 0)).filter(Payment.status == 'confirmed', active).scalar() or 0

    return {
        "total_revenue": float(total_revenue),
        "revenue_this_month": float(revenue_this_month),
        "revenue_today": float(revenue_today),
        "pending_count": pending_count,
        "pending_value": float(pending_value),
        "stale_count": stale_count,
        "stale_value": float(stale_value),
        "failed_count": failed_count,
        "failed_value": float(failed_value),
        "cancelled_count": cancelled_count,
        "total_count": total_count,
        "total_credit_redeemed": float(total_credit_redeemed),
    }


# ════════════════════════════════════════════════════════════════════
# EXCHANGES
# ════════════════════════════════════════════════════════════════════

@router.get("/exchanges")
def list_exchanges(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Distinct exchange names from the receiving wallet pool."""
    rows = db.query(ReceivingWallet.exchange_name).filter(
        ReceivingWallet.is_active == True  # noqa: E712
    ).distinct().all()
    exchanges = sorted({r[0] for r in rows if r[0]})
    return {"exchanges": exchanges}


# ════════════════════════════════════════════════════════════════════
# PLANS — for manual-payment plan picker
# ════════════════════════════════════════════════════════════════════

@router.get("/plans")
def list_plans(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """All subscription plans (for admin manual-payment picker)."""
    plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.price_usdt).all()
    return {
        "plans": [
            {
                "id": p.id,
                "name": p.name,
                "label": p.label,
                "price_usdt": float(p.price_usdt or 0),
                "duration_days": p.duration_days,
                "is_lifetime": p.duration_days is None or p.duration_days == 0,
            }
            for p in plans
        ]
    }


# ════════════════════════════════════════════════════════════════════
# USER SEARCH — for manual-payment "link to existing" picker
# ════════════════════════════════════════════════════════════════════

@router.get("/user-search")
def search_users(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Search users for the manual-payment user picker."""
    like = f"%{q.strip()}%"
    rows = (
        db.query(User)
        .filter(or_(
            User.username.ilike(like),
            User.email.ilike(like),
            User.telegram_username.ilike(like),
        ))
        .order_by(User.created_at.desc())
        .limit(10)
        .all()
    )
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "auth_provider": u.auth_provider,
                "telegram_username": u.telegram_username,
                "avatar_url": u.avatar_url,
            }
            for u in rows
        ]
    }


# ════════════════════════════════════════════════════════════════════
# VERIFY TX — preview before recording (no DB writes)
# ════════════════════════════════════════════════════════════════════

@router.post("/verify-tx")
async def verify_tx(
    data: VerifyTxPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Inspect a TX hash on BSC without committing anything.

    Returns: tx_data + warnings/blockers + smart suggestions
    (matching plan by amount, previous user for the wallet, etc).
    """
    tx_hash = data.tx_hash

    # Build pool address set for membership check
    pool_rows = db.query(ReceivingWallet.address, ReceivingWallet.exchange_name).all()
    pool_set = {addr.lower() for (addr, _) in pool_rows if addr}
    addr_to_exchange = {addr.lower(): name for (addr, name) in pool_rows if addr}

    # 1. Check duplicate locally first (don't hit BSC if we already have this TX)
    existing = db.query(Payment).filter(Payment.tx_hash == tx_hash).first()

    # 2. Hit BSC
    details = await fetch_tx_details(tx_hash, valid_pool_addresses=pool_set)

    warnings = []
    blockers = []

    # Pool / exchange resolution
    exchange_name = None
    if details.get("to"):
        exchange_name = addr_to_exchange.get(details["to"].lower())

    # ─── Blockers (hard rejects) ───
    if details.get("error"):
        blockers.append({"code": "fetch_error", "message": details["error"]})
        return {
            "tx_data": details,
            "warnings": warnings,
            "blockers": blockers,
            "exchange_name": exchange_name,
            "existing_payment_id": existing.id if existing else None,
            "suggested_plan_id": None,
            "suggested_user_id": None,
        }

    if details.get("status") == "failed":
        blockers.append({"code": "tx_failed", "message": "Transaction failed (reverted) on chain."})
    if not details.get("is_usdt"):
        blockers.append({"code": "not_usdt", "message": "Transaction is not a USDT (BEP-20) transfer."})
    if existing:
        blockers.append({
            "code": "duplicate_tx",
            "message": f"This TX hash is already recorded as payment #{existing.id} (status: {existing.status}).",
        })

    # ─── Warnings (soft, admin can override) ───
    if details.get("in_pool") is False:
        warnings.append({
            "code": "wallet_not_in_pool",
            "message": f"Recipient wallet {details.get('to')} is not in the receiving_wallets pool.",
        })

    if details.get("confirmations") is not None and details["confirmations"] < MIN_CONFIRMATIONS_WARN:
        warnings.append({
            "code": "low_confirmations",
            "message": f"Only {details['confirmations']} confirmations (min recommended: {MIN_CONFIRMATIONS_WARN}).",
        })

    if details.get("timestamp"):
        tx_time = datetime.fromisoformat(details["timestamp"])
        age_days = (datetime.now(timezone.utc) - tx_time).days
        if age_days > OLD_TX_WARN_DAYS:
            warnings.append({
                "code": "old_tx",
                "message": f"Transaction is {age_days} days old. Double-check with the user.",
            })

    # ─── Smart suggestions ───
    suggested_plan_id = None
    suggested_user_id = None
    amount_str = details.get("amount")

    if amount_str:
        amt = Decimal(amount_str)
        # Find plan with closest matching price
        plans = db.query(SubscriptionPlan).all()
        best_plan = None
        best_diff = None
        for p in plans:
            diff = abs(Decimal(p.price_usdt or 0) - amt)
            if best_diff is None or diff < best_diff:
                best_diff = diff
                best_plan = p
        if best_plan and best_diff is not None and best_diff <= AMOUNT_TOLERANCE:
            suggested_plan_id = best_plan.id

    # If wallet_from has paid before, suggest that user
    from_addr = details.get("from")
    if from_addr:
        prev = (
            db.query(Payment)
            .filter(
                Payment.wallet_from.ilike(from_addr),
                Payment.user_id != None,  # noqa: E711
                Payment.status.in_(["confirmed", "pending"]),
            )
            .order_by(Payment.created_at.desc())
            .first()
        )
        if prev:
            suggested_user_id = prev.user_id

    return {
        "tx_data": details,
        "warnings": warnings,
        "blockers": blockers,
        "exchange_name": exchange_name,
        "existing_payment_id": existing.id if existing else None,
        "suggested_plan_id": suggested_plan_id,
        "suggested_user_id": suggested_user_id,
    }


# ════════════════════════════════════════════════════════════════════
# MANUAL PAYMENT — actual create
# ════════════════════════════════════════════════════════════════════

@router.post("/manual-payment")
async def create_manual_payment(
    data: ManualPaymentPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Record a manually-paid subscription.

    Methods (data.method):
      - onchain_bsc   : paste a BSC TX hash; backend re-verifies on-chain (default).
      - binance_uid   : off-chain Binance internal transfer; no verification.
      - bank_transfer : fiat bank transfer (e.g. BCA). paid_amount/paid_currency/fx_rate
                        capture the original payment; final_amount stored in USD.
      - other         : any other rail (free-text label in method_label).

    For non-on-chain methods there is NO chain verification — it is a
    trust-based admin record (admin confirms funds arrived). Subscription
    is granted identically regardless of method.
    """
    is_onchain = (data.method == "onchain_bsc")

    # ─── Validate user selector ───
    if (data.user_id is None) == (data.new_user is None):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of user_id (existing) or new_user (create).",
        )

    # ─── Validate plan ───
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")

    plan_price = Decimal(plan.price_usdt or 0)
    details = None  # on-chain inspection result (None for off-chain methods)

    if is_onchain:
        if not data.tx_hash:
            raise HTTPException(status_code=400, detail="tx_hash is required for on-chain payments.")

        # ─── Re-verify TX on chain ───
        pool_rows = db.query(ReceivingWallet.address).all()
        pool_set = {addr.lower() for (addr,) in pool_rows if addr}
        details = await fetch_tx_details(data.tx_hash, valid_pool_addresses=pool_set)

        if details.get("error"):
            raise HTTPException(status_code=400, detail=details["error"])
        if details.get("status") != "success":
            raise HTTPException(status_code=400, detail="TX did not succeed on chain.")
        if not details.get("is_usdt"):
            raise HTTPException(status_code=400, detail="TX is not a USDT transfer.")

        # Duplicate check
        existing = db.query(Payment).filter(Payment.tx_hash == data.tx_hash).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"This TX hash is already recorded (payment #{existing.id}).",
            )

        # Pool check — admin must explicitly accept if wallet not in pool
        if details.get("in_pool") is False and not data.accept_wallet_not_in_pool:
            raise HTTPException(
                status_code=400,
                detail="Recipient wallet is not in pool. Set accept_wallet_not_in_pool=true to override.",
            )

        # Amount check — admin must explicitly accept if amount differs from plan
        tx_amount = Decimal(details["amount"])
        amount_diff = abs(tx_amount - plan_price)
        if amount_diff > AMOUNT_TOLERANCE and not data.accept_amount_mismatch:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Amount mismatch: TX is {tx_amount} USDT, plan price is {plan_price} USDT. "
                    f"Set accept_amount_mismatch=true to override."
                ),
            )
    else:
        # ─── Off-chain method (binance_uid / bank_transfer / other) ───
        # No chain verification. USD value comes from the admin (already
        # converted client-side for bank transfers via live FX rate).
        if data.amount_usd is None:
            raise HTTPException(
                status_code=400,
                detail="amount_usd is required for non-on-chain payments.",
            )
        tx_amount = Decimal(str(data.amount_usd))   # USD value actually received
        amount_diff = abs(tx_amount - plan_price)

    # ─── Resolve user (existing or create new) ───
    now = datetime.now(timezone.utc)

    if data.user_id is not None:
        user = db.query(User).filter(User.id == data.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
        user_was_new = False
    else:
        # Create new manual user
        new_data = data.new_user

        # Username conflict
        existing_u = db.query(User).filter(User.username == new_data.username).first()
        if existing_u:
            raise HTTPException(status_code=409, detail=f"Username @{new_data.username} already exists.")

        # Email — use provided or generate dummy
        if new_data.email:
            email = str(new_data.email).lower()
            if db.query(User).filter(User.email == email).first():
                raise HTTPException(status_code=409, detail="Email already used by another account.")
        else:
            email = f"manual_{new_data.username.lower()}@{MANUAL_EMAIL_DOMAIN}"
            # Ensure uniqueness of generated email
            if db.query(User).filter(User.email == email).first():
                raise HTTPException(
                    status_code=409,
                    detail=f"Generated email collision ({email}). Provide a real email instead.",
                )

        user = User(
            username=new_data.username,
            email=email,
            password_hash=None,
            is_active=True,
            is_verified=False,
            auth_provider="manual",
            role="free",
        )
        # Optional contact channels
        if new_data.telegram_username:
            user.admin_telegram_username = new_data.telegram_username.strip().lstrip("@")
        if new_data.discord_handle:
            user.admin_discord_handle = new_data.discord_handle.strip()
        if new_data.telegram_username or new_data.discord_handle:
            user.admin_enriched_by = admin.id
            user.admin_enriched_at = now

        db.add(user)
        db.flush()  # populate user.id without committing yet
        user_was_new = True

    # ─── Compute effective payment date ───
    # Priority: admin override > on-chain TX timestamp > now
    tx_time = (
        datetime.fromisoformat(details["timestamp"])
        if (details and details.get("timestamp")) else now
    )
    if data.payment_date_override:
        v = data.payment_date_override
        if len(v) == 10:
            effective_date = datetime.strptime(v, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        else:
            effective_date = datetime.fromisoformat(v.replace("Z", "+00:00"))
            if effective_date.tzinfo is None:
                effective_date = effective_date.replace(tzinfo=timezone.utc)
        payment_date_was_overridden = True
    else:
        effective_date = tx_time
        payment_date_was_overridden = False

    # ─── Compute new expiration (stack on existing if still active) ───
    is_lifetime = plan.duration_days is None or plan.duration_days == 0
    if is_lifetime:
        new_expires_at = None
    else:
        existing_exp = getattr(user, "subscription_expires_at", None)
        base = (
            existing_exp
            if (existing_exp and existing_exp > effective_date)
            else effective_date
        )
        new_expires_at = base + timedelta(days=plan.duration_days)

    # ─── Method display label (for audit note) ───
    _method_labels = {
        "onchain_bsc": "On-chain (BSC)",
        "binance_uid": "Binance UID",
        "bank_transfer": "Bank Transfer",
        "other": (data.method_label or "Other"),
    }
    method_display = _method_labels.get(data.method, data.method)

    # ─── Build audit-trail note ───
    amount_delta_label = ""
    if tx_amount > plan_price:
        amount_delta_label = f" (+{tx_amount - plan_price} over)"
    elif tx_amount < plan_price:
        amount_delta_label = f" (-{plan_price - tx_amount} under)"

    audit_lines = [
        f"[Manual payment recorded by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]",
        f"  Method: {method_display}",
    ]
    if is_onchain:
        tx_time_str = details.get("timestamp") or now.isoformat()
        audit_lines.append(f"  TX: {data.tx_hash}")
        audit_lines.append(f"  Amount on-chain: {tx_amount} USDT")
        audit_lines.append(f"  TX time: {tx_time_str}")
    else:
        if data.paid_amount is not None and data.paid_currency and data.paid_currency.upper() != "USD":
            _rate = f" @ {data.fx_rate}" if data.fx_rate is not None else ""
            audit_lines.append(f"  Paid: {data.paid_amount} {data.paid_currency.upper()}{_rate} = ${tx_amount}")
        else:
            audit_lines.append(f"  Amount: ${tx_amount}")
        if data.reference:
            audit_lines.append(f"  Reference: {data.reference}")
    audit_lines.append(f"  Plan price: {plan_price} USDT{amount_delta_label}")
    if payment_date_was_overridden:
        audit_lines.append(
            f"  \U0001F4C5 Payment date set by admin: {effective_date.strftime('%Y-%m-%d')}"
        )
    audit_lines.append(
        f"  Subscription expires: "
        f"{new_expires_at.strftime('%Y-%m-%d') if new_expires_at else 'lifetime'}"
    )
    if user_was_new:
        audit_lines.append(f"  User created: @{user.username} (auth_provider=manual)")
    if is_onchain and data.accept_amount_mismatch and amount_diff > AMOUNT_TOLERANCE:
        audit_lines.append(f"  \u26A0 Amount mismatch accepted by admin")
    if is_onchain and data.accept_wallet_not_in_pool and details.get("in_pool") is False:
        audit_lines.append(f"  \u26A0 Out-of-pool wallet ({details.get('to')}) accepted by admin")
    audit_lines.append(f"  Admin reason: {data.admin_note.strip()}")
    audit_note = "\n".join(audit_lines)

    # ─── Financial decomposition (hybrid) ───
    #   amount_usdt   = plan price (nominal billed)
    #   final_amount  = USD actually received (on-chain amount, or admin USD value)
    #   discount_amount = signed delta so amount_usdt - discount_amount = final_amount
    discount_amount = plan_price - tx_amount

    # ─── Currency/amount to persist for audit ───
    if is_onchain:
        store_currency = "USDT"
        store_paid_amount = tx_amount
        store_fx_rate = None
    else:
        store_currency = (data.paid_currency or "USD").upper()
        store_paid_amount = data.paid_amount if data.paid_amount is not None else tx_amount
        store_fx_rate = data.fx_rate

    # reference: for "other" fall back to the custom label if no explicit ref
    store_reference = data.reference or (data.method_label if data.method == "other" else None)

    # ─── Create payment row ───
    payment = Payment(
        user_id=user.id,
        plan_id=plan.id,
        amount_usdt=plan_price,
        discount_amount=discount_amount,
        credit_redeemed=Decimal("0"),
        final_amount=tx_amount,
        status="confirmed",
        tx_hash=(data.tx_hash if is_onchain else None),
        wallet_from=(details.get("from") if is_onchain else None),
        wallet_to=(details.get("to") if is_onchain else None),
        network=("BSC" if is_onchain else None),
        verified_at=effective_date,
        notes=audit_note,
        bscscan_data=(details if is_onchain else None),
        method=data.method,
        reference=store_reference,
        paid_currency=store_currency,
        paid_amount=store_paid_amount,
        fx_rate=store_fx_rate,
    )
    db.add(payment)

    # ─── Grant subscription ───
    user.role = "subscriber"
    user.subscription_expires_at = new_expires_at
    if hasattr(user, "subscription_granted_by"):
        user.subscription_granted_by = admin.id
    if hasattr(user, "subscription_granted_at"):
        user.subscription_granted_at = now
    if hasattr(user, "subscription_source"):
        user.subscription_source = "manual_admin_record"
    if hasattr(user, "subscription_note"):
        user.subscription_note = f"Manual plan: {plan.label}"

    db.commit()
    db.refresh(payment)
    db.refresh(user)

    logger.info(
        f"\u2705 Manual payment #{payment.id} ({data.method}) recorded by admin @{admin.username} "
        f"for user @{user.username} ({'NEW' if user_was_new else 'existing'}) \u2014 "
        f"plan {plan.label} (${plan_price})"
    )

    wallet_map = _build_wallet_map(db, [payment.wallet_to] if payment.wallet_to else [])

    return {
        "success": True,
        "message": f"Manual payment #{payment.id} recorded for @{user.username}.",
        "payment": _serialize_row(payment, user, plan, wallet_map=wallet_map),
        "user_was_created": user_was_new,
    }


# ════════════════════════════════════════════════════════════════════
# LIST — with manual filter support
# ════════════════════════════════════════════════════════════════════

@router.get("/payments")
def list_payments(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    exchange: Optional[str] = Query(None),
    source: Optional[Literal["manual", "auto"]] = Query(None),
    only_stale: bool = Query(False),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(Payment)

    # Soft-delete: 'voided' shows deleted rows; every other view hides them.
    if status == 'voided':
        q = q.filter(Payment.deleted_at.isnot(None))
    else:
        q = q.filter(Payment.deleted_at.is_(None))

    if status and status != 'voided':
        if status == 'stale':
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            q = q.filter(Payment.status == 'pending', Payment.created_at < cutoff)
        else:
            q = q.filter(Payment.status == status)

    if only_stale:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        q = q.filter(Payment.status == 'pending', Payment.created_at < cutoff)

    if user_id:
        q = q.filter(Payment.user_id == user_id)

    if exchange:
        matching_addrs = [
            row[0] for row in db.query(ReceivingWallet.address).filter(
                ReceivingWallet.exchange_name == exchange
            ).all()
        ]
        if matching_addrs:
            q = q.filter(Payment.wallet_to.in_(matching_addrs))
        else:
            q = q.filter(Payment.id == -1)

    if source:
        # source uses User.subscription_source as proxy. Join needed.
        q = q.join(User, User.id == Payment.user_id)
        if source == "manual":
            q = q.filter(User.subscription_source == "manual_admin_record")
        elif source == "auto":
            q = q.filter(or_(
                User.subscription_source != "manual_admin_record",
                User.subscription_source == None,  # noqa: E711
            ))

    if search:
        like = f"%{search}%"
        # Avoid double-join with the source filter above
        if not source:
            q = q.join(User, User.id == Payment.user_id)
        q = q.filter(or_(
            User.username.ilike(like),
            User.email.ilike(like),
            Payment.tx_hash.ilike(like),
            Payment.wallet_from.ilike(like),
        ))

    sort_col_map = {
        'created_at': Payment.created_at,
        'amount': Payment.final_amount,
        'verified_at': Payment.verified_at,
    }
    sort_col = sort_col_map.get(sort_by, Payment.created_at)
    if sort_order == 'desc':
        q = q.order_by(desc(sort_col).nullslast())
    else:
        q = q.order_by(sort_col.asc().nullslast())

    total = q.count()
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

    payments = q.offset((page - 1) * page_size).limit(page_size).all()
    items = _hydrate(db, payments)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ════════════════════════════════════════════════════════════════════
# DETAIL
# ════════════════════════════════════════════════════════════════════

@router.get("/payments/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    user = db.query(User).filter(User.id == p.user_id).first() if p.user_id else None
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None

    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])

    return _serialize_row(p, user, plan, include_bscscan=True, wallet_map=wallet_map)


# ════════════════════════════════════════════════════════════════════
# APPROVE / FAIL / CANCEL / REFUND / NOTE / BULK — unchanged from v3
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: int,
    data: PaymentActionPayload = PaymentActionPayload(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    if p.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Only pending payments can be approved. Current status: {p.status}")

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None

    if not user:
        raise HTTPException(status_code=400, detail="Associated user not found")

    now = datetime.now(timezone.utc)
    p.status = 'confirmed'
    p.verified_at = now

    admin_note = f"[Manual approve by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    duration_days = getattr(plan, 'duration_days', None) if plan else None
    is_lifetime = plan and (duration_days is None or duration_days == 0 or getattr(plan, 'is_lifetime', False))

    if is_lifetime:
        new_expires_at = None
    elif duration_days:
        existing = getattr(user, 'subscription_expires_at', None)
        base = existing if (existing and existing > now) else now
        new_expires_at = base + timedelta(days=duration_days)
    else:
        new_expires_at = now + timedelta(days=30)

    user.role = 'subscriber'
    if hasattr(user, 'subscription_expires_at'):
        user.subscription_expires_at = new_expires_at
    if hasattr(user, 'subscription_granted_by'):
        user.subscription_granted_by = admin.id
    if hasattr(user, 'subscription_granted_at'):
        user.subscription_granted_at = now
    if hasattr(user, 'subscription_source'):
        user.subscription_source = 'admin_approve'

    db.commit()
    db.refresh(p)

    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])

    return {
        "success": True,
        "message": f"Payment #{p.id} approved. User @{user.username} subscription extended.",
        "payment": _serialize_row(p, user, plan, wallet_map=wallet_map),
    }


@router.post("/payments/{payment_id}/mark-failed")
def mark_payment_failed(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Only pending payments can be marked failed. Current status: {p.status}")

    now = datetime.now(timezone.utc)
    p.status = 'failed'
    admin_note = f"[Marked failed by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} marked as failed", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/{payment_id}/cancel")
def cancel_payment(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Only pending payments can be cancelled. Current status: {p.status}")

    now = datetime.now(timezone.utc)
    p.status = 'cancelled'
    admin_note = f"[Cancelled by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} cancelled", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/{payment_id}/refund")
def refund_payment(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.status != 'confirmed':
        raise HTTPException(status_code=400, detail=f"Only confirmed payments can be refunded. Current status: {p.status}")

    now = datetime.now(timezone.utc)
    p.status = 'refunded'
    admin_note = f"[Refunded by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    else:
        admin_note += " — manual USDT refund via wallet required separately."
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    user = db.query(User).filter(User.id == p.user_id).first()
    if user:
        user.role = 'free'
        if hasattr(user, 'subscription_expires_at'):
            user.subscription_expires_at = None

    db.commit()
    db.refresh(p)

    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} flagged as refunded. Manual USDT refund required.", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/{payment_id}/note")
def add_payment_note(payment_id: int, data: PaymentNotePayload, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    now = datetime.now(timezone.utc)
    note = f"[Note by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}] {data.note.strip()}"
    p.notes = f"{p.notes}\n{note}" if p.notes else note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": "Note added", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/bulk-cancel-stale")
def bulk_cancel_stale(hours: int = Query(24, ge=1), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)

    stale = db.query(Payment).filter(Payment.status == 'pending', Payment.created_at < cutoff).all()
    count = len(stale)
    if count == 0:
        return {"success": True, "cancelled": 0, "message": "No stale payments found"}

    admin_note = f"[Bulk cancelled by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}] Auto-cancel stale > {hours}h"
    for p in stale:
        p.status = 'cancelled'
        p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    return {"success": True, "cancelled": count, "message": f"Cancelled {count} stale payment(s) older than {hours}h"}


# ════════════════════════════════════════════════════════════════════
# VOID / RESTORE / DELETE  (dummy & test-data cleanup)
#   void    = soft delete (hidden from list, recoverable)
#   restore = un-void
#   DELETE  = hard delete (row removed permanently)
# None of these touch the user's subscription/role.
# ════════════════════════════════════════════════════════════════════

@router.post("/payments/{payment_id}/void")
def void_payment(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Soft-delete: hide from the finance list but keep the row (recoverable)."""
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Payment is already voided")

    now = datetime.now(timezone.utc)
    p.deleted_at = now
    admin_note = f"[Voided by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} voided (hidden, recoverable)", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.post("/payments/{payment_id}/restore")
def restore_payment(payment_id: int, data: PaymentActionPayload = PaymentActionPayload(), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Restore a voided payment back into the finance list."""
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.deleted_at is None:
        raise HTTPException(status_code=400, detail="Payment is not voided")

    now = datetime.now(timezone.utc)
    p.deleted_at = None
    admin_note = f"[Restored by @{admin.username} on {now.strftime('%Y-%m-%d %H:%M UTC')}]"
    if data.note:
        admin_note += f" {data.note.strip()}"
    p.notes = f"{p.notes}\n{admin_note}" if p.notes else admin_note

    db.commit()
    db.refresh(p)

    user = db.query(User).filter(User.id == p.user_id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == p.plan_id).first() if p.plan_id else None
    wallet_map = _build_wallet_map(db, [p.wallet_to] if p.wallet_to else [])
    return {"success": True, "message": f"Payment #{p.id} restored", "payment": _serialize_row(p, user, plan, wallet_map=wallet_map)}


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Permanently delete a payment row. Irreversible. Does NOT touch the user's subscription."""
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    pid = p.id
    logger.warning(f"🗑️ Payment #{pid} permanently deleted by @{admin.username}")
    db.delete(p)
    db.commit()

    return {"success": True, "message": f"Payment #{pid} permanently deleted", "deleted_id": pid}
