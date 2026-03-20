"""
LuxQuant Terminal - Coin Intelligence Worker v3
================================================
Deep historical coin analysis + market flow classification.

Analysis Modules:
1.  Core Stats — WR, SL rate, outcome distribution, streaks
2.  Platform Flow — daily WR classification (High/Mid/Low)
3.  Volatility Profile — P/L stddev, R:R ratio, consistency
4.  Day-of-Week Patterns — WR per weekday
5.  Correlation Clusters — pairs that SL together
6.  Recovery Analysis — bounce-back speed after SL
7.  Entry Quality — TP level distribution, reaches-potential %
8.  Monthly WR Trend — WR per month for sparkline
9.  Best Entry Hour — hour-of-day WR analysis
10. TP4 Streaks — consecutive full-target hits
11. Risk-Adjusted Score — composite 1-100 rating
12. Anomaly Detection — 21 rules
13. Deep Insight Generation — multi-paragraph English

Output: Redis key lq:signals:coin-intel
"""

import time
import math
from datetime import datetime, timedelta
from collections import defaultdict
from sqlalchemy import text


# ════════════════════════════════════════════
# CONSTANTS
# ════════════════════════════════════════════

FLOW_MAP = {"strong": "high", "neutral": "mid", "weak": "low", "insufficient": "insufficient"}
FLOW_LABEL = {"high": "High Flow", "mid": "Mid Flow", "low": "Low Flow"}
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MIN_CLOSED_RELIABLE = 5
MIN_CLOSED_PATTERN = 10
MIN_DAY_PATTERN = 3
MIN_CORRELATION = 3


# ════════════════════════════════════════════
# STEP 1: Daily market regime
# ════════════════════════════════════════════

def compute_daily_regimes(db):
    try:
        db.execute(text("""
            INSERT INTO daily_market_regime (date, total_closed, wins, losses, win_rate, regime, computed_at)
            SELECT 
                DATE(s.created_at), COUNT(so.outcome),
                SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END),
                SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END),
                CASE WHEN COUNT(so.outcome) > 0 THEN ROUND(SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric / COUNT(so.outcome) * 100, 2) ELSE 0 END,
                CASE
                    WHEN COUNT(so.outcome) < 5 THEN 'insufficient'
                    WHEN SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric / COUNT(so.outcome) * 100 >= 70 THEN 'strong'
                    WHEN SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric / COUNT(so.outcome) * 100 >= 50 THEN 'neutral'
                    ELSE 'weak'
                END, NOW()
            FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id = so.signal_id
            WHERE s.created_at IS NOT NULL GROUP BY DATE(s.created_at) HAVING COUNT(so.outcome) > 0
            ON CONFLICT (date) DO UPDATE SET total_closed=EXCLUDED.total_closed, wins=EXCLUDED.wins,
                losses=EXCLUDED.losses, win_rate=EXCLUDED.win_rate, regime=EXCLUDED.regime, computed_at=EXCLUDED.computed_at
        """))
        db.commit()
    except Exception as e:
        db.rollback()
        raise e


# ════════════════════════════════════════════
# STEP 2: Main compute
# ════════════════════════════════════════════

def compute_coin_intel(db):
    # A: Current flow
    today_row = db.execute(text("SELECT date, win_rate, regime FROM daily_market_regime WHERE regime != 'insufficient' ORDER BY date DESC LIMIT 1")).fetchone()
    current_flow_db = today_row[2] if today_row else "neutral"
    current_flow = FLOW_MAP.get(current_flow_db, "mid")
    current_flow_wr = round(float(today_row[1]), 1) if today_row else 50.0

    # B: Platform avg WR
    plat_row = db.execute(text("SELECT COUNT(*), SUM(CASE WHEN outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) FROM _cache_outcomes")).fetchone()
    platform_avg_wr = round((int(plat_row[1] or 0) / int(plat_row[0]) * 100), 2) if plat_row and int(plat_row[0] or 0) > 0 else 50.0

    # C: Active pairs 7d
    date_7d = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
    pairs_rows = db.execute(text("SELECT DISTINCT pair FROM signals WHERE created_at >= :d7 AND pair IS NOT NULL"), {"d7": date_7d}).fetchall()
    active_pairs = [r[0] for r in pairs_rows if r[0]]
    if not active_pairs:
        return _empty_response(current_flow, current_flow_wr, platform_avg_wr)
    pairs_tuple = tuple(active_pairs)

    # D: Batch queries
    coin_rows = _query_alltime_stats(db, pairs_tuple)
    flow_map = _query_flow_performance(db, pairs_tuple)
    history_map = _query_signal_history(db, pairs_tuple)
    wr_30d_map = _query_30d_stats(db, pairs_tuple)
    active_days_map = _query_active_days(db, pairs_tuple, date_7d)
    dow_map = _query_day_of_week(db, pairs_tuple)
    recovery_map = _query_recovery_speed(db, pairs_tuple)
    monthly_map = _query_monthly_wr(db, pairs_tuple)
    hour_map = _query_hour_of_day(db, pairs_tuple)
    correlation_clusters = _compute_correlations(db, pairs_tuple)

    # E: Assemble
    coins = []
    for row in coin_rows:
        coin = _assemble_coin(
            row, history_map, flow_map, wr_30d_map, active_days_map,
            dow_map, recovery_map, correlation_clusters, monthly_map, hour_map,
            current_flow, current_flow_db, current_flow_wr, platform_avg_wr
        )
        if coin:
            coins.append(coin)

    # F: Timeline
    timeline_rows = db.execute(text("SELECT date, win_rate, regime, total_closed, wins, losses FROM daily_market_regime WHERE regime != 'insufficient' ORDER BY date DESC LIMIT 7")).fetchall()
    flow_timeline = [{"date": str(r[0]), "wr": round(float(r[1]), 1), "flow": FLOW_MAP.get(r[2], "mid"), "closed": int(r[3]), "wins": int(r[4]), "losses": int(r[5])} for r in timeline_rows]

    # G: Rank & split
    for c in coins:
        c["_score"] = _rank_score(c)
    coins.sort(key=lambda c: c["_score"], reverse=True)
    top_coins, rest_coins = [], []
    for i, c in enumerate(coins):
        c["rank"] = i + 1
        c["is_top"] = i < 10
        del c["_score"]
        (top_coins if i < 10 else rest_coins).append(c)

    return {
        "current_flow": current_flow, "current_flow_wr": current_flow_wr,
        "platform_avg_wr": platform_avg_wr, "flow_timeline": flow_timeline,
        "top_coins": top_coins, "rest_coins": rest_coins,
        "correlation_clusters": correlation_clusters[:10],
        "total_active_pairs": len(active_pairs), "total_flagged": len(top_coins) + len(rest_coins),
        "computed_at": datetime.utcnow().isoformat(),
    }


