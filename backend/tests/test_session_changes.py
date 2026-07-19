"""
Tests for the modules changed in the 2026-07-18/19 session that had none:
terminal_worker's statistics and ban handling, the notification group taxonomy,
and market.py's WS-overlay ticker path.

Everything here is pure or mocked — no DB, no Redis, no network — matching the
rest of the suite.
"""

import asyncio
import os
import sys
import time
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services import terminal_worker as tw  # noqa: E402
from app.api.routes.notifications import NOTIF_GROUPS  # noqa: E402
from app.api.routes.notification_preferences import NOTIF_REGISTRY  # noqa: E402
from app.api.routes import market  # noqa: E402


# ════════════════════════════════════════════════════════════════
# _med / _avg — the statistics the Terminal's "room left" runs on
# ════════════════════════════════════════════════════════════════
class TestMedian:
    """Why the median exists at all: one moonshot in a pair's history dragged
    the MEAN to +1169% (VELVET, n=9) and the UI showed it as expectable room.
    Production check: median-of-medians 9.55%% vs mean 12.56%% — the mean
    overstates the typical move by 1.32x."""

    def test_odd_and_even_lengths(self):
        assert tw._med([1, 2, 3]) == 2
        assert tw._med([1, 2, 3, 4]) == 2.5

    def test_single_value_and_empty(self):
        assert tw._med([7]) == 7
        assert tw._med([]) is None

    def test_unsorted_input(self):
        assert tw._med([9, 1, 5]) == 5

    def test_outlier_resistance_is_the_point(self):
        # 19 ordinary calls and one 1169% moonshot: the mean triples, the
        # median barely moves. This asymmetry is the entire reason the UI
        # switched metrics.
        ordinary = [10.0] * 19
        med, avg = tw._med(ordinary + [1169.0]), tw._avg(ordinary + [1169.0])
        assert med == 10.0
        assert avg > 60.0

    def test_rounding_matches_avg_contract(self):
        assert tw._med([1.111, 2.222, 3.333]) == 2.22
        assert tw._avg([1.0, 2.0]) == 1.5


# ════════════════════════════════════════════════════════════════
# _note_ban / _fapi_ok — the floors that stop 418s escalating
# ════════════════════════════════════════════════════════════════
class FakeResp(SimpleNamespace):
    def __init__(self, status, retry_after=None):
        headers = {"Retry-After": str(retry_after)} if retry_after else {}
        super().__init__(status_code=status, headers=headers)


@pytest.fixture()
def isolated_ban_state(monkeypatch):
    """Reset the process-local ban and replace Redis with a dict."""
    store = {}
    monkeypatch.setattr(tw, "_fapi_banned_until", 0.0)
    monkeypatch.setattr(tw, "cache_set", lambda k, v, ttl=None: store.__setitem__(k, v))
    monkeypatch.setattr(tw, "cache_get", lambda k: store.get(k))
    return store


class TestBanFloors:
    """Binance escalates an IP ban every time it is hit DURING one — 2 minutes
    to 3 days. These floors are what keeps a 418 from being probed to death."""

    def test_418_floor_is_at_least_an_hour(self, isolated_ban_state):
        tw._note_ban(FakeResp(418), default_secs=600)
        assert tw._fapi_banned_until - time.time() >= 3600 - 5

    def test_429_floor_is_at_least_ten_minutes(self, isolated_ban_state):
        tw._note_ban(FakeResp(429), default_secs=120)
        remaining = tw._fapi_banned_until - time.time()
        assert 600 - 5 <= remaining < 3600

    def test_retry_after_extends_beyond_the_floor(self, isolated_ban_state):
        tw._note_ban(FakeResp(418, retry_after=7200), default_secs=600)
        assert tw._fapi_banned_until - time.time() >= 7200 - 5

    def test_ban_is_published_for_other_processes(self, isolated_ban_state):
        # The original bug: each gunicorn worker kept a private opinion of the
        # ban, so one backed off while three kept knocking from the same IP.
        tw._note_ban(FakeResp(418), default_secs=600)
        shared = isolated_ban_state.get(tw.FAPI_BAN_KEY)
        assert shared is not None
        assert float(shared["until"]) > time.time()

    def test_fapi_ok_honours_a_ban_recorded_elsewhere(self, isolated_ban_state):
        # local state says fine; shared state says banned — shared must win
        isolated_ban_state[tw.FAPI_BAN_KEY] = {"until": time.time() + 300}
        assert tw._fapi_ok() is False

    def test_fapi_ok_true_when_no_ban_anywhere(self, isolated_ban_state):
        assert tw._fapi_ok() is True


# ════════════════════════════════════════════════════════════════
# NOTIF_GROUPS — the inbox taxonomy is DERIVED, never restated
# ════════════════════════════════════════════════════════════════
class TestNotifGroups:
    def test_every_registry_type_lands_in_exactly_one_group(self):
        placed = [t for types in NOTIF_GROUPS.values() for t in types]
        assert sorted(placed) == sorted(r["type"] for r in NOTIF_REGISTRY)
        assert len(placed) == len(set(placed))

    def test_group_membership_matches_the_registry(self):
        for r in NOTIF_REGISTRY:
            assert r["type"] in NOTIF_GROUPS[r["group"]]

    def test_the_groups_the_ui_tabs_rely_on_exist(self):
        # NotificationsPage renders Signals/Market/Account tabs against these
        # names; renaming a group silently empties a tab.
        for g in ("signals", "market", "account"):
            assert g in NOTIF_GROUPS, f"UI tab group '{g}' missing"

    def test_signals_group_carries_the_actionable_types(self):
        # The whole point of the split: coin_called was 2.7% of an undivided
        # inbox behind 5,350 news items.
        assert "coin_called" in NOTIF_GROUPS["signals"]
        assert "news" in NOTIF_GROUPS["market"]
        assert "news" not in NOTIF_GROUPS["signals"]


