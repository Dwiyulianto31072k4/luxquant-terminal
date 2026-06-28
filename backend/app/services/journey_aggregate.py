"""
LuxQuant — Platform-wide Journey Aggregate (incremental materialization)
========================================================================
Problem:
    /journey-insights/ALL needs "average time-to-TP across EVERY call" over
    tens of thousands of signals. Computing that synchronously on each request
    walks every signal's events → far too heavy / hangs the request.

Design (incremental, append-only):
    1. Backfill once: fold every existing journey row into a running
       accumulator (sum/count/min/max per TP, etc.), and record each
       signal_id in a `journey_agg_processed` table (the watermark).
    2. Every hour: pick up ONLY signals not yet processed, fold them into the
       accumulator, mark them processed. Cheap — just the new ones.
    3. The accumulator lives in Postgres (NOT Redis — deploy flushes Redis).
    4. The API endpoint only READS the accumulator and formats it → instant.

Concurrency:
    uvicorn runs multiple workers; each starts the loop. A Postgres advisory
    lock guarantees only one worker folds at a time, so no double counting.

Only the fields the landing "Time to Target" card needs are materialized:
    time_to_each_tp, entry_behavior(tp1), peak_potential.avg_peak_excursion_pct,
    risk_profile.avg_time_in_profit_pct, sample_size, pairs_covered.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.services.journey_insights import (
    MIN_SAMPLE_SIZE,
    _format_duration,
    _find_event,
    _parse_iso,
    _round_or_none,
)

logger = logging.getLogger(__name__)

# Single-runner guard across uvicorn workers.
LOCK_KEY = 778455123
# Bump when the accumulator shape changes → forces a one-time re-backfill so
# old processed rows get re-folded into the new fields.
ACC_VERSION = 5
# Hourly cadence + small startup delay so it never blocks readiness probes.
REFRESH_INTERVAL_SECONDS = 3600
STARTUP_DELAY_SECONDS = 20
BATCH_SIZE = 2000
MAX_BATCHES_PER_REFRESH = 30  # up to 60k rows folded per refresh pass

_TPS = ("TP1", "TP2", "TP3", "TP4")
_BUCKETS = ("TP1", "TP2", "TP3", "TP4", "SL")  # final-outcome buckets for avg P/L

_DDL_STATE = """
CREATE TABLE IF NOT EXISTS journey_agg_state (
    id INTEGER PRIMARY KEY,
    acc JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
)
"""
_DDL_PROCESSED = """
CREATE TABLE IF NOT EXISTS journey_agg_processed (
    signal_id TEXT PRIMARY KEY
)
"""
_SELECT_UNPROCESSED = text("""
    SELECT j.signal_id, j.events, j.time_to_tp1_seconds,
           j.missed_potential_pct, j.pct_time_above_entry, s.pair,
           j.overall_mfe_pct, s.status
    FROM signal_journey j
    INNER JOIN signals s ON s.signal_id = j.signal_id
    LEFT JOIN journey_agg_processed p ON p.signal_id = j.signal_id
    WHERE j.coverage_status != 'unavailable'
      AND p.signal_id IS NULL
    LIMIT :batch
