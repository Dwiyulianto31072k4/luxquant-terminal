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
from datetime import datetime, timezone
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

# Rational premium news poster: real-world subject first, mild cinematic grade.
# Avoid viral-crypto clichés (chains on books, floating coins, fantasy vaults).
# Subject and framing only. This rides along on every stored image_prompt, so
# anything it says about light or grade would contradict the house style that
# owns those — which is exactly what "Natural directional lighting, subtle
# cinematic contrast" used to do. The ratio was wrong too: the poster is 4:5.
IMAGE_STYLE_SUFFIX = (
    "Photojournalistic financial-news poster, vertical 4:5 — a real photograph of a real place, "
    "not a 3D render. Natural light from sources the room actually has, correct white balance, "
    "true colours, NO colour grade and no amber or red wash over the frame. "
    "One clear subject in the upper two thirds — the person or the object the story is about — "
    "with the room around it as detailed as that room really is. "
    "Lower 35-40% kept quiet for the headline. Plausible reality over symbolism."
)
# Always-on negatives — ban cheesy AI tropes + invented marks + on-image text.
IMAGE_NEGATIVE_BASE = (
    "No watermark, no gibberish text, no readable letters/words/numbers/slogans on walls or objects, "
    "no fake UI screens or chart labels, no schematic diagrams or blueprints with labels, "
    "no invented tickers, no fake/hallucinated brand wordmarks or logos, "
    "no invented Hyperliquid/HYPE marks, no invented bank or exchange logos, "
    "no red subtitle boxes, no news-ticker bars, no collage seams, "
    "no generic anonymous boardroom meeting tables, "
    "no cheesy crypto clichés: no chains wrapping books, no padlocks on ledgers, "
    "no floating holographic coins, no glowing blockchain cubes, no cyberpunk vault fantasy, "
    "no money raining, no robot hands holding cash, no over-literal metaphors. "
    "NOT a 3D product render, not a game cinematic, not an animation still, not CGI. "
    "No amber/gold colour wash, no red atmospheric glow, no coloured gel on the walls, "
    "no teal-and-orange grade — the frame carries no colour grade at all. "
    "Marks supplied as attached references SHOULD appear, large and physical; never invent one you were not given."
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


# ── Deterministic advice scrubber ───────────────────────────────────────────
# The system prompt already forbids price targets and buy/sell/hold advice, and
# a caption shipped both anyway: an AMD draft carried "average price target of
# 579 dollars" and "the stock must clear the moving-average resistance zone near
# 511 to 517 dollars on strong volume before any sustained recovery". Neither was
# invented — $579.11 really was the analyst average — which is exactly why the
# prompt could not stop it: the model was reporting a fact, and the rule it broke
# was about what we are willing to publish, not about truth.
#
# The same lesson was learned on the X card poster, where a prompt rule against
# raw counts was not enough either and a deterministic scrubber had to back it.
# A rule that must never be broken cannot live only in a prompt.
#
# Sentence-level, and deliberately narrow: it removes the sentence carrying the
# advice rather than editing round it, because a half-deleted forecast reads
# worse than no forecast.
_ADVICE_PATTERNS = (
    # Analyst / model price targets in any phrasing
    r"\bprice target",
    r"\btarget price\b",
    r"\btarget of \$?\d",
    r"\b(?:12|twelve)[- ]month target\b",
    r"\bfair value of \$?\d",
    # Technical-analysis levels presented as what the reader should watch for
    r"\bresistance (?:zone|level|area)\b",
    r"\bsupport (?:zone|level|area)\b",
    r"\bmust clear\b",
    r"\bmoving[- ]average (?:resistance|support)\b",
    r"\bbefore any sustained (?:recovery|rally|move)\b",
    r"\bbreak(?:out|down) (?:above|below)\b",
    r"\bentry (?:point|zone)\b",
    # Signal-shaped guidance. Found via the fallback writer's canned paragraph
    # ("watch confirmation from volume, open interest, and how the market prices
    # the next major level"), which carried no target and no named level and so
    # sailed straight through the first version of this list.
    r"\bnext major level\b",
    r"\bwatch confirmation\b",
    r"\bkey levels? to watch\b",
    r"\bwatch for a (?:break|bounce|retest|reclaim)\b",
    r"\blevel to (?:watch|beat|reclaim)\b",
    # Direct recommendations
    r"\b(?:investors|traders|you)\s+should\s+(?:buy|sell|hold|accumulate|exit)\b",
    r"\btime to (?:buy|sell)\b",
    # Promises
    r"\bguarantee[sd]?\b",
    r"\bwill (?:rally|surge|soar|double|moon)\b",
)
_ADVICE_RE = re.compile("|".join(_ADVICE_PATTERNS), re.I)


def strip_advice(caption: str) -> tuple[str, list[str]]:
    """Drop any sentence that states a price target or tells the reader to trade.

    Returns the cleaned caption and the sentences removed, so the admin can see
    what was cut instead of wondering why a paragraph looks short.
    """
    # Short-circuit when there is nothing to cut. Without this the function
    # still round-trips the text through a split and re-join, which collapses
    # runs of whitespace — so a caption that broke no rule would come back
    # subtly reformatted, and every caption would look "processed".
    if not caption or not _ADVICE_RE.search(caption):
        return caption, []

    removed: list[str] = []
    kept_paras: list[str] = []
    for para in re.split(r"\n{2,}", caption or ""):
        sentences = re.split(r"(?<=[.!?])\s+", para.strip())
        keep = []
        for sent in sentences:
            if sent and _ADVICE_RE.search(sent):
                removed.append(sent.strip())
            elif sent:
                keep.append(sent)
        if keep:
            kept_paras.append(" ".join(keep))
    return "\n\n".join(kept_paras).strip(), removed


def _normalize_paragraphs(text: str) -> str:
    """Collapse mixed single/double newlines into uniform blank-line-separated
    paragraphs so caption spacing is consistent (AI sometimes uses \\n, sometimes \\n\\n)."""
    paras = [p.strip() for p in re.split(r"\n+", text or "") if p.strip()]
    return "\n\n".join(paras)


_OUTLET_NAMES = {
    "coindesk.com": "CoinDesk", "cryptoslate.com": "CryptoSlate", "decrypt.co": "Decrypt",
    "cryptopotato.com": "CryptoPotato", "crypto.news": "crypto.news",
    "koreajoongangdaily.com": "Korea JoongAng Daily", "stocktitan.net": "StockTitan",
    "deloitte.com": "Deloitte", "theblock.co": "The Block", "reuters.com": "Reuters",
    "bloomberg.com": "Bloomberg", "cointelegraph.com": "Cointelegraph",
    "en.bloomingbit.io": "Bloomingbit", "bitcoinworld.co.in": "Bitcoin World",
}
# Aggregators and link shorteners are where a story was FOUND, never where it
# came from. Citing them tells the reader nothing they can check.
_NON_OUTLETS = {"t.co", "news.google.com", "twitter.com", "x.com", "tradingview.com"}


def _outlet(host: str) -> str:
    host = (host or "").lower().strip().removeprefix("www.")
    return _OUTLET_NAMES.get(host, host)


def _citation_line(
    ai_note: str, source_domain: Optional[str], references: Optional[list]
) -> str:
    """Name every outlet the caption actually drew on, not the one it was found at.

    The line used to be whatever the model wrote. On an AMD draft that produced
    "Source: TheKobeissiLetter on X" — a 151-character tweet — while every figure
    in the caption came from the earnings release attached beside it, which the
    reader was never told about and could not look up.
    """
    import re as _re

    names: list[str] = []

    def _add(name: str) -> None:
        n = (name or "").strip()
        if n and n.lower() not in {x.lower() for x in names}:
            names.append(n)

    note = (ai_note or "").strip()
    if note and note.lower() not in _NON_OUTLETS:
        _add(note)
    host = (source_domain or "").lower().removeprefix("www.")
    if host and host not in _NON_OUTLETS:
        _add(_outlet(host))
    for ref in references or []:
        url = str((ref or {}).get("url") or "")
        m = _re.match(r"https?://(?:www\.)?([^/]+)", url)
        if not m:
            continue
        h = m.group(1).lower()
        if h in _NON_OUTLETS:
            continue
        _add(_outlet(h))

    if not names:
        return ""
    # Cap it: a caption is not a bibliography, and the full list lives on the
    # draft's sources either way.
    shown = names[:3]
    return ("Source: " if len(shown) == 1 else "Sources: ") + ", ".join(shown)


def assemble_caption(
    pack: dict,
    *,
    source_domain: Optional[str] = None,
    references: Optional[list] = None,
) -> str:
    """Build the final post caption: body → source → AI label → [disclaimer] → CTA → hashtags.

    The disclaimer and crypto CTA are only added for financially-relevant topics, so a
    war/geopolitics story is not force-fitted with a 'not financial advice' line. The AI
    label is always included (all images are AI-generated) and kept in the caption, not
    burned into the image.
    """
    body = _normalize_paragraphs(str(pack.get("caption") or ""))
    # Last gate before the text becomes a post. Runs here rather than at the
    # model boundary so it also covers the rule-based fallback writer and any
    # future caller — there is exactly one funnel, and this is it.
    body, _cut = strip_advice(body)
    if _cut:
        logger.warning(
            "strip_advice removed %d advice sentence(s) from a caption: %s",
            len(_cut), " || ".join(c[:120] for c in _cut),
        )
        # Recorded on the pack so the draft can show what was cut and the admin
        # is not left wondering why a paragraph is shorter than expected.
        pack["advice_removed"] = _cut
    note = _citation_line(
        str(pack.get("source_note") or ""),
        source_domain,
        references if references is not None else pack.get("references"),
    )

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


def _story_age_days(story_date: Any) -> Optional[int]:
    """Whole days between the story and now, or None if undatable."""
    if not story_date:
        return None
    try:
        if isinstance(story_date, str):
            from email.utils import parsedate_to_datetime
            raw = story_date.strip()
            try:  # RFC-2822, what the RSS rows carry
                dt = parsedate_to_datetime(raw)
            except Exception:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        else:
            dt = story_date
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - dt).days)
    except Exception:
        return None


