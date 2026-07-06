"""
News Article Extractor

Turns thin crypto_news rows into grounded article text. The first target is
TradingView News Flow wrappers, but the service is generic: direct HTML metadata
and paragraph extraction first, then Jina Reader as a browser-like fallback.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
from dataclasses import dataclass
from typing import Iterable, Optional
from urllib.parse import urlparse

import httpx
from sqlalchemy import text

from app.core.database import SessionLocal


MIN_USEFUL_TEXT_CHARS = int(os.environ.get("NEWS_EXTRACT_MIN_CHARS", "350"))
JINA_READER_BASE = os.environ.get("JINA_READER_BASE", "https://r.jina.ai/")
HTTP_TIMEOUT = float(os.environ.get("NEWS_EXTRACT_TIMEOUT", "20"))


@dataclass
class ArticleExtract:
    status: str
    provider: str
    url: str
    domain: Optional[str] = None
    title: Optional[str] = None
    extracted_text: Optional[str] = None
    summary: Optional[str] = None
    image_url: Optional[str] = None
    canonical_url: Optional[str] = None
    source_domain: Optional[str] = None
    error_message: Optional[str] = None


def ensure_extracts_table(db) -> None:
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS news_article_extracts (
            news_id          INTEGER PRIMARY KEY,
            url              TEXT NOT NULL,
            domain           TEXT,
            provider         TEXT NOT NULL DEFAULT 'direct',
            status           TEXT NOT NULL DEFAULT 'pending',
            title            TEXT,
            extracted_text   TEXT,
            summary          TEXT,
            image_url        TEXT,
            canonical_url    TEXT,
            source_domain    TEXT,
            error_message    TEXT,
            extracted_at     TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    db.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_news_article_extracts_status
            ON news_article_extracts(status, updated_at DESC)
    """))
    db.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_news_article_extracts_domain
            ON news_article_extracts(domain, updated_at DESC)
    """))
    db.commit()


def is_thin_text(description: Optional[str], raw_text: Optional[str]) -> bool:
    return len(description or "") < 80 and len(raw_text or "") < 160


def _domain(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        host = urlparse(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return None


def _clean_text(value: Optional[str]) -> str:
    if not value:
        return ""
    value = html.unescape(value)
    value = re.sub(r"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>", " ", value, flags=re.I)
    value = re.sub(r"<style\b[^<]*(?:(?!</style>)<[^<]*)*</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _meta_content(markup: str, key: str) -> Optional[str]:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+name=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(key)}["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, markup, flags=re.I)
        if match:
            return html.unescape(match.group(1)).strip()
    return None


def _canonical_url(markup: str) -> Optional[str]:
    match = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', markup, flags=re.I)
    if match:
        return html.unescape(match.group(1)).strip()
    return None


def _jsonld_articles(markup: str) -> list[dict]:
    articles: list[dict] = []
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        markup,
        flags=re.I | re.S,
    ):
        raw = html.unescape(match.group(1)).strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except Exception:
            continue
        candidates = payload if isinstance(payload, list) else [payload]
        for item in candidates:
            graph = item.get("@graph") if isinstance(item, dict) else None
            if isinstance(graph, list):
                candidates.extend(graph)
                continue
            if not isinstance(item, dict):
                continue
            kind = item.get("@type")
            kinds = kind if isinstance(kind, list) else [kind]
            if any(str(k).lower() in {"article", "newsarticle", "blogposting"} for k in kinds):
                articles.append(item)
    return articles


def _paragraph_text(markup: str) -> str:
    chunks = []
    for match in re.finditer(r"<p\b[^>]*>(.*?)</p>", markup, flags=re.I | re.S):
        text_value = _clean_text(match.group(1))
        if len(text_value) >= 35:
            chunks.append(text_value)
    return "\n\n".join(chunks)


def _summary(text_value: Optional[str], max_chars: int = 600) -> Optional[str]:
    if not text_value:
        return None
    compact = re.sub(r"\s+", " ", text_value).strip()
    return compact[:max_chars].rstrip()


def _extract_from_html(url: str, markup: str) -> ArticleExtract:
    domain = _domain(url)
    title = _meta_content(markup, "og:title") or _meta_content(markup, "twitter:title")
    description = _meta_content(markup, "description") or _meta_content(markup, "og:description")
    image_url = _meta_content(markup, "og:image") or _meta_content(markup, "twitter:image")
    canonical = _canonical_url(markup)

    for article in _jsonld_articles(markup):
        body = article.get("articleBody") or article.get("description")
        if isinstance(body, str) and len(body) >= MIN_USEFUL_TEXT_CHARS:
            title = title or article.get("headline")
            return ArticleExtract(
                status="ok",
                provider="jsonld",
                url=url,
                domain=domain,
                title=title,
                extracted_text=_clean_text(body),
                summary=_summary(body),
                image_url=image_url,
                canonical_url=canonical,
                source_domain=_domain(canonical) or domain,
            )

    paragraphs = _paragraph_text(markup)
    if len(paragraphs) >= MIN_USEFUL_TEXT_CHARS:
        return ArticleExtract(
            status="ok",
            provider="html",
            url=url,
            domain=domain,
            title=title,
            extracted_text=paragraphs,
            summary=_summary(paragraphs),
            image_url=image_url,
            canonical_url=canonical,
            source_domain=_domain(canonical) or domain,
        )

    fallback_text = description or ""
    return ArticleExtract(
        status="error",
        provider="html",
        url=url,
        domain=domain,
        title=title,
        extracted_text=fallback_text if len(fallback_text) >= MIN_USEFUL_TEXT_CHARS else None,
        summary=_summary(fallback_text),
        image_url=image_url,
        canonical_url=canonical,
        source_domain=_domain(canonical) or domain,
        error_message="direct HTML extraction produced thin text",
    )


def _reader_url(url: str) -> str:
    return f"{JINA_READER_BASE.rstrip('/')}/{url}"


def _extract_from_jina(url: str) -> ArticleExtract:
    headers = {
        "User-Agent": "LuxQuantBot/1.0 (+https://luxquant.com)",
        "Accept": "text/plain",
    }
    api_key = os.environ.get("JINA_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True, headers=headers) as client:
        response = client.get(_reader_url(url))
        response.raise_for_status()
        content = response.text.strip()

    title = None
    title_match = re.search(r"^Title:\s*(.+)$", content, flags=re.M)
    if title_match:
        title = title_match.group(1).strip()

    cleaned = re.sub(r"^Title:.*?$", "", content, flags=re.M).strip()
    cleaned = re.sub(r"^URL Source:.*?$", "", cleaned, flags=re.M).strip()
    cleaned = re.sub(r"^Markdown Content:.*?$", "", cleaned, flags=re.M).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    if len(cleaned) < MIN_USEFUL_TEXT_CHARS:
        return ArticleExtract(
            status="error",
            provider="jina",
            url=url,
            domain=_domain(url),
            title=title,
            error_message="Jina Reader produced thin text",
        )

    return ArticleExtract(
        status="ok",
        provider="jina",
        url=url,
        domain=_domain(url),
        title=title,
        extracted_text=cleaned,
        summary=_summary(cleaned),
        source_domain=_domain(url),
    )


def extract_url(url: str, *, prefer_jina: bool = False) -> ArticleExtract:
    domain = _domain(url)
    last_error = None

    if prefer_jina:
        try:
            return _extract_from_jina(url)
        except Exception as exc:
            last_error = f"jina: {type(exc).__name__}: {exc}"

    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; LuxQuantBot/1.0)"}
        with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True, headers=headers) as client:
            response = client.get(url)
            response.raise_for_status()
            direct = _extract_from_html(str(response.url), response.text)
            if direct.status == "ok":
                return direct
            last_error = direct.error_message
    except Exception as exc:
        last_error = f"direct: {type(exc).__name__}: {exc}"

    try:
        return _extract_from_jina(url)
    except Exception as exc:
        error = f"{last_error}; jina: {type(exc).__name__}: {exc}" if last_error else f"jina: {type(exc).__name__}: {exc}"
        return ArticleExtract(status="error", provider="fallback", url=url, domain=domain, error_message=error[:1000])


def upsert_extract(db, news_id: int, extract: ArticleExtract) -> None:
    db.execute(text("""
        INSERT INTO news_article_extracts (
            news_id, url, domain, provider, status, title, extracted_text, summary,
            image_url, canonical_url, source_domain, error_message, extracted_at
        )
        VALUES (
            :news_id, :url, :domain, :provider, :status, :title, :extracted_text, :summary,
            :image_url, :canonical_url, :source_domain, :error_message,
            CASE WHEN :status = 'ok' THEN now() ELSE NULL END
        )
        ON CONFLICT (news_id) DO UPDATE SET
            url = EXCLUDED.url,
            domain = EXCLUDED.domain,
            provider = EXCLUDED.provider,
            status = EXCLUDED.status,
            title = EXCLUDED.title,
            extracted_text = EXCLUDED.extracted_text,
            summary = EXCLUDED.summary,
            image_url = EXCLUDED.image_url,
            canonical_url = EXCLUDED.canonical_url,
            source_domain = EXCLUDED.source_domain,
            error_message = EXCLUDED.error_message,
            extracted_at = EXCLUDED.extracted_at,
            updated_at = now()
    """), {"news_id": news_id, **extract.__dict__})
    db.commit()


def extract_news_item(db, news_id: int, *, force: bool = False) -> Optional[dict]:
    ensure_extracts_table(db)
    row = db.execute(text("""
        SELECT id, url, domain, title, description, raw_text
        FROM crypto_news
        WHERE id = :id
    """), {"id": news_id}).mappings().first()
    if not row or not row.get("url"):
        return None

    if not force:
        cached = db.execute(text("""
            SELECT status, provider, title, extracted_text, summary, image_url,
                   canonical_url, source_domain, error_message, extracted_at
            FROM news_article_extracts
            WHERE news_id = :id AND status = 'ok'
        """), {"id": news_id}).mappings().first()
        if cached:
            return dict(cached)

    prefer_jina = row.get("domain") == "tradingview.com" or "tradingview.com/news/" in row.get("url", "")
    extract = extract_url(row["url"], prefer_jina=prefer_jina)
    if not extract.title:
        extract.title = row.get("title")
    if not extract.domain:
        extract.domain = row.get("domain") or _domain(row.get("url"))
    upsert_extract(db, news_id, extract)
    return extract.__dict__


def extract_recent_thin_articles(*, limit: int = 20, force: bool = False) -> list[dict]:
    db = SessionLocal()
    try:
        ensure_extracts_table(db)
        rows = db.execute(text("""
            SELECT cn.id
            FROM crypto_news cn
            LEFT JOIN news_article_extracts nae ON nae.news_id = cn.id
            WHERE cn.created_at > now() - interval '3 days'
              AND cn.content_type = 'article'
              AND cn.url IS NOT NULL
              AND (
                    :force
                    OR nae.news_id IS NULL
                    OR nae.status = 'error'
                  )
              AND length(coalesce(cn.description, '')) < 80
              AND length(coalesce(cn.raw_text, '')) < 160
            ORDER BY
              CASE WHEN cn.domain = 'tradingview.com' THEN 0 ELSE 1 END,
              cn.created_at DESC
            LIMIT :limit
        """), {"limit": max(1, min(limit, 200)), "force": force}).mappings().all()

        results = []
        for row in rows:
            extracted = extract_news_item(db, int(row["id"]), force=force)
            results.append({"news_id": int(row["id"]), **(extracted or {"status": "missing"})})
        return results
    finally:
        db.close()


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Extract full text for thin crypto_news articles")
    parser.add_argument("--news-id", type=int)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)

    if args.news_id:
        db = SessionLocal()
        try:
            result = extract_news_item(db, args.news_id, force=args.force)
        finally:
            db.close()
    else:
        result = extract_recent_thin_articles(limit=args.limit, force=args.force)

    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
