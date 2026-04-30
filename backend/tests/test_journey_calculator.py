"""
LuxQuant Terminal - Tests for Signal Journey Calculator
========================================================
Pytest scenarios covering all critical paths.

Run:
    cd backend
    pytest tests/test_journey_calculator.py -v

Or from container:
    pytest /home/claude/test_journey_calculator.py -v
"""

import sys
import os
from datetime import datetime, timedelta, timezone
from typing import List, Tuple

import pytest

# Allow import from sibling file
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.journey_calculator import (  # noqa: E402
    TelegramEvent,
    Kline,
    compute_journey,
    _signed_pct,
    _detect_swings,
    _detect_tp_then_sl,
)


# ============================================================
# HELPERS
# ============================================================

UTC = timezone.utc


def t(year, month, day, hour=0, minute=0) -> datetime:
    """Quick timezone-aware datetime."""
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def make_klines(
    start: datetime,
    ohlc_list: List[Tuple[float, float, float]],
    interval_minutes: int = 60,
) -> List[Kline]:
    """
    Generate Kline objects from a list of (high, low, close) tuples,
    one per interval starting at `start`.
    """
    return [
        Kline(
            open_time=start + timedelta(minutes=i * interval_minutes),
            open=close,
            high=high,
            low=low,
            close=close,
        )
        for i, (high, low, close) in enumerate(ohlc_list)
    ]


# ============================================================
# UNIT TESTS — _signed_pct
# ============================================================

class TestSignedPct:
    def test_long_favorable(self):
        # Price 105, entry 100 -> +5%
        assert _signed_pct(105, 100, 'long') == pytest.approx(5.0)

    def test_long_adverse(self):
        # Price 95, entry 100 -> -5%
        assert _signed_pct(95, 100, 'long') == pytest.approx(-5.0)

    def test_short_favorable(self):
        # Price drop to 95 is favorable for short -> +5%
        assert _signed_pct(95, 100, 'short') == pytest.approx(5.0)

    def test_short_adverse(self):
        # Price rise to 105 is adverse for short -> -5%
        assert _signed_pct(105, 100, 'short') == pytest.approx(-5.0)

    def test_zero_entry(self):
        # Edge: entry 0 returns 0.0 (avoid div-by-zero)
        assert _signed_pct(100, 0, 'long') == 0.0


# ============================================================
# UNIT TESTS — _detect_swings (ZigZag)
# ============================================================

class TestDetectSwings:
    def test_empty_klines(self):
        assert _detect_swings([], 1.5) == []

    def test_single_kline(self):
        klines = make_klines(t(2026, 4, 24), [(100, 100, 100)])
        assert _detect_swings(klines, 1.5) == []

    def test_pure_uptrend_emits_high(self):
        # Steady uptrend: 100 -> 102 -> 105 -> 110
        # Should emit just the final high
        klines = make_klines(
            t(2026, 4, 24),
            [(100, 99, 100), (103, 100, 102), (106, 102, 105), (111, 105, 110)],
        )
        swings = _detect_swings(klines, 1.5)
        # At minimum should detect the final high
        assert len(swings) >= 1
        highs = [s for s in swings if s['type'] == 'high']
        assert len(highs) >= 1
        assert highs[-1]['price'] == pytest.approx(111)

    def test_drop_then_recover_emits_low(self):
        # 100 -> 95 -> 100 -> 105
        klines = make_klines(
            t(2026, 4, 24),
            [(100, 100, 100), (100, 95, 95), (101, 95, 100), (106, 100, 105)],
        )
        swings = _detect_swings(klines, 1.5)
        lows = [s for s in swings if s['type'] == 'low']
        assert len(lows) >= 1
        # The low pivot should be around 95
        assert min(s['price'] for s in lows) == pytest.approx(95)

    def test_threshold_filters_noise(self):
        # Tiny oscillations below 1.5% threshold should NOT generate swings
        # 100 -> 100.5 -> 100 -> 100.3 -> 100 (all <1.5% range)
        klines = make_klines(
            t(2026, 4, 24),
            [(100, 100, 100), (100.5, 100, 100.3), (100.3, 100, 100), (100.3, 100, 100)],
        )
        swings = _detect_swings(klines, 1.5)
        # No swings should be detected because nothing exceeded 1.5%
        assert len(swings) == 0


