from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    
    # Dibuat nullable=True agar user yang daftar via Google tidak wajib punya password
    password_hash = Column(String(255), nullable=True)
    
    # Penanda metode login (contoh: 'local' untuk email/pass, 'google' untuk akun Google)
    auth_provider = Column(String(50), default="local")
    
    # Role user sesuai dengan yang ada di database VPS (contoh: 'free', 'premium')
    role = Column(String(20), default="free")
    
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<User {self.username} ({self.auth_provider})>"