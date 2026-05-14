# backend/app/models/credit.py
"""
Credit Ledger — audit trail untuk semua pergerakan referral_credit_usdt
di tabel users.

Setiap baris = satu transaksi credit (immutable audit log):

  EXISTING TYPES:
  - earn               : referrer dapat commission dari payment referee (+)
  - redeem             : user redeem credit buat potong invoice subscription (-)
  - adjust             : admin manual adjustment (bonus, koreksi) (+/-)
  - refund             : credit dikembaliin (mis. cashout di-reject) (+)

  NEW TYPES (Layer 8 — Cashout):
  - cashout_pending    : balance reserved saat user submit cashout request (-)
  - cashout_completed  : status marker setelah admin kirim funds (0 amount, informational)
  - referral_discount  : track discount 10% ke-apply ke invoice (0 amount, audit)
"""
from sqlalchemy import Column, Integer, String, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


# ════════════════════════════════════════════════
# Type constants
# ════════════════════════════════════════════════

# Layer 4 (commission & redemption)
LEDGER_TYPE_EARN = "earn"
LEDGER_TYPE_REDEEM = "redeem"
LEDGER_TYPE_ADJUST = "adjust"
LEDGER_TYPE_REFUND = "refund"

# Layer 8 (cashout & audit)
LEDGER_TYPE_CASHOUT_PENDING = "cashout_pending"
LEDGER_TYPE_CASHOUT_COMPLETED = "cashout_completed"
LEDGER_TYPE_REFERRAL_DISCOUNT = "referral_discount"

LEDGER_TYPES = [
    LEDGER_TYPE_EARN,
    LEDGER_TYPE_REDEEM,
    LEDGER_TYPE_ADJUST,
    LEDGER_TYPE_REFUND,
    LEDGER_TYPE_CASHOUT_PENDING,
    LEDGER_TYPE_CASHOUT_COMPLETED,
    LEDGER_TYPE_REFERRAL_DISCOUNT,
]

# Types that affect actual balance (must update users.referral_credit_usdt)
BALANCE_CHANGING_TYPES = {
    LEDGER_TYPE_EARN,            # +
    LEDGER_TYPE_REDEEM,          # -
    LEDGER_TYPE_ADJUST,          # +/-
    LEDGER_TYPE_REFUND,          # +
    LEDGER_TYPE_CASHOUT_PENDING, # -
}

# Types that are purely informational (audit only, amount=0)
AUDIT_ONLY_TYPES = {
    LEDGER_TYPE_CASHOUT_COMPLETED,
    LEDGER_TYPE_REFERRAL_DISCOUNT,
}


class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Positif = earn/refund (saldo nambah), negatif = redeem/cashout_pending (saldo berkurang)
    # Untuk audit-only types (cashout_completed, referral_discount), amount = 0
    amount = Column(Numeric(10, 2), nullable=False)

    # See LEDGER_TYPES above
    type = Column(String(20), nullable=False)

    # Optional refs untuk traceability
    ref_payment_id = Column(
        Integer,
        ForeignKey("payments.id", ondelete="SET NULL"),
        nullable=True,
    )
    ref_use_id = Column(
        Integer,
        ForeignKey("referral_uses.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Snapshot saldo SETELAH transaksi ini (untuk recovery + verification)
    balance_after = Column(Numeric(10, 2), nullable=False)

    note = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships (lazy load, ga eager join karena audit trail = high volume)
    user = relationship("User", foreign_keys=[user_id])

    @property
    def is_credit(self) -> bool:
        """True if amount adds to balance (positive flow)."""
        return float(self.amount) > 0

    @property
    def is_debit(self) -> bool:
        """True if amount subtracts from balance (negative flow)."""
        return float(self.amount) < 0

    @property
    def is_audit_only(self) -> bool:
        """True if entry is informational (amount=0, no balance change)."""
        return self.type in AUDIT_ONLY_TYPES

    def __repr__(self):
        sign = "+" if float(self.amount) >= 0 else ""
        return f"<CreditLedger user={self.user_id} {sign}{self.amount} type={self.type}>"
