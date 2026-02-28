# backend/app/models/referral.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ReferralCode(Base):
    __tablename__ = "referral_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    discount_pct = Column(Numeric(5, 2), default=10.00)
    commission_pct = Column(Numeric(5, 2), default=10.00)
    max_uses = Column(Integer, nullable=True)          # NULL = unlimited
    times_used = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    owner = relationship("User", foreign_keys=[user_id], lazy="joined")
    uses = relationship("ReferralUse", back_populates="referral_code", lazy="dynamic")

    def __repr__(self):
        return f"<ReferralCode {self.code} user={self.user_id}>"


class ReferralUse(Base):
    __tablename__ = "referral_uses"

    id = Column(Integer, primary_key=True, index=True)
    referral_code_id = Column(Integer, ForeignKey("referral_codes.id", ondelete="CASCADE"), nullable=False, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    referred_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)
    discount_amount = Column(Numeric(10, 2), default=0)
    commission_amount = Column(Numeric(10, 2), default=0)
    status = Column(String(20), default="pending")     # pending / confirmed / paid / cancelled
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    referral_code = relationship("ReferralCode", back_populates="uses")
    referrer = relationship("User", foreign_keys=[referrer_id])
    referred = relationship("User", foreign_keys=[referred_id])

    def __repr__(self):
        return f"<ReferralUse referrer={self.referrer_id} referred={self.referred_id} status={self.status}>"


class ReferralPayout(Base):
    __tablename__ = "referral_payouts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_usdt = Column(Numeric(10, 2), nullable=False)
    wallet_address = Column(String(100), nullable=True)
    network = Column(String(20), nullable=True)
    tx_hash = Column(String(100), nullable=True)
    status = Column(String(20), default="pending")     # pending / processing / completed / failed
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        return f"<ReferralPayout {self.id} user={self.user_id} status={self.status}>"