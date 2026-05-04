"""
LuxQuant - Journey Insights Aggregator
Layer 7: Per-pair aggregation of signal_journey data for History tab.

Purpose:
    Given a trading pair (e.g. NAORISUSDT), aggregate journey data across all
    its signals to surface patterns (entry behavior, per-TP stats, peak potential,
    risk profile).

Data sources:
    - signal_journey table (computed by Layer 4 worker)
    - signals table (joined for pair filter + status)

Output structure: see compute_insights() docstring.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Minimum sample size to surface insights (configurable)
MIN_SAMPLE_SIZE = 5

# TP types we care about
TP_TYPES = ["tp1", "tp2", "tp3", "tp4"]


# ════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════

def _format_duration(seconds: Optional[float]) -> Optional[str]:
    """Convert seconds to human-readable like '1h 23m' or '4m' or '2d 4h'."""
    if seconds is None or seconds <= 0:
        return None
    s = int(seconds)
    d = s // 86400
    h = (s % 86400) // 3600
    m = (s % 3600) // 60
    if d > 0:
        return f"{d}d {h}h" if h > 0 else f"{d}d"
    if h > 0:
        return f"{h}h {m}m" if m > 0 else f"{h}h"
    return f"{m}m"


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    """Parse ISO8601 string to UTC datetime; tolerate Z suffix."""
    if not s:
        return None
    try:
        if isinstance(s, datetime):
            return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
        s = s.replace("Z", "+00:00") if s.endswith("Z") else s
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def _avg(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def _round_or_none(v: Optional[float], digits: int = 2) -> Optional[float]:
    if v is None:
        return None
    return round(v, digits)


def _find_event(events: List[Dict[str, Any]], event_type: str) -> Optional[Dict[str, Any]]:
    """Find first occurrence of event with given type in events array."""
    if not events:
        return None
    for ev in events:
        if ev.get("type") == event_type:
            return ev
    return None


def _events_between(
    events: List[Dict[str, Any]], start_at: datetime, end_at: datetime
) -> List[Dict[str, Any]]:
    """Return events whose 'at' falls within [start_at, end_at]."""
    out = []
    for ev in events:
        ev_at = _parse_iso(ev.get("at"))
        if ev_at is None:
            continue
        if start_at <= ev_at <= end_at:
            out.append(ev)
    return out


def _min_pct_in_events(events: List[Dict[str, Any]]) -> Optional[float]:
    """Return min pct (most adverse) among events. Returns None if no events have pct."""
    pcts = [ev.get("pct") for ev in events if ev.get("pct") is not None]
    if not pcts:
        return None
    return min(pcts)


# ════════════════════════════════════════════════════════════
# Section computers
# ════════════════════════════════════════════════════════════

def _compute_entry_behavior(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Section 1: Entry Behavior
    - avg drawdown before TP1 (from initial_mae_pct where initial_mae_before='tp1')
    - smooth entry rate (% with no drawdown or > -0.5%)
    - avg time to TP1
    - fastest TP1
    """
    drawdowns_before_tp1 = [
        r["initial_mae_pct"]
        for r in rows
        if r.get("initial_mae_before") == "tp1" and r.get("initial_mae_pct") is not None
    ]

    smooth_entries = [
        1 for r in rows
        if r.get("initial_mae_before") == "tp1"
        and (r.get("initial_mae_pct") is None or r["initial_mae_pct"] > -0.5)
    ]
    rows_with_tp1 = [r for r in rows if r.get("initial_mae_before") == "tp1"]
    smooth_rate = (len(smooth_entries) / len(rows_with_tp1) * 100) if rows_with_tp1 else None

    tp1_times = [
        r["time_to_tp1_seconds"]
        for r in rows
        if r.get("time_to_tp1_seconds") is not None and r["time_to_tp1_seconds"] > 0
    ]
    avg_tp1 = _avg(tp1_times)
    fastest_tp1 = min(tp1_times) if tp1_times else None

    return {
        "avg_drawdown_before_tp1_pct": _round_or_none(_avg(drawdowns_before_tp1)),
        "avg_drawdown_before_tp1_sample": len(drawdowns_before_tp1),
        "smooth_entry_rate_pct": _round_or_none(smooth_rate, 1),
        "smooth_entry_count": len(smooth_entries),
        "smooth_entry_total": len(rows_with_tp1),
        "avg_time_to_tp1_seconds": int(avg_tp1) if avg_tp1 else None,
        "avg_time_to_tp1_human": _format_duration(avg_tp1),
        "fastest_tp1_seconds": int(fastest_tp1) if fastest_tp1 else None,
        "fastest_tp1_human": _format_duration(fastest_tp1),
    }


