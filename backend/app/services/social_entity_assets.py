"""
Entity visual assets for social posts (logos + people).

Why this exists
---------------
The editorial image model is deliberately blocked from inventing logos
("no corporate logos") because AI-drawn marks look wrong and raise IP risk.
People faces only work when we have a verified reference photo.

This module resolves *real* assets for named entities extracted from the
story, then the image compositor stamps them onto the final LuxQuant card:
  · organizations / protocols / agencies  → logo badges
  · people (founders, officials)          → face library (existing) + autofetch

Assets are cached under SOCIAL_POST_ASSETS_DIR/{logos,faces}.
"""

from __future__ import annotations

import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)

ASSETS_DIR = Path(os.environ.get("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts"))
LOGO_DIR = Path(os.environ.get("SOCIAL_LOGO_DIR", str(ASSETS_DIR / "logos")))
FACE_DIR = Path(os.environ.get("SOCIAL_FACE_DIR", str(ASSETS_DIR / "faces")))
WIKI_SUMMARY = os.environ.get("SOCIAL_WIKI_API", "https://en.wikipedia.org/api/rest_v1/page/summary/")
WIKI_SEARCH = os.environ.get(
    "SOCIAL_WIKI_SEARCH_API",
    "https://en.wikipedia.org/w/api.php",
)
LOGO_AUTOFETCH = os.environ.get("SOCIAL_LOGO_AUTOFETCH", "1").strip().lower() not in ("0", "false", "no")
LOGO_MISS_TTL = int(os.environ.get("SOCIAL_LOGO_MISS_TTL", str(14 * 24 * 3600)))
USER_AGENT = "LuxQuantBot/1.0 (editorial news illustration; contact admin@luxquant.tw)"

# Curated aliases → Wikipedia title or clearbit domain for high-value crypto orgs.
# Prefer Wikipedia lead images (identity-reliable) over AI-hallucinated marks.
ORG_ALIASES: dict[str, dict[str, str]] = {
    "hyperliquid": {"wiki": "Hyperliquid", "domain": "hyperliquid.xyz"},
    "sec": {"wiki": "U.S. Securities and Exchange Commission", "domain": "sec.gov"},
    "u.s. securities and exchange commission": {
        "wiki": "U.S. Securities and Exchange Commission",
        "domain": "sec.gov",
    },
    "securities and exchange commission": {
        "wiki": "U.S. Securities and Exchange Commission",
        "domain": "sec.gov",
    },
    "cftc": {"wiki": "Commodity Futures Trading Commission", "domain": "cftc.gov"},
    "federal reserve": {"wiki": "Federal Reserve", "domain": "federalreserve.gov"},
    "fed": {"wiki": "Federal Reserve", "domain": "federalreserve.gov"},
    "binance": {"wiki": "Binance", "domain": "binance.com"},
    "coinbase": {"wiki": "Coinbase", "domain": "coinbase.com"},
    "blackrock": {"wiki": "BlackRock", "domain": "blackrock.com"},
    "ethereum": {"wiki": "Ethereum", "domain": "ethereum.org"},
    "bitcoin": {"wiki": "Bitcoin", "domain": "bitcoin.org"},
    "solana": {"wiki": "Solana (blockchain platform)", "domain": "solana.com"},
    "tether": {"wiki": "Tether (cryptocurrency)", "domain": "tether.to"},
    "circle": {"wiki": "Circle (company)", "domain": "circle.com"},
    "opensea": {"wiki": "OpenSea", "domain": "opensea.io"},
    "uniswap": {"wiki": "Uniswap", "domain": "uniswap.org"},
    "aave": {"wiki": "Aave", "domain": "aave.com"},
    "jupiter": {"wiki": "Jupiter (DEX)", "domain": "jup.ag"},
    "robinhood": {"wiki": "Robinhood Markets", "domain": "robinhood.com"},
    "deribit": {"wiki": "Deribit", "domain": "deribit.com"},
    "okx": {"wiki": "OKX", "domain": "okx.com"},
    "bybit": {"wiki": "Bybit", "domain": "bybit.com"},
    "kraken": {"wiki": "Kraken (cryptocurrency exchange)", "domain": "kraken.com"},
    "white house": {"wiki": "White House", "domain": "whitehouse.gov"},
    "congress": {"wiki": "United States Congress", "domain": "congress.gov"},
    "senate": {"wiki": "United States Senate", "domain": "senate.gov"},
    "treasury": {"wiki": "United States Department of the Treasury", "domain": "treasury.gov"},
    "imf": {"wiki": "International Monetary Fund", "domain": "imf.org"},
    "world bank": {"wiki": "World Bank", "domain": "worldbank.org"},
}