# ════════════════════════════════════════════
# BATCH QUERIES
# ════════════════════════════════════════════

def _query_alltime_stats(db, pt):
    return db.execute(text("""
        SELECT s.pair, COUNT(*), COUNT(so.outcome), COUNT(*)-COUNT(so.outcome),
            SUM(CASE WHEN so.outcome='tp1' THEN 1 ELSE 0 END), SUM(CASE WHEN so.outcome='tp2' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='tp3' THEN 1 ELSE 0 END), SUM(CASE WHEN so.outcome='tp4' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='sl' THEN 1 ELSE 0 END), MIN(s.created_at), MAX(s.created_at)
        FROM signals s LEFT JOIN _cache_outcomes so ON s.signal_id=so.signal_id WHERE s.pair IN :pairs GROUP BY s.pair
    """), {"pairs": pt}).fetchall()

def _query_flow_performance(db, pt):
    rows = db.execute(text("""
        SELECT s.pair, dmr.regime, COUNT(so.outcome),
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='sl' THEN 1 ELSE 0 END)
        FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id
        INNER JOIN daily_market_regime dmr ON DATE(s.created_at)=dmr.date
        WHERE s.pair IN :pairs AND dmr.regime IN ('strong','neutral','weak') GROUP BY s.pair, dmr.regime
    """), {"pairs": pt}).fetchall()
    result = {}
    for r in rows:
        flow = FLOW_MAP.get(r[1], "mid")
        calls, wins, losses = int(r[2]), int(r[3]), int(r[4])
        result.setdefault(r[0], {})[flow] = {"calls": calls, "wins": wins, "losses": losses, "wr": round(wins/calls*100, 1) if calls > 0 else 0}
    return result

def _query_signal_history(db, pt):
    rows = db.execute(text("""
        SELECT s.pair, s.signal_id, DATE(s.created_at), s.entry, s.target1, s.target2, s.target3, s.target4, s.stop1,
            s.risk_level, so.outcome, dmr.win_rate, dmr.regime, s.created_at,
            EXTRACT(DOW FROM s.created_at::timestamp), EXTRACT(HOUR FROM s.created_at::timestamp)
        FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id
        LEFT JOIN daily_market_regime dmr ON DATE(s.created_at)=dmr.date
        WHERE s.pair IN :pairs ORDER BY s.pair, s.created_at DESC
    """), {"pairs": pt}).fetchall()
    result = {}
    for r in rows:
        pair, entry = r[0], float(r[3]) if r[3] else 0
        outcome = r[10]
        pl_pct = 0.0
        if entry > 0 and outcome:
            tp = float({"tp1": r[4], "tp2": r[5], "tp3": r[6], "tp4": r[7], "sl": r[8]}.get(outcome, 0) or 0)
            if tp > 0: pl_pct = round((tp - entry) / entry * 100, 2)
        result.setdefault(pair, []).append({
            "date": str(r[2]), "entry": entry, "outcome": outcome, "pl_pct": pl_pct,
            "platform_wr": round(float(r[11]), 1) if r[11] is not None else None,
            "flow": FLOW_MAP.get(r[12], "mid") if r[12] else "insufficient",
            "signal_id": r[1], "risk_level": r[9], "dow": int(r[14]) if r[14] is not None else 0,
            "hour": int(r[15]) if r[15] is not None else 0,
        })
    return result

def _query_30d_stats(db, pt):
    d30 = (datetime.utcnow() - timedelta(days=30)).strftime('%Y-%m-%d')
    rows = db.execute(text("SELECT s.pair, COUNT(so.outcome), SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id WHERE s.pair IN :pairs AND s.created_at >= :d30 GROUP BY s.pair"), {"pairs": pt, "d30": d30}).fetchall()
    return {r[0]: round(int(r[2])/int(r[1])*100, 1) if int(r[1]) > 0 else None for r in rows}

def _query_active_days(db, pt, d7):
    rows = db.execute(text("SELECT s.pair, DATE(s.created_at) FROM signals s WHERE s.pair IN :pairs AND s.created_at >= :d7 GROUP BY s.pair, DATE(s.created_at)"), {"pairs": pt, "d7": d7}).fetchall()
    result = {}
    for r in rows: result.setdefault(r[0], []).append(str(r[1]))
    return result

