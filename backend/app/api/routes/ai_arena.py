# backend/app/api/routes/ai_arena.py
"""
AI Arena v3 API Routes
=======================
- /latest        → latest report (Redis → DB fallback)
- /history       → report history (Redis → DB fallback)
- /chart-data    → multi-TF klines + technicals for interactive chart
- /run           → manually trigger report generation (admin only)
- /anomaly-log   → recent anomaly checks
"""

from fastapi import APIRouter, HTTPException, Query
import json

from app.core.redis import cache_get, cache_set, get_redis

router = APIRouter()


def _fix_data_sources(report: dict) -> dict:
    """Safety: ensure data_sources is always an integer, not a dict from DeepSeek."""
    if isinstance(report.get("data_sources"), dict):
        report["source_metrics"] = report.pop("data_sources")
        report["data_sources"] = 18
    return report


# ══════════════════════════════════════
# GET /latest
# ══════════════════════════════════════

@router.get("/latest")
async def get_latest_ai_report():
    """Get the latest AI market intelligence report. Redis first, DB fallback."""
    try:
        report = cache_get("lq:ai-report:latest")
        if report:
            return _fix_data_sources(report)

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
# GET /history
# ══════════════════════════════════════

@router.get("/history")
async def get_report_history(limit: int = Query(10, ge=1, le=50)):
    """Get recent report history. Redis first, DB fallback."""
    try:
        reports = []
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
# GET /chart-data — Multi-TF Klines + Technicals
# ══════════════════════════════════════

@router.get("/chart-data")
async def get_chart_data(tf: str = Query("4H", description="Timeframe: 1D, 4H, 1H")):
    """
    Get BTC klines + technicals for interactive chart.
    Supports multi-timeframe: 1D (90 candles), 4H (200 candles), 1H (168 candles).
    """
    try:
        from app.services.ai_arena_data import fetch_bybit_klines, compute_technicals_for_tf, TIMEFRAME_CONFIG

        tf = tf.upper()
        if tf not in TIMEFRAME_CONFIG:
            raise HTTPException(status_code=400, detail=f"Invalid timeframe. Use: {list(TIMEFRAME_CONFIG.keys())}")

        config = TIMEFRAME_CONFIG[tf]
        klines = fetch_bybit_klines(interval=config["interval"], limit=config["limit"])
        if not klines:
            raise HTTPException(status_code=503, detail=f"Could not fetch {tf} kline data")

        candles = []
        volumes = []
        for k in klines:
            ts = int(k["timestamp"].timestamp())
            candles.append({"time": ts, "open": k["open"], "high": k["high"], "low": k["low"], "close": k["close"]})
            color = "rgba(74,222,128,0.3)" if k["close"] >= k["open"] else "rgba(248,113,113,0.3)"
            volumes.append({"time": ts, "value": k["volume"], "color": color})

        tech = compute_technicals_for_tf(klines, tf)

        # Build MA overlay data for the chart
        closes = [k["close"] for k in klines]
        ma_series = {}

        # EMA series
        for period in config.get("ema_periods", []):
            if len(closes) >= period:
                ema_data = []
                mult = 2 / (period + 1)
                ema = sum(closes[:period]) / period
                for i, p in enumerate(closes):
                    if i < period:
                        continue
                    ema = (p - ema) * mult + ema
                    ema_data.append({"time": int(klines[i]["timestamp"].timestamp()), "value": round(ema, 2)})
                ma_series[f"ema{period}"] = ema_data

        # SMA series (4H only)
        for period in config.get("sma_periods", []):
            if len(closes) >= period:
                sma_data = []
                for i in range(period - 1, len(closes)):
                    val = sum(closes[i - period + 1:i + 1]) / period
                    sma_data.append({"time": int(klines[i]["timestamp"].timestamp()), "value": round(val, 2)})
                ma_series[f"sma{period}"] = sma_data

        # RSI series
        rsi_series = []
        for i in range(15, len(closes)):
            rsi_val = 50
            segment = closes[:i + 1]
            if len(segment) >= 15:
                deltas = [segment[j] - segment[j - 1] for j in range(1, len(segment))]
                recent = deltas[-14:]
                gains = [d for d in recent if d > 0]
                losses = [-d for d in recent if d < 0]
                avg_gain = sum(gains) / 14 if gains else 0
                avg_loss = sum(losses) / 14 if losses else 0.001
                rs = avg_gain / avg_loss
                rsi_val = 100 - (100 / (1 + rs))
            rsi_series.append({"time": int(klines[i]["timestamp"].timestamp()), "value": round(rsi_val, 1)})

        # Get latest report for liquidation + key levels overlay
        report = cache_get("lq:ai-report:latest")
        liq_levels = None
        key_levels = None
        if report:
            liq_levels = report.get("liquidation_hotspots")
            key_levels = report.get("key_levels")

        return {
            "timeframe": tf,
            "label": config["label"],
            "candles": candles,
            "volumes": volumes,
            "technicals": tech,
            "ma_series": ma_series,
            "rsi_series": rsi_series,
            "liquidation_levels": liq_levels,
            "key_levels": key_levels,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════
# GET /anomaly-log
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
                "generated_in": result.get("generated_in_seconds"),
            }
        else:
            raise HTTPException(status_code=500, detail="Report generation failed — check server logs")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
