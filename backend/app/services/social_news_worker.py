"""
LuxQuant Social News Worker

MVP: turns recent crypto_news rows into approval-ready social post drafts.

This intentionally stops at "draft" status. Publishing should be a separate,
explicit approval step so the AI/editor layer cannot accidentally post bad
sources, weak claims, or ugly artwork.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.news_article_extractor import ensure_extracts_table, extract_news_item, is_thin_text
from app.services.social_image_generator import generate_ai_social_image


POSTS_DIR = Path(os.environ.get("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts"))
DEFAULT_PLATFORM = os.environ.get("SOCIAL_POST_DEFAULT_PLATFORM", "x")


MARKET_KEYWORDS = {
    "bitcoin": 16,
    "btc": 16,
    "ethereum": 13,
    "eth": 13,
    "solana": 13,
    "sol": 13,
    "xrp": 10,
    "etf": 12,
    "fed": 11,
    "inflation": 10,
    "treasury": 9,
    "sec": 10,
    "stablecoin": 10,
    "memecoin": 8,
    "coinbase": 8,
    "binance": 8,
    "microstrategy": 9,
    "strategy": 7,
    "trump": 8,
    "rally": 8,
    "volume": 7,
    "flows": 7,
    "liquidity": 7,
}


HASHTAG_MAP = {
    "bitcoin": "#Bitcoin",
    "btc": "#Bitcoin",
    "ethereum": "#Ethereum",
    "eth": "#Ethereum",
    "solana": "#Solana",
    "sol": "#SOL",
    "xrp": "#XRP",
    "etf": "#ETF",
    "fed": "#Fed",
    "inflation": "#Macro",
    "sec": "#SEC",
    "stablecoin": "#Stablecoins",
    "memecoin": "#Memecoins",
    "microstrategy": "#Bitcoin",
}


@dataclass
class NewsItem:
    id: int
    content_type: Optional[str]
    title: str
    description: Optional[str]
    raw_text: Optional[str]
    url: Optional[str]
    domain: Optional[str]
    image_url: Optional[str]
    created_at: Optional[datetime]
    extracted_text: Optional[str] = None
    extracted_title: Optional[str] = None
    extracted_image_url: Optional[str] = None
    extract_provider: Optional[str] = None
    extract_status: Optional[str] = None


@dataclass
class SocialDraft:
    news_id: int
    platform: str
    angle: str
    template_style: str
    headline: str
    caption: str
    hashtags: list[str]
    image_path: Optional[str]
    score: float
    sources: list[dict]
    source_url: Optional[str]
    source_domain: Optional[str]
    image_mode: str = "template"
    image_prompt: Optional[str] = None
    reference_image_url: Optional[str] = None
    reference_image_path: Optional[str] = None
    gen_meta: Optional[dict] = None


def _clean_text(value: Optional[str]) -> str:
    if not value:
        return ""
    value = re.sub(r"@\w+", "", value)
    value = re.sub(r"^NEW:\s*", "", value, flags=re.I)
    value = re.sub(r"\s+", " ", value).strip()
    value = value.replace(" ...", "").replace("...", "")
    return value


def _keyword_hits(text_value: str) -> list[str]:
    lower = text_value.lower()
    hits = []
    for word in MARKET_KEYWORDS:
        if re.search(rf"(?<![a-z0-9]){re.escape(word)}(?![a-z0-9])", lower):
            hits.append(word)
    return hits


def score_news(item: NewsItem) -> float:
    text_value = f"{item.title} {item.description or ''} {item.raw_text or ''} {item.extracted_text or ''}"
    score = 0.0
    hits = _keyword_hits(text_value)
    score += sum(MARKET_KEYWORDS[h] for h in hits)
    if item.content_type == "article":
        score += 8
    if item.image_url:
        score += 5
    if item.url:
        score += 4
    if len(item.title) >= 45:
        score += 3
    if len(hits) >= 2:
        score += 7
    return score


def _angle_for(item: NewsItem) -> str:
    text_value = f"{item.title} {item.description or ''} {item.extracted_text or ''}".lower()
    if any(k in text_value for k in ("fed", "inflation", "treasury", "rates", "macro")):
        return "macro"
    if any(k in text_value for k in ("sec", "regulation", "lawsuit", "tax", "ban", "lawmakers", "court", "bill")):
        return "policy"
    if any(k in text_value for k in ("rally", "volume", "high", "surge", "flows")):
        return "market_pulse"
    return "news_brief"


def _headline_for(item: NewsItem) -> str:
    title = _clean_text(item.extracted_title or item.title)
    lower = title.lower()

    if "sol" in lower or "solana" in lower:
        return "Solana bulls wake up as activity returns"
    if "microstrategy" in lower or "strategy" in lower:
        return "Strategy headline tests Bitcoin conviction"
    if "xrp" in lower:
        return "XRP volume steals the spotlight"
    if "fed" in lower or "inflation" in lower:
        return "Fed inflation talk keeps markets alert"
    if "memecoin" in lower or "meme coin" in lower:
        return "Political memecoin debate heats up"
    if "trump" in lower and "crypto" in lower:
        return "Trump crypto links draw fresh scrutiny"

    words = title.split()
    headline = " ".join(words[:12])
    return headline.rstrip(".,").title() if headline.isupper() else headline.rstrip(".,")


def _hashtags_for(item: NewsItem) -> list[str]:
    text_value = f"{item.title} {item.description or ''} {item.raw_text or ''} {item.extracted_text or ''}"
    tags = []
    for hit in _keyword_hits(text_value):
        tag = HASHTAG_MAP.get(hit)
        if tag and tag not in tags:
            tags.append(tag)
    for tag in ("#Crypto", "#LuxQuant"):
        if tag not in tags:
            tags.append(tag)
    return tags[:6]


def _best_article_text(item: NewsItem) -> str:
    candidates = [
        item.description or "",
        item.extracted_text or "",
        item.raw_text or "",
    ]
    candidates = [_clean_text(c) for c in candidates if c]
    if not candidates:
        return ""
    return max(candidates, key=len)


def _article_sentences(text_value: str, limit: int = 3) -> list[str]:
    text_value = re.sub(r"Published Time:\s*\S+", "", text_value or "", flags=re.I)
    text_value = re.sub(r"\*\*(.*?)\*\*", r"\1", text_value)
    text_value = re.sub(r"_Source:_.*?(?=[A-Z][a-z]|\n\n|$)", "", text_value)
    text_value = re.sub(r"\s+", " ", text_value).strip()
    parts = re.split(r"(?<=[.!?])\s+", text_value)
    clean = []
    for part in parts:
        part = part.strip()
        if len(part) < 45:
            continue
        if part.lower().startswith("source:"):
            continue
        clean.append(part)
        if len(clean) >= limit:
            break
    return clean


def _image_reference_for(item: NewsItem) -> Optional[str]:
    return item.extracted_image_url or item.image_url


def ensure_social_post_image_columns(db) -> None:
    db.execute(text("""
        ALTER TABLE social_posts
            ADD COLUMN IF NOT EXISTS image_mode TEXT NOT NULL DEFAULT 'template',
            ADD COLUMN IF NOT EXISTS image_prompt TEXT,
            ADD COLUMN IF NOT EXISTS reference_image_url TEXT,
            ADD COLUMN IF NOT EXISTS reference_image_path TEXT
    """))
    db.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_social_posts_image_mode
            ON social_posts(image_mode, created_at DESC)
    """))
    db.commit()