def _query_day_of_week(db, pt):
    rows = db.execute(text("""
        SELECT s.pair, EXTRACT(DOW FROM s.created_at::timestamp), COUNT(so.outcome),
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)
        FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id WHERE s.pair IN :pairs GROUP BY s.pair, 2
    """), {"pairs": pt}).fetchall()
    result = {}
    for r in rows:
        closed, wins = int(r[2]), int(r[3])
        result.setdefault(r[0], {})[int(r[1])] = {"closed": closed, "wins": wins, "wr": round(wins/closed*100, 1) if closed > 0 else 0}
    return result

def _query_recovery_speed(db, pt):
    rows = db.execute(text("SELECT s.pair, so.outcome FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id WHERE s.pair IN :pairs ORDER BY s.pair, s.created_at ASC"), {"pairs": pt}).fetchall()
    seqs = defaultdict(list)
    for r in rows: seqs[r[0]].append(r[1])
    result = {}
    for pair, outcomes in seqs.items():
        recs = []
        i = 0
        while i < len(outcomes):
            if outcomes[i] == 'sl':
                j = i + 1
                while j < len(outcomes) and outcomes[j] == 'sl': j += 1
                if j < len(outcomes): recs.append(j - i)
                i = j + 1
            else: i += 1
        if recs:
            avg = round(sum(recs)/len(recs), 1)
            result[pair] = {"avg_signals_to_recover": avg, "fastest_recovery": min(recs), "slowest_recovery": max(recs),
                            "total_recoveries": len(recs), "speed_label": "fast" if avg <= 2 else "moderate" if avg <= 4 else "slow"}
    return result

def _query_monthly_wr(db, pt):
    """Monthly WR trend per coin — last 6 months."""
    rows = db.execute(text("""
        SELECT s.pair, TO_CHAR(s.created_at::timestamp, 'YYYY-MM') as month,
            COUNT(so.outcome), SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)
        FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id
        WHERE s.pair IN :pairs AND s.created_at::timestamp >= (NOW() - INTERVAL '6 months')
        GROUP BY s.pair, month ORDER BY s.pair, month
    """), {"pairs": pt}).fetchall()
    result = {}
    for r in rows:
        closed, wins = int(r[2]), int(r[3])
        if closed >= 2:
            result.setdefault(r[0], []).append({"month": r[1], "wr": round(wins/closed*100, 1), "closed": closed, "wins": wins})
    return result

def _query_hour_of_day(db, pt):
    """WR by hour-of-day per coin."""
    rows = db.execute(text("""
        SELECT s.pair, EXTRACT(HOUR FROM s.created_at::timestamp)::int as hr,
            COUNT(so.outcome), SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)
        FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id
        WHERE s.pair IN :pairs GROUP BY s.pair, hr
    """), {"pairs": pt}).fetchall()
    result = {}
    for r in rows:
        hr, closed, wins = int(r[1]), int(r[2]), int(r[3])
        if closed >= 3:
            result.setdefault(r[0], {})[hr] = {"closed": closed, "wins": wins, "wr": round(wins/closed*100, 1)}
    return result

def _compute_correlations(db, pt):
    rows = db.execute(text("SELECT s.pair, DATE(s.created_at) FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id=so.signal_id WHERE s.pair IN :pairs AND so.outcome='sl' GROUP BY s.pair, DATE(s.created_at)"), {"pairs": pt}).fetchall()
    dp = defaultdict(set)
    for r in rows: dp[str(r[1])].add(r[0])
    cooc = defaultdict(lambda: {"count": 0, "dates": []})
    for date, pairs in dp.items():
        pl = sorted(pairs)
        for i in range(len(pl)):
            for j in range(i+1, len(pl)):
                k = f"{pl[i]}|{pl[j]}"
                cooc[k]["count"] += 1
                if len(cooc[k]["dates"]) < 5: cooc[k]["dates"].append(date)
    clusters = [{"pair_a": k.split("|")[0], "pair_b": k.split("|")[1], "co_sl_count": v["count"], "sample_dates": v["dates"][:5]} for k, v in cooc.items() if v["count"] >= MIN_CORRELATION]
    clusters.sort(key=lambda x: x["co_sl_count"], reverse=True)
    return clusters


# ════════════════════════════════════════════
# COIN ASSEMBLY
# ════════════════════════════════════════════

