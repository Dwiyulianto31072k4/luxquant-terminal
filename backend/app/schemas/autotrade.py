# backend/app/schemas/autotrade.py
"""
LuxQuant Terminal - AutoTrade v3 Schemas
Pydantic models for API request/response validation.

Organized by resource:
    - Exchange (metadata about supported exchanges)
    - ExchangeAccount (user's connected exchange credentials)
    - AutotradeConfig (per-account trading rules)
    - TradeOrder (execution records)
    - TradeLog (audit events)
    - DailyPnl (aggregated daily performance)
    - Portfolio (summary dashboards)
"""
from typing import Optional, List, Literal, Dict, Any
from datetime import datetime, date
from decimal import Decimal

from pydantic import BaseModel, Field, ConfigDict, field_validator


# ============================================================
# Shared / Enum types
# ============================================================
ExchangeId = Literal["binance", "bybit", "okx", "bitget", "mexc"]
TradingMode = Literal["spot", "futures", "both"]
MarketType = Literal["spot", "futures"]
MarginMode = Literal["isolated", "cross"]
TPStrategy = Literal["equal_split", "front_loaded", "back_loaded", "tp1_only", "custom"]
BreakevenAfter = Literal["tp1", "tp2", "never"]
RiskFilter = Literal["all", "low_only", "low_medium"]
TrailingType = Literal["percent", "fixed_usdt"]
TrailingActivation = Literal["immediate", "breakeven", "after_tp1"]
EmergencyAction = Literal["partial_close", "tighten_sl", "full_close", "add_margin"]
TradeStatus = Literal["pending", "placed", "filled", "partial", "closed", "error", "cancelled"]


# ============================================================
# 1. Exchange metadata
# ============================================================
class ExchangeMetadata(BaseModel):
    """Static info about a supported exchange."""
    id: str
    name: str
    has_futures: bool
    has_spot: bool
    max_leverage: int
    needs_passphrase: bool
    native_trailing_futures: bool
    has_add_margin: bool


class SupportedExchangesResponse(BaseModel):
    exchanges: List[ExchangeMetadata]


# ============================================================
# 2. ExchangeAccount
# ============================================================
class ExchangeAccountCreate(BaseModel):
    """Create a new exchange account (connect exchange)."""
    exchange_id: ExchangeId
    label: str = Field(default="", max_length=100)
    trading_mode: TradingMode = "both"
    api_key: str = Field(..., min_length=10, max_length=200)
    api_secret: str = Field(..., min_length=10, max_length=200)
    passphrase: Optional[str] = Field(default=None, max_length=200)  # OKX/Bitget
    is_testnet: bool = False
    custom_base_url: Optional[str] = Field(default=None, max_length=255)

    @field_validator("passphrase")
    @classmethod
    def passphrase_must_be_set_for_okx_bitget(cls, v, info):
        exchange_id = info.data.get("exchange_id")
        if exchange_id in ("okx", "bitget") and not v:
            raise ValueError(f"Passphrase required for {exchange_id}")
        return v


class ExchangeAccountUpdate(BaseModel):
    """Partial update. Only non-null fields applied."""
    label: Optional[str] = Field(default=None, max_length=100)
    trading_mode: Optional[TradingMode] = None
    is_active: Optional[bool] = None
    is_testnet: Optional[bool] = None
    custom_base_url: Optional[str] = Field(default=None, max_length=255)
    # Credentials can be re-entered (re-encrypt)
    api_key: Optional[str] = Field(default=None, min_length=10, max_length=200)
    api_secret: Optional[str] = Field(default=None, min_length=10, max_length=200)
    passphrase: Optional[str] = Field(default=None, max_length=200)


