"""The seat comes back when the Telegram account stops being the paying one.

The hole this closes: somebody swaps Telegram accounts — unlink the old, link
the new — and the OLD account keeps sitting in the VIP group receiving every
call. Nothing could ever clean it up, because every query the subscription
worker runs starts at `users`, and after the unlink no row holds that id.

These tests pin the three ways it must NOT fire (someone still entitled, the
account is already out, Telegram did not answer) as hard as the one way it must.

`asyncio.run` rather than pytest-asyncio: that is how the rest of this suite
drives coroutines, and it keeps the tests free of a plugin config.
"""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services import vip_seat  # noqa: E402


class FakeResult:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class FakeDB:
    """Answers the two questions a release asks: does an entitled account hold
    this Telegram, and is it a grandfathered legacy member."""

    def __init__(self, owner_id=None, raises=False, legacy=False):
        self.owner_id = owner_id
        self.raises = raises
        self.legacy = legacy
        self.queries = []

    def execute(self, stmt, params=None):
        sql = str(stmt)
        self.queries.append((sql, params))
        if self.raises:
            raise RuntimeError("database is down")
        if "legacy_members" in sql:
            return FakeResult((1,) if self.legacy else None)
        return FakeResult((self.owner_id,) if self.owner_id else None)


class FakeTelegram:
    def __init__(self, present=True, kick_ok=True):
        self.present = present
        self.kick_ok = kick_ok
        self.kicked = []
        self.dms = []

    async def is_in_group(self, tg):
        return self.present

    async def kick_member(self, tg):
        self.kicked.append(tg)
        return self.kick_ok

    async def send_dm(self, tg, text):
        self.dms.append((tg, text))
        return True


class FakeRedis:
    """Just the four hash calls the queue uses."""

    def __init__(self, down=False):
        self.h = {}
        self.down = down

    def _guard(self):
        if self.down:
            raise RuntimeError("redis is down")

    def hget(self, key, field):
        self._guard()
        return self.h.get(field)

    def hset(self, key, field, value):
        self._guard()
        self.h[field] = value

    def hdel(self, key, field):
        self._guard()
        self.h.pop(str(field), None)

    def hgetall(self, key):
        self._guard()
        return dict(self.h)


def _patch_redis(monkeypatch, redis):
    monkeypatch.setattr(vip_seat, "get_redis", lambda: redis)
    return redis


def _patch(monkeypatch, fake):
    import app.services.telegram_group as tg_mod

    monkeypatch.setattr(tg_mod, "is_in_group", fake.is_in_group)
    monkeypatch.setattr(tg_mod, "kick_member", fake.kick_member)
    monkeypatch.setattr(tg_mod, "send_dm", fake.send_dm)


def _run(db, tg=555, **kw):
    return asyncio.run(vip_seat.release_seat(db, tg, reason="test", **kw))


class TestItTakesTheSeatBack:
    def test_orphaned_account_in_the_group_is_removed_and_told_why(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)
        db = FakeDB(owner_id=None)

        assert _run(db) == vip_seat.KICKED
        assert fake.kicked == [555]
        assert fake.dms and "VIP group" in fake.dms[0][1]

    def test_the_courtesy_note_can_be_switched_off(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)

        assert _run(FakeDB(), notify=False) == vip_seat.KICKED
        assert fake.kicked == [555]
        assert fake.dms == []

    def test_a_refused_kick_is_reported_not_swallowed(self, monkeypatch):
        fake = FakeTelegram(present=True, kick_ok=False)
        _patch(monkeypatch, fake)

        assert _run(FakeDB()) == vip_seat.FAILED


