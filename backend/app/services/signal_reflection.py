"""
LuxQuant Signal Brain — Daily Reflection (BTCUSDT)
====================================================
Learning loop for **BTC trading signals only**. Separate from Compass reflection.

Runs daily (systemd) and:
  1. Measures cohorts on resolved BTCUSDT signals over multi-windows
     (30d / 90d / all_time): by risk_level, by important tag, overall.
  2. Upserts LESSONS in the signal Obsidian vault with lifecycle:
       n>=MIN_EVIDENCE and hit<=AVOID_PCT  -> avoid lesson
       n>=MIN_EVIDENCE and hit>=FAVOR_PCT  -> favor lesson
       candidate -> validated at n>=VALIDATE_N
       drifts to coin-flip                   -> retired
  3. Writes POSTMORTEM notes for recent SL / closed_loss.
  4. Writes MONTHLY scorecards (retrace months of history).
  5. Refreshes vault README index.

Manual:
    python3 -m app.services.signal_reflection
    python3 -m app.services.signal_reflection --backfill
    python3 -m app.services.signal_reflection --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import text

from app.core.database import SessionLocal
from app.services import signal_brain as brain

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Multi-window: reactive + stable + full history (retrace months)
WINDOWS = {
    "30d": 30,
    "90d": 90,
    "all": None,  # no date filter
}

MIN_EVIDENCE = 8
VALIDATE_N = 15
AVOID_PCT = 45
FAVOR_PCT = 72
RETIRE_LOW, RETIRE_HIGH = 50, 62

# Wins = any TP / closed_win; losses = SL / closed_loss
WIN_STATUSES = ("closed_win", "tp1", "tp2", "tp3", "tp4")
LOSS_STATUSES = ("closed_loss", "sl")
RESOLVED_STATUSES = WIN_STATUSES + LOSS_STATUSES


def _pair() -> str:
    return brain.PAIR


# ════════════════════════════════════════════════════════════════════
# Cohort SQL
# ════════════════════════════════════════════════════════════════════

def _date_clause(days: int | None, alias: str = "s") -> str:
    if days is None:
        return "TRUE"
    # created_at is stored as text ISO in this schema
    return f"({alias}.created_at)::timestamptz >= NOW() - INTERVAL '{int(days)} days'"


def _overall_cohort(db, days: int | None) -> dict:
    row = db.execute(
        text(
            f"""
        SELECT
            COUNT(*) FILTER (WHERE LOWER(status) IN ('closed_win','tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE LOWER(status) IN ('closed_loss','sl')) AS losses
        FROM signals s
        WHERE s.pair = :pair
          AND LOWER(status) IN ('closed_win','tp1','tp2','tp3','tp4','closed_loss','sl')
          AND {_date_clause(days)}
        """
        ),
        {"pair": _pair()},
    ).one()
    return {"key": "overall", "wins": int(row.wins or 0), "losses": int(row.losses or 0)}


def _risk_cohorts(db, days: int | None) -> list[dict]:
    rows = db.execute(
        text(
            f"""
        SELECT
            COALESCE(NULLIF(TRIM(s.risk_level), ''), 'unknown') AS key,
            COUNT(*) FILTER (WHERE LOWER(s.status) IN ('closed_win','tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE LOWER(s.status) IN ('closed_loss','sl')) AS losses
        FROM signals s
        WHERE s.pair = :pair
          AND LOWER(s.status) IN ('closed_win','tp1','tp2','tp3','tp4','closed_loss','sl')
          AND {_date_clause(days)}
        GROUP BY 1
        """
        ),
        {"pair": _pair()},
    ).all()
    return [{"key": str(k), "wins": int(w or 0), "losses": int(l or 0)} for k, w, l in rows]


def _tag_cohorts(db, days: int | None, min_n: int = 5) -> list[dict]:
    """Important tags only; skip empty."""
    rows = db.execute(
        text(
            f"""
        SELECT
            t->>'name' AS key,
            COUNT(*) FILTER (WHERE LOWER(s.status) IN ('closed_win','tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE LOWER(s.status) IN ('closed_loss','sl')) AS losses
        FROM signals s
        JOIN signal_enrichment e ON e.signal_id = s.signal_id,
             jsonb_array_elements(
                 COALESCE(
                     e.entry_snapshot->'facts'->'tags_annotated',
                     e.entry_snapshot->'tags_annotated',
                     '[]'::jsonb
                 )
             ) AS t
        WHERE s.pair = :pair
          AND LOWER(s.status) IN ('closed_win','tp1','tp2','tp3','tp4','closed_loss','sl')
          AND COALESCE((t->>'important')::boolean, false) = true
          AND NULLIF(TRIM(t->>'name'), '') IS NOT NULL
          AND {_date_clause(days)}
        GROUP BY 1
        HAVING COUNT(*) >= :min_n
        ORDER BY COUNT(*) DESC
        LIMIT 40
        """
        ),
        {"pair": _pair(), "min_n": min_n},
    ).all()
    return [{"key": str(k), "wins": int(w or 0), "losses": int(l or 0)} for k, w, l in rows if k]


def _monthly_stats(db) -> list[dict]:
    rows = db.execute(
        text(
            """
        SELECT
            to_char((s.created_at)::timestamptz, 'YYYY-MM') AS ym,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE LOWER(s.status) IN ('closed_win','tp1','tp2','tp3','tp4')) AS wins,
            COUNT(*) FILTER (WHERE LOWER(s.status) IN ('closed_loss','sl')) AS losses,
            COUNT(*) FILTER (WHERE LOWER(s.status) = 'open') AS open_n,
            ROUND(AVG(s.peak_pct)::numeric, 2) AS avg_peak
        FROM signals s
        WHERE s.pair = :pair
        GROUP BY 1
        ORDER BY 1
        """
        ),
        {"pair": _pair()},
    ).mappings().all()
    out = []
    for r in rows:
        wins = int(r["wins"] or 0)
        losses = int(r["losses"] or 0)
        scored = wins + losses
        out.append(
            {
                "ym": r["ym"],
                "total": int(r["total"] or 0),
                "wins": wins,
                "losses": losses,
                "open": int(r["open_n"] or 0),
                "avg_peak": float(r["avg_peak"] or 0) if r["avg_peak"] is not None else None,
                "hit_rate": round(100 * wins / scored, 1) if scored else None,
            }
        )
    return out


# ════════════════════════════════════════════════════════════════════
# Lifecycle
# ════════════════════════════════════════════════════════════════════

def _lifecycle(cohort: dict, existing_status: str | None) -> tuple[str | None, str | None]:
    scored = cohort["wins"] + cohort["losses"]
    if scored < MIN_EVIDENCE:
        return None, None
    hit = 100 * cohort["wins"] / scored
    if hit <= AVOID_PCT:
        direction = "avoid"
    elif hit >= FAVOR_PCT:
        direction = "favor"
    else:
        if existing_status in ("candidate", "validated") and RETIRE_LOW <= hit <= RETIRE_HIGH:
            return "retired", None
        return None, None
    status = "validated" if scored >= VALIDATE_N else "candidate"
    if existing_status == "validated" and status == "candidate":
        status = "validated"
    if existing_status == "core":
        status = "core"
    # promote long strong evidence
    if status == "validated" and scored >= 40 and (hit <= 40 or hit >= 78):
        status = "core"
    return status, direction


def _prompt_line(kind: str, key: str, direction: str, hit: int, n: int, window: str) -> str:
    win_label = window if window != "all" else "all history"
    if kind == "tag":
        subject = f"tag `{key}`"
    elif kind == "risk":
        subject = f"risk={key}"
    else:
        subject = "BTCUSDT signals overall"
    if direction == "avoid":
        return (
            f"AVOID {subject} on BTC signals ({win_label}): "
            f"only {hit}% win rate over {n} resolved calls."
        )
    return (
        f"FAVOR {subject} on BTC signals ({win_label}): "
        f"{hit}% win rate over {n} resolved calls — lean in when confluence agrees."
    )


def _safe_id(prefix: str, key: str, window: str) -> str:
    raw = f"{prefix}_{key}_{window}".lower()
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in raw)[:80]


# ════════════════════════════════════════════════════════════════════
# Postmortems
# ════════════════════════════════════════════════════════════════════

def _write_postmortems(db, dry_run: bool) -> int:
    rows = db.execute(
        text(
            """
        SELECT
            s.signal_id, s.pair, s.status, s.risk_level, s.entry,
            s.target1, s.stop1, s.peak_pct, s.peak_price, s.created_at,
            s.risk_reasons
        FROM signals s
        WHERE s.pair = :pair
          AND LOWER(s.status) IN ('closed_loss', 'sl')
          AND (s.created_at)::timestamptz >= NOW() - INTERVAL '45 days'
        ORDER BY (s.created_at)::timestamptz DESC
        LIMIT 80
        """
        ),
        {"pair": _pair()},
    ).mappings().all()

    written = 0
    for row in rows:
        sid = str(row["signal_id"])
        meta = {
            "id": sid,
            "kind": "postmortem",
            "pair": row["pair"],
            "status": row["status"],
            "risk_level": row["risk_level"] or "",
            "peak_pct": row["peak_pct"] if row["peak_pct"] is not None else "",
            "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
        body = (
            f"\n# Postmortem — {sid[:8]}… BTCUSDT\n\n"
            f"- Called: {row['created_at']} | risk={row['risk_level']}\n"
            f"- Geometry: entry {row['entry']} → TP1 {row['target1']} / SL {row['stop1']}\n"
            f"- Outcome: {row['status']} | peak {row['peak_pct']}% @ {row['peak_price']}\n"
            f"- Risk notes: {row['risk_reasons'] or 'n/a'}\n"
            f"- Lesson links: [[lessons/risk_{str(row['risk_level'] or 'unknown').lower()}_90d]]\n"
        )
        if dry_run:
            written += 1
            continue
        if brain.write_postmortem(sid, meta, body):
            written += 1
    return written


# ════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════

def reflect(dry_run: bool = False, backfill: bool = False) -> dict:
    summary = {
        "pair": _pair(),
        "lessons_upserted": 0,
        "lessons_retired": 0,
        "postmortems": 0,
        "months": 0,
        "windows": list(WINDOWS.keys()),
    }
    if not brain.vault_available():
        logger.warning("Signal brain vault %s not writable", brain.BRAIN_DIR)
        return summary

    existing = {str(m.get("id")): m for m in brain.list_lessons()}
    db = SessionLocal()
    try:
        windows = WINDOWS.items()
        for window, days in windows:
            # overall
            cohorts = [
                ("overall", _overall_cohort(db, days)),
                *[("risk", c) for c in _risk_cohorts(db, days)],
                *[("tag", c) for c in _tag_cohorts(db, days)],
            ]
            for kind, cohort in cohorts:
                if not cohort or not cohort.get("key"):
                    continue
                lesson_id = _safe_id(kind, str(cohort["key"]), window)
                prev = str(existing.get(lesson_id, {}).get("status") or "") or None
                status, direction = _lifecycle(cohort, prev)
                if status is None:
                    continue
                scored = cohort["wins"] + cohort["losses"]
                hit = round(100 * cohort["wins"] / scored) if scored else 0
                if status == "retired":
                    summary["lessons_retired"] += 1
                    line = existing.get(lesson_id, {}).get("prompt_line", "")
                else:
                    summary["lessons_upserted"] += 1
                    line = _prompt_line(kind, str(cohort["key"]), direction, hit, scored, window)
                logger.info(
                    "%s lesson %s -> %s (%s, %dW/%dL @ %s)",
                    "DRY" if dry_run else "UPSERT",
                    lesson_id,
                    status,
                    direction,
                    cohort["wins"],
                    cohort["losses"],
                    window,
                )
                if not dry_run:
                    brain.upsert_lesson(
                        lesson_id,
                        status=status,
                        window=window,
                        prompt_line=str(line),
                        wins=cohort["wins"],
                        losses=cohort["losses"],
                        kind=f"signal_{kind}",
                        extra={"cohort_key": str(cohort["key"]), "direction": direction or ""},
                    )

        # postmortems (recent losses)
        summary["postmortems"] = _write_postmortems(db, dry_run)

        # monthly scorecards — always on daily run; --backfill forces full rewrite
        months = _monthly_stats(db)
        for m in months:
            ym = m["ym"]
            if not ym:
                continue
            # daily run still updates all months (cheap, ~2y of BTC rows)
            body = (
                f"\n# {ym} — {_pair()} signals\n\n"
                f"| Metric | Value |\n|--------|-------|\n"
                f"| Total calls | {m['total']} |\n"
                f"| Wins (TP/closed_win) | {m['wins']} |\n"
                f"| Losses (SL) | {m['losses']} |\n"
                f"| Still open | {m['open']} |\n"
                f"| Hit rate | {m['hit_rate'] if m['hit_rate'] is not None else 'n/a'}% |\n"
                f"| Avg peak % | {m['avg_peak'] if m['avg_peak'] is not None else 'n/a'} |\n\n"
                f"Auto-written by signal_reflection"
                f"{' (backfill)' if backfill else ''}.\n"
            )
            if not dry_run:
                brain.write_month(
                    ym,
                    {
                        "total": m["total"],
                        "wins": m["wins"],
                        "losses": m["losses"],
                        "open": m["open"],
                        "hit_rate": m["hit_rate"] if m["hit_rate"] is not None else "",
                        "avg_peak": m["avg_peak"] if m["avg_peak"] is not None else "",
                    },
                    body,
                )
            summary["months"] += 1

        if not dry_run:
            lessons = brain.list_lessons()
            index = [
                f"\n# Signal Brain — {_pair()}\n",
                "BTC trading-signal memory (separate from Compass projection brain).\n",
                "## Active lessons\n",
            ]
            for m in lessons:
                if str(m.get("status")) == "retired":
                    continue
                index.append(
                    f"- [[lessons/{m['id']}|{m['id']}]] — {m.get('status')} · "
                    f"{m.get('hit_rate')}% over {m.get('evidence_n')} · window={m.get('window')}"
                )
            index.append("\n## Months (retrace)\n")
            for m in brain.list_months(24):
                index.append(
                    f"- [[months/{m['id']}|{m['id']}]] — hit {m.get('hit_rate')}% · "
                    f"{m.get('wins')}W/{m.get('losses')}L"
                )
            index.append(
                "\n## Folders\n"
                "- lessons/ — rules from resolved BTC signals\n"
                "- postmortems/ — SL autopsies\n"
                "- months/ — monthly scorecards (multi-month retrace)\n"
            )
            brain.write_index("\n".join(index))
    finally:
        db.close()

    logger.info("Signal reflection summary: %s", summary)
    return summary


def cli() -> None:
    parser = argparse.ArgumentParser(description="BTC signal brain daily reflection")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Rewrite all monthly scorecards from full history (same as daily for months).",
    )
    args = parser.parse_args()
    print(json.dumps(reflect(dry_run=args.dry_run, backfill=args.backfill), indent=2, default=str))


if __name__ == "__main__":
    cli()
