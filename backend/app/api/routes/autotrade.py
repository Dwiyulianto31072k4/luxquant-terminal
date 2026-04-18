# backend/app/api/routes/autotrade.py
"""
LuxQuant Terminal - AutoTrade v3 API Routes

18 endpoints organized by resource:

  Exchange metadata:
    GET    /autotrade/exchanges              — list supported exchanges

  Exchange accounts:
    POST   /autotrade/accounts               — connect exchange
    GET    /autotrade/accounts               — list my accounts
    GET    /autotrade/accounts/{id}          — detail
    PUT    /autotrade/accounts/{id}          — update
    DELETE /autotrade/accounts/{id}          — disconnect
    POST   /autotrade/accounts/{id}/test     — test API connection
    GET    /autotrade/accounts/{id}/balance  — fetch live balance

  Config:
    GET    /autotrade/config/{account_id}    — get config
    PUT    /autotrade/config/{account_id}    — update config
    POST   /autotrade/config/{account_id}/toggle — master on/off

  Trade orders:
    GET    /autotrade/orders                 — list (with filters)
    GET    /autotrade/orders/{id}            — detail + recent logs
    POST   /autotrade/orders/{id}/close      — manual close

  Portfolio:
    GET    /autotrade/portfolio/summary      — aggregated stats
    GET    /autotrade/portfolio/by-exchange  — per-exchange breakdown
    GET    /autotrade/portfolio/daily-pnl    — daily chart data

  Engine:
    GET    /autotrade/engine/status          — worker health
"""
import logging
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.autotrade import (
    ExchangeAccount, AutotradeConfig, TradeOrder, TradeLog, DailyPnl,
)
from app.schemas.autotrade import (
    # Exchange metadata
    SupportedExchangesResponse, ExchangeMetadata,
    # Accounts
    ExchangeAccountCreate, ExchangeAccountUpdate, ExchangeAccountResponse,
    ExchangeAccountListResponse, TestConnectionResponse, BalanceResponse,
    BalanceSnapshot, BalanceAsset,
    # Config
    AutotradeConfigResponse, AutotradeConfigUpdate, AutotradeToggleRequest,
    # Orders
    TradeOrderResponse, TradeOrderListResponse, ManualCloseRequest,
    TradeLogResponse,
    # Portfolio
    PortfolioSummary, PortfolioByExchange, DailyPnlResponse, DailyPnlListResponse,
    # Engine
    EngineStatus,
    # Generic
    SuccessResponse,
)
from app.services.autotrade.crypto_utils import (
    encrypt_value, decrypt_value, mask_api_key,
)
from app.services.autotrade.exchange_adapter import (
    ExchangeAdapter, ExchangeCredentials, create_adapter_from_db,
    list_supported_exchanges, get_exchange_info,
)
from app.services.autotrade.pnl_fetcher import fetch_position_pnl

logger = logging.getLogger("autotrade.routes")

router = APIRouter(prefix="/autotrade", tags=["autotrade"])


# ============================================================
# Helpers
# ============================================================

