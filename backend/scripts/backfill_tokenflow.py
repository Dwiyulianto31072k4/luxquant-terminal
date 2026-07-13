"""
One-shot BACKFILL: historical DAILY CEX net-flow per token (Ethereum) → `flow_daily`.

Purpose: calibrate the Confluence "token-flow factor" WITHOUT waiting ~2 weeks for
forward capture. Dune has full transfer history, so we can reconstruct daily net
CEX flow per token for the last N days in ONE query, then join it to historical
signals + outcomes to see which flow states predicted better results.

(Liquidation history CANNOT be backfilled — Coinalyze deletes intraday data daily —
 so the liq factor still needs forward capture via flow_snapshots.)

Run once on the VPS (from the backend/ directory):
    python scripts/backfill_tokenflow.py
Env:
    DUNEAPIKEY_TERMINAL   (already set)
    BACKFILL_DAYS=14      (optional; larger = more Dune credits)

⚠️ Credit note: an N-day Ethereum transfer scan is a heavy ONE-TIME query.
   Default 14 days keeps it affordable within the free 2500 credits/month.
"""
import os
import sys
import time

import httpx

# make `app` importable when run as a plain script from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from sqlalchemy import text
from app.core.database import SessionLocal

API_KEY = os.getenv("DUNEAPIKEY_TERMINAL", "")
DAYS = int(os.getenv("BACKFILL_DAYS", "14"))
BASE = "https://api.dune.com/api/v1"

SQL = f"""
WITH cex AS (
    SELECT DISTINCT address FROM cex.addresses WHERE blockchain = 'ethereum'
),
tf AS (
    SELECT CAST(date_trunc('day', t.block_time) AS date) AS d, t.symbol,
        SUM(CASE WHEN t."to"   IN (SELECT address FROM cex) THEN t.amount_usd ELSE 0 END) AS inflow,
        SUM(CASE WHEN t."from" IN (SELECT address FROM cex) THEN t.amount_usd ELSE 0 END) AS outflow
    FROM tokens.transfers t
    WHERE t.blockchain = 'ethereum'
      AND t.block_time > now() - interval '{DAYS}' day
      AND t.amount_usd IS NOT NULL
      AND (t."to" IN (SELECT address FROM cex) OR t."from" IN (SELECT address FROM cex))
    GROUP BY 1, 2
)
SELECT d, symbol, inflow, outflow, inflow - outflow AS net_inflow_usd
FROM tf
WHERE symbol IS NOT NULL AND inflow + outflow > 50000
"""


def _h():
    return {"X-Dune-API-Key": API_KEY}


def _fetch_rows() -> list[dict]:
    with httpx.Client(timeout=90.0) as c:
        # 1) create the historical query
        r = c.post(f"{BASE}/query", headers=_h(),
                   json={"name": f"LuxQuant TF backfill {DAYS}d", "query_sql": SQL, "is_private": False})
        r.raise_for_status()
        qid = r.json()["query_id"]
        print(f"📝 query_id {qid}")

        # 2) execute (default performance — free plan rejects explicit tiers)
        e = c.post(f"{BASE}/query/{qid}/execute", headers=_h(), json={})
        e.raise_for_status()
        ex = e.json().get("execution_id")
        print(f"⏳ execution {ex} — scanning {DAYS}d of Ethereum transfers…")

        # 3) poll (up to ~10 min)
        state = None
        for _ in range(120):
            time.sleep(5)
            state = c.get(f"{BASE}/execution/{ex}/status", headers=_h()).json().get("state")
            if state == "QUERY_STATE_COMPLETED":
                break
            if state in ("QUERY_STATE_FAILED", "QUERY_STATE_CANCELLED"):
                print(f"❌ execution {state}")
                return []
        if state != "QUERY_STATE_COMPLETED":
            print("❌ execution timed out")
            return []

        # 4) results
        res = c.get(f"{BASE}/execution/{ex}/results?limit=100000", headers=_h())
        res.raise_for_status()
        return res.json().get("result", {}).get("rows", []) or []


def main():
    if not API_KEY:
        print("❌ DUNEAPIKEY_TERMINAL not set")
        sys.exit(1)

    rows = _fetch_rows()
    print(f"📦 fetched {len(rows)} daily rows")
    if not rows:
        sys.exit(1)

    db = SessionLocal()
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS flow_daily (
                day DATE NOT NULL,
                symbol TEXT NOT NULL,
                inflow_usd DOUBLE PRECISION,
                outflow_usd DOUBLE PRECISION,
                net_inflow_usd DOUBLE PRECISION,
                PRIMARY KEY (day, symbol)
            )
        """))
        for r in rows:
            db.execute(text("""
                INSERT INTO flow_daily (day, symbol, inflow_usd, outflow_usd, net_inflow_usd)
                VALUES (:d, :s, :i, :o, :n)
                ON CONFLICT (day, symbol) DO UPDATE SET
                    inflow_usd = EXCLUDED.inflow_usd,
                    outflow_usd = EXCLUDED.outflow_usd,
                    net_inflow_usd = EXCLUDED.net_inflow_usd
            """), {
                "d": r["d"], "s": (r.get("symbol") or "").upper(),
                "i": r.get("inflow"), "o": r.get("outflow"), "n": r.get("net_inflow_usd"),
            })
        db.commit()
        print(f"✅ backfilled {len(rows)} rows into flow_daily "
              f"({DAYS}d Ethereum daily CEX net-flow)")
    except Exception as e:
        db.rollback()
        print(f"❌ DB write failed: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