def _assemble_coin(row, history_map, flow_map, wr_30d_map, active_days_map,
                   dow_map, recovery_map, correlation_clusters, monthly_map, hour_map,
                   current_flow, current_flow_db, current_flow_wr, platform_avg_wr):
    pair = row[0]
    total_calls, closed, open_trades = int(row[1]), int(row[2]), int(row[3])
    tp1, tp2, tp3, tp4, sl = int(row[4]), int(row[5]), int(row[6]), int(row[7]), int(row[8])
    wins = tp1 + tp2 + tp3 + tp4
    wr = round(wins/closed*100, 1) if closed > 0 else 0
    sr = round(sl/closed*100, 1) if closed > 0 else 0
    history = history_map.get(pair, [])
    wr_30d = wr_30d_map.get(pair)

    # Modules
    avg_outcome = _calc_avg_outcome(closed, wins, sl, tp1, tp2, tp3, tp4)
    streak_type, streak_len = _calc_streak(history)
    recent = [h["outcome"] for h in history[:20]]
    fp = flow_map.get(pair, {})
    for fl in ("high", "mid", "low"):
        if fl not in fp: fp[fl] = {"calls": 0, "wins": 0, "losses": 0, "wr": 0}
    volatility = _calc_volatility(history, closed)
    dow_analysis = _analyze_dow(dow_map.get(pair, {}))
    recovery = recovery_map.get(pair)
    entry_quality = _calc_entry_quality(history, closed, wins, tp1, tp2, tp3, tp4)
    monthly_trend = monthly_map.get(pair, [])
    hour_analysis = _analyze_hours(hour_map.get(pair, {}))
    tp4_streaks = _calc_tp4_streaks(history, tp4)
    risk_score = _calc_risk_score(wr, sr, closed, wins, sl, tp1, tp2, tp3, tp4, volatility, recovery, entry_quality, streak_type, streak_len, wr_30d, platform_avg_wr)
    
    correlated_pairs = [c for c in correlation_clusters if c["pair_a"] == pair or c["pair_b"] == pair][:3]

    flags = _detect_anomalies(pair, wr, sr, closed, wins, sl, tp1, tp2, tp3, tp4,
        streak_type, streak_len, current_flow, platform_avg_wr, fp, wr_30d,
        volatility, dow_analysis, recovery, entry_quality, correlated_pairs, risk_score)
    if not flags: return None

    insight = _build_insight(pair, wr, sr, closed, wins, sl, tp1, tp2, tp3, tp4,
        avg_outcome, streak_type, streak_len, current_flow, current_flow_wr, platform_avg_wr,
        fp, wr_30d, flags, history, volatility, dow_analysis, recovery, entry_quality,
        correlated_pairs, monthly_trend, hour_analysis, tp4_streaks, risk_score)

    signal_history = [{"date": h["date"], "entry": h["entry"], "outcome": h["outcome"],
        "pl_pct": f"+{h['pl_pct']}%" if h["pl_pct"] > 0 else f"{h['pl_pct']}%",
        "platform_wr": h["platform_wr"], "flow": h["flow"]} for h in history]

    return {
        "pair": pair, "total_calls": total_calls, "closed_trades": closed, "open_trades": open_trades,
        "win_rate": wr, "sl_rate": sr, "avg_outcome": avg_outcome,
        "outcome_dist": {"tp1": tp1, "tp2": tp2, "tp3": tp3, "tp4": tp4, "sl": sl},
        "win_rate_30d": wr_30d, "current_streak": {"type": streak_type, "length": streak_len},
        "recent_outcomes": recent, "flow_perf": fp, "volatility": volatility,
        "dow_analysis": dow_analysis, "recovery": recovery, "entry_quality": entry_quality,
        "monthly_trend": monthly_trend, "hour_analysis": hour_analysis,
        "tp4_streaks": tp4_streaks, "risk_score": risk_score,
        "correlated_pairs": [{"pair": c["pair_b"] if c["pair_a"] == pair else c["pair_a"], "co_sl_count": c["co_sl_count"]} for c in correlated_pairs],
        "anomaly_flags": flags, "insight": insight, "signal_history": signal_history,
        "active_days": active_days_map.get(pair, []),
        "first_signal": str(row[9]) if row[9] else None, "last_signal": str(row[10]) if row[10] else None,
    }


# ════════════════════════════════════════════
# ANALYSIS MODULES
# ════════════════════════════════════════════

def _calc_volatility(history, closed):
    if closed < MIN_CLOSED_RELIABLE:
        return {"profile": "unknown", "pl_stddev": 0, "consistency": 0, "avg_pl": 0, "avg_win_pl": 0, "avg_loss_pl": 0, "rr_ratio": 0}
    pls = [h["pl_pct"] for h in history if h["pl_pct"] != 0]
    if len(pls) < 3:
        return {"profile": "unknown", "pl_stddev": 0, "consistency": 0, "avg_pl": 0, "avg_win_pl": 0, "avg_loss_pl": 0, "rr_ratio": 0}
    avg_pl = round(sum(pls)/len(pls), 2)
    stddev = round(math.sqrt(sum((x-avg_pl)**2 for x in pls)/len(pls)), 2)
    within_1sd = sum(1 for x in pls if abs(x-avg_pl) <= stddev)
    consistency = round(within_1sd/len(pls)*100, 1)
    win_pls = [p for p in pls if p > 0]
    loss_pls = [p for p in pls if p < 0]
    avg_win_pl = round(sum(win_pls)/len(win_pls), 2) if win_pls else 0
    avg_loss_pl = round(sum(loss_pls)/len(loss_pls), 2) if loss_pls else 0
    # Fix R:R — if no losses, use avg_win as the ratio (infinite R:R capped at 10)
    if avg_loss_pl != 0:
        rr_ratio = round(abs(avg_win_pl / avg_loss_pl), 2)
    elif avg_win_pl > 0:
        rr_ratio = 10.0  # No losses = excellent R:R
    else:
        rr_ratio = 0
    profile = "stable" if stddev <= 4 else "moderate" if stddev <= 8 else "volatile"
    return {"profile": profile, "pl_stddev": stddev, "consistency": consistency, "avg_pl": avg_pl,
            "avg_win_pl": avg_win_pl, "avg_loss_pl": avg_loss_pl, "rr_ratio": rr_ratio}

def _analyze_dow(dow_data):
    if not dow_data: return {"has_pattern": False}
    days = {}
    for dow_pg, stats in dow_data.items():
        if stats["closed"] < MIN_DAY_PATTERN: continue
        days[(dow_pg - 1) % 7] = stats
    if len(days) < 2: return {"has_pattern": False}
    best = max(days.items(), key=lambda x: x[1]["wr"])
    worst = min(days.items(), key=lambda x: x[1]["wr"])
    spread = best[1]["wr"] - worst[1]["wr"]
    breakdown = {DAY_NAMES[idx]: {"wr": s["wr"], "closed": s["closed"], "wins": s["wins"]} for idx, s in sorted(days.items())}
    return {"has_pattern": spread >= 20, "best_day": DAY_NAMES[best[0]], "best_day_wr": best[1]["wr"],
            "worst_day": DAY_NAMES[worst[0]], "worst_day_wr": worst[1]["wr"], "spread": round(spread, 1), "breakdown": breakdown}

