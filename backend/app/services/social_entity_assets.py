"""
Entity visual assets for social posts (logos + people).

Why this exists
---------------
AI-drawn logos look wrong (IP + quality). Verified logo/face files are resolved
from a library and fed into image generation as *scene references* (brand mark
integrated into the photograph), never as corner stickers.

Visual scope is intentionally narrow:
  · 1 primary org (headline-ranked) → logo into the AI scene
  · 1 featured person               → face likeness edit
Competitor / tangential orgs (e.g. Coinbase on a Binance story) stay in caption
entities for text only — not materials, not image.

Assets are cached under SOCIAL_POST_ASSETS_DIR/{logos,faces}.
"""

from __future__ import annotations

import json
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
LOGO_AUTOFETCH = os.environ.get("SOCIAL_LOGO_AUTOFETCH", "0").strip().lower() not in ("0", "false", "no")
LOGO_MISS_TTL = int(os.environ.get("SOCIAL_LOGO_MISS_TTL", str(14 * 24 * 3600)))
USER_AGENT = "LuxQuantBot/1.0 (editorial news illustration; contact admin@luxquant.tw)"
# Safe mode (default ON): only admin-uploaded (or explicitly confirmed) logos/faces
# unlock AI image generation. Wiki/clearbit autofetch never auto-approves.
SAFE_MATERIALS = os.environ.get("SOCIAL_SAFE_MATERIALS", "1").strip().lower() not in ("0", "false", "no")
TRUSTED_SOURCES = frozenset({"admin", "confirmed", "seed_trusted"})

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


def _trust_path_for(asset_path: str | Path) -> Path:
    p = Path(asset_path)
    return p.with_suffix(p.suffix + ".trust.json")


def write_asset_trust(asset_path: str, *, source: str = "admin", by: str = "admin") -> dict:
    """Mark an on-disk logo/face as trusted for safe materials mode."""
    from datetime import datetime, timezone

    meta = {
        "source": source,
        "verified": source in TRUSTED_SOURCES,
        "by": by,
        "at": datetime.now(timezone.utc).isoformat(),
        "path": str(asset_path),
    }
    try:
        tp = _trust_path_for(asset_path)
        tp.write_text(json.dumps(meta), encoding="utf-8")
    except Exception:
        pass
    return meta


def read_asset_trust(asset_path: Optional[str]) -> dict:
    """Return trust metadata for an asset file."""
    if not asset_path:
        return {"source": None, "verified": False, "trusted": False}
    p = Path(asset_path)
    if not p.exists():
        return {"source": None, "verified": False, "trusted": False}
    try:
        tp = _trust_path_for(p)
        if tp.exists():
            data = json.loads(tp.read_text(encoding="utf-8"))
            source = str(data.get("source") or "")
            trusted = bool(data.get("verified")) or source in TRUSTED_SOURCES
            return {
                "source": source or "unknown",
                "verified": trusted,
                "trusted": trusted,
                "by": data.get("by"),
                "at": data.get("at"),
            }
    except Exception:
        pass
    # No trust file: legacy library file. In safe mode → not trusted (admin must confirm/upload).
    return {
        "source": "library_unverified",
        "verified": False,
        "trusted": not SAFE_MATERIALS,  # only trusted when safe mode is off
    }


def find_local_logo(name: str, *, domain: Optional[str] = None) -> Optional[str]:
    """Local disk only — no network autofetch."""
    raw = (name or "").strip()
    if not raw:
        return None
    key = raw.lower()
    alias = ORG_ALIASES.get(key) or ORG_ALIASES.get(_slug(key).replace("-", " "))
    candidates = []
    if alias and alias.get("wiki"):
        candidates.append(_slug(alias["wiki"]))
    candidates.append(_slug(raw))
    for slug in candidates:
        if not slug:
            continue
        for ext in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
            path = LOGO_DIR / f"{slug}{ext}"
            if path.exists() and path.stat().st_size > 500:
                return str(path)
    return None


