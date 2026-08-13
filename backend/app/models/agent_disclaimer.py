"""Immutable Agent acknowledgement log — assistant disclaimer + live ack."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class AgentDisclaimerAck(Base):
    __tablename__ = "agent_disclaimer_acks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(32), nullable=False, index=True)  # assistant | live
    version = Column(String(32), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ip = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    title = Column(String(240), nullable=True)
    checks = Column(JSONB, nullable=False, default=list)
    form_snapshot = Column(JSONB, nullable=True)
