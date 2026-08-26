"""
Backtest harness for the Compass direction rule.

What it can and cannot measure
------------------------------
Each historical contract carries the inputs the scorer saw, the target and
invalidation distances the LLM then chose, and which barrier price reached
first. That is enough to answer exactly one question exactly: **what would this
book have earned if some subset of these calls had not been published?**

It cannot answer "what if the direction had been flipped", because the levels
were written for the direction that was chosen — flipping means inventing
distances the LLM never produced. So every rule here is a SUPPRESSION rule, and
its result is a real number rather than a simulation.
"""
import csv, math, statistics as st
from math import erfc

def load(path):
    out=[]
    for r in csv.reader(open(path), delimiter="|"):
        if len(r)<13: continue
        out.append(dict(
            pid=r[0], when=r[1][:10], bias=r[2],
            price24=float(r[3]), price72=float(r[4]), liq=float(r[5]),
            deriv=float(r[6]), pos=float(r[7]), cycle=float(r[8]),
            score=float(r[9]), outcome=r[10],
            gain=float(r[11]), loss=float(r[12]),
        ))
    return out

def realised(c):
    """Actual % return of this call, as published."""
    if c["bias"] == "NEUTRAL_RANGE":
        return None                      # no directional P&L to claim
    return c["gain"] if c["outcome"] in ("CLEAN_HIT","LATE_HIT") else -c["loss"]

def evaluate(rows, rule, label):
    taken=[realised(c) for c in rows if realised(c) is not None and rule(c)]
    skipped=[realised(c) for c in rows if realised(c) is not None and not rule(c)]
    if not taken:
        return None
    n=len(taken); m=st.mean(taken); s=st.stdev(taken) if n>1 else 0
    t=m/(s/math.sqrt(n)) if s else 0
    p=erfc(abs(t)/math.sqrt(2)) if s else 1
    return dict(label=label, n=n, ev=m, total=sum(taken), t=t, p=p,
                dibuang=len(skipped), ev_dibuang=st.mean(skipped) if skipped else 0)

def show(res, indent="  "):
    if not res:
        print(f"{indent}{'(tidak ada panggilan tersisa)'}"); return
    print(f"{indent}{res['label']:38} n={res['n']:3}  EV={res['ev']:+.3f}%  "
          f"total={res['total']:+7.1f}%  p={res['p']:.4f}   "
          f"(dibuang {res['dibuang']}, EV-nya {res['ev_dibuang']:+.3f}%)")


# ── Menjalankan ulang ────────────────────────────────────────────────
# Ekspor datasetnya dengan (di VPS, sebagai postgres):
#
#   SELECT c.projection_id, c.active_from, c.primary_bias,
#          inputs->>'price_24_s', inputs->>'price_72_s', inputs->>'liq_s',
#          inputs->>'deriv_s', inputs->>'positioning_s', inputs->>'cycle_context_s',
#          tactical->>'det_score', res.outcome,
#          abs(c.primary_touch_level-c.reference_price)/c.reference_price*100,
#          abs(c.invalidation_level -c.reference_price)/c.reference_price*100
#   FROM compass_projection_resolutions res
#   JOIN compass_projection_contracts c USING (projection_id)
#   JOIN compass_reads cr ON cr.read_id = c.read_id
#   JOIN ai_arena_reports r ON r.report_id = cr.report_id, ...
#
# then:  python3 compass_backtest.py dataset.csv
#
# ALWAYS split by time and report both halves. Every rule tried here that was
# fitted on the full sample looked good and then failed out of sample; the one
# that survived (withhold bearish) was the one with a prior reason to exist.

if __name__ == "__main__":
    import sys
    rows = load(sys.argv[1] if len(sys.argv) > 1 else "dataset.csv")
    dirs = [c for c in rows if c["bias"] != "NEUTRAL_RANGE"]
    BEAR = lambda c: c["bias"].startswith("BEAR")
    juli = [c for c in dirs if c["when"] < "2026-08-01"]
    agus = [c for c in dirs if c["when"] >= "2026-08-01"]
    for nama, f in (("as published", lambda c: True),
                    ("withhold bearish", lambda c: not BEAR(c))):
        print(nama)
        show(evaluate(dirs, f, "  full sample"))
        show(evaluate(juli, f, "  first half"))
        show(evaluate(agus, f, "  second half"))
        print()
