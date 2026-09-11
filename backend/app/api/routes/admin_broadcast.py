# backend/app/api/routes/admin_broadcast.py
"""Is each delivery pipeline actually moving, and what is stuck behind it.

The System tab already answers whether a unit is running. That was not enough
on 2026-09-08: Telegram's DC5 went down, delivery to the signal channel stopped
for three and a half hours, and every service stayed green the whole time --
systemd was asked whether a process existed, not whether its work got done.
The poller kept polling, the poster kept polling, and both reported success on
cycles that published nothing.

So nothing here reads a service state. Every row is measured from the work
itself: when did this channel last carry something, and how much is waiting
behind it. A pipeline that has gone quiet looks quiet, whether the process
crashed, the provider refused it, or there was simply nothing to send -- and
the queue column is what separates those last two.

The ingest row is first because it is the one that fails silently. When the
scraper cannot read the source channel, everything downstream reports "nothing
to do" and looks perfectly healthy.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/broadcast", tags=["admin-broadcast"])


def _age_min(ts) -> float | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds() / 60


def _verdict(age_min: float | None, warn: float, bad: float, queue: int) -> str:
    """Quiet is only a problem when something is waiting.

    A channel with an empty queue and no recent post is not broken, it is idle
    -- most of these carry a handful of messages an hour and go quiet at night.
    Colouring that red would train everyone to ignore the colour, which is how
    a real outage gets missed.
    """
    if age_min is None:
        return "unknown"
    if queue <= 0:
        return "idle" if age_min > warn else "ok"
    if age_min >= bad:
        return "stalled"
    if age_min >= warn:
        return "slow"
    return "ok"


def _one(db: Session, sql: str, params: dict | None = None):
    """One probe, isolated from the others.

    Postgres aborts the whole transaction on the first failed statement, so
    without the rollback a single bad probe silently emptied every row after
    it — the page would show Discord and both X accounts as "never delivered"
    while they were working fine. A monitoring page that lies in the direction
    of "everything is broken" is worse than one that is simply missing a row.
    """
    try:
        return db.execute(text(sql), params or {}).mappings().first()
    except Exception as e:                       # a missing table must not 500
        log.warning("broadcast probe failed: %s", e)
        try:
            db.rollback()
        except Exception:
            pass
        return None


@router.get("")
def broadcast(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    rows = []

    # Thresholds are measured, not guessed. Over three days with the 2026-09-08
    # outage excluded, gaps between deliveries were: channel (487 gaps) median
    # 3.6 min, p90 20.6, p99 58.1, longest 226; VIP (1130 gaps) median 0.8, p90
    # 9.9, p99 25.1, longest 234. The first values here were 20 and 45, which
    # sat at roughly the 90th percentile — normal overnight quiet would have
    # flagged both channels most nights. These sit at the 99th percentile, so a
    # colour change means something genuinely unusual.

    # ---- ingest -----------------------------------------------------------
    # Deliberately first. Everything below is fed by this, and when it stops
    # the pipelines underneath report "nothing pending" and look healthy.
    r = _one(db, """
        SELECT max(update_at) AS last_at,
               count(*) FILTER (WHERE update_at > to_char(now() - interval '1 hour',
                                'YYYY-MM-DD"T"HH24:MI:SS')) AS last_hour
          FROM signal_updates
    """)
    last = None
    if r and r["last_at"]:
        try:
            last = datetime.fromisoformat(str(r["last_at"]).replace("Z", "+00:00"))
        except ValueError:
            last = None
    age = _age_min(last)
    rows.append({
        "key": "ingest", "name": "Signal ingest",
        "note": "reads the source channel — everything downstream starts here",
        "last_at": last.isoformat() if last else None,
        "age_min": age, "last_hour": (r or {}).get("last_hour") or 0,
        "queue": 0,
        # The scraper polls on a five-minute tick but only writes a row when the
        # source channel actually said something, so a gap is mostly a measure
        # of how quiet the market is. Measured over three days with the
        # 2026-09-08 outage excluded (793 gaps): median 4.9 min, p90 10, p98 30,
        # p99.5 45, longest 60. The first thresholds here were 15 and 25, which
        # would have fired on roughly one normal gap in ten — an alarm that
        # cries wolf nightly is one nobody reads during an actual outage. These
        # sit at the 99.5th percentile and just past the longest quiet stretch
        # ever observed.
        "verdict": "ok" if (age or 0) < 45 else ("slow" if (age or 0) < 75 else "stalled"),
        "expect": "median 5 min, quiet nights up to an hour",
    })

    # ---- Telegram signal channel -----------------------------------------
    r = _one(db, """
        SELECT max(created_at) AS last_at,
               count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS last_hour,
               count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_day
          FROM x_posts WHERE tg_message_id IS NOT NULL
    """)
    # One row per signal, at the highest rung it reached -- not one row per
    # event. The poster collapses a ladder: a call that touches TP2 then TP3
    # is published once, as TP3, and the TP2 row is never sent on its own.
    # Counting raw events instead showed a permanent backlog of about seven
    # that would never clear, and a queue number that never reaches zero is a
    # number everyone learns to ignore.
    q = _one(db, """
        SELECT count(*) AS n FROM (
          SELECT u.signal_id,
                 max(CASE u.update_type WHEN 'closed_win' THEN 4 WHEN 'tp4' THEN 4
                                        WHEN 'tp3' THEN 3 WHEN 'tp2' THEN 2 END) AS rung
            FROM signal_updates u
           WHERE u.update_type IN ('tp2','tp3','tp4','closed_win')
             AND u.update_at > to_char(now() - interval '6 hours', 'YYYY-MM-DD"T"HH24:MI:SS')
           GROUP BY u.signal_id
        ) ev
        WHERE NOT EXISTS (
          SELECT 1 FROM x_posts p
           WHERE p.signal_id = ev.signal_id AND p.tg_message_id IS NOT NULL
             AND p.event_type = CASE ev.rung WHEN 4 THEN 'closed_win'
                                             WHEN 3 THEN 'tp3' ELSE 'tp2' END)
    """)
    age = _age_min((r or {}).get("last_at"))
    queue = (q or {}).get("n") or 0
    rows.append({
        "key": "tg_channel", "name": "Telegram · @LuxQuantSignal",
        "note": "TP2 / TP3 / TP4 milestones",
        "last_at": (r or {}).get("last_at").isoformat() if (r or {}).get("last_at") else None,
        "age_min": age, "last_hour": (r or {}).get("last_hour") or 0,
        "last_day": (r or {}).get("last_day") or 0, "queue": queue,
        "verdict": _verdict(age, 60, 120, queue),
        "expect": "median 4 min, quiet spells up to an hour",
    })

    # ---- Telegram VIP group ----------------------------------------------
    r = _one(db, """
        SELECT max(posted_at) AS last_at,
               count(*) FILTER (WHERE posted_at > now() - interval '1 hour') AS last_hour,
               count(*) FILTER (WHERE posted_at > now() - interval '24 hours') AS last_day
          FROM tg_call_posts
    """)
    q = _one(db, """
        SELECT count(*) AS n FROM tg_call_post_failures f
         WHERE f.updated_at > now() - interval '6 hours'
           AND NOT EXISTS (SELECT 1 FROM tg_call_posts p
                           WHERE p.signal_id = f.signal_id AND p.event_type = f.event_type)
    """)
    age = _age_min((r or {}).get("last_at"))
    queue = (q or {}).get("n") or 0
    rows.append({
        "key": "tg_vip", "name": "Telegram · VIP group",
        "note": "new calls and target hits",
        "last_at": (r or {}).get("last_at").isoformat() if (r or {}).get("last_at") else None,
        "age_min": age, "last_hour": (r or {}).get("last_hour") or 0,
        "last_day": (r or {}).get("last_day") or 0, "queue": queue,
        "verdict": _verdict(age, 30, 90, queue),
        "expect": "median under a minute, quiet spells up to 25",
    })

    # ---- Discord ----------------------------------------------------------
    # Gated on tg_message_id by design, so it can only be as fresh as Telegram.
    # A queue here with a healthy Telegram row means the relay itself is stuck.
    r = _one(db, """
        SELECT max(posted_at) AS last_at,
               count(*) FILTER (WHERE posted_at > now() - interval '24 hours') AS last_day
          FROM discord_relays
    """)
    q = _one(db, """
        SELECT count(*) AS n
          FROM x_posts xp
          LEFT JOIN discord_relays dr ON dr.signal_id = xp.signal_id::text
                                     AND dr.event_type = xp.event_type
         WHERE xp.event_type IN ('tp3','closed_win')
           AND xp.tg_message_id IS NOT NULL AND dr.id IS NULL
           AND xp.created_at > now() - interval '24 hours'
    """)
    age = _age_min((r or {}).get("last_at"))
    queue = (q or {}).get("n") or 0
    rows.append({
        "key": "discord", "name": "Discord",
        "note": "relays TP3 and TP4 — follows Telegram, never leads it",
        "last_at": (r or {}).get("last_at").isoformat() if (r or {}).get("last_at") else None,
        "age_min": age, "last_hour": None,
        "last_day": (r or {}).get("last_day") or 0, "queue": queue,
        "verdict": _verdict(age, 75, 150, queue),
        "expect": "follows the channel within a minute",
    })

    # ---- X, commentary account -------------------------------------------
    r = _one(db, """
        SELECT max(posted_at) AS last_at,
               count(*) FILTER (WHERE posted_at > now() - interval '24 hours') AS last_day
          FROM x_quote_posts WHERE posted_at IS NOT NULL
    """)
    age = _age_min((r or {}).get("last_at"))
    rows.append({
        "key": "x_main", "name": "X · @luxquantcrypto",
        "note": "one short note per finished ladder",
        "last_at": (r or {}).get("last_at").isoformat() if (r or {}).get("last_at") else None,
        "age_min": age, "last_hour": None,
        "last_day": (r or {}).get("last_day") or 0, "queue": 0,
        "verdict": _verdict(age, 240, 600, 0),
        "expect": "up to 18 a day, hours apart",
    })

    # ---- X, signal feed ---------------------------------------------------
    r = _one(db, """
        SELECT max(x_posted_at) AS last_at,
               count(*) FILTER (WHERE x_posted_at > now() - interval '24 hours') AS last_day
          FROM x_posts WHERE x_posted_at IS NOT NULL
    """)
    age = _age_min((r or {}).get("last_at"))
    rows.append({
        "key": "x_feed", "name": "X · @luxquantalgo",
        "note": "the automated feed",
        "last_at": (r or {}).get("last_at").isoformat() if (r or {}).get("last_at") else None,
        "age_min": age, "last_hour": None,
        "last_day": (r or {}).get("last_day") or 0, "queue": 0,
        "verdict": _verdict(age, 120, 300, 0),
        "expect": "up to 48 a day",
    })

    # ---- posts given up on ------------------------------------------------
    # Was seven in two hours on 2026-09-08, every one of them healthy: an
    # outage was being counted as a defect in the post. Anything above zero
    # here is a milestone nobody will ever see, so it is worth a number of its
    # own rather than being buried in a log.
    d = _one(db, """
        SELECT count(*) AS n,
               count(*) FILTER (WHERE last_attempt_at > now() - interval '24 hours') AS today
          FROM x_post_failures WHERE attempt_count >= 3
    """)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
        "dropped_total": (d or {}).get("n") or 0,
        "dropped_today": (d or {}).get("today") or 0,
    }
