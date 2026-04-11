# backend/app/api/routes/ai_arena.py
"""
AI Arena v3 API Routes
=======================
- /latest        → latest report (Redis → DB fallback)
- /history       → report history (Redis → DB fallback)
- /chart-data    → klines + technicals for frontend chart (legacy)
- /chart-image   → serve chart PNG image (v3)
- /run           → manually trigger report generation (admin only)
- /anomaly-log   → recent anomaly checks
"""

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import FileResponse
import json
import os

from app.core.redis import cache_get, cache_set, get_redis

router = APIRouter()


def _fix_data_sources(report: dict) -> dict:
    """Safety: ensure data_sources is always an integer, not a dict from DeepSeek."""
    if isinstance(report.get("data_sources"), dict):
        report["source_metrics"] = report.pop("data_sources")
        report["data_sources"] = 18
    return report


# ══════════════════════════════════════
# GET /latest — Latest AI report
# ══════════════════════════════════════

@router.get("/latest")
async def get_latest_ai_report():
    """Get the latest AI market intelligence report. Redis first, DB fallback."""
    try:
        # Try Redis cache first
        report = cache_get("lq:ai-report:latest")
        if report:
            return _fix_data_sources(report)

        # Fallback: read from PostgreSQL
        from app.core.database import SessionLocal
        from app.models.ai_arena import AIArenaReport
        db = SessionLocal()
        db_report = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).first()
        db.close()

        if db_report:
            report = _fix_data_sources(db_report.report_json)
            cache_set("lq:ai-report:latest", report, ttl=86400)
            return report

        raise HTTPException(status_code=404, detail="No report available yet.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════
# GET /history — Report history
# ══════════════════════════════════════

@router.get("/history")
async def get_report_history(limit: int = Query(10, ge=1, le=50)):
    """Get recent report history. Redis first, DB fallback."""
    try:
        reports = []

        # Try Redis first
        redis = get_redis()
        if redis:
            raw_items = redis.lrange("lq:ai-report:history", 0, limit - 1)
            for raw in raw_items:
                try:
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    r = json.loads(raw)
                    reports.append(_fix_data_sources(r))
                except:
                    continue

        # Fallback: PostgreSQL
        if not reports:
            from app.core.database import SessionLocal
            from app.models.ai_arena import AIArenaReport
            db = SessionLocal()
            db_reports = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).limit(limit).all()
            db.close()
            reports = [_fix_data_sources(r.report_json) for r in db_reports]

        return {"reports": reports, "total": len(reports)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════
# GET /chart-data — Klines + Technicals (legacy for lightweight-charts)
# ══════════════════════════════════════

@router.get("/chart-data")
async def get_chart_data():
    """Get BTC klines + technicals for frontend chart rendering."""
    try:
        from app.services.ai_arena_data import fetch_bybit_klines, compute_technicals_for_tf

        klines = fetch_bybit_klines(interval="240", limit=200)
        if not klines:
            raise HTTPException(status_code=503, detail="Could not fetch kline data")

        candles = []
        volumes = []
        for k in klines:
            ts = int(k["timestamp"].timestamp())
            candles.append({"time": ts, "open": k["open"], "high": k["high"], "low": k["low"], "close": k["close"]})
            color = "rgba(74,222,128,0.3)" if k["close"] >= k["open"] else "rgba(248,113,113,0.3)"
            volumes.append({"time": ts, "value": k["volume"], "color": color})

        tech = compute_technicals_for_tf(klines, "4H")

        return {
            "candles": candles,
            "volumes": volumes,
            "technicals": {
                "rsi_14": tech.get("rsi_14"),
                "volume_ratio": tech.get("volume_ratio"),
                "ema_spread_pct": tech.get("ema_spread_pct"),
                "ema_bullish_cross": tech.get("ema_bullish_cross"),
                "golden_cross": tech.get("golden_cross"),
                "ema_20": tech.get("ema20"),
                "ema_50": tech.get("ema50"),
                "sma_100": tech.get("sma100"),
                "sma_200": tech.get("sma200"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════
# GET /chart-image/{report_id} — Serve chart PNG
# ══════════════════════════════════════

CHART_DIR = os.getenv("AI_ARENA_CHART_DIR", "/opt/luxquant/ai-arena-charts")


@router.get("/chart-image/{report_id}")
async def get_chart_image(report_id: str):
    """Serve the chart PNG image for a specific report."""
    filepath = os.path.join(CHART_DIR, f"{report_id}.png")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Chart image not found for {report_id}")
    return FileResponse(filepath, media_type="image/png")


@router.get("/chart-image-latest")
async def get_latest_chart_image():
    """Serve the chart PNG for the latest report."""
    try:
        report = cache_get("lq:ai-report:latest")
        if not report:
            from app.core.database import SessionLocal
            from app.models.ai_arena import AIArenaReport
            db = SessionLocal()
            db_report = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).first()
            db.close()
            if db_report:
                report = db_report.report_json

        if not report:
            raise HTTPException(status_code=404, detail="No report available")

        report_id = report.get("id", "")
        filepath = os.path.join(CHART_DIR, f"{report_id}.png")
        if os.path.exists(filepath):
            return FileResponse(filepath, media_type="image/png")

        # Try chart_image_path from report
        alt_path = report.get("chart_image_path", "")
        if alt_path and os.path.exists(alt_path):
            return FileResponse(alt_path, media_type="image/png")

        raise HTTPException(status_code=404, detail="Chart image not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════
# GET /anomaly-log — Recent anomaly checks
# ══════════════════════════════════════

@router.get("/anomaly-log")
async def get_anomaly_log(limit: int = Query(20, ge=1, le=100)):
    """Get recent anomaly check logs."""
    try:
        from app.core.database import SessionLocal
        from app.models.ai_arena import AIArenaAnomalyCheck
        db = SessionLocal()
        checks = db.query(AIArenaAnomalyCheck).order_by(AIArenaAnomalyCheck.id.desc()).limit(limit).all()
        db.close()

        return {
            "checks": [
                {
                    "checked_at": c.checked_at.isoformat() if c.checked_at else None,
                    "btc_price": c.btc_price,
                    "trigger_hit": c.trigger_hit,
                    "anomaly_type": c.anomaly_type,
                    "anomaly_detail": c.anomaly_detail,
                    "report_triggered_id": c.report_triggered_id,
                }
                for c in checks
            ],
            "total": len(checks),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════
# POST /run — Manual trigger
# ══════════════════════════════════════

@router.post("/run")
async def trigger_report():
    """Manually trigger AI report generation."""
    import asyncio
    from app.services.ai_arena_worker import run_ai_report_pipeline

    try:
        result = await run_ai_report_pipeline()
        if result:
            return {
                "status": "success",
                "report_id": result.get("id"),
                "sentiment": result.get("sentiment"),
                "confidence": result.get("confidence"),
                "bias": result.get("bias_direction"),
                "alignment": result.get("timeframe_alignment", {}).get("alignment"),
                "chart_image": result.get("chart_image_path"),
                "generated_in": result.get("generated_in_seconds"),
            }
        else:
            raise HTTPException(status_code=500, detail="Report generation failed — check server logs")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
