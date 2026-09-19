from app.api.routes import edge_lab


def test_live_outcomes_are_untouched():
    # The live endpoints must keep running the exact CTE they always ran.
    assert edge_lab.outcomes_cte(False) is edge_lab.OUTCOMES_CTE


def test_point_in_time_outcomes_only_see_updates_before_as_of():
    # A call that hit TP1 on Monday and TP4 on Friday is a TP1 as of Wednesday:
    # the cut has to sit on signal_updates, before the highest level is picked.
    cte = edge_lab.outcomes_cte(True)
    assert cte.count(":as_of") == 1
    # In the WHERE of the signal_updates scan (SQL filters before the window
    # function ranks levels), not after `resolved` has already picked one.
    at = cte.index("update_at::timestamptz < CAST(:as_of AS timestamptz)")
    assert cte.index("FROM signal_updates") < at < cte.index("resolved AS")


def test_snapshot_filter_uses_when_tags_were_written():
    assert "entry_snapshot->>'computed_at'" in edge_lab.SNAPSHOT_AS_OF_SQL
    assert ":as_of" in edge_lab.SNAPSHOT_AS_OF_SQL