# People aliases → Wikipedia title for founders/CEOs that matter in crypto news.
PERSON_ALIASES: dict[str, str] = {
    "jeff yan": "Jeff Yan",  # Hyperliquid — may miss on wiki; try search
    "vitalik buterin": "Vitalik Buterin",
    "brian armstrong": "Brian Armstrong",
    "changpeng zhao": "Changpeng Zhao",
    "cz": "Changpeng Zhao",
    "sam bankman-fried": "Sam Bankman-Fried",
    "sbf": "Sam Bankman-Fried",
    "elon musk": "Elon Musk",
    "donald trump": "Donald Trump",
    "jerome powell": "Jerome Powell",
    "gary gensler": "Gary Gensler",
    "larry fink": "Larry Fink",
}


def _slug(value: str) -> str:
    base = re.split(r"[,(/|]", value or "", 1)[0]
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")[:80]


def _headers() -> dict:
    return {"User-Agent": USER_AGENT}


def _is_fresh_miss(path: Path) -> bool:
    try:
        return path.exists() and (time.time() - path.stat().st_mtime) < LOGO_MISS_TTL
    except Exception:
        return False


def _mark_miss(path: Path) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("")
    except Exception:
        pass


def _save_image_bytes(content: bytes, content_type: str, dest_base: Path) -> Optional[str]:
    if not content_type.startswith("image/") or len(content) < 4_000:
        return None
    ext = ".png" if "png" in content_type else ".webp" if "webp" in content_type else ".jpg"
    dest = dest_base.with_suffix(ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return str(dest)


def _wiki_summary_image(title: str) -> Optional[str]:
    """Return download URL for Wikipedia lead image, or None."""
    if not title:
        return None
    try:
        url = f"{WIKI_SUMMARY}{quote(title.replace(' ', '_'), safe='')}"
        resp = requests.get(url, headers=_headers(), timeout=18)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("type") == "disambiguation":
            return None
        return (data.get("originalimage") or {}).get("source") or (data.get("thumbnail") or {}).get("source")
    except Exception:
        return None


def _wiki_search_title(query: str) -> Optional[str]:
    try:
        resp = requests.get(
            WIKI_SEARCH,
            params={
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": 3,
                "format": "json",
            },
            headers=_headers(),
            timeout=18,
        )
        resp.raise_for_status()
        hits = ((resp.json().get("query") or {}).get("search") or [])
        if not hits:
            return None
        return hits[0].get("title")
    except Exception:
        return None


def _download_url(url: str, dest_base: Path) -> Optional[str]:
    try:
        resp = requests.get(url, headers=_headers(), timeout=25)
        resp.raise_for_status()
        return _save_image_bytes(resp.content, resp.headers.get("content-type", ""), dest_base)
    except Exception:
        return None


def _clearbit_logo(domain: str, dest_base: Path) -> Optional[str]:
    """Best-effort brand logo from Clearbit Logo API (no key required for basic use)."""
    domain = (domain or "").strip().lower()
    if not domain:
        return None
    url = f"https://logo.clearbit.com/{domain}?size=256"
    try:
        resp = requests.get(url, headers=_headers(), timeout=18)
        if resp.status_code != 200:
            return None
        return _save_image_bytes(resp.content, resp.headers.get("content-type", "image/png"), dest_base)
    except Exception:
        return None


def resolve_logo(name: str, *, domain: Optional[str] = None) -> Optional[str]:
    """Return path to a cached org logo, or fetch one. Never raises."""
    raw = (name or "").strip()
    if not raw:
        return None
    key = raw.lower()
    alias = ORG_ALIASES.get(key) or ORG_ALIASES.get(_slug(key).replace("-", " "))
    slug = _slug(alias.get("wiki") if alias else raw)
    if not slug:
        return None

    for ext in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        path = LOGO_DIR / f"{slug}{ext}"
        if path.exists() and path.stat().st_size > 500:
            return str(path)

    miss = LOGO_DIR / f"{slug}.miss"
    if _is_fresh_miss(miss) or not LOGO_AUTOFETCH:
        return None

    dest_base = LOGO_DIR / slug
    wiki_title = (alias or {}).get("wiki") or raw
    img_url = _wiki_summary_image(wiki_title)
    if not img_url:
        found = _wiki_search_title(wiki_title)
        if found:
            img_url = _wiki_summary_image(found)
            if found:
                slug2 = _slug(found)
                dest_base = LOGO_DIR / slug2

    if img_url:
        saved = _download_url(img_url, dest_base)
        if saved:
            return saved

    # Fallback: Clearbit domain logo (clean brand mark, good for SEC/Binance/etc.)
    dom = domain or (alias or {}).get("domain")
    saved = _clearbit_logo(dom or "", dest_base)
    if saved:
        return saved

    _mark_miss(miss)
    return None


def resolve_person_face(name: str) -> Optional[str]:
    """Reuse face library resolution with aliases; fetch via Wikipedia if missing."""
    from app.services.social_image_generator import fetch_face_reference, resolve_face_reference

    raw = (name or "").strip()
    if not raw:
        return None
    key = raw.lower()
    # Prefer first name part before comma/role
    short = re.split(r"[,(]", raw, 1)[0].strip()
    alias_title = PERSON_ALIASES.get(key) or PERSON_ALIASES.get(short.lower())

    for candidate in (alias_title, short, raw):
        if not candidate:
            continue
        path = resolve_face_reference(candidate)
        if path:
            return path

    for candidate in (alias_title, short, raw):
        if not candidate:
            continue
        path = fetch_face_reference(candidate)
        if path:
            return path
        # Wikipedia search then fetch under that title
        found = _wiki_search_title(candidate)
        if found and found.lower() != candidate.lower():
            path = fetch_face_reference(found)
            if path:
                return path
    return None


def normalize_entities(raw: Any) -> list[dict]:
    """Normalize AI `entities` array into [{name, type, role, domain?}]."""
    if not raw:
        return []
    if isinstance(raw, str):
        return [{"name": raw.strip(), "type": "org", "role": ""}] if raw.strip() else []
    out = []
    seen = set()
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, str):
            name, typ, role, domain = item.strip(), "org", "", None
        elif isinstance(item, dict):
            name = str(item.get("name") or item.get("label") or "").strip()
            typ = str(item.get("type") or "org").strip().lower()
            if typ in ("organization", "company", "protocol", "agency", "brand", "exchange"):
                typ = "org"
            if typ in ("person", "people", "human", "founder", "ceo", "official"):
                typ = "person"
            if typ not in ("org", "person", "institution"):
                typ = "org"
            if typ == "institution":
                typ = "org"
            role = str(item.get("role") or item.get("title") or "").strip()
            domain = (item.get("domain") or item.get("website") or None)
            if domain:
                domain = str(domain).replace("https://", "").replace("http://", "").split("/")[0]
        else:
            continue
        if not name:
            continue
        key = (name.lower(), typ)
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": name, "type": typ, "role": role, "domain": domain})
    return out[:8]


