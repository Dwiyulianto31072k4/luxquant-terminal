# backend/app/services/autotrade/pnl_fetcher.py
"""
Fetch live PnL data from exchange for share card generation.

Returns real-time position info:
- entry_price (from exchange)
- mark_price (current market)
- unrealized_pnl (USDT)
- roe_pct (return on equity / ROI)
- leverage
- side (long/short)
- quantity
"""
import logging
from typing import Dict, Any, Optional
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.autotrade import ExchangeAccount, TradeOrder
from app.services.autotrade.exchange_adapter import create_adapter_from_db

logger = logging.getLogger("autotrade.pnl_fetcher")


async def fetch_position_pnl(
    db: Session, order: TradeOrder
) -> Dict[str, Any]:
    """
    Fetch live PnL data for a position, combining:
      - Saved order data (entry_price, qty, leverage, side)
      - Live market data (mark_price via exchange API)
      - Calculated PnL metrics (unrealized_pnl, ROE%)
    """
    account = db.query(ExchangeAccount).filter(
        ExchangeAccount.id == order.exchange_account_id
    ).first()

    if not account:
        raise ValueError("Exchange account not found")

    # Defaults from saved order data
    entry_price = float(order.entry_price or 0)
    qty = float(order.qty or 0)
    leverage = int(order.leverage or 1)
    side = order.side.lower()
    pair = order.pair

    result = {
        "pair": pair,
        "side": side,
        "leverage": leverage,
        "entry_price": entry_price,
        "qty": qty,
        "mark_price": None,
        "unrealized_pnl": 0.0,
        "roe_pct": 0.0,
        "pnl_pct": 0.0,
        "market_type": order.market_type,
        "exchange_id": order.exchange_id,
        "margin_mode": order.margin_mode or "isolated",
        "opened_at": order.filled_at.isoformat() if order.filled_at else (
            order.created_at.isoformat() if order.created_at else None
        ),
        "live_verified": False,
        "error": None,
    }

    # Fetch live data from exchange
    adapter = create_adapter_from_db(account)
    try:
        # Try to fetch actual position from exchange (most accurate)
        try:
            positions = await adapter.fetch_positions(symbol=pair, market_type=order.market_type)
            if positions:
                pos = positions[0]
                # Prefer exchange data (in case entry was averaged, e.g., partial fills)
                result["entry_price"] = float(pos.get("entry_price", entry_price)) or entry_price
                result["mark_price"] = float(pos.get("mark_price") or 0)
                result["unrealized_pnl"] = float(pos.get("unrealized_pnl", 0) or 0)
                result["qty"] = abs(float(pos.get("contracts", qty) or qty))
                result["leverage"] = int(pos.get("leverage", leverage) or leverage)
                result["live_verified"] = True
        except Exception as e:
            logger.warning(f"fetch_positions failed for order {order.id}: {e}")

        # Fallback: fetch mark price from ticker
        if not result["mark_price"]:
            try:
                ticker = await adapter.fetch_ticker(pair, market_type=order.market_type)
                result["mark_price"] = float(ticker.get("last") or ticker.get("close") or 0)
                result["live_verified"] = True
            except Exception as e:
                logger.warning(f"fetch_ticker failed for order {order.id}: {e}")
                result["error"] = "Could not fetch live price"

        # Calculate PnL if we have mark price but no exchange unrealized_pnl
        if result["mark_price"] and result["entry_price"] and result["qty"]:
            mark = result["mark_price"]
            entry = result["entry_price"]

            # Price change %
            if side == "buy" or side == "long":
                price_change = (mark - entry) / entry
            else:  # sell / short
                price_change = (entry - mark) / entry

            result["pnl_pct"] = round(price_change * 100, 4)
            # ROE% = price_change * leverage (for leveraged positions)
            result["roe_pct"] = round(price_change * result["leverage"] * 100, 4)

            # If unrealized_pnl not from exchange, calculate it
            if not result["unrealized_pnl"]:
                notional = entry * result["qty"]
                result["unrealized_pnl"] = round(notional * price_change, 4)

        return result
    finally:
        await adapter.close()
