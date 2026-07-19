"""
Tests for journey_fetcher._needed_candles — the kline request sizing.

Why this has tests at all: Binance charges kline weight on the LIMIT
PARAMETER, not on the rows it returns, and this function decides that
parameter. Getting it wrong is expensive in one direction (asking 1500 for a
two-day range cost weight 10 instead of 1) and silently lossy in the other
(asking for fewer candles than the range spans truncates a signal's journey).

Measured against production before the change:
    limit=1500 → weight 9, 48 rows
    limit=48   → weight 1, 48 rows, identical first and last open times
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.journey_fetcher import (  # noqa: E402
    _needed_candles,
    BINANCE_MAX_LIMIT,
    BYBIT_MAX_LIMIT,
    INTERVAL_SECONDS,
)

MS = 1000
HOUR = 3600 * MS
DAY = 24 * HOUR


class TestCoversTheRange:
    """It must never ask for fewer candles than the window contains."""

    def test_two_day_hourly_window(self):
        n = _needed_candles(0, 2 * DAY, "1h", BINANCE_MAX_LIMIT)
        assert n >= 48, "48 hourly candles span two days; asking for less truncates"
        assert n <= 52, f"padding should be small, got {n}"

    def test_seven_day_hourly_window(self):
        n = _needed_candles(0, 7 * DAY, "1h", BINANCE_MAX_LIMIT)
        assert n >= 168
        assert n <= 172

    def test_every_interval_covers_its_own_span(self):
        # A day's worth of each interval must come back with at least a day of
        # candles — this is the property that actually matters.
        for interval, secs in INTERVAL_SECONDS.items():
            expected = DAY // (secs * MS)
            n = _needed_candles(0, DAY, interval, BINANCE_MAX_LIMIT)
            assert n >= min(expected, BINANCE_MAX_LIMIT), (
                f"{interval}: asked {n}, needs {expected}"
            )


class TestStaysCheap:
    """The whole point: short ranges must not pay for 1500 candles."""

    def test_short_range_is_far_below_the_cap(self):
        n = _needed_candles(0, 2 * DAY, "1h", BINANCE_MAX_LIMIT)
        assert n < 100, (
            f"limit {n} lands in a higher weight tier than necessary; "
            "≤100 is weight 1, >1000 is weight 10"
        )

    def test_long_range_still_uses_the_cap(self):
        # 90 days hourly is 2160 candles — more than the API allows in one call,
        # so it must clamp rather than ask for something that gets rejected.
        assert _needed_candles(0, 90 * DAY, "1h", BINANCE_MAX_LIMIT) == BINANCE_MAX_LIMIT

    def test_respects_the_bybit_cap_separately(self):
        assert _needed_candles(0, 90 * DAY, "1h", BYBIT_MAX_LIMIT) == BYBIT_MAX_LIMIT


class TestEdges:
    def test_zero_length_range(self):
        n = _needed_candles(5 * DAY, 5 * DAY, "1h", BINANCE_MAX_LIMIT)
        assert 1 <= n <= 3, f"a zero-width window should ask for almost nothing, got {n}"

    def test_reversed_range_does_not_explode(self):
        # end before start: clamp to the minimum rather than going negative,
        # which would make the API reject the call outright.
        n = _needed_candles(5 * DAY, 1 * DAY, "1h", BINANCE_MAX_LIMIT)
        assert n >= 1

    def test_unknown_interval_falls_back_to_the_cap(self):
        # Better to overpay than to silently truncate someone's journey.
        assert _needed_candles(0, 2 * DAY, "3w", BINANCE_MAX_LIMIT) == BINANCE_MAX_LIMIT

    def test_never_exceeds_the_cap_for_any_interval(self):
        for interval in INTERVAL_SECONDS:
            n = _needed_candles(0, 365 * DAY, interval, BINANCE_MAX_LIMIT)
            assert n <= BINANCE_MAX_LIMIT, f"{interval} asked for {n}"
