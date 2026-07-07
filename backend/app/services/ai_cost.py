"""
AI Cost Tracking — shared pricing, cost math, and usage logging.

Every AI call (starting with the LuxQuant Assistant) writes one row to
`ai_usage_log`. The admin AI Cost Tracker reads aggregates from it.

Design:
  * Pricing is a simple editable table (USD per 1M tokens). Update here when a
    provider changes prices.
  * DeepSeek returns cache-aware token counts (prompt_cache_hit_tokens /
    prompt_cache_miss_tokens) so we can price cached input at the cheap rate.
  * `feature` labels which product surface made the call (e.g. "assistant"),
    so this generalizes to every feature later without schema changes.
  * The table is created lazily (CREATE TABLE IF NOT EXISTS) to avoid a
    migration; logging never raises into the request path.
"""
from __future__ import annotations
from typing import Optional
from sqlalchemy import text

from app.core.database import SessionLocal

# ── Pricing: USD per 1,000,000 tokens. EDIT HERE when prices change. ──
# Sources (Jul 2026): DeepSeek V4 pricing (cache hit / cache miss / output).
PRICING = {
    "deepseek-chat": {"cache_hit": 0.014, "cache_miss": 0.14, "output": 0.28},
    "deepseek-reasoner": {"cache_hit": 0.14, "cache_miss": 0.55, "output": 2.19},
    # Add other models here as features adopt them, e.g.:
    # "nousresearch/hermes-4-405b": {"cache_hit": ..., "cache_miss": ..., "output": ...},
}
_DEFAULT_PRICE = {"cache_hit": 0.014, "cache_miss": 0.14, "output": 0.28}

_TABLE_READY = False


def compute_cost(model: str, cache_hit_tokens: int, cache_miss_tokens: int, completion_tokens: int) -> float:
    """USD cost for one call given cache-aware token counts."""
    p = PRICING.get(model, _DEFAULT_PRICE)
    return (
        (cache_hit_tokens / 1_000_000) * p["cache_hit"]
        + (cache_miss_tokens / 1_000_000) * p["cache_miss"]
        + (completion_tokens / 1_000_000) * p["output"]
    )


def extract_usage(usage) -> dict:
    """Normalize an OpenAI/DeepSeek usage object into plain ints.

    DeepSeek adds prompt_cache_hit_tokens / prompt_cache_miss_tokens. If absent
    (other providers), all prompt tokens are treated as a cache miss.
    """
    if usage is None:
        return {"prompt": 0, "hit": 0, "miss": 0, "completion": 0, "total": 0}
    d = {}
    try:
        d = usage.model_dump()  # pydantic (openai SDK)
    except Exception:
        d = dict(getattr(usage, "__dict__", {}) or {})
    prompt = int(d.get("prompt_tokens") or 0)
    completion = int(d.get("completion_tokens") or 0)
    hit = d.get("prompt_cache_hit_tokens")
    miss = d.get("prompt_cache_miss_tokens")
    if hit is None and miss is None:
        hit, miss = 0, prompt
    else:
        hit = int(hit or 0)
        miss = int(miss or 0)
    return {
        "prompt": prompt,
        "hit": hit,
        "miss": miss,
        "completion": completion,
        "total": int(d.get("total_tokens") or (prompt + completion)),
    }


def _ensure_table(db) -> None:
    global _TABLE_READY
    if _TABLE_READY:
        return
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_usage_log (
            id BIGSERIAL PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT now(),
            feature TEXT NOT NULL,
            page_id TEXT,
            model TEXT NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            cache_hit_tokens INTEGER DEFAULT 0,
            cache_miss_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            cost_usd NUMERIC(14,10) DEFAULT 0,
            served_from_cache BOOLEAN DEFAULT false
        );
    """))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage_log (ts);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_log (feature);"))
    # Who asked (nullable — assistant is usable while logged out).
    db.execute(text("ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS user_id BIGINT"))
    db.execute(text("ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS user_label TEXT"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log (user_id);"))
    db.commit()
    _TABLE_READY = True


def log_usage(
    feature: str,
    model: str,
    usage: Optional[dict] = None,
    page_id: Optional[str] = None,
    served_from_cache: bool = False,
    user_id: Optional[int] = None,
    user_label: Optional[str] = None,
) -> None:
    """Insert one usage row. Never raises — safe to call from any handler.

    When `served_from_cache` is True, the answer came from our own Redis cache
    so token counts and cost are zero (this is how we measure app-layer savings).
    `user_id`/`user_label` record who asked (null when logged out).
    """
    u = usage or {"prompt": 0, "hit": 0, "miss": 0, "completion": 0, "total": 0}
    cost = 0.0 if served_from_cache else compute_cost(model, u["hit"], u["miss"], u["completion"])
    try:
        db = SessionLocal()
        try:
            _ensure_table(db)
            db.execute(
                text("""
                    INSERT INTO ai_usage_log
                        (feature, page_id, model, prompt_tokens, cache_hit_tokens,
                         cache_miss_tokens, completion_tokens, total_tokens,
                         cost_usd, served_from_cache, user_id, user_label)
                    VALUES
                        (:feature, :page_id, :model, :prompt, :hit, :miss,
                         :completion, :total, :cost, :cached, :user_id, :user_label)
                """),
                {
                    "feature": feature,
                    "page_id": page_id,
                    "model": model,
                    "prompt": u["prompt"],
                    "hit": u["hit"],
                    "miss": u["miss"],
                    "completion": u["completion"],
                    "total": u["total"],
                    "cost": cost,
                    "cached": served_from_cache,
                    "user_id": user_id,
                    "user_label": user_label,
                },
            )
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️ [ai_cost] log_usage failed: {e}")
