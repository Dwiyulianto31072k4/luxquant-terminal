"""The Compass caption must say what changed, in words nobody misreads.

On 26 Sep 2026 a member read "UPDATED · levels refreshed · 8h ago" on a report
generated minutes earlier as eight hours old and asked whether it still applied:
the 8h was the gap to the report it replaced. The owner asked for updates to say
it plainly — the numbers from N hours ago became these.
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


def _previous(hours, direction="neutral", confidence=52, target=83200, stop=82700, price=84063):
    return {
        "message_id": 1,
        "sent_at": datetime.now(timezone.utc) - timedelta(hours=hours),
        "direction": direction,
        "confidence": confidence,
        "target": target,
        "stop": stop,
        "price": price,
    }


def _lines(caption):
    return caption.split("\n")


def test_header_names_the_report_it_replaces():
    assert _lines(build_caption(REPORT, _previous(8)))[0] == "🔄 <b>UPDATE</b> · replaces the report from 8h ago"


def test_old_numbers_become_new_numbers():
    lines = _lines(build_caption(REPORT, _previous(3)))
    start = lines.index("<b>3h ago → now</b>")
    assert lines[start + 1:start + 4] == [
        "Target: $83,200 → $83,166",
        "Stop: $82,700 → $82,000",
        "BTC: $84,063 → $83,941",
    ]


def test_unchanged_levels_say_so():
    caption = build_caption(REPORT, _previous(3, target=83166, stop=82000))
    assert "Target and stop unchanged" in caption
    assert "Target: " not in caption


def test_a_flip_and_a_confidence_move_are_listed():
    caption = build_caption(REPORT, _previous(3, direction="bearish", confidence=61))
    assert "Direction: BEARISH → NEUTRAL" in caption
    assert "Confidence: 61% → 52%" in caption


def test_same_direction_and_confidence_are_not_repeated():
    caption = build_caption(REPORT, _previous(3))
    assert "Direction:" not in caption and "Confidence:" not in caption


def test_confidence_is_labelled():
    assert "52% confidence" in build_caption(REPORT, _previous(1))


def test_why_is_labelled_and_not_timed():
    caption = build_caption(REPORT, _previous(1))
    assert "<b>Why</b> · Previous report: neutral" in caption
    assert "0.5h ago" not in caption


def test_first_report_has_no_update_or_changes():
    caption = build_caption(REPORT, None)
    assert "UPDATE" not in caption and "→ now" not in caption


def test_levels_use_plain_words():
    caption = build_caption(REPORT, _previous(1))
    for word in ("Ceiling", "Now", "Target", "Stop"):
        assert word in caption
    for jargon in ("Lid ", "Spot ", "Invalid "):
        assert jargon not in caption


def test_an_older_previous_without_levels_still_posts():
    caption = build_caption(REPORT, _previous(2, target=None, stop=None, price=None))
    assert "UPDATE" in caption and "Target and stop unchanged" not in caption