def _calc_entry_quality(history, closed, wins, tp1, tp2, tp3, tp4):
    if closed < MIN_CLOSED_RELIABLE or wins == 0:
        return {"score": "unknown", "reaches_potential": 0, "full_target_rate": 0, "avg_tp_level": 0, "tp1_only_pct": 0}
    beyond = tp2 + tp3 + tp4
    rp = round(beyond/wins*100, 1)
    ftr = round(tp4/closed*100, 1)
    avg_tp = round((tp1+tp2*2+tp3*3+tp4*4)/wins, 2)
    score = "excellent" if rp >= 70 and ftr >= 20 else "good" if rp >= 50 else "average" if rp >= 30 else "poor"
    return {"score": score, "reaches_potential": rp, "full_target_rate": ftr, "avg_tp_level": avg_tp,
            "tp1_only_pct": round(tp1/wins*100, 1)}

def _analyze_hours(hour_data):
    """Find best and worst trading hours."""
    if not hour_data or len(hour_data) < 2:
        return {"has_pattern": False}
    best = max(hour_data.items(), key=lambda x: x[1]["wr"])
    worst = min(hour_data.items(), key=lambda x: x[1]["wr"])
    spread = best[1]["wr"] - worst[1]["wr"]
    # Group into time blocks
    blocks = {}
    for hr, stats in hour_data.items():
        if hr < 6: block = "Night (00-06)"
        elif hr < 12: block = "Morning (06-12)"
        elif hr < 18: block = "Afternoon (12-18)"
        else: block = "Evening (18-24)"
        b = blocks.setdefault(block, {"closed": 0, "wins": 0})
        b["closed"] += stats["closed"]
        b["wins"] += stats["wins"]
    for b in blocks.values():
        b["wr"] = round(b["wins"]/b["closed"]*100, 1) if b["closed"] > 0 else 0
    best_block = max(blocks.items(), key=lambda x: x[1]["wr"]) if blocks else None
    return {
        "has_pattern": spread >= 15,
        "best_hour": best[0], "best_hour_wr": best[1]["wr"], "best_hour_trades": best[1]["closed"],
        "worst_hour": worst[0], "worst_hour_wr": worst[1]["wr"],
        "spread": round(spread, 1),
        "best_block": best_block[0] if best_block else None,
        "best_block_wr": best_block[1]["wr"] if best_block else 0,
        "blocks": {k: {"wr": v["wr"], "closed": v["closed"]} for k, v in blocks.items()},
    }

def _calc_tp4_streaks(history, total_tp4):
    """Count consecutive TP4 hits and longest TP4 streak."""
    if total_tp4 == 0: return {"total_tp4": 0, "longest_streak": 0, "current_tp4_streak": 0}
    best_streak = current = 0
    for h in reversed(history):  # oldest first
        if h["outcome"] == "tp4":
            current += 1
            best_streak = max(best_streak, current)
        else:
            current = 0
    # Current TP4 streak (from most recent)
    current_streak = 0
    for h in history:
        if h["outcome"] == "tp4": current_streak += 1
        else: break
    return {"total_tp4": total_tp4, "longest_streak": best_streak, "current_tp4_streak": current_streak}

def _calc_risk_score(wr, sr, closed, wins, sl, tp1, tp2, tp3, tp4, vol, recovery, eq, streak_type, streak_len, wr_30d, platform_wr):
    """Composite risk-adjusted score 0-100. Higher = better/safer."""
    if closed < MIN_CLOSED_RELIABLE: return 0
    score = 0.0
    # WR component (0-30)
    score += min(wr / 100 * 30, 30)
    # R:R component (0-15)
    rr = vol.get("rr_ratio", 0) if vol else 0
    score += min(rr / 3 * 15, 15)
    # Entry quality (0-15)
    eq_map = {"excellent": 15, "good": 11, "average": 7, "poor": 3, "unknown": 5}
    score += eq_map.get(eq.get("score", "unknown") if eq else "unknown", 5)
    # Recovery speed (0-10)
    if recovery:
        rec_map = {"fast": 10, "moderate": 6, "slow": 2}
        score += rec_map.get(recovery.get("speed_label", "moderate"), 5)
    else:
        score += 5
    # Consistency/volatility (0-10)
    vol_map = {"stable": 10, "moderate": 6, "volatile": 2, "unknown": 5}
    score += vol_map.get(vol.get("profile", "unknown") if vol else "unknown", 5)
    # Streak bonus/penalty (0-10)
    if streak_type == "win": score += min(streak_len * 1.5, 10)
    elif streak_type == "loss": score -= min(streak_len * 2, 10)
    # 30d trend bonus (0-5)
    if wr_30d is not None:
        diff = wr_30d - wr
        score += max(min(diff / 10 * 5, 5), -5)
    # Sample size bonus (0-5)
    score += min(closed / 20 * 5, 5)
    return max(0, min(100, round(score)))


# ════════════════════════════════════════════
# ANOMALY DETECTION (21 rules)
# ════════════════════════════════════════════

