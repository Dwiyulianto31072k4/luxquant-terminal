"""
Preliminary TOKEN-FLOW calibration backtest.

Joins historical signals + their top outcome (highest TP reached, or SL) +
`flow_daily` (net CEX flow on the signal's call date) → compares win-rate for
'accumulation' (net OUTflow = coins leaving exchanges) vs 'selling' (net INflow).

If accumulation wins meaningfully more often, the token-flow factor is predictive
→ set a proportional weight in flowScoreOf (ConfluenceTabs.jsx). If not → weight 0.

Run:  python3 scripts/backtest_flow.py
Note: preliminary — only covers signals whose base token is an Ethereum ERC20 in
flow_daily and that already closed (TP/SL). More data (forward capture) = stronger.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from sqlalchemy import text
from app.core.database import SessionLocal

Q = text("""
WITH outc AS (
    SELECT signal_id, outcome FROM (
        SELECT signal_id,
            CASE
                WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 'tp4'
                WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 'tp3'
                WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 'tp2'
                WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 'tp1'
                WHEN LOWER(update_type) LIKE '%sl%'  OR LOWER(update_type) LIKE '%stop%'     THEN 'sl'
                ELSE NULL END AS outcome,
            ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY
                CASE
                    WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 4
                    WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 3
                    WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 2
                    WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 1
                    WHEN LOWER(update_type) LIKE '%sl%'  OR LOWER(update_type) LIKE '%stop%'     THEN 0
                    ELSE -1 END DESC) AS rn
        FROM signal_updates
    ) x WHERE rn = 1 AND outcome IS NOT NULL
),
joined AS (
    SELECT
        CASE WHEN o.outcome = 'sl' THEN 0 ELSE 1 END AS win,
        fd.net_inflow_usd
    FROM signals s
    JOIN outc o ON o.signal_id = s.signal_id
    JOIN flow_daily fd
        ON fd.day = CAST(substring(s.created_at, 1, 10) AS date)
       AND fd.symbol = UPPER(regexp_replace(s.pair, '(USDT|USDC|USD)$', ''))
)
SELECT
    CASE WHEN net_inflow_usd < 0 THEN 'accumulation' ELSE 'selling' END AS bucket,
    COUNT(*) AS n,
    ROUND(AVG(win)::numeric * 100, 1) AS win_rate
FROM joined
GROUP BY 1
ORDER BY 1
""")


def main():
    db = SessionLocal()
    try:
        rows = db.execute(Q).fetchall()
        if not rows:
            print("No overlap yet (no closed signals matched to flow_daily). "
                  "Wait for more signals to close or widen BACKFILL_DAYS.")
            return
        print(f"{'bucket':<14}{'n':>6}{'win_rate':>10}")
        print("-" * 30)
        d = {}
        for r in rows:
            print(f"{r[0]:<14}{r[1]:>6}{str(r[2]) + '%':>10}")
            d[r[0]] = (int(r[1]), float(r[2]))
        if "accumulation" in d and "selling" in d:
            delta = d["accumulation"][1] - d["selling"][1]
            n_min = min(d["accumulation"][0], d["selling"][0])
            print(f"\nΔ win-rate (accumulation − selling): {delta:+.1f} pp  (min n={n_min})")
            if n_min < 30:
                print("→ sample too small — treat as directional hint only, wait for more data")
            elif abs(delta) >= 5:
                print(f"→ PREDICTIVE. Suggested token-flow weight ≈ {round(delta / 10, 1)} "
                      f"(scale into flowScoreOf; keep conservative)")
            else:
                print("→ not conclusive (|Δ| < 5pp) — keep token-flow weight at 0 for now")
    finally:
        db.close()


if __name__ == "__main__":
    main()
