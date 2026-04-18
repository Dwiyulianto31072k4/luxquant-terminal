# backend/app/models/autotrade.py
"""
LuxQuant Terminal - AutoTrade v3 Models
SQLAlchemy models matching migration-autotrade-v3.sql exactly.

Tables:
    - ExchangeAccount   → exchange_accounts
    - AutotradeConfig   → autotrade_config
    - TradeOrder        → trade_orders
    - TradeLog          → trade_log
    - DailyPnl          → daily_pnl
"""
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, Date,
    DateTime, ForeignKey, Numeric, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ============================================================
# 1. exchange_accounts
# ============================================================
class ExchangeAccount(Base):
    __tablename__ = "exchange_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Exchange identification
    exchange_id = Column(String(20), nullable=False)       # binance, bybit, okx, bitget, mexc
    label = Column(String(100), default="")
    trading_mode = Column(String(10), nullable=False, default="both")  # spot | futures | both

    # Credentials (Fernet encrypted)
    api_key_enc = Column(Text, nullable=False)
    api_secret_enc = Column(Text, nullable=False)
    passphrase_enc = Column(Text)                          # OKX & Bitget only

    # Options
    is_active = Column(Boolean, default=True)
    is_testnet = Column(Boolean, default=False)
    custom_base_url = Column(String(255))

    # Balance cache
    balance_cache = Column(JSONB)                          # {spot: {...}, futures: {...}}
    balance_updated_at = Column(DateTime(timezone=True))

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    configs = relationship("AutotradeConfig", back_populates="account", cascade="all, delete-orphan")
    trade_orders = relationship("TradeOrder", back_populates="account", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ExchangeAccount id={self.id} user={self.user_id} {self.exchange_id}:{self.trading_mode}>"


# ============================================================
# 2. autotrade_config
# ============================================================
class AutotradeConfig(Base):
    __tablename__ = "autotrade_config"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange_account_id = Column(
        Integer,
        ForeignKey("exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Master toggle
    enabled = Column(Boolean, default=False)
    mode = Column(String(10), default="auto")
    default_market_type = Column(String(10), default="futures")  # spot | futures

    # Position sizing & risk
    max_position_pct = Column(Float, default=5.0)
    max_leverage = Column(Integer, default=10)
    max_concurrent_trades = Column(Integer, default=5)
    daily_loss_limit_pct = Column(Float, default=10.0)
    margin_mode = Column(String(10), default="isolated")   # isolated | cross

    # TP strategy
    tp_strategy = Column(String(30), default="equal_split")
    tp_custom_splits = Column(JSONB)

    # SL rules
    sl_to_breakeven_after = Column(String(10), default="tp1")  # tp1 | tp2 | never

    # Signal filters
    risk_filter = Column(String(20), default="all")        # all | low_only | low_medium
    pair_whitelist = Column(JSONB)                         # NULL = allow all
    pair_blacklist = Column(JSONB, default=list)
    min_volume_rank = Column(Integer)

    # Trailing stop
    trailing_stop_enabled = Column(Boolean, default=False)
    trailing_stop_type = Column(String(12), default="percent")
    trailing_stop_value = Column(Numeric(10, 2), default=1.5)
    trailing_activation = Column(String(20), default="breakeven")
    trailing_update_interval = Column(Integer, default=15)
    max_trailing_distance = Column(Numeric(10, 2))

    # Max loss protection
    max_loss_protection_enabled = Column(Boolean, default=False)
    max_loss_per_trade_pct = Column(Numeric(5, 2), default=1.5)
    emergency_close_trigger_pct = Column(Numeric(5, 2), default=2.0)

    # Anti-liquidation
    liquidation_buffer_pct = Column(Numeric(5, 2), default=220)
    liquidation_warning_pct = Column(Numeric(5, 2), default=320)
    auto_topup_margin = Column(Boolean, default=False)
    auto_topup_max_pct = Column(Numeric(5, 2), default=30)
    emergency_action = Column(String(30), default="partial_close")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "exchange_account_id", name="autotrade_config_user_id_exchange_account_id_key"),
    )

    # Relationships
    account = relationship("ExchangeAccount", back_populates="configs")

    def __repr__(self):
        return f"<AutotradeConfig id={self.id} user={self.user_id} acc={self.exchange_account_id} enabled={self.enabled}>"


# ============================================================
# 3. trade_orders
# ============================================================
class TradeOrder(Base):
    __tablename__ = "trade_orders"

    id = Column(Integer, primary_key=True, index=True)
    signal_id = Column(Text, ForeignKey("signals.signal_id", ondelete="SET NULL"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange_account_id = Column(
        Integer,
        ForeignKey("exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    exchange_id = Column(String(20), nullable=False)
    market_type = Column(String(10), nullable=False)       # spot | futures

    # Exchange-side
    exchange_order_id = Column(String(100))

    # Trade params
    pair = Column(String(30), nullable=False)
    side = Column(String(10), nullable=False)              # buy | sell
    order_type = Column(String(20), nullable=False)        # market | limit
    entry_price = Column(Float)                            # actual filled avg
    target_entry = Column(Float)                           # intended entry from signal
    qty = Column(Float, nullable=False)
    qty_filled = Column(Float, default=0)

    # Futures only
    leverage = Column(Integer, default=1)
    margin_mode = Column(String(10), default="isolated")

    # Status
    status = Column(String(20), nullable=False, default="pending")
    # pending | placed | filled | partial | closed | error | cancelled
    close_reason = Column(String(20))
    # tp1..tp4 | sl | trailing_sl | emergency | manual | daily_limit
    realized_pnl = Column(Float)
    fee_total = Column(Float)
    error_message = Column(Text)

    # TP plan
    tp_orders = Column(JSONB)

    # SL tracking
    sl_order_id = Column(String(100))
    sl_price = Column(Float)                               # original SL
    sl_current = Column(Float)                             # current SL (may be moved)

    # Trailing state
    trailing_enabled = Column(Boolean, default=False)
    trailing_type = Column(String(12))
    trailing_value = Column(Numeric(10, 2))
    trailing_activation = Column(String(20))
    trailing_activated = Column(Boolean, default=False)
    highest_price = Column(Numeric(20, 10))                # for long trailing
    lowest_price = Column(Numeric(20, 10))                 # for short trailing
    last_trail_updated_at = Column(DateTime(timezone=True))

    # Anti-liquid
    max_loss_amount = Column(Float)
    margin_allocated = Column(Float)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    filled_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    account = relationship("ExchangeAccount", back_populates="trade_orders")
    logs = relationship("TradeLog", back_populates="trade_order", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<TradeOrder id={self.id} {self.pair} {self.side} {self.status}>"


# ============================================================
# 4. trade_log
# ============================================================
class TradeLog(Base):
    __tablename__ = "trade_log"

    id = Column(Integer, primary_key=True, index=True)
    trade_order_id = Column(Integer, ForeignKey("trade_orders.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event = Column(String(50), nullable=False)
    # order_placed | order_failed | tp_hit | sl_moved | trailing_updated |
    # emergency_triggered | partial_closed | position_closed | etc.
    details = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    trade_order = relationship("TradeOrder", back_populates="logs")

    def __repr__(self):
        return f"<TradeLog id={self.id} event={self.event} order={self.trade_order_id}>"


# ============================================================
# 5. daily_pnl
# ============================================================
class DailyPnl(Base):
    __tablename__ = "daily_pnl"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange_account_id = Column(
        Integer,
        ForeignKey("exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    date = Column(Date, nullable=False)

    # Counts
    trades_opened = Column(Integer, default=0)
    trades_closed = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)

    # PnL
    realized_pnl = Column(Float, default=0)
    fees_total = Column(Float, default=0)
    net_pnl = Column(Float, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "exchange_account_id", "date", name="daily_pnl_user_id_exchange_account_id_date_key"),
    )

    def __repr__(self):
        return f"<DailyPnl id={self.id} user={self.user_id} date={self.date} net={self.net_pnl}>"
