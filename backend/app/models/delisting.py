# backend/app/models/delisting.py
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class DelistingEvent(Base):
    """Pengumuman delisting dari exchange (Binance/Bybit/OKX).

    Diisi oleh scripts/delisting_worker.py (cron). Dibaca route /delistings
    yang menghitung % move sejak announce (pump-after-delist tracker).
    """
    __tablename__ = "delisting_events"

    id = Column(BigInteger, primary_key=True)
    exchange = Column(String(20), nullable=False)      # binance | bybit | okx
    ann_id = Column(Text, nullable=False)              # id pengumuman per-exchange (dedupe)
    title = Column(Text, nullable=False)
    url = Column(Text, nullable=True)
    announced_at = Column(DateTime(timezone=True), nullable=True)
    delist_at = Column(DateTime(timezone=True), nullable=True)
    symbols = Column(ARRAY(Text), nullable=True)
    price_at_announce = Column(JSONB, nullable=True)
    peak_since_announce = Column(JSONB, nullable=True)  # {symbol: {peak, peak_pct, peak_at}}
    notified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<DelistingEvent {self.exchange}:{self.ann_id} {self.title[:40]!r}>"
