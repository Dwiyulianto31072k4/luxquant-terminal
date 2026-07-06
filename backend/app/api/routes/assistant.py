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

from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from app.core.redis import cache_get, cache_set, get_redis
from app.services.ai_cost import log_usage, extract_usage

FEATURE = "assistant"  # cost-tracking label (generalizes to other features later)

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
            "What is Deep Analysis on a signal?",
            "What does the BTC Compass tell me?",
            "How do I read the Trade Proof (before/after)?",
            "What does the 'Worth It' verdict mean?",
            "How do I find promising small-cap coins?",
            "What do statuses TP1, WIN, and LOSS mean?",
            "What is BTC Corr (rho / beta)?",
        ],
    },
    "autotrade": {
        "file": "autotrade-page.md",
        "label": "AutoTrade",
        "suggestions": [
            "How do I set up AutoTrade?",
            "What do the engine states (Live / Paused) mean?",
            "What is Dry Run mode?",
            "What do the risk limits do?",
            "How do I limit my risk on AutoTrade?",
            "What's the difference between Spot and Futures here?",
            "Why isn't the bot placing trades?",
            "What does TP source 'signal level' vs 'custom' mean?",
        ],
    },
    "ai-research": {
        "file": "ai-research-page.md",
        "label": "AI Research",
        "suggestions": [
            "What is the BTC Compass?",
            "What does 'The Read' show?",
            "What does confidence % mean?",
            "What is the invalidation level?",
            "What is the Verdict Ledger?",
            "What does the Brain panel show?",
            "How do I read the projection chart?",
            "What's the difference between tactical and longer view?",
        ],
    },
    "bitcoin": {
        "file": "bitcoin-page.md",
        "label": "Bitcoin",
        "suggestions": [
            "What is BTC dominance?",
            "How do I read the Fear & Greed index?",
            "What does RSI overbought / oversold mean?",
            "What is MVRV?",
            "What does the funding rate tell me?",
            "What is hashrate and difficulty?",
            "How far is BTC from its all-time high?",
            "What does the long/short ratio mean?",
        ],
    },
    "markets": {
        "file": "markets-page.md",
        "label": "Markets",
        "suggestions": [
            "How do I read the heatmap?",
            "What does the Trending section show?",
            "What are Top Categories?",
            "What do ETF flows mean?",
            "What are liquidations?",
            "How do the coin table tabs work?",
            "What do stablecoin supply changes signal?",
            "What is funding sentiment?",
        ],
    },
    "performance": {
        "file": "performance-page.md",
        "label": "Performance Hub",
        "suggestions": [
            "How is win rate calculated?",
            "What is the difference between the All-Time, Daily, and Research views?",
            "What does Expected Value (EV) mean?",
            "What is calibration?",
            "What does the 'small sample' badge mean?",
            "What does 'resolved signals' mean?",
            "What is the By Pattern breakdown?",
            "How reliable are these stats?",
        ],
    },
    "money-flow": {
        "file": "money-flow-page.md",
        "label": "Money Flow",
        "suggestions": [
            "What does Net Buying vs Net Selling mean?",
            "What is sector rotation?",
            "What does stablecoin dominance tell me?",
            "What is the Whale tab?",
            "What does the intensity bar show?",
            "What is DEX flow?",
            "How do I find where money is flowing in?",
            "What are the highlighted 'call' rows?",
        ],
    },
    "onchain": {
        "file": "onchain-page.md",
        "label": "On-Chain",
        "suggestions": [
            "What is a whale alert?",
            "What does 'Smart Money' mean?",
            "What do exchange deposits signal?",
            "What is the difference between Mint and Burn?",
            "How do I filter by transaction size?",
            "What is a liquidation alert?",
            "What does the whale threshold mean?",
            "How do I focus on only big transactions?",
        ],
    },
    "journal": {
        "file": "journal-page.md",
        "label": "Journal",
        "suggestions": [
            "How do I log a trade?",
            "What are the mistake tags for?",
            "What is planned vs actual entry?",
            "How is R:R calculated?",
            "What are strategy tags?",
            "Can I journal a LuxQuant signal directly?",
            "Why should I track my emotions?",
            "How do I review my past trades?",
        ],
    },
    "watchlist": {
        "file": "watchlist-page.md",
        "label": "Watchlist",
        "suggestions": [
            "How do I add a signal to my watchlist?",
            "How do I remove a signal?",
            "What do the filter tabs mean?",
            "How do I sort by P&L?",
            "What does the TP Hit filter show?",
            "Are prices live here?",
            "What is the difference between Open and Closed?",
            "How do I track only active signals?",
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
- Be concise and friendly. Keep answers short.
- FORMATTING: Use short plain paragraphs and simple "- " bullet points only. \
Use **bold** to highlight key terms. Do NOT use markdown headings (#, ##, ###), \
horizontal rules (---), tables, or greetings like "Great question". Start \
directly with the answer.

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
async def chat(req: ChatRequest, request: Request, background: BackgroundTasks):
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
        # Log a $0 cache-served row so we can measure app-layer savings.
        background.add_task(log_usage, FEATURE, MODEL, None, req.page_id, True)
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
        # Track token usage & cost (non-blocking, after response is sent).
        background.add_task(
            log_usage, FEATURE, MODEL, extract_usage(getattr(res, "usage", None)), req.page_id, False
        )
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