# ============================================================
# UNIT TESTS — _detect_tp_then_sl
# ============================================================

class TestDetectTpThenSl:
    def test_empty(self):
        assert _detect_tp_then_sl([]) == (False, None)

    def test_only_sl(self):
        events = [TelegramEvent('sl', t(2026, 4, 24, 10), 0.95)]
        assert _detect_tp_then_sl(events) == (False, None)

    def test_only_tps(self):
        events = [
            TelegramEvent('tp1', t(2026, 4, 24, 10), 1.05),
            TelegramEvent('tp2', t(2026, 4, 24, 11), 1.10),
        ]
        assert _detect_tp_then_sl(events) == (False, None)

    def test_tp_then_sl(self):
        events = [
            TelegramEvent('tp1', t(2026, 4, 24, 10), 1.05),
            TelegramEvent('sl', t(2026, 4, 24, 12), 0.95),
        ]
        flag, tps = _detect_tp_then_sl(events)
        assert flag is True
        assert tps == ['tp1']

    def test_tp1_tp2_then_sl(self):
        events = [
            TelegramEvent('tp1', t(2026, 4, 24, 10), 1.05),
            TelegramEvent('tp2', t(2026, 4, 24, 11), 1.10),
            TelegramEvent('sl', t(2026, 4, 24, 14), 0.95),
        ]
        flag, tps = _detect_tp_then_sl(events)
        assert flag is True
        assert tps == ['tp1', 'tp2']


# ============================================================
# INTEGRATION TESTS — compute_journey end-to-end
# ============================================================

class TestComputeJourney_HappyPath:
    """Scenario 1: MAGMAUSDT-style TP3 hit dengan initial drawdown."""

    def test_magma_tp3(self):
        # Entry $0.2088 at 11:55
        # Path: drop to $0.2030, recover to $0.2150 (TP1), pullback to $0.2125,
        #       rise to $0.2230 (TP2), pullback to $0.2185, rise to $0.2510 (TP3),
        #       peak to $0.2558
        entry = 0.2088
        created_at = t(2026, 4, 24, 11, 55)

        # Klines (1 per hour, 12 hours total, OHLC simplified)
        klines = make_klines(created_at, [
            (0.2090, 0.2088, 0.2088),  # 11:55-12:55: entry
            (0.2089, 0.2030, 0.2032),  # 12:55-13:55: dump to 0.2030 (initial mae)
            (0.2155, 0.2032, 0.2150),  # 13:55-14:55: recover, TP1 hit at 0.2150
            (0.2150, 0.2125, 0.2125),  # 14:55-15:55: pullback
            (0.2235, 0.2125, 0.2230),  # 15:55-16:55: TP2 hit at 0.2230
            (0.2230, 0.2185, 0.2200),  # 16:55-17:55: pullback to 0.2185
            (0.2515, 0.2200, 0.2510),  # 17:55-18:55: TP3 hit at 0.2510
            (0.2540, 0.2500, 0.2530),
            (0.2558, 0.2520, 0.2558),  # peak at 0.2558
        ])

        telegram_events = [
            TelegramEvent('tp1', t(2026, 4, 24, 13, 10), 0.2150),
            TelegramEvent('tp2', t(2026, 4, 24, 14, 20), 0.2230),
            TelegramEvent('tp3', t(2026, 4, 24, 18, 30), 0.2510),
        ]

        result = compute_journey(
            signal_id='sig-magma-001',
            pair='MAGMAUSDT',
            direction='long',
            entry=entry,
            target1=0.2150, target2=0.2230, target3=0.2510, target4=0.2700,
            stop1=0.1900,
            created_at=created_at,
            telegram_events=telegram_events,
            klines=klines,
            coverage_until=t(2026, 4, 24, 20, 55),
            coverage_status='live',
            data_source='binance_futures',
        )

        # Direction & metadata
        assert result['direction'] == 'long'
        assert result['data_source'] == 'binance_futures'
        assert result['coverage_status'] == 'live'

        # MAE: should detect the silent drop ke 0.2030 as -2.78%
        assert result['overall_mae_pct'] == pytest.approx(-2.78, abs=0.05)
        assert result['initial_mae_pct'] == pytest.approx(-2.78, abs=0.05)
        assert result['initial_mae_before'] == 'tp1'

        # MFE: peak at 0.2558 = +22.51%
        assert result['overall_mfe_pct'] == pytest.approx(22.51, abs=0.05)

        # Time to TP1: 13:10 - 11:55 = 75 mins = 4500s
        assert result['time_to_tp1_seconds'] == 4500

        # Outcome: not yet hit TP4 or SL
        assert result['time_to_outcome_seconds'] is None

        # No TP-then-SL
        assert result['tp_then_sl'] is False
        assert result['tps_hit_before_sl'] is None

        # Realized = TP3 = +20.21%
        assert result['realized_outcome_pct'] == pytest.approx(20.21, abs=0.05)

        # Missed potential = mfe - realized = ~2.30%
        assert result['missed_potential_pct'] == pytest.approx(2.30, abs=0.10)

        # Events: should have at least entry + 3 TPs + some swings
        assert len(result['events']) >= 4
        event_types = [e['type'] for e in result['events']]
        assert 'entry' in event_types
        assert 'tp1' in event_types
        assert 'tp2' in event_types
        assert 'tp3' in event_types

        # Events sorted chronologically
        timestamps = [e['at'] for e in result['events']]
        assert timestamps == sorted(timestamps)


