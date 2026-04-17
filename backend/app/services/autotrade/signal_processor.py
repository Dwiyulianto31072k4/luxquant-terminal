"""
LuxQuant Terminal - Signal Processor
Validates, filters, and enriches signals from Telegram before auto-trading.
"""
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.autotrade import AutotradeConfig, TradeOrder

logger = logging.getLogger("autotrade.signal")


@dataclass
class ProcessedSignal:
    valid: bool
    signal_id: str
    pair: str
    entry_price: float
    tp_levels: List[float]   # [tp1, tp2, tp3, tp4]
    sl_price: float          # stop1
    sl2_price: Optional[float] = None  # stop2
    risk_level: str = ""
    volume_rank: Optional[int] = None
    rejection_reason: Optional[str] = None


class SignalProcessor:
    """
    Processes raw signals from DB into validated trading parameters.
    """

    def __init__(self, db: Session):
        self.db = db

    def process_signal(self, signal_row: Dict) -> ProcessedSignal:
        """
        Validate and enrich a raw signal from the signals table.
        signal_row is a dict-like object with columns from signals table.
        """
        signal_id = signal_row.get("signal_id", "")
        pair = (signal_row.get("pair") or "").upper().strip()
        entry = signal_row.get("entry")
        tp1 = signal_row.get("target1")
        tp2 = signal_row.get("target2")
        tp3 = signal_row.get("target3")
        tp4 = signal_row.get("target4")
        sl1 = signal_row.get("stop1")
        sl2 = signal_row.get("stop2")
        risk_level = signal_row.get("risk_level", "")
        volume_rank = signal_row.get("volume_rank_num")
        status = signal_row.get("status", "")

        # 1. Basic validation
        if not pair:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair="",
                                   entry_price=0, tp_levels=[], sl_price=0,
                                   rejection_reason="Missing pair")

        if not entry or entry <= 0:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=0, tp_levels=[], sl_price=0,
                                   rejection_reason="Invalid entry price")

        if not sl1 or sl1 <= 0:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=[], sl_price=0,
                                   rejection_reason="Missing stop loss")

        if not tp1 or tp1 <= 0:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=[], sl_price=sl1,
                                   rejection_reason="Missing take profit")

        # 2. Ensure pair ends with USDT
        if not pair.endswith("USDT"):
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=[], sl_price=sl1,
                                   rejection_reason=f"Pair {pair} not USDT-margined")

        # 3. Determine direction (long/short)
        is_long = tp1 > entry
        is_short = tp1 < entry

        # 4. Validate SL makes sense
        if is_long and sl1 >= entry:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=[], sl_price=sl1,
                                   rejection_reason="Long signal but SL >= entry")
        if is_short and sl1 <= entry:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=[], sl_price=sl1,
                                   rejection_reason="Short signal but SL <= entry")

        # 5. SL distance sanity check
        sl_distance_pct = abs((entry - sl1) / entry * 100)
        if sl_distance_pct > 15:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=[], sl_price=sl1,
                                   rejection_reason=f"SL distance too large: {sl_distance_pct:.1f}%")

        # 6. Build TP levels (filter out None/0)
        tp_levels = [tp for tp in [tp1, tp2, tp3, tp4] if tp and tp > 0]

        # 7. Check if signal is still relevant (not stale)
        if status and status.lower() in ("closed_win", "closed_loss"):
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=tp_levels, sl_price=sl1,
                                   rejection_reason=f"Signal already closed: {status}")

        # 8. Check if already traded this signal
        already_traded = self.db.query(TradeOrder).filter(
            TradeOrder.signal_id == signal_id,
        ).first()

        if already_traded:
            return ProcessedSignal(valid=False, signal_id=signal_id, pair=pair,
                                   entry_price=entry, tp_levels=tp_levels, sl_price=sl1,
                                   rejection_reason="Already traded this signal")

        return ProcessedSignal(
            valid=True,
            signal_id=signal_id,
            pair=pair,
            entry_price=entry,
            tp_levels=tp_levels,
            sl_price=sl1,
            sl2_price=sl2 if sl2 and sl2 > 0 else None,
            risk_level=risk_level or "unknown",
            volume_rank=volume_rank,
        )

    def determine_side(self, entry: float, tp1: float) -> str:
        """Determine if signal is long (buy) or short (sell)."""
        return "buy" if tp1 > entry else "sell"
