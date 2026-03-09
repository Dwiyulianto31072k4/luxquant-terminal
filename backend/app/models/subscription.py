# backend/app/models/subscription.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)       # monthly, yearly, lifetime
    label = Column(String(100), nullable=False)
    description = Column(Text, default="")
    price_usdt = Column(Numeric(10, 2), nullable=False)
    duration_days = Column(Integer, nullable=True)                # NULL = lifetime
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Plan {self.name} ${self.price_usdt}>"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    amount_usdt = Column(Numeric(10, 2), nullable=False)

    # TX hash — NOT unique (retry allowed, uniqueness checked at app level)
    tx_hash = Column(String(100), nullable=True, index=True)
    wallet_from = Column(String(50), nullable=True)
    wallet_to = Column(String(50), nullable=True)
    network = Column(String(20), default="BSC")

    # Status: pending → verifying → confirmed / failed / expired / cancelled
    status = Column(String(20), nullable=False, default="pending")

    verified_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)     # Invoice expiry (24h window)
    bscscan_data = Column(JSONB, nullable=True)
    notes = Column(Text, nullable=True)

    # Referral
    referral_use_id = Column(Integer, ForeignKey("referral_uses.id"), nullable=True)
    discount_amount = Column(Numeric(10, 2), default=0)
    final_amount = Column(Numeric(10, 2), nullable=True)  # amount_usdt - discount

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    plan = relationship("SubscriptionPlan", lazy="joined")

    def __repr__(self):
        return f"<Payment {self.id} user={self.user_id} status={self.status}>"