""")


# ════════════════════════════════════════════════════════════
# Accumulator shape helpers
# ════════════════════════════════════════════════════════════

def _blank_acc() -> Dict[str, Any]:
    return {
        "v": ACC_VERSION,
        "sample_size": 0,
        "pairs": set(),
        "tp": {t: {"sum": 0.0, "count": 0, "min": None, "max": None} for t in _TPS},
        "tp1_entry": {"sum": 0.0, "count": 0, "min": None},
        "missed": {"sum": 0.0, "count": 0},
        "time_above": {"sum": 0.0, "count": 0},
        # avg realized P/L per final-outcome bucket (TP1–4, SL)
        "pnl": {b: {"sum": 0.0, "count": 0} for b in _BUCKETS},
    }


def _normalize(raw: Dict[str, Any] | None) -> Dict[str, Any]:
    a = _blank_acc()
    if not raw:
        return a
    a["sample_size"] = raw.get("sample_size", 0) or 0
    a["pairs"] = set(raw.get("pairs", []) or [])
    raw_tp = raw.get("tp") or {}
    for t in _TPS:
        b = raw_tp.get(t) or {}
        a["tp"][t] = {
            "sum": b.get("sum", 0.0) or 0.0,
            "count": b.get("count", 0) or 0,
            "min": b.get("min"),
            "max": b.get("max"),
        }
    e = raw.get("tp1_entry") or {}
    a["tp1_entry"] = {"sum": e.get("sum", 0.0) or 0.0, "count": e.get("count", 0) or 0, "min": e.get("min")}
    for k in ("missed", "time_above"):
        b = raw.get(k) or {}
        a[k] = {"sum": b.get("sum", 0.0) or 0.0, "count": b.get("count", 0) or 0}
    raw_pnl = raw.get("pnl") or {}
    for bk in _BUCKETS:
        x = raw_pnl.get(bk) or {}
        a["pnl"][bk] = {"sum": x.get("sum", 0.0) or 0.0, "count": x.get("count", 0) or 0}
    a["v"] = raw.get("v", 1)
    return a


def _bucket(status: str | None, events) -> str | None:
    """Final-outcome bucket for a signal: TP1–4 or SL (None if still open)."""
    st = (status or "").lower()
    if st == "open":
        return None
    if st in ("closed_loss", "sl"):
        return "SL"
    if st in ("tp1", "tp2", "tp3"):
        return st.upper()
    if st in ("closed_win", "tp4"):
        for tp in ("tp4", "tp3", "tp2", "tp1"):
            if _find_event(events, tp):
                return tp.upper()
    return None


def _serialize(a: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(a)
    out["pairs"] = sorted(a["pairs"])
    return out


# ════════════════════════════════════════════════════════════
# Table + state IO
# ════════════════════════════════════════════════════════════

def ensure_tables(db: Session) -> None:
    db.execute(text(_DDL_STATE))
    db.execute(text(_DDL_PROCESSED))
    db.execute(text(
        "INSERT INTO journey_agg_state (id, acc) VALUES (1, '{}'::jsonb) "
        "ON CONFLICT (id) DO NOTHING"
    ))
    db.commit()


def _load_raw(db: Session) -> Dict[str, Any] | None:
    row = db.execute(text("SELECT acc FROM journey_agg_state WHERE id = 1")).fetchone()
    return row[0] if row and row[0] else None


def _save_acc(db: Session, acc: Dict[str, Any]) -> None:
    db.execute(
        text(
            "INSERT INTO journey_agg_state (id, acc, updated_at) "
            "VALUES (1, CAST(:acc AS jsonb), now()) "
            "ON CONFLICT (id) DO UPDATE SET acc = CAST(:acc AS jsonb), updated_at = now()"
        ),
        {"acc": json.dumps(_serialize(acc))},
    )


def _mark_processed(db: Session, ids: List[str]) -> None:
    if not ids:
        return
    db.execute(
        text("INSERT INTO journey_agg_processed (signal_id) VALUES (:sid) ON CONFLICT DO NOTHING"),
        [{"sid": s} for s in ids],
    )


# ════════════════════════════════════════════════════════════
# Folding
# ════════════════════════════════════════════════════════════

def _fold(acc: Dict[str, Any], rows) -> None:
    for r in rows:
        events = r[1] or []
        tp1s, missed, tabove, pair = r[2], r[3], r[4], r[5]
        mfe, status = r[6], r[7]

        acc["sample_size"] += 1
        if pair:
            acc["pairs"].add(pair)

        # avg gain per final-outcome bucket:
        #   TP1–TP3 → the actual % reached at that TP (realized gain).
        #   TP4     → peak gain (overall_mfe_pct); TP4 is the final target, so
        #             these runners usually blow through it. Falls back to TP4 %.
        #   SL      → the loss recorded at the SL event.
        bk = _bucket(status, events)
        if bk:
            if bk == "SL":
                ev = _find_event(events, "sl")
                pctv = ev.get("pct") if ev else None
            elif bk == "TP4":
                if mfe is not None:
                    pctv = mfe
                else:
                    ev = _find_event(events, "tp4")
                    pctv = ev.get("pct") if ev else None
            else:  # TP1, TP2, TP3 → the actual TP level reached
                ev = _find_event(events, bk.lower())
                pctv = ev.get("pct") if ev else None
            if pctv is not None:
                pb = acc["pnl"][bk]
                pb["sum"] += pctv
                pb["count"] += 1

        entry = _find_event(events, "entry")
        entry_at = _parse_iso(entry.get("at")) if entry else None
        if entry_at is not None:
            for tp in ("tp1", "tp2", "tp3", "tp4"):
                ev = _find_event(events, tp)
                if not ev:
                    continue
                tp_at = _parse_iso(ev.get("at"))
                if tp_at is None:
                    continue
                delta = (tp_at - entry_at).total_seconds()
                if delta > 0:
                    b = acc["tp"][tp.upper()]
                    b["sum"] += delta
                    b["count"] += 1
                    b["min"] = delta if b["min"] is None else min(b["min"], delta)
                    b["max"] = delta if b["max"] is None else max(b["max"], delta)

        if tp1s and tp1s > 0:
            e = acc["tp1_entry"]
            e["sum"] += tp1s
            e["count"] += 1
            e["min"] = tp1s if e["min"] is None else min(e["min"], tp1s)

        if missed is not None:
            acc["missed"]["sum"] += missed
            acc["missed"]["count"] += 1
        if tabove is not None:
            acc["time_above"]["sum"] += tabove
            acc["time_above"]["count"] += 1


def refresh(db: Session, batch: int = BATCH_SIZE, max_batches: int = MAX_BATCHES_PER_REFRESH) -> Dict[str, Any]:
    """
    Fold not-yet-processed journey rows into the accumulator.
    Guarded by a Postgres advisory lock so only one worker runs at a time.
    Returns {"ran": bool, "processed": int}.
    """
    got = db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY}).scalar()
    if not got:
        return {"ran": False, "processed": 0}

    try:
        ensure_tables(db)
        raw = _load_raw(db)
        if (raw or {}).get("v", 1) != ACC_VERSION:
            # accumulator shape changed → wipe + re-backfill from scratch
            db.execute(text("TRUNCATE journey_agg_processed"))
            db.execute(text("UPDATE journey_agg_state SET acc = '{}'::jsonb WHERE id = 1"))
            db.commit()
            acc = _blank_acc()
        else:
            acc = _normalize(raw)
        total = 0
        for _ in range(max_batches):
            rows = db.execute(_SELECT_UNPROCESSED, {"batch": batch}).fetchall()
            if not rows:
                break
            _fold(acc, rows)
            _mark_processed(db, [r[0] for r in rows])
            _save_acc(db, acc)
            db.commit()
            total += len(rows)
            if len(rows) < batch:
                break
        return {"ran": True, "processed": total}
    finally:
        db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
        db.commit()


# ════════════════════════════════════════════════════════════
# Read path (API)
# ════════════════════════════════════════════════════════════

def get_result(db: Session) -> Dict[str, Any]:
    """Format the materialized accumulator into the journey-insights shape."""
    try:
        ensure_tables(db)
        a = _normalize(_load_raw(db))
    except Exception as e:
        logger.exception(f"[journey_agg] get_result failed: {e}")
        return {"available": False, "reason": "query_failed", "pair": "ALL",
                "sample_size": 0, "min_required": MIN_SAMPLE_SIZE}

    if a["sample_size"] == 0:
        # Backfill hasn't run yet — frontend keeps its spinner.
        return {"available": False, "reason": "warming", "pair": "ALL",
                "sample_size": 0, "min_required": MIN_SAMPLE_SIZE}

    ttp = []
    for t in _TPS:
        b = a["tp"][t]
        c = b["count"]
        avg = (b["sum"] / c) if c else None
        ttp.append({
            "tp": t,
            "sample_size": c,
            "avg_seconds": int(avg) if avg else None,
            "avg_human": _format_duration(avg),
            "fastest_seconds": int(b["min"]) if b["min"] else None,
            "fastest_human": _format_duration(b["min"]),
            "slowest_seconds": int(b["max"]) if b["max"] else None,
            "slowest_human": _format_duration(b["max"]),
        })

    e = a["tp1_entry"]
    avg_tp1 = (e["sum"] / e["count"]) if e["count"] else None
    m, t2 = a["missed"], a["time_above"]

    # avg realized P/L per final-outcome bucket (TP1–4, SL)
    pnl = a["pnl"]
    hit_rate_per_tp = [
        {
            "tp": bk,
            "count": pnl[bk]["count"],
            "avg_exit_gain_pct": _round_or_none(
                (pnl[bk]["sum"] / pnl[bk]["count"]) if pnl[bk]["count"] else None
            ),
        }
        for bk in _BUCKETS
    ]

    return {
        "available": True,
        "pair": "ALL",
        "sample_size": a["sample_size"],
        "pairs_covered": len(a["pairs"]),
        "min_required": MIN_SAMPLE_SIZE,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "entry_behavior": {
            "avg_time_to_tp1_seconds": int(avg_tp1) if avg_tp1 else None,
            "avg_time_to_tp1_human": _format_duration(avg_tp1),
            "fastest_tp1_seconds": int(e["min"]) if e["min"] else None,
            "fastest_tp1_human": _format_duration(e["min"]),
        },
        "time_to_each_tp": ttp,
        "drawdown_before_each_tp": [],
        "hit_rate_per_tp": hit_rate_per_tp,
        "peak_potential": {
            "avg_peak_excursion_pct": _round_or_none((m["sum"] / m["count"]) if m["count"] else None),
            "avg_peak_excursion_sample": m["count"],
        },
        "risk_profile": {
            "avg_time_in_profit_pct": _round_or_none((t2["sum"] / t2["count"]) if t2["count"] else None, 1),
        },
    }


# ════════════════════════════════════════════════════════════
# Background worker
# ════════════════════════════════════════════════════════════

def _refresh_until_caught_up() -> int:
    """Sync helper (runs in a thread). Folds all pending rows in passes."""
    db = SessionLocal()
    processed_total = 0
    try:
        ensure_tables(db)
        for _ in range(10000):  # safety bound
            res = refresh(db)
            if not res.get("ran"):
                break  # another worker holds the lock
            n = res.get("processed", 0)
            processed_total += n
            if n == 0:
                break  # caught up
    finally:
        db.close()
    return processed_total


async def _loop() -> None:
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            n = await asyncio.to_thread(_refresh_until_caught_up)
            if n:
                logger.info(f"[journey_agg] folded {n} signal(s) into aggregate")
        except Exception as e:
            logger.exception(f"[journey_agg] refresh loop error: {e}")
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)


def start_journey_aggregate_worker() -> None:
    """Schedule the hourly incremental aggregate refresh (call from lifespan)."""
    asyncio.create_task(_loop())
