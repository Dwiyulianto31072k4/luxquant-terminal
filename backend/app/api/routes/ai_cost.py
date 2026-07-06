"""
AI Cost Tracker — admin endpoints.

Reads aggregates from `ai_usage_log` (written by app.services.ai_cost.log_usage)
for the admin Management System "AI Cost" tab.

  GET /api/v1/workspace/ai-cost/summary?days=30
      headline cards (today / month / range), by-feature breakdown,
      daily series, and app-layer cache stats.
  GET /api/v1/workspace/ai-cost/recent?limit=50
      most recent calls.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.api.deps import get_admin_user

router = APIRouter(prefix="/api/v1/workspace/ai-cost", tags=["ai-cost"])


def _table_exists(db: Session) -> bool:
    row = db.execute(text("SELECT to_regclass('public.ai_usage_log')")).scalar()
    return row is not None


def _empty_summary(days: int) -> dict:
    return {
        "days": days,
        "today": {"cost": 0, "calls": 0, "tokens": 0},
        "month": {"cost": 0, "calls": 0, "tokens": 0},
        "range": {"cost": 0, "calls": 0, "tokens": 0, "model_calls": 0, "cache_calls": 0},
        "cache_hit_rate": 0,
        "by_feature": [],
        "daily": [],
    }


@router.get("/summary")
def summary(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db), _admin=Depends(get_admin_user)):
    if not _table_exists(db):
        return _empty_summary(days)

    def scalars(q, **p):
        return db.execute(text(q), p).mappings().first() or {}

    today = scalars("""
        SELECT COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS calls,
               COALESCE(SUM(total_tokens),0) AS tokens
        FROM ai_usage_log WHERE ts >= date_trunc('day', now())
    """)
    month = scalars("""
        SELECT COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS calls,
               COALESCE(SUM(total_tokens),0) AS tokens
        FROM ai_usage_log WHERE ts >= date_trunc('month', now())
    """)
    rng = scalars("""
        SELECT COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS calls,
               COALESCE(SUM(total_tokens),0) AS tokens,
               COUNT(*) FILTER (WHERE served_from_cache = false) AS model_calls,
               COUNT(*) FILTER (WHERE served_from_cache = true) AS cache_calls
        FROM ai_usage_log WHERE ts >= now() - make_interval(days => :d)
    """, d=days)

    by_feature = db.execute(text("""
        SELECT feature,
               COALESCE(SUM(cost_usd),0) AS cost,
               COUNT(*) AS calls,
               COALESCE(SUM(total_tokens),0) AS tokens
        FROM ai_usage_log
        WHERE ts >= now() - make_interval(days => :d)
        GROUP BY feature ORDER BY cost DESC
    """), {"d": days}).mappings().all()

    daily = db.execute(text("""
        SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS date,
               COALESCE(SUM(cost_usd),0) AS cost,
               COUNT(*) AS calls,
               COALESCE(SUM(total_tokens),0) AS tokens
        FROM ai_usage_log
        WHERE ts >= now() - make_interval(days => :d)
        GROUP BY 1 ORDER BY 1
    """), {"d": days}).mappings().all()

    calls = int(rng.get("calls") or 0)
    cache_calls = int(rng.get("cache_calls") or 0)
    cache_hit_rate = round((cache_calls / calls) * 100, 1) if calls else 0

    def f(m):
        return {
            "cost": round(float(m.get("cost") or 0), 6),
            "calls": int(m.get("calls") or 0),
            "tokens": int(m.get("tokens") or 0),
        }

    return {
        "days": days,
        "today": f(today),
        "month": f(month),
        "range": {**f(rng), "model_calls": int(rng.get("model_calls") or 0), "cache_calls": cache_calls},
        "cache_hit_rate": cache_hit_rate,
        "by_feature": [
            {"feature": r["feature"], "cost": round(float(r["cost"]), 6),
             "calls": int(r["calls"]), "tokens": int(r["tokens"])}
            for r in by_feature
        ],
        "daily": [
            {"date": r["date"], "cost": round(float(r["cost"]), 6),
             "calls": int(r["calls"]), "tokens": int(r["tokens"])}
            for r in daily
        ],
    }


@router.get("/recent")
def recent(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db), _admin=Depends(get_admin_user)):
    if not _table_exists(db):
        return {"items": []}
    rows = db.execute(text("""
        SELECT to_char(ts, 'YYYY-MM-DD HH24:MI:SS') AS ts, feature, page_id, model,
               total_tokens, completion_tokens, cost_usd, served_from_cache
        FROM ai_usage_log ORDER BY ts DESC LIMIT :lim
    """), {"lim": limit}).mappings().all()
    return {"items": [
        {
            "ts": r["ts"], "feature": r["feature"], "page_id": r["page_id"],
            "model": r["model"], "tokens": int(r["total_tokens"] or 0),
            "completion_tokens": int(r["completion_tokens"] or 0),
            "cost": round(float(r["cost_usd"] or 0), 8),
            "cached": bool(r["served_from_cache"]),
        } for r in rows
    ]}
