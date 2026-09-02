"""The levels block on the Compass card.

A NEUTRAL_RANGE read is two-sided, but the block used to print only the level
the AI expects to touch first. When that level sat below spot the card read as
a bearish call under a NEUTRAL verdict — the lid that made it a range stayed in
the database. Measured over 30 days: 130/130 range contracts had a lid above
spot and none of them printed it.
"""
import re

from app.services.compass_telegram import _levels_block

WIDTH_LIMIT = 22  # measured against where the owner's phone actually wrapped


def _rows(block):
    return [re.split(r"\s+", line.strip()) for line in block.split("\n")]


def _labels(block):
    return [r[0] for r in _rows(block)]


def test_range_below_spot_shows_the_lid():
    """The real v6_593764a7ff contract: target below spot under a NEUTRAL read."""
    block = _levels_block(77041, 76413, 75300,
                          bias="NEUTRAL_RANGE", support=76413, lid=78450)
    assert _labels(block) == ["Lid", "Spot", "Target", "Invalid"]
    assert "$78,450" in block


def test_range_above_spot_shows_the_floor():
    block = _levels_block(77041, 78200, 75300,
                          bias="NEUTRAL_RANGE", support=76413, lid=78450)
    assert _labels(block) == ["Target", "Spot", "Floor", "Invalid"]
    assert "$76,413" in block


def test_range_always_brackets_spot():
    """Whichever side the touch falls on, spot must not be an endpoint."""
    for touch in (76413, 78200):
        block = _levels_block(77041, touch, 75300,
                              bias="NEUTRAL_RANGE", support=76413, lid=78450)
        labels = _labels(block)
        assert labels[0] != "Spot" and labels[-1] != "Spot"


def test_directional_bias_gets_no_extra_edge():
    for bias in ("BULLISH_CONTINUATION", "BEARISH_CONTINUATION"):
        block = _levels_block(77041, 79565, 75300,
                              bias=bias, support=76413, lid=78450)
        assert set(_labels(block)) == {"Spot", "Target", "Invalid"}


def test_edge_on_the_wrong_side_is_dropped():
    """A lid below spot is not a lid; say nothing rather than something false."""
    block = _levels_block(77041, 76413, 75300,
                          bias="NEUTRAL_RANGE", support=76413, lid=76900)
    assert "Lid" not in _labels(block)


def test_missing_edge_is_tolerated():
    block = _levels_block(77041, 76413, 75300, bias="NEUTRAL_RANGE")
    assert _labels(block) == ["Spot", "Target", "Invalid"]


def test_rows_descend_by_price():
    block = _levels_block(77041, 76413, 75300,
                          bias="NEUTRAL_RANGE", support=76413, lid=78450)
    prices = [float(r[1].replace("$", "").replace(",", "")) for r in _rows(block)]
    assert prices == sorted(prices, reverse=True)


def test_width_never_wraps():
    block = _levels_block(77041, 76413, 75300,
                          bias="NEUTRAL_RANGE", support=76413, lid=78450)
    assert max(len(line) for line in block.split("\n")) <= WIDTH_LIMIT


def test_nothing_to_say_returns_none():
    assert _levels_block(77041, None, None, bias="NEUTRAL_RANGE") is None
