"""Read AutoTrade health out of the cryptobot database, for admin monitoring.

AutoTrade runs as a separate application (`/root/cryptobot`) against its own
Postgres. Until now the only window into a user's bot was the user's own
AutoTrade page, so support had no way to answer "is this person's bot working?"
without SSH.

This module opens a **read-only** connection using a role that has SELECT on the
operational tables and, deliberately, no access at all to the encrypted API key
columns on `exchange_accounts` — an admin screen has no business being able to
read someone's Binance credentials, and the grant makes that structural rather
than a matter of remembering.

Everything here is defensive: if the cryptobot database is unreachable the
caller gets `available: False` rather than an exception, because a monitoring
panel must never be able to take down the admin page it lives on.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_engine: Engine | None = None
_engine_failed = False

# How far back "recent" reaches for errors and activity counts.
RECENT_WINDOW_HOURS = 24

# Audit actions that represent a real execution problem, as opposed to a signal
# that was skipped on purpose by a risk rule.
ERROR_ACTIONS = ("execution.failed", "execution.entry_landed_despite_failure")


def _normalise_dsn(dsn: str) -> str:
    dsn = dsn.replace("postgresql+psycopg://", "postgresql+psycopg2://")
    if dsn.startswith("postgresql://"):
        dsn = dsn.replace("postgresql://", "postgresql+psycopg2://", 1)
    return dsn


def _get_engine() -> Engine | None:
    """Lazily build the read-only engine; never raise, never retry in a loop."""
    global _engine, _engine_failed
    if _engine is not None:
        return _engine
    if _engine_failed:
        return None
    dsn = os.getenv("CRYPTOBOT_RO_DSN", "").strip()
    if not dsn:
        _engine_failed = True
        logger.info("CRYPTOBOT_RO_DSN not set — AutoTrade monitoring disabled")
        return None
    try:
        _engine = create_engine(
            _normalise_dsn(dsn),
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=2,
            pool_timeout=5,
            pool_recycle=1800,
        )
        return _engine
    except Exception:
        _engine_failed = True
        logger.exception("Could not open the cryptobot read-only connection")
        return None


def _rows(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    engine = _get_engine()
    if engine is None:
        raise RuntimeError("cryptobot database is not configured")
    with engine.connect() as conn:
        conn.execute(text("SET LOCAL statement_timeout = '8s'"))
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result]


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _subject(user_id: int) -> str:
    """cryptobot mints its subjects as lq:{luxquant_user_id}."""
    return f"lq:{user_id}"


def _health(row: dict[str, Any]) -> tuple[str, list[str]]:
    """Reduce a user's AutoTrade state to one status plus the reasons for it.

    Ordered by what actually stops someone trading, so the worst reason wins
    rather than the first one found.
    """
    reasons: list[str] = []
    status = "ok"

    if row.get("stuck_positions"):
        reasons.append(f"{row['stuck_positions']} position(s) awaiting reconciliation — all new entries blocked")
        status = "error"
    if row.get("key_status") == "invalid":
        reasons.append("Binance API key rejected — cannot trade until reconnected")
        status = "error"
    if row.get("recent_errors"):
        reasons.append(f"{row['recent_errors']} execution error(s) in the last {RECENT_WINDOW_HOURS}h")
        status = "error"

    if status != "error":
        if row.get("key_status") == "unchecked":
            reasons.append("API key has never been verified")
            status = "warn"
        if row.get("is_active") and row.get("dry_run"):
            reasons.append("Running in dry-run — no real orders are placed")
            status = "warn"
        if row.get("recent_blocks"):
            reasons.append(f"{row['recent_blocks']} entr(ies) blocked by risk limits in the last {RECENT_WINDOW_HOURS}h")
            status = "warn"

    if not row.get("has_account"):
        return "unlinked", ["No Binance account connected to AutoTrade"]
    if not row.get("is_active"):
        # Paused is a choice, not a fault — never report it as a problem.
        return ("paused", reasons) if status == "ok" else (status, reasons)
    return status, reasons or ["Running normally"]


def _base_rows(subjects: list[str] | None = None) -> list[dict[str, Any]]:
    """One row per cryptobot user, with every counter the health check needs."""
    since = datetime.now(timezone.utc) - timedelta(hours=RECENT_WINDOW_HOURS)
    where = "WHERE u.subject = ANY(:subjects)" if subjects else ""
    sql = f"""
        SELECT
            u.id                AS cb_user_id,
            u.subject           AS subject,
            u.email             AS cb_email,
            c.is_active         AS is_active,
            c.dry_run           AS dry_run,
            c.spot_enabled      AS spot_enabled,
            c.futures_enabled   AS futures_enabled,
            c.leverage          AS leverage,
            a.id IS NOT NULL    AS has_account,
            a.key_status        AS key_status,
            a.last_checked_at   AS key_checked_at,
            a.created_at        AS linked_at,
            c.created_at        AS config_created_at,
            (SELECT count(*) FROM positions p
               WHERE p.user_id = u.id AND p.status = 'open')                       AS open_positions,
            (SELECT count(*) FROM positions p
               WHERE p.user_id = u.id AND p.status = 'reconciliation_required')    AS stuck_positions,
            (SELECT coalesce(sum(p.realized_pnl), 0) FROM positions p
               WHERE p.user_id = u.id AND p.realized_pnl IS NOT NULL)              AS realized_pnl_total,
            (SELECT count(*) FROM execution_jobs j
               WHERE j.user_id = u.id AND j.dry_run IS false
                 AND j.status = 'completed' AND j.created_at >= :since)            AS recent_entries,
            (SELECT count(*) FROM audit_logs l
               WHERE l.user_id = u.id AND l.action = ANY(:error_actions)
                 AND l.created_at >= :since)                                       AS recent_errors,
            (SELECT count(*) FROM audit_logs l
               WHERE l.user_id = u.id AND l.action LIKE 'execution.skip_risk_limit.%%'
                 AND l.created_at >= :since)                                       AS recent_blocks,
            (SELECT max(l.created_at) FROM audit_logs l
               WHERE l.user_id = u.id AND l.action = ANY(:error_actions))          AS last_error_at
        FROM users u
        LEFT JOIN strategy_configs c ON c.user_id = u.id AND c.exchange = 'binance'
        LEFT JOIN exchange_accounts a ON a.user_id = u.id AND a.exchange = 'binance'
        {where}
        ORDER BY u.created_at DESC
    """
    params: dict[str, Any] = {"since": since, "error_actions": list(ERROR_ACTIONS)}
    if subjects:
        params["subjects"] = subjects
    return _rows(sql, params)


def _lifecycle(cb_user_ids: list[str]) -> dict[str, dict[str, Any]]:
    """When each bot was first switched on, and how long it has run in total.

    cryptobot writes a `strategy_config.active` audit row with `{"active": bool}`
    on every toggle, so accumulated runtime can be reconstructed by walking the
    pairs rather than guessing from "created 40 days ago". Time spent paused is
    excluded, which is the whole point — a bot linked in June but switched on for
    two days has run for two days.
    """
    if not cb_user_ids:
        return {}
    try:
        events = _rows(
            """
            SELECT user_id, created_at, metadata_json
            FROM audit_logs
            WHERE action = 'strategy_config.active' AND user_id = ANY(:ids)
            ORDER BY user_id, created_at ASC
            """,
            {"ids": cb_user_ids},
        )
    except Exception:
        return {}

    now = datetime.now(timezone.utc)
    out: dict[str, dict[str, Any]] = {}
    for event in events:
        uid = event["user_id"]
        state = out.setdefault(
            uid,
            {"first_active_at": None, "active_seconds": 0.0, "since": None, "toggles": 0},
        )
        turned_on = bool((event.get("metadata_json") or {}).get("active"))
        at = event["created_at"]
        state["toggles"] += 1
        if turned_on:
            if state["first_active_at"] is None:
                state["first_active_at"] = at
            # Repeated "on" without an intervening "off" is not a new interval.
            if state["since"] is None:
                state["since"] = at
        elif state["since"] is not None:
            state["active_seconds"] += (at - state["since"]).total_seconds()
            state["since"] = None

    for state in out.values():
        if state["since"] is not None:
            state["active_seconds"] += (now - state["since"]).total_seconds()
    return out


def _decorate(row: dict[str, Any], life: dict[str, Any] | None = None) -> dict[str, Any]:
    status, reasons = _health(row)
    life = life or {}
    # A bot that is on but predates the audit action has no interval to walk.
    # Say so rather than printing a number we cannot stand behind.
    estimated = bool(row.get("is_active")) and not life
    active_seconds = life.get("active_seconds")
    if estimated and row.get("config_created_at"):
        active_seconds = (
            datetime.now(timezone.utc) - _as_utc(row["config_created_at"])
        ).total_seconds()
    markets = [m for m, on in (("spot", row.get("spot_enabled")), ("futures", row.get("futures_enabled"))) if on]
    return {
        "subject": row["subject"],
        "luxquant_user_id": int(row["subject"][3:]) if str(row["subject"]).startswith("lq:") else None,
        "cryptobot_email": row.get("cb_email"),
        "status": status,
        "reasons": reasons,
        "is_active": bool(row.get("is_active")),
        "dry_run": bool(row.get("dry_run")) if row.get("dry_run") is not None else None,
        "markets": markets,
        "leverage": row.get("leverage"),
        "has_account": bool(row.get("has_account")),
        "key_status": row.get("key_status"),
        "key_checked_at": row.get("key_checked_at"),
        "open_positions": int(row.get("open_positions") or 0),
        "stuck_positions": int(row.get("stuck_positions") or 0),
        "realized_pnl_total": float(row.get("realized_pnl_total") or 0),
        "recent_entries": int(row.get("recent_entries") or 0),
        "recent_errors": int(row.get("recent_errors") or 0),
        "recent_blocks": int(row.get("recent_blocks") or 0),
        "last_error_at": row.get("last_error_at"),
        "linked_at": row.get("linked_at"),
        # Only fall back to the config date for a bot that is on but predates the
        # audit action. A bot that was never switched on has no first-active date,
        # and printing the day its config row appeared would imply otherwise.
        "first_active_at": life.get("first_active_at") or (row.get("config_created_at") if estimated else None),
        "active_since": life.get("since"),
        "active_seconds": round(active_seconds) if active_seconds else 0,
        "active_time_estimated": estimated,
        "toggles": life.get("toggles", 0),
    }


def is_configured() -> bool:
    return _get_engine() is not None


def overview() -> dict[str, Any]:
    """Fleet-wide AutoTrade health, plus a row per user who has ever linked."""
    try:
        raw = _base_rows()
        life = _lifecycle([r["cb_user_id"] for r in raw])
        rows = [_decorate(row, life.get(row["cb_user_id"])) for row in raw]
    except Exception as exc:
        logger.warning("AutoTrade monitoring unavailable: %s", exc)
        return {"available": False, "error": str(exc)[:200], "totals": {}, "users": []}

    linked = [r for r in rows if r["has_account"]]
    totals = {
        "linked": len(linked),
        "active": len([r for r in linked if r["is_active"]]),
        "live": len([r for r in linked if r["is_active"] and r["dry_run"] is False]),
        "errors": len([r for r in rows if r["status"] == "error"]),
        "warnings": len([r for r in rows if r["status"] == "warn"]),
        "stuck_positions": sum(r["stuck_positions"] for r in rows),
        "invalid_keys": len([r for r in linked if r["key_status"] == "invalid"]),
        "open_positions": sum(r["open_positions"] for r in rows),
    }
    # Worst first: an admin opening this wants the broken ones on screen, not
    # to scroll past everyone who is fine.
    rank = {"error": 0, "warn": 1, "unlinked": 3, "paused": 2, "ok": 2}
    rows.sort(key=lambda r: (rank.get(r["status"], 4), -r["recent_errors"], -r["stuck_positions"]))
    return {"available": True, "window_hours": RECENT_WINDOW_HOURS, "totals": totals, "users": rows}


def open_positions() -> dict[str, Any]:
    """Every position currently held across all users.

    Kept separate from the per-user view because the question "what is the desk
    holding right now" is asked far more often than "what is this one person
    holding", and answering it by expanding 25 rows one at a time is useless.
    """
    try:
        rows = _rows(
            """
            SELECT p.symbol, p.market_type, p.side, p.quantity, p.entry_price,
                   p.status, p.exit_reason, p.created_at, p.last_synced_at,
                   u.subject, u.email AS cb_email,
                   c.leverage AS leverage, c.dry_run AS dry_run
            FROM positions p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN strategy_configs c
                   ON c.user_id = p.user_id AND c.exchange = 'binance'
            WHERE p.status <> 'closed'
            ORDER BY (p.status = 'reconciliation_required') DESC, p.created_at DESC
            """
        )
    except Exception as exc:
        logger.warning("AutoTrade positions unavailable: %s", exc)
        return {"available": False, "error": str(exc)[:200], "positions": [], "totals": {}}

    for row in rows:
        subject = str(row.get("subject") or "")
        row["luxquant_user_id"] = int(subject[3:]) if subject.startswith("lq:") else None
        # Notional is only meaningful when we know what was paid; entry_price was
        # an estimate on older rows, so it can legitimately be missing.
        qty = float(row.get("quantity") or 0)
        entry = row.get("entry_price")
        row["notional"] = round(qty * float(entry), 2) if entry else None

    totals = {
        "open": len([r for r in rows if r["status"] == "open"]),
        "stuck": len([r for r in rows if r["status"] == "reconciliation_required"]),
        "spot": len([r for r in rows if r["market_type"] == "spot"]),
        "futures": len([r for r in rows if r["market_type"] == "futures"]),
        "users_holding": len({r["subject"] for r in rows}),
    }
    return {"available": True, "totals": totals, "positions": rows}


def user_detail(luxquant_user_id: int) -> dict[str, Any]:
    """Everything about one user's bot, including the actual error text.

    The error messages are the point: "something failed" is not actionable, and
    reading them previously meant querying the cryptobot database by hand.
    """
    subject = _subject(luxquant_user_id)
    try:
        base = _base_rows([subject])
    except Exception as exc:
        logger.warning("AutoTrade detail unavailable for %s: %s", subject, exc)
        return {"available": False, "error": str(exc)[:200]}
    if not base:
        return {"available": True, "linked": False, "subject": subject}

    summary = _decorate(base[0], _lifecycle([base[0]["cb_user_id"]]).get(base[0]["cb_user_id"]))
    cb_user_id = base[0]["cb_user_id"]
    since = datetime.now(timezone.utc) - timedelta(days=7)

    try:
        errors = _rows(
            """
            SELECT l.created_at, l.action, l.metadata_json
            FROM audit_logs l
            WHERE l.user_id = :uid AND l.action = ANY(:error_actions)
            ORDER BY l.created_at DESC LIMIT 20
            """,
            {"uid": cb_user_id, "error_actions": list(ERROR_ACTIONS)},
        )
        blocks = _rows(
            """
            SELECT l.action, count(*) AS hits, max(l.created_at) AS last_at
            FROM audit_logs l
            WHERE l.user_id = :uid
              AND l.action LIKE 'execution.skip_risk_limit.%%'
              AND l.created_at >= :since
            GROUP BY l.action ORDER BY hits DESC
            """,
            {"uid": cb_user_id, "since": since},
        )
        positions = _rows(
            """
            SELECT symbol, market_type, side, quantity, entry_price, exit_price,
                   realized_pnl, status, exit_reason, created_at, closed_at
            FROM positions
            WHERE user_id = :uid AND status <> 'closed'
            ORDER BY created_at DESC LIMIT 25
            """,
            {"uid": cb_user_id},
        )
        recent_closed = _rows(
            """
            SELECT symbol, market_type, realized_pnl, exit_reason, closed_at
            FROM positions
            WHERE user_id = :uid AND status = 'closed' AND closed_at IS NOT NULL
            ORDER BY closed_at DESC LIMIT 10
            """,
            {"uid": cb_user_id},
        )
        alerts = _rows(
            """
            SELECT alert_key, severity, category, title, message, status,
                   first_seen_at, last_seen_at, occurrence_count
            FROM monitoring_alerts
            WHERE user_id = :uid AND status = 'open'
            ORDER BY last_seen_at DESC LIMIT 15
            """,
            {"uid": cb_user_id},
        )
    except Exception as exc:
        logger.warning("AutoTrade detail partial for %s: %s", subject, exc)
        return {"available": True, "linked": True, "summary": summary, "error": str(exc)[:200]}

    for row in errors:
        meta = row.get("metadata_json") or {}
        row["error"] = str(meta.get("error") or meta.get("original_error") or "")[:600]
        row["symbol"] = meta.get("symbol")
        row.pop("metadata_json", None)
    for row in blocks:
        row["code"] = row["action"].rsplit(".", 1)[-1]

    return {
        "available": True,
        "linked": True,
        "summary": summary,
        "errors": errors,
        "blocks": blocks,
        "positions": positions,
        "recent_closed": recent_closed,
        "alerts": alerts,
    }
