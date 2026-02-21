# backend/app/models/user.py
from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Text
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
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<User {self.username}>"