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


def test_the_update_breaks_at_its_own_seams():
    """One packed line wrapped mid-phrase on a phone; the facts now break first."""
    m = cf.update_message("SONICUSDT", "tp3", 0.0295, 0.0271, "2026-09-22T06:00:00+00:00",
                          "2026-09-22T11:44:00+00:00", "abc-1")
    head, move, blank, go = m.splitlines()
    assert head == "✅ <b>SONICUSDT</b> · TP3 HIT"
    assert move == "0.0295 (+8.86%) · 5h 44m after the call"
    assert blank == ""
    assert "Open on LuxQuant" in go
    sl = cf.update_message("X", "closed_loss", 90, 100, None, None, "id")
    assert sl.startswith("🛑 <b>X</b> · STOP LOSS HIT\n90 (-10.00%)")
    tp4 = cf.update_message("X", "closed_win", 110, 100, None, None, "id")
    assert tp4.startswith("🏁 <b>X</b> · TP4 HIT")


def test_the_pair_leads_and_the_longest_one_still_fits():
    """The reader scans for their coin; the emoji has already given the outcome.

    TP4 carried a third segment ("plan complete") that pushed the pair past the
    width of a phone line — the flag and the last target both already say it.
    """
    first = cf.update_message("BROCCOLI714USDT", "closed_win", 1.09, 0.9421,
                              None, None, "id").splitlines()[0]
    assert first == "🏁 <b>BROCCOLI714USDT</b> · TP4 HIT"
    assert cf.visible_len(first) <= 36        # one line on a narrow phone
    assert "plan complete" not in first


def test_the_call_gets_its_own_tappable_line():
    """A reply across forum topics is never drawn, so this link is the way back."""
    m = cf.update_message("ANIMEUSDT", "tp3", 0.00345, 0.00327, None, None, "id",
                          call_url="https://t.me/c/2670915863/857500")
    assert '📍 <a href="https://t.me/c/2670915863/857500">Original call</a>' in m.splitlines()[-1]
    assert "ANIMEUSDT</a>" not in m          # the pair is no longer the link
    assert "Original call" not in cf.update_message("A", "tp1", 2, 1, None, None, "id")
