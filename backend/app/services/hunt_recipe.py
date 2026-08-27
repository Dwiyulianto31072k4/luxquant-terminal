"""Hunt full TP recipe — runner-tag selection + outcome mix.

Lockstep with frontend-react/src/components/EdgePlaybook.jsx
`buildRunnerTagSet` and EdgeRecipesBar top-4 by full_tp_rate.

A win is TP1 or further. Full TP is TP3 or TP4. Tags are as-of-entry
(entry_snapshot), not collected after the outcome.
"""

CONFOUND_TAGS = frozenset({
    "LATE_ENTRY",
    "PARABOLIC",
    "OVEREXTENDED",
    "EXHAUSTION_CANDLE",
})

RUNNER_MIN_N = 150
RUNNER_MIN_WR = 78.0
RUNNER_MIN_FULL = 12.0
RUNNER_MIN_TP4 = 5.0
RUNNER_MIN_PEAK = 18.0
RUNNER_TOP_K = 4


def _num(v, default=0.0):
    try:
        if v is None:
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def is_runner_tag(t) -> bool:
    if not t or t.get("tag") in CONFOUND_TAGS:
        return False
    if int(t.get("n") or 0) < RUNNER_MIN_N:
        return False
    if _num(t.get("win_rate")) < RUNNER_MIN_WR:
        return False
    full = _num(t.get("full_tp_rate"))
    tp4 = _num(t.get("tp4_rate"))
    peak = t.get("median_peak_wins")
    if peak is None:
        peak = t.get("median_peak")
    peak = _num(peak)
    return full >= RUNNER_MIN_FULL or tp4 >= RUNNER_MIN_TP4 or peak >= RUNNER_MIN_PEAK


def select_runner_tags(tags, top_k: int = RUNNER_TOP_K):
    """Clean runner tags, ranked by historical full-TP rate then WR."""
    k = int(top_k or RUNNER_TOP_K)
    if k < 1:
        k = RUNNER_TOP_K
    cands = [t for t in (tags or []) if is_runner_tag(t)]
    cands.sort(
        key=lambda t: (
            -_num(t.get("full_tp_rate")),
            -_num(t.get("win_rate")),
            -int(t.get("n") or 0),
        )
    )
    return cands[:k]


def _pct(part, total):
    total = int(total or 0)
    if total <= 0:
        return None
    return round(int(part or 0) / total * 100, 2)


def outcome_mix(n, sl, tp1, tp2, tp3, tp4):
    """Final-outcome mix (mutually exclusive) + reached-at-least rates.

    Final mix sums to 100%: each closed call counted once at the highest
    target it reached, or SL. Reached TP1 = win rate; reached TP3 = full TP.
    """
    n = int(n or 0)
    counts = {
        "sl": int(sl or 0),
        "tp1": int(tp1 or 0),
        "tp2": int(tp2 or 0),
        "tp3": int(tp3 or 0),
        "tp4": int(tp4 or 0),
    }
    final = {k: _pct(v, n) for k, v in counts.items()}
    reached = {
        "sl": _pct(counts["sl"], n),
        "tp1": _pct(counts["tp1"] + counts["tp2"] + counts["tp3"] + counts["tp4"], n),
        "tp2": _pct(counts["tp2"] + counts["tp3"] + counts["tp4"], n),
        "tp3": _pct(counts["tp3"] + counts["tp4"], n),
        "tp4": _pct(counts["tp4"], n),
    }
    return {
        "n": n,
        "counts": counts,
        "final_pct": final,
        "reached_pct": reached,
        "win_rate": reached["tp1"],
        "sl_rate": final["sl"],
        "full_tp_rate": reached["tp3"],
        "tp4_rate": final["tp4"],
    }


def mix_delta(hunt, baseline):
    """Hunt minus all-calls, in percentage points, for final + reached."""
    out = {"final_pp": {}, "reached_pp": {}}
    if not hunt or not baseline:
        return out
    for bucket, key in (("final_pp", "final_pct"), ("reached_pp", "reached_pct")):
        src_h = hunt.get(key) or {}
        src_b = baseline.get(key) or {}
        for k in ("sl", "tp1", "tp2", "tp3", "tp4"):
            a, b = src_h.get(k), src_b.get(k)
            out[bucket][k] = round(a - b, 2) if a is not None and b is not None else None
    hw, bw = hunt.get("win_rate"), baseline.get("win_rate")
    hf, bf = hunt.get("full_tp_rate"), baseline.get("full_tp_rate")
    out["win_pp"] = round(hw - bw, 2) if hw is not None and bw is not None else None
    out["full_tp_pp"] = round(hf - bf, 2) if hf is not None and bf is not None else None
    return out
