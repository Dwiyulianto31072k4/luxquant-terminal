"""
LuxQuant Terminal - Order Builder
Builds exchange orders from processed signals with TP/SL strategy.
Handles: partial close, trailing stop setup, market/limit selection.
"""
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass

from app.models.autotrade import AutotradeConfig
from app.services.autotrade.signal_processor import ProcessedSignal

logger = logging.getLogger("autotrade.order_builder")


# Pre-defined TP split strategies
TP_STRATEGIES = {
    "equal_split": [25, 25, 25, 25],     # 25% at each TP
    "front_loaded": [40, 30, 20, 10],    # bigger close early
    "back_loaded": [10, 20, 30, 40],     # bigger close late (let it run)
    "tp1_only": [100, 0, 0, 0],          # close all at TP1
}


@dataclass
class OrderPlan:
    """Complete plan for executing a signal."""
    pair: str
    side: str                    # buy or sell
    order_type: str              # market or limit
    qty: float
    entry_price: float
    leverage: int
    margin_mode: str
    market_type: str             # spot or futures

    # Initial SL
    sl_price: float

    # TP plan (partial close levels)
    tp_plan: List[Dict]          # [{level: "tp1", price: X, qty_pct: 25}, ...]

    # Trailing stop config (if enabled)
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
    """
    Builds a complete OrderPlan from a processed signal + config.
    """

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

        side = "buy" if signal.tp_levels[0] > signal.entry_price else "sell"
        market_type = config.default_market_type

        # Build TP plan
        tp_plan = self._build_tp_plan(
            tp_levels=signal.tp_levels,
            strategy=config.tp_strategy,
            custom_splits=config.tp_custom_splits,
        )

        # Order type: market for now (limit can be added later)
        order_type = "market"

        # Trailing stop config
        trailing_enabled = config.trailing_stop_enabled
        trailing_type = config.trailing_stop_type if trailing_enabled else ""
        trailing_value = float(config.trailing_stop_value) if trailing_enabled else 0
        trailing_activation = config.trailing_activation if trailing_enabled else ""

        return OrderPlan(
            pair=signal.pair,
            side=side,
            order_type=order_type,
            qty=qty,
            entry_price=signal.entry_price,
            leverage=leverage if market_type == "futures" else 1,
            margin_mode=margin_mode if market_type == "futures" else "none",
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

    def _build_tp_plan(
        self,
        tp_levels: List[float],
        strategy: str,
        custom_splits: Optional[List] = None,
    ) -> List[Dict]:
        """
        Build TP execution plan with partial close percentages.
        """
        if strategy == "custom" and custom_splits:
            splits = custom_splits
        elif strategy in TP_STRATEGIES:
            splits = TP_STRATEGIES[strategy]
        else:
            splits = TP_STRATEGIES["equal_split"]

        plan = []
        for i, tp_price in enumerate(tp_levels):
            if i < len(splits) and splits[i] > 0:
                plan.append({
                    "level": f"tp{i+1}",
                    "price": tp_price,
                    "qty_pct": splits[i],
                    "filled": False,
                    "order_id": None,
                })

        # If fewer TP levels than splits, redistribute remaining % to last level
        if len(tp_levels) < len(splits):
            remaining = sum(splits[len(tp_levels):])
            if plan:
                plan[-1]["qty_pct"] += remaining

        # Normalize to ensure total = 100%
        total = sum(p["qty_pct"] for p in plan)
        if total > 0 and abs(total - 100) > 0.1:
            factor = 100.0 / total
            for p in plan:
                p["qty_pct"] = round(p["qty_pct"] * factor, 1)

        return plan
