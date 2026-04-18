"""
LuxQuant Terminal - Exchange Adapter v3
CCXT async wrapper for unified multi-exchange trading.

Supported exchanges:  Binance, Bybit, OKX, Bitget, MEXC
Supported markets:    Spot + Futures (linear perpetuals)

Features:
    - Unified order placement (market/limit, long/short, spot/futures)
    - Native trailing stop (where supported) + manual fallback
    - Balance fetching (spot + futures separately)
    - Position fetching (futures only)
    - Margin management (add margin for isolated positions)
    - Symbol normalization (BTCUSDT → BTC/USDT:USDT for futures)
"""
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

import ccxt.async_support as ccxt_async

from app.services.autotrade.crypto_utils import decrypt_value

logger = logging.getLogger("autotrade.exchange")


# ============================================================
# Exchange metadata
# ============================================================
SUPPORTED_EXCHANGES = {
    "binance": {
        "ccxt_id": "binance",
        "name": "Binance",
        "has_futures": True,
        "has_spot": True,
        "max_leverage": 125,
        "needs_passphrase": False,
        "native_trailing_futures": True,
        "native_trailing_spot": False,
        "has_add_margin": True,
        "trailing_param": "callbackRate",
    },
    "bybit": {
        "ccxt_id": "bybit",
        "name": "Bybit",
        "has_futures": True,
        "has_spot": True,
        "max_leverage": 100,
        "needs_passphrase": False,
        "native_trailing_futures": True,
        "native_trailing_spot": False,
        "has_add_margin": True,
        "trailing_param": "trailingStop",
    },
    "okx": {
        "ccxt_id": "okx",
        "name": "OKX",
        "has_futures": True,
        "has_spot": True,
        "max_leverage": 125,
        "needs_passphrase": True,
        "native_trailing_futures": True,
        "native_trailing_spot": False,
        "has_add_margin": True,
        "trailing_param": "trailingPercent",
    },
    "bitget": {
        "ccxt_id": "bitget",
        "name": "Bitget",
        "has_futures": True,
        "has_spot": True,
        "max_leverage": 125,
        "needs_passphrase": True,
        "native_trailing_futures": True,
        "native_trailing_spot": False,
        "has_add_margin": True,
        "trailing_param": "trailingPercent",
    },
    "mexc": {
        "ccxt_id": "mexc",
        "name": "MEXC",
        "has_futures": True,
        "has_spot": True,
        "max_leverage": 200,
        "needs_passphrase": False,
        "native_trailing_futures": False,
        "native_trailing_spot": False,
        "has_add_margin": False,
        "trailing_param": None,
    },
}


# ============================================================
# Dataclasses
# ============================================================
@dataclass
class ExchangeCredentials:
    exchange_id: str
    api_key: str
    api_secret: str
    passphrase: Optional[str] = None
    is_testnet: bool = False
    custom_base_url: Optional[str] = None


@dataclass
class OrderResult:
    success: bool
    exchange_order_id: Optional[str] = None
    filled_qty: float = 0
    avg_price: float = 0
    fee: float = 0
    status: str = ""
    raw: Optional[Dict] = None
    error: Optional[str] = None


@dataclass
class BalanceInfo:
    exchange_id: str
    total_usd: float = 0
    free_usd: float = 0
    used_usd: float = 0
    assets: Optional[Dict[str, Dict]] = None
    raw: Optional[Dict] = None


@dataclass
class PositionInfo:
    symbol: str
    side: str
    size: float
    entry_price: float
    mark_price: float
    unrealized_pnl: float
    leverage: int
    margin_type: str
    liquidation_price: Optional[float] = None
    margin_ratio: Optional[float] = None
    isolated_margin: Optional[float] = None
    maintenance_margin: Optional[float] = None


