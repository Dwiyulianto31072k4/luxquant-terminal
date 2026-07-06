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

TAVILY_API_BASE = os.environ.get("TAVILY_API_BASE", "https://api.tavily.com")
TAVILY_TIMEOUT = int(os.environ.get("TAVILY_TIMEOUT", "35"))

PACK_KEYS = ("headline", "image_prompt", "caption", "hashtags", "source_note")

# Consistent LuxQuant look + hard negatives appended in code (research: separate
# the "content" prompt the AI writes from a fixed "style" so results stay on-brand
# and reproducible). Kept concise so no single keyword gets diluted.
IMAGE_STYLE_SUFFIX = (
    "Premium editorial business-news photography, one continuous realistic scene, "
    "natural directional lighting with soft shadows and real lens depth. "
    "Lower-left third kept dark and mostly empty for a headline overlay."
)
IMAGE_NEGATIVE_SUFFIX = (
    "No text, no letters, no numbers, no logos, no watermark, no readable UI or chart "
    "labels, no fake tickers, no purple theme, no collage seams, no generic stock-photo look."
)

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


def _normalize_paragraphs(text: str) -> str:
    """Collapse mixed single/double newlines into uniform blank-line-separated
    paragraphs so caption spacing is consistent (AI sometimes uses \\n, sometimes \\n\\n)."""
    paras = [p.strip() for p in re.split(r"\n+", text or "") if p.strip()]
    return "\n\n".join(paras)


def assemble_caption(pack: dict, *, source_domain: Optional[str] = None) -> str:
    """Build the final post caption: body → source → disclaimer → CTA → hashtags."""
    body = _normalize_paragraphs(str(pack.get("caption") or ""))
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
    data = resp.json()
    usage = data.get("usage") or {}
    content = data["choices"][0]["message"]["content"]
    try:
        pack = json.loads(content)
    except Exception:
        match = re.search(r"\{.*\}", content, flags=re.S)
        if not match:
            raise
        pack = json.loads(match.group(0))
    return pack, usage


def tavily_enrich(query: str, *, url: Optional[str] = None, api_key: Optional[str] = None) -> Optional[dict]:
    """
    Best-effort external news search (Tavily) to enrich thin / link-less items.
    Returns the raw Tavily response (answer + results) or None if no key / failure.
    Never raises.
    """
    key = api_key or os.environ.get("TAVILY_API_KEY", "").strip()
    query = (query or "").strip()
    if not key or not query:
        return None
    payload = {
        "query": f"{query} {url or ''}".strip(),
        "search_depth": "advanced",
        "topic": "news",
        "max_results": 5,
        "include_answer": True,
        "include_raw_content": True,
    }
    try:
        resp = requests.post(
            f"{TAVILY_API_BASE.rstrip('/')}/search",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=TAVILY_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001 — enrichment is optional
        logger.warning("tavily_enrich failed (%s): %s", type(exc).__name__, exc)
        return None


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
        "headline, visual_concept, image_prompt, caption, hashtags, source_note.\n\n"
        "Headline: 7-12 words, premium editorial, clear, not clickbait.\n\n"
        "visual_concept: FIRST reason about the picture as an object with keys: "
        "primary_subject (the single most important thing to depict as a tangible physical object or scene — the named "
        "token/coin, exchange, company, person, asset, or event; never a vague concept), "
        "action (what is happening AND its market direction/sentiment — e.g. outflows = funds leaving, rally = rising, "
        "crash/liquidation = falling/red, upgrade = building/roadmap), "
        "metaphor (one concrete visual metaphor that shows that action).\n\n"
        "image_prompt: A concise 40-70 word photorealistic scene that VISUALLY tells THIS specific story, built from "
        "visual_concept. Order: subject in the foreground -> setting -> lighting. Rules: "
        "(1) make primary_subject the clear physical focus in the foreground, not a faint background hint; "
        "(2) encode the action/sentiment from visual_concept — do NOT default to a generic analyst-at-a-desk with green "
        "up-arrow charts; if the news is bearish/outflows, the scene must read as pressure/withdrawal, not growth; "
        "(3) if the news is specific to a country, region or institution, include a recognizable geographic/national cue "
        "(national flag colors, a known landmark, or the local setting) — no text; "
        "(4) state the lighting direction and quality. "
        "Describe ONLY subject, setting and lighting — do NOT add style words, negatives, hashtags or any text; those are appended automatically.\n\n"
        "Caption: 3-4 short punchy paragraphs, English. Lead with the key fact (what happened), then why it matters for "
        "crypto/markets or the broader macro picture, then a brief caveat. If external search results are provided, use "
        "them to add accurate context and figures. Do NOT include hashtags, a disclaimer, a call-to-action, or a source "
        "line in the caption body — those are appended separately. Plain paragraphs only.\n\n"
        "source_note: name the most authoritative ORIGINAL source. If external search results are provided, prefer the "
        "original publisher found there (e.g. the agency or outlet) over a social-media handle.\n\n"
        "Hashtags: 5-8 relevant hashtags.\n\n"
        f"Source context:\n{json.dumps(context, ensure_ascii=False)}"
    )

    try:
        pack, usage = _xai_chat(key, [
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

    # Compose final image prompt: AI-written scene (content) + fixed LuxQuant style + hard negatives.
    content_prompt = str(pack.get("image_prompt") or "").strip()
    if content_prompt:
        pack["image_prompt"] = f"{content_prompt} {IMAGE_STYLE_SUFFIX} {IMAGE_NEGATIVE_SUFFIX}"

    # Attach the Tavily reference links used for enrichment so a human can verify.
    references = []
    if tavily:
        for it in (tavily.get("results") or [])[:5]:
            u = (it.get("url") or "").strip()
            if u:
                references.append({"title": (it.get("title") or u)[:140], "url": u})
    pack["references"] = references

    # Token usage (for cost tracking).
    pack["_usage"] = {
        "prompt_tokens": int((usage or {}).get("prompt_tokens") or 0),
        "completion_tokens": int((usage or {}).get("completion_tokens") or 0),
        "chat_model": XAI_CHAT_MODEL,
    }

    return pack
