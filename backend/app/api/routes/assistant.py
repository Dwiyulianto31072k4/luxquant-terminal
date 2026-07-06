"""
LuxQuant Assistant — context-aware help assistant (MVP)

Scope for now: ONE feature — the "Potential Trades" (Signals) page.
Answers *how to use the feature* and *explains visible data* (read-only).
Refuses buy/sell / financial advice.

Cost-minimizing design (see docs/llm-cost-efficiency-research.md):
  1. Exact-match cache in Redis  -> identical questions cost $0
  2. Static guide prefix first   -> provider prompt-caching friendly
  3. DeepSeek (already wired)     -> cheapest capable model
Vector / semantic cache is intentionally deferred until we have >1 page.
"""
import os
import hashlib
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from app.core.redis import cache_get, cache_set, get_redis

router = APIRouter(tags=["assistant"])

# ── Model client (mirrors ai_worker.py) ─────────────────────────────
_deepseek = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
)
MODEL = "deepseek-chat"  # cheapest DeepSeek tier; plenty for help Q&A

# ── Knowledge base (one markdown file per page) ─────────────────────
KNOWLEDGE_DIR = Path(__file__).resolve().parents[3] / "knowledge"

# page_id -> (knowledge file, human label, suggested questions)
PAGES = {
    "signals": {
        "file": "signals-page.md",
        "label": "Potential Trades",
        "suggestions": [
            "What do the WR and Streak columns mean?",
            "How do I find promising small-cap coins?",
            "What's the difference between NORMAL and HIGH risk?",
            "What does the 'Worth It' verdict mean?",
            "How do I use the Advanced Filters?",
            "What do statuses TP1, WIN, and LOSS mean?",
            "What is BTC Corr (rho / beta)?",
            "How do I save a signal to my watchlist?",
        ],
    },
}

SYSTEM_PROMPT = """You are the LuxQuant Assistant, a helpful in-app guide for the \
LuxQuant crypto terminal.

RULES:
- Answer ONLY using the GUIDE provided below. If the answer is not in the guide, \
say you don't know and suggest contacting support. Do not invent features.
- You may explain how to use features and what the on-screen data/columns mean.
- You must REFUSE to give trading recommendations, buy/sell calls, price \
predictions, or any financial advice. If asked, briefly decline and remind the \
user that LuxQuant provides data and tools, and trading decisions are theirs.
- Always reply in clear, simple English (the audience is global).
- Be concise and friendly. Use short paragraphs or short bullet lists.

GUIDE:
---
{guide}
---"""

# Simple in-process fallback if a page guide is missing
_GUIDE_CACHE: dict = {}


def _load_guide(page_id: str) -> Optional[str]:
    if page_id in _GUIDE_CACHE:
        return _GUIDE_CACHE[page_id]
    meta = PAGES.get(page_id)
    if not meta:
        return None
    path = KNOWLEDGE_DIR / meta["file"]
    try:
        text = path.read_text(encoding="utf-8")
        _GUIDE_CACHE[page_id] = text
        return text
    except Exception as e:
        print(f"⚠️ [assistant] failed to read guide {path}: {e}")
        return None


# ── Request / response models ───────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    page_id: str = "signals"
    history: List[ChatMessage] = []


# ── Lightweight per-IP rate limit (Redis) ───────────────────────────
RATE_LIMIT = 20          # requests
RATE_WINDOW = 60         # seconds


def _rate_limited(ip: str) -> bool:
    try:
        client = get_redis()
        key = f"lq:assistant:rl:{ip}"
        n = client.incr(key)
        if n == 1:
            client.expire(key, RATE_WINDOW)
        return n > RATE_LIMIT
    except Exception:
        return False  # never block on cache failure


def _cache_key(page_id: str, message: str) -> str:
    norm = " ".join(message.lower().split())
    h = hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]
    return f"lq:assistant:ans:{page_id}:{h}"


# ── Endpoints ───────────────────────────────────────────────────────
@router.get("/assistant/suggestions")
async def suggestions(page_id: str = "signals"):
    meta = PAGES.get(page_id)
    if not meta:
        return {"page_id": page_id, "label": None, "suggestions": []}
    return {
        "page_id": page_id,
        "label": meta["label"],
        "suggestions": meta["suggestions"],
    }


@router.post("/assistant/chat")
async def chat(req: ChatRequest, request: Request):
    guide = _load_guide(req.page_id)
    if guide is None:
        return {
            "answer": "Sorry, help for this page isn't available yet.",
            "cached": False,
            "error": "unknown_page",
        }

    ip = (request.client.host if request.client else "unknown")
    if _rate_limited(ip):
        return {
            "answer": "Too many questions in a short time. Please try again in a moment.",
            "cached": False,
            "error": "rate_limited",
        }

    # 1) Exact-match cache — identical questions are free
    ckey = _cache_key(req.page_id, req.message)
    cached = cache_get(ckey)
    if cached:
        return {"answer": cached, "cached": True}

    # 2) Build messages: static guide prefix first (prompt-cache friendly)
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(guide=guide)}]
    for m in req.history[-6:]:  # keep prompt short
        if m.role in ("user", "assistant") and m.content:
            messages.append({"role": m.role, "content": m.content[:1000]})
    messages.append({"role": "user", "content": req.message})

    # 3) Call the model
    try:
        res = await _deepseek.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=500,
        )
        answer = (res.choices[0].message.content or "").strip()
    except Exception as e:
        print(f"⚠️ [assistant] model call failed: {e}")
        return {
            "answer": "Sorry, the assistant is unavailable right now. Please try again later.",
            "cached": False,
            "error": "model_unavailable",
        }

    if answer:
        cache_set(ckey, answer, ttl=86400)  # 24h; bust when guide changes
    return {"answer": answer, "cached": False}
