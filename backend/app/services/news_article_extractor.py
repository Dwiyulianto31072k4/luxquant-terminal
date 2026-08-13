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
# Floor for text taken from structured metadata (JSON-LD), which is trustworthy
# even when short — unlike scraped page text, where short means we missed.
MIN_STRUCTURED_TEXT_CHARS = 140
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
        # Structured metadata is authored, not scraped, so a short body here is
        # a short story — not a failed parse. Syndicated wire blurbs run just
        # under 300 chars and were being thrown away for missing a 350 floor.
        if isinstance(body, str) and len(body) >= MIN_STRUCTURED_TEXT_CHARS:
            title = title or article.get("headline")
            return ArticleExtract(
                status="ok",
                provider="jsonld",
                url=url,
                domain=domain,
                title=title,
                extracted_text=_trim_trailing_boilerplate(_clean_text(body)),
                summary=_summary(_trim_trailing_boilerplate(_clean_text(body))),
                image_url=image_url,
                canonical_url=canonical,
                source_domain=_domain(canonical) or domain,
            )

    paragraphs = _paragraph_text(markup)
    if len(paragraphs) >= MIN_USEFUL_TEXT_CHARS and not _looks_like_boilerplate(paragraphs):
        return ArticleExtract(
            status="ok",
            provider="html",
            url=url,
            domain=domain,
            title=title,
            extracted_text=_trim_trailing_boilerplate(paragraphs),
            summary=_summary(_trim_trailing_boilerplate(paragraphs)),
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


# Jina Reader answers in Markdown with a small header block. Left alone, all of
# that reaches the reader as literal "Published Time: …", "**bold**" and
# "[label](https://…)" noise, which is what the news modal was showing.
_JINA_HEADER_KEYS = (
    "Title",
    "URL Source",
    "Markdown Content",
    "Published Time",
    "Warning",
    "Images",
    "Links",
)


def _markdown_to_text(value: Optional[str]) -> str:
    """Flatten Markdown into prose fit for a plain-text reader pane."""
    if not value:
        return ""

    out = value

    # "Published Time:" appears two ways: as its own header line in fresh
    # reader output, and glued to the article text in stored summaries. Handle
    # the standalone line first, then the same-line case, taking the timestamp
    # only so the article that follows it survives.
    # A header line holds only a date, in any format ("2026-08-03T…" or
    # "Mon, 03 Aug 2026 06:50:56 GMT"), so drop the whole line when it is short
    # enough to be just that. Stored summaries instead glue the article onto
    # the same line, where only the leading timestamp token may go.
    out = re.sub(r"^Published Time:[ \t]*.{0,60}$", "", out, flags=re.M)
    out = re.sub(r"^\s*Published Time:[ \t]*\S+[ \t]*", "", out)
    for key in _JINA_HEADER_KEYS:
        if key == "Published Time":
            continue
        out = re.sub(rf"^{re.escape(key)}:[^\n]*(?:\n|$)", "", out, flags=re.M)

    out = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", out)          # images
    out = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", out)      # links keep their label
    out = re.sub(r"<https?://[^>]+>", "", out)              # autolinks
    out = re.sub(r"^\s{0,3}#{1,6}\s*", "", out, flags=re.M)  # headings
    out = re.sub(r"^\s{0,3}>\s?", "", out, flags=re.M)       # block quotes
    out = re.sub(r"^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$", "", out, flags=re.M)  # rules
    out = re.sub(r"(\*\*\*|___)(.+?)\1", r"\2", out, flags=re.S)
    out = re.sub(r"(\*\*|__)(.+?)\1", r"\2", out, flags=re.S)
    out = re.sub(r"(?<!\w)([*_])(?!\s)(.+?)(?<!\s)\1(?!\w)", r"\2", out, flags=re.S)
    out = re.sub(r"`{1,3}([^`]*)`{1,3}", r"\1", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


_BOILERPLATE_OPENERS = (
    "skip to main content",
    "skip to content",
    "enable javascript",
    "please enable cookies",
    "you need to enable javascript",
    "post log in",
    "log in sign up",
)

# Social platforms render their timeline shell to crawlers: sign-up prompts,
# reply counts, legal links. A t.co link on a Telegram post lands here, and the
# post's own text is a better read than the scaffolding around it.
_SOCIAL_CHROME = re.compile(
    r"(log in or sign up|join the conversation|see what.s happening|"
    r"sign ?up\s*post\b|read \d+ more repl|x corp\.)",
    re.I,
)

# Where an article stops and the site furniture begins.
_TAIL_MARKERS = (
    r"all rights reserved",
    r"©\s*20\d\d",
    r"terms\s*[·|]\s*privacy",
    r"select (market|reference) data provided by",
    r"sec filings and other documents provided by",
    r"scan to get the app",
    r"download the app",
    r"follow us on (twitter|x|telegram|facebook)",
)


def _trim_trailing_boilerplate(value: str) -> str:
    """Cut the site furniture that trails an otherwise fine article.

    Only ever cuts inside the last third, and only when a healthy article
    remains, so a legal phrase quoted mid-story is left alone.
    """
    if not value:
        return value

    cut = None
    floor = int(len(value) * 0.6)
    for marker in _TAIL_MARKERS:
        match = re.search(marker, value[floor:], re.I)
        if match:
            position = floor + match.start()
            cut = position if cut is None else min(cut, position)

    if cut is None or cut < MIN_STRUCTURED_TEXT_CHARS:
        return value
    return value[:cut].rstrip(" \n\t·|-—")


def _looks_like_boilerplate(value: Optional[str]) -> bool:
    """True when the reader came back with site chrome instead of the article.

    TradingView and friends answer crawlers with a nav skeleton — "Skip to main
    content Search * Products * Community …". Showing that as a summary is
    worse than showing nothing, so callers fall back to the item's own text.
    """
    if not value:
        return True

    stripped = value.strip()
    head = stripped.lower()[:400]
    if any(head.startswith(opener) for opener in _BOILERPLATE_OPENERS):
        return True
    if _SOCIAL_CHROME.search(stripped[:1200]):
        return True

    # A page of links and labels rather than prose: many lines, all stubby.
    lines = [ln for ln in stripped.splitlines() if ln.strip()][:30]
    if len(lines) >= 8 and sum(len(ln) for ln in lines) / len(lines) < 45:
        return True

    # A nav menu reads as a pile of short list items. They arrive inline from
    # one reader and one-per-line from another, so count both shapes.
    if head.count(" * ") >= 4:
        return True
    bullet_lines = [ln for ln in stripped.splitlines()[:25] if re.match(r"^\s*[*\-•]\s+\S", ln)]
    if len(bullet_lines) >= 5 and sum(len(ln) for ln in bullet_lines) / len(bullet_lines) < 40:
        return True

    # Deliberately says nothing about length: a short wire story is still a
    # story, and callers apply their own floor where one belongs.
    return False


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

    cleaned = _trim_trailing_boilerplate(_markdown_to_text(content))

    if len(cleaned) < MIN_USEFUL_TEXT_CHARS or _looks_like_boilerplate(cleaned):
        return ArticleExtract(
            status="error",
            provider="jina",
            url=url,
            domain=_domain(url),
            title=title,
            error_message="Jina Reader produced navigation chrome, not article text",
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


_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def _resolve_google_news_url(url: str) -> Optional[str]:
    """Trade a Google News token for the publisher's own article URL.

    Google News links carry an opaque token and reveal the destination only
    through a JS call, so fetching them directly yields a redirect shell with
    no article in it. The page ships a signature and timestamp that its own
    front end posts back; doing the same returns the real URL.
    """
    try:
        token = url.split("/articles/", 1)[1].split("?", 1)[0]
    except IndexError:
        return None

    try:
        with httpx.Client(
            timeout=HTTP_TIMEOUT, follow_redirects=True, headers={"User-Agent": _BROWSER_UA}
        ) as client:
            markup = client.get(url).text
            signature = re.search(r'data-n-a-sg="([^"]+)"', markup)
            timestamp = re.search(r'data-n-a-ts="([^"]+)"', markup)
            if not (signature and timestamp):
                return None

            request = [
                "garturlreq",
                [
                    ["X", "X", ["X", "X"], None, None, 1, 1, "US:en",
                     None, 1, None, None, None, None, None, 0, 1],
                    "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0,
                ],
                token,
                int(timestamp.group(1)),
                signature.group(1),
            ]
            payload = [[["Fbv4je", json.dumps(request), None, "generic"]]]
            response = client.post(
                "https://news.google.com/_/DotsSplashUi/data/batchexecute",
                data={"f.req": json.dumps(payload)},
                headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
            )
            match = re.search(r'(https?://(?!news\.google)[^\\"]{15,400})', response.text)
            return match.group(1) if match else None
    except Exception:
        return None


def extract_url(url: str, *, prefer_jina: bool = False) -> ArticleExtract:
    # A tweet has no article behind it, only the timeline shell. Skip the fetch
    # and let the caller fall back to the post's own text.
    if _domain(url) in {"x.com", "twitter.com", "mobile.twitter.com"}:
        return ArticleExtract(
            status="error",
            provider="skipped",
            url=url,
            domain=_domain(url),
            error_message="social post, not an article",
        )

    if _domain(url) == "news.google.com":
        resolved = _resolve_google_news_url(url)
        if resolved:
            url = resolved

    domain = _domain(url)
    last_error = None

    if prefer_jina:
        try:
            preferred = _extract_from_jina(url)
            if preferred.status == "ok":
                return preferred
            # Preferring a provider is a hint, not a verdict. Jina hands back
            # navigation chrome for some sites, and returning that unchecked is
            # why TradingView stories opened with no narrative at all.
            last_error = preferred.error_message
        except Exception as exc:
            last_error = f"jina: {type(exc).__name__}: {exc}"

    try:
        # Publishers serve crawlers a stub; ask as a browser for the real page.
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }
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
            # Rows stored before the Markdown cleanup still hold raw reader
            # output, so scrub on the way out rather than re-scraping them all.
            row_out = dict(cached)
            row_out["extracted_text"] = _trim_trailing_boilerplate(
                _markdown_to_text(row_out.get("extracted_text"))
            )
            row_out["summary"] = _trim_trailing_boilerplate(
                _markdown_to_text(row_out.get("summary"))
            )
            if _looks_like_boilerplate(row_out["extracted_text"]):
                # Cached chrome, not an article. Drop the body so the reader
                # falls back to the item's own text instead of showing a menu.
                row_out["extracted_text"] = None
                row_out["summary"] = None
            return row_out

    # TradingView used to be routed to Jina first, but it publishes a full
    # NewsArticle block in the page itself that the direct reader handles
    # cleanly, while Jina only ever sees the nav shell. Direct first, Jina as
    # the fallback, for every domain.
    prefer_jina = False
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