def find_local_face(name: str) -> Optional[str]:
    """Local face library only — no Wikipedia autofetch."""
    from app.services.social_image_generator import resolve_face_reference

    raw = (name or "").strip()
    if not raw:
        return None
    key = raw.lower()
    short = re.split(r"[,(]", raw, 1)[0].strip()
    alias_title = PERSON_ALIASES.get(key) or PERSON_ALIASES.get(short.lower())
    for candidate in (alias_title, short, raw):
        if not candidate:
            continue
        path = resolve_face_reference(candidate)
        if path:
            return path
    return None


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


def pick_primary_org(entities: list[dict], headline: str = "") -> Optional[dict]:
    """Pick the single org that should drive visuals (logo-in-scene).

    Ranks by headline match first so a Binance story does not pull Coinbase
    into materials / image generation.
    """
    orgs = [e for e in (entities or []) if (e.get("type") or "org") == "org" and e.get("name")]
    if not orgs:
        return None
    hl = re.sub(r"\s+", " ", (headline or "").lower())
    scored: list[tuple[int, dict]] = []
    for i, org in enumerate(orgs):
        name = str(org.get("name") or "").strip()
        name_l = name.lower()
        score = max(0, 40 - i * 3)  # list order is a weak prior
        if name_l and name_l in hl:
            score += 300
        for w in re.findall(r"[a-z0-9]{3,}", name_l):
            if w in hl:
                score += 80
                break
        role = str(org.get("role") or "").lower()
        if any(k in role for k in ("primary", "subject", "protocol", "exchange", "company")):
            score += 15
        scored.append((score, org))
    scored.sort(key=lambda x: (-x[0], orgs.index(x[1]) if x[1] in orgs else 99))
    return scored[0][1] if scored else None


def select_visual_entities(
    entities: list[dict],
    *,
    featured_person: Optional[str] = None,
    headline: str = "",
) -> dict:
    """Narrow entity set for materials + image: 1 primary org + featured person only."""
    primary = pick_primary_org(entities or [], headline=headline)
    visual: list[dict] = []
    if primary:
        visual.append({**primary, "type": "org", "visual_role": "primary_brand"})
    fp = None
    if featured_person:
        fp = re.split(r"[,(]", featured_person, 1)[0].strip() or None
    if not fp:
        # First person entity as soft featured
        for e in entities or []:
            if e.get("type") == "person" and e.get("name"):
                fp = str(e["name"]).strip()
                break
    if fp:
        visual.append({
            "name": fp if "," in (featured_person or "") else fp,
            "type": "person",
            "role": "featured",
            "domain": None,
            "visual_role": "featured_person",
        })
        # Prefer full featured_person string when provided
        if featured_person and featured_person.strip():
            visual[-1]["name"] = featured_person.strip()
    return {
        "primary_org": primary,
        "featured_person": featured_person or fp,
        "visual_entities": visual,
    }


