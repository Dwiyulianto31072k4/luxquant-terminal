"""The two faults behind Custom-screen alerts that arrived late or never.

1. The evaluator never committed, so the notification worker's session close
   rolled every match back until an hourly job happened to commit.
2. Delivery went through a bot nobody had started; the Terminal bot, which
   people do start, is now tried first and the Alert bot only as a fallback.
"""
import importlib
import sys
import types

import pytest


class _Result:
    def __init__(self, rows=()):
        self._rows = list(rows)

    def fetchall(self):
        return self._rows


class FakeDB:
    def __init__(self, filters, matches):
        self.filters, self.matches = filters, matches
        self.sql, self.commits = [], 0

    def execute(self, stmt, params=None):
        q = str(stmt)
        self.sql.append(q)
        if "FROM signal_alert_filters f" in q:
            return _Result(self.filters)
        if "FROM signals s" in q and "signal_alert_matches m" in q:
            return _Result(self.matches)
        return _Result()

    def commit(self):
        self.commits += 1


def test_matches_are_committed(monkeypatch):
    from app.services import signal_filter_alerts as sfa

    fake_screen = types.ModuleType("app.services.signal_screen")
    fake_screen.match_screen = lambda criteria, db: ["sig-1"]
    monkeypatch.setitem(sys.modules, "app.services.signal_screen", fake_screen)

    db = FakeDB(
        filters=[(6, 30, "BTC only", {"rules_v2": [{"field": "pair", "op": "in", "value": ["BTCUSDT"]}]}, None)],
        matches=[("sig-1", "BTCUSDT", 83640.5, "Normal", None, None, 84000, 84500, 85000, 86000, 82000)],
    )
    assert sfa.generate_filter_match_notifications(db) == 1
    assert db.commits == 1, "an uncommitted match is rolled back when the worker closes the session"
    assert any("INSERT INTO notifications" in q for q in db.sql)


def test_one_line_body_fits_the_bell():
    from app.services.signal_filter_alerts import _one_line_body

    body = _one_line_body(100.0, [101.0, 102.0, 103.0, 110.0], 97.0, "Normal", None, None, True)
    assert "\n" not in body
    assert body == "Entry 100 · TP4 110 (+10.0%) · SL 97 · Risk Normal"


@pytest.fixture
def worker(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:1/db")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "terminal")
    monkeypatch.setenv("ALERT_BOT_TOKEN", "alert")
    sys.modules.pop("app.workers.telegram_delivery_worker", None)
    return importlib.import_module("app.workers.telegram_delivery_worker")


def test_terminal_bot_first_then_alert_bot(worker, monkeypatch):
    assert worker.BOTS == ["terminal", "alert"]
    calls = []

    def fake_send(token, chat_id, text_msg, buttons=None, photo=None):
        calls.append(token)
        if token == "terminal":
            return False, '400 {"description":"Bad Request: chat not found"}'
        return True, ""

    monkeypatch.setattr(worker, "_send_once", fake_send)
    assert worker.send_telegram("1", "hi") == (True, "", 1)
    assert calls == ["terminal", "alert"]


def test_real_errors_do_not_fall_through_to_the_other_bot(worker, monkeypatch):
    calls = []

    def fake_send(token, chat_id, text_msg, buttons=None, photo=None):
        calls.append(token)
        return False, "429 Too Many Requests"

    monkeypatch.setattr(worker, "_send_once", fake_send)
    ok, err, _ = worker.send_telegram("1", "hi")
    assert not ok and "429" in err
    assert calls == ["terminal"]


def test_failed_photo_is_retried_as_text(worker, monkeypatch):
    calls = []

    def fake_send(token, chat_id, text_msg, buttons=None, photo=None):
        calls.append(bool(photo))
        return (False, "ReadTimeout") if photo else (True, "")

    monkeypatch.setattr(worker, "_send_once", fake_send)
    assert worker.send_telegram("1", "hi", photo="/x.png")[0]
    assert calls == [True, False]


class _Row:
    def __init__(self, m):
        self._mapping = m


class _Conn:
    """Answers the signals lookup; the track-record queries find nothing."""
    def __init__(self, sig):
        self.sig = sig

    def execute(self, stmt, params=None):
        q = str(stmt)
        sig = self.sig

        class R:
            def first(self_inner):
                return _Row(sig) if "FROM signals WHERE signal_id" in q else None

            def fetchone(self_inner):
                return None

            def fetchall(self_inner):
                return []
        return R()


SIG = {"signal_id": "abc", "pair": "BTCUSDT", "entry": 100.0, "target1": 101.0, "target2": 102.0,
       "target3": 103.0, "target4": 110.0, "stop1": 97.0, "stop2": 95.0, "risk_level": "Normal",
       "market_cap": "1.6T", "volume_rank_num": 1, "volume_rank_den": 500, "risk_reasons": None}


def test_signal_match_uses_the_call_post_body(worker, monkeypatch):
    monkeypatch.setattr(worker, "_chart_for", lambda conn, sid: None)
    data = {"signal_id": "abc", "filter_name": "BTC <only>", "filter_summary": "Pair is any of BTCUSDT"}
    msg, buttons, photo = worker.render_signal_match((1, 30, "signal_match", "t", "b", data, None, 1), _Conn(SIG))
    assert msg.startswith("🎯 <b>BTC matches “BTC &lt;only&gt;”</b>"), "user text must be HTML-escaped"
    for line in ("📊 Vol #1/500 · MCap 1.6T · Risk Normal", "<b>Entry: 100</b>", "🎯 Targets &amp; Stop Loss",
                 "Target 4      110      +10.00%", "Stop Loss 1   97      -3.00%", "Open this call on LuxQuant"):
        assert line in msg, line
    assert buttons[0][0]["url"].endswith("/signals?signal=abc")
    assert photo is None
