# backend/app/models/user.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, BigInteger
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)

    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # Auth provider
    auth_provider = Column(String(50), default="local")

    # Google OAuth
    google_id = Column(String(255), unique=True, nullable=True)
    avatar_url = Column(Text, nullable=True)

    # Telegram
    telegram_id = Column(BigInteger, unique=True, nullable=True, index=True)
    telegram_username = Column(String(100), nullable=True)

    # Subscription
    role = Column(String(20), default="free", nullable=False)
    subscription_expires_at = Column(DateTime(timezone=True), nullable=True)
    subscription_granted_by = Column(Integer, nullable=True)
    subscription_granted_at = Column(DateTime(timezone=True), nullable=True)
    subscription_note = Column(Text, nullable=True)

    # Referral
    referred_by = Column(Integer, nullable=True)
    referral_code_used = Column(String(20), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def is_premium(self) -> bool:
        if self.role == 'admin':
            return True
        if self.role != 'premium':
            return False
        if self.subscription_expires_at is None:
            return True
        from datetime import datetime, timezone
        return self.subscription_expires_at > datetime.now(timezone.utc)

    @property
    def is_admin(self) -> bool:
        return self.role == 'admin'

    def __repr__(self):
        return f"<User {self.username} role={self.role}>"
