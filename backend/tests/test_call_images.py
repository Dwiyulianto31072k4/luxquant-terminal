"""The picture a VIP update carries, and when a post waits for it."""
import os

from app.services import call_images


def _touch(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG")
    return path


def _dirs(tmp_path, monkeypatch):
    cards, shots = tmp_path / "cards", tmp_path / "shots"
    monkeypatch.setattr(call_images, "CARD_DIR", str(cards))
    monkeypatch.setattr(call_images, "CHART_DIR", str(shots))
    return cards, shots


def test_a_ready_composite_is_used_as_is(tmp_path, monkeypatch):
    _, shots = _dirs(tmp_path, monkeypatch)
    want = _touch(str(shots / "sig1" / "BTCUSDT_tp2_20260924_120000_with_card.png"))
    _touch(str(shots / "sig1" / "BTCUSDT_tp2_20260924_120000.png"))
    assert call_images.event_image("sig1", "BTCUSDT", "tp2") == (want, "composite")


def test_the_entry_stack_and_marketing_crops_are_never_picked(tmp_path, monkeypatch):
    """A VIP already has the call; `_combined` repeats it, `_cta` is for X."""
    _, shots = _dirs(tmp_path, monkeypatch)
    for suffix in ("_combined", "_combined_cta", "_combined_xframe"):
        _touch(str(shots / "s" / f"BTCUSDT_tp3_20260924_120000{suffix}.png"))
    plain = _touch(str(shots / "s" / "BTCUSDT_tp3_20260924_120000.png"))
    assert call_images.event_image("s", "BTCUSDT", "tp3") == (plain, "chart")


def test_half_a_picture_is_named_as_half(tmp_path, monkeypatch):
    """The two halves land seconds apart in either order; neither is a receipt."""
    cards, shots = _dirs(tmp_path, monkeypatch)
    monkeypatch.setattr(call_images, "draw_card_onto_chart", lambda *a: None)

    _touch(str(cards / "s" / "BTCUSDT_tp1_20260924_120000.png"))
    assert call_images.event_image("s", "BTCUSDT", "tp1")[1] == "card"

    _touch(str(shots / "s" / "BTCUSDT_tp1_20260924_120013.png"))
    assert call_images.event_image("s", "BTCUSDT", "tp1")[1] == "chart"


def test_both_halves_are_composited(tmp_path, monkeypatch):
    cards, shots = _dirs(tmp_path, monkeypatch)
    card = _touch(str(cards / "s" / "BTCUSDT_sl_20260924_120000.png"))
    chart = _touch(str(shots / "s" / "BTCUSDT_sl_20260924_120013.png"))
    seen = {}

    def fake(c, k):
        seen.update(chart=c, card=k)
        return _touch(str(shots / "s" / "BTCUSDT_sl_20260924_120013_with_card.png"))

    monkeypatch.setattr(call_images, "draw_card_onto_chart", fake)
    path, kind = call_images.event_image("s", "BTCUSDT", "closed_loss")
    assert kind == "composite" and path.endswith("_with_card.png")
    assert seen == {"chart": chart, "card": card}


def test_a_stop_loss_reads_the_sl_files(tmp_path, monkeypatch):
    cards, _ = _dirs(tmp_path, monkeypatch)
    want = _touch(str(cards / "s" / "BTCUSDT_sl_20260924_120000.png"))
    assert call_images.event_image("s", "BTCUSDT", "closed_loss") == (want, "card")


def test_waiting_stops_once_the_picture_is_whole():
    assert call_images.should_wait("composite", 0.0) is False
    assert call_images.should_wait("chart", 1.0) is True
    assert call_images.should_wait("card", 1.0) is True


def test_nothing_waits_for_a_picture_that_will_never_be_rendered():
    """The chart worker renders a signal's newest milestone only."""
    assert call_images.should_wait(None, 1.0, still_expected=False) is False
    assert call_images.should_wait(None, 1.0, still_expected=True) is True


def test_the_wait_has_a_ceiling():
    assert call_images.should_wait("chart", call_images.WAIT_MINUTES + 0.1) is False
