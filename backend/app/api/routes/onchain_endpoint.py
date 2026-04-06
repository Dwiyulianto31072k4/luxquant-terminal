# backend/app/api/routes/onchain_endpoint.py
"""
On-Chain Alerts API — Whale transfers, smart money, liquidations
Serves data from onchain_alerts table (populated by Telegram forwarder bot)
Redis cached: feed 60s, stats 120s
"""
from fastapi import APIRouter, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
import json

from app.core.database import get_db as get_db_session
from app.core.redis import cache_get, cache_set

router = APIRouter(tags=["onchain"])

ONCHAIN_IMAGES_DIR = "/opt/luxquant/onchain-images"


# ════════════════════════════════════════════
# 1. FEED — paginated alerts with filters
# ════════════════════════════════════════════

@router.get("/feed")
async def get_onchain_feed(
    page: int = Query(1, ge=1),
    per_page: int = Query(24, ge=1, le=100),
    alert_type: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    blockchain: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    min_usd: Optional[float] = Query(None),
):
    """Paginated onchain alerts feed with filters."""
    cache_key = f"lq:onchain:feed:{page}:{per_page}:{alert_type}:{source}:{token}:{blockchain}:{search}:{min_usd}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    db = next(get_db_session())
    try:
        conditions = []
        params = {}

        if alert_type:
            conditions.append("alert_type = :alert_type")
            params["alert_type"] = alert_type
        if source:
            conditions.append("source_name = :source")
            params["source"] = source
        if token:
            conditions.append("token = :token")
            params["token"] = token.upper()
        if blockchain:
            conditions.append("blockchain = :blockchain")
            params["blockchain"] = blockchain
        if search:
            conditions.append("(title ILIKE :search OR raw_text ILIKE :search)")
            params["search"] = f"%{search}%"
        if min_usd:
            conditions.append("amount_usd >= :min_usd")
            params["min_usd"] = min_usd

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        # Count
        count_q = f"SELECT COUNT(*) FROM onchain_alerts {where}"
        total = db.execute(text(count_q), params).scalar()

        # Fetch
        offset = (page - 1) * per_page
        params["limit"] = per_page
        params["offset"] = offset

        data_q = f"""
            SELECT id, source_channel, source_msg_id, source_name, alert_type,
                   token, amount_raw, amount_usd, from_entity, to_entity,
                   blockchain, tx_hash, tx_url, title, raw_text, image_url,
                   has_photo, created_at
            FROM onchain_alerts
            {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """
        rows = db.execute(text(data_q), params).mappings().all()

        alerts = []
        for r in rows:
            alerts.append({
                "id": r["id"],
                "source_name": r["source_name"],
                "alert_type": r["alert_type"],
                "token": r["token"],
                "amount_raw": r["amount_raw"],
                "amount_usd": float(r["amount_usd"]) if r["amount_usd"] else None,
                "from_entity": r["from_entity"],
                "to_entity": r["to_entity"],
                "blockchain": r["blockchain"],
                "tx_url": r["tx_url"],
                "title": r["title"],
                "raw_text": r["raw_text"],
                "image_url": r["image_url"],
                "has_photo": r["has_photo"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })

        result = {
            "alerts": alerts,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if total > 0 else 1,
        }
        cache_set(cache_key, result, ttl=60)
        return result
    finally:
        db.close()


# ════════════════════════════════════════════
# 2. STATS — aggregate overview
# ════════════════════════════════════════════

@router.get("/stats")
async def get_onchain_stats():
    """Aggregate stats for onchain dashboard."""
    cached = cache_get("lq:onchain:stats")
    if cached:
        return cached

    db = next(get_db_session())
    try:
        # Total counts
        total = db.execute(text("SELECT COUNT(*) FROM onchain_alerts")).scalar()

        # Last 24h
        last_24h = db.execute(text(
            "SELECT COUNT(*) FROM onchain_alerts WHERE created_at > NOW() - INTERVAL '24 hours'"
        )).scalar()

        # Last hour
        last_1h = db.execute(text(
            "SELECT COUNT(*) FROM onchain_alerts WHERE created_at > NOW() - INTERVAL '1 hour'"
        )).scalar()

        # By type
        by_type = db.execute(text(
            "SELECT alert_type, COUNT(*) as cnt FROM onchain_alerts GROUP BY alert_type ORDER BY cnt DESC"
        )).mappings().all()

        # By source
        by_source = db.execute(text(
            "SELECT source_name, COUNT(*) as cnt FROM onchain_alerts GROUP BY source_name ORDER BY cnt DESC"
        )).mappings().all()

        # By token (top 10)
        by_token = db.execute(text(
            "SELECT token, COUNT(*) as cnt, SUM(amount_usd) as total_usd FROM onchain_alerts WHERE token IS NOT NULL GROUP BY token ORDER BY cnt DESC LIMIT 10"
        )).mappings().all()

        # By blockchain
        by_blockchain = db.execute(text(
            "SELECT blockchain, COUNT(*) as cnt FROM onchain_alerts WHERE blockchain IS NOT NULL GROUP BY blockchain ORDER BY cnt DESC"
        )).mappings().all()

        # Largest recent (top 5 by USD)
        largest = db.execute(text(
            "SELECT token, amount_usd, alert_type, source_name, created_at FROM onchain_alerts WHERE amount_usd IS NOT NULL ORDER BY amount_usd DESC LIMIT 5"
        )).mappings().all()

        result = {
            "total": total,
            "last_24h": last_24h,
            "last_1h": last_1h,
            "by_type": [{"type": r["alert_type"], "count": r["cnt"]} for r in by_type],
            "by_source": [{"source": r["source_name"], "count": r["cnt"]} for r in by_source],
            "by_token": [{"token": r["token"], "count": r["cnt"], "total_usd": float(r["total_usd"]) if r["total_usd"] else 0} for r in by_token],
            "by_blockchain": [{"blockchain": r["blockchain"], "count": r["cnt"]} for r in by_blockchain],
            "largest": [{
                "token": r["token"],
                "amount_usd": float(r["amount_usd"]) if r["amount_usd"] else 0,
                "alert_type": r["alert_type"],
                "source": r["source_name"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            } for r in largest],
        }
        cache_set("lq:onchain:stats", result, ttl=120)
        return result
    finally:
        db.close()


# ════════════════════════════════════════════
# 3. DETAIL — single alert by ID
# ════════════════════════════════════════════

@router.get("/detail/{alert_id}")
async def get_onchain_detail(alert_id: int):
    """Get single alert detail."""
    cached = cache_get(f"lq:onchain:detail:{alert_id}")
    if cached:
        return cached

    db = next(get_db_session())
    try:
        row = db.execute(text(
            "SELECT * FROM onchain_alerts WHERE id = :id"
        ), {"id": alert_id}).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Alert not found")

        result = {
            "id": row["id"],
            "source_name": row["source_name"],
            "alert_type": row["alert_type"],
            "token": row["token"],
            "amount_raw": row["amount_raw"],
            "amount_usd": float(row["amount_usd"]) if row["amount_usd"] else None,
            "from_entity": row["from_entity"],
            "to_entity": row["to_entity"],
            "blockchain": row["blockchain"],
            "tx_hash": row["tx_hash"],
            "tx_url": row["tx_url"],
            "title": row["title"],
            "raw_text": row["raw_text"],
            "image_url": row["image_url"],
            "has_photo": row["has_photo"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        cache_set(f"lq:onchain:detail:{alert_id}", result, ttl=3600)
        return result
    finally:
        db.close()


# ════════════════════════════════════════════
# 4. FILTERS — available filter options
# ════════════════════════════════════════════

@router.get("/filters")
async def get_onchain_filters():
    """Get available filter values."""
    cached = cache_get("lq:onchain:filters")
    if cached:
        return cached

    db = next(get_db_session())
    try:
        types = db.execute(text(
            "SELECT DISTINCT alert_type FROM onchain_alerts WHERE alert_type IS NOT NULL ORDER BY alert_type"
        )).scalars().all()

        sources = db.execute(text(
            "SELECT DISTINCT source_name FROM onchain_alerts WHERE source_name IS NOT NULL ORDER BY source_name"
        )).scalars().all()

        tokens = db.execute(text(
            "SELECT token, COUNT(*) as cnt FROM onchain_alerts WHERE token IS NOT NULL GROUP BY token ORDER BY cnt DESC LIMIT 20"
        )).mappings().all()

        blockchains = db.execute(text(
            "SELECT DISTINCT blockchain FROM onchain_alerts WHERE blockchain IS NOT NULL ORDER BY blockchain"
        )).scalars().all()

        result = {
            "types": types,
            "sources": sources,
            "tokens": [{"token": r["token"], "count": r["cnt"]} for r in tokens],
            "blockchains": blockchains,
        }
        cache_set("lq:onchain:filters", result, ttl=300)
        return result
    finally:
        db.close()