class ExchangeAccountResponse(BaseModel):
    """Safe response — never exposes decrypted credentials."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    exchange_id: str
    label: str
    trading_mode: str
    is_active: bool
    is_testnet: bool
    custom_base_url: Optional[str] = None
    api_key_masked: Optional[str] = None  # set manually in route (e.g., "abc***xyz")
    balance_cache: Optional[Dict[str, Any]] = None
    balance_updated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ExchangeAccountListResponse(BaseModel):
    accounts: List[ExchangeAccountResponse]
    total: int


# Connection test
class TestConnectionResponse(BaseModel):
    success: bool
    exchange: Optional[str] = None
    markets_loaded: Optional[int] = None
    has_balance_access: Optional[bool] = None
    usdt_free: Optional[float] = None
    error: Optional[str] = None


# Balance
class BalanceAsset(BaseModel):
    free: float
    used: float
    total: float


class BalanceSnapshot(BaseModel):
    market_type: str
    total_usd: float
    free_usd: float
    used_usd: float
    assets: Dict[str, BalanceAsset] = {}


class BalanceResponse(BaseModel):
    exchange_id: str
    spot: Optional[BalanceSnapshot] = None
    futures: Optional[BalanceSnapshot] = None
    fetched_at: datetime


# ============================================================
# 3. AutotradeConfig
# ============================================================
class AutotradeConfigBase(BaseModel):
    """Shared fields between create & update."""
    enabled: bool = False
    mode: Literal["auto"] = "auto"
    default_market_type: MarketType = "futures"

    # Position sizing
    max_position_pct: float = Field(default=5.0, ge=0.1, le=100)
    max_leverage: int = Field(default=10, ge=1, le=125)
    max_concurrent_trades: int = Field(default=5, ge=1, le=50)
    daily_loss_limit_pct: float = Field(default=10.0, ge=0.5, le=100)
    margin_mode: MarginMode = "isolated"

    # TP strategy
    tp_strategy: TPStrategy = "equal_split"
    tp_custom_splits: Optional[List[float]] = None

    # SL rules
    sl_to_breakeven_after: BreakevenAfter = "tp1"

    # Filters
    risk_filter: RiskFilter = "all"
    pair_whitelist: Optional[List[str]] = None
    pair_blacklist: Optional[List[str]] = []
    min_volume_rank: Optional[int] = None

    # Trailing stop
    trailing_stop_enabled: bool = False
    trailing_stop_type: TrailingType = "percent"
    trailing_stop_value: float = Field(default=1.5, ge=0.1, le=50)
    trailing_activation: TrailingActivation = "breakeven"
    trailing_update_interval: int = Field(default=15, ge=5, le=300)
    max_trailing_distance: Optional[float] = None

    # Max loss protection
    max_loss_protection_enabled: bool = False
    max_loss_per_trade_pct: float = Field(default=1.5, ge=0.1, le=50)
    emergency_close_trigger_pct: float = Field(default=2.0, ge=0.1, le=50)

    # Anti-liquidation
    liquidation_buffer_pct: float = Field(default=220, ge=100, le=500)
    liquidation_warning_pct: float = Field(default=320, ge=100, le=500)
    auto_topup_margin: bool = False
    auto_topup_max_pct: float = Field(default=30, ge=0, le=100)
    emergency_action: EmergencyAction = "partial_close"

    @field_validator("tp_custom_splits")
    @classmethod
    def validate_custom_splits(cls, v, info):
        if v is None:
            return v
        if not all(isinstance(x, (int, float)) and x >= 0 for x in v):
            raise ValueError("tp_custom_splits must be list of non-negative numbers")
        total = sum(v)
        if total > 0 and abs(total - 100) > 1:
            raise ValueError(f"tp_custom_splits must sum to ~100 (got {total})")
        return v

    @field_validator("liquidation_warning_pct")
    @classmethod
    def warning_must_exceed_buffer(cls, v, info):
        buffer = info.data.get("liquidation_buffer_pct", 220)
        if v <= buffer:
            raise ValueError("liquidation_warning_pct must be > liquidation_buffer_pct")
        return v


class AutotradeConfigCreate(AutotradeConfigBase):
    """Create config for an existing exchange_account."""
    exchange_account_id: int


class AutotradeConfigUpdate(BaseModel):
    """Partial update. All fields optional."""
    enabled: Optional[bool] = None
    default_market_type: Optional[MarketType] = None

    max_position_pct: Optional[float] = Field(default=None, ge=0.1, le=100)
    max_leverage: Optional[int] = Field(default=None, ge=1, le=125)
    max_concurrent_trades: Optional[int] = Field(default=None, ge=1, le=50)
    daily_loss_limit_pct: Optional[float] = Field(default=None, ge=0.5, le=100)
    margin_mode: Optional[MarginMode] = None

    tp_strategy: Optional[TPStrategy] = None
    tp_custom_splits: Optional[List[float]] = None
    sl_to_breakeven_after: Optional[BreakevenAfter] = None

    risk_filter: Optional[RiskFilter] = None
    pair_whitelist: Optional[List[str]] = None
    pair_blacklist: Optional[List[str]] = None
    min_volume_rank: Optional[int] = None

    trailing_stop_enabled: Optional[bool] = None
    trailing_stop_type: Optional[TrailingType] = None
    trailing_stop_value: Optional[float] = Field(default=None, ge=0.1, le=50)
    trailing_activation: Optional[TrailingActivation] = None
    trailing_update_interval: Optional[int] = Field(default=None, ge=5, le=300)
    max_trailing_distance: Optional[float] = None

    max_loss_protection_enabled: Optional[bool] = None
    max_loss_per_trade_pct: Optional[float] = Field(default=None, ge=0.1, le=50)
    emergency_close_trigger_pct: Optional[float] = Field(default=None, ge=0.1, le=50)

    liquidation_buffer_pct: Optional[float] = Field(default=None, ge=100, le=500)
    liquidation_warning_pct: Optional[float] = Field(default=None, ge=100, le=500)
    auto_topup_margin: Optional[bool] = None
    auto_topup_max_pct: Optional[float] = Field(default=None, ge=0, le=100)
    emergency_action: Optional[EmergencyAction] = None


class AutotradeConfigResponse(AutotradeConfigBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    exchange_account_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AutotradeToggleRequest(BaseModel):
    """Master on/off toggle."""
    enabled: bool


# ============================================================
# 4. TradeOrder
# ============================================================
class TPOrder(BaseModel):
    """Single TP level in the plan."""
    level: str
    price: float
    qty_pct: float
    filled: bool = False
    order_id: Optional[str] = None
    filled_at: Optional[str] = None


class TradeOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    signal_id: Optional[str] = None
    user_id: int
    exchange_account_id: int
    exchange_id: str
    market_type: str

    exchange_order_id: Optional[str] = None
    pair: str
    side: str
    order_type: str
    entry_price: Optional[float] = None
    target_entry: Optional[float] = None
    qty: float
    qty_filled: Optional[float] = 0
    leverage: Optional[int] = 1
    margin_mode: Optional[str] = None

    status: str
    close_reason: Optional[str] = None
    realized_pnl: Optional[float] = None
    fee_total: Optional[float] = None
    error_message: Optional[str] = None

    tp_orders: Optional[List[Dict[str, Any]]] = None
    sl_order_id: Optional[str] = None
    sl_price: Optional[float] = None
    sl_current: Optional[float] = None

    trailing_enabled: Optional[bool] = False
    trailing_type: Optional[str] = None
    trailing_value: Optional[float] = None
    trailing_activation: Optional[str] = None
    trailing_activated: Optional[bool] = False
    highest_price: Optional[float] = None
    lowest_price: Optional[float] = None
    last_trail_updated_at: Optional[datetime] = None

    max_loss_amount: Optional[float] = None
    margin_allocated: Optional[float] = None

    created_at: Optional[datetime] = None
    filled_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator("highest_price", "lowest_price", "trailing_value", mode="before")
    @classmethod
    def decimal_to_float(cls, v):
        if isinstance(v, Decimal):
            return float(v)
        return v


class TradeOrderListResponse(BaseModel):
    orders: List[TradeOrderResponse]
    total: int
    page: int = 1
    page_size: int = 50


class TradeOrderFilters(BaseModel):
    """Query filters for trade_orders list."""
    status: Optional[TradeStatus] = None
    exchange_account_id: Optional[int] = None
    signal_id: Optional[str] = None
    pair: Optional[str] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)


class ManualCloseRequest(BaseModel):
    """Manually close a position."""
    reason: str = Field(default="manual", max_length=100)


# ============================================================
# 5. TradeLog
# ============================================================
class TradeLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trade_order_id: Optional[int] = None
    user_id: int
    event: str
    details: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


# ============================================================
# 6. DailyPnl + Portfolio summaries
# ============================================================
class DailyPnlResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    exchange_account_id: int
    date: date
    trades_opened: int
    trades_closed: int
    wins: int
    losses: int
    realized_pnl: float
    fees_total: float
    net_pnl: float


class DailyPnlListResponse(BaseModel):
    items: List[DailyPnlResponse]
    total_pnl: float
    total_fees: float
    net_pnl: float


class PortfolioSummary(BaseModel):
    """Aggregated portfolio view across all accounts."""
    total_accounts: int
    active_accounts: int
    total_balance_usd: float
    total_unrealized_pnl: float
    open_positions: int

    # Lifetime stats
    total_trades: int
    total_wins: int
    total_losses: int
    win_rate: float
    total_realized_pnl: float
    total_fees_paid: float
    net_pnl: float

    # Today
    today_trades_opened: int
    today_trades_closed: int
    today_realized_pnl: float
    today_net_pnl: float


class PortfolioByExchange(BaseModel):
    """Per-exchange breakdown."""
    exchange_id: str
    account_count: int
    total_balance_usd: float
    open_positions: int
    realized_pnl: float
    win_rate: float


# ============================================================
# 7. Engine status
# ============================================================
class EngineStatus(BaseModel):
    """Health check for autotrade engine worker."""
    running: bool
    pid: Optional[int] = None
    uptime_seconds: Optional[int] = None
    listener_connected: Optional[bool] = None
    last_signal_processed_at: Optional[datetime] = None
    last_monitor_cycle_at: Optional[datetime] = None
    open_positions_monitored: Optional[int] = None
    enabled_configs: int = 0


# ============================================================
# 8. Signals queue (preview of what would be auto-traded)
# ============================================================
class SignalQueueItem(BaseModel):
    """Pending signal that's eligible for execution."""
    signal_id: str
    pair: str
    entry: float
    target1: Optional[float]
    stop1: Optional[float]
    risk_level: Optional[str]
    created_at: Optional[str]
    already_traded: bool = False
    would_execute: bool = True
    rejection_reason: Optional[str] = None


class SignalQueueResponse(BaseModel):
    items: List[SignalQueueItem]
    total: int


# ============================================================
# 9. Generic responses
# ============================================================
class SuccessResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[str] = None
