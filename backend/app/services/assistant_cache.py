"""
Semantic cache for the LuxQuant Assistant.

Beyond the exact-match Redis cache, this catches questions that are DIFFERENT
wording but the SAME meaning ("what is WR?" vs "WR means what?") and serves the
previous answer for free — the biggest cost saver once traffic grows.

How it works (see docs/llm-cost-efficiency-research.md):
  1. Embed the question (OpenAI text-embedding-3-small — cheap, ~$0.02/1M tokens).
  2. Find the nearest previously-answered question in pgvector for the same page.
  3. If cosine similarity >= threshold, reuse that answer (no LLM call).

Fully defensive: if OPENAI_API_KEY is missing or the pgvector extension can't be
created, this silently no-ops and the assistant falls back to exact-match caching.
"""
from __future__ import annotations
import os
from typing import Optional, List

from sqlalchemy import text
from openai import AsyncOpenAI

from app.core.database import SessionLocal

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
# Cosine similarity needed to treat two questions as "the same". Conservative on
# purpose — a loose threshold returns wrong answers. Tune via env if needed.
SIM_THRESHOLD = float(os.getenv("ASSISTANT_SEMCACHE_THRESHOLD", "0.93"))

_openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None

# Tri-state: None = not checked yet, True/False = pgvector available or not.
_pgvector_ready: Optional[bool] = None


def _vec_literal(emb: List[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in emb) + "]"


def _ensure(db) -> bool:
    """Create the extension + table once. Returns True if usable."""
    global _pgvector_ready
    if _pgvector_ready is not None:
        return _pgvector_ready
    try:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        db.execute(text(f"""
            CREATE TABLE IF NOT EXISTS assistant_semcache (
                id BIGSERIAL PRIMARY KEY,
                page_id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                embedding vector({EMBED_DIM}) NOT NULL,
                hits INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_semcache_page ON assistant_semcache (page_id)"))
        db.commit()
        _pgvector_ready = True
    except Exception as e:
        print(f"⚠️ [semcache] pgvector unavailable, disabling semantic cache: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        _pgvector_ready = False
    return _pgvector_ready


async def embed(text_in: str) -> Optional[List[float]]:
    """Return an embedding for the question, or None if embeddings are unavailable."""
    if _openai is None or not text_in:
        return None
    try:
        r = await _openai.embeddings.create(model=EMBED_MODEL, input=text_in[:2000])
        return r.data[0].embedding
    except Exception as e:
        print(f"⚠️ [semcache] embed failed: {e}")
        return None


def lookup(page_id: str, emb: List[float]) -> Optional[str]:
    """Return a cached answer for a semantically-similar question, or None."""
    try:
        db = SessionLocal()
        try:
            if not _ensure(db):
                return None
            vec = _vec_literal(emb)
            row = db.execute(text("""
                SELECT id, answer, 1 - (embedding <=> :vec::vector) AS sim
                FROM assistant_semcache
                WHERE page_id = :p
                ORDER BY embedding <=> :vec::vector
                LIMIT 1
            """), {"vec": vec, "p": page_id}).mappings().first()
            if row and float(row["sim"]) >= SIM_THRESHOLD:
                db.execute(text("UPDATE assistant_semcache SET hits = hits + 1 WHERE id = :id"),
                           {"id": row["id"]})
                db.commit()
                return row["answer"]
            return None
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️ [semcache] lookup failed: {e}")
        return None


def store(page_id: str, question: str, answer: str, emb: List[float]) -> None:
    """Persist a new Q/A + embedding. Safe to call from a background task."""
    try:
        db = SessionLocal()
        try:
            if not _ensure(db):
                return
            db.execute(text("""
                INSERT INTO assistant_semcache (page_id, question, answer, embedding)
                VALUES (:p, :q, :a, :vec::vector)
            """), {"p": page_id, "q": question[:1000], "a": answer, "vec": _vec_literal(emb)})
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️ [semcache] store failed: {e}")
