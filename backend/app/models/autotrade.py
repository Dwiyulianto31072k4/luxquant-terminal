"""
LuxQuant Terminal - Autotrade Models v2
Includes: trailing stop, anti-liquidation, hard loss cap fields.
"""
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, Numeric,
    ForeignKey, DateTime, Date, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ExchangeAccount(Base):
    __tablename__ = "exchange_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange_id = Column(String(20), nullable=False)
    label = Column(String(100), default="")
    api_key_enc = Column(Text, nullable=False)
    api_secret_enc = Column(Text, nullable=False)
    passphrase_enc = Column(Text, nullable=True)
    trading_mode = Column(String(10), nullable=False, default="both")
    is_active = Column(Boolean, default=True)
    is_testnet = Column(Boolean, default=False)
    custom_base_url = Column(String(255), nullable=True)
    balance_cache = Column(JSON, nullable=True)
    balance_updated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    autotrade_config = relationship("AutotradeConfig", back_populates="exchange_account", uselist=False)
    trade_orders = relationship("TradeOrder", back_populates="exchange_account")


class AutotradeConfig(Base):
    __tablename__ = "autotrade_config"
    __table_args__ = (
        UniqueConstraint("user_id", "exchange_account_id", name="uq_atconfig_user_exacc"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange_account_id = Column(Integer, ForeignKey("exchange_accounts.id", ondelete="CASCADE"), nullable=False)

    # Core
    enabled = Column(Boolean, default=False)
    mode = Column(String(10), default="auto")
    default_market_type = Column(String(10), default="futures")

    # Risk Management
    max_position_pct = Column(Float, default=5.0)
    max_leverage = Column(Integer, default=10)
    max_concurrent_trades = Column(Integer, default=5)
    daily_loss_limit_pct = Column(Float, default=10.0)
    margin_mode = Column(String(10), default="isolated")

    # TP/SL Strategy
    tp_strategy = Column(String(30), default="equal_split")
    tp_custom_splits = Column(JSON, nullable=True)
    sl_to_breakeven_after = Column(String(10), default="tp1")

    # Signal Filtering
    risk_filter = Column(String(20), default="all")
    pair_whitelist = Column(JSON, nullable=True)
    pair_blacklist = Column(JSON, default=[])
    min_volume_rank = Column(Integer, nullable=True)

    # Trailing Stop (Optional)
    trailing_stop_enabled = Column(Boolean, default=False)
    trailing_stop_type = Column(String(12), default="percent")
    trailing_stop_value = Column(Numeric(10, 2), default=1.5)
    trailing_activation = Column(String(20), default="breakeven")
    trailing_update_interval = Column(Integer, default=15)
    max_trailing_distance = Column(Numeric(10, 2), nullable=True)

    # Anti-Liquidation (Optional)
    max_loss_protection_enabled = Column(Boolean, default=False)
    max_loss_per_trade_pct = Column(Numeric(5, 2), default=1.5)
    emergency_close_trigger_pct = Column(Numeric(5, 2), default=2.0)
    liquidation_buffer_pct = Column(Numeric(5, 2), default=220)
    liquidation_warning_pct = Column(Numeric(5, 2), default=320)
    auto_topup_margin = Column(Boolean, default=False)
    auto_topup_max_pct = Column(Numeric(5, 2), default=30)
    emergency_action = Column(String(30), default="partial_close")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exchange_account = relationship("ExchangeAccount", back_populates="autotrade_config")


class TradeOrder(Base):
    __tablename__ = "trade_orders"

    id = Column(Integer, primary_key=True, index=True)
    signal_id = Column(Text, ForeignKey("signals.signal_id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange_account_id = Column(Integer, ForeignKey("exchange_accounts.id", ondelete="CASCADE"), nullable=False)
    exchange_id = Column(String(20), nullable=False)
    market_type = Column(String(10), nullable=False)
    exchange_order_id = Column(String(100), nullable=True)
    pair = Column(String(30), nullable=False)
    side = Column(String(10), nullable=False)
    order_type = Column(String(20), nullable=False)
    entry_price = Column(Float, nullable=True)
    target_entry = Column(Float, nullable=True)
    qty = Column(Float, nullable=False)
    qty_filled = Column(Float, default=0)
    leverage = Column(Integer, default=1)
    margin_mode = Column(String(10), default="isolated")
    status = Column(String(20), nullable=False, default="pending")
    close_reason = Column(String(20), nullable=True)
    realized_pnl = Column(Float, nullable=True)
    fee_total = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)

    # TP/SL tracking
    tp_orders = Column(JSON, nullable=True)
    sl_order_id = Column(String(100), nullable=True)
    sl_price = Column(Float, nullable=True)
    sl_current = Column(Float, nullable=True)

    # Trailing stop state
    trailing_enabled = Column(Boolean, default=False)
    trailing_type = Column(String(12), nullable=True)
    trailing_value = Column(Numeric(10, 2), nullable=True)
    trailing_activation = Column(String(20), nullable=True)
    trailing_activated = Column(Boolean, default=False)
    highest_price = Column(Numeric(20, 10), nullable=True)
    lowest_price = Column(Numeric(20, 10), nullable=True)
    last_trail_updated_at = Column(DateTime(timezone=True), nullable=True)

    # Anti-liquid state
    max_loss_amount = Column(Float, nullable=True)
    margin_allocated = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    filled_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exchange_account = relationship("ExchangeAccount", back_populates="trade_orders")
    logs = relationship("TradeLog", back_populates="trade_order")


class TradeLog(Base):
    __tablename__ = "trade_log"

    id = Column(Integer, primary_key=True, index=True)
    trade_order_id = Column(Integer, ForeignKey("trade_orders.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event = Column(String(50), nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trade_order = relationship("TradeOrder", back_populates="logs")


class DailyPnl(Base):
    __tablename__ = "daily_pnl"
    __table_args__ = (
        UniqueConstraint("user_id", "exchange_account_id", "date", name="uq_dpnl_user_exacc_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange_account_id = Column(Integer, ForeignKey("exchange_accounts.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    trades_opened = Column(Integer, default=0)
    trades_closed = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    realized_pnl = Column(Float, default=0)
    fees_total = Column(Float, default=0)
    net_pnl = Column(Float, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
