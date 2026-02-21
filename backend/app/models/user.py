# backend/app/models/user.py
from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)  # Nullable untuk OAuth users
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    role = Column(String(20), default='free')  # 'free', 'subscriber', 'admin'
    
    # OAuth fields
    auth_provider = Column(String(50), default='local')  # 'local', 'google', 'telegram'
    google_id = Column(String(255), unique=True, nullable=True)
    avatar_url = Column(Text, nullable=True)
    
    # Telegram fields
    telegram_id = Column(BigInteger, unique=True, nullable=True)
    telegram_username = Column(String(100), nullable=True)
    
    # Subscription fields
    subscription_expires_at = Column(DateTime(timezone=True), nullable=True)   # NULL = no expiry (lifetime atau free)
    subscription_granted_by = Column(Integer, nullable=True)                    # admin user_id yang grant
    subscription_granted_at = Column(DateTime(timezone=True), nullable=True)    # kapan di-grant
    subscription_note = Column(Text, nullable=True)                             # catatan admin
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    @property
    def is_subscription_active(self):
        """Check apakah subscription masih aktif"""
        if self.role == 'admin':
            return True
        if self.role != 'subscriber':
            return False
        # subscriber tanpa expiry = lifetime
        if self.subscription_expires_at is None:
            return True
        from datetime import datetime, timezone
        return self.subscription_expires_at > datetime.now(timezone.utc)
    
    def __repr__(self):
        return f"<User {self.username}>"