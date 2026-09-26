"""The levels on the Compass card.

A NEUTRAL_RANGE read is two-sided, but the card used to print only the level
the AI expects to touch first. When that level sat below spot the card read as
a bearish call under a NEUTRAL verdict — the lid that made it a range stayed in
the database. Measured over 30 days: 130/130 range contracts had a lid above
spot and none of them printed it.

They are plain lines now, not a monospace column: budgeted at 22 characters,
the column still broke on the owner's desktop pane, "+1.6%" on a line of its own.
"""
from app.services.compass_telegram import _level_lines, _range_edge


def _labels(lines):
    return [line.split(":")[0] for line in lines]


def test_range_below_spot_shows_the_ceiling():
    lines = _level_lines(None, "neutral", 52, ref=77041, touch=76413, inval=75300,
                         bias="NEUTRAL_RANGE", support=76000, lid=78450)
    assert _labels(lines) == ["BTC", "Target", "Ceiling", "Stop"]
    assert "Ceiling: $78,450 (+1.8%)" in lines


def test_range_above_spot_shows_the_floor():
    lines = _level_lines(None, "neutral", 52, ref=77041, touch=78200, inval=75300,
                         bias="NEUTRAL_RANGE", support=76413, lid=79000)
    assert _labels(lines) == ["BTC", "Target", "Floor", "Stop"]
    assert "Floor: $76,413 (-0.8%)" in lines


def test_directional_bias_gets_no_extra_edge():
    for bias in ("BULLISH", "BEARISH", None):
        assert _range_edge(77041, 79565, bias=bias, support=76000, lid=80000) is None


def test_edge_on_the_wrong_side_is_dropped():
    # Target below spot asks for the ceiling, but this lid is below spot too.
    assert _range_edge(77041, 76413, bias="NEUTRAL_RANGE", lid=76000) is None


def test_missing_edge_is_tolerated():
    lines = _level_lines(None, "neutral", 52, ref=77041, touch=76413, inval=75300, bias="NEUTRAL_RANGE")
    assert _labels(lines) == ["BTC", "Target", "Stop"]


def test_percent_is_from_the_current_price():
    lines = _level_lines(None, "neutral", 52, ref=80000, touch=80800, inval=79200)
    assert "Target: $80,800 (+1.0%)" in lines and "Stop: $79,200 (-1.0%)" in lines


def test_nothing_to_say_returns_no_levels():
    assert _level_lines(None, "neutral", 52, ref=77041, touch=None, inval=None, bias="NEUTRAL_RANGE") == []
