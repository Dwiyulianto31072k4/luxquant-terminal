"""
LuxQuant Terminal - Market Pulse API Routes
============================================
Endpoints for Market Pulse & Price Movement data.
Data is stored by forwarder_bot.py, cached in Redis,
and served here with filtering/aggregation.

Endpoints:
  GET /api/v1/market-pulse/feed       — Live feed (latest events)
  GET /api/v1/market-pulse/stats      — Aggregated stats (1h / 24h)
  GET /api/v1/market-pulse/top-movers — Top gainers/losers/most active
  GET /api/v1/market-pulse/coin/{pair} — Per-coin detail
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.redis import cache_get, cache_set, cache_get_with_stale

router = APIRouter(tags=["market-pulse"])

CACHE_TTL = 10  # 10 seconds — near real-time


# ============================================================
# FEED — Latest events with filtering
# ============================================================

@router.get("/feed")
async def get_pulse_feed(
    source: Optional[str] = Query(None, regex="^(pulse|price_movement)$"),
    pair: Optional[str] = Query(None),
    timeframe: Optional[str] = Query(None, regex="^(5m|1h|2h|4h|1d)$"),
    direction: Optional[str] = Query(None, regex="^(bullish|bearish)$"),
    limit: int = Query(100, ge=1, le=500),
):
    """Get latest market pulse events with optional filters"""
    
    # Build cache key from params
    cache_key = f"lq:pulse:feed:{source or 'all'}:{pair or 'all'}:{timeframe or 'all'}:{direction or 'all'}:{limit}"
    
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    db = SessionLocal()
    try:
        conditions = ["created_at > NOW() - INTERVAL '24 hours'"]
        params = {}
        
        if source:
            conditions.append("source = :source")
            params["source"] = source
        if pair:
            conditions.append("pair = :pair")
            params["pair"] = pair.upper()
        if timeframe:
            conditions.append("timeframe = :timeframe")
            params["timeframe"] = timeframe
        if direction:
            conditions.append("direction = :direction")
            params["direction"] = direction
        
        where = " AND ".join(conditions)
        
        rows = db.execute(text(f"""
            SELECT id, source, source_msg_id, pair, base_symbol, direction,
                   pct_change, timeframe, event_type, event_type_zh,
                   move_seconds, has_media, created_at
            FROM market_pulse
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT :limit
        """), {**params, "limit": limit}).fetchall()
        
        events = []
        for r in rows:
            events.append({
                "id": r[0],
                "source": r[1],
                "source_msg_id": r[2],
                "pair": r[3],
                "base_symbol": r[4],
                "direction": r[5],
                "pct_change": round(r[6], 2) if r[6] else 0,
                "timeframe": r[7],
                "event_type": r[8],
                "event_type_zh": r[9],
                "move_seconds": r[10],
                "has_media": r[11],
                "created_at": r[12].isoformat() if r[12] else None,
            })
        
        result = {"events": events, "count": len(events)}
        cache_set(cache_key, result, ttl=CACHE_TTL)
        return result
    
    finally:
        db.close()


# ============================================================
# STATS — Aggregated stats for summary cards
# ============================================================

@router.get("/stats")
async def get_pulse_stats():
    """Get aggregated stats: event counts, bull/bear ratio, biggest move, etc."""
    
    cache_key = "lq:pulse:stats"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    db = SessionLocal()
    try:
        # 1h stats
        row_1h = db.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT pair) as unique_coins,
                COUNT(*) FILTER (WHERE direction = 'bullish') as bullish,
                COUNT(*) FILTER (WHERE direction = 'bearish') as bearish,
                COUNT(*) FILTER (WHERE event_type IN ('flash_move', 'rapid_move')) as flash_moves,
                MAX(ABS(pct_change)) as biggest_move_abs
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '1 hour'
        """)).fetchone()
        
        # Find the pair with biggest move in 1h
        biggest_row = db.execute(text("""
            SELECT pair, pct_change, event_type
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '1 hour'
            ORDER BY ABS(pct_change) DESC
            LIMIT 1
        """)).fetchone()
        
        # 24h stats
        row_24h = db.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT pair) as unique_coins,
                COUNT(*) FILTER (WHERE direction = 'bullish') as bullish,
                COUNT(*) FILTER (WHERE direction = 'bearish') as bearish,
                COUNT(*) FILTER (WHERE event_type IN ('flash_move', 'rapid_move')) as flash_moves
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '24 hours'
        """)).fetchone()
        
        # Active coins (top by event count, 1h)
        active_coins = db.execute(text("""
            SELECT pair, COUNT(*) as cnt,
                   MAX(pct_change) FILTER (WHERE direction = 'bullish') as max_up,
                   MIN(pct_change) FILTER (WHERE direction = 'bearish') as max_down
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '1 hour'
            GROUP BY pair
            ORDER BY cnt DESC
            LIMIT 12
        """)).fetchall()
        
        result = {
            "hourly": {
                "total_events": row_1h[0] or 0,
                "unique_coins": row_1h[1] or 0,
                "bullish": row_1h[2] or 0,
                "bearish": row_1h[3] or 0,
                "flash_moves": row_1h[4] or 0,
                "biggest_move": {
                    "pair": biggest_row[0] if biggest_row else None,
                    "pct_change": round(biggest_row[1], 2) if biggest_row else None,
                    "event_type": biggest_row[2] if biggest_row else None,
                } if biggest_row else None,
            },
            "daily": {
                "total_events": row_24h[0] or 0,
                "unique_coins": row_24h[1] or 0,
                "bullish": row_24h[2] or 0,
                "bearish": row_24h[3] or 0,
                "flash_moves": row_24h[4] or 0,
            },
            "heatmap": [
                {
                    "pair": r[0],
                    "event_count": r[1],
                    "max_up": round(r[2], 2) if r[2] else None,
                    "max_down": round(r[3], 2) if r[3] else None,
                }
                for r in active_coins
            ],
        }
        
        cache_set(cache_key, result, ttl=CACHE_TTL)
        return result
    
    finally:
        db.close()


# ============================================================
# TOP MOVERS — Gainers, losers, most active
# ============================================================

@router.get("/top-movers")
async def get_top_movers(
    period: str = Query("1h", regex="^(1h|4h|24h)$"),
):
    """Get top gainers, losers, and most active coins"""
    
    cache_key = f"lq:pulse:movers:{period}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    interval_map = {"1h": "1 hour", "4h": "4 hours", "24h": "24 hours"}
    interval = interval_map[period]
    
    db = SessionLocal()
    try:
        # Top gainers (highest single event %)
        gainers = db.execute(text(f"""
            SELECT DISTINCT ON (pair) pair, pct_change, event_type, timeframe, created_at
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '{interval}'
              AND direction = 'bullish'
            ORDER BY pair, pct_change DESC
        """)).fetchall()
        gainers_sorted = sorted(gainers, key=lambda r: r[1], reverse=True)[:10]
        
        # Top losers
        losers = db.execute(text(f"""
            SELECT DISTINCT ON (pair) pair, pct_change, event_type, timeframe, created_at
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '{interval}'
              AND direction = 'bearish'
            ORDER BY pair, pct_change ASC
        """)).fetchall()
        losers_sorted = sorted(losers, key=lambda r: r[1])[:10]
        
        # Most active
        active = db.execute(text(f"""
            SELECT pair, COUNT(*) as event_count,
                   COUNT(*) FILTER (WHERE direction = 'bullish') as bull,
                   COUNT(*) FILTER (WHERE direction = 'bearish') as bear,
                   MAX(pct_change) as best,
                   MIN(pct_change) as worst
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '{interval}'
            GROUP BY pair
            ORDER BY event_count DESC
            LIMIT 10
        """)).fetchall()
        
        # Flash moves
        flashes = db.execute(text(f"""
            SELECT pair, pct_change, move_seconds, created_at
            FROM market_pulse
            WHERE created_at > NOW() - INTERVAL '{interval}'
              AND source = 'price_movement'
            ORDER BY ABS(pct_change) DESC
            LIMIT 10
        """)).fetchall()
        
        result = {
            "period": period,
            "gainers": [
                {"pair": r[0], "pct_change": round(r[1], 2), "event_type": r[2], 
                 "timeframe": r[3], "created_at": r[4].isoformat() if r[4] else None}
                for r in gainers_sorted
            ],
            "losers": [
                {"pair": r[0], "pct_change": round(r[1], 2), "event_type": r[2],
                 "timeframe": r[3], "created_at": r[4].isoformat() if r[4] else None}
                for r in losers_sorted
            ],
            "most_active": [
                {"pair": r[0], "event_count": r[1], "bullish": r[2], "bearish": r[3],
                 "best": round(r[4], 2) if r[4] else None, "worst": round(r[5], 2) if r[5] else None}
                for r in active
            ],
            "flash_moves": [
                {"pair": r[0], "pct_change": round(r[1], 2), "move_seconds": r[2],
                 "created_at": r[3].isoformat() if r[3] else None}
                for r in flashes
            ],
        }
        
        cache_set(cache_key, result, ttl=CACHE_TTL)
        return result
    
    finally:
        db.close()


# ============================================================
# COIN DETAIL — Per-coin breakdown
# ============================================================

@router.get("/coin/{pair}")
async def get_coin_detail(pair: str):
    """Get detailed activity for a specific coin"""
    
    pair = pair.upper()
    cache_key = f"lq:pulse:coin:{pair}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    db = SessionLocal()
    try:
        # Coin stats (24h)
        stats = db.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE direction = 'bullish') as bullish,
                COUNT(*) FILTER (WHERE direction = 'bearish') as bearish,
                MAX(pct_change) as strongest_up,
                MIN(pct_change) as strongest_down,
                MAX(created_at) as last_activity,
                COUNT(*) FILTER (WHERE source = 'price_movement') as flash_count
            FROM market_pulse
            WHERE pair = :pair
              AND created_at > NOW() - INTERVAL '24 hours'
        """), {"pair": pair}).fetchone()
        
        if not stats or stats[0] == 0:
            raise HTTPException(status_code=404, detail=f"No data for {pair} in last 24h")
        
        # Latest events
        events = db.execute(text("""
            SELECT id, source, direction, pct_change, timeframe, event_type,
                   event_type_zh, move_seconds, created_at
            FROM market_pulse
            WHERE pair = :pair
              AND created_at > NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
            LIMIT 50
        """), {"pair": pair}).fetchall()
        
        total = stats[0]
        bullish = stats[1] or 0
        
        result = {
            "pair": pair,
            "base_symbol": pair.replace("USDT", ""),
            "stats": {
                "total_events": total,
                "bullish": bullish,
                "bearish": stats[2] or 0,
                "bull_pct": round(bullish / total * 100) if total > 0 else 0,
                "strongest_up": round(stats[3], 2) if stats[3] else None,
                "strongest_down": round(stats[4], 2) if stats[4] else None,
                "last_activity": stats[5].isoformat() if stats[5] else None,
                "flash_count": stats[6] or 0,
            },
            "events": [
                {
                    "id": r[0], "source": r[1], "direction": r[2],
                    "pct_change": round(r[3], 2), "timeframe": r[4],
                    "event_type": r[5], "event_type_zh": r[6],
                    "move_seconds": r[7],
                    "created_at": r[8].isoformat() if r[8] else None,
                }
                for r in events
            ],
        }
        
        cache_set(cache_key, result, ttl=CACHE_TTL)
        return result
    
    finally:
        db.close()