class TestItLeavesPeopleAlone:
    def test_another_account_with_access_still_owns_it(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)
        db = FakeDB(owner_id=42)

        assert _run(db) == vip_seat.STILL_ENTITLED
        assert fake.kicked == []

    def test_a_grandfathered_legacy_member_keeps_its_seat(self, monkeypatch):
        """The feature must not eat the old group: a pre-webapp member is
        entitled on its own terms, with or without a LuxQuant row."""
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)

        assert _run(FakeDB(legacy=True)) == vip_seat.STILL_ENTITLED
        assert fake.kicked == []

    def test_a_revoked_legacy_member_is_not_protected(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)
        db = FakeDB(legacy=False)  # revoked rows are filtered by the query

        assert _run(db) == vip_seat.KICKED
        assert "revoked IS NOT TRUE" in db.queries[1][0]

    def test_already_out_of_the_group(self, monkeypatch):
        fake = FakeTelegram(present=False)
        _patch(monkeypatch, fake)

        assert _run(FakeDB()) == vip_seat.NOT_IN_GROUP
        assert fake.kicked == []

    def test_telegram_did_not_answer_so_we_do_not_guess(self, monkeypatch):
        """The dangerous case: None means "unknown", not "not a member"."""
        fake = FakeTelegram(present=None)
        _patch(monkeypatch, fake)

        assert _run(FakeDB()) == vip_seat.UNKNOWN
        assert fake.kicked == []

    def test_a_broken_database_never_becomes_a_kick(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)

        assert _run(FakeDB(raises=True)) == vip_seat.UNKNOWN
        assert fake.kicked == []

    def test_nothing_to_release(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)
        db = FakeDB()

        assert _run(db, tg=None) == vip_seat.SKIPPED
        assert _run(db, tg=0) == vip_seat.SKIPPED
        assert _run(db, tg="not-a-number") == vip_seat.SKIPPED
        assert db.queries == []  # not even a query for an id that is not there


class TestTheEntitlementQuery:
    def test_asks_for_this_telegram_and_binds_now(self, monkeypatch):
        fake = FakeTelegram(present=False)
        _patch(monkeypatch, fake)
        db = FakeDB()
        _run(db, tg=777)

        sql, params = db.queries[0]
        assert "telegram_id = :tg" in sql
        assert "role IN ('premium', 'subscriber')" in sql
        assert params["tg"] == 777
        assert params["now"] is not None

    def test_the_worker_and_the_seat_share_one_definition_of_access(self):
        from app.services import subscription_worker

        assert subscription_worker._ACTIVE_ACCESS is vip_seat.ACTIVE_ACCESS_SQL


class TestTheTrail:
    class _U:
        admin_notes = None

    def test_a_kick_is_written_on_the_account_that_gave_the_id_up(self):
        u = self._U()
        vip_seat.note_on_user(u, 555, vip_seat.KICKED, "unlink")
        assert "555" in u.admin_notes and "VIP group" in u.admin_notes

    def test_quiet_outcomes_leave_no_note(self):
        u = self._U()
        for outcome in (vip_seat.STILL_ENTITLED, vip_seat.NOT_IN_GROUP, vip_seat.UNKNOWN):
            vip_seat.note_on_user(u, 555, outcome, "unlink")
        assert u.admin_notes is None

    def test_it_appends_rather_than_replaces(self):
        u = self._U()
        u.admin_notes = "[earlier] something support wrote"
        vip_seat.note_on_user(u, 555, vip_seat.KICKED, "unlink")
        assert "something support wrote" in u.admin_notes
        assert u.admin_notes.count("\n") == 1


