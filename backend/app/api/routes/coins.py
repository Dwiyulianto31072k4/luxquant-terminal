"""
LuxQuant Coins API — Categorization endpoint
=============================================
GET /api/v1/coins/{pair}              → detail full
GET /api/v1/coins/stats               → distribution stats
GET /api/v1/coins?has_utility=true    → filter list

Place at:
    /root/luxquant-terminal/backend/app/api/v1/coins.py

WIRING — add to whichever file mounts your v1 routers (e.g. app/main.py):

    from app.api.v1 import coins as coins_router
    app.include_router(coins_router.router, prefix="/api/v1/coins", tags=["coins"])

If your project uses a single api_router aggregator, just include the line there.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

# Adjust this import to match your project's database module.
# Common patterns in LuxQuant:
#   from app.db.session import engine
#   from app.core.database import engine
# Try this first; if it fails, change to whichever your other workers use.
try:
    from app.db.session import engine
except ImportError:
    from app.core.database import engine


router = APIRouter()


# ============================================================
# Schemas
# ============================================================

class CoinCategoryResponse(BaseModel):
    pair: str
    base_symbol: str
    quote_symbol: Optional[str] = None
    token_type: Optional[str] = None
    sector: Optional[str] = None
    has_utility: Optional[bool] = None
    utility_details: Optional[dict] = None
    summary: Optional[str] = None
    use_cases: Optional[List[str]] = None
    key_features: Optional[List[str]] = None
    risk_notes: Optional[str] = None
    market_cap_rank: Optional[int] = None
    coingecko_id: Optional[str] = None
    website: Optional[str] = None
    metadata_source: Optional[str] = None
    review_status: Optional[str] = None
    is_categorized: bool = False


class CoinStatsResponse(BaseModel):
    total: int
    pending: int
    auto_categorized: int
    manual_reviewed: int
    has_utility: int
    no_utility: int
    by_token_type: dict
    by_sector: dict


# ============================================================
# Endpoints
# ============================================================

@router.get("/stats", response_model=CoinStatsResponse)
async def get_coin_stats():
    """Distribution stats for admin dashboard / analytics."""
    try:
        with engine.begin() as conn:
            overview = conn.execute(text("""
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE review_status = 'pending') AS pending,
                    COUNT(*) FILTER (WHERE review_status = 'auto_categorized') AS auto_done,
                    COUNT(*) FILTER (WHERE review_status = 'manual_reviewed') AS manual_done,
                    COUNT(*) FILTER (WHERE has_utility = TRUE) AS has_util,
                    COUNT(*) FILTER (WHERE has_utility = FALSE) AS no_util
                FROM coins
            """)).fetchone()

            type_dist = conn.execute(text("""
                SELECT COALESCE(token_type, 'unset') AS t, COUNT(*) AS c
                FROM coins GROUP BY token_type ORDER BY c DESC
            """)).fetchall()

            sector_dist = conn.execute(text("""
                SELECT COALESCE(sector, 'unset') AS s, COUNT(*) AS c
                FROM coins GROUP BY sector ORDER BY c DESC
            """)).fetchall()

        return CoinStatsResponse(
            total=overview[0], pending=overview[1],
            auto_categorized=overview[2], manual_reviewed=overview[3],
            has_utility=overview[4], no_utility=overview[5],
            by_token_type={r[0]: r[1] for r in type_dist},
            by_sector={r[0]: r[1] for r in sector_dist},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {e}")


@router.get("/{pair}", response_model=CoinCategoryResponse)
async def get_coin_by_pair(pair: str):
    """
    Get categorization detail for a single trading pair.
    Returns 200 with is_categorized=False if pair exists but pending review.
    Returns 404 if pair doesn't exist in coins table.
    """
    pair = pair.upper().strip()
    try:
        with engine.begin() as conn:
            row = conn.execute(text("""
                SELECT
                    pair, base_symbol, quote_symbol,
                    token_type, sector, has_utility, utility_details,
                    summary, use_cases, key_features, risk_notes,
                    market_cap_rank, coingecko_id, website,
                    metadata_source, review_status
                FROM coins WHERE pair = :pair
            """), {"pair": pair}).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Pair {pair} not found")

        return CoinCategoryResponse(
            pair=row[0],
            base_symbol=row[1],
            quote_symbol=row[2],
            token_type=row[3],
            sector=row[4],
            has_utility=row[5],
            utility_details=row[6] if isinstance(row[6], dict) else None,
            summary=row[7],
            use_cases=row[8] if isinstance(row[8], list) else [],
            key_features=row[9] if isinstance(row[9], list) else [],
            risk_notes=row[10],
            market_cap_rank=row[11],
            coingecko_id=row[12],
            website=row[13],
            metadata_source=row[14],
            review_status=row[15],
            is_categorized=row[15] in ("auto_categorized", "manual_reviewed"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch coin: {e}")


@router.get("", response_model=List[CoinCategoryResponse])
async def list_coins(
    has_utility: Optional[bool] = Query(None),
    token_type: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List coins with optional filters (only categorized ones)."""
    try:
        sql = """
            SELECT
                pair, base_symbol, quote_symbol,
                token_type, sector, has_utility, utility_details,
                summary, use_cases, key_features, risk_notes,
                market_cap_rank, coingecko_id, website,
                metadata_source, review_status
            FROM coins
            WHERE review_status IN ('auto_categorized', 'manual_reviewed')
        """
        params = {"limit": limit, "offset": offset}

        if has_utility is not None:
            sql += " AND has_utility = :has_utility"
            params["has_utility"] = has_utility
        if token_type:
            sql += " AND token_type = :token_type"
            params["token_type"] = token_type
        if sector:
            sql += " AND sector = :sector"
            params["sector"] = sector

        sql += " ORDER BY market_cap_rank NULLS LAST, pair LIMIT :limit OFFSET :offset"

        with engine.begin() as conn:
            rows = conn.execute(text(sql), params).fetchall()

        return [
            CoinCategoryResponse(
                pair=r[0], base_symbol=r[1], quote_symbol=r[2],
                token_type=r[3], sector=r[4], has_utility=r[5],
                utility_details=r[6] if isinstance(r[6], dict) else None,
                summary=r[7],
                use_cases=r[8] if isinstance(r[8], list) else [],
                key_features=r[9] if isinstance(r[9], list) else [],
                risk_notes=r[10], market_cap_rank=r[11],
                coingecko_id=r[12], website=r[13],
                metadata_source=r[14], review_status=r[15],
                is_categorized=r[15] in ("auto_categorized", "manual_reviewed"),
            )
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list coins: {e}")
