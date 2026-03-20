# backend/app/schemas/journal.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============ Request Schemas ============

class JournalCreate(BaseModel):
    signal_id: Optional[str] = None
    pair: str
    direction: str = "long"

    planned_entry: Optional[float] = None
    planned_tp1: Optional[float] = None
    planned_tp2: Optional[float] = None
    planned_tp3: Optional[float] = None
    planned_tp4: Optional[float] = None
    planned_sl: Optional[float] = None

    actual_entry: float
    actual_exit: Optional[float] = None
    leverage: float = 1.0
    position_size_usd: Optional[float] = None
    fees_usd: float = 0.0

    emotions: Dict[str, Any] = {}
    strategy_tags: List[str] = []
    confluence_tags: List[str] = []
    mistakes: List[str] = []

    notes: Optional[str] = None
    chart_before_url: Optional[str] = None
    chart_after_url: Optional[str] = None
    tradingview_link: Optional[str] = None

    entry_at: Optional[datetime] = None
    exit_at: Optional[datetime] = None


class JournalUpdate(BaseModel):
    pair: Optional[str] = None
    direction: Optional[str] = None
    status: Optional[str] = None

    actual_entry: Optional[float] = None
    actual_exit: Optional[float] = None
    leverage: Optional[float] = None
    position_size_usd: Optional[float] = None
    fees_usd: Optional[float] = None

    emotions: Optional[Dict[str, Any]] = None
    strategy_tags: Optional[List[str]] = None
    confluence_tags: Optional[List[str]] = None
    mistakes: Optional[List[str]] = None

    notes: Optional[str] = None
    chart_before_url: Optional[str] = None
    chart_after_url: Optional[str] = None
    tradingview_link: Optional[str] = None

    exit_at: Optional[datetime] = None


# ============ Response Schemas ============

class JournalResponse(BaseModel):
    id: int
    user_id: int
    signal_id: Optional[str] = None

    pair: str
    direction: str
    status: str

    planned_entry: Optional[float] = None
    planned_tp1: Optional[float] = None
    planned_tp2: Optional[float] = None
    planned_tp3: Optional[float] = None
    planned_tp4: Optional[float] = None
    planned_sl: Optional[float] = None

    actual_entry: float
    actual_exit: Optional[float] = None
    leverage: float
    position_size_usd: Optional[float] = None
    fees_usd: float

    pnl_usd: Optional[float] = None
    pnl_pct: Optional[float] = None
    rr_ratio: Optional[float] = None

    emotions: Dict[str, Any] = {}
    strategy_tags: List[str] = []
    confluence_tags: List[str] = []
    mistakes: List[str] = []

    notes: Optional[str] = None
    chart_before_url: Optional[str] = None
    chart_after_url: Optional[str] = None
    tradingview_link: Optional[str] = None
    context_snapshot: Dict[str, Any] = {}

    entry_at: Optional[datetime] = None
    exit_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class JournalListResponse(BaseModel):
    items: List[JournalResponse]
    total: int


class JournalPrefillResponse(BaseModel):
    pair: str
    planned_entry: Optional[float] = None
    planned_tp1: Optional[float] = None
    planned_tp2: Optional[float] = None
    planned_tp3: Optional[float] = None
    planned_tp4: Optional[float] = None
    planned_sl: Optional[float] = None
    risk_level: Optional[str] = None
    signal_status: Optional[str] = None
    context_snapshot: Dict[str, Any] = {}


class JournalStatsResponse(BaseModel):
    total_trades: int
    open_trades: int
    closed_trades: int
    wins: int
    losses: int
    breakeven: int
    win_rate: float
    total_pnl_usd: float
    avg_pnl_usd: float
    avg_rr: float
    best_trade_pnl: float
    worst_trade_pnl: float
    best_trade_pair: Optional[str] = None
    worst_trade_pair: Optional[str] = None
    most_traded_pair: Optional[str] = None
    avg_confidence_wins: Optional[float] = None
    avg_confidence_losses: Optional[float] = None
    avg_fomo_wins: Optional[float] = None
    avg_fomo_losses: Optional[float] = None
    most_common_mistake: Optional[str] = None
    most_profitable_strategy: Optional[str] = None
    longest_win_streak: int = 0
    longest_loss_streak: int = 0
    win_rate_by_strategy: Dict[str, Any] = {}
    win_rate_by_emotion: Dict[str, Any] = {}
    pnl_by_day: Dict[str, float] = {}


class AIInsightResponse(BaseModel):
    insights: List[str]
    generated_at: Optional[str] = None
    source: str = "gemini"