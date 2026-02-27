# backend/app/api/routes/ai_arena.py
from fastapi import APIRouter, HTTPException
from app.core.redis import cache_get

router = APIRouter()

@router.get("/latest")
async def get_latest_ai_report():
    """Mengambil laporan Institutional AI terbaru dari Redis"""
    try:
        # Menggunakan fungsi bawaan dari redis.py (sudah otomatis di-parse dari JSON)
        report = cache_get("lq:ai-report:latest")
        
        if not report:
            raise HTTPException(status_code=404, detail="No report available yet.")
            
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))