# backend/app/api/routes/public_data.py
"""
Public Data API — Batch 2 (journey / enrichment / btc-correlation / market-pulse).

Mounted di /api/public/v1. Auth API key + rate limit di LEVEL ROUTER (semua
endpoint butuh key & kena limit). Semua handler RE-USE fungsi web app yang sudah
ada → single source of truth, anti-drift.

CUTOFF (lindungi moat):
    Data turunan-signal (journey, enrichment, btc-correlation) ikut cutoff signal
    induknya: cuma signal dengan created_at >= settings.PUBLIC_API_SIGNALS_FROM.
    created_at di DB TEXT → dibanding pakai CAST(... AS timestamptz).
    market-pulse adalah time-series sendiri (sudah recent-windowed 24h), jadi
    cutoff signal tidak berlaku — tapi field sumber (source_msg_id) di-redact.

PRIVASI:
    Tidak pernah ekspos message_link / channel_id / source_msg_id / raw_text.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.config import settings
from app.api.deps_public import get_api_key_user

# ── Re-use logika web app (jangan duplikat) ──
from app.services.journey_view_builder import build_journey_view
from app.services.journey_fetcher import parse_created_at
from app.api.routes.enrichment_v3 import (
    fetch_enrichment_v3,
    fetch_enrichment_history,
    _build_markdown_for_signal,
)
from app.api.routes.btc_correlation import _row_to_dict as _corr_row_to_dict
from app.api.routes.market_pulse import get_pulse_feed, get_pulse_stats

logger = logging.getLogger("public-api-data")


def _cutoff() -> str:
    return getattr(settings, "PUBLIC_API_SIGNALS_FROM", "2026-06-05T00:00:00+00:00")


# Auth + rate limit berlaku ke SEMUA route di router ini.
router = APIRouter(
    tags=["public-data"],
    dependencies=[Depends(get_api_key_user)],
)

# Kolom signal "basic" + enforcement cutoff. Balikin None kalau gak ada / pre-cutoff.
_SIGNAL_BASIC_COLS = """
    signal_id, pair, entry, target1, target2, target3, target4,
    stop1, stop2, status, risk_level, created_at
"""


def _signal_in_window(db: Session, signal_id: str) -> Optional[dict]:
    """Ambil signal HANYA kalau post-cutoff. None = gak ada ATAU pre-cutoff (di-404 oleh caller)."""
    row = db.execute(text(f"""
        SELECT {_SIGNAL_BASIC_COLS}
        FROM signals
        WHERE signal_id = :sid
          AND created_at IS NOT NULL
          AND CAST(created_at AS timestamptz) >= CAST(:cutoff AS timestamptz)
    """), {"sid": signal_id, "cutoff": _cutoff()}).mappings().fetchone()
    return dict(row) if row else None


# ════════════════════════════════════════════════════════════
# JOURNEY — analitik price action (MAE/MFE/peak/timeline)
# ════════════════════════════════════════════════════════════
@router.get("/journey/{signal_id}")
def get_journey(signal_id: str, db: Session = Depends(get_db)):
    sig = _signal_in_window(db, signal_id)
    if sig is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found")

    try:
        created_at_dt = parse_created_at(sig["created_at"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=500, detail="Signal has invalid created_at")

    journey_row = db.execute(text("""
        SELECT
            signal_id, direction, computed_at, last_event_at,
            data_source, kline_interval, swing_threshold_pct,
            coverage_from, coverage_until, coverage_status,
            events,
            overall_mae_pct, overall_mae_at,
            overall_mfe_pct, overall_mfe_at,
            initial_mae_pct, initial_mae_at, initial_mae_before,
            time_to_tp1_seconds, time_to_outcome_seconds,
            pct_time_above_entry,
            tp_then_sl, tps_hit_before_sl,
            realized_outcome_pct, missed_potential_pct
        FROM signal_journey
        WHERE signal_id = :sid
        LIMIT 1
    """), {"sid": signal_id}).mappings().fetchone()

    if not journey_row:
        return {"signal_id": signal_id, "available": False, "reason": "no_journey_yet"}

    signal_dict = {"pair": sig["pair"], "status": sig["status"], "created_at_dt": created_at_dt}
    try:
        view = build_journey_view(journey_row=dict(journey_row), signal_row=signal_dict)
    except Exception as e:
        logger.exception(f"build_journey_view failed for {signal_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to build journey view")
    return view


# ════════════════════════════════════════════════════════════
# ENRICHMENT — TA multi-timeframe + facts/tags (+ AI prompt export)
# ════════════════════════════════════════════════════════════
@router.get("/enrichment/{signal_id}")
def get_enrichment(signal_id: str, db: Session = Depends(get_db)):
    sig = _signal_in_window(db, signal_id)
    if sig is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found")

    enrichment = fetch_enrichment_v3(signal_id)
    if not enrichment:
        return {"signal_id": signal_id, "pair": sig["pair"], "status": "not_enriched",
                "entry_snapshot": None, "live_snapshot": None}

    entry = enrichment.get("entry_snapshot", {}) or {}
    live = enrichment.get("live_snapshot", {}) or {}
    if not entry:
        return {"signal_id": signal_id, "pair": sig["pair"], "status": "legacy_only",
                "entry_snapshot": None, "live_snapshot": None}

    def _f(v):
        return float(v) if v is not None else None

    return {
        "signal_id": signal_id,
        "pair": sig["pair"],
        "status": "enriched",
        "signal_info": {
            "entry": _f(sig.get("entry")),
            "target1": _f(sig.get("target1")), "target2": _f(sig.get("target2")),
            "target3": _f(sig.get("target3")), "target4": _f(sig.get("target4")),
            "stop1": _f(sig.get("stop1")),
            "current_status": sig.get("status"),
            "created_at": sig.get("created_at"),
        },
        "entry_snapshot": entry,
        "live_snapshot": live,
        "live_updated_at": enrichment["live_updated_at"].isoformat() if enrichment.get("live_updated_at") else None,
        "analyzed_at": enrichment["analyzed_at"].isoformat() if enrichment.get("analyzed_at") else None,
        "version": enrichment.get("enrichment_version"),
    }


@router.get("/enrichment/{signal_id}/history")
def get_enrichment_history_public(
    signal_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    sig = _signal_in_window(db, signal_id)
    if sig is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found")
    history = fetch_enrichment_history(signal_id, limit=limit)
    return {"signal_id": signal_id, "pair": sig["pair"], "count": len(history), "history": history}


@router.get("/enrichment/{signal_id}/export/prompt", response_class=PlainTextResponse)
def export_enrichment_prompt(signal_id: str, db: Session = Depends(get_db)):
    """Markdown + pre-built AI prompt — siap di-feed ke agent/LLM milik subscriber."""
    if _signal_in_window(db, signal_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found")
    md = _build_markdown_for_signal(signal_id)
    return (
        md + "\n\n---\n\n"
        "Based on the data above, please analyze this trading signal:\n\n"
        "1. Is this a high-quality entry based on the facts and tags?\n"
        "2. What are the main risks to consider?\n"
        "3. What position sizing approach would you suggest (conservative/normal/aggressive)?\n"
        "4. What are the key levels and conditions to watch for invalidation?\n"
        "5. How does the current market context (BTC, dominance, F&G) affect this trade?\n"
    )


# ════════════════════════════════════════════════════════════
# BTC CORRELATION — korelasi/beta tiap signal vs BTC + interpretasi
# (route /recent didefinisikan SEBELUM /{signal_id} biar gak ketangkep sbg id)
# ════════════════════════════════════════════════════════════
_CORR_COLS_C = """
    c.signal_id, c.pair,
    c.corr_1h_7d, c.corr_4h_30d, c.beta_30d, c.r_squared_30d, c.corr_zscore,
    c.tail_corr_btc_down, c.tail_corr_btc_up, c.downside_beta,
    c.lead_lag_hours, c.volatility_ratio, c.coin_volatility_pct,
    c.momentum_divergence_7d, c.is_extended,
    c.btc_context, c.is_decoupled, c.interpretation,
    c.confidence, c.sample_size, c.data_source,
    c.snapshot_at, c.analyzed_at
