"""
LuxQuant — BTC Correlation API
Mount in your FastAPI app:
    from app.api.btc_correlation_api import router as btc_corr_router
    app.include_router(btc_corr_router)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import asyncpg

# Replace with your project's actual DB pool dependency
# from app.core.db import get_db_pool

router = APIRouter(prefix="/api/signals", tags=["btc-correlation"])


def _row_to_dict(row: asyncpg.Record) -> dict:
    return {
        "signal_id":   row["signal_id"],
        "pair":        row["pair"],
        "metrics": {
            "corr_1h_7d":    float(row["corr_1h_7d"])    if row["corr_1h_7d"]    is not None else None,
            "corr_4h_30d":   float(row["corr_4h_30d"])   if row["corr_4h_30d"]   is not None else None,
            "beta_30d":      float(row["beta_30d"])      if row["beta_30d"]      is not None else None,
            "r_squared_30d": float(row["r_squared_30d"]) if row["r_squared_30d"] is not None else None,
            "corr_zscore":   float(row["corr_zscore"])   if row["corr_zscore"]   is not None else None,
        },
        "btc_context":    row["btc_context"],
        "is_decoupled":   row["is_decoupled"],
        "interpretation": row["interpretation"],
        "data_source":    row["data_source"],
        "sample_quality": row["sample_quality"],
        "analyzed_at":    row["analyzed_at"].isoformat() if row["analyzed_at"] else None,
    }


@router.get("/{signal_id}/btc-correlation")
async def get_btc_correlation(signal_id: str, pool: asyncpg.Pool = Depends(get_db_pool)):
    """
    Returns BTC correlation metrics + auto-generated interpretation for a single signal.
    404 if correlation hasn't been computed yet (worker may still be processing).
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT signal_id, pair,
                   corr_1h_7d, corr_4h_30d, beta_30d,
                   r_squared_30d, corr_zscore,
                   btc_context, is_decoupled, interpretation,
                   data_source, sample_quality, analyzed_at
            FROM signal_btc_correlation
            WHERE signal_id = $1
        """, signal_id)

    if not row:
        raise HTTPException(
            status_code=404,
            detail="BTC correlation not yet computed. Worker may still be processing."
        )
    return _row_to_dict(row)


@router.get("/btc-correlation/recent")
async def list_recent_correlations(
    limit: int = 20,
    decoupled_only: bool = False,
    min_score: Optional[int] = None,
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    limit = max(1, min(limit, 100))
    where = []
    args  = []

    if decoupled_only:
        where.append("is_decoupled = TRUE")
    if min_score is not None:
        args.append(min_score)
        where.append(f"(interpretation->>'alignment_score')::int >= ${len(args)}")

    where_clause = ("WHERE " + " AND ".join(where)) if where else ""
    args.append(limit)

    query = f"""
        SELECT signal_id, pair,
               corr_1h_7d, corr_4h_30d, beta_30d,
               r_squared_30d, corr_zscore,
               btc_context, is_decoupled, interpretation,
               data_source, sample_quality, analyzed_at
        FROM signal_btc_correlation
        {where_clause}
        ORDER BY analyzed_at DESC
        LIMIT ${len(args)}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)

    return {"count": len(rows), "items": [_row_to_dict(r) for r in rows]}