def ensure_social_post_cost_columns(db) -> None:
    db.execute(text("""
        ALTER TABLE social_posts
            ADD COLUMN IF NOT EXISTS gen_meta JSONB
    """))
    db.commit()


def _caption_for(item: NewsItem, headline: str, hashtags: list[str]) -> str:
    title = _clean_text(item.title)
    desc = _best_article_text(item)
    source = item.domain or "LuxQuant News"

    if not desc or desc.lower() == title.lower():
        desc = title

    sentences = _article_sentences(desc, limit=2)
    paragraph_1 = " ".join(sentences) if sentences else desc.rstrip(".") + "."
    paragraph_2 = (
        "For traders, the question is whether this becomes a real liquidity "
        "shift or stays as headline risk. Watch confirmation from volume, open "
        "interest, and how the market prices the next major level."
    )

    return "\n\n".join([
        paragraph_1,
        paragraph_2,
        f"Source: {source}",
        " ".join(hashtags),
    ])


def _wrap_text(draw, text_value: str, font, max_width: int) -> list[str]:
    words = text_value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = test
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def render_card(draft: SocialDraft, item: NewsItem) -> str:
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageFilter
    except ImportError as exc:
        raise RuntimeError("Pillow is required for social news image rendering") from exc

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = POSTS_DIR / f"news_{item.id}_{draft.template_style}.png"

    width, height = 1080, 1350
    img = Image.new("RGB", (width, height), "#071018")
    draw = ImageDraw.Draw(img)

    def font(size: int, bold: bool = False):
        paths = [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for p in paths:
            if p and Path(p).exists():
                return ImageFont.truetype(p, size)
        return ImageFont.load_default()

    # Background editorial texture.
    for y in range(height):
        t = y / height
        color = (
            int(7 + 18 * t),
            int(16 + 24 * t),
            int(24 + 34 * t),
        )
        draw.line([(0, y), (width, y)], fill=color)
    for x in range(-160, width + 160, 58):
        draw.line([(x, 0), (x + 100, height)], fill=(255, 255, 255), width=1)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((520, 110, 1220, 810), outline=(255, 255, 255, 32), width=48)
    od.rectangle((54, 140, 1026, 948), fill=(20, 31, 42, 136), outline=(255, 255, 255, 38), width=2)
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Brand.
    draw.rectangle((64, 58, 106, 100), fill=(240, 185, 11))
    draw.text((73, 66), "LQ", fill=(6, 10, 15), font=font(20, True))
    draw.text((122, 56), "LuxQuant", fill=(244, 247, 251), font=font(31, True))
    draw.text((123, 90), "NEWS DESK", fill=(240, 185, 11), font=font(15, True))
    draw.rectangle((830, 64, 1018, 106), outline=(255, 255, 255), width=1)
    draw.text((852, 76), draft.angle.upper().replace("_", " "), fill=(224, 232, 240), font=font(17, True))

    # Abstract chart bars.
    chart_base = 900
    points = [(92, 860), (170, 820), (258, 835), (340, 760), (445, 772), (535, 690), (645, 710), (742, 625), (850, 650), (970, 574)]
    for i, h in enumerate([72, 118, 92, 156, 130, 188, 170, 224, 250, 210, 286]):
        x = 110 + i * 78
        draw.rounded_rectangle((x, chart_base - h, x + 24, chart_base), radius=6, fill=(14, 203, 129))
    for a, b in zip(points, points[1:]):
        draw.line([a, b], fill=(14, 203, 129), width=10)

    # Headline strips.
    headline_font = font(66, True)
    lines = _wrap_text(draw, draft.headline, headline_font, 900)[:3]
    y = 900
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=headline_font)
        line_w = bbox[2] - bbox[0]
        draw.rectangle((64, y, 64 + line_w + 38, y + 82), fill=(248, 250, 252))
        draw.text((82, y + 2), line, fill=(5, 7, 10), font=headline_font)
        y += 94

    # Footer.
    draw.rectangle((0, 1210, width, height), fill=(5, 8, 12))
    footer_font = font(24)
    source = draft.source_domain or "LuxQuant News"
    draw.text((64, 1238), f"Source: {source}", fill=(205, 215, 226), font=footer_font)
    draw.text((64, 1278), " ".join(draft.hashtags[:4]), fill=(143, 154, 168), font=font(18))
    draw.rectangle((920, 1230, 1018, 1284), fill=(248, 250, 252))
    draw.text((944, 1237), "Kilas", fill=(5, 7, 10), font=font(30, True))

    img = img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=110, threshold=3))
    img.save(out_path, quality=96)
    return str(out_path)


