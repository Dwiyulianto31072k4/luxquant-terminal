# backend/app/models/cashout.py
"""
CashoutRequest model — user requests for referral credit withdrawal.

Architecture: Hard Reserve
  - On request submit: balance immediately deducted (ledger type='cashout_pending')
  - On admin approve+send: status='completed' (ledger type='cashout_completed')
  - On admin reject: balance refunded (ledger type='refund')

Method: Telegram only (MVP) — admin contacts user via @username for fulfillment.
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, Numeric, Text, ForeignKey, CheckConstraint
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


# Status constants
STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_COMPLETED = "completed"
STATUS_REJECTED = "rejected"
STATUS_CANCELLED = "cancelled"

VALID_STATUSES = {
    STATUS_PENDING,
    STATUS_APPROVED,
    STATUS_COMPLETED,
    STATUS_REJECTED,
    STATUS_CANCELLED,
}

# Active statuses (balance is reserved, request blocking new ones)
ACTIVE_STATUSES = {STATUS_PENDING, STATUS_APPROVED}

# Terminal statuses (no more state changes allowed)
TERMINAL_STATUSES = {STATUS_COMPLETED, STATUS_REJECTED, STATUS_CANCELLED}


# Method constants
METHOD_TELEGRAM = "telegram_admin"
METHOD_USDT_BEP20 = "usdt_bep20"
METHOD_USDT_TRC20 = "usdt_trc20"
METHOD_BANK = "bank"
METHOD_OTHER = "other"

VALID_METHODS = {
    METHOD_TELEGRAM,
    METHOD_USDT_BEP20,
    METHOD_USDT_TRC20,
    METHOD_BANK,
    METHOD_OTHER,
}


class CashoutRequest(Base):
    """
    A user's request to withdraw their referral credit balance.

    Status lifecycle:
      pending → approved → completed   (happy path)
      pending → rejected               (admin denies, balance refunded)
      pending → cancelled              (user cancels, balance refunded)

    Balance reservation is "hard": balance is deducted immediately on request,
    refunded on rejection/cancellation. This prevents double-spend.
    """
    __tablename__ = "cashout_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Financial
    amount_usdt = Column(Numeric(10, 2), nullable=False)

    # Destination
    method = Column(String(30), nullable=False, default=METHOD_TELEGRAM)
    destination_telegram = Column(String(100), nullable=True)
    destination_note = Column(Text, nullable=True)

    # Status
    status = Column(String(20), nullable=False, default=STATUS_PENDING)

    # Admin handling
    admin_note = Column(Text, nullable=True)
    tx_hash = Column(String(100), nullable=True)

    # Audit timestamps
    requested_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    reviewed_by_admin_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Ledger linkage (full audit trail)
    ledger_reserve_id = Column(
        Integer,
        ForeignKey("credit_ledger.id", ondelete="SET NULL"),
        nullable=True,
    )
    ledger_final_id = Column(
        Integer,
        ForeignKey("credit_ledger.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Constraints (mirror DB CHECK)
    __table_args__ = (
        CheckConstraint(
            "amount_usdt > 0",
            name="chk_cashout_amount_positive",
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled')",
            name="chk_cashout_status",
        ),
        CheckConstraint(
            "method IN ('telegram_admin', 'usdt_bep20', 'usdt_trc20', 'bank', 'other')",
            name="chk_cashout_method",
        ),
    )

    # Relationships (lazy load)
    user = relationship("User", foreign_keys=[user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_admin_id])
    ledger_reserve = relationship("CreditLedger", foreign_keys=[ledger_reserve_id])
    ledger_final = relationship("CreditLedger", foreign_keys=[ledger_final_id])

    @property
    def is_active(self) -> bool:
        """True if request is still in flight (balance reserved)."""
        return self.status in ACTIVE_STATUSES

    @property
    def is_terminal(self) -> bool:
        """True if request has reached a final state."""
        return self.status in TERMINAL_STATUSES

    def __repr__(self):
        return (
            f"<CashoutRequest #{self.id} user={self.user_id} "
            f"{self.amount_usdt} {self.status} via {self.method}>"
        )
