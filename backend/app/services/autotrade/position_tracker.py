"""
LuxQuant Terminal - Position Tracker
Runs periodic monitoring loop for all open trade_orders.

For each open position, checks:
    1. TP hit detection (if exchange didn't auto-fill)
    2. Trailing stop activation & update
    3. Anti-liquidation margin health (futures only)
    4. Max-loss protection trigger
    5. Breakeven SL move (after TP1/TP2 hit)

Runs every `trailing_update_interval` seconds (default 12-15s).
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.autotrade import TradeOrder, AutotradeConfig, ExchangeAccount, TradeLog
from app.services.autotrade.exchange_adapter import (
    ExchangeAdapter, create_adapter_from_db, PositionInfo
)
from app.services.autotrade.risk_manager import RiskManager
from app.services.autotrade.notifier import Notifier

logger = logging.getLogger("autotrade.tracker")


class PositionTracker:
    """Monitors open positions and triggers SL/trailing/emergency actions."""

    def __init__(self, db: Session):
        self.db = db
        self.notifier = Notifier()
        self._adapters: Dict[int, ExchangeAdapter] = {}  # exchange_account_id → adapter

    async def run_cycle(self):
        """Single monitoring pass over all open positions."""
        open_trades = self._get_open_trades()
        if not open_trades:
            return

        logger.info(f"Monitoring {len(open_trades)} open positions")

        # Group trades by exchange_account_id
        by_account: Dict[int, List[TradeOrder]] = {}
        for t in open_trades:
            by_account.setdefault(t.exchange_account_id, []).append(t)

        for account_id, trades in by_account.items():
            try:
                await self._process_account_trades(account_id, trades)
            except Exception as e:
                logger.error(f"Error monitoring account {account_id}: {e}")

    async def close_all_adapters(self):
        """Close all cached adapter sessions."""
        for adapter in self._adapters.values():
            try:
                await adapter.close()
            except Exception:
                pass
        self._adapters.clear()

    # ========================================
    # Core monitoring logic
    # ========================================

    async def _process_account_trades(self, account_id: int, trades: List[TradeOrder]):
        """Process all trades for a single exchange account."""
        account = self.db.query(ExchangeAccount).filter(
            ExchangeAccount.id == account_id
        ).first()
        if not account:
            return

        config = self.db.query(AutotradeConfig).filter(
            AutotradeConfig.exchange_account_id == account_id
        ).first()
        if not config:
            return

        adapter = await self._get_adapter(account)

        # Fetch live positions (futures only)
        live_positions: Dict[str, PositionInfo] = {}
        futures_trades = [t for t in trades if t.market_type == "futures"]
        if futures_trades:
            try:
                positions = await adapter.fetch_positions()
                for p in positions:
                    key = p.symbol.replace("/", "").replace(":USDT", "")
                    live_positions[key] = p
            except Exception as e:
                logger.warning(f"Fetch positions failed for {account_id}: {e}")

        # Process each trade
        for trade in trades:
            try:
                await self._monitor_single_trade(
                    adapter, trade, config, live_positions,
                )
            except Exception as e:
                logger.error(f"Monitor trade {trade.id} failed: {e}")

    async def _monitor_single_trade(
        self,
        adapter: ExchangeAdapter,
        trade: TradeOrder,
        config: AutotradeConfig,
        live_positions: Dict[str, PositionInfo],
    ):
        """Run all checks for a single trade."""
        # Current price
        current_price = await adapter.fetch_price(trade.pair, trade.market_type)
        if not current_price or current_price <= 0:
            return

        # 1. TP hit detection (manual fallback if TP order not placed at exchange)
        await self._check_tp_hits(adapter, trade, current_price, config)

        # 2. SL move to breakeven (after TP threshold met)
        await self._check_breakeven_move(adapter, trade, config)

        # 3. Trailing stop
        if trade.trailing_enabled and trade.status in ("filled", "partial"):
            await self._update_trailing_stop(adapter, trade, current_price, config)

        # 4. Anti-liquid (futures only)
        if trade.market_type == "futures":
            pos_key = trade.pair
            live_pos = live_positions.get(pos_key)
            if live_pos:
                await self._check_margin_health(adapter, trade, live_pos, config)

        # 5. Max-loss protection
        if config.max_loss_protection_enabled and trade.market_type == "futures":
            pos_key = trade.pair
            live_pos = live_positions.get(pos_key)
            if live_pos and live_pos.unrealized_pnl < 0:
                balance = await adapter.fetch_balance(trade.market_type)
                rm = RiskManager(self.db)
                if rm.should_emergency_close(config, live_pos.unrealized_pnl, balance.free_usd):
                    await self._emergency_close(adapter, trade, reason="max_loss_hit")

        self.db.flush()

    # ========================================
    # TP hit detection
    # ========================================

    async def _check_tp_hits(
        self,
        adapter: ExchangeAdapter,
        trade: TradeOrder,
        current_price: float,
        config: AutotradeConfig,
    ):
        """
        Check if TP levels were hit.
        For each unfilled TP in tp_orders, if current price crossed it, mark as filled.
        """
        if not trade.tp_orders:
            return

        updated = False
        for tp in trade.tp_orders:
            if tp.get("filled"):
                continue
            tp_price = tp.get("price", 0)
            if tp_price <= 0:
                continue

            hit = False
            if trade.side == "buy" and current_price >= tp_price:
                hit = True
            elif trade.side == "sell" and current_price <= tp_price:
                hit = True

            if hit:
                tp["filled"] = True
                tp["filled_at"] = datetime.now(timezone.utc).isoformat()
                updated = True
                self._log_event(trade, "tp_hit", {"level": tp["level"], "price": tp_price})
                logger.info(f"TP hit on trade {trade.id}: {tp['level']} @ {tp_price}")

        if updated:
            # Mark trade_orders.tp_orders as modified (JSONB mutation)
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(trade, "tp_orders")

            # Check if all TPs filled → close position
            all_filled = all(t.get("filled") for t in trade.tp_orders)
            if all_filled:
                trade.status = "closed"
                trade.close_reason = trade.tp_orders[-1]["level"]
                trade.closed_at = datetime.now(timezone.utc)
                await self.notifier.send_trade_notification(trade.user_id, trade, "closed_win")

    # ========================================
    # SL-to-breakeven
    # ========================================

    async def _check_breakeven_move(
        self,
        adapter: ExchangeAdapter,
        trade: TradeOrder,
        config: AutotradeConfig,
    ):
        """
        Move SL to entry (breakeven) after configured TP level hit.
        Only executes once: when sl_current is still at original SL.
        """
        trigger = config.sl_to_breakeven_after
        if trigger == "never" or not trade.tp_orders:
            return

        # Check if we've already moved SL past entry
        if not trade.entry_price or not trade.sl_current:
            return

        if trade.side == "buy" and trade.sl_current >= trade.entry_price:
            return  # already at/past breakeven
        if trade.side == "sell" and trade.sl_current <= trade.entry_price:
            return

        # Check if trigger TP was hit
        target_level = trigger  # "tp1" or "tp2"
        matched = next((t for t in trade.tp_orders if t.get("level") == target_level), None)
        if not matched or not matched.get("filled"):
            return

        # Move SL to entry
        new_sl = trade.entry_price
        remaining_qty = trade.qty * sum(
            (100 - t.get("qty_pct", 0)) / 100
            for t in trade.tp_orders if not t.get("filled")
        ) / max(len([t for t in trade.tp_orders if not t.get("filled")]), 1)

        result = await adapter.update_stop_loss(
            symbol=trade.pair,
            new_sl=new_sl,
            qty=remaining_qty,
            side=trade.side,
            market_type=trade.market_type,
            old_sl_order_id=trade.sl_order_id,
        )

        if result.success:
            trade.sl_current = new_sl
            trade.sl_order_id = result.exchange_order_id
            self._log_event(trade, "sl_moved", {
                "new_sl": new_sl,
                "reason": f"breakeven_after_{target_level}",
            })
            await self.notifier.send_trade_notification(trade.user_id, trade, "breakeven")

    # ========================================
    # Trailing stop
    # ========================================

    async def _update_trailing_stop(
        self,
        adapter: ExchangeAdapter,
        trade: TradeOrder,
        current_price: float,
        config: AutotradeConfig,
    ):
        """
        Manual trailing stop logic.
        For long:  new_sl = highest_price - trailing_distance
        For short: new_sl = lowest_price + trailing_distance
        Only moves SL in favor of profit (never backwards).
        """
        # Check activation
        if not trade.trailing_activated:
            if not self._should_activate_trailing(trade, current_price):
                return
            trade.trailing_activated = True
            self._log_event(trade, "trailing_activated", {"price": current_price})

        # Update high/low watermark
        if trade.side == "buy":
            highest = float(trade.highest_price or 0)
            if current_price > highest:
                trade.highest_price = Decimal(str(current_price))
                highest = current_price
            peak_price = highest
        else:
            lowest = float(trade.lowest_price or float("inf"))
            if current_price < lowest:
                trade.lowest_price = Decimal(str(current_price))
                lowest = current_price
            peak_price = lowest

        # Calculate new SL based on trailing type
        trailing_val = float(trade.trailing_value or 0)
        if trade.trailing_type == "percent":
            distance = peak_price * (trailing_val / 100.0)
        else:  # fixed_usdt
            distance = trailing_val

        if trade.side == "buy":
            new_sl = peak_price - distance
            if new_sl <= (trade.sl_current or 0):
                return  # SL would move backwards
        else:
            new_sl = peak_price + distance
            if new_sl >= (trade.sl_current or float("inf")):
                return

        # Apply max trailing distance cap
        if config.max_trailing_distance:
            max_dist = float(config.max_trailing_distance)
            if distance > peak_price * (max_dist / 100.0):
                return  # trailing too wide, skip

        # Update SL at exchange
        remaining_qty = self._remaining_qty(trade)
        if remaining_qty <= 0:
            return

        result = await adapter.update_stop_loss(
            symbol=trade.pair,
            new_sl=new_sl,
            qty=remaining_qty,
            side=trade.side,
            market_type=trade.market_type,
            old_sl_order_id=trade.sl_order_id,
        )

        if result.success:
            trade.sl_current = new_sl
            trade.sl_order_id = result.exchange_order_id
            trade.last_trail_updated_at = datetime.now(timezone.utc)
            self._log_event(trade, "trailing_updated", {
                "new_sl": new_sl,
                "price": current_price,
            })
            await self.notifier.send_trade_notification(trade.user_id, trade, "trailing_sl")

    def _should_activate_trailing(self, trade: TradeOrder, current_price: float) -> bool:
        """Check if trailing should activate based on trailing_activation mode."""
        mode = trade.trailing_activation or "breakeven"

        if mode == "immediate":
            return True

        if mode == "breakeven":
            if trade.side == "buy":
                return current_price >= (trade.entry_price or 0)
            else:
                return current_price <= (trade.entry_price or float("inf"))

        if mode == "after_tp1":
            if not trade.tp_orders:
                return False
            tp1 = next((t for t in trade.tp_orders if t.get("level") == "tp1"), None)
            return bool(tp1 and tp1.get("filled"))

        return False

    def _remaining_qty(self, trade: TradeOrder) -> float:
        """Qty left after partial TP fills."""
        if not trade.tp_orders:
            return float(trade.qty)
        filled_pct = sum(t.get("qty_pct", 0) for t in trade.tp_orders if t.get("filled"))
        return float(trade.qty) * (100 - filled_pct) / 100.0

    # ========================================
    # Anti-liquid margin check
    # ========================================

    async def _check_margin_health(
        self,
        adapter: ExchangeAdapter,
        trade: TradeOrder,
        position: PositionInfo,
        config: AutotradeConfig,
    ):
        """Check margin ratio and trigger emergency action if needed."""
        if position.margin_ratio is None:
            return

        margin_ratio_pct = position.margin_ratio * 100 if position.margin_ratio < 10 else position.margin_ratio

        rm = RiskManager(self.db)
        alert = rm.check_margin_health(config, margin_ratio_pct)

        if alert.level == "safe":
            return

        if alert.level == "warning":
            self._log_event(trade, "margin_warning", {"margin_ratio": margin_ratio_pct})
            await self.notifier.send_alert(
                f"⚠️ Margin warning on {trade.pair}: ratio {margin_ratio_pct:.1f}%"
            )
            return

        # Danger or critical — execute action
        if alert.action_required == "partial_close":
            result = await adapter.emergency_partial_close(
                trade.pair, trade.side, trade.qty, alert.close_pct, trade.market_type
            )
            if result.success:
                trade.status = "partial"
                self._log_event(trade, "emergency_partial_close", {
                    "close_pct": alert.close_pct,
                    "margin_ratio": margin_ratio_pct,
                })
                await self.notifier.send_trade_notification(trade.user_id, trade, "emergency")

        elif alert.action_required == "tighten_sl":
            # Tighten SL to 0.5% from current price
            tight_sl = trade.entry_price * 0.995 if trade.side == "buy" else trade.entry_price * 1.005
            result = await adapter.update_stop_loss(
                trade.pair, tight_sl, self._remaining_qty(trade),
                trade.side, trade.market_type, trade.sl_order_id,
            )
            if result.success:
                trade.sl_current = tight_sl
                trade.sl_order_id = result.exchange_order_id

        elif alert.action_required == "add_margin":
            topup_amount = float(trade.margin_allocated or 0) * (float(config.auto_topup_max_pct) / 100.0)
            if topup_amount > 0:
                await adapter.add_margin(trade.pair, topup_amount, trade.market_type)
                self._log_event(trade, "margin_topup", {"amount": topup_amount})

        elif alert.action_required == "full_close":
            await self._emergency_close(adapter, trade, reason="margin_critical")

    # ========================================
    # Emergency close
    # ========================================

    async def _emergency_close(self, adapter: ExchangeAdapter, trade: TradeOrder, reason: str):
        """Full close position via market order."""
        remaining = self._remaining_qty(trade)
        result = await adapter.emergency_full_close(
            trade.pair, trade.side, remaining, trade.market_type
        )
        if result.success:
            trade.status = "closed"
            trade.close_reason = "emergency"
            trade.closed_at = datetime.now(timezone.utc)
            self._log_event(trade, "emergency_closed", {"reason": reason})
            await self.notifier.send_trade_notification(trade.user_id, trade, "emergency")

    # ========================================
    # DB helpers
    # ========================================

    def _get_open_trades(self) -> List[TradeOrder]:
        return self.db.query(TradeOrder).filter(
            TradeOrder.status.in_(["filled", "partial"]),
        ).all()

    async def _get_adapter(self, account: ExchangeAccount) -> ExchangeAdapter:
        """Cache adapters per cycle."""
        if account.id not in self._adapters:
            self._adapters[account.id] = create_adapter_from_db(account)
        return self._adapters[account.id]

    def _log_event(self, trade: TradeOrder, event: str, details: Optional[Dict] = None):
        log = TradeLog(
            trade_order_id=trade.id,
            user_id=trade.user_id,
            event=event,
            details=details or {},
        )
        self.db.add(log)