def tavily_enrich(
    query: str,
    *,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    story_date: Any = None,
) -> Optional[dict]:
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
    # Keep the search inside the story's own window. `days` was never sent, so
    # a search about a recurring event (a rate decision, a gold purchase, an ETF
    # flow day) could return the previous occurrence and hand the writer figures
    # from the wrong month. Pad by SOCIAL_TAVILY_DAY_PAD so follow-up coverage
    # published after the story still qualifies.
    age = _story_age_days(story_date)
    pad = int(os.environ.get("SOCIAL_TAVILY_DAY_PAD", "2"))
    payload["days"] = max(1, (age if age is not None else 3) + pad)
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
    # Cheap mode: shorter article window → fewer input tokens on every draft
    cheap = os.environ.get("SOCIAL_CHEAP_MODE", "1").strip().lower() not in ("0", "false", "no")
    art_cap = int(os.environ.get("SOCIAL_ARTICLE_CONTEXT_CHARS", "4500" if cheap else "7000"))
    tavily_cap = 900 if cheap else 1300
    tavily_n = 3 if cheap else 4
    # Everything in here used to be dateless. The writer could not tell when the
    # story happened, could not tell whether a search result described the same
    # day or a repeat of the same event a year earlier, and was still ordered to
    # "prefer the most up-to-date figures" — so it picked whichever number read
    # best. Dates are cheap; carry them.
    published = news.get("published_at") or news.get("ingested_at")
    story_age = _story_age_days(published)
    context = {
        "today_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "db_news": {
            "title": news.get("title"),
            "description": news.get("description"),
            "url": news.get("url"),
            "domain": news.get("domain"),
            "category": news.get("category"),
            "published_at": news.get("published_at"),
            "ingested_at": news.get("ingested_at"),
            "story_age_days": story_age,
        },
        "article_text": (article_text or "")[:art_cap],
    }
    if tavily:
        context["tavily_answer"] = tavily.get("answer", "")
        context["tavily_results"] = [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                # The date was already in the Tavily payload and was read only
                # to decorate the reference list — the model reasoning over the
                # text never saw it.
                "published_date": str(item.get("published_date") or "")[:10],
                "content": (item.get("raw_content") or item.get("content") or "")[:tavily_cap],
            }
            for item in (tavily.get("results") or [])[:tavily_n]
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
        "TIME RULES (critical): the context carries `today_utc`, the story's own `published_at` / `ingested_at` and "
        "`story_age_days`, and a `published_date` on every search result. The story being written about is the one in "
        "`db_news` — the search results exist only to corroborate THAT event. Before using any figure from a search "
        "result, check its `published_date` against the story's date: if it describes an earlier occurrence of a "
        "recurring event (a previous rate decision, an earlier purchase, a different flow day, last year's filing), "
        "IGNORE it completely — do not average it in, do not mention it as background, do not let it change a number. "
        "Prefer the most recent figure only among results that describe THIS event. Never write 'today', 'this week' or "
        "any relative time expression unless it is true relative to `today_utc`; when the story is more than a day old, "
        "write no relative time at all rather than implying it just happened.\n"
        "SAFETY & COMPLIANCE RULES: Never promise, guarantee or imply profit, returns or price targets. Never advise the "
        "audience to buy, sell or hold any asset. This holds even when the figure is REAL and well sourced: do not report "
        "analyst price targets, consensus targets, fair-value estimates, or technical levels such as support, resistance, "
        "breakout or entry zones, and never state what a price 'must' do before it can recover. Those are accurate facts "
        "we still refuse to publish, so omit the sentence rather than attribute it. Do not use hype or FOMO language (e.g. 'to the moon', 'last chance', "
        "'don't miss out'). Do not downplay risk. For stories involving death, war, disaster or personal tragedy, write "
        "soberly and respectfully and never trivialize human harm. Keep contested political topics evenhanded and "
        "non-partisan. Avoid demographic, national, religious or cultural stereotypes in both text and imagery."
    )
    user = (
        "Create a complete social-news pack from this source context. Return JSON only with keys: "
        "headline, visual_concept, image_prompt, caption, hashtags, source_note, topic, tokens, entities, used_references.\n\n"
        "Headline: 7-12 words AND AT MOST 64 CHARACTERS including spaces. Premium editorial, clear, "
        "not clickbait. The hard character limit is a layout rule, not a style one: the poster sets "
        "every headline at one fixed size and wraps it into three lines, and measured across our own "
        "feed anything past 64 characters drops to a fourth line. Word count does not decide this — "
        "long words do, so prefer short ones (\'wins\' over \'secures\', \'rules\' over \'certification\').\n\n"
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
        "primary_subject (the single most important REAL-WORLD thing to show — institution, person, product, "
        "city/landmark, trading floor, or infrastructure; never a vague abstract concept), "
        "featured_person (only if the news truly centers on a specific real named public figure — full name + role; "
        "else null; never invent a name), "
        "key_orgs (1-4 org/protocol/regulator/bank names that define THIS story visually), "
        "action (what is happening in plain terms: pilot launch, lawsuit, listing, outflows, regulation, deal…), "
        "scene_type (pick ONE rational category: institution_interior | skyline_exterior | person_portrait | "
        "trading_floor | product_device | infrastructure | document_still — choose what a Reuters/Bloomberg "
        "photo editor would pick for this headline), "
        "metaphor (OPTIONAL subtle cue only; prefer real settings over surreal symbols).\n\n"
        "image_prompt: A concise 45-80 word RATIONAL photoreal scene for THIS story from visual_concept. "
        "Think premium financial news photography with mild cinematic grade — NOT viral crypto meme art, "
        "NOT fantasy symbolism. START with primary_subject, then setting, then lighting. Rules: "
        "(1) primary_subject large and clear in upper/middle frame (~40-60%); "
        "(2) ONE SUBJECT, IN A REAL PLACE. Pick a single subject — a named person, or one object that "
        "stands for the story — and put it somewhere specific and believable: a particular office, lobby, "
        "workshop, dealing room or trading floor, with everything such a place actually contains. If the "
        "real room is busy — colleagues, rows of screens, clutter on the desks — keep it busy; that is "
        "what makes it look photographed rather than staged. Separate the subject with framing and focus, "
        "not by emptying the room. What to avoid is the opposite: bare symbolic staging (a lone figure on "
        "empty steps, an object floating in nothing). Interiors beat monument exteriors; "
        "lawsuit → courthouse/steps or formal legal desk without readable text; token rally with tokens array "
        "non-empty → physical coins OK; pure institutional news → NO crypto coin props; "
        "(3) encode sentiment lightly via light/mood, not cheesy symbols (no padlocks, raining money, robot hands); "
        "(4) geographic/institution cues via architecture and atmosphere, never readable wall text or slogans; "
        "(5) ONLY if tokens array is non-empty may you show those exact physical coins with simple emblems "
        "(max 3); if tokens empty, zero coin props; "
        "(6) featured_person only when set — chest-up hero portrait; if null, no identifiable face; "
        "(7) do NOT invent brand logos/wordmarks; brands are handled later from verified assets; "
        "(8) lower third darker/calmer for headline overlay; "
        "(9) do NOT describe lighting, colour, grade, mood or atmosphere AT ALL — the house style block owns those, and a scene that specifies its own light contradicts it; "
        "(10) name the ONE physical hero element that carries the story (the institution's sign, a product, a coin, a machine) so it can be built large in 3D. "
        "Describe ONLY subject, setting and that hero element — no lighting, no style lists, no hashtags, no on-image text.\n\n"
        "Caption: Write like a sharp human editor, NOT an AI. 3-4 short punchy paragraphs, plain English. Open with a "
        "strong hook in the FIRST ~80 characters that sparks curiosity and states the key fact — never a generic "
        "AI-sounding intro (banned openers include 'In today's fast-paced world', 'In a groundbreaking move', 'In an "
        "unprecedented', 'The world of crypto'). Then explain why it matters for markets or the wider picture, then a "
        "brief, honest caveat. Weave the key names/assets in naturally as keywords. If external search results are "
        "provided, use only those whose published_date fits THIS event (see TIME RULES) and prefer the most recent "
        "figure among them; a result about an earlier occurrence is not context, it is a wrong number. Keep it human, "
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

    # Compose final image prompt: AI scene + style + coin clause + negatives.
    # All story brands will be admin-gated; never invent logos for brands not verified.
    content_prompt = str(pack.get("image_prompt") or "").strip()
    if content_prompt:
        coin_clause = _coin_clause(tokens)
        story_names: list[str] = []
        primary_name = None
        try:
            from app.services.social_entity_assets import rank_story_orgs
            ranked = rank_story_orgs(
                pack.get("entities") or [],
                headline=str(pack.get("headline") or ""),
            )
            story_names = [str(o.get("name")) for o in ranked if o.get("name")]
            primary_name = story_names[0] if story_names else None
        except Exception:
            story_names = [
                e["name"] for e in (pack.get("entities") or [])
                if e.get("type") == "org" and e.get("name")
            ][:4]
            primary_name = story_names[0] if story_names else None
        org_clause = ""
        if story_names:
            org_clause = (
                f" Story institutions: {', '.join(story_names)}. "
                "If their real mark is ATTACHED as a reference image, build it LARGE and physical in the "
                "scene — a backlit sign on the wall, a monument, a moulded 3D emblem on a pedestal — since "
                "that mark is what tells the reader what the story is about. If no mark is attached, show "
                "the institution through architecture and atmosphere instead and invent nothing. "
                "No corner stickers, no chains-on-books, no crypto meme props."
            )
        pack["image_prompt"] = (
            f"{content_prompt}{org_clause} {IMAGE_STYLE_SUFFIX} {coin_clause} {IMAGE_NEGATIVE_BASE}"
        )
        if primary_name:
            pack["primary_org_name"] = primary_name
        if story_names:
            pack["story_brand_names"] = story_names

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
