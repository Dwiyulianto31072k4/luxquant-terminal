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
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    amount_usdt = Column(Numeric(10, 2), nullable=False)
    tx_hash = Column(String(100), unique=True, nullable=True)
    wallet_from = Column(String(50), nullable=True)
    wallet_to = Column(String(50), nullable=True)
    network = Column(String(20), default="BSC")
    status = Column(String(20), nullable=False, default="pending")
    verified_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    bscscan_data = Column(JSONB, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    plan = relationship("SubscriptionPlan", lazy="joined")

    def __repr__(self):
        return f"<Payment {self.id} status={self.status}>"