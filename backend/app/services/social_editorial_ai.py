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
# Lower temperature for factual news content (research: reduces hallucination).
XAI_CHAT_TEMPERATURE = float(os.environ.get("XAI_CHAT_TEMPERATURE", "0.2"))

TAVILY_API_BASE = os.environ.get("TAVILY_API_BASE", "https://api.tavily.com")
TAVILY_TIMEOUT = int(os.environ.get("TAVILY_TIMEOUT", "35"))

PACK_KEYS = ("headline", "image_prompt", "caption", "hashtags", "source_note")

# Cinematic Instagram poster look (CryptoWave / DRC energy, LuxQuant brand).
# Content scene from the AI + this fixed style suffix keeps results on-brand.
IMAGE_STYLE_SUFFIX = (
    "Cinematic photorealistic Instagram vertical poster, 3:4, ultra-premium crypto media aesthetic. "
    "Hero subject large and dominant in the upper/middle frame, integrated into one continuous scene — "
    "not a collage, not a documentary meeting snapshot. Dramatic dark grading, high contrast, "
    "rim lighting, shallow depth of field, filmic color. Lower 40% of the frame is darker and "
    "visually calmer so bold white headline typography can sit cleanly on top later. "
    "Physical props (coins, seals, devices, architecture) feel real and three-dimensional inside the scene."
)
# Always-on negatives.
IMAGE_NEGATIVE_BASE = (
    "No watermark, no gibberish text, no readable paragraphs, no fake UI screens or chart labels, "
    "no schematic diagrams, blueprints, flowcharts or documents containing words or labels, "
    "no invented tickers or numbers, no fake/hallucinated brand wordmarks or made-up logos, "
    "no red subtitle boxes, no news-ticker bars, no collage seams, no generic stock-photo boardroom, "
    "no flat documentary look, no tiny corner stickers. "
    "Do not invent corporate logos or wordmarks — real brand marks are composited later from verified assets."
)
# Per-token emblem descriptions so the coin clause can name the EXACT coin(s) to
# render and forbid all others — stops the model defaulting to generic Bitcoin.
TOKEN_EMBLEMS = {
    "BTC": "a physical Bitcoin coin with the orange circular B (₿) emblem",
    "ETH": "a physical Ethereum coin with the silver diamond octahedron emblem",
    "XRP": "a physical XRP coin with its plain circular emblem",
    "SOL": "a physical Solana coin with the three parallel gradient bars emblem",
    "DOGE": "a physical Dogecoin coin with the Shiba Inu dog face emblem",
    "ADA": "a physical Cardano coin with the blue circular ADA emblem",
    "BNB": "a physical BNB coin with the gold stacked-diamond emblem",
    "USDT": "a physical Tether coin with the teal hexagon-T emblem",
    "TON": "a physical Toncoin coin with the blue crystal emblem",
    "TRX": "a physical TRON coin with its geometric emblem",
    "AVAX": "a physical Avalanche coin with the red triangular emblem",
    "LINK": "a physical Chainlink coin with the blue hexagon emblem",
}

# When no token is named, keep the scene real-world (positive phrasing beats "no X").
IMAGE_NO_COINS = (
    "Keep the scene strictly to its real-world subject and setting; no crypto coins, no physical "
    "Bitcoin/Ethereum/token props or coin imagery anywhere."
)


