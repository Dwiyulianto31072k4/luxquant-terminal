"""
LuxQuant Terminal - Signal Processor
Validates and filters signals from the `signals` table before auto-trading.

Responsibilities:
    1. Basic validation (non-null pair, entry, SL, TP)
    2. Direction detection (long/short based on entry vs TP)
    3. Sanity check on SL distance
    4. Filter out stale/closed signals
    5. Deduplicate (skip signals already traded for same user-account combo)
"""
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.autotrade import TradeOrder

logger = logging.getLogger("autotrade.signal")


@dataclass
class ProcessedSignal:
    """Validated signal ready for risk assessment + execution."""
    valid: bool
    signal_id: str
    pair: str
    entry_price: float
    tp_levels: List[float]            # [tp1, tp2, tp3, tp4] (filtered for non-null)
    sl_price: float                   # stop1
    sl2_price: Optional[float] = None # stop2
    risk_level: str = ""
    volume_rank: Optional[int] = None
    rejection_reason: Optional[str] = None


class SignalProcessor:
    """Processes raw signals from DB into validated trading parameters."""

    # Max acceptable SL distance (%) — beyond this, likely bad signal data
    MAX_SL_DISTANCE_PCT = 15.0

    def __init__(self, db: Session):
        self.db = db

    def process_signal(self, signal_row: Dict) -> ProcessedSignal:
        """
        Validate a raw signal from `signals` table.
        signal_row is dict-like (sqlalchemy row._mapping or dict).
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
            return self._reject(signal_id, pair, 0, [], 0, "Missing pair")

        if not entry or entry <= 0:
            return self._reject(signal_id, pair, 0, [], 0, "Invalid entry price")

        if not sl1 or sl1 <= 0:
            return self._reject(signal_id, pair, entry, [], 0, "Missing stop loss")

        if not tp1 or tp1 <= 0:
            return self._reject(signal_id, pair, entry, [], sl1, "Missing take profit")

        # 2. Ensure pair is USDT-margined
        if not pair.endswith("USDT"):
            return self._reject(signal_id, pair, entry, [], sl1, f"Pair {pair} not USDT-margined")

        # 3. Direction
        is_long = tp1 > entry
        is_short = tp1 < entry

        # 4. SL sanity vs direction
        if is_long and sl1 >= entry:
            return self._reject(signal_id, pair, entry, [], sl1, "Long signal but SL >= entry")
        if is_short and sl1 <= entry:
            return self._reject(signal_id, pair, entry, [], sl1, "Short signal but SL <= entry")

        # 5. SL distance bounds
        sl_distance_pct = abs((entry - sl1) / entry * 100)
        if sl_distance_pct > self.MAX_SL_DISTANCE_PCT:
            return self._reject(
                signal_id, pair, entry, [], sl1,
                f"SL distance too large: {sl_distance_pct:.1f}%",
            )

        # 6. Build TP levels
        tp_levels = [tp for tp in [tp1, tp2, tp3, tp4] if tp and tp > 0]

        # 7. Not already closed
        if status and status.lower() in ("closed_win", "closed_loss"):
            return self._reject(
                signal_id, pair, entry, tp_levels, sl1,
                f"Signal already closed: {status}",
            )

        return ProcessedSignal(
            valid=True,
            signal_id=signal_id,
            pair=pair,
            entry_price=float(entry),
            tp_levels=[float(t) for t in tp_levels],
            sl_price=float(sl1),
            sl2_price=float(sl2) if sl2 and sl2 > 0 else None,
            risk_level=risk_level or "unknown",
            volume_rank=int(volume_rank) if volume_rank else None,
        )

    def determine_side(self, entry: float, tp1: float) -> str:
        """Long (buy) if TP1 > entry, else short (sell)."""
        return "buy" if tp1 > entry else "sell"

    def is_already_traded_by_account(self, signal_id: str, user_id: int, account_id: int) -> bool:
        """Check if a signal has already been traded by this user-account combo."""
        existing = self.db.query(TradeOrder).filter(
            TradeOrder.signal_id == signal_id,
            TradeOrder.user_id == user_id,
            TradeOrder.exchange_account_id == account_id,
        ).first()
        return existing is not None

    # ========================================
    # Internal helpers
    # ========================================

    def _reject(
        self,
        signal_id: str,
        pair: str,
        entry: float,
        tp_levels: List[float],
        sl: float,
        reason: str,
    ) -> ProcessedSignal:
        return ProcessedSignal(
            valid=False,
            signal_id=signal_id,
            pair=pair,
            entry_price=float(entry),
            tp_levels=tp_levels,
            sl_price=float(sl),
            rejection_reason=reason,
        )
