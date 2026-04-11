from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class AIArenaReport(Base):
    __tablename__ = "ai_arena_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String(20), unique=True, nullable=False, index=True)  # rpt_xxxxx
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    generated_in_seconds = Column(Float)
    data_sources_count = Column(Integer)
    btc_price = Column(Float)
    fear_greed = Column(Integer)
    sentiment = Column(String(20))       # bullish/bearish/cautious/neutral
    confidence = Column(Integer)
    bias_direction = Column(String(10))  # LONG/SHORT/NEUTRAL
    report_json = Column(JSON, nullable=False)  # full report content
    created_at = Column(DateTime(timezone=True), server_default=func.now())
