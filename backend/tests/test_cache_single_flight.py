import app.core.redis as r


class FakeRedis:
    def __init__(self):
        self.d = {}

    def get(self, k):
        return self.d.get(k)

    def setex(self, k, ttl, v):
        self.d[k] = v

    def set(self, k, v, nx=False, ex=None):
        if nx and k in self.d:
            return None
        self.d[k] = v
        return True

    def delete(self, k):
        self.d.pop(k, None)


def fake(monkeypatch):
    f = FakeRedis()
    monkeypatch.setattr(r, "get_redis", lambda: f)
    return f


def test_a_miss_computes_once_and_caches(monkeypatch):
    fake(monkeypatch)
    calls = []
    assert r.cache_single_flight("k", 30, lambda: calls.append(1) or {"ok": True}) == {"ok": True}
    assert r.cache_single_flight("k", 30, lambda: calls.append(1) or {"ok": True}) == {"ok": True}
    assert len(calls) == 1


def test_while_someone_computes_the_rest_get_the_stale_copy(monkeypatch):
    f = fake(monkeypatch)
    f.d["k:stale"] = '{"v": "old"}'
    f.d["k:lock"] = "1"  # another worker is mid-computation
    out = r.cache_single_flight("k", 30, lambda: (_ for _ in ()).throw(AssertionError("must not compute")))
    assert out == {"v": "old"}


def test_a_refused_result_is_not_cached_and_the_lock_is_released(monkeypatch):
    f = fake(monkeypatch)
    assert r.cache_single_flight("k", 30, lambda: {"ok": False}, keep=lambda v: v["ok"]) == {"ok": False}
    assert "k" not in f.d and "k:lock" not in f.d


def test_waits_for_the_other_callers_answer_when_there_is_no_stale(monkeypatch):
    f = fake(monkeypatch)
    f.d["k:lock"] = "1"
    real_sleep = __import__("time").sleep
    monkeypatch.setattr(__import__("time"), "sleep", lambda s: f.d.__setitem__("k", '{"v": "new"}'))
    try:
        out = r.cache_single_flight("k", 30, lambda: {"v": "mine"}, wait_s=1.0)
    finally:
        monkeypatch.setattr(__import__("time"), "sleep", real_sleep)
    assert out == {"v": "new"}