def _compute_time_to_each_tp(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Section 2: Time to each TP
    For each TP level: avg / fastest / slowest from entry → TP_N hit.
    """
    out = []
    for tp in TP_TYPES:
        deltas = []
        for r in rows:
            events = r.get("events") or []
            entry_ev = _find_event(events, "entry")
            tp_ev = _find_event(events, tp)
            if not entry_ev or not tp_ev:
                continue
            entry_at = _parse_iso(entry_ev.get("at"))
            tp_at = _parse_iso(tp_ev.get("at"))
            if entry_at is None or tp_at is None:
                continue
            delta = (tp_at - entry_at).total_seconds()
            if delta > 0:
                deltas.append(delta)

        if not deltas:
            out.append({
                "tp": tp.upper(),
                "sample_size": 0,
                "avg_seconds": None,
                "avg_human": None,
                "fastest_seconds": None,
                "fastest_human": None,
                "slowest_seconds": None,
                "slowest_human": None,
            })
            continue

        avg_s = _avg(deltas)
        out.append({
            "tp": tp.upper(),
            "sample_size": len(deltas),
            "avg_seconds": int(avg_s),
            "avg_human": _format_duration(avg_s),
            "fastest_seconds": int(min(deltas)),
            "fastest_human": _format_duration(min(deltas)),
            "slowest_seconds": int(max(deltas)),
            "slowest_human": _format_duration(max(deltas)),
        })
    return out


def _compute_drawdown_before_each_tp(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Section 3: Drawdown before each TP
    - Pre-TP1: from initial_mae_pct (already computed)
    - TP1 → TP2: lowest swing_low between TP1.at and TP2.at, pct from entry
    - TP2 → TP3: similar
    - TP3 → TP4: similar
    """
    phases = [
        ("Pre-TP1", None, "tp1"),
        ("TP1 → TP2", "tp1", "tp2"),
        ("TP2 → TP3", "tp2", "tp3"),
        ("TP3 → TP4", "tp3", "tp4"),
    ]
    out = []

    for label, prev_tp, next_tp in phases:
        dd_values = []

        for r in rows:
            if prev_tp is None:
                # Pre-TP1: use existing initial_mae_pct
                if r.get("initial_mae_before") == "tp1" and r.get("initial_mae_pct") is not None:
                    dd_values.append(r["initial_mae_pct"])
                continue

            # Between TPs: find swings between events
            events = r.get("events") or []
            prev_ev = _find_event(events, prev_tp)
            next_ev = _find_event(events, next_tp)
            if not prev_ev or not next_ev:
                continue

            prev_at = _parse_iso(prev_ev.get("at"))
            next_at = _parse_iso(next_ev.get("at"))
            if prev_at is None or next_at is None:
                continue

            in_window = _events_between(events, prev_at, next_at)
            # Find min pct (most adverse) among swing_low events in window
            swing_lows_pct = [
                ev.get("pct") for ev in in_window
                if ev.get("type") == "swing_low" and ev.get("pct") is not None
            ]
            if swing_lows_pct:
                # The drawdown between TPs = how far price retraced relative to entry
                # We use the MINIMUM swing pct (most adverse from entry perspective)
                min_pct = min(swing_lows_pct)
                # But this is pct from entry, not pct from prev_tp.
                # We want "how much did it pullback during this phase"
                # So compute relative to prev_tp pct:
                prev_pct = prev_ev.get("pct") or 0
                pullback = min_pct - prev_pct  # negative number (adverse)
                dd_values.append(pullback)

        if not dd_values:
            out.append({
                "phase": label,
                "sample_size": 0,
                "avg_dd_pct": None,
                "worst_dd_pct": None,
            })
            continue

        out.append({
            "phase": label,
            "sample_size": len(dd_values),
            "avg_dd_pct": _round_or_none(_avg(dd_values)),
            "worst_dd_pct": _round_or_none(min(dd_values)),
        })
    return out


def _compute_hit_rate_per_tp(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Section 4: Hit rate per TP
    - hit_count: signals where TP_N exists in events
    - hit_rate_pct: hit_count / total closed signals × 100
    - avg_exit_gain_pct: avg pct at TP_N event for signals that hit TP_N
    """
    # Count closed signals (status terminal: closed_win, closed_loss, tp4, sl)
    closed_rows = [r for r in rows if r.get("status") in ("closed_win", "closed_loss", "tp4", "sl")]
    closed_count = len(closed_rows)

    # Use closed_count if > 0, else fall back to total rows (for ongoing signals count)
    base_count = closed_count if closed_count > 0 else len(rows)

    out = []
    for tp in TP_TYPES:
        hit_signals = []
        for r in rows:
            events = r.get("events") or []
            tp_ev = _find_event(events, tp)
            if tp_ev and tp_ev.get("pct") is not None:
                hit_signals.append(tp_ev["pct"])

        hit_count = len(hit_signals)
        hit_rate = (hit_count / base_count * 100) if base_count > 0 else None
        avg_exit = _avg(hit_signals)

        out.append({
            "tp": tp.upper(),
            "hit_count": hit_count,
            "total_count": base_count,
            "hit_rate_pct": _round_or_none(hit_rate, 1),
            "avg_exit_gain_pct": _round_or_none(avg_exit),
        })
    return out


def _compute_peak_potential(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Section 5: Peak Potential
    - avg_peak_excursion = avg(missed_potential_pct) where not null
    - best_peak_pct = MAX(overall_mfe_pct)
    - avg_max_gain_pct = AVG(overall_mfe_pct)
    """
    missed = [r["missed_potential_pct"] for r in rows if r.get("missed_potential_pct") is not None]
    mfes = [r["overall_mfe_pct"] for r in rows if r.get("overall_mfe_pct") is not None]

    best_peak = None
    best_peak_signal_id = None
    if mfes:
        best_idx = max(range(len(rows)), key=lambda i: rows[i].get("overall_mfe_pct") or float("-inf"))
        if rows[best_idx].get("overall_mfe_pct") is not None:
            best_peak = rows[best_idx]["overall_mfe_pct"]
            best_peak_signal_id = rows[best_idx].get("signal_id")

    return {
        "avg_peak_excursion_pct": _round_or_none(_avg(missed)),
        "avg_peak_excursion_sample": len(missed),
        "best_peak_pct": _round_or_none(best_peak),
        "best_peak_signal_id": best_peak_signal_id,
        "avg_max_gain_pct": _round_or_none(_avg(mfes)),
        "avg_max_gain_sample": len(mfes),
    }


def _compute_risk_profile(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Section 6: Risk Profile
    - avg_worst_drawdown_pct = AVG(overall_mae_pct)
    - worst_drawdown_pct = MIN(overall_mae_pct)
    - avg_time_in_profit_pct = AVG(pct_time_above_entry)
    - tp_then_sl_count + pct
    """
    maes = [r["overall_mae_pct"] for r in rows if r.get("overall_mae_pct") is not None]
    times_above = [
        r["pct_time_above_entry"]
        for r in rows
        if r.get("pct_time_above_entry") is not None
    ]

    worst_dd = None
    worst_dd_signal_id = None
    if maes:
        worst_idx = min(range(len(rows)), key=lambda i: rows[i].get("overall_mae_pct") or float("inf"))
        if rows[worst_idx].get("overall_mae_pct") is not None:
            worst_dd = rows[worst_idx]["overall_mae_pct"]
            worst_dd_signal_id = rows[worst_idx].get("signal_id")

    tp_then_sl_count = sum(1 for r in rows if r.get("tp_then_sl") is True)
    closed_count = sum(
        1 for r in rows if r.get("status") in ("closed_win", "closed_loss", "tp4", "sl")
    )
    base = closed_count if closed_count > 0 else len(rows)
    tp_then_sl_pct = (tp_then_sl_count / base * 100) if base > 0 else None

    return {
        "avg_worst_drawdown_pct": _round_or_none(_avg(maes)),
        "worst_drawdown_pct": _round_or_none(worst_dd),
        "worst_drawdown_signal_id": worst_dd_signal_id,
        "avg_time_in_profit_pct": _round_or_none(_avg(times_above), 1),
        "tp_then_sl_count": tp_then_sl_count,
        "tp_then_sl_total": base,
        "tp_then_sl_pct": _round_or_none(tp_then_sl_pct, 1),
    }


# ════════════════════════════════════════════════════════════
# Main entry
# ════════════════════════════════════════════════════════════

def compute_insights(db: Session, pair: str) -> Dict[str, Any]:
    """
    Aggregate journey insights for a given pair.

    Args:
        db: SQLAlchemy session
        pair: trading pair, e.g. "NAORISUSDT" (case-insensitive)

    Returns:
        dict with structure:
        {
            available: bool,
            reason: str | None,           # 'insufficient_data' | 'no_data'
            sample_size: int,
            min_required: int,
            pair: str,
            computed_at: ISO8601 str,
            entry_behavior: {...},
            time_to_each_tp: [...],
            drawdown_before_each_tp: [...],
            hit_rate_per_tp: [...],
            peak_potential: {...},
            risk_profile: {...}
        }

    If sample size < MIN_SAMPLE_SIZE, returns {available: false, reason: 'insufficient_data'}.
    """
    pair_upper = pair.upper()

    # Fetch journey + signal status in single query
    query = text("""
        SELECT
            j.signal_id,
            j.direction,
            j.coverage_status,
            j.events,
            j.overall_mae_pct,
            j.overall_mfe_pct,
            j.initial_mae_pct,
            j.initial_mae_before,
            j.time_to_tp1_seconds,
            j.time_to_outcome_seconds,
            j.pct_time_above_entry,
            j.tp_then_sl,
            j.realized_outcome_pct,
            j.missed_potential_pct,
            s.status,
            s.created_at
        FROM signal_journey j
        INNER JOIN signals s ON s.signal_id = j.signal_id
        WHERE UPPER(s.pair) = :pair
          AND j.coverage_status != 'unavailable'
    """)

    try:
        result = db.execute(query, {"pair": pair_upper})
        rows = []
        for row in result.fetchall():
            rows.append({
                "signal_id": row[0],
                "direction": row[1],
                "coverage_status": row[2],
                "events": row[3] or [],  # JSONB → list
                "overall_mae_pct": row[4],
                "overall_mfe_pct": row[5],
                "initial_mae_pct": row[6],
                "initial_mae_before": row[7],
                "time_to_tp1_seconds": row[8],
                "time_to_outcome_seconds": row[9],
                "pct_time_above_entry": row[10],
                "tp_then_sl": row[11],
                "realized_outcome_pct": row[12],
                "missed_potential_pct": row[13],
                "status": row[14],
                "created_at": row[15],
            })
    except Exception as e:
        logger.error(f"[journey_insights] DB query failed for {pair_upper}: {e}")
        return {
            "available": False,
            "reason": "query_failed",
            "pair": pair_upper,
            "sample_size": 0,
            "min_required": MIN_SAMPLE_SIZE,
        }

    sample_size = len(rows)

    if sample_size == 0:
        return {
            "available": False,
            "reason": "no_data",
            "pair": pair_upper,
            "sample_size": 0,
            "min_required": MIN_SAMPLE_SIZE,
        }

    if sample_size < MIN_SAMPLE_SIZE:
        return {
            "available": False,
            "reason": "insufficient_data",
            "pair": pair_upper,
            "sample_size": sample_size,
            "min_required": MIN_SAMPLE_SIZE,
        }

    # Compute all 6 sections
    return {
        "available": True,
        "pair": pair_upper,
        "sample_size": sample_size,
        "min_required": MIN_SAMPLE_SIZE,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "entry_behavior": _compute_entry_behavior(rows),
        "time_to_each_tp": _compute_time_to_each_tp(rows),
        "drawdown_before_each_tp": _compute_drawdown_before_each_tp(rows),
        "hit_rate_per_tp": _compute_hit_rate_per_tp(rows),
        "peak_potential": _compute_peak_potential(rows),
        "risk_profile": _compute_risk_profile(rows),
    }
