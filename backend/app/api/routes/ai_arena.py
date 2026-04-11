# backend/app/api/routes/ai_arena.py
"""
AI Arena — API Routes
- /latest     → most recent AI report
- /history    → last N reports for timeline feed
- /chart-data → klines + technicals + liquidation levels for frontend chart
- /run        → manually trigger report generation (admin only)
"""
from fastapi import APIRouter, HTTPException, Query
from app.core.redis import cache_get, cache_set, get_redis
import json

router = APIRouter()


@router.get("/latest")
async def get_latest_ai_report():
    """Get the latest AI market intelligence report. Redis first, DB fallback."""
    try:
        # Try Redis cache first (fast)
        report = cache_get("lq:ai-report:latest")
        if report:
            return report

        # Fallback: read from PostgreSQL
        from app.core.database import SessionLocal
        from app.models.ai_arena import AIArenaReport
        db = SessionLocal()
        db_report = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).first()
        db.close()

        if db_report:
            # Re-cache to Redis for next request
            cache_set("lq:ai-report:latest", db_report.report_json, ttl=86400)
            return db_report.report_json

        raise HTTPException(status_code=404, detail="No report available yet.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_report_history(limit: int = Query(10, ge=1, le=50)):
    """Get recent report history for timeline feed."""
    try:
        redis = get_redis()
        if not redis:
            latest = cache_get("lq:ai-report:latest")
            return {"reports": [latest] if latest else [], "total": 1 if latest else 0}

        raw_items = redis.lrange("lq:ai-report:history", 0, limit - 1)

        reports = []
        for raw in raw_items:
            try:
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
                reports.append(json.loads(raw))
            except:
                continue

        if not reports:
            latest = cache_get("lq:ai-report:latest")
            if latest:
                reports = [latest]

        return {"reports": reports, "total": len(reports)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chart-data")
async def get_chart_data():
    """
    Get BTC chart data for frontend rendering.
    Returns klines (OHLCV), technicals (SMA, RSI), and liquidation levels.
    Cached separately with 5-min TTL (lighter than full report).
    """
    try:
        # Try cache first
        cached = cache_get("lq:ai-arena:chart-data")
        if cached:
            return cached

        # Fetch fresh from data layer
        from app.services.ai_arena_data import (
            fetch_bybit_ticker,
            fetch_bybit_klines,
            compute_technicals,
            fetch_coinalyze_liquidation_history,
            estimate_liquidation_levels,
            fetch_fear_greed,
            fetch_coinalyze_oi,
            fetch_coinglass_oi,
        )

        # Gather chart-relevant data
        ticker = fetch_bybit_ticker()
        current_price = float(ticker.get("price", 0)) if ticker else 0
        raw_klines = fetch_bybit_klines(limit=200)
        technicals = compute_technicals(raw_klines) if raw_klines else {}
        liq_history = fetch_coinalyze_liquidation_history()
        fear_greed = fetch_fear_greed()
        coinalyze = fetch_coinalyze_oi(current_price=current_price)
        cg_oi = fetch_coinglass_oi()

        # Use best OI for liquidation estimation: Coinglass > Coinalyze > Bybit
        best_oi_usd = 0
        oi_source = "none"
        if cg_oi and cg_oi.get("total_oi_usd", 0) > 1_000_000_000:
            best_oi_usd = cg_oi["total_oi_usd"]
            oi_source = "coinglass"
        elif coinalyze and coinalyze.get("oi_usd", 0) > 1_000_000_000:
            best_oi_usd = coinalyze["oi_usd"]
            oi_source = "coinalyze"
        elif ticker:
            best_oi_usd = ticker.get("open_interest_usd", 0)
            oi_source = "bybit"

        liq_levels = {}
        if current_price and best_oi_usd:
            liq_levels = estimate_liquidation_levels(current_price, best_oi_usd)

        # Format klines for lightweight-charts
        candles = []
        volumes = []
        if raw_klines:
            for k in raw_klines:
                ts = k.get("timestamp", k.get("t", 0))
                if hasattr(ts, 'timestamp'):  # datetime object
                    time_val = int(ts.timestamp())
                elif isinstance(ts, str):
                    time_val = int(ts)
                elif isinstance(ts, (int, float)):
                    time_val = int(ts / 1000) if ts > 1e12 else int(ts)
                else:
                    time_val = 0
                o = float(k.get("open", k.get("o", 0)))
                h = float(k.get("high", k.get("h", 0)))
                l = float(k.get("low", k.get("l", 0)))
                c = float(k.get("close", k.get("c", 0)))
                v = float(k.get("volume", k.get("v", 0)))
                candles.append({"time": time_val, "open": o, "high": h, "low": l, "close": c})
                volumes.append({
                    "time": time_val,
                    "value": v,
                    "color": "rgba(74,222,128,0.3)" if c >= o else "rgba(248,113,113,0.3)",
                })
        ma_data = {}
        # EMA 20/50 (short-term, responsive)
        for period in [20, 50]:
            val = technicals.get(f"ema{period}")
            if val is not None:
                ma_data[f"ema_{period}"] = val
        # SMA 100/200 (long-term, institutional)
        for period in [100, 200]:
            val = technicals.get(f"sma{period}")
            if val is not None:
                ma_data[f"sma_{period}"] = val

        # Simplify liquidation levels (only peaks + top clusters, not full map)
        liq_simple = {}
        if liq_levels:
            liq_simple = {
                "peak_long_liq": float(liq_levels.get("peak_long_price", 0)),
                "peak_long_amount": float(liq_levels.get("peak_long_amount", 0)),
                "peak_short_liq": float(liq_levels.get("peak_short_price", 0)),
                "peak_short_amount": float(liq_levels.get("peak_short_amount", 0)),
                "total_long_estimated": float(liq_levels.get("total_long_estimated", 0)),
                "total_short_estimated": float(liq_levels.get("total_short_estimated", 0)),
            }

        result = {
            "candles": candles,
            "volumes": volumes,
            "current_price": current_price,
            "technicals": {
                "rsi_14": technicals.get("rsi_14"),
                "volume_ratio": technicals.get("volume_ratio"),
                "ema_spread_pct": technicals.get("ema_spread_pct"),
                "ema_bullish_cross": technicals.get("ema_bullish_cross"),
                "golden_cross": technicals.get("golden_cross"),
                **ma_data,
            },
            "liquidation_levels": liq_simple,
            "fear_greed": fear_greed,
            "oi": {
                "bybit_usd": ticker.get("open_interest_usd", 0) if ticker else 0,
                "coinalyze": coinalyze,
                "coinglass": {
                    "total_oi_usd": cg_oi.get("total_oi_usd", 0),
                    "exchange_count": cg_oi.get("exchange_count", 0),
                } if cg_oi else None,
                "best_source": oi_source,
            },
            "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }

        # Cache 5 min
        cache_set("lq:ai-arena:chart-data", result, ttl=300)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run")
async def trigger_report():
    """Manually trigger AI report generation."""
    try:
        from app.services.ai_arena_worker import run_ai_report_pipeline
        import asyncio

        result = await run_ai_report_pipeline()
        if result:
            return {"status": "ok", "report_id": result.get("id"), "generated_in": result.get("generated_in_seconds")}
        else:
            raise HTTPException(status_code=500, detail="Report generation failed — check logs")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
