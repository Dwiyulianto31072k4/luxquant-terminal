"""Bot monitor verdicts: what makes a bot DOWN, WARN, or only a note."""
from app.services import bot_monitor as bm

BOT = {"key": "assistant", "env": "TG_BOT_TOKEN", "file": "/etc/x.env", "role": "r",
       "services": [], "webhook": False}
TERMINAL = {**BOT, "key": "terminal", "webhook": True}
UP = {"unit": "u.service", "name": "u", "health": "ok"}
PROFILE = {"me": {"id": 1, "username": "b", "first_name": "B"},
           "desc": {"description": "d"}, "short": {"short_description": "s"}, "cmds": [],
           "menu": {"type": "commands"}, "photos": {"total_count": 1},
           "wh": {"url": "", "pending_update_count": 0}}


def test_revoked_token_is_down():
    row = bm._judge(BOT, {"me": {"_error": "Unauthorized", "_code": 401}}, [UP], {}, {})
    assert row["status"] == "down" and "revoked" in row["checks"][0]["text"]


def test_missing_token_is_down():
    row = bm._judge(BOT, {"_no_token": True}, [UP], {}, {})
    assert row["status"] == "down"


def test_stopped_service_is_down():
    dead = {"unit": "x.service", "name": "x", "health": "down", "active_state": "failed", "sub_state": "failed"}
    assert bm._judge(BOT, PROFILE, [dead], {}, {})["status"] == "down"


def test_unread_dms_are_a_note_not_a_warning():
    probe = {**PROFILE, "wh": {"url": "", "pending_update_count": 587}}
    row = bm._judge(BOT, probe, [UP], {}, {})
    assert row["status"] == "ok"
    assert any(c["level"] == "info" and "587" in c["text"] for c in row["checks"])


def test_incomplete_profile_warns():
    probe = {**PROFILE, "photos": {"total_count": 0}, "desc": {"description": ""}}
    row = bm._judge(BOT, probe, [UP], {}, {})
    assert row["status"] == "warn" and "photo" in row["checks"][0]["text"]


def test_webhook_verdict_depends_on_the_queue():
    import time
    def wh(age, pending):
        return {**PROFILE, "wh": {"url": "https://luxquant.tw/x", "last_error_date": time.time() - age,
                                 "last_error_message": "504", "pending_update_count": pending}}
    assert bm._judge(TERMINAL, wh(60, 5), [UP], {}, {})["status"] == "down"      # stuck
    assert bm._judge(TERMINAL, wh(60, 0), [UP], {}, {})["status"] == "warn"      # blipped, recovered
    assert bm._judge(TERMINAL, wh(3 * 86400, 0), [UP], {}, {})["status"] == "ok" # history


def test_calls_piling_up_unposted_is_down():
    row = bm._judge(BOT, PROFILE, [UP], {"calls_waiting_6h": 4}, {})
    assert row["status"] == "down"


def test_tokens_are_read_per_file(tmp_path):
    a, b = tmp_path / "a.env", tmp_path / "b.env"
    a.write_text("TG_BOT_TOKEN=aaa\n")
    b.write_text('export TG_BOT_TOKEN="bbb"\n')
    assert bm._token("TG_BOT_TOKEN", str(a)) == "aaa"
    assert bm._token("TG_BOT_TOKEN", str(b)) == "bbb"


def test_a_crashing_delivery_worker_is_down_and_one_stuck_alert_warns():
    t = {**BOT, "key": "terminal", "webhook": False}
    crash = {"available": True, "failed_24h": 0, "crashes": 406, "last_crash_age_s": 20,
             "last_crash": "No module named 'app'", "fail_reasons": {}, "failing_users": 0}
    assert bm._judge(t, PROFILE, [UP], {}, crash)["status"] == "down"
    assert bm._judge(t, PROFILE, [UP], {"alerts_unsent_6h": 1}, {})["status"] == "warn"
    assert bm._judge(t, PROFILE, [UP], {"alerts_unsent_6h": 5}, {})["status"] == "down"