def _progress(cb, step: str, message: str = "") -> None:
    if not cb:
        return
    try:
        cb(step, message)
    except Exception:
        pass


def build_draft(
    item: NewsItem,
    platform: str = DEFAULT_PLATFORM,
    render_image: bool = True,
    progress_cb=None,
) -> SocialDraft:
    score = score_news(item)
    angle = _angle_for(item)

    # Prefer the AI editorial pack; fall back to the rule-based generator when
    # XAI_API_KEY is missing or the call fails.
    article_text = item.extracted_text or _best_article_text(item)
    ai_pack = None
    search_count = 0
    try:
        from app.services.social_editorial_ai import build_editorial_pack, tavily_enrich
        # External search enrichment for thin / link-less items (e.g. Telegram
        # photo posts): find the original source + more context to elaborate.
        tavily = None
        try:
            if not item.url or len((article_text or "").strip()) < 600:
                _progress(progress_cb, "search", "Enriching sources via web search…")
                tavily = tavily_enrich(item.extracted_title or item.title, url=item.url)
                search_count = 1 if tavily else 0
        except Exception:
            tavily = None
        _progress(progress_cb, "editorial", "Writing caption with AI…")
        ai_pack = build_editorial_pack(
            {
                "title": item.extracted_title or item.title,
                "description": item.description,
                "url": item.url,
                "domain": item.domain,
            },
            article_text,
            tavily=tavily,
        )
    except Exception:
        ai_pack = None

    ai_image_prompt = None
    if ai_pack:
        from app.services.social_editorial_ai import assemble_caption
        headline = _clean_text(ai_pack.get("headline")) or _headline_for(item)
        hashtags = ai_pack.get("hashtags") or _hashtags_for(item)
        ai_pack["hashtags"] = hashtags
        caption = assemble_caption(ai_pack, source_domain=item.domain or "LuxQuant News")
        ai_image_prompt = ai_pack.get("image_prompt")
        content_source = "ai"
    else:
        headline = _headline_for(item)
        hashtags = _hashtags_for(item)
        caption = _caption_for(item, headline, hashtags)
        content_source = "rule"

    sources = [
        {
            "label": item.domain or "LuxQuant News",
            "url": item.url,
            "news_id": item.id,
            "content_source": content_source,
        }
    ]
    # Tavily reference links (if enrichment ran) — for human verification.
    if ai_pack and isinstance(ai_pack.get("references"), list):
        for r in ai_pack["references"][:5]:
            if r.get("url"):
                sources.append({
                    "label": r.get("title") or r["url"],
                    "url": r["url"],
                    "date": r.get("date"),
                    "type": "reference",
                })

    draft = SocialDraft(
        news_id=item.id,
        platform=platform,
        angle=angle,
        template_style="market_pulse",
        headline=headline,
        caption=caption,
        hashtags=hashtags,
        image_path=None,
        score=score,
        sources=sources,
        source_url=item.url,
        source_domain=item.domain,
        image_prompt=ai_image_prompt,
    )
    visual_materials = None
    if render_image:
        ents = (ai_pack or {}).get("entities") or []
        featured = (ai_pack or {}).get("featured_person")
        _progress(
            progress_cb,
            "entities",
            f"Detecting logos & people ({len(ents)} entities)…",
        )
        _progress(progress_cb, "image", "Generating image with AI (this can take ~30–90s)…")
        ai_image = generate_ai_social_image(
            news_id=item.id,
            headline=headline,
            article_summary=article_text or caption,
            source_domain=item.domain,
            angle=angle,
            reference_image_url=_image_reference_for(item),
            override_prompt=ai_image_prompt,
            featured_person=featured,
            entities=ents,
        )
        draft.image_mode = ai_image.image_mode
        draft.image_prompt = ai_image_prompt or ai_image.image_prompt
        draft.reference_image_url = ai_image.reference_image_url
        draft.reference_image_path = ai_image.reference_image_path
        draft.image_path = ai_image.image_path
        visual_materials = getattr(ai_image, "visual_materials", None)
        if not draft.image_path:
            _progress(progress_cb, "compose", "Composing fallback card…")
            draft.image_path = render_card(draft, item)
        else:
            _progress(progress_cb, "compose", "Composing final card…")

    # Generation cost estimate (tokens + image + search) for business monitoring.
    try:
        from app.services.social_cost import estimate_cost
        usage = (ai_pack or {}).get("_usage") or {}
        image_count = 1 if draft.image_mode and str(draft.image_mode).startswith("ai_") else 0
        draft.gen_meta = estimate_cost(
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            image_count=image_count,
            search_count=search_count,
            chat_model=usage.get("chat_model", ""),
            image_model=os.environ.get("XAI_IMAGE_MODEL", "grok-imagine-image-quality") if image_count else "",
        )
    except Exception:
        draft.gen_meta = {}

    if draft.gen_meta is None:
        draft.gen_meta = {}
    # Persist entity inventory so admin UI can show "AI needs this material"
    draft.gen_meta["entities"] = (ai_pack or {}).get("entities") or []
    draft.gen_meta["featured_person"] = (ai_pack or {}).get("featured_person")
    if visual_materials:
        draft.gen_meta["visual_materials"] = visual_materials
        draft.gen_meta["needs_materials"] = bool(visual_materials.get("needs_materials"))
        draft.gen_meta["qc_flags"] = visual_materials.get("qc_flags") or []

    return draft