class TestComputeJourney_SLTruncated:
    """Scenario 2: Entry -> SL, no TP hit."""

    def test_sl_only(self):
        entry = 0.1443
        created_at = t(2026, 3, 24, 20, 45)

        # Path: brief rise to 0.1460, then drop to 0.1380, eventual SL hit at 0.1313
        klines = make_klines(created_at, [
            (0.1460, 0.1443, 0.1455),
            (0.1455, 0.1380, 0.1390),
            (0.1395, 0.1313, 0.1313),
        ])

        telegram_events = [
            TelegramEvent('sl', t(2026, 3, 24, 22, 45), 0.1313),
        ]

        result = compute_journey(
            signal_id='sig-magma-006',
            pair='MAGMAUSDT',
            direction='long',
            entry=entry,
            target1=0.1500, target2=0.1600, target3=0.1700, target4=0.1800,
            stop1=0.1313,
            created_at=created_at,
            telegram_events=telegram_events,
            klines=klines,
            coverage_until=t(2026, 3, 24, 22, 45),
            coverage_status='sl_truncated',
            data_source='binance_futures',
        )

        assert result['coverage_status'] == 'sl_truncated'
        assert result['initial_mae_before'] == 'sl'

        # MAE should be around -9.01% (0.1313 vs 0.1443)
        assert result['overall_mae_pct'] == pytest.approx(-9.01, abs=0.10)

        # Brief rise: 0.1460 -> +1.18%
        assert result['overall_mfe_pct'] == pytest.approx(1.18, abs=0.10)

        # No TP hit
        assert result['time_to_tp1_seconds'] is None

        # Outcome = SL hit time
        assert result['time_to_outcome_seconds'] == 7200  # 2 hours

        assert result['tp_then_sl'] is False
        assert result['realized_outcome_pct'] == pytest.approx(-9.01, abs=0.10)