class TestTheRetryQueue:
    """A request cannot wait out a Telegram outage, so the attempt is kept."""

    def test_an_unanswered_check_is_queued_for_the_worker(self, monkeypatch):
        _patch(monkeypatch, FakeTelegram(present=None))
        redis = _patch_redis(monkeypatch, FakeRedis())

        assert _run(FakeDB()) == vip_seat.UNKNOWN
        assert "555" in redis.h

    def test_a_refused_kick_is_queued_too(self, monkeypatch):
        _patch(monkeypatch, FakeTelegram(present=True, kick_ok=False))
        redis = _patch_redis(monkeypatch, FakeRedis())

        assert _run(FakeDB()) == vip_seat.FAILED
        assert "555" in redis.h

    def test_queueing_can_be_switched_off_for_a_one_shot_call(self, monkeypatch):
        _patch(monkeypatch, FakeTelegram(present=None))
        redis = _patch_redis(monkeypatch, FakeRedis())

        assert _run(FakeDB(), queue=False) == vip_seat.UNKNOWN
        assert redis.h == {}

    def test_every_settled_outcome_clears_the_queue(self, monkeypatch):
        for fake, db in (
            (FakeTelegram(present=True), FakeDB()),          # kicked
            (FakeTelegram(present=False), FakeDB()),         # already out
            (FakeTelegram(present=True), FakeDB(owner_id=7)),  # someone owns it
        ):
            _patch(monkeypatch, fake)
            redis = _patch_redis(monkeypatch, FakeRedis())
            redis.h["555"] = json.dumps({"reason": "earlier", "tries": 3})
            _run(db)
            assert redis.h == {}, "a settled seat must not stay queued"

    def test_the_worker_works_the_queue_and_empties_it(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)
        redis = _patch_redis(monkeypatch, FakeRedis())
        redis.h["555"] = json.dumps({"reason": "unlink", "tries": 1})

        out = asyncio.run(vip_seat.retry_pending(FakeDB()))
        assert out["tried"] == 1 and out["kicked"] == 1
        assert fake.kicked == [555]
        assert redis.h == {}

    def test_it_stops_asking_after_max_tries_and_says_so(self, monkeypatch, caplog):
        fake = FakeTelegram(present=None)
        _patch(monkeypatch, fake)
        redis = _patch_redis(monkeypatch, FakeRedis())
        redis.h["555"] = json.dumps({"reason": "unlink", "tries": vip_seat.MAX_TRIES})

        out = asyncio.run(vip_seat.retry_pending(FakeDB()))
        assert out["dropped"] == 1 and out["tried"] == 0
        assert redis.h == {}
        assert fake.kicked == []

    def test_an_empty_or_broken_queue_is_a_no_op(self, monkeypatch):
        _patch(monkeypatch, FakeTelegram(present=True))
        _patch_redis(monkeypatch, FakeRedis())
        assert asyncio.run(vip_seat.retry_pending(FakeDB())) == {}

        _patch_redis(monkeypatch, FakeRedis(down=True))
        assert asyncio.run(vip_seat.retry_pending(FakeDB())) == {}

    def test_redis_being_down_never_breaks_a_release(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)
        _patch_redis(monkeypatch, FakeRedis(down=True))

        assert _run(FakeDB()) == vip_seat.KICKED
        assert fake.kicked == [555]


class TestTheClockOnTheRequestPath:
    """An unlink cannot wait out four Telegram calls; the queue catches it."""

    def test_a_slow_telegram_is_queued_not_waited_on(self, monkeypatch):
        class Slow(FakeTelegram):
            async def is_in_group(self, tg):
                await asyncio.sleep(5)
                return True

        fake = Slow()
        _patch(monkeypatch, fake)
        redis = _patch_redis(monkeypatch, FakeRedis())

        out = asyncio.run(
            vip_seat.release_seat_bounded(FakeDB(), 555, reason="unlink", budget=0.05)
        )
        assert out == vip_seat.UNKNOWN
        assert "555" in redis.h
        assert fake.kicked == []

    def test_a_quick_one_still_answers_normally(self, monkeypatch):
        fake = FakeTelegram(present=True)
        _patch(monkeypatch, fake)
        _patch_redis(monkeypatch, FakeRedis())

        out = asyncio.run(
            vip_seat.release_seat_bounded(FakeDB(), 555, reason="unlink", budget=5)
        )
        assert out == vip_seat.KICKED
        assert fake.kicked == [555]
