#!/usr/bin/env python3
"""
Batch: Payment void / restore / permanent-delete (backend).

Patches (idempotent):
  app/models/subscription.py   -> Payment.deleted_at column
  app/api/routes/finance.py    -> serialize is_deleted/deleted_at
                                  list_payments soft-delete filter (+ 'voided' view)
                                  finance_stats excludes voided rows
                                  3 new endpoints: void / restore / DELETE

Usage:
    python3 apply_delete_payment_backend.py app
"""
import sys
import os

APP = sys.argv[1] if len(sys.argv) > 1 else "app"

MODEL = os.path.join(APP, "models", "subscription.py")
FIN = os.path.join(APP, "api", "routes", "finance.py")

changed = []
skipped = []


def patch(path, old, new, marker):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    if marker in src:
        skipped.append(f"{path}: {marker!r} already present")
        return
    if old not in src:
        raise SystemExit(f"ANCHOR NOT FOUND in {path} for marker {marker!r}\n--- expected anchor ---\n{old}")
    if src.count(old) != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({src.count(old)}x) in {path} for marker {marker!r}")
    src = src.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    changed.append(f"{path}: {marker}")


def append(path, block, marker):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    if marker in src:
        skipped.append(f"{path}: {marker!r} already present")
        return
    if not src.endswith("\n"):
        src += "\n"
    src += block
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    changed.append(f"{path}: {marker} (appended)")


# ── 1. Model: deleted_at column ─────────────────────────────────────
patch(
    MODEL,
    old=(
        "    bscscan_data = Column(JSONB, nullable=True)\n"
        "    notes = Column(Text, nullable=True)\n"
    ),
    new=(
        "    bscscan_data = Column(JSONB, nullable=True)\n"
        "    notes = Column(Text, nullable=True)\n"
        "\n"
        "    # Soft-delete (void). NULL = active; set = hidden from finance list, recoverable.\n"
        "    deleted_at = Column(DateTime(timezone=True), nullable=True)\n"
    ),
    marker="# Soft-delete (void). NULL = active",
)

# ── 2. finance.py: serialize is_deleted / deleted_at ────────────────
patch(
    FIN,
    old=(
        '        "updated_at": payment.updated_at,\n'
        '        "is_stale": is_stale,\n'
    ),
    new=(
        '        "updated_at": payment.updated_at,\n'
        '        "deleted_at": payment.deleted_at,\n'
        '        "is_deleted": payment.deleted_at is not None,\n'
        '        "is_stale": is_stale,\n'
    ),
    marker='"is_deleted": payment.deleted_at is not None',
)

# ── 3. finance.py: list_payments soft-delete filter + 'voided' view ──
patch(
    FIN,
    old=(
        "    q = db.query(Payment)\n"
        "\n"
        "    if status:\n"
        "        if status == 'stale':\n"
    ),
    new=(
        "    q = db.query(Payment)\n"
        "\n"
        "    # Soft-delete: 'voided' shows deleted rows; every other view hides them.\n"
        "    if status == 'voided':\n"
        "        q = q.filter(Payment.deleted_at.isnot(None))\n"
        "    else:\n"
        "        q = q.filter(Payment.deleted_at.is_(None))\n"
        "\n"
        "    if status and status != 'voided':\n"
        "        if status == 'stale':\n"
    ),
    marker="if status == 'voided':",
)

# ── 4. finance.py: finance_stats excludes voided ────────────────────
patch(
    FIN,
    old=(
        "    total_revenue = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed').scalar() or 0\n"
        "    revenue_this_month = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', Payment.verified_at >= month_start).scalar() or 0\n"
        "    revenue_today = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', Payment.verified_at >= today_start).scalar() or 0\n"
        "    pending_count = db.query(Payment).filter(Payment.status == 'pending').count()\n"
        "    pending_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending').scalar() or 0\n"
        "    stale_count = db.query(Payment).filter(Payment.status == 'pending', Payment.created_at < stale_cutoff).count()\n"
        "    stale_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending', Payment.created_at < stale_cutoff).scalar() or 0\n"
        "    failed_count = db.query(Payment).filter(Payment.status == 'failed').count()\n"
        "    failed_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'failed').scalar() or 0\n"
        "    cancelled_count = db.query(Payment).filter(Payment.status == 'cancelled').count()\n"
        "    total_count = db.query(Payment).count()\n"
        "    total_credit_redeemed = db.query(func.coalesce(func.sum(Payment.credit_redeemed), 0)).filter(Payment.status == 'confirmed').scalar() or 0\n"
    ),
    new=(
        "    active = Payment.deleted_at.is_(None)\n"
        "    total_revenue = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', active).scalar() or 0\n"
        "    revenue_this_month = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', active, Payment.verified_at >= month_start).scalar() or 0\n"
        "    revenue_today = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'confirmed', active, Payment.verified_at >= today_start).scalar() or 0\n"
        "    pending_count = db.query(Payment).filter(Payment.status == 'pending', active).count()\n"
        "    pending_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending', active).scalar() or 0\n"
        "    stale_count = db.query(Payment).filter(Payment.status == 'pending', active, Payment.created_at < stale_cutoff).count()\n"
        "    stale_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'pending', active, Payment.created_at < stale_cutoff).scalar() or 0\n"
        "    failed_count = db.query(Payment).filter(Payment.status == 'failed', active).count()\n"
        "    failed_value = db.query(func.coalesce(func.sum(Payment.final_amount), 0)).filter(Payment.status == 'failed', active).scalar() or 0\n"
        "    cancelled_count = db.query(Payment).filter(Payment.status == 'cancelled', active).count()\n"
        "    total_count = db.query(Payment).filter(active).count()\n"
        "    total_credit_redeemed = db.query(func.coalesce(func.sum(Payment.credit_redeemed), 0)).filter(Payment.status == 'confirmed', active).scalar() or 0\n"
    ),
    marker="active = Payment.deleted_at.is_(None)",
)

# ── 5. finance.py: new endpoints (void / restore / delete) ──────────
ENDPOINTS = '''

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
    p.notes = f"{p.notes}\\n{admin_note}" if p.notes else admin_note

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
    p.notes = f"{p.notes}\\n{admin_note}" if p.notes else admin_note

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
    logger.warning(f"\U0001f5d1\ufe0f Payment #{pid} permanently deleted by @{admin.username}")
    db.delete(p)
    db.commit()

    return {"success": True, "message": f"Payment #{pid} permanently deleted", "deleted_id": pid}
'''

append(FIN, ENDPOINTS, marker="def void_payment(")

# ── Report ──────────────────────────────────────────────────────────
print("─" * 60)
for c in changed:
    print("✓", c)
for s in skipped:
    print("•", s)
print("─" * 60)
print(f"✓ Backend patches applied. ({len(changed)} changed, {len(skipped)} skipped)")
