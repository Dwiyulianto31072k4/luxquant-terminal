"""Track-record performance in R units — the "am I actually good?" layer.

Win rate on its own says nothing: a 90% win rate on 0.4R targets against a full 1R
stop loses money. These are the metrics that answer the question properly, all
expressed in R so they detach from account size and leverage entirely.

    1R            = entry - stop1, the risk the call itself defined
    R(target_n)   = (target_n - entry) / 1R
    R-multiple    = what a trade actually returned, in units of that risk
    expectancy    = mean R per trade — the number that decides if the edge is real
    profit factor = gross R won / gross R lost
    max drawdown  = deepest peak-to-trough of the cumulative R curve
    SQN           = sqrt(n) x mean/stdev (Van Tharp) — edge quality against noise

Outcomes come from `_cache_outcomes`, the precomputed table that every other
consumer reads (see cache_worker.precompute_outcomes). Its rule is that the
highest level reached wins — tp4 > tp3 > tp2 > tp1 > sl — so a call that dipped
to its stop and later ran to a target is recorded at that target. This module
does not reinterpret that; it is the platform's definition of an outcome and the
API already serves it everywhere.

Two populations, and `hit` is the default:
  · hit    — every call that reached something: tp1/tp2/tp3/tp4 or sl. Calls
             still sitting at open (no outcome at all) are never included, here
             or anywhere else in this module — they have no result to measure.
             tp1/tp2/tp3 calls are marked at the best target reached so far.
  · closed — the subset that finished the ladder or died at the stop: tp4 or sl.
             Every R in it is realised.
"""

import statistics
from collections import defaultdict
from datetime import timezone

from sqlalchemy import text

TARGET_R_SQL = """
    CASE co.outcome
        WHEN 'tp4' THEN (s.target4 - s.entry) / (s.entry - s.stop1)
        WHEN 'tp3' THEN (s.target3 - s.entry) / (s.entry - s.stop1)
        WHEN 'tp2' THEN (s.target2 - s.entry) / (s.entry - s.stop1)
        WHEN 'tp1' THEN (s.target1 - s.entry) / (s.entry - s.stop1)
        WHEN 'sl'  THEN -1.0
        ELSE NULL
    END
"""

# A call is only usable for R maths if the risk leg is real and the target that
# the outcome refers to actually exists. Every call in this book is a long.
GEOMETRY_GUARD = """
    s.entry > 0 AND s.stop1 > 0 AND s.entry > s.stop1
    AND CASE co.outcome
            WHEN 'tp4' THEN s.target4 IS NOT NULL AND s.target4 > s.entry
            WHEN 'tp3' THEN s.target3 IS NOT NULL AND s.target3 > s.entry
            WHEN 'tp2' THEN s.target2 IS NOT NULL AND s.target2 > s.entry
            WHEN 'tp1' THEN s.target1 IS NOT NULL AND s.target1 > s.entry
            WHEN 'sl'  THEN TRUE
            ELSE FALSE
        END
"""


def _fetch_trades(db, since=None, until=None):
    """One row per resolved call: when it was made, its outcome, its R."""
    sql = f"""
        SELECT s.signal_id,
               s.pair,
               s.risk_level,
               s.created_at::timestamptz AS called_at,
               co.outcome,
               {TARGET_R_SQL} AS r
        FROM signals s
        JOIN _cache_outcomes co ON co.signal_id = s.signal_id
        WHERE {GEOMETRY_GUARD}
    """
    params = {}
    if since:
        sql += " AND s.created_at::timestamptz >= :since"
        params["since"] = since
    if until:
        sql += " AND s.created_at::timestamptz < :until"
        params["until"] = until
    sql += " ORDER BY s.created_at::timestamptz"
    return db.execute(text(sql), params).fetchall()


def _drawdown(rs):
    """Deepest peak-to-trough of the cumulative R curve, and where it happened."""
    peak = float("-inf")
    worst = 0.0
    cum = 0.0
    peak_idx = trough_idx = 0
    best_peak_idx = 0
    for i, r in enumerate(rs):
        cum += r
        if cum > peak:
            peak = cum
            peak_idx = i
        dd = cum - peak
        if dd < worst:
            worst = dd
            trough_idx = i
            best_peak_idx = peak_idx
    return worst, best_peak_idx, trough_idx


def _streaks(rs):
    longest_loss = longest_win = 0
    cur_loss = cur_win = 0
    for r in rs:
        if r > 0:
            cur_win += 1
            cur_loss = 0
        else:
            cur_loss += 1
            cur_win = 0
        longest_win = max(longest_win, cur_win)
        longest_loss = max(longest_loss, cur_loss)
    return longest_win, longest_loss


