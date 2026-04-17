"""
LuxQuant Terminal - Position Tracker
Monitors open positions for:
- Trailing stop updates (custom backend logic)
- Anti-liquidation / margin health
- TP partial close execution
- SL adjustment (breakeven after TP1, etc.)
Runs as a background worker every N seconds.
"""
import logging
import asyncio
from typing import Optional, List, Dict
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.autotrade import AutotradeConfig, TradeOrder, TradeLog, ExchangeAccount
from app.services.autotrade.exchange_adapter import ExchangeAdapter, create_adapter_from_db
from app.services.autotrade.risk_manager import RiskManager

logger = logging.getLogger("autotrade.position_tracker")


class PositionTracker:
    """
    Background worker that monitors all open positions.
    Handles trailing stop, anti-liquid, and TP/SL management.
    """

    def __init__(self, db: Session):
        self.db = db
        self.risk_manager = RiskManager(db)
        self._adapters: Dict[int, ExchangeAdapter] = {}  # cache by account_id

    async def _get_adapter(self, account: ExchangeAccount) -> ExchangeAdapter:
        if account.id not in self._adapters:
            self._adapters[account.id] = create_adapter_from_db(account)
        return self._adapters[account.id]

    async def close_all_adapters(self):
        for adapter in self._adapters.values():
            await adapter.close()
        self._adapters.clear()

    # ========================================
    # Main Loop
    # ========================================

    async def run_cycle(self):
        """
        One monitoring cycle. Called by engine every N seconds.
        Processes all open trades across all users and exchanges.
        """
        open_trades = self.db.query(TradeOrder).filter(
            TradeOrder.status.in_(["filled", "partial"]),
        ).all()

        if not open_trades:
            return

        # Group by exchange account for efficient API calls
        by_account: Dict[int, List[TradeOrder]] = {}
        for trade in open_trades:
            by_account.setdefault(trade.exchange_account_id, []).append(trade)

        for account_id, trades in by_account.items():
            try:
                account = self.db.query(ExchangeAccount).filter(
                    ExchangeAccount.id == account_id
                ).first()
                if not account or not account.is_active:
                    continue

                config = self.db.query(AutotradeConfig).filter(
                    AutotradeConfig.exchange_account_id == account_id,
                ).first()

                adapter = await self._get_adapter(account)

                for trade in trades:
                    await self._process_trade(trade, config, adapter)

            except Exception as e:
                logger.error(f"Error processing account {account_id}: {e}")

    # ========================================
    # Per-Trade Processing
    # ========================================

    async def _process_trade(
        self,
        trade: TradeOrder,
        config: Optional[AutotradeConfig],
        adapter: ExchangeAdapter,
    ):
        """Process a single open trade: trailing, anti-liquid, TP check."""
        try:
            # Fetch current price
            price = await adapter.fetch_price(trade.pair, trade.market_type)
            if not price or price <= 0:
                return

            # 1. Update price tracking (highest/lowest)
            self._update_price_extremes(trade, price)

            # 2. Trailing stop
            if trade.trailing_enabled and config:
                await self._handle_trailing_stop(trade, config, adapter, price)

            # 3. Anti-liquidation check
            if config and config.max_loss_protection_enabled:
                await self._handle_anti_liquid(trade, config, adapter, price)

            # 4. SL to breakeven after TP hit
            if config and config.sl_to_breakeven_after:
                await self._handle_breakeven_sl(trade, config, adapter, price)

            self.db.commit()

        except Exception as e:
            logger.error(f"Error processing trade {trade.id} ({trade.pair}): {e}")

    # ========================================
    # Trailing Stop Logic (Custom Backend)
    # ========================================

    async def _handle_trailing_stop(
        self,
        trade: TradeOrder,
        config: AutotradeConfig,
        adapter: ExchangeAdapter,
        current_price: float,
    ):
        """Custom trailing stop — runs every cycle for eligible trades."""

        # Check activation condition
        if not trade.trailing_activated:
            activated = self._check_trailing_activation(trade, config, current_price)
            if not activated:
                return
            trade.trailing_activated = True
            self._log_event(trade, "trailing_activated", {
                "activation": trade.trailing_activation,
                "price": current_price,
            })

        # Calculate new trailing SL
        new_sl = self._calculate_trailing_sl(trade, current_price)

        if new_sl is None:
            return

        # Only move SL in profit direction
        current_sl = trade.sl_current or trade.sl_price
        if trade.side == "buy":
            if new_sl <= current_sl:
                return  # Don't move SL down for longs
        else:
            if new_sl >= current_sl:
                return  # Don't move SL up for shorts

        # Update SL on exchange
        result = await adapter.update_stop_loss(
            symbol=trade.pair,
            new_sl=new_sl,
            qty=trade.qty_filled,
            side=trade.side,
            market_type=trade.market_type,
            old_sl_order_id=trade.sl_order_id,
        )

        if result.success:
            old_sl = trade.sl_current
            trade.sl_current = new_sl
            trade.sl_order_id = result.exchange_order_id
            trade.last_trail_updated_at = datetime.now(timezone.utc)

            self._log_event(trade, "trailing_sl_updated", {
                "old_sl": old_sl,
                "new_sl": new_sl,
                "price": current_price,
                "highest": float(trade.highest_price) if trade.highest_price else None,
                "lowest": float(trade.lowest_price) if trade.lowest_price else None,
            })
            logger.info(f"Trailing SL updated: {trade.pair} {old_sl} → {new_sl} (price: {current_price})")
        else:
            logger.warning(f"Trailing SL update failed for {trade.pair}: {result.error}")

    def _check_trailing_activation(
        self,
        trade: TradeOrder,
        config: AutotradeConfig,
        current_price: float,
    ) -> bool:
        """Check if trailing stop should activate based on config."""
        activation = trade.trailing_activation or config.trailing_activation or "breakeven"
        entry = trade.entry_price or trade.target_entry

        if activation == "immediate":
            return True

        elif activation == "breakeven":
            if trade.side == "buy":
                return current_price >= entry
            else:
                return current_price <= entry

        elif activation == "after_tp1":
            # Check if TP1 has been hit
            if trade.tp_orders:
                for tp in trade.tp_orders:
                    if tp.get("level") == "tp1" and tp.get("filled"):
                        return True
            return False

        return False

    def _calculate_trailing_sl(self, trade: TradeOrder, current_price: float) -> Optional[float]:
        """Calculate new trailing SL based on type (percent or fixed)."""
        trail_type = trade.trailing_type or "percent"
        trail_value = float(trade.trailing_value or 1.5)

        if trade.side == "buy":
            # Long: trail below highest price
            ref_price = float(trade.highest_price) if trade.highest_price else current_price
            ref_price = max(ref_price, current_price)

            if trail_type == "percent":
                distance = ref_price * (trail_value / 100.0)
            else:  # fixed_usdt
                distance = trail_value

            new_sl = ref_price - distance

        else:
            # Short: trail above lowest price
            ref_price = float(trade.lowest_price) if trade.lowest_price else current_price
            ref_price = min(ref_price, current_price)

            if trail_type == "percent":
                distance = ref_price * (trail_value / 100.0)
            else:
                distance = trail_value

            new_sl = ref_price + distance

        # Safety: max trailing distance (optional)
        if trade.trailing_value and hasattr(trade, '_config_max_distance'):
            max_dist = trade._config_max_distance
            if max_dist:
                entry = trade.entry_price or trade.target_entry
                if abs(new_sl - entry) / entry > max_dist / 100.0:
                    return None  # Would exceed max distance

        return round(new_sl, 8)

    # ========================================
    # Anti-Liquidation
    # ========================================

    async def _handle_anti_liquid(
        self,
        trade: TradeOrder,
        config: AutotradeConfig,
        adapter: ExchangeAdapter,
        current_price: float,
    ):
        """Check margin health and take emergency action if needed."""

        # Method 1: Check via unrealized loss vs max_loss_amount
        action = self.risk_manager.check_emergency_loss(config, trade, current_price)

        if action == "emergency_close":
            emergency_action = config.emergency_action or "partial_close"

            if emergency_action == "full_close":
                result = await adapter.emergency_full_close(
                    trade.pair, trade.side, trade.qty_filled, trade.market_type
                )
                if result.success:
                    trade.status = "closed"
                    trade.close_reason = "emergency"
                    trade.closed_at = datetime.now(timezone.utc)
                    self._log_event(trade, "emergency_full_close", {
                        "price": current_price,
                        "reason": "max_loss_exceeded",
                    })

            elif emergency_action == "partial_close":
                result = await adapter.emergency_partial_close(
                    trade.pair, trade.side, trade.qty_filled,
                    close_pct=50.0, market_type=trade.market_type,
                )
                if result.success:
                    trade.qty_filled -= result.filled_qty
                    trade.status = "partial"
                    self._log_event(trade, "emergency_partial_close", {
                        "price": current_price,
                        "closed_qty": result.filled_qty,
                        "remaining_qty": trade.qty_filled,
                    })

            elif emergency_action == "add_margin" and config.auto_topup_margin:
                # Top up isolated margin
                topup_amount = (trade.margin_allocated or 0) * (float(config.auto_topup_max_pct) / 100.0)
                if topup_amount > 0:
                    success = await adapter.add_margin(trade.pair, topup_amount)
                    if success:
                        trade.margin_allocated = (trade.margin_allocated or 0) + topup_amount
                        self._log_event(trade, "margin_topup", {
                            "amount": topup_amount,
                            "new_total": trade.margin_allocated,
                        })

    # ========================================
    # SL to Breakeven
    # ========================================

    async def _handle_breakeven_sl(
        self,
        trade: TradeOrder,
        config: AutotradeConfig,
        adapter: ExchangeAdapter,
        current_price: float,
    ):
        """Move SL to breakeven (entry price) after configured TP level is hit."""
        trigger_level = config.sl_to_breakeven_after  # "tp1", "tp2", etc.
        if not trigger_level:
            return

        entry = trade.entry_price or trade.target_entry
        current_sl = trade.sl_current or trade.sl_price

        # Check if already at or past breakeven
        if trade.side == "buy" and current_sl >= entry:
            return
        if trade.side == "sell" and current_sl <= entry:
            return

        # Check if the trigger TP has been hit
        if not trade.tp_orders:
            return

        tp_hit = False
        for tp in trade.tp_orders:
            if tp.get("level") == trigger_level and tp.get("filled"):
                tp_hit = True
                break

        if not tp_hit:
            return

        # Move SL to entry (breakeven)
        result = await adapter.update_stop_loss(
            symbol=trade.pair,
            new_sl=entry,
            qty=trade.qty_filled,
            side=trade.side,
            market_type=trade.market_type,
            old_sl_order_id=trade.sl_order_id,
        )

        if result.success:
            trade.sl_current = entry
            trade.sl_order_id = result.exchange_order_id
            self._log_event(trade, "sl_moved_breakeven", {
                "trigger": trigger_level,
                "old_sl": current_sl,
                "new_sl": entry,
            })

    # ========================================
    # Helpers
    # ========================================

    def _update_price_extremes(self, trade: TradeOrder, current_price: float):
        """Track highest/lowest price since entry for trailing stop."""
        if trade.side == "buy":
            if trade.highest_price is None or current_price > float(trade.highest_price):
                trade.highest_price = current_price
        else:
            if trade.lowest_price is None or current_price < float(trade.lowest_price):
                trade.lowest_price = current_price

    def _log_event(self, trade: TradeOrder, event: str, details: Dict):
        """Create audit log entry."""
        log = TradeLog(
            trade_order_id=trade.id,
            user_id=trade.user_id,
            event=event,
            details=details,
        )
        self.db.add(log)
