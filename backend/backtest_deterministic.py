"""
Backtest: deterministic direction vs LLM, on historical ledger data.
====================================================================
For each evaluated outcome (24h/72h) we have price_at_call & price_at_horizon
=> the REAL price direction. We reconstruct what the deterministic engine would
have said (from the confluence/cycle/liquidity stored in each report_json) and
score BOTH the LLM and the deterministic call against reality.

Run from backend/:
  source venv/bin/activate; set -a; source .env; set +a
  python3 backtest_deterministic.py
"""
import json
from collections import defaultdict
from app.core.database import SessionLocal
from sqlalchemy import text
from app.services.deterministic_verdict import compute_deterministic_direction

# minimal move to count as directional (avoid noise around flat)
FLAT_PCT = 0.3  # |move| < 0.3% => treat as 'neutral' actual

def real_direction(p_call, p_hz):
    if not p_call or not p_hz:
        return None
    move = (p_hz - p_call) / p_call * 100
    if move > FLAT_PCT:
        return "bullish", move
    if move < -FLAT_PCT:
        return "bearish", move
    return "neutral", move

def scored(call_dir, actual_dir):
    """hit if same direction; neutral calls never 'win' but don't count as miss on trend."""
    if call_dir == "neutral":
        return None  # abstain — exclude from accuracy denominator
    return call_dir == actual_dir

def main():
    db = SessionLocal()
    # join outcomes (24h/72h, evaluated) with their report_json
    rows = db.execute(text("""
        SELECT o.horizon, o.direction AS llm_dir, o.price_at_call, o.price_at_horizon,
               r.report_json
        FROM ai_arena_verdict_outcomes o
        JOIN ai_arena_reports r ON r.report_id = o.report_uuid
        WHERE o.outcome IN ('hit','miss') AND o.horizon IN ('24h','72h')
        ORDER BY o.horizon_target_at ASC
    """)).fetchall()
    db.close()

    agg = defaultdict(lambda: {"n":0, "llm_hit":0, "llm_n":0, "det_hit":0, "det_n":0,
                               "disagree":0, "disagree_det_right":0, "disagree_llm_right":0,
                               "no_liq":0})

    for horizon, llm_dir, p_call, p_hz, rj in rows:
        if isinstance(rj, str):
            rj = json.loads(rj)
        actual = real_direction(p_call, p_hz)
        if actual is None:
            continue
        actual_dir, move = actual

        conf = rj.get("confluence") or {}
        cyc  = rj.get("cycle_position") or {}
        liq_doc = rj.get("liquidity") or {}
        liq_layer = liq_doc.get("layer") if isinstance(liq_doc, dict) else None

        det = compute_deterministic_direction(liq_layer, conf, cyc)
        key = "tactical_24h" if horizon == "24h" else "secondary_7d"
        det_dir = det[key]["direction"]

        a = agg[horizon]
        a["n"] += 1
        if liq_layer is None:
            a["no_liq"] += 1

        llm_s = scored(llm_dir, actual_dir)
        det_s = scored(det_dir, actual_dir)
        if llm_s is not None:
            a["llm_n"] += 1; a["llm_hit"] += int(llm_s)
        if det_s is not None:
            a["det_n"] += 1; a["det_hit"] += int(det_s)
        if llm_dir != det_dir:
            a["disagree"] += 1
            if det_s: a["disagree_det_right"] += 1
            if llm_s: a["disagree_llm_right"] += 1

    print("="*64)
    print("BACKTEST: deterministic vs LLM (historical ledger)")
    print("  actual direction from price_at_call -> price_at_horizon")
    print("  neutral calls excluded from accuracy denominator")
    print("="*64)
    for h in ("24h","72h"):
        a = agg[h]
        if a["n"] == 0:
            print(f"\n[{h}] no data"); continue
        llm_acc = a["llm_hit"]/a["llm_n"]*100 if a["llm_n"] else 0
        det_acc = a["det_hit"]/a["det_n"]*100 if a["det_n"] else 0
        print(f"\n[{h}]  total evaluated = {a['n']}  (liquidity missing in {a['no_liq']})")
        print(f"   LLM accuracy : {llm_acc:5.1f}%  ({a['llm_hit']}/{a['llm_n']} directional calls)")
        print(f"   DET accuracy : {det_acc:5.1f}%  ({a['det_hit']}/{a['det_n']} directional calls)")
        print(f"   disagreements: {a['disagree']}  -> det right {a['disagree_det_right']} | llm right {a['disagree_llm_right']}")

if __name__ == "__main__":
    main()
