# backend/app/models/credit.py
"""
Credit Ledger — audit trail untuk semua pergerakan referral_credit_usdt
di tabel users.

Setiap baris = satu transaksi credit:
  - earn   : referrer dapat commission dari payment referee
  - redeem : user redeem credit buat potong invoice subscription
  - adjust : admin manual adjustment (bonus, koreksi)
  - refund : refund credit (mis. payment di-cancel setelah commission udah masuk)
"""
from sqlalchemy import Column, Integer, String, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


# Type constants
LEDGER_TYPE_EARN = "earn"
LEDGER_TYPE_REDEEM = "redeem"
LEDGER_TYPE_ADJUST = "adjust"
LEDGER_TYPE_REFUND = "refund"

LEDGER_TYPES = [
    LEDGER_TYPE_EARN,
    LEDGER_TYPE_REDEEM,
    LEDGER_TYPE_ADJUST,
    LEDGER_TYPE_REFUND,
]


class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Positif = earn/refund (saldo nambah), negatif = redeem (saldo berkurang)
    amount = Column(Numeric(10, 2), nullable=False)

    # earn | redeem | adjust | refund
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

    # Snapshot saldo SETELAH transaksi ini
    balance_after = Column(Numeric(10, 2), nullable=False)

    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships (lazy load, ga eager join karena audit trail = high volume)
    user = relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        sign = "+" if float(self.amount) >= 0 else ""
        return f"<CreditLedger user={self.user_id} {sign}{self.amount} type={self.type}>"
