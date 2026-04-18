"""
LuxQuant Terminal - Risk Manager
Handles position sizing, leverage decisions, hard loss cap, and margin monitoring.

Pre-trade checks (assess_trade):
    1. Autotrade enabled
    2. Risk level filter (all / low_only / low_medium)
    3. Pair whitelist/blacklist
    4. Volume rank filter
    5. Max concurrent trades
    6. Daily loss limit
    7. Calculate qty + leverage based on SL distance & max_position_pct
    8. Apply max_loss_protection if enabled (tightens qty)

Monitor (margin_alert):
    - For futures: checks margin_ratio vs thresholds
    - Returns MarginAlert with recommended action
"""
import logging
from typing import Optional, Dict
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models.autotrade import AutotradeConfig, TradeOrder, DailyPnl

logger = logging.getLogger("autotrade.risk")


@dataclass
class RiskAssessment:
    """Result of pre-trade risk check."""
    approved: bool
    qty: float = 0
    leverage: int = 1
    margin_mode: str = "isolated"
    max_loss_amount: float = 0     # USD hard cap
    margin_to_allocate: float = 0  # USD initial margin
    rejection_reason: Optional[str] = None


@dataclass
class MarginAlert:
    """Runtime margin status for a futures position."""
    level: str  # safe | warning | danger | critical
    margin_ratio: float
    action_required: Optional[str] = None  # notify | partial_close | tighten_sl | full_close | add_margin
    close_pct: float = 0