def _coin_clause(tokens: list[str]) -> str:
    """Build the deterministic coin instruction: name the exact coin(s) the tokens
    array allows and forbid every other coin, or forbid coins entirely if empty."""
    if not tokens:
        return IMAGE_NO_COINS
    descs = []
    for t in tokens[:3]:
        key = str(t).upper().lstrip("$")
        descs.append(TOKEN_EMBLEMS.get(key, f"a physical {t} coin with its correct iconic emblem"))
    listed = "; ".join(descs)
    return (
        f"The ONLY physical crypto coin(s) allowed in the scene, large and clear in the foreground, are: {listed}. "
        "Render each emblem accurately and show NO other cryptocurrency coins of any kind — in particular do not add "
        "Bitcoin, Solana or any coin that is not in this list."
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
# Neutral CTA for non-financial (general/geopolitical) stories where the crypto CTA
# and the "not financial advice" line do not apply.
CAPTION_CTA_GENERAL = os.environ.get(
    "SOCIAL_CAPTION_CTA_GENERAL",
    "Follow LuxQuant for global market and macro intelligence.",
)
# AI-visual disclosure — kept in the caption (not burned into the image) for a clean
# visual, satisfying platform/legal AI-labeling expectations.
CAPTION_AI_LABEL = os.environ.get(
    "SOCIAL_CAPTION_AI_LABEL",
    "Illustration generated with AI.",
)
# Topics that are financial in nature → keep the NFA disclaimer + crypto CTA.
FINANCIAL_TOPICS = {"crypto", "markets", "macro"}


def _normalize_paragraphs(text: str) -> str:
    """Collapse mixed single/double newlines into uniform blank-line-separated
    paragraphs so caption spacing is consistent (AI sometimes uses \\n, sometimes \\n\\n)."""
    paras = [p.strip() for p in re.split(r"\n+", text or "") if p.strip()]
    return "\n\n".join(paras)


def assemble_caption(pack: dict, *, source_domain: Optional[str] = None) -> str:
    """Build the final post caption: body → source → AI label → [disclaimer] → CTA → hashtags.

    The disclaimer and crypto CTA are only added for financially-relevant topics, so a
    war/geopolitics story is not force-fitted with a 'not financial advice' line. The AI
    label is always included (all images are AI-generated) and kept in the caption, not
    burned into the image.
    """
    body = _normalize_paragraphs(str(pack.get("caption") or ""))
    raw_note = str(pack.get("source_note") or "").strip() or (source_domain or "")
    note = ""
    if raw_note:
        note = raw_note if raw_note.lower().startswith("source") else f"Source: {raw_note}"

    topic = str(pack.get("topic") or "").strip().lower()
    is_financial = topic in FINANCIAL_TOPICS or bool(pack.get("tokens"))
    # Default to financial framing when the topic is unknown (safer for a crypto brand).
    if not topic:
        is_financial = True

    disclaimer = CAPTION_DISCLAIMER if is_financial else ""
    cta = CAPTION_CTA if is_financial else CAPTION_CTA_GENERAL
    tags = " ".join(pack.get("hashtags") or [])

    parts = [body, note, CAPTION_AI_LABEL, disclaimer, cta, tags]
    return "\n\n".join(p for p in parts if p)


def _xai_chat(api_key: str, messages: list[dict[str, str]], temperature: float = XAI_CHAT_TEMPERATURE):
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
        "Everything must be in English for a global audience. Be accurate, premium, sober, and genuinely engaging.\n"
        "GROUNDING RULES (critical): Only state facts, numbers, names, dates and quotes that appear in the provided "
        "source context or search results. Never invent, estimate, or infer values that are not present in the sources. "
        "If a detail is missing, omit it rather than guess. When sources disagree, prefer the most recent figure. Never "
        "attribute a quote to anyone unless it appears verbatim in a source. Do not allege wrongdoing, crime or failure "
        "about a named person or company unless a source explicitly states it. Before finalizing, silently re-check "
        "every number, name, date and quote against the sources and remove anything you cannot ground in them.\n"
        "SAFETY & COMPLIANCE RULES: Never promise, guarantee or imply profit, returns or price targets. Never advise the "
        "audience to buy, sell or hold any asset. Do not use hype or FOMO language (e.g. 'to the moon', 'last chance', "
        "'don't miss out'). Do not downplay risk. For stories involving death, war, disaster or personal tragedy, write "
        "soberly and respectfully and never trivialize human harm. Keep contested political topics evenhanded and "
        "non-partisan. Avoid demographic, national, religious or cultural stereotypes in both text and imagery."
    )
    user = (
        "Create a complete social-news pack from this source context. Return JSON only with keys: "
        "headline, visual_concept, image_prompt, caption, hashtags, source_note, topic, tokens, entities, used_references.\n\n"
        "Headline: 7-12 words, premium editorial, clear, not clickbait.\n\n"
        "entities: array of the most important named entities THIS story is about (max 6). Each item: "
        "{name, type, role, domain}. type is 'person' or 'org'. role is a short label "
        "(e.g. 'Hyperliquid founder', 'U.S. regulator', 'SEC chair'). domain is optional website host for orgs "
        "(e.g. 'sec.gov', 'hyperliquid.xyz') when known from sources. Include: protocols/exchanges, regulators "
        "(SEC, CFTC, Fed), companies, and key people (founders, CEOs, chairs). Do NOT invent entities not in sources. "
        "Example for Hyperliquid×SEC news: "
        "[{\"name\":\"Hyperliquid\",\"type\":\"org\",\"role\":\"protocol\",\"domain\":\"hyperliquid.xyz\"},"
        "{\"name\":\"SEC\",\"type\":\"org\",\"role\":\"U.S. regulator\",\"domain\":\"sec.gov\"},"
        "{\"name\":\"Jeff Yan\",\"type\":\"person\",\"role\":\"Hyperliquid founder\"}].\n\n"
        "visual_concept: FIRST reason about the picture as an object with keys: "
        "primary_subject (the single most important thing to depict as a tangible physical object or scene — the named "
        "token/coin, exchange, company, person, asset, or event; never a vague concept), "
        "featured_person (if the news centers on a specific real person who should anchor the photo — crypto founders, "
        "exchange CEOs, SEC/Fed chairs, politicians, well-known investors — put full name + role, e.g. "
        "'Jeff Yan, Hyperliquid founder' or 'Gary Gensler, former SEC Chair'. Prefer named founders of protocols named "
        "in the story even if they are niche-famous in crypto. If NO person is central, set null; never invent a name), "
        "key_orgs (array of 1-3 org/protocol/regulator names that define the story visually, e.g. [\"Hyperliquid\",\"SEC\"]), "
        "action (what is happening AND its market direction/sentiment — e.g. outflows = funds leaving, rally = rising, "
        "crash/liquidation = falling/red, upgrade = building/roadmap, regulation = formal policy meeting), "
        "metaphor (one concrete visual metaphor that shows that action).\n\n"
        "image_prompt: A concise 45-80 word CINEMATIC POSTER scene that VISUALLY tells THIS specific story, built from "
        "visual_concept. Think viral crypto Instagram poster (hero object/person + dramatic environment), NOT a plain "
        "news photograph of a meeting table. START with the primary_subject (models weight the first words most), then "
        "setting, then lighting. Rules: "
        "(1) make primary_subject a large, dominant physical hero in the foreground — giant coin, person waist-up, "
        "protocol emblem object, landmark — filling ~40-60% of the frame; never a tiny distant detail; "
        "(2) encode the action/sentiment from visual_concept with cinematic energy — crash = red heat/pressure, "
        "rally = power/momentum, regulation = formal power architecture, deal = premium corporate futurism; "
        "NEVER default to a generic boardroom full of anonymous people around a long table; "
        "(3) if country/region/institution matters, use recognizable cues (flag colors, landmark, navy/military, "
        "exchange floor, skyline) without readable text; "
        "(4) ONLY if the tokens array is non-empty depict those exact tokens as large physical 3D coins in the "
        "foreground with simple iconic emblems (Bitcoin B, Ethereum diamond, Avalanche triangle, etc.) — never generic "
        "gold coins, never fine lettering; at most three distinct coins. If tokens is empty, no crypto coin props; "
        "(5) if featured_person is a real famous figure, they are the hero portrait (chest-up or full figure), "
        "confident pose, cinematic lighting; if null, no identifiable face — silhouette/back/out-of-focus only; "
        "(6) brand institutions should appear as physical environment + props (seals, architecture, devices), "
        "not as floating logo stickers; do NOT draw fake brand wordmarks; "
        "(7) keep the lower third darker and less busy for later headline typography; "
        "(8) state lighting (rim light, dramatic key light, night city glow, etc.). "
        "Describe ONLY subject, setting and lighting — no style laundry list, no negatives, no hashtags, no on-image text.\n\n"
        "Caption: Write like a sharp human editor, NOT an AI. 3-4 short punchy paragraphs, plain English. Open with a "
        "strong hook in the FIRST ~80 characters that sparks curiosity and states the key fact — never a generic "
        "AI-sounding intro (banned openers include 'In today's fast-paced world', 'In a groundbreaking move', 'In an "
        "unprecedented', 'The world of crypto'). Then explain why it matters for markets or the wider picture, then a "
        "brief, honest caveat. Weave the key names/assets in naturally as keywords. If external search results are "
        "provided, use them for accurate context and PREFER the most up-to-date figures found there. Keep it human, "
        "specific and free of filler. Do NOT include hashtags, a disclaimer, a call-to-action, an AI label, or a source "
        "line in the caption body — those are appended separately. Plain paragraphs only.\n\n"
        "topic: classify the story as exactly one of 'crypto' (specific tokens/protocols/exchanges), 'markets' "
        "(stocks, ETFs, companies, trading), 'macro' (central banks, rates, inflation, the economy), or 'general' "
        "(politics, geopolitics, disasters, other non-financial news). Be honest — this controls whether a financial "
        "disclaimer is attached.\n\n"
        "source_note: name the most authoritative ORIGINAL source. If external search results are provided, prefer the "
        "original publisher found there (e.g. the agency or outlet) over a social-media handle.\n\n"
        "tokens: array of crypto token symbols that THIS news genuinely centers on (e.g. [\"BTC\"], [\"ETH\",\"SOL\"]). "
        "A token counts only if it is a real subject of the story, not a passing mention. If the story is general/macro/"
        "geopolitical and not really about specific tokens, return an empty array []. This array alone controls whether "
        "coins appear in the image, so be strict.\n\n"
        "used_references: ONLY from the provided search results, return the array of exact URLs that DIRECTLY correspond "
        "to THIS specific event and support the figures/claims in your caption. Exclude any result about a different "
        "incident, location, or date even if the topic is similar. If none clearly match, return an empty array []. "
        "Never invent URLs — copy them exactly from the search results.\n\n"
        "Hashtags: 4-7 specific hashtags that fit THIS story's topic (do not force crypto hashtags onto a "
        "non-crypto story); no generic filler tags.\n\n"
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

    # Expose featured_person + entities for the image generator / logo compositor.
    vc = pack.get("visual_concept") or {}
    fp = vc.get("featured_person") if isinstance(vc, dict) else None
    if isinstance(fp, str):
        fp = fp.strip()
        fp = None if fp.lower() in ("", "null", "none") else fp
    else:
        fp = None
    pack["featured_person"] = fp

    # Entities (orgs + people) drive real logo badges and face references.
    try:
        from app.services.social_entity_assets import normalize_entities
        ents = normalize_entities(pack.get("entities"))
        # Merge key_orgs from visual_concept if entities list is thin.
        if isinstance(vc, dict) and isinstance(vc.get("key_orgs"), list):
            for org in vc["key_orgs"][:4]:
                name = str(org).strip()
                if name and not any(e["name"].lower() == name.lower() for e in ents):
                    ents.append({"name": name, "type": "org", "role": "", "domain": None})
        if fp and not any(e.get("type") == "person" for e in ents):
            ents.insert(0, {"name": fp, "type": "person", "role": "featured", "domain": None})
        pack["entities"] = ents[:8]
    except Exception:
        pack["entities"] = []

    # Normalize the token classification the AI returned. This — not prompt wording —
    # deterministically decides whether crypto coins may appear in the image, so an
    # unrelated (macro/geopolitical) story can never get coins bolted on.
    tokens = pack.get("tokens") or []
    if isinstance(tokens, str):
        tokens = [tokens]
    tokens = [str(t).strip() for t in tokens if str(t).strip()]
    pack["tokens"] = tokens

    # Normalize topic classification (drives the topic-aware disclaimer/CTA).
    topic = str(pack.get("topic") or "").strip().lower()
    if topic not in ("crypto", "markets", "macro", "general"):
        topic = "crypto" if tokens else ""
    pack["topic"] = topic

    # Compose final image prompt: AI-written scene (content) + fixed LuxQuant style +
    # code-chosen coin clause (encourage vs forbid) + always-on negatives.
    # Real logos are composited later from verified assets — never ask the model to invent them.
    content_prompt = str(pack.get("image_prompt") or "").strip()
    if content_prompt:
        coin_clause = _coin_clause(tokens)
        org_names = [
            e["name"] for e in (pack.get("entities") or []) if e.get("type") == "org"
        ][:3]
        org_clause = ""
        if org_names:
            org_clause = (
                " Scene must clearly evoke the real-world institutions involved "
                f"({', '.join(org_names)}) through architecture, seals, devices, environment, or physical props "
                "integrated into the poster — but do NOT draw fake brand logos or wordmarks "
                "(verified marks are composited later from real assets)."
            )
        pack["image_prompt"] = (
            f"{content_prompt}{org_clause} {IMAGE_STYLE_SUFFIX} {coin_clause} {IMAGE_NEGATIVE_BASE}"
        )

    # References: ONLY the search-result URLs the AI vetted as matching THIS exact
    # event. Titles/URLs are taken from the real Tavily results (never AI-invented),
    # and if nothing matches we show none — better empty than a wrong reference.
    references = []
    if tavily:
        by_url = {}
        for it in (tavily.get("results") or []):
            u = (it.get("url") or "").strip()
            if u and u not in by_url:
                by_url[u] = {
                    "title": (it.get("title") or u)[:140],
                    "date": str(it.get("published_date") or "")[:10],
                }
        used = pack.get("used_references")
        if isinstance(used, list):
            for u in used:
                u = str(u).strip()
                if u in by_url and not any(r["url"] == u for r in references):
                    references.append({"title": by_url[u]["title"], "url": u, "date": by_url[u]["date"]})
    pack["references"] = references
    pack.pop("used_references", None)

    # Token usage (for cost tracking).
    pack["_usage"] = {
        "prompt_tokens": int((usage or {}).get("prompt_tokens") or 0),
        "completion_tokens": int((usage or {}).get("completion_tokens") or 0),
        "chat_model": XAI_CHAT_MODEL,
    }

    return pack
