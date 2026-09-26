"""A worker whose loop stops turning is reported even while systemd says active."""
import json

from app.core import liveness
from app.workers import liveness_watchdog as wd


class FakeRedis:
    def __init__(self):
        self.store = {}

    def set(self, key, value, ex=None):
        self.store[key] = value

    def get(self, key):
        return self.store.get(key)


def test_beat_is_throttled_and_readable(monkeypatch):
    fake = FakeRedis()
    import app.core.redis as r
    monkeypatch.setattr(r, "get_redis", lambda: fake)
    monkeypatch.setattr(liveness, "_last_write", {})
    t = [1000.0]
    monkeypatch.setattr(liveness.time, "time", lambda: t[0])
    liveness.beat("journey-worker", 5)
    first = json.loads(fake.store["lq:alive:journey-worker"])
    t[0] += 5
    liveness.beat("journey-worker", 5)          # 5 s later: throttled
    assert json.loads(fake.store["lq:alive:journey-worker"])["ts"] == first["ts"]
    t[0] += 30
    liveness.beat("journey-worker", 5)
    assert liveness.last_beat("journey-worker", fake)["ts"] == 1035


def test_a_redis_outage_never_reaches_the_worker(monkeypatch):
    import app.core.redis as r

    def down():
        raise ConnectionError("redis down")

    monkeypatch.setattr(r, "get_redis", down)
    monkeypatch.setattr(liveness, "_last_write", {})
    liveness.beat("tg-delivery", 20)             # must not raise


def test_verdicts():
    assert wd.verdict("active", 3600, 30, 600) is None
    assert wd.verdict("active", 3600, 900, 600) == "running, but its loop has been silent for 15 min"
    assert wd.verdict("active", 3600, None, 600) == "running, but its loop has never reported in"
    assert wd.verdict("active", 120, None, 600) is None      # just restarted: grace
    assert wd.verdict("failed", None, None, 600) == "unit is failed"


def test_one_alert_per_incident_then_a_reminder_then_recovery(monkeypatch):
    monkeypatch.setattr(wd, "REPEAT_HOURS", 6)
    bad = {"journey-worker": "running, but its loop has been silent for 15 min"}
    alert, recovered, state = wd.plan(bad, {}, now=0)
    assert alert == ["journey-worker"] and recovered == []
    alert, _, state = wd.plan(bad, state, now=3600)
    assert alert == []                            # still bad, already told
    alert, _, state = wd.plan(bad, state, now=7 * 3600)
    assert alert == ["journey-worker"]            # reminder after 6 h
    alert, recovered, state = wd.plan({}, state, now=8 * 3600)
    assert alert == [] and recovered == ["journey-worker"] and state == {}