def _core(rs):
    """The E-family metrics over an ordered list of R-multiples."""
    n = len(rs)
    if n == 0:
        return {"trades": 0}
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]
    gross_win = sum(wins)
    gross_loss = -sum(losses)
    mean = statistics.fmean(rs)
    sd = statistics.pstdev(rs) if n > 1 else 0.0
    avg_win = statistics.fmean(wins) if wins else 0.0
    avg_loss = statistics.fmean(losses) if losses else 0.0
    worst_dd, dd_from, dd_to = _drawdown(rs)
    longest_win, longest_loss = _streaks(rs)

    # The win rate this R:R geometry needs just to break even. If the actual win
    # rate sits below it, the edge is negative no matter how it is sized.
    breakeven_wr = None
    if wins and losses:
        breakeven_wr = round(100 * abs(avg_loss) / (avg_win + abs(avg_loss)), 2)

    return {
        "trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": round(100 * len(wins) / n, 2),
        "total_r": round(sum(rs), 2),
        "expectancy_r": round(mean, 4),
        "avg_win_r": round(avg_win, 4) if wins else None,
        "avg_loss_r": round(avg_loss, 4) if losses else None,
        "profit_factor": round(gross_win / gross_loss, 3) if gross_loss > 0 else None,
        "gross_win_r": round(gross_win, 2),
        "gross_loss_r": round(gross_loss, 2),
        "stdev_r": round(sd, 4),
        # mean/stdev of per-trade R. Deliberately not called Sharpe: R is a risk
        # multiple, not a periodic percentage return, so the two are not the same
        # statistic. The monthly figure below is the Sharpe-shaped one.
        "reward_to_variability": round(mean / sd, 4) if sd > 0 else None,
        "sqn": round((n ** 0.5) * mean / sd, 2) if sd > 0 else None,
        "max_drawdown_r": round(worst_dd, 2),
        "max_drawdown_from_trade": dd_from,
        "max_drawdown_to_trade": dd_to,
        "best_trade_r": round(max(rs), 3),
        "worst_trade_r": round(min(rs), 3),
        "longest_win_streak": longest_win,
        "longest_loss_streak": longest_loss,
        "breakeven_win_rate_pct": breakeven_wr,
    }


def _monthly_sharpe(buckets):
    """Sharpe-shaped ratio on monthly total-R, annualised by sqrt(12).

    Monthly R sums are periodic and additive, so mean/stdev over them is the
    closest honest analogue to a Sharpe ratio available without account-level
    equity. Risk-free rate is zero: R is already an excess-over-risk measure.
    """
    totals = [sum(v) for _, v in sorted(buckets.items())]
    if len(totals) < 2:
        return None, None
    mean = statistics.fmean(totals)
    sd = statistics.pstdev(totals)
    if sd == 0:
        return None, round(mean, 3)
    return round((mean / sd) * (12 ** 0.5), 3), round(mean, 3)


def _period_buckets(trades, key):
    buckets = defaultdict(list)
    for t in trades:
        when = t.called_at
        if when is None:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if key == "month":
            label = when.strftime("%Y-%m")
        else:
            iso = when.isocalendar()
            label = f"{iso[0]}-W{iso[1]:02d}"
        buckets[label].append(float(t.r))
    return buckets


def _period_table(buckets):
    out = []
    running = 0.0
    for label in sorted(buckets):
        rs = buckets[label]
        wins = [r for r in rs if r > 0]
        running += sum(rs)
        out.append({
            "period": label,
            "trades": len(rs),
            "total_r": round(sum(rs), 2),
            "avg_r": round(statistics.fmean(rs), 4),
            "win_rate_pct": round(100 * len(wins) / len(rs), 2),
            "cumulative_r": round(running, 2),
        })
    return out


def rr_geometry(db):
    """The reward:risk the calls themselves promise, before any outcome.

    This is the shape of the book: if the median call offers 0.4R at its first
    target, no win rate on TP1 alone can carry it.
    """
    row = db.execute(text("""
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (target1-entry)/(entry-stop1)) AS tp1_median,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (target2-entry)/(entry-stop1)) AS tp2_median,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (target3-entry)/(entry-stop1)) AS tp3_median,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (target4-entry)/(entry-stop1)) AS tp4_median,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (entry-stop1)/entry*100)       AS stop_dist_pct_median,
          count(*) AS calls
        FROM signals
        WHERE entry > 0 AND stop1 > 0 AND entry > stop1 AND target1 > entry
    """)).fetchone()
    return {
        "calls_measured": row.calls,
        "median_r_to_tp1": round(float(row.tp1_median), 3) if row.tp1_median else None,
        "median_r_to_tp2": round(float(row.tp2_median), 3) if row.tp2_median else None,
        "median_r_to_tp3": round(float(row.tp3_median), 3) if row.tp3_median else None,
        "median_r_to_tp4": round(float(row.tp4_median), 3) if row.tp4_median else None,
        "median_stop_distance_pct": round(float(row.stop_dist_pct_median), 3) if row.stop_dist_pct_median else None,
    }


# risk_level arrives from the scraper in mixed case and two spellings of the
# middle rung ('Medium' and 'med'), so it is folded before being grouped on.
_RISK_ALIASES = {"med": "medium"}


