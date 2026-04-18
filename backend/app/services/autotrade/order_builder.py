"""
LuxQuant Terminal - Order Builder
Builds complete execution plans from processed signals + user config.

Responsibilities:
    - Determine side (buy/sell) from entry vs TP
    - Build TP plan with partial-close percentages (strategy-based)
    - Attach trailing stop config
    - Set leverage, margin_mode correctly for market_type
"""
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass

from app.models.autotrade import AutotradeConfig
from app.services.autotrade.signal_processor import ProcessedSignal

logger = logging.getLogger("autotrade.order_builder")


# Pre-defined TP split strategies
TP_STRATEGIES = {
    "equal_split":  [25, 25, 25, 25],   # 25% at each TP
    "front_loaded": [40, 30, 20, 10],   # close more early
    "back_loaded":  [10, 20, 30, 40],   # let winners run
    "tp1_only":     [100, 0, 0, 0],     # exit all at TP1
}


@dataclass
class OrderPlan:
    """Complete plan for executing a signal."""
    pair: str
    side: str                  # buy | sell
    order_type: str            # market | limit
    qty: float
    entry_price: float         # intended price (signal.entry)
    leverage: int
    margin_mode: str
    market_type: str           # spot | futures

    # Initial SL
    sl_price: float

    # TP plan (partial close levels)
    tp_plan: List[Dict]
    # [{level:"tp1", price:X, qty_pct:25, filled:false, order_id:null}, ...]

    # Trailing stop
    trailing_enabled: bool = False
    trailing_type: str = ""
    trailing_value: float = 0
    trailing_activation: str = ""

    # Anti-liquid
    max_loss_amount: float = 0
    margin_to_allocate: float = 0

    # Metadata
    signal_id: str = ""


class OrderBuilder:
    """Builds OrderPlan from processed signal + user config."""

    def build_order_plan(
        self,
        signal: ProcessedSignal,
        config: AutotradeConfig,
        qty: float,
        leverage: int,
        margin_mode: str,
        max_loss_amount: float,
        margin_to_allocate: float,
    ) -> OrderPlan:
        """Build complete order execution plan."""

        # Direction
        side = "buy" if signal.tp_levels[0] > signal.entry_price else "sell"

        # Market type from config
        market_type = config.default_market_type

        # TP plan
        tp_plan = self._build_tp_plan(
            tp_levels=signal.tp_levels,
            strategy=config.tp_strategy,
            custom_splits=config.tp_custom_splits,
        )

        # Trailing config
        trailing_enabled = bool(config.trailing_stop_enabled)
        trailing_type = config.trailing_stop_type if trailing_enabled else ""
        trailing_value = float(config.trailing_stop_value) if trailing_enabled else 0
        trailing_activation = config.trailing_activation if trailing_enabled else ""

        # Normalize leverage + margin_mode based on market
        if market_type != "futures":
            leverage = 1
            margin_mode = "none"

        return OrderPlan(
            pair=signal.pair,
            side=side,
            order_type="market",
            qty=qty,
            entry_price=signal.entry_price,
            leverage=leverage,
            margin_mode=margin_mode,
            market_type=market_type,
            sl_price=signal.sl_price,
            tp_plan=tp_plan,
            trailing_enabled=trailing_enabled,
            trailing_type=trailing_type,
            trailing_value=trailing_value,
            trailing_activation=trailing_activation,
            max_loss_amount=max_loss_amount,
            margin_to_allocate=margin_to_allocate,
            signal_id=signal.signal_id,
        )

    # ========================================
    # Internal helpers
    # ========================================

    def _build_tp_plan(
        self,
        tp_levels: List[float],
        strategy: str,
        custom_splits: Optional[List] = None,
    ) -> List[Dict]:
        """
        Build TP execution plan with partial-close percentages.
        Ensures total qty_pct = 100%.
        """
        # Resolve splits
        if strategy == "custom" and custom_splits:
            splits = list(custom_splits)
        elif strategy in TP_STRATEGIES:
            splits = list(TP_STRATEGIES[strategy])
        else:
            splits = list(TP_STRATEGIES["equal_split"])

        # Build plan entries
        plan = []
        for i, tp_price in enumerate(tp_levels):
            if i < len(splits) and splits[i] > 0:
                plan.append({
                    "level": f"tp{i+1}",
                    "price": float(tp_price),
                    "qty_pct": float(splits[i]),
                    "filled": False,
                    "order_id": None,
                })

        # Redistribute unused splits (fewer TPs than splits)
        if len(tp_levels) < len(splits) and plan:
            remaining = sum(splits[len(tp_levels):])
            plan[-1]["qty_pct"] += remaining

        # Normalize to 100%
        total = sum(p["qty_pct"] for p in plan)
        if total > 0 and abs(total - 100) > 0.1:
            factor = 100.0 / total
            for p in plan:
                p["qty_pct"] = round(p["qty_pct"] * factor, 1)

        return plan