# ============================================================
# Adapter class
# ============================================================
class ExchangeAdapter:
    """
    Unified exchange interface using CCXT async.
    Single class handles 5 exchanges × (spot, futures).
    """

    def __init__(self, credentials: ExchangeCredentials):
        self.credentials = credentials
        self.exchange_info = SUPPORTED_EXCHANGES.get(credentials.exchange_id)
        if not self.exchange_info:
            raise ValueError(f"Unsupported exchange: {credentials.exchange_id}")
        self._exchange: Optional[ccxt_async.Exchange] = None

    def _build_config(self) -> Dict[str, Any]:
        config = {
            "apiKey": self.credentials.api_key,
            "secret": self.credentials.api_secret,
            "enableRateLimit": True,
            "options": {
                "defaultType": "swap",
                "adjustForTimeDifference": True,
            },
        }
        if self.credentials.passphrase:
            config["password"] = self.credentials.passphrase
        if self.credentials.is_testnet:
            config["sandbox"] = True
        if self.credentials.custom_base_url:
            config["urls"] = {"api": self.credentials.custom_base_url}
        return config

    async def _get(self) -> ccxt_async.Exchange:
        """Lazy-init CCXT exchange instance."""
        if self._exchange is None:
            cls = getattr(ccxt_async, self.exchange_info["ccxt_id"])
            self._exchange = cls(self._build_config())
        return self._exchange

    async def close(self):
        """Close underlying HTTP session. Always call when done."""
        if self._exchange:
            await self._exchange.close()
            self._exchange = None

    def _to_ccxt_symbol(self, pair: str, market_type: str) -> str:
        """
        Normalize pair string to CCXT format.
        Examples:
            BTCUSDT + futures → BTC/USDT:USDT
            BTCUSDT + spot    → BTC/USDT
        """
        if "/" in pair:
            if market_type == "futures" and ":" not in pair:
                return f"{pair}:USDT"
            return pair
        base = pair.replace("USDT", "")
        if market_type == "futures":
            return f"{base}/USDT:USDT"
        return f"{base}/USDT"

    # ========================================
    # Connection & health
    # ========================================

    async def test_connection(self) -> Dict[str, Any]:
        """
        Test API credentials. Returns dict with success + diagnostics.
        Closes adapter after test.
        """
        exchange = await self._get()
        try:
            await exchange.load_markets()
            balance = await exchange.fetch_balance()
            return {
                "success": True,
                "exchange": self.credentials.exchange_id,
                "markets_loaded": len(exchange.markets),
                "has_balance_access": True,
                "usdt_free": float(balance.get("USDT", {}).get("free", 0)),
            }
        except ccxt_async.AuthenticationError as e:
            return {"success": False, "error": f"Auth failed: {str(e)[:200]}"}
        except ccxt_async.PermissionDenied as e:
            return {"success": False, "error": f"Permission denied: {str(e)[:200]}"}
        except Exception as e:
            return {"success": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}
        finally:
            await self.close()

    # ========================================
    # Balance
    # ========================================

    async def fetch_balance(self, market_type: str = "futures") -> BalanceInfo:
        """Fetch balance for specified market type."""
        exchange = await self._get()
        try:
            if market_type == "spot":
                exchange.options["defaultType"] = "spot"
                params = {}
            else:
                exchange.options["defaultType"] = "swap"
                params = {"type": "future"} if self.credentials.exchange_id == "binance" else {}

            balance = await exchange.fetch_balance(params)

            assets = {}
            for currency, data in balance.items():
                if isinstance(data, dict) and data.get("total", 0) and data["total"] > 0:
                    assets[currency] = {
                        "free": float(data.get("free", 0)),
                        "used": float(data.get("used", 0)),
                        "total": float(data.get("total", 0)),
                    }

            usdt = balance.get("USDT", {})
            return BalanceInfo(
                exchange_id=self.credentials.exchange_id,
                total_usd=float(usdt.get("total", 0) or 0),
                free_usd=float(usdt.get("free", 0) or 0),
                used_usd=float(usdt.get("used", 0) or 0),
                assets=assets,
                raw=balance,
            )
        except Exception as e:
            logger.error(f"Fetch balance error ({self.credentials.exchange_id}): {e}")
            return BalanceInfo(exchange_id=self.credentials.exchange_id)

    async def fetch_balance_dual(self) -> Dict[str, BalanceInfo]:
        """Fetch both spot + futures balance. Returns dict {spot, futures}."""
        result = {}
        for mt in ["spot", "futures"]:
            result[mt] = await self.fetch_balance(mt)
        return result

    # ========================================
    # Positions (futures only)
    # ========================================

    async def fetch_positions(self, symbols: Optional[List[str]] = None) -> List[PositionInfo]:
        """Fetch open futures positions."""
        exchange = await self._get()
        try:
            exchange.options["defaultType"] = "swap"
            ccxt_symbols = [self._to_ccxt_symbol(s, "futures") for s in symbols] if symbols else None
            positions = await exchange.fetch_positions(ccxt_symbols)

            result = []
            for pos in positions:
                size = float(pos.get("contracts") or 0)
                if size == 0:
                    continue
                result.append(PositionInfo(
                    symbol=pos.get("symbol", ""),
                    side=pos.get("side", "long"),
                    size=size,
                    entry_price=float(pos.get("entryPrice") or 0),
                    mark_price=float(pos.get("markPrice") or 0),
                    unrealized_pnl=float(pos.get("unrealizedPnl") or 0),
                    leverage=int(pos.get("leverage") or 1),
                    margin_type=pos.get("marginType") or pos.get("marginMode") or "isolated",
                    liquidation_price=float(pos.get("liquidationPrice") or 0) or None,
                    margin_ratio=float(pos.get("marginRatio") or 0) or None,
                    isolated_margin=float(pos.get("initialMargin") or 0) or None,
                    maintenance_margin=float(pos.get("maintenanceMargin") or 0) or None,
                ))
            return result
        except Exception as e:
            logger.error(f"Fetch positions error: {e}")
            return []

    # ========================================
    # Order placement
    # ========================================

    async def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        qty: float,
        market_type: str = "futures",
        price: Optional[float] = None,
        leverage: Optional[int] = None,
        margin_mode: Optional[str] = None,
        take_profit: Optional[float] = None,
        stop_loss: Optional[float] = None,
        reduce_only: bool = False,
    ) -> OrderResult:
        """
        Unified order placement.
        Handles leverage + margin_mode setup for futures.
        """
        exchange = await self._get()
        ccxt_symbol = self._to_ccxt_symbol(symbol, market_type)

        try:
            if market_type == "futures":
                exchange.options["defaultType"] = "swap"
                # Set leverage
                if leverage:
                    try:
                        await exchange.set_leverage(leverage, ccxt_symbol)
                    except Exception as e:
                        logger.warning(f"Set leverage failed (continuing): {e}")
                # Set margin mode
                if margin_mode:
                    try:
                        await exchange.set_margin_mode(margin_mode, ccxt_symbol)
                    except Exception as e:
                        logger.warning(f"Set margin mode failed (continuing): {e}")
            else:
                exchange.options["defaultType"] = "spot"

            # Build params
            params = {}
            if reduce_only and market_type == "futures":
                params["reduceOnly"] = True
            if take_profit:
                params["takeProfit"] = {"triggerPrice": take_profit}
            if stop_loss:
                params["stopLoss"] = {"triggerPrice": stop_loss}

            order = await exchange.create_order(
                ccxt_symbol,
                order_type,
                side,
                qty,
                price,
                params,
            )

            return OrderResult(
                success=True,
                exchange_order_id=order.get("id"),
                filled_qty=float(order.get("filled") or 0),
                avg_price=float(order.get("average") or order.get("price") or 0),
                fee=float(order.get("fee", {}).get("cost", 0) or 0),
                status=order.get("status", ""),
                raw=order,
            )
        except Exception as e:
            logger.error(f"Place order error ({self.credentials.exchange_id}): {e}")
            return OrderResult(success=False, error=str(e)[:300])

    async def cancel_order(self, order_id: str, symbol: str, market_type: str = "futures") -> bool:
        exchange = await self._get()
        try:
            ccxt_symbol = self._to_ccxt_symbol(symbol, market_type)
            await exchange.cancel_order(order_id, ccxt_symbol)
            return True
        except Exception as e:
            logger.error(f"Cancel order error: {e}")
            return False

    async def fetch_order(self, order_id: str, symbol: str, market_type: str = "futures") -> Optional[Dict]:
        exchange = await self._get()
        try:
            ccxt_symbol = self._to_ccxt_symbol(symbol, market_type)
            return await exchange.fetch_order(order_id, ccxt_symbol)
        except Exception as e:
            logger.error(f"Fetch order error: {e}")
            return None

    async def fetch_open_orders(self, symbol: Optional[str] = None, market_type: str = "futures") -> List[Dict]:
        exchange = await self._get()
        try:
            exchange.options["defaultType"] = "swap" if market_type == "futures" else "spot"
            ccxt_sym = self._to_ccxt_symbol(symbol, market_type) if symbol else None
            return await exchange.fetch_open_orders(ccxt_sym)
        except Exception as e:
            logger.error(f"Fetch open orders error: {e}")
            return []

    # ========================================
    # Trailing stop
    # ========================================

    async def place_trailing_stop_native(
        self,
        symbol: str,
        side: str,
        qty: float,
        callback_rate: float,
        market_type: str = "futures",
    ) -> OrderResult:
        """
        Try exchange-native trailing stop. Falls back gracefully if unsupported.
        Check OrderResult.success — if False, use manual trailing instead.
        """
        info = self.exchange_info
        if market_type != "futures" or not info.get("native_trailing_futures"):
            return OrderResult(success=False, error="Native trailing not supported")

        exchange = await self._get()
        try:
            ccxt_symbol = self._to_ccxt_symbol(symbol, "futures")
            exchange.options["defaultType"] = "swap"

            close_side = "sell" if side == "buy" else "buy"
            params = {"reduceOnly": True}
            eid = self.credentials.exchange_id

            if eid == "binance":
                params["callbackRate"] = callback_rate
                order = await exchange.create_order(
                    ccxt_symbol, "TRAILING_STOP_MARKET", close_side, qty, params=params
                )
            elif eid == "bybit":
                params["trailingStop"] = str(callback_rate)
                order = await exchange.create_order(
                    ccxt_symbol, "market", close_side, qty, params=params
                )
            elif eid in ("okx", "bitget"):
                params["trailingPercent"] = str(callback_rate)
                order = await exchange.create_order(
                    ccxt_symbol, "market", close_side, qty, params=params
                )
            else:
                return OrderResult(success=False, error=f"No native trailing for {eid}")

            return OrderResult(
                success=True,
                exchange_order_id=order.get("id"),
                status=order.get("status", ""),
                raw=order,
            )
        except Exception as e:
            logger.warning(f"Native trailing failed ({self.credentials.exchange_id}): {e}")
            return OrderResult(success=False, error=str(e)[:200])

    async def update_stop_loss(
        self,
        symbol: str,
        new_sl: float,
        qty: float,
        side: str,
        market_type: str = "futures",
        old_sl_order_id: Optional[str] = None,
    ) -> OrderResult:
        """
        Update SL by cancelling old + placing new.
        Used by manual trailing stop + SL-to-breakeven logic.
        """
        exchange = await self._get()
        ccxt_symbol = self._to_ccxt_symbol(symbol, market_type)

        if old_sl_order_id:
            try:
                await exchange.cancel_order(old_sl_order_id, ccxt_symbol)
            except Exception as e:
                logger.warning(f"Cancel old SL failed (may already be filled): {e}")

        try:
            close_side = "sell" if side == "buy" else "buy"
            params = {"reduceOnly": True} if market_type == "futures" else {}
            params["stopLossPrice"] = new_sl

            if market_type == "futures":
                exchange.options["defaultType"] = "swap"
            else:
                exchange.options["defaultType"] = "spot"

            order = await exchange.create_order(
                ccxt_symbol, "market", close_side, qty, params=params
            )

            return OrderResult(
                success=True,
                exchange_order_id=order.get("id"),
                status=order.get("status", ""),
                raw=order,
            )
        except Exception as e:
            logger.error(f"Update SL failed: {e}")
            return OrderResult(success=False, error=str(e)[:200])

    # ========================================
    # Emergency actions (anti-liquid)
    # ========================================

    async def emergency_partial_close(
        self,
        symbol: str,
        side: str,
        total_qty: float,
        close_pct: float = 50.0,
        market_type: str = "futures",
    ) -> OrderResult:
        """Close a percentage of position via market reduce-only."""
        close_qty = total_qty * (close_pct / 100.0)
        close_side = "sell" if side == "buy" else "buy"
        return await self.place_order(
            symbol=symbol,
            side=close_side,
            order_type="market",
            qty=close_qty,
            market_type=market_type,
            reduce_only=True,
        )

    async def emergency_full_close(
        self,
        symbol: str,
        side: str,
        qty: float,
        market_type: str = "futures",
    ) -> OrderResult:
        """Full close position via market reduce-only."""
        close_side = "sell" if side == "buy" else "buy"
        return await self.place_order(
            symbol=symbol,
            side=close_side,
            order_type="market",
            qty=qty,
            market_type=market_type,
            reduce_only=True,
        )

    async def add_margin(self, symbol: str, amount: float, market_type: str = "futures") -> bool:
        """Add isolated margin to futures position. Not all exchanges support this."""
        if not self.exchange_info.get("has_add_margin"):
            return False
        exchange = await self._get()
        try:
            ccxt_symbol = self._to_ccxt_symbol(symbol, market_type)
            exchange.options["defaultType"] = "swap"
            await exchange.add_margin(ccxt_symbol, amount)
            return True
        except Exception as e:
            logger.error(f"Add margin failed: {e}")
            return False

    # ========================================
    # Market data
    # ========================================

    async def fetch_ticker(self, symbol: str, market_type: str = "futures") -> Optional[Dict]:
        exchange = await self._get()
        try:
            ccxt_symbol = self._to_ccxt_symbol(symbol, market_type)
            return await exchange.fetch_ticker(ccxt_symbol)
        except Exception as e:
            logger.error(f"Fetch ticker error: {e}")
            return None

    async def fetch_price(self, symbol: str, market_type: str = "futures") -> Optional[float]:
        ticker = await self.fetch_ticker(symbol, market_type)
        if ticker:
            return float(ticker.get("last", 0) or 0)
        return None

    async def check_symbol_exists(self, symbol: str, market_type: str = "futures") -> bool:
        """Check if a symbol is listed on this exchange for given market type."""
        exchange = await self._get()
        try:
            if not exchange.markets:
                await exchange.load_markets()
            ccxt_symbol = self._to_ccxt_symbol(symbol, market_type)
            return ccxt_symbol in exchange.markets
        except Exception:
            return False


# ============================================================
# Factory
# ============================================================
def create_adapter_from_db(account) -> ExchangeAdapter:
    """Create ExchangeAdapter from DB ExchangeAccount model instance."""
    creds = ExchangeCredentials(
        exchange_id=account.exchange_id,
        api_key=decrypt_value(account.api_key_enc),
        api_secret=decrypt_value(account.api_secret_enc),
        passphrase=decrypt_value(account.passphrase_enc) if account.passphrase_enc else None,
        is_testnet=account.is_testnet,
        custom_base_url=account.custom_base_url,
    )
    return ExchangeAdapter(creds)


def get_exchange_info(exchange_id: str) -> Optional[Dict]:
    return SUPPORTED_EXCHANGES.get(exchange_id)


def list_supported_exchanges() -> List[Dict]:
    return [{"id": k, **v} for k, v in SUPPORTED_EXCHANGES.items()]