def _get_account(db: Session, account_id: int, user: User) -> ExchangeAccount:
    """Fetch an account and verify ownership. Raises 404 if not found."""
    account = db.query(ExchangeAccount).filter(
        ExchangeAccount.id == account_id,
        ExchangeAccount.user_id == user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Exchange account not found")
    return account


def _account_to_response(account: ExchangeAccount) -> ExchangeAccountResponse:
    """Safely serialize account without exposing decrypted credentials."""
    try:
        decrypted = decrypt_value(account.api_key_enc) if account.api_key_enc else ""
        masked = mask_api_key(decrypted) if decrypted else None
    except Exception:
        masked = None

    resp = ExchangeAccountResponse.model_validate(account)
    resp.api_key_masked = masked
    return resp


def _get_or_create_config(db: Session, user_id: int, account_id: int) -> AutotradeConfig:
    """Get existing config or create one with defaults."""
    config = db.query(AutotradeConfig).filter(
        AutotradeConfig.user_id == user_id,
        AutotradeConfig.exchange_account_id == account_id,
    ).first()

    if not config:
        config = AutotradeConfig(
            user_id=user_id,
            exchange_account_id=account_id,
        )
        db.add(config)
        db.flush()

    return config


# ============================================================
# 1. Exchange metadata
# ============================================================

@router.get("/exchanges", response_model=SupportedExchangesResponse)
async def list_exchanges():
    """List all supported exchanges with their capabilities."""
    raw = list_supported_exchanges()
    exchanges = [
        ExchangeMetadata(
            id=e["id"],
            name=e["name"],
            has_futures=e["has_futures"],
            has_spot=e["has_spot"],
            max_leverage=e["max_leverage"],
            needs_passphrase=e["needs_passphrase"],
            native_trailing_futures=e["native_trailing_futures"],
            has_add_margin=e["has_add_margin"],
        )
        for e in raw
    ]
    return SupportedExchangesResponse(exchanges=exchanges)


# ============================================================
# 2. Exchange accounts
# ============================================================

@router.post(
    "/accounts",
    response_model=ExchangeAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    data: ExchangeAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Connect a new exchange account. API keys encrypted before storage."""
    # Sanity check — exchange must support requested trading_mode
    info = get_exchange_info(data.exchange_id)
    if not info:
        raise HTTPException(status_code=400, detail=f"Unsupported exchange: {data.exchange_id}")

    if data.trading_mode == "spot" and not info["has_spot"]:
        raise HTTPException(status_code=400, detail=f"{data.exchange_id} doesn't support spot")
    if data.trading_mode == "futures" and not info["has_futures"]:
        raise HTTPException(status_code=400, detail=f"{data.exchange_id} doesn't support futures")

    # Encrypt credentials
    try:
        api_key_enc = encrypt_value(data.api_key)
        api_secret_enc = encrypt_value(data.api_secret)
        passphrase_enc = encrypt_value(data.passphrase) if data.passphrase else None
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Encryption not configured: {e}")

    account = ExchangeAccount(
        user_id=current_user.id,
        exchange_id=data.exchange_id,
        label=data.label or f"{data.exchange_id.capitalize()} {data.trading_mode}",
        trading_mode=data.trading_mode,
        api_key_enc=api_key_enc,
        api_secret_enc=api_secret_enc,
        passphrase_enc=passphrase_enc,
        is_testnet=data.is_testnet,
        custom_base_url=data.custom_base_url,
    )
    db.add(account)
    db.flush()

    # Create default config
    _get_or_create_config(db, current_user.id, account.id)

    db.commit()
    db.refresh(account)
    logger.info(f"User {current_user.id} connected {data.exchange_id} account {account.id}")

    return _account_to_response(account)


@router.get("/accounts", response_model=ExchangeAccountListResponse)
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all exchange accounts for current user."""
    accounts = db.query(ExchangeAccount).filter(
        ExchangeAccount.user_id == current_user.id,
    ).order_by(ExchangeAccount.created_at.desc()).all()

    return ExchangeAccountListResponse(
        accounts=[_account_to_response(a) for a in accounts],
        total=len(accounts),
    )


@router.get("/accounts/{account_id}", response_model=ExchangeAccountResponse)
async def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single account detail."""
    account = _get_account(db, account_id, current_user)
    return _account_to_response(account)


@router.put("/accounts/{account_id}", response_model=ExchangeAccountResponse)
async def update_account(
    account_id: int,
    data: ExchangeAccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update account. Credentials can be re-entered to rotate."""
    account = _get_account(db, account_id, current_user)

    update_data = data.model_dump(exclude_unset=True)

    # Re-encrypt credentials if provided
    for key, enc_col in [
        ("api_key", "api_key_enc"),
        ("api_secret", "api_secret_enc"),
        ("passphrase", "passphrase_enc"),
    ]:
        if key in update_data:
            plaintext = update_data.pop(key)
            setattr(account, enc_col, encrypt_value(plaintext) if plaintext else None)

    # Apply other fields
    for key, val in update_data.items():
        if hasattr(account, key):
            setattr(account, key, val)

    db.commit()
    db.refresh(account)
    return _account_to_response(account)


@router.delete("/accounts/{account_id}", response_model=SuccessResponse)
async def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect exchange account. CASCADE deletes config, trade_orders, etc."""
    account = _get_account(db, account_id, current_user)

    # Safety: check for open positions
    open_orders = db.query(TradeOrder).filter(
        TradeOrder.exchange_account_id == account_id,
        TradeOrder.status.in_(["pending", "placed", "filled", "partial"]),
    ).count()

    if open_orders > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot disconnect: {open_orders} open positions. Close them first.",
        )

    db.delete(account)
    db.commit()
    logger.info(f"User {current_user.id} disconnected account {account_id}")
    return SuccessResponse(message="Exchange account disconnected")


@router.post("/accounts/{account_id}/test", response_model=TestConnectionResponse)
async def test_account_connection(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Test API credentials — calls exchange to verify auth + market data access."""
    account = _get_account(db, account_id, current_user)

    adapter = create_adapter_from_db(account)
    try:
        result = await adapter.test_connection()
        return TestConnectionResponse(**result)
    except Exception as e:
        logger.error(f"Test connection error account={account_id}: {e}")
        return TestConnectionResponse(success=False, error=str(e)[:200])
    finally:
        await adapter.close()


@router.get("/accounts/{account_id}/balance", response_model=BalanceResponse)
async def fetch_account_balance(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch live balance from exchange. Updates balance_cache in DB."""
    account = _get_account(db, account_id, current_user)

    adapter = create_adapter_from_db(account)
    try:
        spot = None
        futures = None

        if account.trading_mode in ("spot", "both"):
            bal = await adapter.fetch_balance("spot")
            spot = BalanceSnapshot(
                market_type="spot",
                total_usd=bal.total_usd,
                free_usd=bal.free_usd,
                used_usd=bal.used_usd,
                assets={k: BalanceAsset(**v) for k, v in (bal.assets or {}).items()},
            )

        if account.trading_mode in ("futures", "both"):
            bal = await adapter.fetch_balance("futures")
            futures = BalanceSnapshot(
                market_type="futures",
                total_usd=bal.total_usd,
                free_usd=bal.free_usd,
                used_usd=bal.used_usd,
                assets={k: BalanceAsset(**v) for k, v in (bal.assets or {}).items()},
            )

        # Update cache
        account.balance_cache = {
            "spot": spot.model_dump() if spot else None,
            "futures": futures.model_dump() if futures else None,
        }
        account.balance_updated_at = datetime.now(timezone.utc)
        db.commit()

        return BalanceResponse(
            exchange_id=account.exchange_id,
            spot=spot,
            futures=futures,
            fetched_at=datetime.now(timezone.utc),
        )
    finally:
        await adapter.close()


# ============================================================
# 3. Autotrade config
# ============================================================

@router.get("/config/{account_id}", response_model=AutotradeConfigResponse)
async def get_config(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get config for an exchange account. Auto-creates defaults if missing."""
    _get_account(db, account_id, current_user)  # verify ownership
    config = _get_or_create_config(db, current_user.id, account_id)
    db.commit()
    db.refresh(config)
    return config


@router.put("/config/{account_id}", response_model=AutotradeConfigResponse)
async def update_config(
    account_id: int,
    data: AutotradeConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update any subset of config fields."""
    _get_account(db, account_id, current_user)
    config = _get_or_create_config(db, current_user.id, account_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        if hasattr(config, key):
            setattr(config, key, val)

    db.commit()
    db.refresh(config)
    logger.info(f"User {current_user.id} updated config for account {account_id}")
    return config


@router.post("/config/{account_id}/toggle", response_model=AutotradeConfigResponse)
async def toggle_config(
    account_id: int,
    data: AutotradeToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Master on/off switch. Shortcut for PUT config with just `enabled` field."""
    _get_account(db, account_id, current_user)
    config = _get_or_create_config(db, current_user.id, account_id)
    config.enabled = data.enabled
    db.commit()
    db.refresh(config)
    logger.info(
        f"User {current_user.id} toggled account {account_id} autotrade "
        f"{'ON' if data.enabled else 'OFF'}"
    )
    return config


# ============================================================
# 4. Trade orders
# ============================================================

@router.get("/orders", response_model=TradeOrderListResponse)
async def list_orders(
    status_filter: Optional[str] = Query(None, alias="status"),
    exchange_account_id: Optional[int] = None,
    signal_id: Optional[str] = None,
    pair: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List user's trade orders with optional filters + pagination."""
    q = db.query(TradeOrder).filter(TradeOrder.user_id == current_user.id)

    if status_filter:
        q = q.filter(TradeOrder.status == status_filter)
    if exchange_account_id:
        q = q.filter(TradeOrder.exchange_account_id == exchange_account_id)
    if signal_id:
        q = q.filter(TradeOrder.signal_id == signal_id)
    if pair:
        q = q.filter(TradeOrder.pair == pair.upper())

    total = q.count()
    orders = (
        q.order_by(TradeOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return TradeOrderListResponse(
        orders=orders,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/orders/{order_id}", response_model=TradeOrderResponse)
async def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single trade order detail."""
    order = db.query(TradeOrder).filter(
        TradeOrder.id == order_id,
        TradeOrder.user_id == current_user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Trade order not found")
    return order


@router.get("/orders/{order_id}/logs", response_model=List[TradeLogResponse])
async def get_order_logs(
    order_id: int,
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get audit log for a trade order."""
    order = db.query(TradeOrder).filter(
        TradeOrder.id == order_id,
        TradeOrder.user_id == current_user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Trade order not found")

    logs = (
        db.query(TradeLog)
        .filter(TradeLog.trade_order_id == order_id)
        .order_by(TradeLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return logs


@router.get("/orders/{order_id}/pnl-card", response_model=dict)
async def get_order_pnl_card(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get live PnL data for generating a shareable card.
    Fetches real-time position data directly from exchange API.
    """
    order = db.query(TradeOrder).filter(
        TradeOrder.id == order_id,
        TradeOrder.user_id == current_user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Trade order not found")

    if order.status not in ("filled", "partial", "placed"):
        raise HTTPException(
            status_code=400,
            detail=f"Can only generate PnL card for active positions (current: {order.status})",
        )

    try:
        pnl_data = await fetch_position_pnl(db, order)
        pnl_data["referral_url"] = f"https://luxquant.tw/?ref={current_user.id}"
        pnl_data["order_id"] = order.id
        pnl_data["generated_at"] = datetime.now(timezone.utc).isoformat()
        return pnl_data
    except Exception as e:
        logger.error(f"PnL card fetch error for order {order_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch live data: {str(e)[:200]}")


@router.post("/orders/{order_id}/close", response_model=TradeOrderResponse)
async def close_order_manually(
    order_id: int,
    data: ManualCloseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually close a position at market price."""
    order = db.query(TradeOrder).filter(
        TradeOrder.id == order_id,
        TradeOrder.user_id == current_user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Trade order not found")

    if order.status not in ("filled", "partial", "placed"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot close order in status '{order.status}'",
        )

    account = db.query(ExchangeAccount).filter(
        ExchangeAccount.id == order.exchange_account_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Exchange account not found")

    adapter = create_adapter_from_db(account)
    try:
        # Calculate remaining qty (minus any partial TP fills)
        filled_pct = 0
        if order.tp_orders:
            filled_pct = sum(t.get("qty_pct", 0) for t in order.tp_orders if t.get("filled"))
        remaining = float(order.qty) * (100 - filled_pct) / 100.0

        result = await adapter.emergency_full_close(
            order.pair, order.side, remaining, order.market_type,
        )

        if result.success:
            order.status = "closed"
            order.close_reason = data.reason or "manual"
            order.closed_at = datetime.now(timezone.utc)

            # Log event
            log = TradeLog(
                trade_order_id=order.id,
                user_id=current_user.id,
                event="manual_close",
                details={"reason": data.reason, "qty_closed": remaining},
            )
            db.add(log)
            db.commit()
            db.refresh(order)
            logger.info(f"User {current_user.id} manually closed order {order_id}")
        else:
            raise HTTPException(
                status_code=502,
                detail=f"Exchange close failed: {result.error}",
            )

        return order
    finally:
        await adapter.close()


# ============================================================
# 5. Portfolio
# ============================================================

@router.get("/portfolio/summary", response_model=PortfolioSummary)
async def portfolio_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated portfolio stats across all user's accounts."""
    today = date.today()

    # Account counts
    account_q = db.query(ExchangeAccount).filter(ExchangeAccount.user_id == current_user.id)
    total_accounts = account_q.count()
    active_accounts = account_q.filter(ExchangeAccount.is_active == True).count()

    # Balance from cache
    total_balance = 0.0
    accounts = account_q.all()
    for a in accounts:
        if not a.balance_cache:
            continue
        for mt in ("spot", "futures"):
            bal = (a.balance_cache or {}).get(mt)
            if bal:
                total_balance += float(bal.get("total_usd", 0) or 0)

    # Open positions
    open_positions = db.query(TradeOrder).filter(
        TradeOrder.user_id == current_user.id,
        TradeOrder.status.in_(["filled", "partial"]),
    ).count()

    # Lifetime stats
    closed_orders = db.query(TradeOrder).filter(
        TradeOrder.user_id == current_user.id,
        TradeOrder.status == "closed",
    ).all()

    total_trades = len(closed_orders)
    total_realized = sum(float(o.realized_pnl or 0) for o in closed_orders)
    total_fees = sum(float(o.fee_total or 0) for o in closed_orders)
    wins = sum(1 for o in closed_orders if (o.realized_pnl or 0) > 0)
    losses = sum(1 for o in closed_orders if (o.realized_pnl or 0) < 0)
    win_rate = (wins / total_trades * 100.0) if total_trades > 0 else 0

    # Today
    today_pnl = db.query(DailyPnl).filter(
        DailyPnl.user_id == current_user.id,
        DailyPnl.date == today,
    ).all()
    today_trades_opened = sum(p.trades_opened for p in today_pnl)
    today_trades_closed = sum(p.trades_closed for p in today_pnl)
    today_realized = sum(float(p.realized_pnl or 0) for p in today_pnl)
    today_net = sum(float(p.net_pnl or 0) for p in today_pnl)

    return PortfolioSummary(
        total_accounts=total_accounts,
        active_accounts=active_accounts,
        total_balance_usd=round(total_balance, 2),
        total_unrealized_pnl=0,  # would need live position fetch
        open_positions=open_positions,
        total_trades=total_trades,
        total_wins=wins,
        total_losses=losses,
        win_rate=round(win_rate, 2),
        total_realized_pnl=round(total_realized, 2),
        total_fees_paid=round(total_fees, 2),
        net_pnl=round(total_realized - total_fees, 2),
        today_trades_opened=today_trades_opened,
        today_trades_closed=today_trades_closed,
        today_realized_pnl=round(today_realized, 2),
        today_net_pnl=round(today_net, 2),
    )


@router.get("/portfolio/by-exchange", response_model=List[PortfolioByExchange])
async def portfolio_by_exchange(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Per-exchange breakdown of portfolio stats."""
    accounts = db.query(ExchangeAccount).filter(
        ExchangeAccount.user_id == current_user.id,
    ).all()

    by_exchange: dict = {}
    for a in accounts:
        key = a.exchange_id
        if key not in by_exchange:
            by_exchange[key] = {
                "exchange_id": key,
                "account_count": 0,
                "total_balance_usd": 0.0,
                "open_positions": 0,
                "realized_pnl": 0.0,
                "wins": 0,
                "total_closed": 0,
            }
        by_exchange[key]["account_count"] += 1

        # Balance
        if a.balance_cache:
            for mt in ("spot", "futures"):
                bal = a.balance_cache.get(mt)
                if bal:
                    by_exchange[key]["total_balance_usd"] += float(bal.get("total_usd", 0) or 0)

        # Open positions
        by_exchange[key]["open_positions"] += db.query(TradeOrder).filter(
            TradeOrder.exchange_account_id == a.id,
            TradeOrder.status.in_(["filled", "partial"]),
        ).count()

        # Closed stats
        closed = db.query(TradeOrder).filter(
            TradeOrder.exchange_account_id == a.id,
            TradeOrder.status == "closed",
        ).all()
        by_exchange[key]["total_closed"] += len(closed)
        by_exchange[key]["wins"] += sum(1 for o in closed if (o.realized_pnl or 0) > 0)
        by_exchange[key]["realized_pnl"] += sum(float(o.realized_pnl or 0) for o in closed)

    result = []
    for data in by_exchange.values():
        wr = (data["wins"] / data["total_closed"] * 100.0) if data["total_closed"] > 0 else 0
        result.append(PortfolioByExchange(
            exchange_id=data["exchange_id"],
            account_count=data["account_count"],
            total_balance_usd=round(data["total_balance_usd"], 2),
            open_positions=data["open_positions"],
            realized_pnl=round(data["realized_pnl"], 2),
            win_rate=round(wr, 2),
        ))
    return result


@router.get("/portfolio/daily-pnl", response_model=DailyPnlListResponse)
async def portfolio_daily_pnl(
    days: int = Query(30, ge=1, le=365),
    exchange_account_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Daily PnL history for charting. Default 30 days."""
    start_date = date.today() - timedelta(days=days)

    q = db.query(DailyPnl).filter(
        DailyPnl.user_id == current_user.id,
        DailyPnl.date >= start_date,
    )
    if exchange_account_id:
        q = q.filter(DailyPnl.exchange_account_id == exchange_account_id)

    rows = q.order_by(DailyPnl.date.asc()).all()

    total_pnl = sum(float(r.realized_pnl or 0) for r in rows)
    total_fees = sum(float(r.fees_total or 0) for r in rows)
    net = sum(float(r.net_pnl or 0) for r in rows)

    return DailyPnlListResponse(
        items=rows,
        total_pnl=round(total_pnl, 2),
        total_fees=round(total_fees, 2),
        net_pnl=round(net, 2),
    )


# ============================================================
# 6. Engine status
# ============================================================

@router.get("/engine/status", response_model=EngineStatus)
async def engine_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Engine health check. Returns basic status info.
    Note: The autotrade engine is a separate systemd service. This endpoint
    only reflects DB-visible state, not in-memory worker state.
    """
    enabled_configs = db.query(AutotradeConfig).filter(
        AutotradeConfig.enabled == True,
    ).count()

    open_positions = db.query(TradeOrder).filter(
        TradeOrder.user_id == current_user.id,
        TradeOrder.status.in_(["filled", "partial"]),
    ).count()

    # Last recent trade/log timestamps as proxies
    last_order = db.query(TradeOrder).order_by(TradeOrder.created_at.desc()).first()
    last_log = db.query(TradeLog).order_by(TradeLog.created_at.desc()).first()

    return EngineStatus(
        running=True,  # TODO: proper pid check against systemd
        enabled_configs=enabled_configs,
        open_positions_monitored=open_positions,
        last_signal_processed_at=last_order.created_at if last_order else None,
        last_monitor_cycle_at=last_log.created_at if last_log else None,
    )