class TestComputeJourney_TpThenSl:
    """Scenario 3: TP1 hit dulu terus dump ke SL — important warning case."""

    def test_tp1_then_sl(self):
        entry = 1.00
        created_at = t(2026, 4, 20, 10, 0)

        # Path: rise to TP1 1.05, dump to SL 0.95
        klines = make_klines(created_at, [
            (1.06, 1.00, 1.05),    # TP1 reached
            (1.05, 0.96, 0.96),    # dropping
            (0.96, 0.95, 0.95),    # SL trigger
        ])

        telegram_events = [
            TelegramEvent('tp1', t(2026, 4, 20, 11, 0), 1.05),
            TelegramEvent('sl', t(2026, 4, 20, 13, 0), 0.95),
        ]

        result = compute_journey(
            signal_id='sig-tpsl-001',
            pair='TESTUSDT',
            direction='long',
            entry=entry,
            target1=1.05, target2=1.10, target3=1.15, target4=1.20,
            stop1=0.95,
            created_at=created_at,
            telegram_events=telegram_events,
            klines=klines,
            coverage_until=t(2026, 4, 20, 13, 0),
            coverage_status='sl_truncated',
            data_source='binance_futures',
        )

        # Critical: tp_then_sl flag
        assert result['tp_then_sl'] is True
        assert result['tps_hit_before_sl'] == ['tp1']

        # Initial mae before first event (TP1 at 11:00)
        # Pre-TP1 klines: just first kline. Low = 1.00 = entry. MAE = 0
        assert result['initial_mae_before'] == 'tp1'

        # Realized = SL (last event)
        assert result['realized_outcome_pct'] == pytest.approx(-5.0, abs=0.10)

        # Time to TP1 = 1 hour
        assert result['time_to_tp1_seconds'] == 3600

        # Outcome = SL at 13:00, 3 hours after entry
        assert result['time_to_outcome_seconds'] == 10800


class TestComputeJourney_OpenSignal:
    """Scenario 4: No telegram events — signal masih open."""

    def test_open_no_events(self):
        entry = 1.00
        created_at = t(2026, 4, 24, 10, 0)

        # Modest fluctuation, no TP/SL hit
        klines = make_klines(created_at, [
            (1.01, 0.98, 0.99),
            (1.02, 0.99, 1.01),
            (1.03, 1.00, 1.02),
        ])

        result = compute_journey(
            signal_id='sig-open-001',
            pair='TESTUSDT',
            direction='long',
            entry=entry,
            target1=1.10, target2=1.15, target3=1.20, target4=1.25,
            stop1=0.90,
            created_at=created_at,
            telegram_events=[],
            klines=klines,
            coverage_until=t(2026, 4, 24, 13, 0),
            coverage_status='live',
            data_source='binance_futures',
        )

        # No telegram events
        assert result['initial_mae_before'] == 'none'
        assert result['time_to_tp1_seconds'] is None
        assert result['time_to_outcome_seconds'] is None
        assert result['tp_then_sl'] is False
        assert result['realized_outcome_pct'] is None

        # MAE/MFE still computed from kline excursions
        assert result['overall_mae_pct'] == pytest.approx(-2.0, abs=0.10)
        assert result['overall_mfe_pct'] == pytest.approx(3.0, abs=0.10)


class TestComputeJourney_Short:
    """Scenario 5: Short signal — verify sign flipping."""

    def test_short_tp1_hit(self):
        entry = 1.00
        created_at = t(2026, 4, 24, 10, 0)

        # Short: target = below entry. Path: rise to 1.05 (adverse), drop to 0.95 (TP1)
        klines = make_klines(created_at, [
            (1.05, 1.00, 1.04),   # rise (adverse for short)
            (1.04, 0.95, 0.95),   # drop, hit TP1
        ])

        telegram_events = [
            TelegramEvent('tp1', t(2026, 4, 24, 11, 0), 0.95),
        ]

        result = compute_journey(
            signal_id='sig-short-001',
            pair='SHORTUSDT',
            direction='short',
            entry=entry,
            target1=0.95, target2=0.90, target3=0.85, target4=0.80,
            stop1=1.05,
            created_at=created_at,
            telegram_events=telegram_events,
            klines=klines,
            coverage_until=t(2026, 4, 24, 12, 0),
            coverage_status='live',
            data_source='binance_futures',
        )

        assert result['direction'] == 'short'

        # For short: rise to 1.05 = -5% (adverse)
        assert result['overall_mae_pct'] == pytest.approx(-5.0, abs=0.10)

        # Drop to 0.95 = +5% (favorable)
        assert result['overall_mfe_pct'] == pytest.approx(5.0, abs=0.10)

        # Realized = TP1 hit at 0.95 = +5%
        assert result['realized_outcome_pct'] == pytest.approx(5.0, abs=0.10)


