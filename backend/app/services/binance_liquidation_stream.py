"""Long-running Binance force-order stream for liquidation-map validation."""

from __future__ import annotations

import asyncio
import json
import logging

import websockets

from app.services.binance_liquidation_validation import (
    record_force_order_event,
    save_stream_heartbeat,
)

logger = logging.getLogger(__name__)

STREAM_URL = "wss://fstream.binance.com/ws/!forceOrder@arr"


async def _heartbeat_loop(connected_at: str) -> None:
    while True:
        try:
            save_stream_heartbeat("connected", connected_at=connected_at)
        except Exception:
            logger.exception("Could not publish liquidation stream heartbeat")
        await asyncio.sleep(30)


async def run_stream() -> None:
    reconnect_delay = 1
    while True:
        try:
            async with websockets.connect(
                STREAM_URL,
                ping_interval=20,
                ping_timeout=20,
                close_timeout=10,
                max_size=2 ** 20,
            ) as websocket:
                logger.info("Binance liquidation validation stream connected")
                reconnect_delay = 1
                try:
                    connected_at = save_stream_heartbeat("connected")["updated_at"]
                except Exception:
                    connected_at = None
                    logger.exception("Could not publish initial stream heartbeat")
                heartbeat_task = asyncio.create_task(
                    _heartbeat_loop(connected_at)
                )
                try:
                    async for message in websocket:
                        try:
                            payload = json.loads(message)
                        except json.JSONDecodeError:
                            continue
                        events = payload if isinstance(payload, list) else [payload]
                        for event in events:
                            try:
                                record = record_force_order_event(event)
                                if record is not None:
                                    logger.info(
                                        "Liquidation %s $%.0f notional=$%.0f matched=%s",
                                        record["side"],
                                        record["price"],
                                        record["notional"],
                                        record["forecast_match"].get("matched"),
                                    )
                            except Exception:
                                logger.exception("Could not persist liquidation event")
                finally:
                    heartbeat_task.cancel()
                    await asyncio.gather(heartbeat_task, return_exceptions=True)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            try:
                save_stream_heartbeat(
                    "disconnected",
                    error=type(exc).__name__,
                )
            except Exception:
                pass
            logger.exception(
                "Binance liquidation stream disconnected; retrying in %ss",
                reconnect_delay,
            )
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 60)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    asyncio.run(run_stream())


if __name__ == "__main__":
    main()
