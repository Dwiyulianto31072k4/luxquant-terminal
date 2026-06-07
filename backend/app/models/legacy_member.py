# backend/app/models/legacy_member.py
from sqlalchemy import Column, String, Boolean, DateTime, BigInteger
from sqlalchemy.sql import func
from app.core.database import Base


class LegacyMember(Base):
    """Snapshot member Telegram lama (pre-webapp) yang berhak lifetime.

    Dibekukan di satu titik waktu via script Telethon. User yang telegram_id-nya
    ada di sini akan auto-grant lifetime saat pertama kali login via Telegram.
    """
    __tablename__ = "legacy_members"

    telegram_id = Column(BigInteger, primary_key=True)
    username = Column(String(100), nullable=True)
    full_name = Column(String(255), nullable=True)
    snapshot_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Ditandai TRUE setelah user login & di-grant lifetime
    claimed = Column(Boolean, nullable=False, default=False)
    claimed_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<LegacyMember tg={self.telegram_id} claimed={self.claimed}>"
