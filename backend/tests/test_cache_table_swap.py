"""The cache tables must be built beside the live ones, not in place.

`_cache_outcomes` and `_cache_last_updates` are read by the desk, the
watchlist, the screener and the Custom screen, and they were dropped and
rebuilt ~800 times a day. A DROP holds an ACCESS EXCLUSIVE lock for the whole
rebuild: 1.2s normally, 111.9s during the nightly pg_dump.
"""
from app.services.cache_worker import precompute_outcomes


class RecordingDB:
    def __init__(self):
        self.sql = []
        self.commits = []

    def execute(self, stmt, params=None):
        self.sql.append(" ".join(str(stmt).split()))
        return None

    def commit(self):
        self.commits.append(len(self.sql))

    def rollback(self):
        pass


def _run():
    db = RecordingDB()
    precompute_outcomes(db)
    return db


def test_the_live_table_is_only_dropped_after_its_replacement_exists():
    db = _run()
    for live in ("_cache_outcomes", "_cache_last_updates"):
        build = next(i for i, q in enumerate(db.sql) if f"CREATE UNLOGGED TABLE {live}__build" in q)
        drop_live = next(i for i, q in enumerate(db.sql)
                         if q.startswith(f"DROP TABLE IF EXISTS {live}") and "__build" not in q)
        rename = next(i for i, q in enumerate(db.sql) if f"ALTER TABLE {live}__build RENAME TO {live}" in q)
        assert build < drop_live < rename, f"{live}: build={build} drop={drop_live} rename={rename}"


def test_the_swap_is_one_transaction_with_a_lock_timeout():
    db = _run()
    drop = next(i for i, q in enumerate(db.sql)
                if q.startswith("DROP TABLE IF EXISTS _cache_outcomes") and "__build" not in q)
    # No commit between the drop and the rename: a failed rename must take the
    # drop back with it, so the live table can never be missing.
    rename = next(i for i, q in enumerate(db.sql) if "RENAME TO _cache_outcomes" in q)
    assert not any(drop < c <= rename for c in db.commits)
    assert any("SET lock_timeout" in q for q in db.sql[:drop])


def test_indexes_come_back_with_their_original_names():
    db = _run()
    for idx in ("idx_cache_outcomes_sid", "idx_cache_outcomes_out", "idx_cache_last_updates_sid"):
        assert any(f"ALTER INDEX {idx}__build RENAME TO {idx}" in q for q in db.sql), idx
