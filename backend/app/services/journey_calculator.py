"""
LuxQuant Terminal - Signal Journey Calculator
==============================================
Pure function module: hitung price action journey dari raw OHLCV kline + telegram events.

NO DB, NO NETWORK. Pure data transformation. Testable isolated.

Output dict matches signal_journey table schema (see database/migration-signal-journey.sql).
Worker layer (next step) bakal handle fetching klines + persisting result ke DB.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple


# ============================================================
# DATACLASSES (input types)
# ============================================================

@dataclass(frozen=True)
class TelegramEvent:
    """Event dari signal_updates table."""
    type: str           # 'tp1' | 'tp2' | 'tp3' | 'tp4' | 'sl'
    at: datetime        # timezone-aware
    price: float


@dataclass(frozen=True)
class Kline:
    """OHLCV candle dari Binance/Bybit."""
    open_time: datetime  # timezone-aware
    high: float
    low: float
    close: float
    open: float = 0.0    # not used in compute but kept for completeness


# ============================================================
# HELPERS
# ============================================================

def _signed_pct(price: float, entry: float, direction: str) -> float:
    """
    Sign-normalized pct dari trader perspective.

    LONG:  pct = (price - entry) / entry * 100
    SHORT: pct = -(price - entry) / entry * 100  (flip)

    Hasilnya:
      - Adverse (drawdown) -> selalu negatif, regardless of long/short
      - Favorable (gain)   -> selalu positif, regardless of long/short
    """
    if entry == 0:
        return 0.0
    raw = (price - entry) / entry * 100.0
    return -raw if direction == 'short' else raw


def _is_profitable(price: float, entry: float, direction: str) -> bool:
    """True kalau price profitable buat trader (above for long, below for short)."""
    if direction == 'long':
        return price > entry
    return price < entry


def _detect_swings(
    klines: List[Kline],
    threshold_pct: float,
) -> List[Dict[str, Any]]:
    """
    ZigZag-style swing detection.

    Algorithm:
      - Track candidate pivot extreme dalam current direction.
      - Saat price reverse >= threshold_pct dari pivot, emit pivot sebagai swing.
      - Initial direction ditentuin dari extreme pertama yang melebihi threshold.

    Returns chronological list of {at: datetime, price: float, type: 'low'|'high'}.
    """
    if len(klines) < 2:
        return []

    swings: List[Dict[str, Any]] = []

    # Phase 1: track running extremes sampai threshold ke-trigger
    running_high_at = klines[0].open_time
    running_high = klines[0].high
    running_low_at = klines[0].open_time
    running_low = klines[0].low

    direction: Optional[str] = None  # 'up' | 'down'

    for k in klines[1:]:
        # Update running extremes
        if k.high > running_high:
            running_high = k.high
            running_high_at = k.open_time
        if k.low < running_low:
            running_low = k.low
            running_low_at = k.open_time

        if direction is None:
            # Belum ada arah — cek apakah range cukup buat trigger
            if running_low > 0:
                range_pct = (running_high - running_low) / running_low * 100.0
            else:
                range_pct = 0.0

            if range_pct >= threshold_pct:
                # Emit swing pertama berdasarkan urutan kronologis
                if running_high_at < running_low_at:
                    # High came first, then drop -> first pivot = high, now trending down
                    swings.append({
                        'at': running_high_at,
                        'price': running_high,
                        'type': 'high',
                    })
                    direction = 'down'
                    # Reset tracking dari current low
                    running_low = k.low
                    running_low_at = k.open_time
                    running_high = k.high
                    running_high_at = k.open_time
                else:
                    # Low came first, then rise -> first pivot = low, now trending up
                    swings.append({
                        'at': running_low_at,
                        'price': running_low,
                        'type': 'low',
                    })
                    direction = 'up'
                    running_high = k.high
                    running_high_at = k.open_time
                    running_low = k.low
                    running_low_at = k.open_time

        elif direction == 'up':
            # Track higher highs; emit ketika drop >= threshold dari current high
            if running_high > 0:
                drop_pct = (running_high - k.low) / running_high * 100.0
            else:
                drop_pct = 0.0

            if drop_pct >= threshold_pct:
                swings.append({
                    'at': running_high_at,
                    'price': running_high,
                    'type': 'high',
                })
                direction = 'down'
                # Reset, mulai track new low
                running_low = k.low
                running_low_at = k.open_time
                running_high = k.high
                running_high_at = k.open_time

        else:  # direction == 'down'
            if running_low > 0:
                rise_pct = (k.high - running_low) / running_low * 100.0
            else:
                rise_pct = 0.0

            if rise_pct >= threshold_pct:
                swings.append({
                    'at': running_low_at,
                    'price': running_low,
                    'type': 'low',
                })
                direction = 'up'
                running_high = k.high
                running_high_at = k.open_time
                running_low = k.low
                running_low_at = k.open_time

    # Final pivot: terminal of last trend
    if direction == 'up':
        swings.append({
            'at': running_high_at,
            'price': running_high,
            'type': 'high',
        })
    elif direction == 'down':
        swings.append({
            'at': running_low_at,
            'price': running_low,
            'type': 'low',
        })

    return swings


def _collate_events(
    telegram_events: List[TelegramEvent],
    swings: List[Dict[str, Any]],
    entry: float,
    direction: str,
    created_at: datetime,
    coverage_until: datetime,
) -> List[Dict[str, Any]]:
    """
    Merge telegram events + detected swings, sort chronologically, compute pct per event.
    Filter swings yang di luar [created_at, coverage_until].
    """
    events: List[Dict[str, Any]] = []

    # 1. Entry event
    events.append({
        'type': 'entry',
        'at': created_at.isoformat(),
        'price': entry,
        'pct': 0.0,
    })

    # 2. Telegram events
    for tg in telegram_events:
        events.append({
            'type': tg.type,
            'at': tg.at.isoformat(),
            'price': tg.price,
            'pct': round(_signed_pct(tg.price, entry, direction), 2),
            'telegram': True,
        })

    # 3. Swings (filter & dedupe versus telegram events)
    telegram_times = {tg.at.replace(microsecond=0) for tg in telegram_events}
    for sw in swings:
        sw_at: datetime = sw['at']
        if sw_at < created_at or sw_at > coverage_until:
            continue
        # Skip kalau swing di waktu yang sama dengan telegram event
        if sw_at.replace(microsecond=0) in telegram_times:
            continue
        events.append({
            'type': f"swing_{sw['type']}",
            'at': sw_at.isoformat(),
            'price': sw['price'],
            'pct': round(_signed_pct(sw['price'], entry, direction), 2),
        })

    # Sort chronologically
    events.sort(key=lambda e: e['at'])
    return events


def _detect_tp_then_sl(
    telegram_events: List[TelegramEvent],
) -> Tuple[bool, Optional[List[str]]]:
    """
    Cek apakah signal hit TP dulu sebelum dump ke SL.
    Returns (flag, tps_hit_before_sl) atau (False, None) kalau bukan kasus ini.
    """
    sorted_events = sorted(telegram_events, key=lambda e: e.at)
    sl_idx = next(
        (i for i, e in enumerate(sorted_events) if e.type == 'sl'),
        None,
    )

    if sl_idx is None or sl_idx == 0:
        return False, None

    tps_before = [e.type for e in sorted_events[:sl_idx] if e.type.startswith('tp')]
    if not tps_before:
        return False, None

    return True, tps_before


def _compute_aggregates(
    events: List[Dict[str, Any]],
    telegram_events: List[TelegramEvent],
    klines: List[Kline],
    entry: float,
    direction: str,
    created_at: datetime,
    coverage_until: datetime,
) -> Dict[str, Any]:
    """
    Hitung scalar aggregates dari events + raw klines.
    """
    # ----- Overall MAE / MFE (dari klines, bukan events — biar capture semua silent move)
    overall_mae_pct: Optional[float] = None
    overall_mae_at: Optional[datetime] = None
    overall_mfe_pct: Optional[float] = None
    overall_mfe_at: Optional[datetime] = None

    in_window_klines = [
        k for k in klines
        if created_at <= k.open_time <= coverage_until
    ]

    if in_window_klines:
        # Untuk LONG: mae = lowest low, mfe = highest high
        # Untuk SHORT: mae = highest high, mfe = lowest low (flipped via _signed_pct)
        if direction == 'long':
            min_kline = min(in_window_klines, key=lambda k: k.low)
            max_kline = max(in_window_klines, key=lambda k: k.high)
            mae_price, mae_at_dt = min_kline.low, min_kline.open_time
            mfe_price, mfe_at_dt = max_kline.high, max_kline.open_time
        else:  # short
            min_kline = min(in_window_klines, key=lambda k: k.low)
            max_kline = max(in_window_klines, key=lambda k: k.high)
            # Untuk short, "adverse" = price naik (max), "favorable" = price turun (min)
            mae_price, mae_at_dt = max_kline.high, max_kline.open_time
            mfe_price, mfe_at_dt = min_kline.low, min_kline.open_time

        mae_signed = round(_signed_pct(mae_price, entry, direction), 2)
        mfe_signed = round(_signed_pct(mfe_price, entry, direction), 2)

        # Hanya simpan kalau actually adverse / favorable
        if mae_signed < 0:
            overall_mae_pct = mae_signed
            overall_mae_at = mae_at_dt
        else:
            overall_mae_pct = 0.0
            overall_mae_at = mae_at_dt

        if mfe_signed > 0:
            overall_mfe_pct = mfe_signed
            overall_mfe_at = mfe_at_dt
        else:
            overall_mfe_pct = 0.0
            overall_mfe_at = mfe_at_dt

    # ----- Initial MAE: drawdown sebelum first event (TP1 atau SL)
    initial_mae_pct: Optional[float] = None
    initial_mae_at: Optional[datetime] = None
    initial_mae_before: Optional[str] = None

    sorted_telegram = sorted(telegram_events, key=lambda e: e.at)
    if sorted_telegram:
        first_event = sorted_telegram[0]
        first_event_at = first_event.at
        # 'tp1' kalau first event TP, 'sl' kalau langsung SL
        initial_mae_before = 'tp1' if first_event.type.startswith('tp') else 'sl'

        pre_first_klines = [
            k for k in klines
            if created_at <= k.open_time <= first_event_at
        ]
        if pre_first_klines:
            if direction == 'long':
                worst_kline = min(pre_first_klines, key=lambda k: k.low)
                worst_price = worst_kline.low
            else:
                worst_kline = max(pre_first_klines, key=lambda k: k.high)
                worst_price = worst_kline.high

            initial_signed = round(_signed_pct(worst_price, entry, direction), 2)
            if initial_signed < 0:
                initial_mae_pct = initial_signed
                initial_mae_at = worst_kline.open_time
            else:
                initial_mae_pct = 0.0
                initial_mae_at = worst_kline.open_time
    else:
        # No telegram events — signal masih open
        initial_mae_before = 'none'
        if in_window_klines:
            if direction == 'long':
                worst_kline = min(in_window_klines, key=lambda k: k.low)
                worst_price = worst_kline.low
            else:
                worst_kline = max(in_window_klines, key=lambda k: k.high)
                worst_price = worst_kline.high

            initial_signed = round(_signed_pct(worst_price, entry, direction), 2)
            initial_mae_pct = initial_signed if initial_signed < 0 else 0.0
            initial_mae_at = worst_kline.open_time

    # ----- Time to TP1
    time_to_tp1_seconds: Optional[int] = None
    tp1_event = next(
        (e for e in sorted_telegram if e.type == 'tp1'),
        None,
    )
    if tp1_event is not None:
        delta = tp1_event.at - created_at
        time_to_tp1_seconds = int(delta.total_seconds())

    # ----- Time to outcome (TP4 or SL)
    time_to_outcome_seconds: Optional[int] = None
    outcome_event = next(
        (e for e in sorted_telegram if e.type in ('tp4', 'sl')),
        None,
    )
    if outcome_event is not None:
        delta = outcome_event.at - created_at
        time_to_outcome_seconds = int(delta.total_seconds())

    # ----- pct_time_above_entry (semantically: pct of time profitable buat trader)
    pct_time_above_entry: Optional[float] = None
    if in_window_klines:
        profitable_count = sum(
            1 for k in in_window_klines
            if _is_profitable(k.close, entry, direction)
        )
        pct_time_above_entry = round(
            profitable_count / len(in_window_klines) * 100.0,
            2,
        )

    # ----- Realized outcome (pct of last telegram event)
    realized_outcome_pct: Optional[float] = None
    if sorted_telegram:
        last_event = sorted_telegram[-1]
        realized_outcome_pct = round(
            _signed_pct(last_event.price, entry, direction),
            2,
        )

    # ----- Missed potential (mfe - realized, only if both available & positive gap)
    missed_potential_pct: Optional[float] = None
    if (overall_mfe_pct is not None and realized_outcome_pct is not None):
        gap = overall_mfe_pct - realized_outcome_pct
        if gap > 0:
            missed_potential_pct = round(gap, 2)
        else:
            missed_potential_pct = 0.0

    return {
        'overall_mae_pct': overall_mae_pct,
        'overall_mae_at': overall_mae_at,
        'overall_mfe_pct': overall_mfe_pct,
        'overall_mfe_at': overall_mfe_at,
        'initial_mae_pct': initial_mae_pct,
        'initial_mae_at': initial_mae_at,
        'initial_mae_before': initial_mae_before,
        'time_to_tp1_seconds': time_to_tp1_seconds,
        'time_to_outcome_seconds': time_to_outcome_seconds,
        'pct_time_above_entry': pct_time_above_entry,
        'realized_outcome_pct': realized_outcome_pct,
        'missed_potential_pct': missed_potential_pct,
    }


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def compute_journey(
    *,
    signal_id: str,
    pair: str,
    direction: str,
    entry: float,
    target1: Optional[float] = None,
    target2: Optional[float] = None,
    target3: Optional[float] = None,
    target4: Optional[float] = None,
    stop1: Optional[float] = None,
    created_at: datetime,
    telegram_events: List[TelegramEvent],
    klines: List[Kline],
    coverage_until: datetime,
    coverage_status: str,
    data_source: str,
    swing_threshold_pct: float = 1.5,
    kline_interval: str = '1h',
) -> Dict[str, Any]:
    """
    Pure function: compute journey dict matching signal_journey table schema.

    Args:
        signal_id, pair, direction ('long'|'short'), entry: signal core data
        target1-4, stop1: optional, untuk reference (tidak strictly dipake di compute)
        created_at: signal entry timestamp (timezone-aware)
        telegram_events: list dari signal_updates yang relevant (TP/SL)
        klines: OHLCV data dari created_at sampai coverage_until
        coverage_until: end of measurement window
        coverage_status: 'live' | 'frozen' | 'sl_truncated' | 'unavailable'
        data_source: 'binance_futures' | 'binance_spot' | 'bybit_linear' | 'bybit_spot' | 'unavailable'
        swing_threshold_pct: ZigZag deviation threshold (default 1.5%)
        kline_interval: '1h' default

    Returns:
        Dict matching signal_journey table columns. Scalar timestamps as datetime objects;
        events array uses ISO-string timestamps inside JSONB.

    Raises:
        ValueError: kalau direction/entry invalid.
    """
    # Validation
    if direction not in ('long', 'short'):
        raise ValueError(f"direction must be 'long' or 'short', got: {direction}")
    if entry <= 0:
        raise ValueError(f"entry must be > 0, got: {entry}")
    if coverage_until < created_at:
        raise ValueError(
            f"coverage_until ({coverage_until}) must be >= created_at ({created_at})"
        )

    now_utc = datetime.now(timezone.utc)

    # Special case: data unavailable (pair gak ada di Binance/Bybit)
    if data_source == 'unavailable' or not klines:
        last_event_at = max(
            (e.at for e in telegram_events),
            default=None,
        )
        return {
            'signal_id': signal_id,
            'direction': direction,
            'computed_at': now_utc,
            'last_event_at': last_event_at,
            'data_source': 'unavailable',
            'kline_interval': kline_interval,
            'swing_threshold_pct': swing_threshold_pct,
            'coverage_from': created_at,
            'coverage_until': coverage_until,
            'coverage_status': 'unavailable',
            'events': [
                {
                    'type': 'entry',
                    'at': created_at.isoformat(),
                    'price': entry,
                    'pct': 0.0,
                }
            ],
            'overall_mae_pct': None,
            'overall_mae_at': None,
            'overall_mfe_pct': None,
            'overall_mfe_at': None,
            'initial_mae_pct': None,
            'initial_mae_at': None,
            'initial_mae_before': None,
            'time_to_tp1_seconds': None,
            'time_to_outcome_seconds': None,
            'pct_time_above_entry': None,
            'tp_then_sl': False,
            'tps_hit_before_sl': None,
            'realized_outcome_pct': None,
            'missed_potential_pct': None,
        }

    # Detect swings
    swings = _detect_swings(klines, swing_threshold_pct)

    # Collate events
    events = _collate_events(
        telegram_events, swings, entry, direction, created_at, coverage_until
    )

    # Compute aggregates
    aggregates = _compute_aggregates(
        events, telegram_events, klines, entry, direction, created_at, coverage_until
    )

    # TP-then-SL detection
    tp_then_sl, tps_before = _detect_tp_then_sl(telegram_events)

    # Last event timestamp
    last_event_at = max(
        (e.at for e in telegram_events),
        default=None,
    )

    return {
        'signal_id': signal_id,
        'direction': direction,
        'computed_at': now_utc,
        'last_event_at': last_event_at,
        'data_source': data_source,
        'kline_interval': kline_interval,
        'swing_threshold_pct': swing_threshold_pct,
        'coverage_from': created_at,
        'coverage_until': coverage_until,
        'coverage_status': coverage_status,
        'events': events,
        **aggregates,
        'tp_then_sl': tp_then_sl,
        'tps_hit_before_sl': tps_before,
    }
