"""
LuxQuant Terminal - BTC Correlation API Routes
================================================
Serves BTC correlation analysis + auto-generated interpretation per signal.

Mount in backend/app/main.py:
    from app.api.routes import btc_correlation
    app.include_router(btc_correlation.router, prefix="/api/v1/signals", tags=["btc-correlation"])
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from app.core.database import get_db

router = APIRouter()


def _row_to_dict(row) -> dict:
    """Serialize a signal_btc_correlation row (RowMapping) to API response."""
    def _f(v):
        return float(v) if v is not None else None

    return {
        "signal_id":   row["signal_id"],
        "pair":        row["pair"],
        "metrics": {
            "corr_1h_7d":             _f(row["corr_1h_7d"]),
            "corr_4h_30d":            _f(row["corr_4h_30d"]),
            "beta_30d":               _f(row["beta_30d"]),
            "r_squared_30d":          _f(row["r_squared_30d"]),
            "corr_zscore":            _f(row["corr_zscore"]),
            "tail_corr_btc_down":     _f(row["tail_corr_btc_down"]),
            "tail_corr_btc_up":       _f(row["tail_corr_btc_up"]),
            "downside_beta":          _f(row["downside_beta"]),
            "lead_lag_hours":         row["lead_lag_hours"],
            "volatility_ratio":       _f(row["volatility_ratio"]),
            "coin_volatility_pct":    _f(row["coin_volatility_pct"]),
            "momentum_divergence_7d": _f(row["momentum_divergence_7d"]),
        },
        "btc_context":      row["btc_context"],
        "is_decoupled":     row["is_decoupled"],
        "is_extended":      row["is_extended"],
        "interpretation":   row["interpretation"],
        "confidence":       row["confidence"],
        "sample_size":      row["sample_size"],
        "data_source":      row["data_source"],
        "snapshot_at":      row["snapshot_at"].isoformat() if row["snapshot_at"] else None,
        "analyzed_at":      row["analyzed_at"].isoformat() if row["analyzed_at"] else None,
    }


_SELECT_COLS = """
    signal_id, pair,
    corr_1h_7d, corr_4h_30d, beta_30d, r_squared_30d, corr_zscore,
    tail_corr_btc_down, tail_corr_btc_up, downside_beta,
    lead_lag_hours, volatility_ratio, coin_volatility_pct,
    momentum_divergence_7d, is_extended,
    btc_context, is_decoupled, interpretation,
    confidence, sample_size, data_source,
    snapshot_at, analyzed_at
"""


@router.get("/{signal_id}/btc-correlation")
def get_btc_correlation(signal_id: str, db: Session = Depends(get_db)):
    """
    BTC correlation analysis + interpretation for a single signal.
    404 if not yet computed (worker may still be processing).
    """
    row = db.execute(
        text(f"""
            SELECT {_SELECT_COLS}
            FROM signal_btc_correlation
            WHERE signal_id = :sid
        """),
        {"sid": signal_id},
    ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="BTC correlation not yet computed. Worker may still be processing."
        )
    return _row_to_dict(row)


@router.get("/btc-correlation/recent")
def list_recent_correlations(
    limit: int = Query(20, ge=1, le=100),
    decoupled_only: bool = False,
    extended_only: bool = False,
    min_score: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """List recent correlations (dashboard use)."""
    where = []
    params = {"lim": limit}

    if decoupled_only:
        where.append("is_decoupled = TRUE")
    if extended_only:
        where.append("is_extended = TRUE")
    if min_score is not None:
        where.append("(interpretation->>'alignment_score')::int >= :min_score")
        params["min_score"] = min_score

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = db.execute(
        text(f"""
            SELECT {_SELECT_COLS}
            FROM signal_btc_correlation
            {where_sql}
            ORDER BY analyzed_at DESC
            LIMIT :lim
        """),
        params,
    ).mappings().all()

    return {"count": len(rows), "items": [_row_to_dict(r) for r in rows]}
