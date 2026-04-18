"""
LuxQuant Terminal - AutoTrade Engine
Main orchestrator. Two concurrent loops:

    1. Signal Listener (async LISTEN/NOTIFY)
       - Subscribes to Postgres 'new_signal' channel
       - On each new signal: validates → risk-check → executes for all enabled configs

    2. Position Monitor (periodic)
       - Every `POSITION_MONITOR_INTERVAL` seconds
       - Runs PositionTracker cycle for trailing SL, anti-liquid, TP detection

Deployed as a standalone systemd service (not embedded in uvicorn backend).
"""
import os
import json
import asyncio
import logging
from typing import Optional

import asyncpg
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.config import settings
from app.models.autotrade import (
    ExchangeAccount, AutotradeConfig, TradeOrder, TradeLog,
)
from app.services.autotrade.signal_processor import SignalProcessor
from app.services.autotrade.risk_manager import RiskManager
from app.services.autotrade.order_builder import OrderBuilder
from app.services.autotrade.position_tracker import PositionTracker
from app.services.autotrade.exchange_adapter import create_adapter_from_db
from app.services.autotrade.notifier import Notifier

logger = logging.getLogger("autotrade.engine")

POSITION_MONITOR_INTERVAL = int(os.getenv("AUTOTRADE_MONITOR_INTERVAL", "12"))


class AutotradeEngine:
    """Main autotrade worker with dual-loop architecture."""

    def __init__(self):
        self.running = False
        self.notifier = Notifier()

    # ========================================
    # Lifecycle
    # ========================================

    async def start(self):
        """Start both loops concurrently."""
        self.running = True
        logger.info("AutotradeEngine starting…")

        await asyncio.gather(
            self._signal_listener_loop(),
            self._position_monitor_loop(),
        )

    async def stop(self):
        self.running = False
        logger.info("AutotradeEngine stopping…")

    # ========================================
    # Signal listener (LISTEN/NOTIFY)
    # ========================================

    async def _signal_listener_loop(self):
        """Listen on 'new_signal' Postgres channel. Auto-reconnect on failure."""
        while self.running:
            conn = None
            try:
                conn = await asyncpg.connect(settings.DATABASE_URL)
                await conn.add_listener("new_signal", self._on_new_signal)
                logger.info("Listening for new signals on 'new_signal' channel")

                # Keep connection alive
                while self.running:
                    await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"Signal listener error: {e}")
                await asyncio.sleep(5)

            finally:
                if conn:
                    try:
                        await conn.close()
                    except Exception:
                        pass

    def _on_new_signal(self, conn, pid, channel, payload):
        """Callback fired when Postgres NOTIFY arrives."""
        try:
            data = json.loads(payload)
            logger.info(f"New signal received: {data.get('pair')} ({data.get('signal_id')})")
            asyncio.create_task(self._process_new_signal(data))
        except Exception as e:
            logger.error(f"Error parsing signal notification: {e}")

    async def _process_new_signal(self, signal_data: dict):
        """Process a new signal: fetch full row → validate → execute for all enabled configs."""
        db = SessionLocal()
        try:
            signal_id = signal_data.get("signal_id")
            if not signal_id:
                return

            # Fetch full signal row
            row = db.execute(
                text("SELECT * FROM signals WHERE signal_id = :sid"),
                {"sid": signal_id},
            ).fetchone()

            if not row:
                logger.warning(f"Signal {signal_id} not found")
                return

            signal_dict = dict(row._mapping)

            # Validate
            processor = SignalProcessor(db)
            processed = processor.process_signal(signal_dict)

            if not processed.valid:
                logger.info(f"Signal {signal_id} rejected: {processed.rejection_reason}")
                return

            side = processor.determine_side(processed.entry_price, processed.tp_levels[0])

            # Find all enabled configs (every user with autotrade ON)
            configs = db.query(AutotradeConfig).filter(
                AutotradeConfig.enabled == True,
            ).all()

            logger.info(f"Executing signal {signal_id} for {len(configs)} enabled configs")

            for config in configs:
                # Skip if already traded this signal for this account
                if processor.is_already_traded_by_account(
                    signal_id, config.user_id, config.exchange_account_id
                ):
                    continue

                try:
                    await self._execute_signal_for_config(db, config, processed, side)
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

    # ========================================
    # Signal execution
    # ========================================

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
            logger.info(f"Skip: account {account.id} is spot-only, config wants futures")
            return
        if market_type == "spot" and account.trading_mode == "futures":
            logger.info(f"Skip: account {account.id} is futures-only, config wants spot")
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
            if balance.free_usd <= 0:
                logger.info(f"Zero balance on {account.exchange_id} ({market_type})")
                return

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
                    f"Trade rejected on {account.exchange_id}: {assessment.rejection_reason}"
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

            # Execute at exchange
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

            # Persist trade_order
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
                status=(
                    "filled" if result.success and result.status == "closed"
                    else "placed" if result.success
                    else "error"
                ),
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

            # Audit log
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
                    f"on {account.exchange_id} (lev: {plan.leverage}x)"
                )
                await self.notifier.send_trade_notification(config.user_id, trade, "opened")
            else:
                logger.error(
                    f"Trade failed on {account.exchange_id} ({plan.pair}): {result.error}"
                )

        finally:
            await adapter.close()

    # ========================================
    # Position monitor loop
    # ========================================

    async def _position_monitor_loop(self):
        """Periodic cycle over open positions."""
        await asyncio.sleep(5)  # small delay before first pass

        while self.running:
            db = None
            tracker = None
            try:
                db = SessionLocal()
                tracker = PositionTracker(db)
                await tracker.run_cycle()
                db.commit()
            except Exception as e:
                logger.error(f"Position monitor cycle error: {e}")
                if db:
                    db.rollback()
            finally:
                if tracker:
                    await tracker.close_all_adapters()
                if db:
                    db.close()

            await asyncio.sleep(POSITION_MONITOR_INTERVAL)


# ========================================
# Standalone entry point
# ========================================

async def run_engine():
    """Run the engine as a standalone worker (systemd service target)."""
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
