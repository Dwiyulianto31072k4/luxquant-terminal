"""Walk-forward of the Runners rule: the calls the Runners topic WOULD have
posted, decided day by day with only what was known at the time.

Why this exists. The Runners briefing showed "runner tags vs no filter" over
all history: today's four tags, chosen because they did best on that same
history, and no Edge cut. Flattering by construction, and not the rule the
topic runs. This replays the whole rule the way the topic runs it:

  * the context as it stood at the start of each UTC day — outcomes reached and
    entry snapshots written before then (edge_lab.edge_context / tag_wr_stats
    with `as_of`, the same code the live score uses);
  * the runner tags that context selects (hunt_recipe.select_runner_tags);
  * the trailing seven-day Edge book scored with that context
    (signal_screen.score_book), holding only the calls already enriched when
    each call was decided;
  * a Runner is a call carrying one of those tags whose score clears the top
    20% of that book (signal_screen._percentile_cut) — and, like the topic,
    only if it had not already stopped out or completed when decided.

Only calls whose entry snapshot was written within MAX_AGE_MIN of the call are
decided: the topic skips anything older, and before 9 June nearly every
snapshot was a bulk backfill written up to 90 days late — there is no honest
decision to replay before START_DAY.

Two approximations, both small:
  * the context is taken once a day (00:00 UTC); the topic's refreshes every
    few minutes, so a call decided late in a day misses that day's outcomes;
  * a tag's median peak (signals.peak_pct) is peak-to-date, not as-of, so it is
    withheld here; the runner gate only falls back to it for a tag with
    full-TP under 12% and TP4 under 5%. Each day records whether withholding
    it changed the four tags (peak_changed) instead of assuming it never does.

Oneshot, nightly. A day is decided once and stored; --recompute redoes it.

    python -m app.workers.runner_walkforward                  # new days to yesterday
    python -m app.workers.runner_walkforward --from 2026-06-10 --to 2026-06-12 --dry-run
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

from app.core.database import SessionLocal

START_DAY = date(2026, 6, 10)
MAX_AGE_MIN = 60  # runner_call_poster.MAX_AGE_MIN: older calls are never decided
MIN_N = 40


def _log(msg: str) -> None:
    print(f"[runner-walkforward] {msg}", flush=True)


def ensure_tables(db) -> None:
    """Created here, never on an API import path (DDL there once locked users)."""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS runner_walkforward_calls (
            signal_id   TEXT PRIMARY KEY,
            day         DATE NOT NULL,
            runner      BOOLEAN NOT NULL,
            score       REAL,
            cut         REAL,
            book_n      INT,
            hit_tags    TEXT[],
            reason      TEXT,
            decided_at  TIMESTAMPTZ
        )
    """))
    db.execute(text(
        "CREATE INDEX IF NOT EXISTS runner_walkforward_calls_day ON runner_walkforward_calls (day)"))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS runner_walkforward_days (
            day           DATE PRIMARY KEY,
            runner_tags   TEXT[],
            peak_changed  BOOLEAN NOT NULL DEFAULT FALSE,
            calls         INT NOT NULL,
            runners       INT NOT NULL,
            computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    db.commit()


def _as_of(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)


def decide_day(db, day: date):
    """(day summary, [decision rows]) for calls made on `day`, point-in-time."""
    from app.api.routes.edge_lab import TAG_METRICS_ERA_START, edge_context, tag_wr_stats
    from app.services.hunt_recipe import select_runner_tags
    from app.services.signal_screen import (
        BOOK_SCORE_COLUMNS, RUNNERS_EDGE_TOP, _percentile_cut, score_book)

    as_of = _as_of(day).isoformat()
    start_str, end_str = TAG_METRICS_ERA_START.isoformat(), (day - timedelta(days=1)).isoformat()
    ctx = edge_context(db, start_str, end_str, MIN_N, as_of=as_of)
    _, tw = tag_wr_stats(db, start_str, end_str, MIN_N, as_of=as_of)
    blind = [{**t, "median_peak": None, "median_peak_wins": None} for t in tw]
    runner_tags = [t["tag"] for t in select_runner_tags(blind)]
    peak_changed = runner_tags != [t["tag"] for t in select_runner_tags(tw)]

    rows = db.execute(text("""
        WITH closes AS (
            SELECT signal_id, min(update_at::timestamptz) AS closed_at
            FROM signal_updates
            WHERE lower(update_type) LIKE '%tp4%' OR lower(update_type) LIKE '%target 4%'
               OR ((lower(update_type) LIKE '%sl%' OR lower(update_type) LIKE '%stop%')
                   AND lower(update_type) !~ '(tp|target )[1-3]')
            GROUP BY signal_id
        )
        SELECT """ + BOOK_SCORE_COLUMNS + """,
               (e.entry_snapshot->>'computed_at')::timestamptz AS snap_at,
               c.closed_at,
               s.created_at::timestamptz AS created_ts
        FROM signals s
        JOIN signal_enrichment e ON e.signal_id = s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
        LEFT JOIN closes c ON c.signal_id = s.signal_id
        WHERE s.created_at::timestamptz >= CAST(:book_start AS timestamptz)
          AND s.created_at::timestamptz < CAST(:day_end AS timestamptz)
          AND e.entry_snapshot->>'computed_at' IS NOT NULL
    """), {"book_start": (_as_of(day) - timedelta(days=7)).isoformat(),
           "day_end": (_as_of(day) + timedelta(days=1)).isoformat()}).fetchall()

    summary = {"day": day, "runner_tags": runner_tags, "peak_changed": peak_changed,
               "calls": 0, "runners": 0}
    if not ctx["tags"] or not rows:
        return summary, []

    scored = score_book(db, [r[:17] for r in rows], ctx["tags"], ctx["prefer_tags"],
                        ctx["baseline"].get("win_rate") or 0,
                        {"start": start_str, "end": end_str}, as_of=as_of)
    score_of = {str(r["signal_id"]): r["score"] for r in scored}
    # (snapshot time, score) for everything scorable, so each decision sees
    # the book exactly as far as it had been enriched by then.
    book = sorted((r[17], score_of.get(str(r[0]))) for r in rows
                  if score_of.get(str(r[0])) is not None)

    decisions = []
    day_start, day_end = _as_of(day), _as_of(day) + timedelta(days=1)
    for r in rows:
        sid, tags = str(r[0]), list(r[16] or [])
        snap_at, closed_at, created = r[17], r[18], r[19]
        if not (day_start <= created < day_end):
            continue
        if (snap_at - created).total_seconds() > MAX_AGE_MIN * 60:
            continue  # the topic never decides a call this late
        score = score_of.get(sid)
        seen = sorted((sc for at, sc in book if at <= snap_at), reverse=True)
        cut = _percentile_cut(seen, RUNNERS_EDGE_TOP)
        hit = [t for t in tags if t in runner_tags]
        runner, reason = bool(hit) and score is not None and (cut is None or score >= cut), None
        if runner and closed_at is not None and closed_at <= snap_at:
            runner, reason = False, "closed before decided"
        decisions.append({"sid": sid, "day": day, "runner": runner, "score": score, "cut": cut,
                          "book_n": len(seen), "hit": hit, "reason": reason, "at": snap_at})
    summary["calls"] = len(decisions)
    summary["runners"] = sum(d["runner"] for d in decisions)
    return summary, decisions


def store(db, summary, decisions) -> None:
    for d in decisions:
        db.execute(text("""
            INSERT INTO runner_walkforward_calls
                (signal_id, day, runner, score, cut, book_n, hit_tags, reason, decided_at)
            VALUES (:sid, :day, :runner, :score, :cut, :book_n, :hit, :reason, :at)
            ON CONFLICT (signal_id) DO UPDATE SET
                day = EXCLUDED.day, runner = EXCLUDED.runner, score = EXCLUDED.score,
                cut = EXCLUDED.cut, book_n = EXCLUDED.book_n, hit_tags = EXCLUDED.hit_tags,
                reason = EXCLUDED.reason, decided_at = EXCLUDED.decided_at
        """), d)
    db.execute(text("""
        INSERT INTO runner_walkforward_days (day, runner_tags, peak_changed, calls, runners, computed_at)
        VALUES (:day, :runner_tags, :peak_changed, :calls, :runners, now())
        ON CONFLICT (day) DO UPDATE SET
            runner_tags = EXCLUDED.runner_tags, peak_changed = EXCLUDED.peak_changed,
            calls = EXCLUDED.calls, runners = EXCLUDED.runners, computed_at = now()
    """), summary)
    db.commit()


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=date.fromisoformat)
    ap.add_argument("--to", dest="end", type=date.fromisoformat)
    ap.add_argument("--recompute", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    db = SessionLocal()
    try:
        done = set()
        if not args.dry_run:
            ensure_tables(db)
            done = {r[0] for r in db.execute(text("SELECT day FROM runner_walkforward_days")).fetchall()}
        day = max(args.start or START_DAY, START_DAY)
        end = min(args.end or yesterday, yesterday)
        while day <= end:
            if day in done and not args.recompute:
                day += timedelta(days=1)
                continue
            t0 = time.time()
            summary, decisions = decide_day(db, day)
            db.rollback()  # decide_day only reads; end its transaction either way
            if not args.dry_run:
                store(db, summary, decisions)
            _log(f"{day} tags={summary['runner_tags']} peak_changed={summary['peak_changed']} "
                 f"calls={summary['calls']} runners={summary['runners']} ({time.time() - t0:.1f}s)"
                 + (" [dry run]" if args.dry_run else ""))
            day += timedelta(days=1)
    finally:
        db.close()


if __name__ == "__main__":
    main(sys.argv[1:])