# ════════════════════════════════════════════════════════════════
# market.py — WS blob mapping and the REST/WS overlay
# ════════════════════════════════════════════════════════════════
def _ws_blob(n=60, **overrides):
    """A blob big enough to pass the ≥50-symbol floor."""
    pairs = {
        f"FILL{i}USDT": {"price": 1.0, "vol": 10.0, "chg": 0.1, "high": 1.1, "low": 0.9}
        for i in range(n)
    }
    pairs.update(overrides)
    return {"generated_at": time.time(), "pairs": pairs}


class FakeClient:
    """Stands in for the shared httpx client; counts what gets spent."""

    def __init__(self, payload):
        self.payload = payload
        self.calls = 0

    async def get(self, url, **kw):
        self.calls += 1
        return SimpleNamespace(status_code=200, headers={}, json=lambda: self.payload)


class TestTickersFromWs:
    def test_absent_blob_returns_none(self, monkeypatch):
        monkeypatch.setattr(market, "cache_get", lambda k: None)
        assert market._tickers_from_ws() is None

    def test_thin_blob_is_rejected(self, monkeypatch):
        # A barely-populated blob means the stream just connected; serving it
        # would blank most of the table.
        monkeypatch.setattr(market, "cache_get", lambda k: _ws_blob(n=5))
        assert market._tickers_from_ws() is None

    def test_full_blob_maps_every_field(self, monkeypatch):
        blob = _ws_blob(BTCUSDT={"price": 64000.0, "vol": 5e10, "chg": 1.2, "high": 65000.0, "low": 63000.0})
        monkeypatch.setattr(market, "cache_get", lambda k: blob)
        out = market._tickers_from_ws()
        assert out["BTCUSDT"] == {
            "price": 64000.0, "volume": 5e10, "change": 1.2,
            "high_24h": 65000.0, "low_24h": 63000.0,
        }

    def test_symbols_without_a_ticker_price_are_skipped(self, monkeypatch):
        # !markPrice@arr covers every symbol but !ticker@arr only pushes on
        # change — quiet pairs sit with mark and no price. Including them is
        # the bug that blanked RECALL and CTR in the table.
        blob = _ws_blob(QUIETUSDT={"mark": 1.23, "funding": 0.0001})
        monkeypatch.setattr(market, "cache_get", lambda k: blob)
        assert "QUIETUSDT" not in market._tickers_from_ws()


REST_PAYLOAD = [
    {"symbol": "BTCUSDT", "lastPrice": "64000", "quoteVolume": "5e10",
     "priceChangePercent": "1.0", "highPrice": "65000", "lowPrice": "63000"},
    {"symbol": "QUIETUSDT", "lastPrice": "1.23", "quoteVolume": "1000",
     "priceChangePercent": "0.5", "highPrice": "1.3", "lowPrice": "1.1"},
]


class TestFetchBinanceTickers:
    def _run(self, client, monkeypatch, ws_blob=None, banned=False):
        monkeypatch.setattr(market, "cache_get", lambda k: ws_blob)
        monkeypatch.setattr(tw, "_fapi_ok", lambda: not banned)
        return asyncio.run(market._fetch_binance_tickers(client))

    def test_rest_provides_coverage_when_ws_is_silent_about_a_symbol(self, monkeypatch):
        # THE regression this session shipped and reverted: WS-only serving
        # dropped 155 of 779 symbols and the table rendered blank prices.
        client = FakeClient(REST_PAYLOAD)
        out = self._run(client, monkeypatch, ws_blob=_ws_blob())
        assert "QUIETUSDT" in out, "symbol absent from WS must still be served from REST"
        assert out["QUIETUSDT"]["price"] == 1.23

    def test_ws_overlay_freshens_symbols_rest_already_has(self, monkeypatch):
        blob = _ws_blob(BTCUSDT={"price": 64999.0, "vol": 6e10, "chg": 2.0, "high": 65500.0, "low": 63000.0})
        client = FakeClient(REST_PAYLOAD)
        out = self._run(client, monkeypatch, ws_blob=blob)
        assert out["BTCUSDT"]["price"] == 64999.0  # stream wins on freshness

    def test_overlay_never_introduces_symbols(self, monkeypatch):
        blob = _ws_blob(GHOSTUSDT={"price": 9.9, "vol": 1.0, "chg": 0.0, "high": 10.0, "low": 9.0})
        client = FakeClient(REST_PAYLOAD)
        out = self._run(client, monkeypatch, ws_blob=blob)
        assert "GHOSTUSDT" not in out, "overlay must not add symbols REST did not list"

    def test_active_ban_refuses_to_spend_the_request(self, monkeypatch):
        # Binance escalates a ban every time it is hit during one; the guard
        # exists so a banned IP goes quiet instead of digging deeper.
        client = FakeClient(REST_PAYLOAD)
        out = self._run(client, monkeypatch, ws_blob=None, banned=True)
        assert out is None
        assert client.calls == 0, "a banned client must not call Binance at all"
