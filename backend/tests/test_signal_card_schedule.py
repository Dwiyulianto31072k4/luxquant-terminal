"""The card schedule, pinned.

`pick_card` exists twice: here, and in card_poster.py on the VPS (which is not
in this repo). The admin UI reads this copy to tell the owner what will post, so
if the two drift the UI quietly lies. This pins the contract both must satisfy.

Every card that names one of our own calls must schedule as a `_bundle`, because
the bundle is what carries the proof-of-call receipts. money_flow (CoinGecko
sector logos) and etf_flows (ETF issuers) name no call of ours and stay bare.
"""
import datetime

from app.api.routes.admin_signal_cards import CARD_META, pick_card

SLOTS = "ABCDEFG"

# Cards that put one of OUR calls on screen by name.
NAMES_OUR_CALLS = {
    "daily_recap", "weekly_recap", "monthly_recap",
    "daily_gainers", "weekly_gainers", "monthly_gainers",
    "sector_edge", "track_record", "weekly_track_record",
}


def _scheduled(d):
    return {pick_card(d, s) for s in SLOTS} - {""}


def test_no_bare_card_naming_our_calls_is_ever_scheduled():
    d = datetime.date(2026, 9, 1)
    for _ in range(400):
        for card in _scheduled(d):
            assert card not in NAMES_OUR_CALLS, (
                f"{card} names our calls but schedules without proof on {d}")
        d += datetime.timedelta(days=1)


def test_every_scheduled_card_is_registered():
    d = datetime.date(2026, 9, 1)
    for _ in range(400):
        for card in _scheduled(d):
            assert card in CARD_META, f"{card} scheduled but missing from CARD_META"
        d += datetime.timedelta(days=1)


def test_daily_pair_runs_every_single_day():
    d = datetime.date(2026, 9, 1)
    for _ in range(400):
        got = _scheduled(d)
        assert "daily_recap_bundle" in got and "daily_gainers_bundle" in got, d
        d += datetime.timedelta(days=1)


def test_weekly_and_monthly_editions_land_on_their_day():
    assert "weekly_recap_bundle" in _scheduled(datetime.date(2026, 9, 7))   # Monday
    assert "sector_edge_bundle" in _scheduled(datetime.date(2026, 9, 9))    # Wednesday
    assert "weekly_track_record_bundle" in _scheduled(datetime.date(2026, 9, 6))  # Sunday
    assert "track_record_bundle" in _scheduled(datetime.date(2026, 9, 15))  # the 15th
    assert "monthly_recap_bundle" in _scheduled(datetime.date(2026, 10, 1))


def test_cards_naming_no_call_of_ours_stay_bare():
    """Adding proof to these would mean inventing a call we never made."""
    assert "money_flow" in _scheduled(datetime.date(2026, 9, 4))   # Friday
    assert "etf_flows" in _scheduled(datetime.date(2026, 9, 8))    # Tuesday
