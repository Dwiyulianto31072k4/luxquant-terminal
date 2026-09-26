"""What partners actually send to the public API, answered instead of refused.

From two days of access logs (25 Sep 2026): TradingBot-Core polls
/market-pulse?limit=15 (a path that never existed, 404 every time), flowstate-bot
asks /btc-correlation/recent?limit=200 (422 on le=100) and passes pairs where a
signal_id is documented (/btc-correlation/BNBUSDT, 404).
"""
import uuid

from app.api.routes import public_data


def test_bare_market_pulse_answers_as_the_feed():
    routes = {r.path: r for r in public_data.router.routes}
    assert routes["/market-pulse"].endpoint is public_data.public_pulse_feed
    assert routes["/market-pulse/feed"].endpoint is public_data.public_pulse_feed
    assert routes["/market-pulse"].include_in_schema is False  # docs keep /feed


def test_oversized_limit_is_clamped_not_refused():
    assert public_data._clamp_limit(200) == 100
    assert public_data._clamp_limit(50) == 50
    assert public_data._clamp_limit(0) == 1


def test_pair_spellings_become_a_signals_pair():
    for raw in ("bnb", "BNB/USDT", "bnbusdt", " BNB-USDT "):
        assert public_data._as_pair(raw) == "BNBUSDT"


def test_signal_ids_and_pairs_are_told_apart():
    assert public_data._is_signal_id(str(uuid.uuid4()))
    assert not public_data._is_signal_id("BNBUSDT")
    assert not public_data._is_signal_id("ONDO")
