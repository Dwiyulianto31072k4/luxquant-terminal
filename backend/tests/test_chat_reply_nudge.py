"""The unread-reply nudge must drop already-notified replies in SQL, before LIMIT.

From 5 Aug to 25 Sep 2026 it took the 50 OLDEST unread admin replies and
dropped the already-notified ones in Python. Welcome messages nobody opened
filled those 50 slots for good, so no newer reply was ever nudged.
"""
from app.services import chat_service


class _Result:
    def mappings(self):
        return self

    def all(self):
        return []


class _RecordingDb:
    def __init__(self):
        self.sql = ""
        self.params = {}

    def execute(self, clause, params):
        self.sql = " ".join(str(clause).split())
        self.params = params
        return _Result()


def _run():
    db = _RecordingDb()
    chat_service.replies_unseen_by_user(db, 2, notified_type="chat_reply")
    return db


def test_already_notified_replies_are_dropped_before_the_limit():
    db = _run()
    assert "NOT EXISTS" in db.sql
    assert db.sql.index("NOT EXISTS") < db.sql.index("LIMIT")
    assert db.params["notified_type"] == "chat_reply"


def test_a_reply_older_than_the_window_is_never_nudged():
    db = _run()
    assert "make_interval(hours => :within_hours)" in db.sql
    assert db.params["within_hours"] == chat_service.REPLY_NUDGE_WITHIN_HOURS