"""


@router.get("/btc-correlation/recent")
def list_recent_correlations_public(
    limit: int = Query(20, ge=1, le=100),
    decoupled_only: bool = False,
    extended_only: bool = False,
    db: Session = Depends(get_db),
):
    conds = [
        "s.created_at IS NOT NULL",
        "CAST(s.created_at AS timestamptz) >= CAST(:cutoff AS timestamptz)",
    ]
    if decoupled_only:
        conds.append("c.is_decoupled = TRUE")
    if extended_only:
        conds.append("c.is_extended = TRUE")
    where = " AND ".join(conds)

    rows = db.execute(text(f"""
        SELECT {_CORR_COLS_C}
        FROM signal_btc_correlation c
        JOIN signals s ON s.signal_id = c.signal_id
        WHERE {where}
        ORDER BY c.analyzed_at DESC
        LIMIT :lim
    """), {"cutoff": _cutoff(), "lim": limit}).mappings().all()

    return {"count": len(rows), "items": [_corr_row_to_dict(r) for r in rows]}


@router.get("/btc-correlation/{signal_id}")
def get_btc_correlation_public(signal_id: str, db: Session = Depends(get_db)):
    row = db.execute(text(f"""
        SELECT {_CORR_COLS_C}
        FROM signal_btc_correlation c
        JOIN signals s ON s.signal_id = c.signal_id
        WHERE c.signal_id = :sid
          AND s.created_at IS NOT NULL
          AND CAST(s.created_at AS timestamptz) >= CAST(:cutoff AS timestamptz)
    """), {"sid": signal_id, "cutoff": _cutoff()}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="BTC correlation not found or not yet computed")
    return _corr_row_to_dict(row)


# ════════════════════════════════════════════════════════════
# MARKET PULSE — event flow realtime + agregat regime
# (re-use handler web yg cached; redact field sumber)
# ════════════════════════════════════════════════════════════
@router.get("/market-pulse/feed")
async def public_pulse_feed(
    source: Optional[str] = Query(None, regex="^(pulse|price_movement)$"),
    pair: Optional[str] = Query(None),
    timeframe: Optional[str] = Query(None, regex="^(5m|1h|2h|4h|1d)$"),
    direction: Optional[str] = Query(None, regex="^(bullish|bearish)$"),
    limit: int = Query(100, ge=1, le=500),
):
    res = await get_pulse_feed(
        source=source, pair=pair, timeframe=timeframe, direction=direction, limit=limit
    )
    # Bangun ulang event tanpa field internal (source_msg_id / id / label zh).
    clean = [{
        "pair": e.get("pair"),
        "base_symbol": e.get("base_symbol"),
        "direction": e.get("direction"),
        "pct_change": e.get("pct_change"),
        "timeframe": e.get("timeframe"),
        "event_type": e.get("event_type"),
        "move_seconds": e.get("move_seconds"),
        "created_at": e.get("created_at"),
    } for e in res.get("events", [])]
    return {"events": clean, "count": len(clean)}


@router.get("/market-pulse/stats")
async def public_pulse_stats():
    # Agregat 1h/24h: total event, unique coin, rasio bull/bear, flash move, heatmap.
    return await get_pulse_stats()
