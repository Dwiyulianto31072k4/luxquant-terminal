"""What a new call is allowed to throw away.

`cache_set` writes a second copy at `<key>:stale` and every heavy read falls
back to it, so nobody waits on a cold recompute. The invalidator used to delete
`lq:signals:*` outright — backups included — which on 24 Sep 2026 left
/coin-intel with no fresh copy, no fallback, and one worker holding the compute
lock: 34 × HTTP 503 in bursts, roughly a minute after each of 74 invalidations.

The list still loses everything, because a new call has to be visible at once.
"""
import app.core.redis as r


class FakeRedis:
    def __init__(self, keys):
        self.store = list(keys)
        self.deleted = []

    def keys(self, _pattern):
        return list(self.store)

    def delete(self, *keys):
        self.deleted.extend(keys)
        for k in keys:
            self.store.remove(k)
        return len(keys)


LIVE = [
    "lq:signals:page:1:20:open", "lq:signals:page:1:20:open:stale",
    "lq:signals:bulk-7d:sub", "lq:signals:bulk-7d:sub:stale",
    "lq:signals:active:20", "lq:signals:active:20:stale",
    "lq:signals:stats", "lq:signals:stats:stale",
    "lq:signals:coin-intel", "lq:signals:coin-intel:stale",
    "lq:signals:coin-intel:desk", "lq:signals:coin-intel:desk:stale",
    "lq:signals:analyze:all:weekly", "lq:signals:analyze:all:weekly:stale",
    "lq:signals:top-performers:v11:1:2026-09-24",
    "lq:signals:top-performers:v11:1:2026-09-24:stale",
]


def _invalidate(monkeypatch, keys=LIVE):
    fake = FakeRedis(keys)
    monkeypatch.setattr(r, "get_redis", lambda: fake)
    return fake, r.invalidate_signals_cache()


def test_the_aggregates_keep_something_to_serve(monkeypatch):
    fake, _ = _invalidate(monkeypatch)
    for key in ("lq:signals:coin-intel:stale", "lq:signals:coin-intel:desk:stale",
                "lq:signals:analyze:all:weekly:stale",
                "lq:signals:top-performers:v11:1:2026-09-24:stale"):
        assert key in fake.store, f"{key} is the fallback that stops a 503"


def test_their_fresh_copy_still_goes(monkeypatch):
    """Kept backups must not mean kept data: the recompute is still forced."""
    fake, _ = _invalidate(monkeypatch)
    for key in ("lq:signals:coin-intel", "lq:signals:coin-intel:desk",
                "lq:signals:analyze:all:weekly"):
        assert key not in fake.store


def test_the_list_loses_everything(monkeypatch):
    """A new call has to be visible at once, so nothing may answer from before it."""
    fake, _ = _invalidate(monkeypatch)
    for key in fake.store:
        assert not key.startswith(("lq:signals:page:", "lq:signals:bulk-7d",
                                   "lq:signals:active", "lq:signals:stats"))


def test_it_reports_what_it_deleted(monkeypatch):
    fake, deleted = _invalidate(monkeypatch)
    assert deleted == len(LIVE) - len(fake.store) == len(fake.deleted)


def test_byte_keys_are_handled(monkeypatch):
    """A client without decode_responses hands back bytes."""
    fake, _ = _invalidate(monkeypatch, [b"lq:signals:coin-intel",
                                        b"lq:signals:coin-intel:stale",
                                        b"lq:signals:page:1:stale"])
    assert fake.store == [b"lq:signals:coin-intel:stale"]


def test_a_dead_redis_is_not_an_error(monkeypatch):
    def boom():
        raise ConnectionError("redis is down")

    monkeypatch.setattr(r, "get_redis", boom)
    assert r.invalidate_signals_cache() == 0
