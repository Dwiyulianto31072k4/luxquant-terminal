"""The Compass caption must not read as stale, or as desk jargon.

On 26 Sep 2026 a member read "UPDATED · levels refreshed · 8h ago" on a report
generated minutes earlier as eight hours old and asked whether it still applied:
the 8h was the gap to the report it replaced. "Invalid" and "Lid" meant nothing
to him either.
"""
from datetime import datetime, timedelta, timezone

from app.services.compass_telegram import build_caption

REPORT = {
    "btc_price": 83941,
    "verdict": {
        "tactical_24h": {"direction": "neutral", "confidence": 52},
        "headline": "Neutral Tape — 83.2K–85.3K Range Intact",
        "what_changed": "0.5h ago: neutral 83.2K–85.3K, lower retest active at 83,941. Now 84,063.",
        "scenario_contract": {
            "reference_price": 83941,
            "primary_bias": "NEUTRAL_RANGE",
            "primary_touch": {"level": 83166},
            "invalidation": {"level": 82000},
            "extension_zone": {"price_high": 85258},
        },
    },
}


def _previous(hours, direction="neutral", confidence=52):
    return {
        "message_id": 1,
        "sent_at": datetime.now(timezone.utc) - timedelta(hours=hours),
        "direction": direction,
        "confidence": confidence,
    }


def test_header_names_the_gap_to_the_previous_report():
    first_line = build_caption(REPORT, _previous(8)).split("\n")[0]
    assert "previous report was 8h earlier" in first_line
    assert "ago" not in first_line


def test_same_direction_says_so():
    assert "same direction" in build_caption(REPORT, _previous(3))


def test_a_flip_says_direction_changed_and_what_it_was():
    caption = build_caption(REPORT, _previous(3, direction="bearish", confidence=61))
    assert "direction changed" in caption
    assert "(was ↓ BEARISH 61%)" in caption


def test_confidence_is_labelled():
    assert "52% confidence" in build_caption(REPORT, _previous(1))


def test_what_changed_is_labelled_and_not_timed():
    caption = build_caption(REPORT, _previous(1))
    assert "<b>What changed</b> · Previous report: neutral" in caption
    assert "0.5h ago" not in caption


def test_first_report_has_no_update_line():
    assert not build_caption(REPORT, None).startswith("<b>UPDATE</b>")


def test_levels_use_plain_words():
    caption = build_caption(REPORT, _previous(1))
    for word in ("Ceiling", "Now", "Target", "Stop"):
        assert word in caption
    for jargon in ("Lid ", "Spot ", "Invalid "):
        assert jargon not in caption
