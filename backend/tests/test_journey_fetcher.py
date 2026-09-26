"""
LuxQuant Terminal - Tests for Signal Journey Fetcher
=====================================================
Pytest scenarios for OHLCV fetcher dengan Binance/Bybit fallback.

NO real network call — all HTTP mocked via unittest.mock.

Run:
    cd backend
    python -m pytest tests/test_journey_fetcher.py -v
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.journey_fetcher import (  # noqa: E402
    fetch_klines_with_fallback,
    derive_direction,
    parse_created_at,
    parse_update_at,
    compute_coverage_until,
    _parse_binance_klines,
    _parse_bybit_klines,
    _fetch_binance_futures,
    _fetch_binance_spot,
    _fetch_bybit_linear,
    _fetch_bybit_spot,
    SOURCES,
)


UTC = timezone.utc


# ============================================================
# HELPERS — mock response builders
# ============================================================

def make_binance_response(klines_data):
    """Build a mock requests.Response for Binance kline endpoint."""
    mock = MagicMock(spec=requests.Response)
    mock.json.return_value = klines_data
    mock.raise_for_status.return_value = None
    return mock


def make_bybit_response(klines_data, ret_code=0):
    """Build a mock requests.Response for Bybit V5 kline endpoint."""
    mock = MagicMock(spec=requests.Response)
    mock.json.return_value = {
        'retCode': ret_code,
        'result': {'list': klines_data} if ret_code == 0 else {},
        'retMsg': 'OK' if ret_code == 0 else 'Symbol not found',
    }
    mock.raise_for_status.return_value = None
    return mock


def make_http_error_response(status_code):
    """Build a mock requests.Response that raises on raise_for_status."""
    mock = MagicMock(spec=requests.Response)
    mock.status_code = status_code
    err = requests.HTTPError(f"HTTP {status_code}")
    err.response = mock
    mock.raise_for_status.side_effect = err
    return mock


SAMPLE_BINANCE_KLINE = [
    1714000000000,  # open_time_ms
    "0.2088",       # open
    "0.2155",       # high
    "0.2030",       # low
    "0.2150",       # close
    "1000",         # volume
    1714003599999,  # close_time_ms
]

SAMPLE_BYBIT_KLINE = [
    "1714000000000",  # timestamp_ms (Bybit returns string)
    "0.2088",         # open
    "0.2155",         # high
    "0.2030",         # low
    "0.2150",         # close
    "1000",           # volume
    "215000",         # turnover
]


# ============================================================
# UNIT TESTS — parsers
# ============================================================

class TestParseBinanceKlines:
    def test_valid_kline(self):
        klines = _parse_binance_klines([SAMPLE_BINANCE_KLINE])
        assert len(klines) == 1
        k = klines[0]
        assert k.high == 0.2155
        assert k.low == 0.2030
        assert k.close == 0.2150
        assert k.open_time.tzinfo is not None  # Must be timezone-aware

    def test_empty_input(self):
        assert _parse_binance_klines([]) == []

    def test_malformed_skipped(self):
        # Mix valid and malformed
        klines = _parse_binance_klines([
            SAMPLE_BINANCE_KLINE,
            [1714000000000, "abc", "def"],  # too short + non-numeric
            None,
            SAMPLE_BINANCE_KLINE,
        ])
        # Should keep 2 valid, skip 2 bad
        assert len(klines) == 2

    def test_chronological_preserved(self):
        k1 = list(SAMPLE_BINANCE_KLINE)
        k1[0] = 1714000000000
        k2 = list(SAMPLE_BINANCE_KLINE)
        k2[0] = 1714003600000
        klines = _parse_binance_klines([k1, k2])
        assert klines[0].open_time < klines[1].open_time


class TestParseBybitKlines:
    def test_valid_response(self):
        raw = {
            'retCode': 0,
            'result': {'list': [SAMPLE_BYBIT_KLINE]},
        }
        klines = _parse_bybit_klines(raw)
        assert len(klines) == 1
        assert klines[0].high == 0.2155
        assert klines[0].open_time.tzinfo is not None

    def test_error_response(self):
        raw = {'retCode': 10001, 'retMsg': 'Symbol not found', 'result': {}}
        klines = _parse_bybit_klines(raw)
        assert klines == []

    def test_non_dict(self):
        assert _parse_bybit_klines([]) == []
        assert _parse_bybit_klines(None) == []  # type: ignore

    def test_reverses_to_chronological(self):
        # Bybit returns newest-first; parser must reverse
        k_old = list(SAMPLE_BYBIT_KLINE)
        k_old[0] = "1714000000000"
        k_new = list(SAMPLE_BYBIT_KLINE)
        k_new[0] = "1714003600000"
        # Newest first (Bybit convention)
        raw = {'retCode': 0, 'result': {'list': [k_new, k_old]}}
        klines = _parse_bybit_klines(raw)
        # After parse, must be chronological (oldest first)
        assert klines[0].open_time < klines[1].open_time


# ============================================================
# UNIT TESTS — derive_direction
# ============================================================

class TestDeriveDirection:
    def test_long(self):
        assert derive_direction(entry=100, target1=110) == 'long'

    def test_short(self):
        assert derive_direction(entry=100, target1=90) == 'short'

    def test_tp1_on_the_entry_tick_is_not_ambiguous(self):
        # This used to raise, and the raise was invisible: journey_persistor
        # calls derive_direction while building the record, so 70 signals that
        # hit the tie never got a journey row at all. The stop and the far
        # targets still say which way the plan points.
        assert derive_direction(entry=100, target1=100, stop1=97) == "long"
        assert derive_direction(entry=100, target1=100, stop1=103) == "short"
        assert derive_direction(entry=100, target1=100, target4=110) == "long"
        # Nothing but the entry to go on: the only direction this desk has
        # ever published.
        assert derive_direction(entry=100, target1=100) == "long"

    def test_negative_entry_raises(self):
        with pytest.raises(ValueError, match="must be > 0"):
            derive_direction(entry=-1, target1=110)


# ============================================================
# UNIT TESTS — parse_created_at
# ============================================================

class TestParseCreatedAt:
    def test_iso8601_with_offset(self):
        dt = parse_created_at("2025-10-01T08:36:14+00:00")
        assert dt == datetime(2025, 10, 1, 8, 36, 14, tzinfo=UTC)

    def test_iso8601_with_z_suffix(self):
        # Python 3.11+ supports 'Z' suffix in fromisoformat
        # If we're on older Python, this may fail — check & skip
        try:
            dt = parse_created_at("2025-10-01T08:36:14Z")
        except ValueError:
            pytest.skip("fromisoformat doesn't accept 'Z' on this Python version")
        assert dt.year == 2025

    def test_naive_added_utc(self):
        dt = parse_created_at("2025-10-01T08:36:14")
        assert dt.tzinfo == UTC

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            parse_created_at("not a date")
        with pytest.raises(ValueError):
            parse_created_at("")
        with pytest.raises(ValueError):
            parse_created_at(None)  # type: ignore


# ============================================================
# UNIT TESTS — compute_coverage_until
# ============================================================

class TestComputeCoverageUntil:
    NOW = datetime(2026, 5, 1, 12, 0, tzinfo=UTC)

    def test_no_events_live(self):
        until, status = compute_coverage_until(
            last_event_type=None, last_event_at=None, now=self.NOW,
        )
        assert until == self.NOW
        assert status == 'live'

    def test_intermediate_tp1(self):
        until, status = compute_coverage_until(
            last_event_type='tp1',
            last_event_at=self.NOW - timedelta(days=2),
            now=self.NOW,
        )
        assert until == self.NOW
        assert status == 'live'

    def test_tp4_recent_live(self):
        until, status = compute_coverage_until(
            last_event_type='tp4',
            last_event_at=self.NOW - timedelta(days=5),
            now=self.NOW,
        )
        assert until == self.NOW
        assert status == 'live'

    def test_tp4_old_frozen(self):
        tp4_at = self.NOW - timedelta(days=20)
        until, status = compute_coverage_until(
            last_event_type='tp4',
            last_event_at=tp4_at,
            now=self.NOW,
        )
        assert until == tp4_at + timedelta(days=14)
        assert status == 'frozen'

    def test_sl_truncated(self):
        sl_at = self.NOW - timedelta(days=3)
        until, status = compute_coverage_until(
            last_event_type='sl',
            last_event_at=sl_at,
            now=self.NOW,
        )
        assert until == sl_at
        assert status == 'sl_truncated'


# ============================================================
# INTEGRATION TESTS — fetch_klines_with_fallback
# ============================================================

class TestFetchWithFallback:
    """Test fallback chain behavior with mocked requests."""

    def setup_method(self):
        self.start = datetime(2026, 4, 24, 11, 55, tzinfo=UTC)
        self.end = datetime(2026, 4, 25, 0, 0, tzinfo=UTC)

    @patch('app.services.journey_fetcher.requests.get')
    def test_binance_futures_first_try_success(self, mock_get):
        mock_get.return_value = make_binance_response([SAMPLE_BINANCE_KLINE])

        klines, source = fetch_klines_with_fallback(
            'MAGMAUSDT', self.start, self.end, '1h',
        )

        assert len(klines) == 1
        assert source == 'binance_futures'
        # Hanya 1 call (first source succeeded)
        assert mock_get.call_count == 1
        # Verify URL hit
        assert 'fapi.binance.com' in mock_get.call_args[0][0]

    @patch('app.services.journey_fetcher.requests.get')
    @patch('app.services.journey_fetcher.time.sleep')
    def test_fallback_to_bybit_when_binance_fails(self, _mock_sleep, mock_get):
        # Binance futures + spot return HTTP 451 (Indonesia ISP block scenario)
        # Bybit linear succeeds
        mock_get.side_effect = [
            make_http_error_response(451),       # binance_futures fail
            make_http_error_response(451),       # binance_spot fail
            make_bybit_response([SAMPLE_BYBIT_KLINE]),  # bybit_linear OK
        ]

        klines, source = fetch_klines_with_fallback(
            'MAGMAUSDT', self.start, self.end, '1h',
        )

        assert len(klines) == 1
        assert source == 'bybit_linear'
        assert mock_get.call_count == 3

    @patch('app.services.journey_fetcher.requests.get')
    @patch('app.services.journey_fetcher.time.sleep')
    def test_all_sources_fail(self, _mock_sleep, mock_get):
        # All 4 fail with various errors
        mock_get.side_effect = [
            make_http_error_response(404),
            make_http_error_response(404),
            make_bybit_response([], ret_code=10001),  # bybit symbol not found
            make_bybit_response([], ret_code=10001),
        ]

        klines, source = fetch_klines_with_fallback(
            'OBSCURECOIN', self.start, self.end, '1h',
        )

        assert klines == []
        assert source == 'unavailable'
        assert mock_get.call_count == 4

    @patch('app.services.journey_fetcher.requests.get')
    @patch('app.services.journey_fetcher.time.sleep')
    def test_empty_response_treated_as_failure(self, _mock_sleep, mock_get):
        # Binance returns empty array (pair listed but no data in range)
        # Bybit linear succeeds
        mock_get.side_effect = [
            make_binance_response([]),           # empty
            make_binance_response([]),           # empty
            make_bybit_response([SAMPLE_BYBIT_KLINE]),
        ]

        klines, source = fetch_klines_with_fallback(
            'TESTUSDT', self.start, self.end, '1h',
        )

        assert len(klines) == 1
        assert source == 'bybit_linear'

    @patch('app.services.journey_fetcher.requests.get')
    @patch('app.services.journey_fetcher.time.sleep')
    def test_network_timeout_handled(self, _mock_sleep, mock_get):
        # First source: network timeout
        # Second source: success
        mock_get.side_effect = [
            requests.Timeout("timeout"),
            make_binance_response([SAMPLE_BINANCE_KLINE]),
        ]

        klines, source = fetch_klines_with_fallback(
            'BTCUSDT', self.start, self.end, '1h',
        )

        assert len(klines) == 1
        assert source == 'binance_spot'

    def test_invalid_range(self):
        # start >= end should return unavailable without fetching
        klines, source = fetch_klines_with_fallback(
            'BTCUSDT', self.end, self.start, '1h',  # swapped
        )
        assert klines == []
        assert source == 'unavailable'

    def test_invalid_interval_raises(self):
        with pytest.raises(ValueError, match="Unsupported interval"):
            fetch_klines_with_fallback(
                'BTCUSDT', self.start, self.end, '99x',
            )

    @patch('app.services.journey_fetcher.requests.get')
    def test_custom_sources_override(self, mock_get):
        # Inject custom source list — useful untuk priority experiment
        mock_get.return_value = make_bybit_response([SAMPLE_BYBIT_KLINE])

        custom = [('bybit_linear', _fetch_bybit_linear)]
        klines, source = fetch_klines_with_fallback(
            'BTCUSDT', self.start, self.end, '1h',
            sources=custom,
        )

        assert source == 'bybit_linear'
        assert mock_get.call_count == 1


# ============================================================
# DEFAULT CONFIG SANITY
# ============================================================

class TestSourcesConfig:
    def test_sources_order_per_design(self):
        # Per design: binance_futures > binance_spot > bybit_linear > bybit_spot
        names = [s[0] for s in SOURCES]
        assert names == ['binance_futures', 'binance_spot', 'bybit_linear', 'bybit_spot']

    def test_all_sources_callable(self):
        for name, fn in SOURCES:
            assert callable(fn), f"Source {name} not callable"


# ============================================================
# 2026-09-26: Bybit coverage window + twin instruments
# ============================================================

def _bybit_page(start_ms, n, price=1.0, step_ms=3600_000):
    """A Bybit V5 kline response: n hourly candles from start_ms, newest first."""
    rows = [[str(start_ms + i * step_ms), str(price), str(price), str(price), str(price), "1", "1"] for i in range(n)]
    rows.reverse()
    resp = MagicMock()
    resp.json.return_value = {"retCode": 0, "result": {"list": rows}}
    resp.raise_for_status.return_value = None
    return resp


class TestBybitCoversTheCallNotTheLatestMonth:
    @patch('app.services.journey_fetcher.requests.get')
    def test_pages_forward_from_start_like_binance(self, mock_get):
        start = int(datetime(2024, 1, 1, tzinfo=UTC).timestamp() * 1000)
        end = start + 5000 * 3600_000                       # a signal 5000 h long
        mock_get.side_effect = lambda url, params, timeout: _bybit_page(
            params['start'], (params['end'] - params['start']) // 3600_000 + 1)
        klines = _fetch_bybit_linear('XUSDT', start, end, '1h')
        windows = [(c.kwargs['params']['start'], c.kwargs['params']['end']) for c in mock_get.call_args_list]
        assert windows[0][0] == start                        # begins at the call
        assert len(windows) == 2                             # 1000 + 500 candles
        assert len(klines) == 1500                           # same span as Binance
        assert klines[0].open_time == datetime(2024, 1, 1, tzinfo=UTC)
        assert all(a.open_time < b.open_time for a, b in zip(klines, klines[1:]))

    @patch('app.services.journey_fetcher.requests.get')
    def test_stops_when_a_page_is_empty(self, mock_get):
        start = int(datetime(2024, 1, 1, tzinfo=UTC).timestamp() * 1000)
        mock_get.side_effect = [_bybit_page(start, 1000), _bybit_page(start, 0)]
        klines = _fetch_bybit_spot('XUSDT', start, start + 3000 * 3600_000, '1h')
        assert len(klines) == 1000 and mock_get.call_count == 2


class TestTwinInstrumentsAreSkipped:
    def _source(self, name, price):
        from app.services.journey_fetcher import Kline
        k = [Kline(open_time=datetime(2025, 1, 1, tzinfo=UTC), open=price, high=price, low=price, close=price)]
        return (name, lambda *a, **kw: k)

    def test_a_source_off_by_orders_of_magnitude_is_skipped(self):
        # DEFIUSDT: Binance's DeFi index near 1,000 vs a 0.002 token on Bybit spot
        sources = [self._source('bybit_spot', 0.00189), self._source('bybit_linear', 1010.0)]
        klines, src = fetch_klines_with_fallback(
            'DEFIUSDT', datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC),
            sources=sources, reference_price=1000.0)
        assert src == 'bybit_linear' and klines[0].close == 1010.0

    def test_no_match_anywhere_is_unavailable_not_a_wrong_path(self):
        sources = [self._source('a', 0.002), self._source('b', 25_000.0)]
        klines, src = fetch_klines_with_fallback(
            'X', datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC),
            sources=sources, reference_price=1.0)
        assert (klines, src) == ([], 'unavailable')

    def test_a_limit_entry_away_from_market_still_matches(self):
        sources = [self._source('a', 1.35)]                 # entry 35% below market
        _, src = fetch_klines_with_fallback(
            'X', datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC),
            sources=sources, reference_price=1.0)
        assert src == 'a'

    def test_decimal_or_missing_reference_is_tolerated(self):
        from decimal import Decimal
        sources = [self._source('a', 1.0)]
        for ref in (Decimal("1.02"), None, "n/a"):
            _, src = fetch_klines_with_fallback(
                'X', datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC),
                sources=sources, reference_price=ref)
            assert src == 'a'


class TestLateListingIsNotTheCall:
    def test_a_source_that_starts_weeks_after_the_call_is_skipped(self):
        from app.services.journey_fetcher import Kline
        call = datetime(2025, 3, 1, tzinfo=UTC)
        late = [Kline(open_time=call + timedelta(days=40), open=1, high=1, low=1, close=1)]
        ontime = [Kline(open_time=call, open=1, high=1, low=1, close=1)]
        sources = [('binance_futures', lambda *a, **k: late), ('bybit_linear', lambda *a, **k: ontime)]
        klines, src = fetch_klines_with_fallback('X', call, call + timedelta(days=60),
                                                 sources=sources, reference_price=1.0)
        assert src == 'bybit_linear'