def _row_to_news(row) -> NewsItem:
    return NewsItem(
        id=row["id"],
        content_type=row["content_type"],
        title=row["title"] or "",
        description=row["description"],
        raw_text=row["raw_text"],
        url=row["url"],
        domain=row["domain"],
        image_url=row["image_url"],
        created_at=row["created_at"],
        extracted_text=row.get("extracted_text"),
        extracted_title=row.get("extracted_title"),
        extracted_image_url=row.get("extracted_image_url"),
        extract_provider=row.get("extract_provider"),
        extract_status=row.get("extract_status"),
    )


def pick_candidate_news(db, *, limit: int = 20, news_id: Optional[int] = None, platform: str = DEFAULT_PLATFORM) -> list[NewsItem]:
    ensure_extracts_table(db)
    if news_id is not None:
        rows = db.execute(text("""
            SELECT cn.id, cn.content_type, cn.title, cn.description, cn.raw_text, cn.url, cn.domain, cn.image_url, cn.created_at,
                   nae.extracted_text, nae.title AS extracted_title, nae.image_url AS extracted_image_url,
                   nae.provider AS extract_provider, nae.status AS extract_status
            FROM crypto_news cn
            LEFT JOIN news_article_extracts nae ON nae.news_id = cn.id AND nae.status = 'ok'
            WHERE cn.id = :news_id
        """), {"news_id": news_id}).mappings().all()
        return [_row_to_news(r) for r in rows]

    rows = db.execute(text("""
        SELECT cn.id, cn.content_type, cn.title, cn.description, cn.raw_text, cn.url, cn.domain, cn.image_url, cn.created_at,
               nae.extracted_text, nae.title AS extracted_title, nae.image_url AS extracted_image_url,
               nae.provider AS extract_provider, nae.status AS extract_status
        FROM crypto_news cn
        LEFT JOIN news_article_extracts nae ON nae.news_id = cn.id AND nae.status = 'ok'
        WHERE cn.created_at > now() - interval '3 days'
          AND cn.title IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM social_posts sp
              WHERE sp.news_id = cn.id AND sp.platform = :platform
          )
        ORDER BY cn.created_at DESC
        LIMIT :limit
    """), {"limit": limit, "platform": platform}).mappings().all()
    items = [_row_to_news(r) for r in rows]
    return sorted(items, key=score_news, reverse=True)