def _risk_label(raw):
    if not raw:
        return "unlabelled"
    key = str(raw).strip().lower()
    return _RISK_ALIASES.get(key, key)


def compute(db, since=None, until=None, population="hit"):
    """Full R report over calls that reached something.

    population="hit"    — every call with an outcome (tp1/tp2/tp3/tp4/sl).
                          tp1-tp3 are marked at the best target so far.
    population="closed" — only tp4 and sl, where every R is realised.

    Calls with no outcome at all (open) are excluded from both: there is
    nothing to measure yet.
    """
    if population not in ("hit", "closed"):
        raise ValueError("population must be 'hit' or 'closed'")

    rows = _fetch_trades(db, since, until)
    rows = [r for r in rows if r.r is not None]

    if population == "closed":
        selected = [r for r in rows if r.outcome in ("tp4", "sl")]
    else:
        selected = rows
    selected = sorted(selected, key=lambda r: r.called_at)

    rs = [float(r.r) for r in selected]
    report = _core(rs)
    report["population"] = population
    report["population_meaning"] = (
        "every call that reached a target or its stop; tp1-tp3 marked at best target so far"
        if population == "hit" else
        "only calls that finished the ladder (tp4) or died at the stop (sl)"
    )
    report["counts"] = {
        outcome: sum(1 for r in selected if r.outcome == outcome)
        for outcome in ("tp1", "tp2", "tp3", "tp4", "sl")
    }

    months = _period_buckets(selected, "month")
    weeks = _period_buckets(selected, "week")
    sharpe, mean_monthly = _monthly_sharpe(months)
    report["monthly_sharpe_annualised"] = sharpe
    report["mean_monthly_r"] = mean_monthly
    report["monthly"] = _period_table(months)
    report["weekly"] = _period_table(weeks)

    by_outcome = defaultdict(list)
    for r in selected:
        by_outcome[r.outcome].append(float(r.r))
    report["by_outcome"] = {
        k: {
            "trades": len(v),
            "total_r": round(sum(v), 2),
            "avg_r": round(statistics.fmean(v), 4),
            "share_of_gross_win_pct": (
                round(100 * sum(v) / report["gross_win_r"], 2)
                if sum(v) > 0 and report.get("gross_win_r") else None
            ),
        }
        for k, v in sorted(by_outcome.items())
    }

    # Does the risk tag on the call predict anything? Grouped on the folded
    # label so 'High' and 'high' do not read as two different cohorts.
    by_risk = defaultdict(list)
    for r in selected:
        by_risk[_risk_label(r.risk_level)].append(float(r.r))
    report["by_risk_level"] = {
        k: {
            "trades": len(v),
            "win_rate_pct": round(100 * sum(1 for x in v if x > 0) / len(v), 2),
            "expectancy_r": round(statistics.fmean(v), 4),
            "total_r": round(sum(v), 2),
        }
        for k, v in sorted(by_risk.items(), key=lambda kv: -len(kv[1]))
    }

    if selected:
        report["window"] = {
            "first_call": selected[0].called_at.isoformat(),
            "last_call": selected[-1].called_at.isoformat(),
        }
    return report


def position_size(account_equity: float, risk_pct: float, entry: float, stop: float,
                  max_leverage: int | None = None):
    """Turn a call into a sized trade — the one calculation a follower needs.

        risk_amount = equity x risk%
        quantity    = risk_amount / |entry - stop|
        notional    = quantity x entry
        leverage    = notional / equity

    The loss at the stop is exactly risk_amount by construction, whatever the
    leverage — leverage only decides how much margin the notional needs.
    """
    if entry <= 0 or stop <= 0 or entry == stop:
        raise ValueError("entry and stop must be positive and different")
    if account_equity <= 0 or risk_pct <= 0:
        raise ValueError("account_equity and risk_pct must be positive")

    risk_amount = account_equity * (risk_pct / 100.0)
    per_unit_risk = abs(entry - stop)
    stop_distance_pct = per_unit_risk / entry * 100.0
    quantity = risk_amount / per_unit_risk
    notional = quantity * entry
    leverage_needed = notional / account_equity

    out = {
        "risk_amount": round(risk_amount, 2),
        "stop_distance_pct": round(stop_distance_pct, 4),
        "quantity": quantity,
        "notional": round(notional, 2),
        "leverage_needed": round(leverage_needed, 3),
        "loss_at_stop": round(risk_amount, 2),
    }
    if max_leverage and leverage_needed > max_leverage:
        # The stop is too tight for the venue's cap: honour the cap and report
        # the risk the trader is actually taking instead of silently exceeding it.
        capped_notional = account_equity * max_leverage
        capped_qty = capped_notional / entry
        out["capped_by_max_leverage"] = max_leverage
        out["capped_quantity"] = capped_qty
        out["capped_notional"] = round(capped_notional, 2)
        out["capped_loss_at_stop"] = round(capped_qty * per_unit_risk, 2)
    return out
