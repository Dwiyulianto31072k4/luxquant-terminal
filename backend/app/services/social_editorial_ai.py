"""
Social Editorial AI — xAI/Grok content pack for social news posts.

Ports the prototype `build_editorial_pack` into the backend. One xAI call turns
a crypto_news item (+ scraped article text, optional enrichment) into a complete
editorial pack: headline, image prompt, caption, hashtags, source note.

Returns None on any failure (missing key, network, bad JSON) so the caller can
fall back to the deterministic rule-based generator. Never raises.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

XAI_API_BASE = os.environ.get("XAI_API_BASE", "https://api.x.ai/v1")
XAI_CHAT_MODEL = os.environ.get("XAI_CHAT_MODEL", "grok-4")
XAI_TIMEOUT = int(os.environ.get("XAI_CHAT_TIMEOUT", "150"))

PACK_KEYS = ("headline", "image_prompt", "caption", "hashtags", "source_note")

# Standard closing blocks appended to every AI caption (kept out of the AI body
# so the URL and wording are always exact, never hallucinated).
CAPTION_DISCLAIMER = os.environ.get(
    "SOCIAL_CAPTION_DISCLAIMER",
    "Not financial advice. Always do your own research.",
)
CAPTION_CTA = os.environ.get(
    "SOCIAL_CAPTION_CTA",
    "Read more crypto news at luxquant.tw/crypto-news",
)


def assemble_caption(pack: dict, *, source_domain: Optional[str] = None) -> str:
    """Build the final post caption: body → source → disclaimer → CTA → hashtags."""
    body = str(pack.get("caption") or "").strip()
    raw_note = str(pack.get("source_note") or "").strip() or (source_domain or "")
    note = ""
    if raw_note:
        note = raw_note if raw_note.lower().startswith("source") else f"Source: {raw_note}"
    tags = " ".join(pack.get("hashtags") or [])
    parts = [body, note, CAPTION_DISCLAIMER, CAPTION_CTA, tags]
    return "\n\n".join(p for p in parts if p)


def _xai_chat(api_key: str, messages: list[dict[str, str]], temperature: float = 0.45) -> dict[str, Any]:
    payload = {
        "model": XAI_CHAT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(
        f"{XAI_API_BASE.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=XAI_TIMEOUT,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    try:
        return json.loads(content)
    except Exception:
        match = re.search(r"\{.*\}", content, flags=re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def _build_context(news: dict, article_text: str, tavily: Optional[dict]) -> dict:
    context = {
        "db_news": {
            "title": news.get("title"),
            "description": news.get("description"),
            "url": news.get("url"),
            "domain": news.get("domain"),
            "category": news.get("category"),
        },
        "article_text": (article_text or "")[:7000],
    }
    if tavily:
        context["tavily_answer"] = tavily.get("answer", "")
        context["tavily_results"] = [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "content": (item.get("raw_content") or item.get("content") or "")[:1300],
            }
            for item in (tavily.get("results") or [])[:4]
        ]
    return context


def build_editorial_pack(
    news: dict,
    article_text: str,
    tavily: Optional[dict] = None,
    *,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Return a social-news editorial pack, or None if the AI is unavailable/failed.

    Keys on success: headline, image_prompt, caption, hashtags (list), source_note.
    """
    key = api_key or os.environ.get("XAI_API_KEY", "").strip()
    if not key:
        logger.info("social_editorial_ai: XAI_API_KEY not set, skipping AI pack")
        return None

    context = _build_context(news, article_text, tavily)
    system = (
        "You are LuxQuant's senior crypto and business news editor plus image prompt director. "
        "Everything must be in English for a global audience. Be accurate, premium, and sober. "
        "Do not invent exact facts, quotes, or numbers beyond the source context."
    )
    user = (
        "Create a complete social-news pack from this source context. Return JSON only with keys: "
        "headline, image_prompt, caption, hashtags, source_note.\n\n"
        "Headline: 7-12 words, premium editorial, clear, not clickbait.\n"
        "Image prompt: realistic editorial photo/composite for xAI image generation. Mention key actors, tokens, "
        "institutions, charts, and real-world context if relevant. No logo, no watermark, no readable text, no fake "
        "letters/numbers, no purple theme. Natural business/crypto news look. Leave lower-left clean for headline overlay.\n"
        "Caption: 3-4 short punchy paragraphs, English. Lead with the key fact (what happened), then why it matters for "
        "crypto/markets, then a brief caveat. Do NOT include hashtags, a disclaimer, a call-to-action, or a source line "
        "in the caption body — those are appended separately. Plain paragraphs only.\n"
        "Hashtags: 5-8 relevant hashtags.\n\n"
        f"Source context:\n{json.dumps(context, ensure_ascii=False)}"
    )

    try:
        pack = _xai_chat(key, [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
    except Exception as exc:  # noqa: BLE001 — best-effort; caller falls back
        logger.warning("social_editorial_ai: xAI call failed (%s): %s", type(exc).__name__, exc)
        return None

    if not isinstance(pack, dict) or not pack.get("headline") or not pack.get("caption"):
        logger.warning("social_editorial_ai: incomplete pack, ignoring")
        return None

    # Normalize hashtags to a list of '#Tag' strings.
    tags = pack.get("hashtags") or []
    if isinstance(tags, str):
        tags = tags.split()
    tags = [t if str(t).startswith("#") else f"#{t}" for t in tags if str(t).strip()]
    pack["hashtags"] = tags[:8]
    return pack
