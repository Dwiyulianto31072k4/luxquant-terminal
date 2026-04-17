"""
LuxQuant Terminal - Autotrade Engine
Main worker loop that orchestrates signal processing and position monitoring.
Listens for new signals via PostgreSQL LISTEN/NOTIFY and runs periodic cycles.
"""
import logging
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional

import asyncpg
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.config import settings
from app.models.autotrade import (
    ExchangeAccount, AutotradeConfig, TradeOrder, TradeLog
)
from app.services.autotrade.signal_processor import SignalProcessor
from app.services.autotrade.risk_manager import RiskManager
from app.services.autotrade.order_builder import OrderBuilder
from app.services.autotrade.position_tracker import PositionTracker
from app.services.autotrade.exchange_adapter import create_adapter_from_db
from app.services.autotrade.notifier import Notifier

logger = logging.getLogger("autotrade.engine")


class AutotradeEngine:
    """
    Main autotrade worker. Runs two loops:
    1. Signal listener — picks up new signals and executes trades
    2. Position monitor — trailing stop, anti-liquid, TP/SL management
    """

    def __init__(self):
        self.running = False
        self.position_monitor_interval = 12  # seconds
        self.notifier = Notifier()

    async def start(self):
        """Start the autotrade engine."""
        self.running = True
        logger.info("Autotrade engine starting...")

        # Run both loops concurrently
        await asyncio.gather(
            self._signal_listener_loop(),
            self._position_monitor_loop(),
        )

    async def stop(self):
        """Gracefully stop the engine."""
        self.running = False
        logger.info("Autotrade engine stopping...")

    # ========================================
    # Signal Listener (DB LISTEN/NOTIFY)
    # ========================================

    async def _signal_listener_loop(self):
        """Listen for new signals via PostgreSQL NOTIFY."""
        while self.running:
            try:
                conn = await asyncpg.connect(settings.DATABASE_URL)
                await conn.add_listener("new_signal", self._on_new_signal)
                logger.info("Listening for new signals on 'new_signal' channel...")

                # Keep connection alive
                while self.running:
                    await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"Signal listener error: {e}")
                await asyncio.sleep(5)  # retry after 5s

    def _on_new_signal(self, conn, pid, channel, payload):
        """Callback when new signal is inserted."""
        try:
            data = json.loads(payload)
            logger.info(f"New signal received: {data.get('pair')} ({data.get('signal_id')})")
            asyncio.create_task(self._process_new_signal(data))
        except Exception as e:
            logger.error(f"Error parsing signal notification: {e}")

    async def _process_new_signal(self, signal_data: dict):
        """Process a new signal: validate → risk check → execute on all enabled accounts."""
        db = SessionLocal()
        try:
            signal_id = signal_data.get("signal_id")
            if not signal_id:
                return

            # Fetch full signal from DB
            result = db.execute(
                "SELECT * FROM signals WHERE signal_id = :sid",
                {"sid": signal_id}
            )
            row = result.fetchone()
            if not row:
                logger.warning(f"Signal {signal_id} not found in DB")
                return

            signal_dict = dict(row._mapping)

            # Process signal
            processor = SignalProcessor(db)
            processed = processor.process_signal(signal_dict)

            if not processed.valid:
                logger.info(f"Signal {signal_id} rejected: {processed.rejection_reason}")
                return

            side = processor.determine_side(processed.entry_price, processed.tp_levels[0])

            # Find all enabled autotrade configs
            configs = db.query(AutotradeConfig).filter(
                AutotradeConfig.enabled == True,
            ).all()

            for config in configs:
                try:
                    await self._execute_signal_for_config(
                        db, config, processed, side
                    )
                except Exception as e:
                    logger.error(
                        f"Error executing signal {signal_id} for config {config.id}: {e}"
                    )

            db.commit()

        except Exception as e:
            logger.error(f"Error processing signal: {e}")
            db.rollback()
        finally:
            db.close()

    async def _execute_signal_for_config(
        self,
        db: Session,
        config: AutotradeConfig,
        processed,
        side: str,
    ):
        """Execute a processed signal for one user's config."""
        account = db.query(ExchangeAccount).filter(
            ExchangeAccount.id == config.exchange_account_id,
            ExchangeAccount.is_active == True,
        ).first()

        if not account:
            return

        # Check market type compatibility
        market_type = config.default_market_type
        if market_type == "futures" and account.trading_mode == "spot":
            return
        if market_type == "spot" and account.trading_mode == "futures":
            return

        adapter = create_adapter_from_db(account)

        try:
            # Check if pair exists on this exchange
            exists = await adapter.check_symbol_exists(processed.pair, market_type)
            if not exists:
                logger.info(f"{processed.pair} not available on {account.exchange_id}")
                return

            # Fetch balance
            balance = await adapter.fetch_balance(market_type)

            # Risk assessment
            risk_mgr = RiskManager(db)
            assessment = risk_mgr.assess_trade(
                config=config,
                balance_free=balance.free_usd,
                entry_price=processed.entry_price,
                stop_price=processed.sl_price,
                signal_risk_level=processed.risk_level,
                signal_pair=processed.pair,
                signal_volume_rank=processed.volume_rank,
            )

            if not assessment.approved:
                logger.info(
                    f"Trade rejected for {account.exchange_id}: {assessment.rejection_reason}"
                )
                return

            # Build order plan
            builder = OrderBuilder()
            plan = builder.build_order_plan(
                signal=processed,
                config=config,
                qty=assessment.qty,
                leverage=assessment.leverage,
                margin_mode=assessment.margin_mode,
                max_loss_amount=assessment.max_loss_amount,
                margin_to_allocate=assessment.margin_to_allocate,
            )

            # Semi-auto mode: wait for user confirmation
            if config.mode == "semi":
                # TODO: send Telegram message and wait for confirmation
                logger.info(f"Semi-auto mode: awaiting confirmation for {plan.pair}")
                return

            # Execute order
            result = await adapter.place_order(
                symbol=plan.pair,
                side=plan.side,
                order_type=plan.order_type,
                qty=plan.qty,
                market_type=plan.market_type,
                leverage=plan.leverage if plan.market_type == "futures" else None,
                margin_mode=plan.margin_mode if plan.market_type == "futures" else None,
                take_profit=plan.tp_plan[0]["price"] if plan.tp_plan else None,
                stop_loss=plan.sl_price,
            )

            # Save trade order to DB
            trade = TradeOrder(
                signal_id=plan.signal_id,
                user_id=config.user_id,
                exchange_account_id=config.exchange_account_id,
                exchange_id=account.exchange_id,
                market_type=plan.market_type,
                exchange_order_id=result.exchange_order_id,
                pair=plan.pair,
                side=plan.side,
                order_type=plan.order_type,
                entry_price=result.avg_price if result.success else None,
                target_entry=plan.entry_price,
                qty=plan.qty,
                qty_filled=result.filled_qty if result.success else 0,
                leverage=plan.leverage,
                margin_mode=plan.margin_mode,
                status="filled" if result.success and result.status == "closed" else
                       "placed" if result.success else "error",
                error_message=result.error if not result.success else None,
                sl_price=plan.sl_price,
                sl_current=plan.sl_price,
                tp_orders=plan.tp_plan,
                trailing_enabled=plan.trailing_enabled,
                trailing_type=plan.trailing_type if plan.trailing_enabled else None,
                trailing_value=plan.trailing_value if plan.trailing_enabled else None,
                trailing_activation=plan.trailing_activation if plan.trailing_enabled else None,
                trailing_activated=False,
                highest_price=result.avg_price if plan.side == "buy" and result.success else None,
                lowest_price=result.avg_price if plan.side == "sell" and result.success else None,
                max_loss_amount=plan.max_loss_amount,
                margin_allocated=plan.margin_to_allocate,
            )
            db.add(trade)
            db.flush()

            # Log
            log = TradeLog(
                trade_order_id=trade.id,
                user_id=config.user_id,
                event="order_placed" if result.success else "order_failed",
                details={
                    "signal_id": plan.signal_id,
                    "exchange": account.exchange_id,
                    "pair": plan.pair,
                    "side": plan.side,
                    "qty": plan.qty,
                    "leverage": plan.leverage,
                    "market_type": plan.market_type,
                    "result": {
                        "success": result.success,
                        "order_id": result.exchange_order_id,
                        "filled": result.filled_qty,
                        "avg_price": result.avg_price,
                        "error": result.error,
                    },
                },
            )
            db.add(log)

            if result.success:
                logger.info(
                    f"Trade executed: {plan.pair} {plan.side} {plan.qty} @ {result.avg_price} "
                    f"on {account.exchange_id} (leverage: {plan.leverage}x)"
                )
                await self.notifier.send_trade_notification(
                    config.user_id, trade, "opened"
                )
            else:
                logger.error(f"Trade failed: {plan.pair} on {account.exchange_id}: {result.error}")

        finally:
            await adapter.close()

    # ========================================
    # Position Monitor Loop
    # ========================================

    async def _position_monitor_loop(self):
        """Periodically check all open positions."""
        # Wait a bit before starting
        await asyncio.sleep(5)

        while self.running:
            try:
                db = SessionLocal()
                tracker = PositionTracker(db)

                await tracker.run_cycle()

                db.commit()
                await tracker.close_all_adapters()
                db.close()

            except Exception as e:
                logger.error(f"Position monitor error: {e}")

            await asyncio.sleep(self.position_monitor_interval)


# ========================================
# Entry point (run as standalone worker)
# ========================================

async def run_engine():
    """Entry point for running the autotrade engine."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    engine = AutotradeEngine()
    try:
        await engine.start()
    except KeyboardInterrupt:
        await engine.stop()


if __name__ == "__main__":
    asyncio.run(run_engine())