def _detect_anomalies(pair, wr, sr, closed, wins, sl, tp1, tp2, tp3, tp4,
                      streak_type, streak_len, current_flow, platform_avg_wr,
                      flow_perf, wr_30d, vol, dow, recovery, eq, corr, risk_score):
    flags = []
    cf = flow_perf.get(current_flow, {})
    # Core
    if closed >= MIN_CLOSED_RELIABLE and sr >= 60: flags.append({"type": "sl_magnet", "severity": "danger", "tag": "SL magnet"})
    if closed >= MIN_CLOSED_RELIABLE and wr <= platform_avg_wr - 20: flags.append({"type": "chronic_underperformer", "severity": "danger", "tag": "Chronic underperformer"})
    if wins >= 3 and tp1/wins >= 0.7: flags.append({"type": "tp1_trap", "severity": "warning", "tag": "TP1 trap"})
    if streak_type == "loss" and streak_len >= 3: flags.append({"type": "losing_streak", "severity": "danger", "tag": f"{streak_len}-call loss streak"})
    if 0 < closed < MIN_CLOSED_RELIABLE: flags.append({"type": "low_sample", "severity": "info", "tag": "Low sample"})
    # Flow
    if cf.get("calls", 0) >= 3 and cf.get("wr", 0) >= wr + 15: flags.append({"type": "flow_outperformer", "severity": "positive", "tag": f"{FLOW_LABEL.get(current_flow,'')} survivor"})
    if cf.get("calls", 0) >= 3 and cf.get("wr", 0) <= wr - 15: flags.append({"type": "flow_underperformer", "severity": "warning", "tag": "Weak in current flow"})
    # Streak
    if streak_type == "win" and streak_len >= 3: flags.append({"type": "hot_streak", "severity": "positive", "tag": f"{streak_len}-call win streak"})
    # TP4
    if closed >= MIN_CLOSED_RELIABLE and tp4/closed >= 0.3: flags.append({"type": "tp4_king", "severity": "positive", "tag": "TP4 king"})
    # WR trend
    if wr_30d is not None and closed >= MIN_CLOSED_RELIABLE and wr_30d - wr >= 20: flags.append({"type": "wr_surprise", "severity": "positive", "tag": "WR improving"})
    if wr_30d is not None and closed >= MIN_CLOSED_RELIABLE and wr - wr_30d >= 20: flags.append({"type": "wr_decline", "severity": "warning", "tag": "WR declining"})
    # Volatility
    if vol.get("profile") == "volatile" and wr < 70: flags.append({"type": "volatile_danger", "severity": "danger", "tag": "High volatility, low WR"})
    if vol.get("profile") == "stable" and wr >= 85: flags.append({"type": "stable_winner", "severity": "positive", "tag": "Stable & reliable"})
    if vol.get("rr_ratio", 0) > 0 and vol["rr_ratio"] < 0.8 and closed >= MIN_CLOSED_PATTERN: flags.append({"type": "bad_rr", "severity": "warning", "tag": "Poor reward/risk ratio"})
    if vol.get("rr_ratio", 0) >= 2.5 and closed >= MIN_CLOSED_PATTERN: flags.append({"type": "great_rr", "severity": "positive", "tag": "Excellent reward/risk"})
    # DOW
    if dow.get("has_pattern") and dow.get("spread", 0) >= 30: flags.append({"type": "dow_pattern", "severity": "info", "tag": f"Best: {dow['best_day']} ({dow['best_day_wr']}%)"})
    # Recovery
    if recovery and recovery["avg_signals_to_recover"] >= 5 and recovery["total_recoveries"] >= 3: flags.append({"type": "slow_recovery", "severity": "warning", "tag": "Slow SL recovery"})
    if recovery and recovery["avg_signals_to_recover"] <= 1.5 and recovery["total_recoveries"] >= 3: flags.append({"type": "fast_recovery", "severity": "positive", "tag": "Fast SL recovery"})
    # Entry quality
    if eq.get("score") == "excellent": flags.append({"type": "excellent_entry", "severity": "positive", "tag": "Reaches high targets"})
    if eq.get("score") == "poor" and closed >= MIN_CLOSED_PATTERN: flags.append({"type": "poor_entry", "severity": "warning", "tag": "Wins stuck at TP1"})
    # Correlation
    if len(corr) >= 2:
        names = [c["pair_b"] if c["pair_a"] == pair else c["pair_a"] for c in corr[:2]]
        flags.append({"type": "correlated_risk", "severity": "info", "tag": f"Correlated SL with {', '.join(n.replace('USDT','') for n in names)}"})
    return flags


# ════════════════════════════════════════════
# RANKING
# ════════════════════════════════════════════

def _rank_score(coin):
    score = 0
    flags = coin["anomaly_flags"]
    ft = [f["type"] for f in flags]
    if any(f["severity"] == "danger" for f in flags): score += 1000
    if any(f["severity"] == "warning" for f in flags): score += 500
    bonuses = {"sl_magnet": 300, "chronic_underperformer": 250, "volatile_danger": 280, "losing_streak": 200,
        "wr_decline": 200, "slow_recovery": 150, "bad_rr": 120, "flow_underperformer": 180, "tp1_trap": 100,
        "poor_entry": 100, "hot_streak": 100, "wr_surprise": 150, "flow_outperformer": 120, "tp4_king": 80,
        "stable_winner": 100, "great_rr": 90, "fast_recovery": 80, "excellent_entry": 90, "dow_pattern": 40, "correlated_risk": 30}
    for f in ft: score += bonuses.get(f, 0)
    streak = coin.get("current_streak", {})
    if streak.get("type") == "loss": score += streak.get("length", 0) * 25
    elif streak.get("type") == "win": score += streak.get("length", 0) * 10
    score += min(coin["closed_trades"], 50) * 2
    score += len(ft) * 15
    if "low_sample" in ft: score -= 500
    return score


