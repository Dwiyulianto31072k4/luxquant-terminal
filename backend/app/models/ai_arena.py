# backend/app/models/ai_arena.py
"""
AI Arena v3 Database Models
============================
- AIArenaReport: Full reports with multi-TF, chart images, anomaly tracking
- AIArenaAnomalyCheck: Lightweight anomaly check logs
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, JSON, ForeignKey
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

    # ═══ v3 NEW COLUMNS ═══
    timeframes_analyzed = Column(JSON)          # {"1D": {rsi, ema...}, "4H": {...}, "1H": {...}}
    chart_image_path = Column(String(255))      # /opt/luxquant/ai-arena-charts/rpt_xxx.png
    is_anomaly_triggered = Column(Boolean, default=False)
    anomaly_reason = Column(Text)               # "price_dump_2.3%_15min"
    previous_report_id = Column(Integer, ForeignKey("ai_arena_reports.id"), nullable=True)


class AIArenaAnomalyCheck(Base):
    __tablename__ = "ai_arena_anomaly_checks"

    id = Column(Integer, primary_key=True, index=True)
    checked_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    btc_price = Column(Float)
    oi_usd = Column(Float)
    funding_rate = Column(Float)
    fear_greed = Column(Integer)
    trigger_hit = Column(Boolean, default=False)
    anomaly_type = Column(String(50))    # price_dump, oi_increase, funding_extreme, etc.
    anomaly_detail = Column(Text)
    report_triggered_id = Column(String(20))  # rpt_xxx if report was generated
