"""
Backtest v2: hanya sampel yang PUNYA liquidity, uji beberapa set bobot.
Menjawab: dengan liquidity (sinyal sebenarnya), bobot mana yang terbaik?
"""
import json
from collections import defaultdict
from app.core.database import SessionLocal
from sqlalchemy import text

FLAT_PCT = 0.3
_SW = {"WEAK":0.3,"MODERATE":0.6,"STRONG":0.9}

def sgn(v):
    v=(v or "").upper()
    return 1 if v.startswith("BULL") else (-1 if v.startswith("BEAR") else 0)
def strg(v):
    if isinstance(v,(int,float)): return max(0,min(1,float(v)))
    return _SW.get((v or "").upper(),0.3)
def cyc_bias(s):
    try: s=float(s)
    except: return 0.0
    return 0.5 if s<40 else (-0.5 if s>60 else 0.0)
def real_dir(pc,ph):
    if not pc or not ph: return None
    m=(ph-pc)/pc*100
    return ("bullish" if m>FLAT_PCT else "bearish" if m<-FLAT_PCT else "neutral")

# set bobot yang diuji: (liq, conf, cyc), ambang
WEIGHT_SETS = {
    "current(0.65/0.30/0.05)": ((0.65,0.30,0.05),0.15),
    "liq-heavy(0.80/0.10/0.10)": ((0.80,0.10,0.10),0.15),
    "liq-only(1.0/0/0)": ((1.0,0.0,0.0),0.15),
    "liq-dom(0.70/0.0/0.30)": ((0.70,0.0,0.30),0.15),
    "liq-only-lowthr(1.0/0/0,thr0.05)": ((1.0,0.0,0.0),0.05),
}

def direction(score, thr):
    return "bullish" if score>=thr else ("bearish" if score<=-thr else "neutral")

def main():
    db=SessionLocal()
    rows=db.execute(text("""
        SELECT o.horizon, o.direction llm, o.price_at_call pc, o.price_at_horizon ph, r.report_json rj
        FROM ai_arena_verdict_outcomes o
        JOIN ai_arena_reports r ON r.report_id = o.report_uuid
        WHERE o.outcome IN ('hit','miss') AND o.horizon IN ('24h','72h')
    """)).fetchall()
    db.close()

    # filter hanya yang punya liquidity
    samples=defaultdict(list)  # horizon -> list of (liq_s, conf_s, cyc_s, llm, actual)
    for horizon,llm,pc,ph,rj in rows:
        if isinstance(rj,str): rj=json.loads(rj)
        ad=real_dir(pc,ph)
        if ad is None: continue
        liq=(rj.get("liquidity") or {}).get("layer")
        if not liq: continue  # HANYA yang punya liquidity
        liq_s=sgn(liq.get("verdict"))*strg(liq.get("strength"))
        conf=rj.get("confluence") or {}
        conf_s=sgn(conf.get("dominant_direction"))*strg(conf.get("strength"))
        cyc_s=cyc_bias((rj.get("cycle_position") or {}).get("score"))
        samples[horizon].append((liq_s,conf_s,cyc_s,llm,ad))

    for horizon in ("24h","72h"):
        S=samples[horizon]
        print(f"\n{'='*60}\n[{horizon}] sampel ber-liquidity: {len(S)}")
        if not S: 
            print("  (tidak ada sampel ber-liquidity)"); continue
        # baseline LLM pada subset ini
        llm_n=llm_hit=0
        for liq_s,conf_s,cyc_s,llm,ad in S:
            if llm!="neutral":
                llm_n+=1; llm_hit+=int(llm==ad)
        print(f"  LLM: {llm_hit/llm_n*100:.1f}% ({llm_hit}/{llm_n})" if llm_n else "  LLM: n/a")
        # tiap set bobot
        for name,((wl,wc,wy),thr) in WEIGHT_SETS.items():
            n=hit=0
            for liq_s,conf_s,cyc_s,llm,ad in S:
                sc=wl*liq_s+wc*conf_s+wy*cyc_s
                d=direction(sc,thr)
                if d!="neutral":
                    n+=1; hit+=int(d==ad)
            acc=f"{hit/n*100:.1f}% ({hit}/{n})" if n else "n/a (semua neutral)"
            print(f"  DET {name:38s}: {acc}")

if __name__=="__main__":
    main()