# ════════════════════════════════════════════
# INSIGHT GENERATION (deep, multi-paragraph)
# ════════════════════════════════════════════

def _build_insight(pair, wr, sr, closed, wins, sl, tp1, tp2, tp3, tp4,
                   avg_outcome, streak_type, streak_len,
                   current_flow, current_flow_wr, platform_avg_wr,
                   fp, wr_30d, flags, history, vol, dow, recovery, eq,
                   corr, monthly, hour, tp4s, risk_score):
    symbol = pair.replace("USDT", "")
    fl = FLOW_LABEL.get(current_flow, current_flow)
    cf = fp.get(current_flow, {})
    hi = fp.get("high", {})
    ft = [f["type"] for f in flags]
    lines = []

    # ── Risk Score headline ──
    if risk_score > 0:
        grade = "Excellent" if risk_score >= 80 else "Good" if risk_score >= 65 else "Average" if risk_score >= 45 else "Poor" if risk_score >= 25 else "Very Poor"
        lines.append(f"**Risk Score: {risk_score}/100 ({grade}).** ")

    # ── Primary verdict ──
    if "sl_magnet" in ft or "chronic_underperformer" in ft:
        lines.append(f"**{sl} out of {closed} calls hit SL** ({sr}% SL rate), significantly above platform average.")
        if hi.get("calls", 0) >= 2:
            lines.append(f"Even on High WR days (platform ≥70%), {symbol} only achieves {hi['wr']}% WR ({hi['wins']}W/{hi['losses']}L from {hi['calls']} calls).")
        if cf.get("calls", 0) >= 2:
            lines.append(f"In the current {fl} (platform WR {current_flow_wr}%), {symbol} has {cf['wr']}% WR — {'still below average.' if cf['wr'] < 70 else 'marginally acceptable.'}")
        lines.append("**Recommendation: Skip or use minimal position size.**")
    elif "volatile_danger" in ft:
        lines.append(f"{symbol} is highly **volatile** (P/L stddev {vol['pl_stddev']}%) with only {wr}% WR. Outcomes are unpredictable.")
        if vol.get("avg_loss_pl"): lines.append(f"Average loss per SL: {vol['avg_loss_pl']}%. Average win: +{vol.get('avg_win_pl', 0)}%.")
    elif "flow_outperformer" in ft:
        lines.append(f"Platform is in **{fl}** (WR {current_flow_wr}%), but {symbol} historically achieves **{cf.get('wr', 0)}% WR** on days like today — {cf.get('wins', 0)} wins from {cf.get('calls', 0)} calls.")
        fh = [h for h in history if h.get("flow") == current_flow]
        ht = sum(1 for h in fh if h["outcome"] in ("tp3", "tp4"))
        if ht > 0: lines.append(f"Of those wins, **{ht} reached TP3/TP4** — strong target achievement even in tough conditions.")
    elif "tp1_trap" in ft:
        tp1p = round(tp1/wins*100) if wins > 0 else 0
        lines.append(f"Win rate of {wr}% looks solid, but **{tp1p}% of wins only reach TP1** — low reward per trade. Average TP level: {eq.get('avg_tp_level', 0)}/4.")
    elif "wr_surprise" in ft and wr_30d is not None:
        lines.append(f"All-time WR {wr}%, but **last 30d shows {wr_30d}%** (+{round(wr_30d-wr)}pt). Significant improvement trend.")
    elif "wr_decline" in ft and wr_30d is not None:
        lines.append(f"All-time WR {wr}%, but **last 30d dropped to {wr_30d}%** (-{round(wr-wr_30d)}pt). Deteriorating performance.")
    elif "flow_underperformer" in ft:
        lines.append(f"{symbol} overall WR {wr}%, but in **{fl}** conditions only {cf.get('wr', 0)}% ({cf.get('wins', 0)}W/{cf.get('losses', 0)}L). Underperforms in current market.")
    elif "low_sample" in ft:
        lines.append(f"Only **{closed} closed trade{'s' if closed > 1 else ''}** — insufficient data for reliable analysis. Monitor closely.")
        return " ".join(lines)

    # ── Volatility & R:R ──
    if vol.get("profile") != "unknown" and "volatile_danger" not in ft:
        if vol["profile"] == "stable":
            lines.append(f"**Volatility: Stable** (stddev {vol['pl_stddev']}%). Consistent outcomes. Avg win: +{vol['avg_win_pl']}%, avg loss: {vol['avg_loss_pl']}%.")
        elif vol["profile"] == "volatile":
            lines.append(f"**Volatility: High** (stddev {vol['pl_stddev']}%). Outcomes swing significantly.")
        if vol.get("rr_ratio", 0) >= 2.5:
            lines.append(f"**Reward-to-risk ratio: {vol['rr_ratio']}x** — excellent, average win significantly exceeds average loss.")
        elif vol.get("rr_ratio", 0) < 0.8 and vol["rr_ratio"] > 0:
            lines.append(f"**Reward-to-risk ratio: {vol['rr_ratio']}x** — poor, average win (+{vol['avg_win_pl']}%) is smaller than average loss ({vol['avg_loss_pl']}%).")

    # ── Entry Quality ──
    if eq.get("score") not in ("unknown", None):
        if eq["score"] == "excellent":
            lines.append(f"**Entry quality: Excellent.** {eq['reaches_potential']}% of wins exceed TP1, {eq['full_target_rate']}% hit full TP4. Avg TP level: {eq['avg_tp_level']}/4.")
        elif eq["score"] == "poor" and "poor_entry" in ft:
            lines.append(f"**Entry quality: Poor.** {eq['tp1_only_pct']}% of wins stop at TP1 — coin rarely reaches higher targets.")

    # ── TP4 Streaks ──
    if tp4s.get("total_tp4", 0) >= 3:
        lines.append(f"**Full target (TP4):** Hit {tp4s['total_tp4']} times total. Longest consecutive TP4 streak: {tp4s['longest_streak']}.")
        if tp4s.get("current_tp4_streak", 0) >= 2:
            lines.append(f"Currently on a **{tp4s['current_tp4_streak']}-call TP4 streak**.")

    # ── Monthly Trend ──
    if len(monthly) >= 3:
        recent_months = monthly[-3:]
        wrs = [m["wr"] for m in recent_months]
        trend = "improving" if wrs[-1] > wrs[0] + 5 else "declining" if wrs[-1] < wrs[0] - 5 else "stable"
        month_str = ", ".join([f"{m['month']}: {m['wr']}%" for m in recent_months])
        lines.append(f"**Monthly trend ({trend}):** {month_str}.")

    # ── Hour-of-Day ──
    if hour.get("has_pattern"):
        lines.append(f"**Time pattern:** Best entry hour around **{hour['best_hour']}:00 UTC** ({hour['best_hour_wr']}% WR from {hour['best_hour_trades']} trades), worst at {hour['worst_hour']}:00 ({hour['worst_hour_wr']}%).")
        if hour.get("best_block"):
            lines.append(f"Best time block: **{hour['best_block']}** ({hour['best_block_wr']}% WR).")

    # ── Day-of-Week ──
    if dow.get("has_pattern") and dow.get("spread", 0) >= 20:
        lines.append(f"**Day pattern:** Best on **{dow['best_day']}** ({dow['best_day_wr']}% WR), worst on **{dow['worst_day']}** ({dow['worst_day_wr']}%) — {dow['spread']}pt spread.")

    # ── Recovery ──
    if recovery:
        if recovery["speed_label"] == "slow":
            lines.append(f"**Recovery: Slow.** After SL, takes avg **{recovery['avg_signals_to_recover']} signals** to win again (worst: {recovery['slowest_recovery']}).")
        elif recovery["speed_label"] == "fast":
            lines.append(f"**Recovery: Fast.** Bounces back within **{recovery['avg_signals_to_recover']} signals** after SL.")

    # ── Correlation ──
    if corr and "correlated_risk" in ft:
        names = [c["pair_b"] if c["pair_a"] == pair else c["pair_a"] for c in corr[:2]]
        lines.append(f"**Correlated risk:** Tends to SL alongside **{', '.join(n.replace('USDT','') for n in names)}**. Avoid simultaneous positions.")

    # ── Streak ──
    if streak_type == "win" and streak_len >= 3 and "hot_streak" in ft:
        lines.append(f"Currently on a **{streak_len}-call win streak** — strong momentum.")
    elif streak_type == "loss" and streak_len >= 3 and "losing_streak" in ft:
        lines.append(f"Currently on a **{streak_len}-call SL streak** — avoid until momentum reverses.")

    # ── Platform comparison ──
    if closed >= MIN_CLOSED_RELIABLE and "chronic_underperformer" not in ft:
        diff = round(wr - platform_avg_wr, 1)
        if diff <= -15: lines.append(f"{symbol} WR {wr}% is **{abs(diff)}pt below** platform avg ({platform_avg_wr}%).")
        elif diff >= 15: lines.append(f"{symbol} WR {wr}% is **{diff}pt above** platform avg ({platform_avg_wr}%) — top performer.")

    # ── 30d trend ──
    if wr_30d is not None and "wr_surprise" not in ft and "wr_decline" not in ft and closed >= MIN_CLOSED_RELIABLE:
        d = round(wr_30d - wr, 1)
        if abs(d) >= 10:
            lines.append(f"30-day WR: {wr_30d}% ({'+' if d > 0 else ''}{d}pt vs all-time) — {'improving' if d > 0 else 'declining'}.")

    return " ".join(lines) if lines else f"{symbol}: {wr}% win rate from {closed} closed trades. Risk score: {risk_score}/100."


# ════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════

def _empty_response(flow, flow_wr, plat_wr):
    return {"current_flow": flow, "current_flow_wr": flow_wr, "platform_avg_wr": plat_wr,
            "flow_timeline": [], "top_coins": [], "rest_coins": [], "correlation_clusters": [],
            "total_active_pairs": 0, "total_flagged": 0, "computed_at": datetime.utcnow().isoformat()}

def _calc_avg_outcome(closed, wins, sl, tp1, tp2, tp3, tp4):
    if closed == 0: return "open"
    if sl >= wins: return "SL"
    counts = [("TP1", tp1), ("TP2", tp2), ("TP3", tp3), ("TP4", tp4)]
    counts.sort(key=lambda x: x[1], reverse=True)
    return counts[0][0] if counts[0][1] > 0 else "SL"

def _calc_streak(history):
    if not history: return "none", 0
    first_win = history[0]["outcome"] in ("tp1", "tp2", "tp3", "tp4")
    st = "win" if first_win else "loss"
    length = 0
    for h in history:
        if (h["outcome"] in ("tp1", "tp2", "tp3", "tp4")) == first_win: length += 1
        else: break
    return st, length