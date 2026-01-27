from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class SignalStatus(str, Enum):
    OPEN = "open"
    TP1 = "tp1"
    TP2 = "tp2"
    TP3 = "tp3"
    CLOSED_WIN = "closed_win"
    CLOSED_LOSS = "closed_loss"

# Response schema - matches production DB
class SignalResponse(BaseModel):
    signal_id: str
    channel_id: Optional[int] = None
    call_message_id: Optional[int] = None
    message_link: Optional[str] = None
    
    pair: str
    entry: Optional[float] = None
    target1: Optional[float] = None
    target2: Optional[float] = None
    target3: Optional[float] = None
    target4: Optional[float] = None
    stop1: Optional[float] = None
    stop2: Optional[float] = None
    
    risk_level: Optional[str] = None
    volume_rank_num: Optional[int] = None
    volume_rank_den: Optional[int] = None
    
    status: str = "open"
    created_at: Optional[str] = None
    
    class Config:
        from_attributes = True

# List response dengan pagination
class SignalListResponse(BaseModel):
    items: List[SignalResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

# Stats response
class SignalStats(BaseModel):
    total_signals: int
    open_signals: int
    tp1_signals: int
    tp2_signals: int
    tp3_signals: int
    closed_win: int
    closed_loss: int
    win_rate: float