class TestComputeJourney_NoKlines:
    """Scenario 6: data_source='unavailable' (pair gak ada di Binance/Bybit)."""

    def test_unavailable_returns_minimal(self):
        result = compute_journey(
            signal_id='sig-unav-001',
            pair='OBSCURECOIN',
            direction='long',
            entry=1.00,
            created_at=t(2026, 4, 24, 10, 0),
            telegram_events=[],
            klines=[],
            coverage_until=t(2026, 4, 24, 12, 0),
            coverage_status='unavailable',
            data_source='unavailable',
        )

        assert result['data_source'] == 'unavailable'
        assert result['coverage_status'] == 'unavailable'

        # All metrics null
        assert result['overall_mae_pct'] is None
        assert result['overall_mfe_pct'] is None
        assert result['initial_mae_pct'] is None
        assert result['time_to_tp1_seconds'] is None

        # But events array still has entry
        assert len(result['events']) == 1
        assert result['events'][0]['type'] == 'entry'

    def test_empty_klines_with_data_source(self):
        # Even kalau data_source bukan 'unavailable', kalau klines empty, treat sama
        result = compute_journey(
            signal_id='sig-empty-001',
            pair='TESTUSDT',
            direction='long',
            entry=1.00,
            created_at=t(2026, 4, 24, 10, 0),
            telegram_events=[],
            klines=[],
            coverage_until=t(2026, 4, 24, 12, 0),
            coverage_status='live',
            data_source='binance_futures',
        )

        assert result['coverage_status'] == 'unavailable'  # forced override
        assert result['overall_mae_pct'] is None


class TestComputeJourney_PureUptrend:
    """Scenario 7: Pure straight up — no swing low, no adverse moment."""

    def test_no_drawdown(self):
        entry = 1.00
        created_at = t(2026, 4, 24, 10, 0)

        # Strict monotonic uptrend
        klines = make_klines(created_at, [
            (1.005, 1.000, 1.003),
            (1.010, 1.003, 1.008),
            (1.015, 1.008, 1.013),
            (1.020, 1.013, 1.018),
        ])

        telegram_events = [
            TelegramEvent('tp1', t(2026, 4, 24, 11, 0), 1.005),
        ]

        result = compute_journey(
            signal_id='sig-up-001',
            pair='TESTUSDT',
            direction='long',
            entry=entry,
            target1=1.005,
            created_at=created_at,
            telegram_events=telegram_events,
            klines=klines,
            coverage_until=t(2026, 4, 24, 14, 0),
            coverage_status='live',
            data_source='binance_futures',
        )

        # MAE should be 0 (price never went below entry)
        assert result['overall_mae_pct'] == pytest.approx(0.0, abs=0.01)
        assert result['initial_mae_pct'] == pytest.approx(0.0, abs=0.01)

        # MFE = +2%
        assert result['overall_mfe_pct'] == pytest.approx(2.0, abs=0.10)

        # 100% time profitable (after first kline)
        assert result['pct_time_above_entry'] is not None
        assert result['pct_time_above_entry'] >= 75.0  # most of the time


class TestComputeJourney_Validation:
    """Scenario 8: Input validation."""

    def test_invalid_direction(self):
        with pytest.raises(ValueError, match="direction must be"):
            compute_journey(
                signal_id='x', pair='X', direction='invalid', entry=1.0,
                created_at=t(2026, 4, 24), telegram_events=[], klines=[],
                coverage_until=t(2026, 4, 24, 1), coverage_status='live',
                data_source='binance_futures',
            )

    def test_invalid_entry(self):
        with pytest.raises(ValueError, match="entry must be"):
            compute_journey(
                signal_id='x', pair='X', direction='long', entry=0,
                created_at=t(2026, 4, 24), telegram_events=[], klines=[],
                coverage_until=t(2026, 4, 24, 1), coverage_status='live',
                data_source='binance_futures',
            )

    def test_inverted_coverage_window(self):
        with pytest.raises(ValueError, match="coverage_until"):
            compute_journey(
                signal_id='x', pair='X', direction='long', entry=1.0,
                created_at=t(2026, 4, 24, 10), telegram_events=[], klines=[],
                coverage_until=t(2026, 4, 24, 9),  # before created_at
                coverage_status='live', data_source='binance_futures',
            )