def resolve_entity_assets(entities: list[dict], featured_person: Optional[str] = None) -> dict:
    """
    Resolve logo/face paths for entities.

    Returns:
      {
        "logos": [{"name", "role", "path"}],
        "people": [{"name", "role", "path"}],
        "featured_face_path": Optional[str],
      }
    """
    logos: list[dict] = []
    people: list[dict] = []
    featured_face_path = None

    # Ensure featured person is in the list
    ents = list(entities or [])
    if featured_person:
        fp_name = re.split(r"[,(]", featured_person, 1)[0].strip()
        if fp_name and not any(
            e.get("type") == "person" and e.get("name", "").lower().startswith(fp_name.lower().split()[0])
            for e in ents
        ):
            ents.insert(0, {"name": featured_person, "type": "person", "role": "featured", "domain": None})

    for e in ents:
        name = e.get("name") or ""
        role = e.get("role") or ""
        typ = e.get("type") or "org"
        if typ == "person":
            path = resolve_person_face(name)
            if path:
                people.append({"name": name, "role": role, "path": path})
                if featured_person and name.lower().split(",")[0].strip() in featured_person.lower():
                    featured_face_path = path
                elif not featured_face_path:
                    featured_face_path = path
        else:
            path = resolve_logo(name, domain=e.get("domain"))
            if path:
                logos.append({"name": name, "role": role, "path": path})

    return {
        "logos": logos[:4],
        "people": people[:3],
        "featured_face_path": featured_face_path,
    }
