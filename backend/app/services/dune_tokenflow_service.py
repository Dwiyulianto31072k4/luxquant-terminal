"""
Dune Token Flow Service — CEX net-inflow per token (SPOT / on-chain).
Data source: Dune Analytics API (free tier: 2500 credits/mo, 15–40 req/min)
  - Docs: https://docs.dune.com/api-reference/executions/endpoint/execute-query
  - Auth: header `X-Dune-API-Key`
  - Model: you author ONE query in Dune (get query_id), we execute it on a slow
    schedule and cache the result. NOT real-time — CEX netflow is a slow metric.

Brand fit (halal / spot-first): this is pure SPOT capital flow — where coins move
INTO exchanges (potential selling pressure) vs OUT (accumulation). No futures.

Interpretation:
  net_inflow_usd > 0  → net flow INTO exchanges  → bearish (supply to sell)
  net_inflow_usd < 0  → net flow OUT of exchanges → bullish (accumulation / hodl)

Expected query result columns (see LUXQUANT_INTEL_ROADMAP §Token Flow):
  symbol, inflow_usd, outflow_usd, net_inflow_usd

Env (set in backend/.env on the VPS):
  DUNEAPIKEY_TERMINAL      = <your Dune API key>
  DUNE_QUERY_ID_TOKENFLOW  = <the query id you created>
"""
import os
import time
import asyncio

import httpx

from app.core.redis import cache_get, cache_set, cache_get_with_stale, is_redis_available
from app.core.leader import is_leader

# ── Config ──────────────────────────────────────────────────────────
DUNE_BASE = "https://api.dune.com/api/v1"
API_KEY = os.getenv("DUNEAPIKEY_TERMINAL", "")
QUERY_ID = os.getenv("DUNE_QUERY_ID_TOKENFLOW", "")

REFRESH_INTERVAL = 6 * 3600   # 6h (credit-safe: ~120 executions/month)
POLL_EVERY = 3                # seconds between status polls
POLL_MAX = 90                 # give up after ~4.5 min
# NOTE: free plan rejects explicit "medium"/"large" via API ("Invalid performance
# tier") — we omit the field and let Dune use the account default.

CACHE_KEY = "lq:terminal:tokenflow"   # single JSON string {symbol: blob}
CACHE_TTL = 8 * 3600                   # 8h (a bit > refresh so stale never gaps)


def _headers() -> dict:
    return {"X-Dune-API-Key": API_KEY}


# ════════════════════════════════════════════════════════════════════
# Execute the Dune query → poll → fetch results
# ════════════════════════════════════════════════════════════════════
async def _execute_and_fetch() -> list[dict]:
    if not API_KEY or not QUERY_ID:
        print("⚠️ Dune token-flow: DUNEAPIKEY_TERMINAL / DUNE_QUERY_ID_TOKENFLOW not set")
        return []

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1) trigger execution
        r = await client.post(
            f"{DUNE_BASE}/query/{QUERY_ID}/execute",
            headers=_headers(),
            json={},
        )
        r.raise_for_status()
        execution_id = r.json().get("execution_id")
        if not execution_id:
            print("❌ Dune: no execution_id returned")
            return []

        # 2) poll status
        state = None
        for _ in range(POLL_MAX // POLL_EVERY):
            await asyncio.sleep(POLL_EVERY)
            s = await client.get(f"{DUNE_BASE}/execution/{execution_id}/status", headers=_headers())
            s.raise_for_status()
            state = s.json().get("state")
            if state == "QUERY_STATE_COMPLETED":
                break
            if state in ("QUERY_STATE_FAILED", "QUERY_STATE_CANCELLED"):
                print(f"❌ Dune execution {state}")
                return []

        if state != "QUERY_STATE_COMPLETED":
            print("⏳ Dune execution timed out")
            return []

        # 3) fetch results
        res = await client.get(f"{DUNE_BASE}/execution/{execution_id}/results", headers=_headers())
        res.raise_for_status()
        return res.json().get("result", {}).get("rows", []) or []


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


async def refresh() -> dict:
    """Entrypoint for the scheduled worker. Executes the query, caches {symbol: blob}."""
    rows = await _execute_and_fetch()
    out: dict[str, dict] = {}
    for row in rows:
        sym = (row.get("symbol") or "").upper()
        if not sym:
            continue
        net = _to_float(row.get("net_inflow_usd"))
        out[sym] = {
            "symbol": sym,
            "inflow_usd": round(_to_float(row.get("inflow_usd")), 2),
            "outflow_usd": round(_to_float(row.get("outflow_usd")), 2),
            "net_inflow_usd": round(net, 2),
            # bullish when coins LEAVE exchanges (net outflow)
            "bias": "bullish" if net < 0 else "bearish",
            "updated_at": int(time.time()),
        }
    if out:
        cache_set(CACHE_KEY, out, ttl=CACHE_TTL)
        print(f"✅ Dune token-flow: {len(out)} tokens cached")
    return out


def get_scoped(symbols: list[str] | None = None) -> dict:
    """Read cached token-flow blobs (optionally filtered to base symbols like 'ETH')."""
    data, _stale = cache_get_with_stale(CACHE_KEY)   # serve-stale → never blanks on a delayed/failed refresh
    data = data or {}
    if symbols:
        want = {s.upper() for s in symbols}
        return {k: v for k, v in data.items() if k in want}
    return data


# ════════════════════════════════════════════════════════════════════
# Background worker (leader-elected)
# ════════════════════════════════════════════════════════════════════
async def token_flow_loop():
    print(f"🔄 Dune token-flow worker started (interval: {REFRESH_INTERVAL}s)")
    await asyncio.sleep(20)   # let the box settle after (re)start
    while True:
        if not is_leader():
            await asyncio.sleep(30)
            continue
        try:
            if is_redis_available():
                await refresh()
        except Exception as e:
            print(f"❌ Dune token-flow worker error: {type(e).__name__}: {e}")
        await asyncio.sleep(REFRESH_INTERVAL)


def start_token_flow_worker():
    """Register in poller_main.py (staggered) — same place as Coinalyze."""
    if not API_KEY or not QUERY_ID:
        print("⚠️ Dune token-flow worker NOT started (DUNEAPIKEY_TERMINAL / DUNE_QUERY_ID_TOKENFLOW missing)")
        return
    loop = asyncio.get_event_loop()
    loop.create_task(token_flow_loop())
    print("📊 Dune token-flow worker registered (interval: 6h)")
