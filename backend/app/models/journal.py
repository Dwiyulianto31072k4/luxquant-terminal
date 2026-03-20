# backend/app/models/journal.py
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text,
    DateTime, ForeignKey, ARRAY
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class TradeJournal(Base):
    __tablename__ = "trade_journals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Optional link to LuxQuant signal (auto-fill source)
    signal_id = Column(String, ForeignKey("signals.signal_id", ondelete="SET NULL"), nullable=True, index=True)

    # Trade basics
    pair = Column(String(50), nullable=False, index=True)
    direction = Column(String(10), default="long")  # long / short
    status = Column(String(20), default="open")  # open, closed_win, closed_loss, breakeven

    # Planned (from signal or manual)
    planned_entry = Column(Float, nullable=True)
    planned_tp1 = Column(Float, nullable=True)
    planned_tp2 = Column(Float, nullable=True)
    planned_tp3 = Column(Float, nullable=True)
    planned_tp4 = Column(Float, nullable=True)
    planned_sl = Column(Float, nullable=True)

    # Actual execution
    actual_entry = Column(Float, nullable=False)
    actual_exit = Column(Float, nullable=True)
    leverage = Column(Float, default=1.0)
    position_size_usd = Column(Float, nullable=True)
    fees_usd = Column(Float, default=0.0)

    # PnL (calculated on backend before save)
    pnl_usd = Column(Float, nullable=True)
    pnl_pct = Column(Float, nullable=True)
    rr_ratio = Column(Float, nullable=True)  # risk:reward ratio

    # Psychology
    # {"confidence": 8, "fomo_level": 2, "mood": "calm", "regret": 1}
    emotions = Column(JSONB, default=dict)

    # Tags (arrays)
    strategy_tags = Column(ARRAY(String), default=list)
    confluence_tags = Column(ARRAY(String), default=list)
    mistakes = Column(ARRAY(String), default=list)

    # Notes & proof
    notes = Column(Text, nullable=True)
    chart_before_url = Column(String(500), nullable=True)
    chart_after_url = Column(String(500), nullable=True)
    tradingview_link = Column(String(500), nullable=True)

    # Context snapshot (captured at journal creation from signal/market data)
    # {"signal_status": "tp1", "ai_win_rate": 75, "ai_streak": "3W", "market_condition": "good", "volume_24h": 1234567}
    context_snapshot = Column(JSONB, default=dict)

    # Timestamps
    entry_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    exit_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<TradeJournal {self.pair} PnL={self.pnl_usd}>"