def insert_draft(db, draft: SocialDraft) -> int:
    ensure_social_post_image_columns(db)
    ensure_social_post_cost_columns(db)
    row = db.execute(text("""
        INSERT INTO social_posts (
            source_type, news_id, source_url, source_domain, platform, status,
            angle, template_style, headline, caption, hashtags, image_path,
            score, sources_json, image_mode, image_prompt, reference_image_url,
            reference_image_path, gen_meta
        )
        VALUES (
            'crypto_news', :news_id, :source_url, :source_domain, :platform, 'draft',
            :angle, :template_style, :headline, :caption, :hashtags, :image_path,
            :score, CAST(:sources_json AS jsonb), :image_mode, :image_prompt,
            :reference_image_url, :reference_image_path, CAST(:gen_meta AS jsonb)
        )
        ON CONFLICT (news_id, platform) WHERE news_id IS NOT NULL DO UPDATE SET
            angle = EXCLUDED.angle,
            template_style = EXCLUDED.template_style,
            headline = EXCLUDED.headline,
            caption = EXCLUDED.caption,
            hashtags = EXCLUDED.hashtags,
            image_path = EXCLUDED.image_path,
            score = EXCLUDED.score,
            sources_json = EXCLUDED.sources_json,
            image_mode = EXCLUDED.image_mode,
            image_prompt = EXCLUDED.image_prompt,
            reference_image_url = EXCLUDED.reference_image_url,
            reference_image_path = EXCLUDED.reference_image_path,
            gen_meta = EXCLUDED.gen_meta,
            status = CASE WHEN social_posts.status = 'posted' THEN social_posts.status ELSE 'draft' END,
            updated_at = now()
        RETURNING id
    """), {
        "news_id": draft.news_id,
        "source_url": draft.source_url,
        "source_domain": draft.source_domain,
        "platform": draft.platform,
        "angle": draft.angle,
        "template_style": draft.template_style,
        "headline": draft.headline,
        "caption": draft.caption,
        "hashtags": draft.hashtags,
        "image_path": draft.image_path,
        "score": draft.score,
        "sources_json": json.dumps(draft.sources),
        "image_mode": draft.image_mode,
        "image_prompt": draft.image_prompt,
        "reference_image_url": draft.reference_image_url,
        "reference_image_path": draft.reference_image_path,
        "gen_meta": json.dumps(draft.gen_meta) if draft.gen_meta else None,
    }).first()
    db.commit()
    return int(row[0])