def resolve_entity_assets(
    entities: list[dict],
    featured_person: Optional[str] = None,
    *,
    headline: str = "",
    visual_only: bool = False,
) -> dict:
    """
    Resolve logo/face paths for entities.

    When visual_only=True (default for materials gate + image gen), only the
    headline-ranked primary org + featured person are required/resolved for
    needs_materials. Full entity lists can still be passed with visual_only=False
    for admin inventory of everything AI mentioned.
    """
    logos: list[dict] = []
    people: list[dict] = []
    inventory: list[dict] = []
    featured_face_path = None
    qc_flags: list[str] = []

    selection = select_visual_entities(
        entities or [], featured_person=featured_person, headline=headline
    )
    primary_org = selection.get("primary_org")
    if visual_only:
        ents = list(selection.get("visual_entities") or [])
        featured_person = selection.get("featured_person") or featured_person
    else:
        ents = list(entities or [])
        if featured_person:
            fp_name = re.split(r"[,(]", featured_person, 1)[0].strip()
            if fp_name and not any(
                e.get("type") == "person" and e.get("name", "").lower().startswith(fp_name.lower().split()[0])
                for e in ents
            ):
                ents.insert(0, {"name": featured_person, "type": "person", "role": "featured", "domain": None})
        # Ensure primary is first among orgs for display
        if primary_org and not any(
            (e.get("name") or "").lower() == (primary_org.get("name") or "").lower()
            for e in ents if e.get("type") == "org"
        ):
            ents.insert(0, primary_org)

    for e in ents:
        name = e.get("name") or ""
        role = e.get("role") or ""
        typ = e.get("type") or "org"
        domain = e.get("domain")
        # Safe mode: local lookup only — never network-autofetch for the gate
        if typ == "person":
            path = find_local_face(name) if SAFE_MATERIALS else resolve_person_face(name)
            kind = "face"
        else:
            path = find_local_logo(name, domain=domain) if SAFE_MATERIALS else resolve_logo(name, domain=domain)
            kind = "logo"

        trust = read_asset_trust(path)
        trusted = bool(path) and bool(trust.get("trusted"))

        if trusted:
            status = "resolved"
            request = None
            if kind == "face":
                people.append({"name": name, "role": role, "path": path, "source": trust.get("source")})
                if featured_person and name.lower().split(",")[0].strip() in (featured_person or "").lower():
                    featured_face_path = path
                elif not featured_face_path:
                    featured_face_path = path
            else:
                logos.append({"name": name, "role": role, "path": path, "source": trust.get("source")})
        elif path and not trusted:
            # File exists (wiki/legacy) but admin has not confirmed — block generate
            status = "needs_upload"
            request = (
                f"Upload official {kind} for {name} for accuracy"
                + (f" ({role})" if role else "")
                + (f" — transparent PNG from {domain}" if domain and kind == "logo" else "")
                + ("" if kind == "logo" else " — clear front-facing portrait, high-res")
                + ". Library may have an unverified file; admin upload is required in safe mode."
            )
            qc_flags.append(f"{kind.upper()}_UNVERIFIED:{name}")
        else:
            status = "missing"
            if kind == "face":
                request = (
                    f"Upload a clear portrait photo of {name}"
                    + (f" ({role})" if role else "")
                    + " — face front, high-res, no crowd. Required before AI image."
                )
                qc_flags.append(f"FACE_MISSING:{name}")
            else:
                request = (
                    f"Upload official logo for {name}"
                    + (f" ({role})" if role else "")
                    + (f" — prefer transparent PNG from {domain}" if domain else " — prefer transparent PNG / square mark")
                    + ". Required before AI image."
                )
                qc_flags.append(f"ORG_LOGO_MISSING:{name}")

        inventory.append({
            "name": name,
            "type": typ,
            "role": role,
            "domain": domain,
            "kind": kind,
            "status": status,
            "path": path if trusted else None,
            "preview_path": path if path and not trusted else None,
            "request": request,
            "slug": _slug(name),
            "source": trust.get("source"),
            "trusted": trusted,
        })

    # Soft inherit: child org can reuse TRUSTED parent brand logo
    trusted_orgs = [
        i for i in inventory
        if i.get("type") == "org" and i.get("status") == "resolved" and i.get("path")
    ]
    for item in inventory:
        if item.get("status") not in ("missing", "needs_upload") or item.get("kind") != "logo":
            continue
        name_l = (item.get("name") or "").lower().strip()
        best = None
        best_len = 0
        for parent in trusted_orgs:
            pn = (parent.get("name") or "").lower().strip()
            if not pn or pn == name_l:
                continue
            if len(pn) >= 4 and (name_l.startswith(pn) or f" {pn} " in f" {name_l} "):
                if len(pn) > best_len:
                    best = parent
                    best_len = len(pn)
        if best and best.get("path") and best.get("trusted"):
            item["status"] = "resolved"
            item["path"] = best["path"]
            item["preview_path"] = None
            item["request"] = None
            item["inherited_from"] = best.get("name")
            item["trusted"] = True
            item["source"] = best.get("source") or "admin"
            logos.append({"name": item["name"], "role": item.get("role") or "", "path": best["path"]})
            qc_flags = [
                f for f in qc_flags
                if not f.endswith(f":{item['name']}")
            ]

    # Deduplicate logos
    seen_paths: set[str] = set()
    unique_logos: list[dict] = []
    for lg in logos:
        p = lg.get("path")
        if p and p not in seen_paths:
            seen_paths.add(p)
            unique_logos.append(lg)
    logos = unique_logos

    # Block generate until every visual item is admin-trusted
    critical = [
        i for i in inventory
        if i.get("kind") in ("logo", "face") and i.get("status") in ("missing", "needs_upload")
    ]
    if not logos and any(i.get("type") == "org" for i in inventory):
        qc_flags.append("PRIMARY_LOGO_REQUIRED")

    primary_logo = None
    if primary_org:
        pname = (primary_org.get("name") or "").lower()
        for lg in logos:
            if (lg.get("name") or "").lower() == pname:
                primary_logo = lg
                break
        if not primary_logo and logos:
            primary_logo = logos[0]

    # Only trusted faces unlock generation
    if featured_face_path and not read_asset_trust(featured_face_path).get("trusted"):
        featured_face_path = None

    return {
        "logos": logos[:4],
        "people": people[:3],
        "featured_face_path": featured_face_path,
        "primary_org": primary_org,
        "primary_logo": primary_logo,
        "inventory": inventory,
        "needs_materials": len(critical) > 0,
        "missing_count": len(critical),
        "qc_flags": qc_flags,
        "critical_missing": [
            {
                "name": i["name"],
                "kind": i["kind"],
                "request": i.get("request"),
                "status": i.get("status"),
            }
            for i in critical
        ],
        "visual_only": visual_only,
        "safe_mode": SAFE_MATERIALS,
    }


