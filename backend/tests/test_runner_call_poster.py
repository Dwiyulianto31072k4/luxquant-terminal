from datetime import datetime, timezone

from app.workers.runner_call_poster import build_message

SIG = {
    "signal_id": "abc", "pair": "UNIUSDT", "entry": 9.37, "target1": 9.617, "target2": 9.865,
    "target3": 10.61, "target4": 11.84, "stop1": 8.863, "stop2": 7.39,
    "created_at": datetime.now(timezone.utc).isoformat(), "risk_level": "Normal",
    "market_cap": "3.97B", "call_msg_id": 1,
}
STATS = {"VOL_CLIMAX": {"full_tp_rate": 58.0}, "RSI_OVERBOUGHT_H1": {"full_tp_rate": 55.0}}


def test_post_states_the_live_edge_cut():
    msg = build_message(SIG, ["RSI_OVERBOUGHT_H1"], STATS)
    assert "Edge score: top 30% of the last 7 days" in msg
    assert "TOP RUNNER" not in msg


def test_top_runner_is_labelled_and_explained():
    msg = build_message(SIG, ["VOL_CLIMAX", "RSI_OVERBOUGHT_H1"], STATS, top=True)
    assert "RUNNERS CALL</b> · ⭐ <b>TOP RUNNER</b>" in msg
    assert "Top Runner: carries the #1 runner tag" in msg
    assert len(msg) < 1024  # Telegram photo caption limit


from app.workers.runner_call_poster import decide


def _sig(tags, status="open"):
    return {"signal_id": "s1", "tags": tags, "status": status}


def test_a_runner_with_the_first_tag_is_a_top_runner():
    matched, reason, top, hit = decide(_sig(["RSI_OVERBOUGHT_H1", "VOL_CLIMAX", "X"]), {"s1"}, STATS)
    assert matched and top
    assert hit == ["VOL_CLIMAX", "RSI_OVERBOUGHT_H1"]  # rank order, not the call's
    assert reason.startswith("top runner") and "VOL_CLIMAX" in reason


def test_the_second_tag_alone_is_a_runner_not_a_top_runner():
    matched, reason, top, _ = decide(_sig(["RSI_OVERBOUGHT_H1"]), {"s1"}, STATS)
    assert matched and not top and reason is None


def test_a_call_closed_before_the_decision_is_neither():
    matched, reason, top, _ = decide(_sig(["VOL_CLIMAX"], status="closed_win"), {"s1"}, STATS)
    assert not matched and not top and reason.startswith("already closed_win")


def test_not_selected_by_the_rule_is_neither():
    matched, reason, top, _ = decide(_sig(["VOL_CLIMAX"]), set(), STATS)
    assert not matched and not top and reason is None
