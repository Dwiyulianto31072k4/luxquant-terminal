# backend/app/models/user.py
from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Auth & OAuth
    is_admin = Column(Boolean, default=False)
    role = Column(String(20), default="free")              # 'free', 'premium', 'admin'
    auth_provider = Column(String(50), default="local")    # 'local', 'google', 'telegram'
    google_id = Column(String(255), unique=True, nullable=True)
    avatar_url = Column(Text, nullable=True)
    telegram_id = Column(BigInteger, unique=True, nullable=True)
    telegram_username = Column(String(100), nullable=True)

    # Subscription (langsung di users table)
    subscription_expires_at = Column(DateTime(timezone=True), nullable=True)
    subscription_granted_by = Column(Integer, nullable=True)       # admin user_id yang approve
    subscription_granted_at = Column(DateTime(timezone=True), nullable=True)
    subscription_note = Column(Text, nullable=True)

    @property
    def is_premium(self):
        """Check if user has active subscription"""
        if self.role == 'admin' or self.is_admin:
            return True
        if self.role == 'premium':
            if self.subscription_expires_at is None:
                return True  # lifetime
            from datetime import datetime, timezone
            return self.subscription_expires_at > datetime.now(timezone.utc)
        return False

    def __repr__(self):
        return f"<User {self.username} role={self.role}>"