def save_admin_upload(
    *,
    name: str,
    kind: str,
    file_bytes: bytes,
    content_type: str = "image/png",
    admin: str = "admin",
) -> str:
    """Persist an admin-provided logo/face and mark it trusted for safe mode."""
    kind = (kind or "logo").lower()
    if kind not in ("logo", "face"):
        raise ValueError("kind must be logo or face")
    slug = _slug(name)
    if not slug:
        raise ValueError("invalid name")
    # Prefer alias slug for logos so resolve finds the file next time
    if kind == "logo":
        key = (name or "").strip().lower()
        alias = ORG_ALIASES.get(key)
        if alias and alias.get("wiki"):
            slug = _slug(alias["wiki"]) or slug
    base_dir = LOGO_DIR if kind == "logo" else FACE_DIR
    # Faces: use image_generator face dir slug convention
    if kind == "face":
        from app.services.social_image_generator import SOCIAL_FACE_DIR, _slugify_name
        base_dir = Path(SOCIAL_FACE_DIR)
        slug = _slugify_name(name) or slug
    base_dir.mkdir(parents=True, exist_ok=True)
    miss = base_dir / f"{slug}.miss"
    if miss.exists():
        try:
            miss.unlink()
        except Exception:
            pass
    dest_base = base_dir / slug
    saved = _save_image_bytes(file_bytes, content_type or "image/png", dest_base)
    if not saved:
        dest = dest_base.with_suffix(".png")
        dest.write_bytes(file_bytes)
        saved = str(dest)
    write_asset_trust(saved, source="admin", by=admin or "admin")
    return saved


def confirm_library_asset(
    *,
    name: str,
    kind: str = "logo",
    admin: str = "admin",
) -> Optional[str]:
    """Admin confirms an existing library file as accurate (no re-upload)."""
    kind = (kind or "logo").lower()
    if kind == "logo":
        path = find_local_logo(name)
    else:
        path = find_local_face(name)
    if not path:
        return None
    write_asset_trust(path, source="confirmed", by=admin or "admin")
    return path


def seed_high_value_logos() -> list[str]:
    """Best-effort seed of common org logos. Returns list of saved paths."""
    targets = [
        ("SEC", "sec.gov"),
        ("Hyperliquid", "hyperliquid.xyz"),
        ("Binance", "binance.com"),
        ("Coinbase", "coinbase.com"),
        ("Federal Reserve", "federalreserve.gov"),
        ("BlackRock", "blackrock.com"),
        ("Ethereum", "ethereum.org"),
        ("CFTC", "cftc.gov"),
    ]
    saved = []
    for name, domain in targets:
        path = resolve_logo(name, domain=domain)
        if path:
            saved.append(path)
    return saved