# ============================================================
# OUTPUT SCHEMA CONFORMANCE TEST
# ============================================================

class TestOutputSchema:
    """Verify output dict has all expected fields matching DB schema."""

    EXPECTED_FIELDS = {
        'signal_id', 'direction', 'computed_at', 'last_event_at',
        'data_source', 'kline_interval', 'swing_threshold_pct',
        'coverage_from', 'coverage_until', 'coverage_status',
        'events',
        'overall_mae_pct', 'overall_mae_at',
        'overall_mfe_pct', 'overall_mfe_at',
        'initial_mae_pct', 'initial_mae_at', 'initial_mae_before',
        'time_to_tp1_seconds', 'time_to_outcome_seconds',
        'pct_time_above_entry',
        'tp_then_sl', 'tps_hit_before_sl',
        'realized_outcome_pct', 'missed_potential_pct',
    }

    def test_all_fields_present_happy_path(self):
        result = compute_journey(
            signal_id='x', pair='X', direction='long', entry=1.0,
            created_at=t(2026, 4, 24),
            telegram_events=[TelegramEvent('tp1', t(2026, 4, 24, 1), 1.05)],
            klines=make_klines(t(2026, 4, 24), [(1.05, 0.99, 1.04)]),
            coverage_until=t(2026, 4, 24, 2),
            coverage_status='live', data_source='binance_futures',
        )
        assert set(result.keys()) == self.EXPECTED_FIELDS

    def test_all_fields_present_unavailable(self):
        result = compute_journey(
            signal_id='x', pair='X', direction='long', entry=1.0,
            created_at=t(2026, 4, 24), telegram_events=[], klines=[],
            coverage_until=t(2026, 4, 24, 2),
            coverage_status='unavailable', data_source='unavailable',
        )
        assert set(result.keys()) == self.EXPECTED_FIELDS

    def test_constraints_satisfied(self):
        """Output should satisfy DB CHECK constraints."""
        result = compute_journey(
            signal_id='x', pair='X', direction='long', entry=1.0,
            created_at=t(2026, 4, 24),
            telegram_events=[TelegramEvent('tp1', t(2026, 4, 24, 1), 1.05)],
            klines=make_klines(t(2026, 4, 24), [(1.05, 0.95, 1.04)]),
            coverage_until=t(2026, 4, 24, 2),
            coverage_status='live', data_source='binance_futures',
        )

        # mae_pct <= 0
        if result['overall_mae_pct'] is not None:
            assert result['overall_mae_pct'] <= 0
        if result['initial_mae_pct'] is not None:
            assert result['initial_mae_pct'] <= 0

        # mfe_pct >= 0
        if result['overall_mfe_pct'] is not None:
            assert result['overall_mfe_pct'] >= 0

        # direction valid
        assert result['direction'] in ('long', 'short')

        # coverage_status valid
        assert result['coverage_status'] in ('live', 'frozen', 'sl_truncated', 'unavailable')

        # data_source valid
        assert result['data_source'] in (
            'binance_futures', 'binance_spot', 'bybit_linear', 'bybit_spot', 'unavailable'
        )

        # tp_then_sl consistency
        if result['tp_then_sl']:
            assert result['tps_hit_before_sl'] is not None
        else:
            assert result['tps_hit_before_sl'] is None

        # pct_time_above_entry 0-100
        if result['pct_time_above_entry'] is not None:
            assert 0 <= result['pct_time_above_entry'] <= 100

        # coverage_until >= coverage_from
        assert result['coverage_until'] >= result['coverage_from']
