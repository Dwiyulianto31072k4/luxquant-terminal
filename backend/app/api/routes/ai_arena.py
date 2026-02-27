# backend/app/api/routes/ai_arena.py
"""
AI Arena — API Routes
- /latest  → most recent report
- /history → last N reports for timeline feed
"""
from fastapi import APIRouter, HTTPException, Query
from app.core.redis import cache_get, get_redis
import json

router = APIRouter()


@router.get("/latest")
async def get_latest_ai_report():
    """Get the latest AI market intelligence report."""
    try:
        report = cache_get("lq:ai-report:latest")
        if not report:
            raise HTTPException(status_code=404, detail="No report available yet.")
        return report
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
            # Fallback: return just the latest
            latest = cache_get("lq:ai-report:latest")
            return {"reports": [latest] if latest else [], "total": 1 if latest else 0}
        
        raw_items = redis.lrange("lq:ai-report:history", 0, limit - 1)
        
        reports = []
        for raw in raw_items:
            try:
                if isinstance(raw, bytes):
                    raw = raw.decode('utf-8')
                reports.append(json.loads(raw))
            except:
                continue
        
        # If history is empty but latest exists, return latest
        if not reports:
            latest = cache_get("lq:ai-report:latest")
            if latest:
                reports = [latest]
        
        return {"reports": reports, "total": len(reports)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))