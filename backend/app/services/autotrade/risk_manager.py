"""
LuxQuant Terminal - Risk Manager
Position sizing, anti-liquidation, hard loss cap, leverage control.
Based on historical signal data: avg SL distance ~3.9%, high risk ~3.14%.
"""
import logging
from dataclasses import dataclass
from typing import Optional, Dict, List
from datetime import date

from sqlalchemy.orm import Session

from app.models.autotrade import AutotradeConfig, TradeOrder, DailyPnl

logger = logging.getLogger("autotrade.risk")


@dataclass
class RiskAssessment:
    approved: bool
    qty: float = 0
    leverage: int = 1
    margin_mode: str = "isolated"
    max_loss_amount: float = 0
    margin_to_allocate: float = 0
    rejection_reason: Optional[str] = None


@dataclass
class MarginAlert:
    level: str  # "safe", "warning", "danger", "critical"
    margin_ratio: float
    action_required: Optional[str] = None  # "notify", "partial_close", "tighten_sl", "full_close", "add_margin"
    close_pct: float = 0


class RiskManager:
    """
    Central risk management for all autotrade operations.
    Runs checks before opening positions and during monitoring.
    """

    def __init__(self, db: Session):
        self.db = db

    # ========================================
    # Pre-Trade Risk Assessment
    # ========================================

    def assess_trade(
        self,
        config: AutotradeConfig,
        balance_free: float,
        entry_price: float,
        stop_price: float,
        signal_risk_level: str,
        signal_pair: str,
        signal_volume_rank: Optional[int] = None,
    ) -> RiskAssessment:
        """
        Full pre-trade risk check. Returns approved/rejected with calculated qty.
        """
        # 1. Check if autotrade enabled
        if not config.enabled:
            return RiskAssessment(approved=False, rejection_reason="Autotrade disabled")

        # 2. Risk level filter
        if not self._passes_risk_filter(config.risk_filter, signal_risk_level):
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Signal risk '{signal_risk_level}' filtered out by '{config.risk_filter}'"
            )

        # 3. Pair blacklist/whitelist
        if not self._passes_pair_filter(config, signal_pair):
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Pair {signal_pair} filtered out"
            )

        # 4. Volume rank filter
        if config.min_volume_rank and signal_volume_rank:
            if signal_volume_rank < config.min_volume_rank:
                return RiskAssessment(
                    approved=False,
                    rejection_reason=f"Volume rank {signal_volume_rank} below minimum {config.min_volume_rank}"
                )

        # 5. Max concurrent trades
        open_count = self.db.query(TradeOrder).filter(
            TradeOrder.user_id == config.user_id,
            TradeOrder.exchange_account_id == config.exchange_account_id,
            TradeOrder.status.in_(["pending", "placed", "filled", "partial"]),
        ).count()

        if open_count >= config.max_concurrent_trades:
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Max concurrent trades reached ({open_count}/{config.max_concurrent_trades})"
            )

        # 6. Daily loss limit
        if self._daily_loss_exceeded(config):
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Daily loss limit exceeded ({config.daily_loss_limit_pct}%)"
            )

        # 7. Calculate position size
        stop_distance_pct = abs((entry_price - stop_price) / entry_price)
        if stop_distance_pct < 0.001:
            return RiskAssessment(approved=False, rejection_reason="SL too close to entry (<0.1%)")
        if stop_distance_pct > 0.20:
            return RiskAssessment(approved=False, rejection_reason="SL too far from entry (>20%)")

        # Determine leverage
        leverage = self._calculate_leverage(config, stop_distance_pct, signal_risk_level)

        # Calculate qty based on risk
        qty, max_loss = self._calculate_position_size(
            config=config,
            balance=balance_free,
            entry_price=entry_price,
            stop_distance_pct=stop_distance_pct,
            leverage=leverage,
        )

        if qty <= 0:
            return RiskAssessment(approved=False, rejection_reason="Calculated qty too small")

        # Margin needed (isolated)
        margin_to_allocate = (entry_price * qty) / leverage

        if margin_to_allocate > balance_free:
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Insufficient margin: need ${margin_to_allocate:.2f}, have ${balance_free:.2f}"
            )

        return RiskAssessment(
            approved=True,
            qty=qty,
            leverage=leverage,
            margin_mode=config.margin_mode or "isolated",
            max_loss_amount=max_loss,
            margin_to_allocate=margin_to_allocate,
        )

    # ========================================
    # Position Sizing
    # ========================================

    def _calculate_position_size(
        self,
        config: AutotradeConfig,
        balance: float,
        entry_price: float,
        stop_distance_pct: float,
        leverage: int,
    ) -> tuple:
        """
        Calculate qty and max loss.
        Uses max_position_pct for standard sizing.
        If max_loss_protection_enabled, also caps by max_loss_per_trade_pct.
        """
        # Standard sizing: % of balance
        position_value = balance * (config.max_position_pct / 100.0)
        qty_standard = position_value / entry_price

        # Max loss if SL hits
        max_loss_standard = position_value * stop_distance_pct * leverage

        # If hard loss cap enabled, potentially reduce qty
        if config.max_loss_protection_enabled:
            max_allowed_loss = balance * (float(config.max_loss_per_trade_pct) / 100.0)

            if max_loss_standard > max_allowed_loss:
                # Reduce qty to fit within hard loss cap
                qty_capped = max_allowed_loss / (entry_price * stop_distance_pct * leverage)
                logger.info(
                    f"Hard loss cap: reduced qty from {qty_standard:.6f} to {qty_capped:.6f} "
                    f"(max loss ${max_allowed_loss:.2f})"
                )
                return qty_capped, max_allowed_loss

        return qty_standard, max_loss_standard

    def _calculate_leverage(
        self,
        config: AutotradeConfig,
        stop_distance_pct: float,
        risk_level: str,
    ) -> int:
        """
        Dynamic leverage based on SL distance and risk level.
        Tighter SL → can use higher leverage.
        Higher risk → lower leverage.
        """
        max_lev = config.max_leverage

        # Auto-adjust based on SL distance
        # Target: leverage * stop_distance < 50% (so position survives a full SL hit)
        safe_leverage = int(0.4 / stop_distance_pct)  # 40% max draw on margin
        auto_leverage = min(max_lev, safe_leverage)

        # Risk level adjustment
        risk_normalized = risk_level.lower().strip() if risk_level else "medium"
        if risk_normalized in ("high",):
            auto_leverage = min(auto_leverage, int(max_lev * 0.6))  # 60% of max
        elif risk_normalized in ("low",):
            auto_leverage = auto_leverage  # full allowed
        else:
            auto_leverage = min(auto_leverage, int(max_lev * 0.8))  # 80% of max

        # Minimum leverage = 1
        return max(1, auto_leverage)

    # ========================================
    # Anti-Liquidation Monitoring
    # ========================================

    def assess_margin_health(
        self,
        config: AutotradeConfig,
        position: "PositionInfo",
    ) -> MarginAlert:
        """
        Assess margin health for an open position.
        Returns alert level and recommended action.
        Called by position_tracker every N seconds.
        """
        if not config.max_loss_protection_enabled:
            return MarginAlert(level="safe", margin_ratio=999)

        # Calculate effective margin ratio
        # margin_ratio from exchange (if available)
        if position.margin_ratio is not None and position.margin_ratio > 0:
            ratio = position.margin_ratio * 100  # convert to percentage
        elif position.isolated_margin and position.maintenance_margin:
            ratio = (position.isolated_margin / position.maintenance_margin) * 100
        else:
            # Estimate from PnL
            if position.isolated_margin and position.isolated_margin > 0:
                ratio = ((position.isolated_margin + position.unrealized_pnl)
                         / position.isolated_margin) * 100
            else:
                return MarginAlert(level="unknown", margin_ratio=0)

        buffer = float(config.liquidation_buffer_pct)
        warning = float(config.liquidation_warning_pct)

        # Critical: below buffer
        if ratio < buffer * 0.8:
            return MarginAlert(
                level="critical",
                margin_ratio=ratio,
                action_required="full_close",
            )
        elif ratio < buffer:
            action = config.emergency_action or "partial_close"
            close_pct = 50 if action == "partial_close" else 0
            return MarginAlert(
                level="danger",
                margin_ratio=ratio,
                action_required=action,
                close_pct=close_pct,
            )
        elif ratio < warning:
            return MarginAlert(
                level="warning",
                margin_ratio=ratio,
                action_required="notify",
            )
        else:
            return MarginAlert(level="safe", margin_ratio=ratio)

    def check_emergency_loss(
        self,
        config: AutotradeConfig,
        trade: TradeOrder,
        current_price: float,
    ) -> Optional[str]:
        """
        Check if unrealized loss exceeds emergency_close_trigger_pct.
        Returns action string or None.
        """
        if not config.max_loss_protection_enabled:
            return None
        if not trade.max_loss_amount or trade.max_loss_amount <= 0:
            return None

        # Calculate current unrealized loss
        if trade.side == "buy":
            pnl = (current_price - (trade.entry_price or trade.target_entry)) * trade.qty_filled
        else:
            pnl = ((trade.entry_price or trade.target_entry) - current_price) * trade.qty_filled

        if trade.leverage and trade.leverage > 1:
            pnl *= trade.leverage

        # Check against emergency trigger
        emergency_max = trade.max_loss_amount * (float(config.emergency_close_trigger_pct) /
                                                  float(config.max_loss_per_trade_pct))

        if pnl < 0 and abs(pnl) > emergency_max:
            return "emergency_close"

        return None

    # ========================================
    # Filters
    # ========================================

    def _passes_risk_filter(self, filter_setting: str, signal_risk: str) -> bool:
        risk = signal_risk.lower().strip() if signal_risk else "medium"
        if filter_setting == "all":
            return True
        elif filter_setting == "low_med":
            return risk in ("low", "medium", "med", "normal")
        elif filter_setting == "low_only":
            return risk in ("low",)
        return True

    def _passes_pair_filter(self, config: AutotradeConfig, pair: str) -> bool:
        pair_upper = pair.upper()

        # Blacklist
        if config.pair_blacklist:
            if pair_upper in [p.upper() for p in config.pair_blacklist]:
                return False

        # Whitelist (if set, only allow listed pairs)
        if config.pair_whitelist:
            if pair_upper not in [p.upper() for p in config.pair_whitelist]:
                return False

        return True

    def _daily_loss_exceeded(self, config: AutotradeConfig) -> bool:
        """Check if today's cumulative loss exceeds limit."""
        today_pnl = self.db.query(DailyPnl).filter(
            DailyPnl.user_id == config.user_id,
            DailyPnl.exchange_account_id == config.exchange_account_id,
            DailyPnl.date == date.today(),
        ).first()

        if not today_pnl:
            return False

        # Need balance to calculate percentage — use a conservative estimate
        if today_pnl.net_pnl < 0:
            # We'd need balance here; for now check absolute
            # This gets refined when we have cached balance
            return abs(today_pnl.net_pnl) > 1000  # placeholder, real logic uses %

        return False
