"""Generators must not create what the cleanup deletes.

They stamp created_at with the source's own date and dedupe by existence, so a
source older than the retention window used to be deleted and re-inserted every
hour (~3,000 rows, read state lost each time).
"""
from app.services import notification_worker as nw


class _Rows:
    def fetchall(self):
        return []


class SpyDB:
    def __init__(self):
        self.calls = []

    def execute(self, stmt, params=None):
        self.calls.append((str(stmt), params or {}))
        return _Rows()

    def commit(self):
        pass


def test_source_dated_generators_respect_retention():
    for gen in (nw.generate_channel_message_notifications,
                nw.generate_btcdom_notifications,
                nw.generate_watchlist_notifications):
        db = SpyDB()
        gen(db)
        sql, params = db.calls[0]
        assert "make_interval(days => :ret)" in sql, gen.__name__
        assert params.get("ret") == nw.RETENTION_DAYS, gen.__name__


def test_cleanup_uses_the_same_window():
    assert nw.cleanup_old_notifications.__defaults__ == (nw.RETENTION_DAYS,)