def generate_drafts(
    *,
    limit: int = 1,
    news_id: Optional[int] = None,
    platform: str = DEFAULT_PLATFORM,
    dry_run: bool = False,
    track_job: bool = False,
) -> list[dict]:
    """Generate social post drafts. When track_job=True, persists step progress
    so the admin UI can poll status across page refreshes.
    """
    from app.services.social_generation_job import finish_job, update_job

    def _job(step: str, message: str = "", **kw) -> None:
        if track_job:
            update_job(step, message, **kw)

    db = SessionLocal()
    try:
        ensure_extracts_table(db)
        ensure_social_post_image_columns(db)
        ensure_social_post_cost_columns(db)
        _job("pick_news", "Picking candidate news…")
        candidates = pick_candidate_news(db, limit=max(limit * 6, 12), news_id=news_id, platform=platform)
        if not candidates:
            if track_job:
                finish_job(error="No candidate news found")
            return []
        created = []
        total = min(limit, len(candidates))
        for idx, item in enumerate(candidates[:limit]):
            title_hint = (item.extracted_title or item.title or f"news #{item.id}")[:80]
            _job("pick_news", f"[{idx + 1}/{total}] Using: {title_hint}")
            if item.url and is_thin_text(item.description, item.raw_text) and not item.extracted_text:
                _job("extract", f"Extracting full article for news #{item.id}…")
                extracted = extract_news_item(db, item.id)
                if extracted and extracted.get("status") == "ok":
                    item.extracted_text = extracted.get("extracted_text")
                    item.extracted_title = extracted.get("title")
                    item.extracted_image_url = extracted.get("image_url")
                    item.extract_provider = extracted.get("provider")
                    item.extract_status = extracted.get("status")
            draft = build_draft(
                item,
                platform=platform,
                render_image=True,
                progress_cb=(lambda step, msg: _job(step, msg)) if track_job else None,
            )
            _job("save", f"Saving draft for news #{item.id}…")
            post_id = None if dry_run else insert_draft(db, draft)
            created.append({
                "id": post_id,
                "news_id": item.id,
                "headline": draft.headline,
                "caption": draft.caption,
                "hashtags": draft.hashtags,
                "image_path": draft.image_path,
                "image_mode": draft.image_mode,
                "reference_image_url": draft.reference_image_url,
                "score": draft.score,
                "extract_status": item.extract_status,
                "extract_provider": item.extract_provider,
                "source": draft.source_domain or draft.source_url,
            })
        if track_job:
            finish_job(result=created)
        return created
    except Exception as e:
        if track_job:
            finish_job(error=str(e)[:500])
        raise
    finally:
        db.close()


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Generate LuxQuant social news post drafts")
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--news-id", type=int)
    parser.add_argument("--platform", default=DEFAULT_PLATFORM)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    result = generate_drafts(
        limit=args.limit,
        news_id=args.news_id,
        platform=args.platform,
        dry_run=args.dry_run,
    )
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
