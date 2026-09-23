"""The desk payload carries the desk's fields and nothing heavier.

Measured on production: the full coin-intel payload is 7.0 MB across 496 coins,
5.4 MB of it `signal_history`, and the Signals page reads none of that — it
spent up to 90 seconds downloading history it never drew.
"""
import json

from app.api.routes.signals import DESK_COIN_FIELDS, _desk_view

HEAVY = ("signal_history", "monthly_trend", "hour_analysis", "dow_analysis",
         "correlated_pairs", "insight", "entry_quality", "recovery", "flow_perf", "tp4_streaks")

COIN = {
    "pair": "BTCUSDT", "win_rate": 86.0, "closed_trades": 121, "current_streak": 7,
    "outcome_dist": {"tp1": 12, "tp2": 38, "tp3": 22, "tp4": 14, "sl": 14},
    "recent_outcomes": ["tp2", "tp1"], "risk_score": 40, "verdict": "worth_it",
    "active_days": ["2026-09-01"], "volatility": {"atr": 1.2},
    **{k: [{"x": i} for i in range(200)] for k in HEAVY},
}
FULL = {"computed_at": "2026-09-23T14:00:00Z", "platform_avg_wr": 85.6,
        "top_coins": [COIN], "rest_coins": [COIN, {**COIN, "pair": "ETHUSDT"}]}


def test_desk_view_keeps_the_shape_the_page_parses():
    desk = _desk_view(FULL)
    assert [c["pair"] for c in desk["top_coins"]] == ["BTCUSDT"]
    assert [c["pair"] for c in desk["rest_coins"]] == ["BTCUSDT", "ETHUSDT"]
    assert desk["platform_avg_wr"] == 85.6 and desk["computed_at"] == FULL["computed_at"]
    assert desk["view"] == "desk"


def test_desk_view_drops_the_heavy_fields_and_keeps_what_the_desk_reads():
    coin = _desk_view(FULL)["rest_coins"][0]
    for f in HEAVY:
        assert f not in coin, f
    for f in ("pair", "win_rate", "closed_trades", "current_streak", "outcome_dist",
              "recent_outcomes", "risk_score", "verdict", "active_days", "volatility"):
        assert f in coin, f


def test_desk_view_is_much_smaller():
    full_size = len(json.dumps(FULL))
    desk_size = len(json.dumps(_desk_view(FULL)))
    assert desk_size * 10 < full_size, f"{desk_size} vs {full_size}"


def test_allowlist_has_no_heavy_field():
    assert not DESK_COIN_FIELDS.intersection(HEAVY)


# ── ensure_schema: look before you lock ──────────────────────────────

class _Catalog:
    """Answers the two catalogue reads, records the DDL that actually ran."""
    def __init__(self, columns, indexes):
        self.columns, self.indexes, self.ran = columns, indexes, []

    def execute(self, stmt, params=None):
        q = str(stmt)
        if "information_schema.columns" in q:
            return [(c,) for c in self.columns]
        if "pg_indexes" in q:
            return [(i,) for i in self.indexes]
        if not q.startswith("SET lock_timeout"):
            self.ran.append(q)
        return []

    def commit(self):
        pass

    def rollback(self):
        pass


def test_ensure_schema_runs_nothing_when_everything_exists():
    from app.core.database import ensure_schema

    db = _Catalog({"acq_source"}, {"ix_users_acq_source"})
    ensure_schema(db, "users", [
        ("column", "acq_source", "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_source VARCHAR(40)"),
        ("index", "ix_users_acq_source", "CREATE INDEX IF NOT EXISTS ix_users_acq_source ON users (acq_source)"),
    ])
    assert db.ran == [], "a no-op ALTER still takes an ACCESS EXCLUSIVE lock"


def test_ensure_schema_adds_only_what_is_missing():
    from app.core.database import ensure_schema

    db = _Catalog({"acq_source"}, set())
    ensure_schema(db, "users", [
        ("column", "acq_source", "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_source VARCHAR(40)"),
        ("column", "acq_medium", "ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_medium VARCHAR(40)"),
        ("index", "ix_users_acq_source", "CREATE INDEX IF NOT EXISTS ix_users_acq_source ON users (acq_source)"),
    ])
    assert len(db.ran) == 2 and all("acq_medium" in q or "ix_users_acq_source" in q for q in db.ran)
