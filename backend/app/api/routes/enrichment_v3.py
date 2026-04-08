"""
LuxQuant Enrichment v3 API Routes
==================================
New API endpoints for v3 facts+tags enrichment data.
Separate file from existing signals.py to avoid breaking changes.

Endpoints:
- GET /api/v1/enrichment/v3/{signal_id}           — entry + live snapshot
- GET /api/v1/enrichment/v3/{signal_id}/history   — progressive history
- GET /api/v1/enrichment/v3/{signal_id}/export/md — markdown export for AI
- GET /api/v1/enrichment/v3/{signal_id}/export/prompt — AI-ready prompt

Mount in main.py:
    from app.api.routes import enrichment_v3
    app.include_router(enrichment_v3.router)

Author: LuxQuant Team
Version: v3.0
"""

import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import create_engine, text

logger = logging.getLogger("enrichment-v3-api")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)
engine = create_engine(DATABASE_URL, future=True)

router = APIRouter(prefix="/api/v1/enrichment/v3", tags=["enrichment-v3"])


# ============================================================
# DB HELPERS
# ============================================================

def fetch_signal_basic(signal_id: str) -> Optional[dict]:
    """Fetch minimal signal info."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT signal_id, pair, entry, target1, target2, target3, target4,
                   stop1, stop2, status, risk_level, created_at
            FROM signals
            WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()
    return dict(row._mapping) if row else None


def fetch_enrichment_v3(signal_id: str) -> Optional[dict]:
    """Fetch v3 enrichment snapshots + metadata."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT
                signal_id,
                pair,
                entry_snapshot,
                live_snapshot,
                live_updated_at,
                analyzed_at,
                enrichment_version,
                signal_direction
            FROM signal_enrichment
            WHERE signal_id = :sid
        """), {"sid": signal_id}).fetchone()

    if not row:
        return None

    data = dict(row._mapping)

    # Parse JSONB columns (they come back as dict already with psycopg, but be safe)
    for key in ("entry_snapshot", "live_snapshot"):
        val = data.get(key)
        if isinstance(val, str):
            try:
                data[key] = json.loads(val)
            except Exception:
                data[key] = {}
        elif val is None:
            data[key] = {}

    return data


def fetch_enrichment_history(signal_id: str, limit: int = 100) -> list:
    """Fetch history of live snapshots for progressive disclosure."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT snapshot, recorded_at
            FROM signal_enrichment_history
            WHERE signal_id = :sid
            ORDER BY recorded_at DESC
            LIMIT :limit
        """), {"sid": signal_id, "limit": limit}).fetchall()

    result = []
    for r in rows:
        snap = r.snapshot
        if isinstance(snap, str):
            try:
                snap = json.loads(snap)
            except Exception:
                snap = {}
        result.append({
            "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
            "snapshot": snap,
        })
    return result


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/{signal_id}")
def get_enrichment_v3(signal_id: str):
    """
    Get v3 enrichment data for a signal.
    Returns entry_snapshot (frozen) + live_snapshot (latest) + metadata.
    """
    signal = fetch_signal_basic(signal_id)
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")

    enrichment = fetch_enrichment_v3(signal_id)
    if not enrichment:
        # Signal exists but not yet enriched
        return JSONResponse({
            "signal_id": signal_id,
            "pair": signal["pair"],
            "status": "not_enriched",
            "entry_snapshot": None,
            "live_snapshot": None,
            "message": "Signal has not been enriched yet",
        })

    entry = enrichment.get("entry_snapshot", {}) or {}
    live = enrichment.get("live_snapshot", {}) or {}

    if not entry or entry == {}:
        return JSONResponse({
            "signal_id": signal_id,
            "pair": signal["pair"],
            "status": "legacy_only",
            "entry_snapshot": None,
            "live_snapshot": None,
            "message": "Only legacy enrichment available (v2.x)",
        })

    return JSONResponse({
        "signal_id": signal_id,
        "pair": signal["pair"],
        "status": "enriched",
        "signal_info": {
            "entry": float(signal["entry"]) if signal.get("entry") is not None else None,
            "target1": float(signal["target1"]) if signal.get("target1") is not None else None,
            "target2": float(signal["target2"]) if signal.get("target2") is not None else None,
            "target3": float(signal["target3"]) if signal.get("target3") is not None else None,
            "target4": float(signal["target4"]) if signal.get("target4") is not None else None,
            "stop1": float(signal["stop1"]) if signal.get("stop1") is not None else None,
            "current_status": signal.get("status"),
            "created_at": signal.get("created_at"),
        },
        "entry_snapshot": entry,
        "live_snapshot": live,
        "live_updated_at": enrichment["live_updated_at"].isoformat() if enrichment.get("live_updated_at") else None,
        "analyzed_at": enrichment["analyzed_at"].isoformat() if enrichment.get("analyzed_at") else None,
        "version": enrichment.get("enrichment_version"),
    })


@router.get("/{signal_id}/history")
def get_enrichment_history(
    signal_id: str,
    limit: int = Query(default=50, le=200, ge=1),
):
    """
    Get history of live snapshots (progressive disclosure).
    Returns list of snapshots recorded at different timestamps.
    """
    signal = fetch_signal_basic(signal_id)
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")

    history = fetch_enrichment_history(signal_id, limit=limit)

    return JSONResponse({
        "signal_id": signal_id,
        "pair": signal["pair"],
        "count": len(history),
        "history": history,
    })


# ============================================================
# EXPORT ENDPOINTS (for Copy to AI feature)
# ============================================================

def format_snapshot_as_markdown(signal: dict, snapshot: dict, label: str = "Entry") -> str:
    """Format a snapshot as human/AI-readable markdown."""
    if not snapshot or snapshot == {}:
        return "*No data available*"

    facts = snapshot.get("facts", {})
    tags = snapshot.get("tags", [])
    signal_dir = snapshot.get("signal_direction", "UNKNOWN")

    by_tf = facts.get("by_timeframe", {})
    m15 = by_tf.get("m15", {})
    h1 = by_tf.get("h1", {})
    h4 = by_tf.get("h4", {})
    eq = facts.get("entry_quality", {})
    levels = facts.get("levels", {})
    structure = facts.get("structure", {})
    context = facts.get("context", {})

    md = [f"## {label} Snapshot — {signal_dir}"]
    md.append(f"*Computed at: {snapshot.get('computed_at', 'unknown')}*")
    md.append("")

    # Trend section
    md.append("### Trend (Multi-Timeframe)")
    for tf_name, tf_data in [("M15", m15), ("H1", h1), ("H4", h4)]:
        t = tf_data.get("trend", {})
        if not t:
            continue
        trend = t.get("trend", "?")
        adx = t.get("adx")
        strength = t.get("trend_strength", "?")
        ema_gap = t.get("ema_gap_atr")
        ema200 = t.get("ema200")
        close = t.get("close")
        ema200_pos = ""
        if ema200 is not None and close is not None:
            ema200_pos = " above EMA200" if close > ema200 else " below EMA200"
        adx_str = f"ADX {adx:.1f}, {strength}" if adx is not None else strength
        md.append(f"- **{tf_name}**: {trend} ({adx_str}, gap {ema_gap} ATR){ema200_pos}")
    md.append("")

    # Momentum
    md.append("### Momentum")
    for tf_name, tf_data in [("M15", m15), ("H1", h1), ("H4", h4)]:
        m = tf_data.get("momentum", {})
        if not m:
            continue
        rsi = m.get("rsi")
        rsi_state = m.get("rsi_state", "?")
        macd = m.get("macd_hist")
        macd_dir = m.get("macd_direction", "?")
        rsi_str = f"{rsi:.1f}" if rsi is not None else "?"
        macd_str = f"{macd:+.6f}" if macd is not None else "?"
        md.append(f"- **{tf_name}**: RSI {rsi_str} ({rsi_state}), MACD {macd_str} ({macd_dir})")

    # RSI divergence
    h1_div = h1.get("momentum", {}).get("rsi_divergence", {}) if h1 else {}
    div_flags = []
    if h1_div.get("bull_div"):
        div_flags.append("bullish regular div")
    if h1_div.get("bear_div"):
        div_flags.append("bearish regular div")
    if h1_div.get("hidden_bull"):
        div_flags.append("hidden bullish div")
    if h1_div.get("hidden_bear"):
        div_flags.append("hidden bearish div")
    if div_flags:
        md.append(f"- **H1 RSI divergence**: {', '.join(div_flags)}")
    md.append("")

    # Volume
    md.append("### Volume (H1)")
    h1_v = h1.get("volume", {}) if h1 else {}
    md.append(f"- Ratio vs avg: {h1_v.get('ratio', '?')}x ({h1_v.get('state', '?')})")
    if h1_v.get("climax"):
        md.append("- Climax candle detected")
    if h1_v.get("dry_up"):
        md.append("- Volume dry-up (pre-move consolidation)")
    md.append("")

    # Entry Quality
    md.append("### Entry Quality")
    md.append(f"- Last 3 candles gain: {eq.get('last_3_candles_gain_pct', '?')}%")
    md.append(f"- Distance from EMA20 H1: {eq.get('distance_from_ema20_h1_pct', '?')}%")
    md.append(f"- Distance from EMA50 H1: {eq.get('distance_from_ema50_h1_pct', '?')}%")
    if eq.get("exhaustion_candle"):
        md.append("- Exhaustion candle detected")
    if eq.get("fresh_breakout"):
        md.append("- Fresh breakout confirmed")
    if eq.get("deep_pullback"):
        md.append("- Deep pullback to EMA50")
    md.append("")

    # Structure
    md.append("### Structure (SMC + Patterns)")
    smc = structure.get("smc", {})
    md.append(f"- FVG count: {smc.get('fvg_count', 0)} (near entry: {smc.get('fvg_near_entry', False)})")
    md.append(f"- Order Block count: {smc.get('ob_count', 0)} (near entry: {smc.get('ob_near_entry', False)})")
    md.append(f"- Liquidity sweeps: {smc.get('sweep_count', 0)}")
    if smc.get("golden_setup"):
        md.append("- **SMC Golden Setup detected** (FVG + OB + Sweep confluence)")

    patterns = structure.get("patterns", [])
    if patterns:
        md.append(f"- Patterns: {len(patterns)} detected")
        for p in patterns[:5]:
            tf = p.get("timeframe", "?")
            ptype = p.get("type", "?")
            direction = p.get("direction", "?")
            strength = p.get("strength", "")
            md.append(f"  - [{tf}] {ptype} ({direction}) {strength}")

    fib = structure.get("fib", {})
    if fib.get("entry_near_fib"):
        md.append(f"- Entry at Fibonacci {fib.get('entry_fib_level', '?')} retracement")
    if fib.get("tp_fib_aligned", 0) > 0:
        md.append(f"- {fib['tp_fib_aligned']} TP(s) aligned with Fibonacci extensions")
    md.append("")

    # Levels
    md.append("### Key Levels")
    if levels.get("near_resistance_h1"):
        md.append("- Near H1 resistance")
    if levels.get("near_support_h1"):
        md.append("- Near H1 support")
    if levels.get("near_resistance_h4"):
        md.append("- Near H4 resistance")
    if levels.get("near_support_h4"):
        md.append("- Near H4 support")
    if levels.get("broke_resistance_recent"):
        md.append("- Recently broke H4 resistance")
    if levels.get("broke_support_recent"):
        md.append("- Recently broke H4 support")
    md.append("")

    # Market Context
    md.append("### Market Context")
    btc = context.get("btc", {})
    fng = context.get("fng", {})
    env = context.get("environment", {})
    funding = context.get("funding_rate")

    btc_price = btc.get("price")
    btc_change = btc.get("price_change_pct")
    btc_dom = btc.get("dominance")
    btc_dom_trend = btc.get("dominance_trend", "?")

    if btc_price:
        md.append(f"- BTC price: ${btc_price:,.2f} ({btc_change:+.2f}% 24h)")
    if btc_dom is not None:
        md.append(f"- BTC dominance: {btc_dom:.2f}% (trend: {btc_dom_trend})")
    if fng.get("value") is not None:
        md.append(f"- Fear & Greed: {fng['value']} ({fng.get('classification', '?')})")
    if funding is not None:
        md.append(f"- Funding rate: {funding:.5f}")
    md.append(f"- 24h volume: ${env.get('vol_24h_usd', 0):,.0f} ({env.get('liquidity_tier', '?')} liquidity)")
    md.append(f"- Volatility regime: {env.get('volatility_regime', '?')} (ATR pct {env.get('atr_percentile_h4', '?')})")
    md.append("")

    # Tags
    md.append("### Tags")
    md.append(", ".join(f"`{t}`" for t in tags))
    md.append("")

    return "\n".join(md)


@router.get("/{signal_id}/export/md", response_class=PlainTextResponse)
def export_as_markdown(signal_id: str):
    """Export enrichment data as markdown (for copy-paste to AI)."""
    signal = fetch_signal_basic(signal_id)
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")

    enrichment = fetch_enrichment_v3(signal_id)
    if not enrichment or not enrichment.get("entry_snapshot"):
        raise HTTPException(status_code=404, detail="Signal not enriched with v3")

    pair = signal["pair"]
    entry_snap = enrichment.get("entry_snapshot", {})
    live_snap = enrichment.get("live_snapshot", {})

    md = [f"# {pair} Signal Analysis"]
    md.append("")
    md.append(f"**Entry:** {signal.get('entry')}")
    md.append(f"**TP1:** {signal.get('target1')} | **TP2:** {signal.get('target2')} | **TP3:** {signal.get('target3')} | **TP4:** {signal.get('target4')}")
    md.append(f"**Stop Loss:** {signal.get('stop1')}")
    md.append(f"**Current Status:** {signal.get('status')}")
    md.append(f"**Signal Time:** {signal.get('created_at')}")
    md.append("")
    md.append("---")
    md.append("")

    md.append(format_snapshot_as_markdown(signal, entry_snap, label="Entry"))

    if live_snap and live_snap != entry_snap:
        md.append("---")
        md.append("")
        md.append(format_snapshot_as_markdown(signal, live_snap, label="Live"))

    return "\n".join(md)


@router.get("/{signal_id}/export/prompt", response_class=PlainTextResponse)
def export_as_ai_prompt(signal_id: str):
    """Export as markdown + pre-built AI prompt for copy-paste."""
    md_response = export_as_markdown(signal_id)
    md_content = md_response.body.decode() if hasattr(md_response, "body") else str(md_response)

    prompt = md_content + "\n\n---\n\n"
    prompt += "Based on the data above, please analyze this trading signal:\n\n"
    prompt += "1. Is this a high-quality entry based on the facts and tags?\n"
    prompt += "2. What are the main risks to consider?\n"
    prompt += "3. What position sizing approach would you suggest (conservative/normal/aggressive)?\n"
    prompt += "4. What are the key levels and conditions to watch for invalidation?\n"
    prompt += "5. How does the current market context (BTC, dominance, F&G) affect this trade?\n"

    return prompt