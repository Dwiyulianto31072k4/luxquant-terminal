"""
X API usage & spend — admin endpoints for the Management System "Marketing" tab.

Reads `x_api_usage`, written by the VPS posters:
  /root/luxquant-x-poster/x_poster.py        (signal tweets)
  /root/luxquant-social-cards/card_poster.py (designed social cards)

History before metering went live (2026-07-23) is backfilled from `x_posts`
and tagged source='backfill', so the series reaches back to 2026-03-26.

Only tweet creation is billed on X's pay-per-use plan — the v1.1 media_upload
host is not metered. Verified against the developer console: its PostCreate +
Content Create events sum to the tweet count, not to tweets + uploads. Uploads
are still recorded at $0 so their failure rate stays visible.

  GET  /api/v1/workspace/x-usage/summary?days=30
  GET  /api/v1/workspace/x-usage/daily?days=180
  GET  /api/v1/workspace/x-usage/recent?limit=50
  GET  /api/v1/workspace/x-usage/settings
  POST /api/v1/workspace/x-usage/settings
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db

router = APIRouter(prefix="/api/v1/workspace/x-usage", tags=["x-usage"])

# X resets the billing cycle on the 16th (cap_reset_day from GET /2/usage/tweets,
# matching the "Jul 16 - Aug 16" window shown on the console Credits page).
CYCLE_DAY = 16

# Auto-recharge settings as configured on console.x.com → Billing → Credits.
RECHARGE_TRIGGER = 1.00
RECHARGE_AMOUNT = 10.00


def _table_exists(db: Session) -> bool:
    return db.execute(text("SELECT to_regclass('public.x_api_usage')")).scalar() is not None


def _ledger_balance(db: Session) -> dict:
    """Live credit balance, derived from the ledger rather than typed in.

    balance = real top-ups - reconciliation adjustments - metered spend

    The top-ups are the actual VISA charges imported from the console
    transactions API; spend is every billed call the posters made. Because the
    ledger was seeded to tie out exactly to the balance the console reported,
    this tracks in realtime and needs no manual upkeep.
    """
    if db.execute(text("SELECT to_regclass('public.x_credit_events')")).scalar() is None:
        return {"available": False}

    row = db.execute(text("""
        SELECT
            COALESCE(SUM(amount_usd) FILTER (WHERE kind='topup' AND status='succeeded'), 0) AS topups,
            COALESCE(SUM(amount_usd) FILTER (WHERE kind='adjustment'), 0)                   AS adjustments,
            MAX(ts) FILTER (WHERE kind='topup' AND status='succeeded')                      AS last_topup
        FROM x_credit_events
    """)).mappings().first()

    spend = float(db.execute(text("SELECT COALESCE(SUM(cost_usd), 0) FROM x_api_usage")).scalar())
    topups = float(row["topups"])
    adjustments = float(row["adjustments"])
    balance = topups - adjustments - spend

    return {
        "available": True,
        "balance": round(balance, 4),
        "topups_total": round(topups, 2),
        "spend_total": round(spend, 4),
        "last_topup_at": row["last_topup"].isoformat() if row["last_topup"] else None,
        "recharge_trigger": RECHARGE_TRIGGER,
        "recharge_amount": RECHARGE_AMOUNT,
    }


def _pricing(db: Session) -> list[dict]:
    if db.execute(text("SELECT to_regclass('public.x_api_pricing')")).scalar() is None:
        return []
    return [
        {
            "kind": r["kind"],
            "from": str(r["effective_from"].date()),
            "to": str(r["effective_to"].date()) if r["effective_to"] else None,
            "unit_usd": float(r["unit_usd"]),
            "source": r["source"],
            "note": r["note"],
        }
        for r in db.execute(text("""
            SELECT kind, effective_from, effective_to, unit_usd, source, note
            FROM x_api_pricing ORDER BY kind, effective_from
        """)).mappings()
    ]


def _cycle_start(today: date) -> date:
    """Start of the billing cycle containing `today`."""
    if today.day >= CYCLE_DAY:
        return today.replace(day=CYCLE_DAY)
    prev = today.replace(day=1) - timedelta(days=1)
    return prev.replace(day=CYCLE_DAY)


def _cycle_end(start: date) -> date:
    if start.month == 12:
        return start.replace(year=start.year + 1, month=1)
    return start.replace(month=start.month + 1)


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _admin=Depends(get_admin_user)):
    return {
        "cycle_day": CYCLE_DAY,
        "pricing": _pricing(db),
        "credit": _ledger_balance(db),
    }


@router.get("/topups")
def topups(
    limit: int = Query(40, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    if db.execute(text("SELECT to_regclass('public.x_credit_events')")).scalar() is None:
        return {"available": False, "items": []}
    rows = db.execute(text("""
        SELECT ts, kind, amount_usd, status, source, note
        FROM x_credit_events ORDER BY ts DESC LIMIT :n
    """), {"n": limit}).mappings()
    return {
        "available": True,
        "items": [
            {
                "ts": r["ts"].isoformat(),
                "kind": r["kind"],
                "amount": float(r["amount_usd"]),
                "status": r["status"],
                "source": r["source"],
                "note": r["note"],
            }
            for r in rows
        ],
    }


def _empty(days: int) -> dict:
    return {
        "available": False,
        "days": days,
        "today": {"posts": 0, "media": 0, "cost": 0.0},
        "cycle": {},
        "range": {"posts": 0, "media": 0, "cost": 0.0, "failed": 0},
        "lifetime": {},
        "daily": [],
        "monthly": [],
        "by_event": [],
        "by_source": [],
    }


@router.get("/summary")
def summary(
    days: int = Query(30, ge=1, le=400),
    db: Session = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    if not _table_exists(db):
        return _empty(days)

    today = datetime.now(timezone.utc).date()
    cyc_start = _cycle_start(today)
    cyc_end = _cycle_end(cyc_start)

    def agg(where: str, params: dict) -> dict:
        row = db.execute(text(f"""
            SELECT COALESCE(COUNT(*) FILTER (WHERE kind='PostCreate' AND ok), 0)    AS posts,
                   COALESCE(COUNT(*) FILTER (WHERE kind='ContentCreate' AND ok), 0) AS media,
                   COALESCE(COUNT(*) FILTER (WHERE NOT ok), 0)                      AS failed,
                   COALESCE(SUM(cost_usd), 0)                                       AS cost
            FROM x_api_usage WHERE {where}
        """), params).mappings().first()
        return {
            "posts": int(row["posts"]), "media": int(row["media"]),
            "failed": int(row["failed"]), "cost": round(float(row["cost"]), 4),
        }

    today_agg = agg("ts >= :d", {"d": today})
    cycle_agg = agg("ts >= :a AND ts < :b", {"a": cyc_start, "b": cyc_end})
    range_agg = agg("ts >= :d", {"d": today - timedelta(days=days - 1)})
    life_agg = agg("TRUE", {})

    daily = [
        {
            "date": str(r["d"]),
            "posts": int(r["posts"]),
            "media": int(r["media"]),
            "failed": int(r["failed"]),
            "cost": round(float(r["cost"]), 4),
            "exact": bool(r["exact"]),
        }
        for r in db.execute(text("""
            SELECT ts::date AS d,
                   COUNT(*) FILTER (WHERE kind='PostCreate' AND ok)    AS posts,
                   COUNT(*) FILTER (WHERE kind='ContentCreate' AND ok) AS media,
                   COUNT(*) FILTER (WHERE NOT ok)                      AS failed,
                   SUM(cost_usd)                                       AS cost,
                   bool_and(source <> 'backfill')                      AS exact
            FROM x_api_usage
            WHERE ts >= :since
            GROUP BY 1 ORDER BY 1
        """), {"since": today - timedelta(days=days - 1)}).mappings()
    ]

    monthly = [
        {
            "month": str(r["m"]),
            "posts": int(r["posts"]),
            "cost": round(float(r["cost"]), 2),
        }
        for r in db.execute(text("""
            SELECT date_trunc('month', ts)::date AS m,
                   COUNT(*) FILTER (WHERE kind='PostCreate' AND ok) AS posts,
                   SUM(cost_usd) AS cost
            FROM x_api_usage GROUP BY 1 ORDER BY 1
        """)).mappings()
    ]

    by_event = [
        {"event": r["note"] or "unknown", "posts": int(r["n"]), "cost": round(float(r["cost"]), 2)}
        for r in db.execute(text("""
            SELECT note, COUNT(*) AS n, SUM(cost_usd) AS cost
            FROM x_api_usage
            WHERE kind='PostCreate' AND ok AND ts >= :since
            GROUP BY 1 ORDER BY n DESC LIMIT 12
        """), {"since": today - timedelta(days=days - 1)}).mappings()
    ]

    by_source = [
        {"source": r["source"], "posts": int(r["n"]), "cost": round(float(r["cost"]), 2)}
        for r in db.execute(text("""
            SELECT source, COUNT(*) AS n, SUM(cost_usd) AS cost
            FROM x_api_usage
            WHERE kind='PostCreate' AND ok AND ts >= :since
            GROUP BY 1 ORDER BY n DESC
        """), {"since": today - timedelta(days=days - 1)}).mappings()
    ]

    # ── cycle projection & runway ──
    elapsed = max(1, (today - cyc_start).days + 1)
    cycle_len = (cyc_end - cyc_start).days
    burn = cycle_agg["cost"] / elapsed
    projected = round(burn * cycle_len, 2)

    credit = _ledger_balance(db)
    balance = credit.get("balance") if credit.get("available") else None
    runway_days = None
    runway_date = None
    next_topup = None
    if balance is not None and burn > 0:
        # Credit is spendable down to the auto-recharge trigger, not to zero.
        spendable = max(0.0, balance - RECHARGE_TRIGGER)
        runway_days = round(spendable / burn, 1)
        runway_date = str(today + timedelta(days=int(spendable / burn)))
        next_topup = runway_date

    # 30-day burn is the more stable number for a monthly run-rate
    d30 = agg("ts >= :d", {"d": today - timedelta(days=29)})
    run_rate = round(d30["cost"] / 30 * 30.44, 2)

    signals = db.execute(text("""
        SELECT COUNT(DISTINCT signal_id) FROM x_posts WHERE created_at >= :since
    """), {"since": today - timedelta(days=days - 1)}).scalar() or 0

    return {
        "available": True,
        "days": days,
        "today": today_agg,
        "range": range_agg,
        "lifetime": life_agg,
        "cycle": {
            "start": str(cyc_start),
            "end": str(cyc_end),
            "elapsed_days": elapsed,
            "total_days": cycle_len,
            "days_remaining": max(0, (cyc_end - today).days),
            "spend": cycle_agg["cost"],
            "posts": cycle_agg["posts"],
            "burn_per_day": round(burn, 4),
            "projected": projected,
        },
        "runway": {
            "credit_balance": balance,
            "topups_total": credit.get("topups_total"),
            "spend_total": credit.get("spend_total"),
            "last_topup_at": credit.get("last_topup_at"),
            "recharge_trigger": RECHARGE_TRIGGER,
            "recharge_amount": RECHARGE_AMOUNT,
            "days": runway_days,
            "depleted_on": runway_date,
            "next_topup_on": next_topup,
        },
        "pricing": _pricing(db),
        "run_rate_monthly": run_rate,
        "cost_per_post": round(range_agg["cost"] / range_agg["posts"], 5) if range_agg["posts"] else 0.0,
        "signals_covered": int(signals),
        "cost_per_signal": round(range_agg["cost"] / signals, 4) if signals else 0.0,
        "daily": daily,
        "monthly": monthly,
        "by_event": by_event,
        "by_source": by_source,
    }


@router.get("/daily")
def daily_series(
    days: int = Query(180, ge=7, le=400),
    db: Session = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    if not _table_exists(db):
        return {"available": False, "daily": []}
    since = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    rows = db.execute(text("""
        SELECT ts::date AS d,
               COUNT(*) FILTER (WHERE kind='PostCreate' AND ok) AS posts,
               SUM(cost_usd) AS cost,
               bool_and(source <> 'backfill') AS exact
        FROM x_api_usage WHERE ts >= :since GROUP BY 1 ORDER BY 1
    """), {"since": since}).mappings()
    return {
        "available": True,
        "daily": [
            {"date": str(r["d"]), "posts": int(r["posts"]),
             "cost": round(float(r["cost"]), 4), "exact": bool(r["exact"])}
            for r in rows
        ],
    }


@router.get("/recent")
def recent(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    if not _table_exists(db):
        return {"available": False, "items": []}
    rows = db.execute(text("""
        SELECT ts, source, endpoint, kind, ok, cost_usd, ref, note
        FROM x_api_usage
        WHERE source <> 'backfill'
        ORDER BY ts DESC LIMIT :n
    """), {"n": limit}).mappings()
    return {
        "available": True,
        "items": [
            {
                "ts": r["ts"].isoformat() if r["ts"] else None,
                "source": r["source"], "endpoint": r["endpoint"], "kind": r["kind"],
                "ok": bool(r["ok"]), "cost": round(float(r["cost_usd"]), 5),
                "ref": r["ref"], "note": r["note"],
            }
            for r in rows
        ],
    }