class RiskManager:
    """Central risk management for autotrade."""

    def __init__(self, db: Session):
        self.db = db

    # ========================================
    # Pre-trade assessment
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
        """Full pre-trade risk check."""

        # 1. Autotrade enabled
        if not config.enabled:
            return RiskAssessment(approved=False, rejection_reason="Autotrade disabled")

        # 2. Risk level filter
        if not self._passes_risk_filter(config.risk_filter, signal_risk_level):
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Signal risk '{signal_risk_level}' filtered out by '{config.risk_filter}'",
            )

        # 3. Pair whitelist/blacklist
        if not self._passes_pair_filter(config, signal_pair):
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Pair {signal_pair} filtered out",
            )

        # 4. Volume rank filter
        if config.min_volume_rank and signal_volume_rank:
            if signal_volume_rank < config.min_volume_rank:
                return RiskAssessment(
                    approved=False,
                    rejection_reason=f"Volume rank {signal_volume_rank} below minimum {config.min_volume_rank}",
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
                rejection_reason=f"Max concurrent trades reached ({open_count}/{config.max_concurrent_trades})",
            )

        # 6. Daily loss limit
        if self._exceeded_daily_loss_limit(config, balance_free):
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Daily loss limit reached ({config.daily_loss_limit_pct}%)",
            )

        # 7. Insufficient balance
        if balance_free <= 10:
            return RiskAssessment(
                approved=False,
                rejection_reason=f"Insufficient free balance: ${balance_free:.2f}",
            )

        # 8. Calculate position size & leverage
        sizing = self._calculate_position_size(
            config=config,
            balance_free=balance_free,
            entry_price=entry_price,
            stop_price=stop_price,
        )

        if sizing["qty"] <= 0:
            return RiskAssessment(
                approved=False,
                rejection_reason="Calculated qty is zero (check balance or SL distance)",
            )

        return RiskAssessment(
            approved=True,
            qty=sizing["qty"],
            leverage=sizing["leverage"],
            margin_mode=config.margin_mode,
            max_loss_amount=sizing["max_loss_amount"],
            margin_to_allocate=sizing["margin_to_allocate"],
        )

    # ========================================
    # Position sizing logic
    # ========================================

    def _calculate_position_size(
        self,
        config: AutotradeConfig,
        balance_free: float,
        entry_price: float,
        stop_price: float,
    ) -> Dict:
        """
        Calculate qty + leverage.

        Two modes:
          - max_loss_protection ON: qty sized such that loss at SL = max_loss_per_trade_pct of balance
          - max_loss_protection OFF: qty sized to use max_position_pct of balance as margin
        """
        sl_distance_pct = abs((entry_price - stop_price) / entry_price * 100)
        sl_distance = abs(entry_price - stop_price)

        # --- Mode A: Hard loss cap ---
        if config.max_loss_protection_enabled:
            max_loss_usd = balance_free * (float(config.max_loss_per_trade_pct) / 100.0)
            # qty * sl_distance = max_loss_usd → qty = max_loss_usd / sl_distance
            qty = max_loss_usd / sl_distance if sl_distance > 0 else 0

            # Auto-adjust leverage based on SL distance
            if sl_distance_pct < 2.0:
                leverage = min(config.max_leverage, 15)
            elif sl_distance_pct < 3.5:
                leverage = min(config.max_leverage, 12)
            elif sl_distance_pct < 5.0:
                leverage = min(config.max_leverage, 10)
            else:
                leverage = min(config.max_leverage, 8)

            margin = (entry_price * qty) / leverage if leverage > 0 else 0

            return {
                "qty": qty,
                "leverage": leverage,
                "max_loss_amount": max_loss_usd,
                "margin_to_allocate": margin,
            }

        # --- Mode B: Position percent ---
        max_position_usd = balance_free * (config.max_position_pct / 100.0)
        leverage = min(config.max_leverage, 10)  # default conservative leverage
        notional = max_position_usd * leverage
        qty = notional / entry_price if entry_price > 0 else 0

        estimated_loss = qty * sl_distance
        return {
            "qty": qty,
            "leverage": leverage,
            "max_loss_amount": estimated_loss,
            "margin_to_allocate": max_position_usd,
        }

    # ========================================
    # Runtime margin monitoring (futures only)
    # ========================================

    def check_margin_health(
        self,
        config: AutotradeConfig,
        margin_ratio_pct: float,
    ) -> MarginAlert:
        """
        Evaluate margin_ratio against buffer thresholds.
        margin_ratio_pct is position_value / maintenance_margin × 100.
        """
        warning = float(config.liquidation_warning_pct)
        buffer = float(config.liquidation_buffer_pct)

        if margin_ratio_pct >= warning:
            return MarginAlert(level="safe", margin_ratio=margin_ratio_pct)

        if margin_ratio_pct >= buffer:
            return MarginAlert(
                level="warning",
                margin_ratio=margin_ratio_pct,
                action_required="notify",
            )

        # Below buffer — decide action based on config
        action = config.emergency_action
        if action == "partial_close":
            return MarginAlert(
                level="danger",
                margin_ratio=margin_ratio_pct,
                action_required="partial_close",
                close_pct=40.0,
            )
        if action == "tighten_sl":
            return MarginAlert(
                level="danger",
                margin_ratio=margin_ratio_pct,
                action_required="tighten_sl",
            )
        if action == "add_margin" and config.auto_topup_margin:
            return MarginAlert(
                level="danger",
                margin_ratio=margin_ratio_pct,
                action_required="add_margin",
            )
        # Default = full close
        return MarginAlert(
            level="critical",
            margin_ratio=margin_ratio_pct,
            action_required="full_close",
        )

    # ========================================
    # Max-loss protection (hard cap)
    # ========================================

    def should_emergency_close(
        self,
        config: AutotradeConfig,
        unrealized_pnl: float,
        balance_free: float,
    ) -> bool:
        """Check if unrealized loss exceeds emergency_close_trigger_pct."""
        if not config.max_loss_protection_enabled:
            return False
        trigger_pct = float(config.emergency_close_trigger_pct)
        loss_pct = abs(unrealized_pnl) / balance_free * 100 if balance_free > 0 else 0
        return unrealized_pnl < 0 and loss_pct >= trigger_pct

    # ========================================
    # Daily loss limit
    # ========================================

    def _exceeded_daily_loss_limit(self, config: AutotradeConfig, balance_free: float) -> bool:
        """Check if today's realized losses exceed daily_loss_limit_pct."""
        today = date.today()
        pnl_row = self.db.query(DailyPnl).filter(
            DailyPnl.user_id == config.user_id,
            DailyPnl.exchange_account_id == config.exchange_account_id,
            DailyPnl.date == today,
        ).first()

        if not pnl_row or not pnl_row.net_pnl or pnl_row.net_pnl >= 0:
            return False

        loss_pct = abs(pnl_row.net_pnl) / balance_free * 100 if balance_free > 0 else 0
        return loss_pct >= config.daily_loss_limit_pct

    # ========================================
    # Filter helpers
    # ========================================

    def _passes_risk_filter(self, risk_filter: str, signal_risk: str) -> bool:
        """
        risk_filter:
            all        → accept anything
            low_only   → only 'low' / 'normal'
            low_medium → low / medium / normal (exclude high)
        """
        normalized = (signal_risk or "").lower().strip()

        if risk_filter == "all":
            return True

        if risk_filter == "low_only":
            return normalized in ("low", "normal")

        if risk_filter == "low_medium":
            return normalized not in ("high",)

        return True  # unknown filter → allow

    def _passes_pair_filter(self, config: AutotradeConfig, pair: str) -> bool:
        """Check whitelist/blacklist."""
        pair_upper = pair.upper()

        # Blacklist check
        blacklist = config.pair_blacklist or []
        if any(p.upper() == pair_upper for p in blacklist):
            return False

        # Whitelist check (None means allow all)
        whitelist = config.pair_whitelist
        if whitelist is not None and len(whitelist) > 0:
            return any(p.upper() == pair_upper for p in whitelist)

        return True
