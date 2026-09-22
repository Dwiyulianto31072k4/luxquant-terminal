"""Every call-related post shares one body and one update line."""
from app.services import call_format as cf

SIG = {"signal_id": "s1", "pair": "AINUSDT", "entry": 0.0224, "target1": 0.0228, "target2": 0.0232,
       "target3": 0.0245, "target4": 0.0267, "stop1": 0.0214, "stop2": 0.0189, "risk_level": "High",
       "market_cap": "3.8M", "volume_rank_num": 206, "volume_rank_den": 521,
       "risk_reasons": "Volume rank is outside the top 200|Market cap is below 50M"}


def test_body_matches_the_call_post_lines():
    body = cf.call_body(SIG, db=None)
    for line in ("📊 Vol #206/521 · MCap 3.8M · Risk High",
                 "⚠️ Volume rank is outside the top 200 · Market cap is below 50M",
                 "<b>Entry: 0.0224</b>",
                 "Target 1      0.0228      +1.79%",
                 "Target 4      0.0267      +19.20%",
                 "Stop Loss 2   0.0189      -15.62%",
                 "📈 Sentiment $AIN", "📊 Coinglass $AIN", "Open this call on LuxQuant"):
        assert line in body, line


def test_caption_drops_head_lines_never_body():
    body = cf.call_body(SIG, db=None)
    head = [("TITLE", 0), ("x" * 600, 5), ("KEEP", 0)]
    cap = cf.fit_caption(head, body)
    assert "TITLE" in cap and "KEEP" in cap and "x" * 600 not in cap
    assert cap.endswith(body)
    assert cf.visible_len(cap) <= cf.CAPTION_LIMIT


def test_update_line_is_the_runner_format():
    m = cf.update_message("SONICUSDT", "tp3", 0.0295, 0.0271, "2026-09-22T06:00:00+00:00",
                          "2026-09-22T11:44:00+00:00", "abc-1")
    assert m.splitlines()[0] == "✅ <b>TP3 HIT</b> · SONICUSDT 0.0295 (+8.86%) · 5h 44m after the call"
    assert "Open on LuxQuant" in m
    sl = cf.update_message("X", "closed_loss", 90, 100, None, None, "id")
    assert sl.startswith("🛑 <b>STOP LOSS HIT</b> · X 90 (-10.00%)")
    tp4 = cf.update_message("X", "closed_win", 110, 100, None, None, "id")
    assert tp4.startswith("🏁 <b>TP4 HIT · plan complete</b>")
