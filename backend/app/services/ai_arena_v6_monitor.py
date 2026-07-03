"""
LuxQuant BTC Compass 2.0 monitor-driven trigger.

This service is intentionally cheap. It polls live BTC market data, compares it
against the latest Compass report and active target-first contract, and only
launches a full AI Compass run when the market has materially changed.

This monitor is now the PRIMARY driver of Compass reports: the fixed
00/06/12/18 UTC scheduled worker is disabled, so a fresh read is produced only
when the market materially changes — dumps, pumps, wicks, target touches, and
invalidations — plus a one-time bootstrap when no report exists yet.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv
from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.ai_arena_v6_scheduled_run import main as run_compass_report

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


# These are ceilings, not fixed triggers. The monitor adapts to the realised
# BTC range so a calm market reacts sooner while a volatile session is not
# spammed by ordinary noise.
TRIGGER_15M_PCT = _env_float("COMPASS_MONITOR_TRIGGER_15M_PCT", 1.0)
TRIGGER_1H_PCT = _env_float("COMPASS_MONITOR_TRIGGER_1H_PCT", 1.8)
TRIGGER_4H_PCT = _env_float("COMPASS_MONITOR_TRIGGER_4H_PCT", 2.5)
TRIGGER_SINCE_REPORT_PCT = _env_float("COMPASS_MONITOR_TRIGGER_SINCE_REPORT_PCT", 1.5)
ADAPTIVE_15M_FLOOR_PCT = _env_float("COMPASS_MONITOR_15M_FLOOR_PCT", 0.45)
ADAPTIVE_1H_FLOOR_PCT = _env_float("COMPASS_MONITOR_1H_FLOOR_PCT", 0.80)
ADAPTIVE_4H_FLOOR_PCT = _env_float("COMPASS_MONITOR_4H_FLOOR_PCT", 1.40)
ADAPTIVE_SINCE_REPORT_FLOOR_PCT = _env_float("COMPASS_MONITOR_REPORT_FLOOR_PCT", 0.75)
ADAPTIVE_RANGE_MULTIPLIER = _env_float("COMPASS_MONITOR_RANGE_MULTIPLIER", 0.80)
WICK_TRIGGER_15M_PCT = _env_float("COMPASS_MONITOR_WICK_TRIGGER_15M_PCT", 1.25)
WICK_TRIGGER_1H_PCT = _env_float("COMPASS_MONITOR_WICK_TRIGGER_1H_PCT", 2.0)
WICK_TRIGGER_4H_PCT = _env_float("COMPASS_MONITOR_WICK_TRIGGER_4H_PCT", 2.75)
CRITICAL_MOVE_PCT = _env_float("COMPASS_MONITOR_CRITICAL_MOVE_PCT", 3.5)
LEVEL_TOUCH_BUFFER_PCT = _env_float("COMPASS_MONITOR_LEVEL_TOUCH_BUFFER_PCT", 0.15)
COOLDOWN_MINUTES = _env_int("COMPASS_MONITOR_COOLDOWN_MINUTES", 30)
MIN_REPORT_AGE_MINUTES = _env_int("COMPASS_MONITOR_MIN_REPORT_AGE_MINUTES", 8)

# ── Derivatives confluence triggers (Bybit linear BTCUSDT) ──────────────
# Best-practice multi-signal layer: funding-rate flips/extremes, open-interest
# surges/flushes, and long/short positioning shifts. All are event/CROSSING
# based (computed from short histories) so a persistent state does not re-fire
# every 2-minute poll — only the transition triggers a fresh read.
DERIVATIVES_ENABLED = os.getenv("COMPASS_MONITOR_DERIVATIVES_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")
# Funding rate is expressed in percent per 8h settlement (Bybit fundingRate * 100).
FUNDING_EXTREME_HIGH_PCT = _env_float("COMPASS_MONITOR_FUNDING_EXTREME_HIGH_PCT", 0.05)   # crowded longs
FUNDING_EXTREME_LOW_PCT = _env_float("COMPASS_MONITOR_FUNDING_EXTREME_LOW_PCT", -0.02)     # crowded shorts
FUNDING_SPIKE_DELTA_PCT = _env_float("COMPASS_MONITOR_FUNDING_SPIKE_DELTA_PCT", 0.03)      # jump between settlements
OI_SURGE_1H_PCT = _env_float("COMPASS_MONITOR_OI_SURGE_1H_PCT", 5.0)                        # leverage build/unwind over ~1h
LS_SHIFT_PP = _env_float("COMPASS_MONITOR_LS_SHIFT_PP", 8.0)                                # long-share shift (percentage points)


@dataclass
class MinuteBar:
    timestamp: datetime
    high: float
    low: float
    close: float


@dataclass
class MarketSnapshot:
    price: float
    change_15m_pct: float | None
    change_1h_pct: float | None
    change_4h_pct: float | None
    high_15m: float | None
    low_15m: float | None
    high_1h: float | None
    low_1h: float | None
    high_4h: float | None
    low_4h: float | None
    minute_bars: list[MinuteBar]
    source: str


@dataclass
class DerivativesSnapshot:
    funding_now_pct: float | None      # %/8h (Bybit fundingRate * 100)
    funding_prev_pct: float | None     # previous settlement
    oi_now: float | None               # current open interest (contracts)
    oi_ref: float | None               # open interest ~1h ago
    oi_change_1h_pct: float | None     # % change vs ~1h ago
    long_pct_now: float | None         # long account share, 0..100
    long_pct_ref: float | None         # long share ~30min ago
    source: str


@dataclass
class TriggerDecision:
    should_trigger: bool
    reason: str
    is_critical: bool
    details: dict[str, Any]


async def _fetch_bybit_market() -> MarketSnapshot:
    async with httpx.AsyncClient(timeout=10) as client:
        ticker_res = await client.get(
            "https://api.bybit.com/v5/market/tickers",
            params={"category": "spot", "symbol": "BTCUSDT"},
        )
        ticker_res.raise_for_status()
        ticker = ticker_res.json()["result"]["list"][0]
        price = float(ticker["lastPrice"])

        kline_res = await client.get(
            "https://api.bybit.com/v5/market/kline",
            params={
                "category": "spot",
                "symbol": "BTCUSDT",
                "interval": "1",
                "limit": 260,
            },
        )
        kline_res.raise_for_status()
        raw_klines = kline_res.json()["result"]["list"]

    # Bybit returns newest first. Convert to oldest first for window math.
    klines = sorted(raw_klines, key=lambda row: int(row[0]))
    closes = [float(row[4]) for row in klines]
    highs = [float(row[2]) for row in klines]
    lows = [float(row[3]) for row in klines]
    minute_bars = [
        MinuteBar(
            timestamp=datetime.fromtimestamp(int(row[0]) / 1000.0, tz=timezone.utc),
            high=float(row[2]),
            low=float(row[3]),
            close=float(row[4]),
        )
        for row in klines
    ]

    def pct_from(minutes: int) -> float | None:
        if len(closes) <= minutes or closes[-minutes - 1] <= 0:
            return None
        return round((price / closes[-minutes - 1] - 1.0) * 100.0, 4)

    recent_highs = highs[-15:] if len(highs) >= 15 else highs
    recent_lows = lows[-15:] if len(lows) >= 15 else lows
    hourly_highs = highs[-60:] if len(highs) >= 60 else highs
    hourly_lows = lows[-60:] if len(lows) >= 60 else lows
    four_hour_highs = highs[-240:] if len(highs) >= 240 else highs
    four_hour_lows = lows[-240:] if len(lows) >= 240 else lows

    return MarketSnapshot(
        price=price,
        change_15m_pct=pct_from(15),
        change_1h_pct=pct_from(60),
        change_4h_pct=pct_from(240),
        high_15m=max(recent_highs) if recent_highs else None,
        low_15m=min(recent_lows) if recent_lows else None,
        high_1h=max(hourly_highs) if hourly_highs else None,
        low_1h=min(hourly_lows) if hourly_lows else None,
        high_4h=max(four_hour_highs) if four_hour_highs else None,
        low_4h=min(four_hour_lows) if four_hour_lows else None,
        minute_bars=minute_bars,
        source="bybit_spot",
    )


async def fetch_market_snapshot() -> MarketSnapshot:
    """Fetch live BTC snapshot. Bybit matches the scheduled worker source."""
    return await _fetch_bybit_market()


async def fetch_derivatives_snapshot() -> DerivativesSnapshot | None:
    """
    Fetch BTC perp derivatives from Bybit linear: funding (now + previous
    settlement), open interest (now + ~1h ago), and long/short account ratio
    (now + ~30min ago). Fully fail-safe — on ANY error returns None so the
    monitor keeps running on price/level signals alone.
    """
    if not DERIVATIVES_ENABLED:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            ticker_res = await client.get(
                "https://api.bybit.com/v5/market/tickers",
                params={"category": "linear", "symbol": "BTCUSDT"},
            )
            ticker_res.raise_for_status()
            t = ticker_res.json()["result"]["list"][0]
            funding_now = float(t.get("fundingRate") or 0.0) * 100.0
            oi_now = float(t.get("openInterest") or 0.0) or None

            funding_prev = None
            try:
                fh_res = await client.get(
                    "https://api.bybit.com/v5/market/funding/history",
                    params={"category": "linear", "symbol": "BTCUSDT", "limit": 2},
                )
                fh_res.raise_for_status()
                fh_list = fh_res.json()["result"]["list"]  # newest first
                if len(fh_list) > 1:
                    funding_prev = float(fh_list[1].get("fundingRate") or 0.0) * 100.0
            except Exception:
                pass

            oi_ref = None
            oi_change_1h = None
            try:
                oi_res = await client.get(
                    "https://api.bybit.com/v5/market/open-interest",
                    params={"category": "linear", "symbol": "BTCUSDT", "intervalTime": "5min", "limit": 13},
                )
                oi_res.raise_for_status()
                oi_list = oi_res.json()["result"]["list"]  # newest first; 13*5min ≈ 65min span
                if oi_list:
                    oi_ref = float(oi_list[-1].get("openInterest") or 0.0) or None
                if oi_now and oi_ref and oi_ref > 0:
                    oi_change_1h = round((oi_now / oi_ref - 1.0) * 100.0, 3)
            except Exception:
                pass

            long_now = None
            long_ref = None
            try:
                ls_res = await client.get(
                    "https://api.bybit.com/v5/market/account-ratio",
                    params={"category": "linear", "symbol": "BTCUSDT", "period": "5min", "limit": 6},
                )
                ls_res.raise_for_status()
                ls_list = ls_res.json()["result"]["list"]  # newest first
                if ls_list:
                    long_now = float(ls_list[0].get("buyRatio") or 0.0) * 100.0
                if len(ls_list) > 1:
                    long_ref = float(ls_list[-1].get("buyRatio") or 0.0) * 100.0
            except Exception:
                pass

            return DerivativesSnapshot(
                funding_now_pct=round(funding_now, 4),
                funding_prev_pct=round(funding_prev, 4) if funding_prev is not None else None,
                oi_now=oi_now,
                oi_ref=oi_ref,
                oi_change_1h_pct=oi_change_1h,
                long_pct_now=round(long_now, 2) if long_now is not None else None,
                long_pct_ref=round(long_ref, 2) if long_ref is not None else None,
                source="bybit_linear",
            )
    except Exception:
        logger.warning("Derivatives fetch failed; continuing on price/level signals only")
        return None


def _latest_report(db) -> dict[str, Any] | None:
    row = db.execute(text("""
        SELECT
            id,
            report_id,
            timestamp,
            btc_price,
            is_anomaly_triggered,
            anomaly_reason
        FROM ai_arena_reports
        WHERE report_id LIKE 'v6_%'
        ORDER BY timestamp DESC
        LIMIT 1
    """)).mappings().first()
    return dict(row) if row else None


def _latest_anomaly_at(db) -> datetime | None:
    row = db.execute(text("""
        SELECT timestamp
        FROM ai_arena_reports
        WHERE report_id LIKE 'v6_%'
          AND COALESCE(is_anomaly_triggered, false) = true
        ORDER BY timestamp DESC
        LIMIT 1
    """)).first()
    return row[0] if row else None


def _active_contract(db) -> dict[str, Any] | None:
    row = db.execute(text("""
        SELECT
            projection_id,
            primary_bias,
            reference_price,
            primary_touch_level,
            primary_touch_trigger,
            support_level,
            support_trigger,
            confirmation_level,
            confirmation_trigger,
            invalidation_level,
            invalidation_trigger,
            active_from,
            stale_after_minutes
        FROM compass_projection_contracts
        WHERE status = 'ACTIVE'
        ORDER BY active_from DESC
        LIMIT 1
    """)).mappings().first()
    return dict(row) if row else None


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _move_pct(current: float, reference: float | None) -> float | None:
    if not reference or reference <= 0:
        return None
    return round((current / float(reference) - 1.0) * 100.0, 4)


def _range_pct(high: float | None, low: float | None) -> float | None:
    if not high or not low or high <= 0 or low <= 0:
        return None
    return round(abs((high / low - 1.0) * 100.0), 4)


def _adaptive_threshold(
    high: float | None,
    low: float | None,
    floor: float,
    ceiling: float,
) -> float:
    realised_range = _range_pct(high, low)
    if realised_range is None:
        return ceiling
    return round(
        max(floor, min(ceiling, realised_range * ADAPTIVE_RANGE_MULTIPLIER)),
        4,
    )


def _touches_level(snapshot: MarketSnapshot, level: float | None, trigger: str | None) -> bool:
    if not level or level <= 0:
        return False

    buffer_pct = LEVEL_TOUCH_BUFFER_PCT / 100.0
    upper_band = level * (1.0 + buffer_pct)
    lower_band = level * (1.0 - buffer_pct)
    trigger_l = (trigger or "").lower()

    high = snapshot.high_15m or snapshot.price
    low = snapshot.low_15m or snapshot.price

    if "below" in trigger_l:
        return low <= upper_band
    if "above" in trigger_l:
        return high >= lower_band
    if "touch" in trigger_l:
        return low <= upper_band and high >= lower_band
    return low <= upper_band and high >= lower_band


def decide_trigger(
    snapshot: MarketSnapshot,
    latest_report: dict[str, Any] | None,
    active_contract: dict[str, Any] | None,
    latest_anomaly_at: datetime | None,
    derivatives: DerivativesSnapshot | None = None,
) -> TriggerDecision:
    reasons: list[str] = []
    details: dict[str, Any] = {
        "price": snapshot.price,
        "source": snapshot.source,
        "change_15m_pct": snapshot.change_15m_pct,
        "change_1h_pct": snapshot.change_1h_pct,
        "change_4h_pct": snapshot.change_4h_pct,
        "high_15m": snapshot.high_15m,
        "low_15m": snapshot.low_15m,
        "high_1h": snapshot.high_1h,
        "low_1h": snapshot.low_1h,
        "high_4h": snapshot.high_4h,
        "low_4h": snapshot.low_4h,
    }

    # Bootstrap: with no scheduled worker, a fresh install (or a wiped report
    # table) must still produce a first read. Trigger once when none exists.
    if not latest_report:
        details["bootstrap"] = True
        return TriggerDecision(True, "bootstrap_no_existing_report", False, details)

    threshold_15m = _adaptive_threshold(
        snapshot.high_15m,
        snapshot.low_15m,
        ADAPTIVE_15M_FLOOR_PCT,
        TRIGGER_15M_PCT,
    )
    threshold_1h = _adaptive_threshold(
        snapshot.high_1h,
        snapshot.low_1h,
        ADAPTIVE_1H_FLOOR_PCT,
        TRIGGER_1H_PCT,
    )
    threshold_4h = _adaptive_threshold(
        snapshot.high_4h,
        snapshot.low_4h,
        ADAPTIVE_4H_FLOOR_PCT,
        TRIGGER_4H_PCT,
    )
    threshold_since_report = _adaptive_threshold(
        snapshot.high_1h,
        snapshot.low_1h,
        ADAPTIVE_SINCE_REPORT_FLOOR_PCT,
        TRIGGER_SINCE_REPORT_PCT,
    )
    details.update({
        "trigger_15m_pct": threshold_15m,
        "trigger_1h_pct": threshold_1h,
        "trigger_4h_pct": threshold_4h,
        "trigger_since_report_pct": threshold_since_report,
    })

    now = datetime.now(timezone.utc)
    report_age_minutes = None
    since_report_pct = None
    since_report_low_pct = None
    since_report_high_pct = None

    if latest_report:
        report_ts = _as_utc(latest_report.get("timestamp"))
        if report_ts:
            report_age_minutes = round((now - report_ts).total_seconds() / 60.0, 2)
            bars_since_report = [
                bar for bar in snapshot.minute_bars
                if bar.timestamp >= report_ts
            ]
            if bars_since_report:
                low_since_report = min(bar.low for bar in bars_since_report)
                high_since_report = max(bar.high for bar in bars_since_report)
                since_report_low_pct = _move_pct(low_since_report, latest_report.get("btc_price"))
                since_report_high_pct = _move_pct(high_since_report, latest_report.get("btc_price"))
            else:
                since_report_low_pct = _move_pct(snapshot.price, latest_report.get("btc_price"))
                since_report_high_pct = _move_pct(snapshot.price, latest_report.get("btc_price"))
        since_report_pct = _move_pct(snapshot.price, latest_report.get("btc_price"))
        details.update({
            "latest_report_id": latest_report.get("report_id"),
            "latest_report_price": latest_report.get("btc_price"),
            "report_age_minutes": report_age_minutes,
            "since_report_pct": since_report_pct,
            "since_report_low_pct": since_report_low_pct,
            "since_report_high_pct": since_report_high_pct,
        })

    critical_candidates: list[float | None] = []

    def should_use_window(minutes: int) -> bool:
        if report_age_minutes is None:
            return True
        return report_age_minutes >= minutes

    def add_window_reason(label: str, minutes: int, value: float | None, threshold: float) -> None:
        if value is None:
            return
        if not should_use_window(minutes):
            details[f"{label}_window_ignored"] = f"latest_report_age_below_{minutes}m"
            return
        critical_candidates.append(value)
        if value <= -threshold:
            reasons.append(f"price_dump_{abs(value):.2f}%_{label}")
        elif value >= threshold:
            reasons.append(f"price_pump_{value:.2f}%_{label}")

    add_window_reason("15m", 15, snapshot.change_15m_pct, threshold_15m)
    add_window_reason("1h", 60, snapshot.change_1h_pct, threshold_1h)
    add_window_reason("4h", 240, snapshot.change_4h_pct, threshold_4h)

    def add_wick_reason(label: str, minutes: int, high: float | None, low: float | None, threshold: float) -> None:
        if not high or not low or high <= 0 or low <= 0:
            return
        wick_dump_pct = _move_pct(low, high)
        wick_pump_pct = _move_pct(high, low)
        details[f"wick_dump_{label}_pct"] = wick_dump_pct
        details[f"wick_pump_{label}_pct"] = wick_pump_pct
        if not should_use_window(minutes):
            details[f"wick_{label}_ignored"] = f"latest_report_age_below_{minutes}m"
            return
        critical_candidates.extend([wick_dump_pct, wick_pump_pct])
        if wick_dump_pct is not None and wick_dump_pct <= -threshold:
            reasons.append(f"wick_dump_{abs(wick_dump_pct):.2f}%_{label}")
        if wick_pump_pct is not None and wick_pump_pct >= threshold:
            reasons.append(f"wick_pump_{wick_pump_pct:.2f}%_{label}")

    add_wick_reason("15m", 15, snapshot.high_15m, snapshot.low_15m, WICK_TRIGGER_15M_PCT)
    add_wick_reason("1h", 60, snapshot.high_1h, snapshot.low_1h, WICK_TRIGGER_1H_PCT)
    add_wick_reason("4h", 240, snapshot.high_4h, snapshot.low_4h, WICK_TRIGGER_4H_PCT)

    if since_report_pct is not None and abs(since_report_pct) >= threshold_since_report:
        direction = "dump" if since_report_pct < 0 else "pump"
        reasons.append(f"since_report_{direction}_{abs(since_report_pct):.2f}%")
    if since_report_low_pct is not None and since_report_low_pct <= -threshold_since_report:
        reasons.append(f"since_report_low_dump_{abs(since_report_low_pct):.2f}%")
    if since_report_high_pct is not None and since_report_high_pct >= threshold_since_report:
        reasons.append(f"since_report_high_pump_{since_report_high_pct:.2f}%")

    if active_contract:
        details["projection_id"] = active_contract.get("projection_id")
        for key in ("primary_touch", "support", "confirmation", "invalidation"):
            level = active_contract.get(f"{key}_level")
            trigger = active_contract.get(f"{key}_trigger")
            if _touches_level(snapshot, float(level) if level is not None else None, trigger):
                reasons.append(f"{key}_level_touched_{float(level):.0f}")

    # ── Derivatives confluence (funding / OI / long-short) ──────────────
    # Event/crossing-based so a persistent state does not re-fire every poll.
    if derivatives is not None:
        d = derivatives
        details.update({
            "funding_now_pct": d.funding_now_pct,
            "funding_prev_pct": d.funding_prev_pct,
            "oi_change_1h_pct": d.oi_change_1h_pct,
            "long_pct_now": d.long_pct_now,
            "long_pct_ref": d.long_pct_ref,
            "derivatives_source": d.source,
        })

        fnow = d.funding_now_pct
        fprev = d.funding_prev_pct
        funding_reason_added = False

        # Funding sign flip (or a large jump) between the last two settlements.
        if fnow is not None and fprev is not None:
            delta = fnow - fprev
            if fprev < 0 <= fnow and abs(delta) >= FUNDING_SPIKE_DELTA_PCT:
                reasons.append("funding_flip_neg_to_pos")
                funding_reason_added = True
            elif fprev >= 0 > fnow and abs(delta) >= FUNDING_SPIKE_DELTA_PCT:
                reasons.append("funding_flip_pos_to_neg")
                funding_reason_added = True
            elif abs(delta) >= FUNDING_SPIKE_DELTA_PCT:
                reasons.append(f"funding_spike_{fnow:+.3f}%")
                funding_reason_added = True

        # Funding crossing INTO an extreme band (prev inside, now outside).
        # Only if a flip/spike didn't already describe the same move.
        if fnow is not None and not funding_reason_added:
            fprev_ref = fprev if fprev is not None else 0.0
            if fnow >= FUNDING_EXTREME_HIGH_PCT and fprev_ref < FUNDING_EXTREME_HIGH_PCT:
                reasons.append(f"funding_extreme_high_{fnow:+.3f}%")
            elif fnow <= FUNDING_EXTREME_LOW_PCT and fprev_ref > FUNDING_EXTREME_LOW_PCT:
                reasons.append(f"funding_extreme_low_{fnow:+.3f}%")

        # Open-interest surge (leverage building) or flush (deleveraging) over ~1h.
        if d.oi_change_1h_pct is not None and abs(d.oi_change_1h_pct) >= OI_SURGE_1H_PCT:
            if d.oi_change_1h_pct > 0:
                reasons.append(f"oi_surge_{d.oi_change_1h_pct:+.2f}%_1h")
            else:
                reasons.append(f"oi_flush_{d.oi_change_1h_pct:.2f}%_1h")

        # Long/short positioning shift (crowd flipping sides).
        if d.long_pct_now is not None and d.long_pct_ref is not None:
            shift = d.long_pct_now - d.long_pct_ref
            if abs(shift) >= LS_SHIFT_PP:
                side = "long" if shift > 0 else "short"
                reasons.append(f"ls_shift_{side}_{shift:+.1f}pp")

    critical = any(
        value is not None and abs(value) >= CRITICAL_MOVE_PCT
        for value in (
            *critical_candidates,
            since_report_pct,
            since_report_low_pct,
            since_report_high_pct,
        )
    )

    if latest_anomaly_at:
        anomaly_at = _as_utc(latest_anomaly_at)
        cooldown_left = None
        if anomaly_at:
            cooldown_left = COOLDOWN_MINUTES - (now - anomaly_at).total_seconds() / 60.0
        if cooldown_left and cooldown_left > 0 and not critical:
            details["cooldown_left_minutes"] = round(cooldown_left, 2)
            return TriggerDecision(False, "cooldown_active", False, details)

    if report_age_minutes is not None and report_age_minutes < MIN_REPORT_AGE_MINUTES and not critical:
        details["min_report_age_minutes"] = MIN_REPORT_AGE_MINUTES
        return TriggerDecision(False, "latest_report_too_fresh", False, details)

    if not reasons:
        return TriggerDecision(False, "no_material_change", False, details)

    return TriggerDecision(True, "|".join(reasons[:5]), critical, details)


def _log_check(db, snapshot: MarketSnapshot, decision: TriggerDecision, report_id: str | None = None) -> None:
    try:
        db.execute(text("""
            INSERT INTO ai_arena_anomaly_checks (
                btc_price,
                trigger_hit,
                anomaly_type,
                anomaly_detail,
                report_triggered_id
            ) VALUES (
                :btc_price,
                :trigger_hit,
                :anomaly_type,
                :anomaly_detail,
                :report_triggered_id
            )
        """), {
            "btc_price": snapshot.price,
            "trigger_hit": decision.should_trigger,
            "anomaly_type": decision.reason[:50],
            "anomaly_detail": json.dumps(decision.details, default=str, sort_keys=True),
            "report_triggered_id": report_id,
        })
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to log Compass monitor check")


async def monitor_once(dry_run: bool = False) -> int:
    snapshot = await fetch_market_snapshot()
    derivatives = await fetch_derivatives_snapshot()

    db = SessionLocal()
    try:
        latest_report = _latest_report(db)
        latest_anomaly_at = _latest_anomaly_at(db)
        active_contract = _active_contract(db)
        decision = decide_trigger(snapshot, latest_report, active_contract, latest_anomaly_at, derivatives)

        logger.info(
            "BTC monitor price=$%.0f 15m=%s 1h=%s 4h=%s since_report=%s funding=%s oi_1h=%s long%%=%s decision=%s",
            snapshot.price,
            snapshot.change_15m_pct,
            snapshot.change_1h_pct,
            snapshot.change_4h_pct,
            decision.details.get("since_report_pct"),
            decision.details.get("funding_now_pct"),
            decision.details.get("oi_change_1h_pct"),
            decision.details.get("long_pct_now"),
            decision.reason,
        )

        if not decision.should_trigger:
            if not dry_run:
                _log_check(db, snapshot, decision)
            return 0

        reason = decision.reason[:240]
        if dry_run:
            logger.warning("DRY RUN would trigger full Compass anomaly run: %s", reason)
            return 0
        _log_check(db, snapshot, decision)
    finally:
        db.close()

    logger.warning("Triggering full Compass anomaly run: %s", reason)
    exit_code = await run_compass_report(is_anomaly=True, anomaly_reason=reason)

    db = SessionLocal()
    try:
        latest_report = _latest_report(db)
        _log_check(
            db,
            snapshot,
            TriggerDecision(True, reason, decision.is_critical, decision.details),
            report_id=latest_report.get("report_id") if latest_report else None,
        )
    finally:
        db.close()

    return exit_code


def cli() -> None:
    parser = argparse.ArgumentParser(description="BTC Compass monitor-driven trigger")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate trigger conditions without logging or starting a full Compass run.",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(monitor_once(dry_run=args.dry_run)))


if __name__ == "__main__":
    cli()
