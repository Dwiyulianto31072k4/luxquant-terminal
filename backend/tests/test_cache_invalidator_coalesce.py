"""A burst of NOTIFYs is one flush, not one every half second.

On 25 Sep 2026, 77 of 302 flushes landed within 3 s of the previous one, and
each flush empties the signal caches the next readers rebuild from the DB.
"""
import asyncio

import app.services.cache_invalidator as ci


def test_quiet_channel_flushes_after_the_quiet_window():
    assert ci.flush_wait(now=10.0, burst_started=8.0, last_event=8.0) == 0.0
    assert ci.flush_wait(now=9.0, burst_started=8.0, last_event=8.0) == 1.0


def test_a_steady_stream_is_still_flushed_by_the_cap():
    # events keep arriving every second: quiet never comes, the cap decides
    assert ci.flush_wait(now=16.0, burst_started=8.0, last_event=15.9) == 0.0


def test_a_burst_of_events_becomes_one_flush(monkeypatch):
    monkeypatch.setattr(ci, "_QUIET_SECONDS", 0.05)
    monkeypatch.setattr(ci, "_MAX_DELAY_SECONDS", 1.0)
    monkeypatch.setattr(ci, "_pending_flush", None)
    flushes = []
    monkeypatch.setattr(ci, "invalidate_signals_cache", lambda: flushes.append(1) or 0)

    async def burst():
        for _ in range(10):              # TP1, TP2, TP3... 20 ms apart
            ci._on_notify(None, 0, "signal_update", "")
            await asyncio.sleep(0.02)
        await asyncio.sleep(0.2)
        ci._on_notify(None, 0, "new_signal", "")   # a separate, later event
        await asyncio.sleep(0.2)

    asyncio.run(burst())
    assert len(flushes) == 2
