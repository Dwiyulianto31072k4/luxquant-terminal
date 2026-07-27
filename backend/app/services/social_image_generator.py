"""
Social AI Image Generator

Instagram-ready AI backgrounds for social posts, then composed into an editorial
card on the shared social-card design system (Poppins, gold accent, CTA).

Quality-first + cost-efficient defaults (2026):
  - Primary image model: OpenAI gpt-image-2 @ medium, 1024x1536 (~$0.04/img)
  - Fallback: xAI Grok Imagine if OPENAI_API_KEY missing
  - Max 1 paid image API call per draft (SOCIAL_CHEAP_MODE)
  - Caption/chat stays on xAI Grok (separate, cheaper tokens)
"""

from __future__ import annotations

import base64
import contextvars
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)


ASSETS_DIR = Path(os.environ.get("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts"))
# gpt-image-2 + medium + portrait = best quality/cost for social posters
OPENAI_IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")
# Chosen per click, not per deploy: the same poster costs $0.013 on the mini
# model and $0.19 at high quality, so the choice belongs to whoever is looking
# at the draft. A context var carries it instead of threading a parameter
# through six call sites; generate_ai_social_image sets it for its own call.
IMAGE_MODELS_ALLOWED = ("gpt-image-1-mini", "gpt-image-2", "gpt-image-1.5", "gpt-image-1")
IMAGE_QUALITIES_ALLOWED = ("low", "medium", "high")
_IMAGE_OVERRIDE = contextvars.ContextVar("social_image_override", default=None)
OPENAI_IMAGE_SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "1024x1536")
OPENAI_IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "medium")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
IMAGE_TIMEOUT = int(os.environ.get("SOCIAL_IMAGE_TIMEOUT", "180"))


def _image_model() -> str:
    """The override is validated where it is set; validated here too, because
    an unknown id reaching the API is a charge at a rate we cannot price."""
    picked = (_IMAGE_OVERRIDE.get() or {}).get("model")
    return picked if picked in IMAGE_MODELS_ALLOWED else OPENAI_IMAGE_MODEL


def _image_quality() -> str:
    picked = (_IMAGE_OVERRIDE.get() or {}).get("quality")
    return picked if picked in IMAGE_QUALITIES_ALLOWED else OPENAI_IMAGE_QUALITY


@dataclass
class GeneratedSocialImage:
    image_path: Optional[str]
    image_mode: str
    image_prompt: Optional[str]
    reference_image_url: Optional[str] = None
    reference_image_path: Optional[str] = None
    error_message: Optional[str] = None
    # Visual materials inventory (entities, missing uploads, qc flags)
    visual_materials: Optional[dict] = None


def _safe_slug(value: str, fallback: str = "social") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return (slug or fallback)[:90]


def _clean_prompt_text(value: Optional[str], limit: int = 900) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    return value[:limit]


def _reference_ext(url: str, content_type: str = "") -> str:
    path = urlparse(url).path.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    if "png" in content_type:
        return ".png"
    if "webp" in content_type:
        return ".webp"
    return ".jpg"


def download_reference_image(url: Optional[str], *, news_id: int) -> Optional[str]:
    if not url:
        return None
    try:
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        headers = {"User-Agent": "Mozilla/5.0 (compatible; LuxQuantBot/1.0)"}
        response = requests.get(url, headers=headers, timeout=25)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            return None
        if len(response.content) < 12_000:
            return None
        ext = _reference_ext(url, content_type)
        path = ASSETS_DIR / f"ref_{news_id}{ext}"
        path.write_bytes(response.content)
        return str(path)
    except Exception:
        return None


# The house style. Not just colour any more: the three posters the user picked
# out as "this is it" shared a shape, not a palette — a large 3D hero object
# anchoring the story (a wall-mounted mark, a pedestal product, storage tanks),
# a person standing in for the institution, a hall with real depth, crimson
# practical light, one warm lamp, a glossy floor holding the reflection.
#
# It goes FIRST in the prompt and it owns lighting outright, because the
# editorial scene line used to open with "soft natural daylight from a large
# window" and whatever is said first wins.
BRAND_VISUAL_SIGNATURE = "\n".join([
    "LUXQUANT HOUSE STYLE — identical in every poster. This is what makes the feed one family.",
    "- Look: cinematic 3D product-render realism. Physically-based materials, true reflections, "
    "contact shadows, fine grain. No illustration, no flat vector.",
    "- World: a dark interior with real depth — hall, corridor, plant floor, stage. Near-black "
    "#0A0506 falling into dark maroon #241014. Never daylight, never a flat backdrop.",
    "- HERO OBJECT: build the story's one physical element LARGE and solid in 3D — a backlit sign or "
    "moulded emblem on the far wall, a product on a lit pedestal, a machine, storage tanks. It says "
    "what the story is at a glance, so it must read solid, never a flat sticker or a ghost.",
    "- PERSON, when the story has one: centred, standing in for the institution, half to full body, "
    "medium distance, calm. Not a floating head, not a silhouette that disappears.",
    "- Light is PRACTICAL, inside the scene, never a filter over the frame: crimson #BE001C from LED "
    "strips, screens, signage and cove light; a crimson rim on the hero's edges; low red haze at the "
    "floor; red glints on glass, metal and the polished floor, which holds a soft reflection.",
    "- Exactly ONE warm-gold accent #FCD535 — a desk lamp, a lit edge, one monitor glow.",
    "- Faces, skin tones and real brand colours stay accurate; the red lives on edges, in shadow and "
    "in background light. Warm any blue or teal setting to crimson. No cyan, no purple.",
    "- Frame: vertical 4:5, hero in the upper two thirds, lower 35-40% dark and free of detail — the "
    "headline is composited there.",
])


# The attach list is the other half of consistency. Same style references every
# time -> same look every time; that is what the reference kit is for.
STYLE_KIT_NOTE = (
    "your 2-3 approved posters as a fixed STYLE KIT — copy their light, depth, materials and mood, "
    "and ignore their subject, their text and any mark on them. Attach the SAME ones every time: one "
    "reused set is what makes ten posters look like one shoot"
)

# Lighting written into the story line is what broke the look: it opened the
# prompt, so it beat the house style that followed, and every story got a
# different one. New drafts no longer contain it; this cleans the ones written
# before that rule changed.
#
# Clause-level, not sentence-level. A first pass deleted whole sentences and
# took the subject with them — "Modern data center interior with rows of server
# racks under soft overhead lighting" is the subject AND the light in one line.
import re as _re

_LIGHT_SENTENCE = _re.compile(
    r"^\s*(soft|cool|warm|natural|ambient|dramatic|subtle|bright|dim|institutional|overhead)?\s*"
    r"[\w\s]{0,40}?(lighting|daylight|illumination|light source)\b",
    _re.I,
)
_LIGHT_VERB = _re.compile(
    r"\b(creates?|casts?|fills?|bathes?|illuminates?|adds?|gives?|produces?|emphasi[sz]es?)\b",
    _re.I,
)
_LIGHT_CLAUSE = _re.compile(
    r"(,\s*|\s+)(under|with|in|beneath|lit by|bathed in)\s+[^,.;]{0,24}?"
    r"(lighting|daylight|light|glow|illumination)\b",
    _re.I,
)
_LIGHT_TAIL = _re.compile(
    r",\s*[^,.;]{0,60}?(atmosphere|mood|contrast|depth of field|bokeh|shadows?|daylight"
    r"|lighting|illuminating|light)\b[^,.;]*",
    _re.I,
)


def strip_lighting(scene: str) -> str:
    """Remove light/mood description while keeping the subject it was glued to."""
    out = []
    for part in _re.split(r"(?<=[.!?])\s+", scene or ""):
        part = part.strip()
        if not part:
            continue
        # Drop the sentence only when the light IS the subject ("Cool blue
        # lighting creates a calm atmosphere") — not merely mentioned in it, or
        # "A vault door under soft overhead lighting" loses the vault door.
        if _LIGHT_SENTENCE.match(part) and _LIGHT_VERB.search(part):
            continue
        part = _LIGHT_CLAUSE.sub("", part)
        part = _LIGHT_TAIL.sub("", part)
        part = _re.sub(r"\s+([,.])", r"\1", part).strip()
        if len(part.split()) >= 3:
            out.append(part if part.endswith((".", "!", "?")) else part + ".")
    return " ".join(out).strip()


def build_visual_prompt(
    *,
    headline: str,
    article_summary: str,
    source_domain: Optional[str],
    angle: Optional[str],
    reference_image_url: Optional[str] = None,
) -> str:
    source = source_domain or "crypto news source"
    angle_label = (angle or "news_brief").replace("_", " ")
    context = _clean_prompt_text(article_summary, 900)
    reference_line = (
        "Use the provided reference image only for broad visual context and mood; create a new original image."
        if reference_image_url else
        "Infer a cinematic crypto-media poster from the story."
    )

    # Same order as the manual brief: house style first, story second. Whatever
    # opens the prompt wins, and what must never vary is the style.
    return "\n".join([
        BRAND_VISUAL_SIGNATURE,
        "",
        "THIS STORY — the only part that changes between posters:",
        f"DEPICT THE SPECIFIC EVENT — the actual who / what / where, not a generic crypto backdrop. "
        f"Story context (inspire the scene, never paint as text): {context}",
        f"Source: {source}. Angle: {angle_label}. Headline (never paint these words, but the scene must "
        f"clearly match it): {headline}.",
        reference_line,
        "One continuous real-world scene a Bloomberg photo editor would approve — architecture, "
        "institution, person, product or market floor. Not surreal crypto meme art.",
        "AVOID: readable text or wordmarks anywhere in frame, invented logos, red subtitle bars, "
        "watermarks, collage seams, chains-on-books, floating holograms, raining money.",
    ])


def _decode_openai_image(payload: dict) -> bytes:
    data = (payload.get("data") or [{}])[0]
    if data.get("b64_json"):
        return base64.b64decode(data["b64_json"])
    if data.get("url"):
        response = requests.get(data["url"], timeout=60)
        response.raise_for_status()
        return response.content
    raise RuntimeError("OpenAI image response did not include b64_json or url")


def _openai_headers() -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return {"Authorization": f"Bearer {api_key}"}


def _resolve_image_provider() -> str:
    """Prefer GPT Image 2 when key present; else xAI. Env can force either."""
    pref = os.environ.get("SOCIAL_IMAGE_PROVIDER", "auto").strip().lower()
    has_oai = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    has_xai = bool(os.environ.get("XAI_API_KEY", "").strip())
    if pref in ("openai", "gpt", "gpt-image-2", "gpt-image-1"):
        if has_oai:
            return "openai"
        logger.warning("SOCIAL_IMAGE_PROVIDER=%s but OPENAI_API_KEY missing", pref)
    if pref == "xai":
        if has_xai:
            return "xai"
        logger.warning("SOCIAL_IMAGE_PROVIDER=xai but XAI_API_KEY missing")
    # auto: quality-first OpenAI gpt-image-2, then Grok
    if has_oai:
        return "openai"
    if has_xai:
        return "xai"
    return "none"


def _extract_usage(payload: dict) -> dict:
    """Normalize usage dict from OpenAI / xAI image responses."""
    if not isinstance(payload, dict):
        return {}
    usage = payload.get("usage")
    if isinstance(usage, dict) and usage:
        return usage
    # Some gateways nest under data
    data0 = (payload.get("data") or [{}])[0]
    if isinstance(data0, dict) and isinstance(data0.get("usage"), dict):
        return data0["usage"]
    return {}


def _merge_usage(a: Optional[dict], b: Optional[dict]) -> dict:
    a = a or {}
    b = b or {}
    out = dict(a)
    for k, v in b.items():
        if isinstance(v, (int, float)) and isinstance(out.get(k), (int, float)):
            out[k] = int(out[k]) + int(v)
        elif k not in out:
            out[k] = v
        elif isinstance(v, dict) and isinstance(out.get(k), dict):
            merged = dict(out[k])
            for sk, sv in v.items():
                if isinstance(sv, (int, float)) and isinstance(merged.get(sk), (int, float)):
                    merged[sk] = int(merged[sk]) + int(sv)
                else:
                    merged[sk] = sv
            out[k] = merged
    return out


def _generate_openai_image(prompt: str, out_path: Path) -> dict:
    """Returns usage dict from API (may be empty)."""
    payload = {
        "model": _image_model(),
        "prompt": prompt,
        "size": OPENAI_IMAGE_SIZE,
        "quality": _image_quality(),
        "n": 1,
    }
    payload["response_format"] = "b64_json"
    response = requests.post(
        f"{OPENAI_BASE_URL.rstrip('/')}/images/generations",
        headers={**_openai_headers(), "Content-Type": "application/json"},
        json=payload,
        timeout=IMAGE_TIMEOUT,
    )
    if response.status_code >= 400 and "response_format" in payload:
        payload.pop("response_format", None)
        response = requests.post(
            f"{OPENAI_BASE_URL.rstrip('/')}/images/generations",
            headers={**_openai_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=IMAGE_TIMEOUT,
        )
    response.raise_for_status()
    body = response.json()
    out_path.write_bytes(_decode_openai_image(body))
    return _extract_usage(body)


def _edit_openai_image(prompt: str, reference_path: str, out_path: Path) -> dict:
    """Identity/brand edit via OpenAI images/edits. Returns usage dict."""
    ref = Path(reference_path)
    mime = "image/png"
    file_name = ref.name
    suf = ref.suffix.lower()
    if suf in (".jpg", ".jpeg"):
        mime = "image/jpeg"
    elif suf == ".webp":
        mime = "image/webp"
    with open(reference_path, "rb") as image_file:
        files = {"image": (file_name, image_file, mime)}
        data = {
            "model": _image_model(),
            "prompt": prompt,
            "size": OPENAI_IMAGE_SIZE,
            "quality": _image_quality(),
            "n": "1",
        }
        response = requests.post(
            f"{OPENAI_BASE_URL.rstrip('/')}/images/edits",
            headers=_openai_headers(),
            data=data,
            files=files,
            timeout=IMAGE_TIMEOUT,
        )
    response.raise_for_status()
    body = response.json()
    out_path.write_bytes(_decode_openai_image(body))
    return _extract_usage(body)


def _edit_image(prompt: str, reference_path: str, out_path: Path, *, provider: str) -> dict:
    if provider == "openai":
        return _edit_openai_image(prompt, reference_path, out_path)
    return _edit_xai_image(prompt, reference_path, out_path, aspect_ratio="3:4") or {}


def _generate_image(prompt: str, out_path: Path, *, provider: str) -> dict:
    if provider == "openai":
        return _generate_openai_image(prompt, out_path)
    return _generate_xai_image(prompt, out_path) or {}


def _font(size: int, bold: bool = False):
    from PIL import ImageFont

    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in paths:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _cover_image(img, size: tuple[int, int]):
    target_w, target_h = size
    scale = max(target_w / img.width, target_h / img.height)
    new_size = (int(img.width * scale), int(img.height * scale))
    img = img.resize(new_size)
    left = max(0, (img.width - target_w) // 2)
    top = max(0, (img.height - target_h) // 2)
    return img.crop((left, top, left + target_w, top + target_h))


# ── xAI (Grok) image generation + prototype editorial renderer ──────────
XAI_API_BASE = os.environ.get("XAI_API_BASE", "https://api.x.ai/v1")
XAI_IMAGE_MODEL = os.environ.get("XAI_IMAGE_MODEL", "grok-imagine-image-quality")
XAI_IMAGE_EDIT_MODEL = os.environ.get("XAI_IMAGE_EDIT_MODEL", "grok-imagine-image-quality")
XAI_IMAGE_TIMEOUT = int(os.environ.get("XAI_IMAGE_TIMEOUT", "280"))
# Legacy env name still read via _resolve_image_provider(); default is "auto"
# Curated library of real face photos keyed by slug, e.g. faces/vitalik-buterin.jpg.
# When a story's featured_person matches a file here, the image is generated via
# xAI image-edit conditioned on that photo so the likeness is accurate.
SOCIAL_FACE_DIR = Path(os.environ.get("SOCIAL_FACE_DIR", str(ASSETS_DIR / "faces")))
# Social-card design tokens. The news image and the render_*.py cards are one
# family now, so the values live in one place and are copied from those files:
# Poppins, cream headline, gold accent, muted web grey.
SOCIAL_FONT_DIR = Path(os.environ.get("SOCIAL_FONT_DIR", "/opt/luxquant/fonts"))
SOCIAL_LOCKUP_PATH = Path(
    os.environ.get("SOCIAL_LOCKUP_PATH", str(ASSETS_DIR / "lux_lockup.png"))
)
CARD_GOLD = (252, 213, 53)       # #FCD535
CARD_CREAM = (247, 240, 226)     # #F7F0E2
CARD_WEB = (195, 181, 166)       # #c3b5a6
CARD_BASE_DARK = (10, 5, 6)      # #0A0506 — the cards' floor colour
# Cream over the scrim must clear this. The cards sit near 17:1 on their own
# background; 9:1 keeps that character while leaving dark photos untouched.
CARD_CONTRAST_FLOOR = 9.0
CARD_CTA_LEAD = os.environ.get(
    "SOCIAL_CTA_LEAD", "Read daily crypto & finance news at"
)
CARD_DOMAIN = os.environ.get("SOCIAL_CARD_DOMAIN", "luxquant.tw")
CARD_HANDLE = os.environ.get("SOCIAL_CARD_HANDLE", "@luxquantcrypto")
# Cheap mode: hard-cap paid image API calls per draft (default 1 — no face+brand double hit).
CHEAP_MODE = os.environ.get("SOCIAL_CHEAP_MODE", "1").strip().lower() not in ("0", "false", "no")
IMAGE_MAX_CALLS = int(os.environ.get("SOCIAL_IMAGE_MAX_CALLS", "1" if CHEAP_MODE else "2"))
# Second brand-edit pass is expensive (~+$0.05). Off by default in cheap mode.
BRAND_SECOND_PASS = os.environ.get(
    "SOCIAL_BRAND_SECOND_PASS",
    "0" if CHEAP_MODE else "1",
).strip().lower() not in ("0", "false", "no")


def _slugify_name(name: str) -> str:
    """'Vitalik Buterin, Ethereum co-founder' -> 'vitalik-buterin'."""
    base = re.split(r"[,(]", name or "", 1)[0]
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")


def resolve_face_reference(featured_person: Optional[str]) -> Optional[str]:
    """Return the path to a cached face photo for this person, or None."""
    slug = _slugify_name(featured_person or "")
    if not slug:
        return None
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        path = SOCIAL_FACE_DIR / f"{slug}{ext}"
        if path.exists():
            return str(path)
    return None


# Auto-fetch a portrait from Wikipedia when a figure isn't cached yet. Wikipedia's
# lead image is identity-reliable (the page for a name shows that person), unlike a
# generic image search that could return the wrong face.
# Default off: safe materials mode prefers admin-uploaded portraits over wiki scrapes.
FACE_AUTOFETCH = os.environ.get("SOCIAL_FACE_AUTOFETCH", "0").strip().lower() not in ("0", "false", "no", "")
WIKI_SUMMARY_API = os.environ.get("SOCIAL_WIKI_API", "https://en.wikipedia.org/api/rest_v1/page/summary/")
FACE_MISS_TTL = int(os.environ.get("SOCIAL_FACE_MISS_TTL", str(14 * 24 * 3600)))


def fetch_face_reference(featured_person: Optional[str]) -> Optional[str]:
    """Best-effort: download a public figure's Wikipedia portrait and cache it in the
    face library for reuse. Returns the saved path, or None. Never raises."""
    import time
    import urllib.parse

    name = re.split(r"[,(]", featured_person or "", 1)[0].strip()
    slug = _slugify_name(name)
    if not slug or not name:
        return None
    miss_marker = SOCIAL_FACE_DIR / f"{slug}.miss"
    try:
        if miss_marker.exists() and (time.time() - miss_marker.stat().st_mtime) < FACE_MISS_TTL:
            return None
    except Exception:
        pass

    def _mark_miss() -> None:
        try:
            SOCIAL_FACE_DIR.mkdir(parents=True, exist_ok=True)
            miss_marker.write_text("")
        except Exception:
            pass

    try:
        SOCIAL_FACE_DIR.mkdir(parents=True, exist_ok=True)
        title = urllib.parse.quote(name.replace(" ", "_"), safe="")
        headers = {"User-Agent": "LuxQuantBot/1.0 (editorial news illustration)"}
        resp = requests.get(f"{WIKI_SUMMARY_API}{title}", headers=headers, timeout=20)
        if resp.status_code != 200:
            _mark_miss()
            return None
        data = resp.json()
        if data.get("type") == "disambiguation":
            _mark_miss()
            return None
        img_url = (data.get("originalimage") or {}).get("source") or (data.get("thumbnail") or {}).get("source")
        if not img_url:
            _mark_miss()
            return None
        img = requests.get(img_url, headers=headers, timeout=25)
        img.raise_for_status()
        ctype = img.headers.get("content-type", "")
        if not ctype.startswith("image/") or len(img.content) < 8_000:
            _mark_miss()
            return None
        ext = ".png" if "png" in ctype else ".webp" if "webp" in ctype else ".jpg"
        path = SOCIAL_FACE_DIR / f"{slug}{ext}"
        path.write_bytes(img.content)
        return str(path)
    except Exception:
        _mark_miss()
        return None


def _edit_xai_image(
    prompt: str,
    reference_path: str,
    out_path: Path,
    *,
    aspect_ratio: str = "3:4",
) -> dict:
    """xAI image-edit. Returns usage dict when present."""
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        raise RuntimeError("XAI_API_KEY is not configured")
    with open(reference_path, "rb") as handle:
        b64 = base64.b64encode(handle.read()).decode("utf-8")
    ext = Path(reference_path).suffix.lstrip(".").lower() or "png"
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    payload = {
        "model": XAI_IMAGE_EDIT_MODEL,
        "prompt": prompt,
        "image": {"url": f"data:image/{mime};base64,{b64}", "type": "image_url"},
        "response_format": "b64_json",
    }
    if aspect_ratio:
        payload["aspect_ratio"] = aspect_ratio
    response = requests.post(
        f"{XAI_API_BASE.rstrip('/')}/images/edits",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=XAI_IMAGE_TIMEOUT,
    )
    if response.status_code >= 400 and aspect_ratio:
        payload.pop("aspect_ratio", None)
        response = requests.post(
            f"{XAI_API_BASE.rstrip('/')}/images/edits",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=XAI_IMAGE_TIMEOUT,
        )
    response.raise_for_status()
    body = response.json()
    item = (body.get("data") or [{}])[0]
    if item.get("b64_json"):
        out_path.write_bytes(base64.b64decode(item["b64_json"]))
        return _extract_usage(body)
    if item.get("url"):
        img = requests.get(item["url"], timeout=120)
        img.raise_for_status()
        out_path.write_bytes(img.content)
        return _extract_usage(body)
    raise RuntimeError("xAI image edit response missing b64_json/url")


def _generate_xai_image(prompt: str, out_path: Path) -> dict:
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        raise RuntimeError("XAI_API_KEY is not configured")
    response = requests.post(
        f"{XAI_API_BASE.rstrip('/')}/images/generations",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": XAI_IMAGE_MODEL,
            "prompt": prompt,
            "n": 1,
            "aspect_ratio": "3:4",
            "response_format": "b64_json",
        },
        timeout=XAI_IMAGE_TIMEOUT,
    )
    response.raise_for_status()
    body = response.json()
    item = (body.get("data") or [{}])[0]
    if item.get("b64_json"):
        out_path.write_bytes(base64.b64decode(item["b64_json"]))
        return _extract_usage(body)
    if item.get("url"):
        img = requests.get(item["url"], timeout=120)
        img.raise_for_status()
        out_path.write_bytes(img.content)
        return _extract_usage(body)
    raise RuntimeError("xAI image response missing b64_json/url")


def _smoothstep(edge0: float, edge1: float, value: float) -> float:
    value = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return value * value * (3.0 - 2.0 * value)


def _apply_editorial_shadow(img):
    """Natural bottom + vignette gradient (ported from prototype compose_card)."""
    from PIL import Image, ImageFilter

    width, height = img.size
    alpha = Image.new("L", (width, height), 0)
    px = alpha.load()
    cx = (width - 1) / 2
    for y in range(height):
        ty = y / (height - 1)
        lower = _smoothstep(0.42, 1.0, ty)
        floor = _smoothstep(0.74, 1.0, ty)
        for x in range(width):
            tx = abs((x - cx) / cx)
            side = _smoothstep(0.55, 1.0, tx) * floor
            px[x, y] = int(min(202, 3 + 132 * (lower ** 1.45) + 46 * (floor ** 2.2) + 28 * side))
    alpha = alpha.filter(ImageFilter.GaussianBlur(28))
    shade = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shade.putalpha(alpha)
    return Image.alpha_composite(img, shade)


# Identity-first pipeline: face edit alone, then optional brand pass.
# Dual face|logo collage refs destroy likeness — never use them.
IDENTITY_LOCK_PREFIX = (
    "CRITICAL IDENTITY LOCK (highest priority — override every other instruction): "
    "The person in the output MUST be the EXACT same individual as in the reference photograph — "
    "true 1:1 facial match. Preserve face shape, eyes, eyelids, eyebrows, nose, mouth, lips, jaw, "
    "chin, ears, cheekbones, skin tone, age, hairline, hair color/style, glasses frame shape and "
    "lenses, moles/marks, and facial proportions. "
    "Do NOT invent a different person, a generic lookalike, a stock Asian male, or an AI-reimagined face. "
    "Do NOT beautify or age-shift. Start from THIS reference face and only change clothing, pose, "
    "camera framing, and background as needed for the scene. "
)

BRAND_PASS_FACE_LOCK = (
    "CRITICAL: Keep the person's face EXACTLY as already shown in the input image — "
    "zero identity change, no new face, no re-draw of features. "
    "Only modify background, props, and brand elements. "
)


def _prepare_face_reference(face_path: str, *, news_id: int) -> str:
    """Normalize admin face upload for edit: full portrait, no aggressive crop.

    Letterbox onto a clean square so the model sees the whole head/shoulders
    (cover-crop was clipping faces and hurting identity lock).
    """
    from PIL import Image

    try:
        img = Image.open(face_path).convert("RGB")
    except Exception:
        return face_path

    # Already a decent portrait file — only re-export if huge or tiny
    w, h = img.size
    side = max(w, h)
    # Pad to square with neutral gray (not black) so edges don't dominate
    canvas = Image.new("RGB", (side, side), (236, 236, 238))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    # Cap size for API payload
    max_side = 1536
    if side > max_side:
        canvas.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    out = ASSETS_DIR / f"ref_face_{news_id}.jpg"
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(out, quality=95, optimize=True)
    return str(out)


def _brand_allowlist_clause(verified_names: list[str]) -> str:
    """Hard rule: only admin-verified brand marks may appear."""
    if not verified_names:
        return (
            "BRAND MARK RULE (critical): Do NOT draw any corporate logos, exchange marks, "
            "protocol emblems, bank wordmarks, or tickers (no Hyperliquid, no HYPE, no Coinbase C, "
            "no Circle, no JPMorgan wordmark, no invented symbols). Use only abstract environment."
        )
    allowed = ", ".join(verified_names)
    return (
        f"BRAND MARK RULE (critical): The ONLY brand logos/wordmarks/emblems allowed in the image are: "
        f"{allowed}. "
        "Do NOT invent, approximate, or hallucinate any other brand mark — especially not Hyperliquid, "
        "HYPE token, Circle, rival exchanges, or banks that are not in that allow-list. "
        "If a company is part of the story but its mark is not allowed, show it only via abstract "
        "architecture/lighting with zero readable logo."
    )


def _identity_face_prompt(
    scene_prompt: str,
    *,
    brand: Optional[str] = None,
    verified_brand_names: Optional[list] = None,
) -> str:
    """Build face-only edit prompt: identity first, rational scene second."""
    names = list(verified_brand_names or [])
    if brand and brand not in names:
        names = [brand] + names
    parts = [
        IDENTITY_LOCK_PREFIX,
        "Task: Transform the reference photograph into a premium financial-news vertical Instagram poster "
        "while keeping the same person's face 1:1.",
        "The hero subject is a large chest-up or three-quarter portrait of THIS exact person "
        "in the upper/middle frame, in a plausible professional setting for the story.",
        f"Scene direction (do not change identity for these): {scene_prompt}",
        _brand_allowlist_clause(names),
        "Avoid surreal crypto clichés (chains on books, floating holograms, raining money).",
    ]
    if names:
        parts.append(
            f"Verified brands for environment only (no invented marks): {', '.join(names)}."
        )
    parts.append(
        "Lower third darker for later headline typography. "
        "No readable text, slogans, captions, or watermarks on any surface."
    )
    return " ".join(parts)


def _brand_pass_prompt(
    scene_prompt: str,
    *,
    verified_brand_names: list[str],
) -> str:
    """Second edit: inject ONLY verified brands; never invent missing ones (e.g. HYPE)."""
    allowed = ", ".join(verified_brand_names) if verified_brand_names else "(none)"
    return (
        f"{BRAND_PASS_FACE_LOCK}"
        f"Integrate ONLY these official verified brands as physical scene elements: {allowed}. "
        "Place marks as wall signage, product emblems, desk objects, or architectural elements — "
        "accurate geometry, not tiny corner stickers. "
        f"{_brand_allowlist_clause(verified_brand_names)} "
        f"Keep composition cinematic vertical poster. Context: {scene_prompt[:400]} "
        "No readable body text, no caption bars."
    )


def _prepare_logos_sheet(logo_paths: list[str], *, news_id: int) -> Optional[str]:
    """Optional multi-logo plate for brand pass (logos only — never mixed with face)."""
    from PIL import Image

    paths = [p for p in logo_paths if p and Path(p).exists()][:4]
    if not paths:
        return None
    try:
        tiles = []
        for p in paths:
            im = Image.open(p).convert("RGBA")
            im.thumbnail((320, 320), Image.Resampling.LANCZOS)
            tiles.append(im)
        n = len(tiles)
        cell = 360
        cols = min(2, n)
        rows = (n + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * cell), (250, 250, 252))
        for i, im in enumerate(tiles):
            r, c = divmod(i, cols)
            x = c * cell + (cell - im.width) // 2
            y = r * cell + (cell - im.height) // 2
            sheet.paste(im, (x, y), im)
        out = ASSETS_DIR / f"ref_logos_{news_id}.jpg"
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        sheet.save(out, quality=95)
        return str(out)
    except Exception:
        return None


def _card_font(size: int, weight: str = "Bold"):
    """Poppins if present, DejaVu otherwise — the card must still render on a
    host that never got the font drop."""
    from PIL import ImageFont

    for cand in (
        SOCIAL_FONT_DIR / f"Poppins-{weight}.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ):
        try:
            if cand.exists():
                return ImageFont.truetype(str(cand), size)
        except Exception:
            continue
    return _font(size, bold=True)


def _card_luminance(rgb) -> float:
    def chan(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (chan(c) for c in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _card_contrast(a, b) -> float:
    la, lb = _card_luminance(a), _card_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# ── icons ──────────────────────────────────────────────────────────────
# The cards inline these as SVG. PIL has no SVG, so they are drawn — kept to
# the same 24-unit grid as the source paths so proportions carry over.

# The real X mark, as the two polygons of the official logo path
# (`M18.244 2.25h3.308l-7.227 8.26 ... z` — the same `d` the cards inline).
# Every segment is straight, so the path needs no curve support: subpath one is
# the mark, subpath two is the notch that cuts the thin stroke's corners.
# Two crossed lines were NOT this logo — the real mark has mitred, tapering ends.
_X_MARK_OUTER = [
    (18.244, 2.25), (21.552, 2.25), (14.325, 10.51), (22.827, 21.75),
    (16.170, 21.75), (10.956, 14.933), (4.990, 21.75), (1.680, 21.75),
    (9.410, 12.915), (1.254, 2.25), (8.080, 2.25), (12.793, 8.481),
]
_X_MARK_NOTCH = [
    (17.083, 19.77), (18.916, 19.77), (7.084, 4.126), (5.117, 4.126),
]


def _card_x_icon(img, x, y, size, colour):
    """Paste the real X logo at (x, y), `size` px on a side.

    Takes the image rather than a draw handle because the notch is a hole: it is
    cut out of an alpha mask, not painted in a background colour — the icon sits
    on a photo, so anything painted opaque would show as a coloured wedge.
    Rasterised 4x and downsampled, since a 21px mark drawn at 1x has visibly
    ragged diagonals.
    """
    from PIL import Image, ImageDraw

    ss = 4
    box = int(size * ss)
    mask = Image.new("L", (box, box), 0)
    md = ImageDraw.Draw(mask)
    scale = box / 24.0
    md.polygon([(px * scale, py * scale) for px, py in _X_MARK_OUTER], fill=255)
    md.polygon([(px * scale, py * scale) for px, py in _X_MARK_NOTCH], fill=0)
    mask = mask.resize((int(size), int(size)), Image.Resampling.LANCZOS)
    if len(colour) == 4 and colour[3] < 255:
        mask = mask.point(lambda a: a * colour[3] // 255)
    layer = Image.new("RGBA", mask.size, tuple(colour[:3]) + (0,))
    layer.putalpha(mask)
    img.alpha_composite(layer, (int(x), int(y)))


def _card_globe_icon(draw, x, y, size, colour):
    """Globe: circle, equator, meridian — the card's stroke-width:2 on a
    24-unit box."""
    s = size / 24.0
    w = max(1, round(2 * s))
    r = 9 * s
    cx, cy = x + 12 * s, y + 12 * s
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colour, width=w)
    draw.line([(cx - r, cy), (cx + r, cy)], fill=colour, width=w)
    draw.ellipse([cx - r * 0.46, cy - r, cx + r * 0.46, cy + r],
                 outline=colour, width=w)


def _card_line_centre(font, text: str, y: float) -> float:
    """The vertical centre an icon should sit on beside a line of type.

    Cap/ascender top to baseline, descenders excluded. Centring on the raw ink
    box instead put the X mark visibly low next to "@luxquantcrypto", because
    the tails of y and p dragged the box down past the baseline.
    """
    ascent = font.getmetrics()[0]
    return (y + font.getbbox(text)[1] + y + ascent) / 2


def _card_measured_scrim(img, band_top: int, text_top: int, text_bottom: int):
    """Darken the headline band until cream type clears CARD_CONTRAST_FLOOR.

    Measure only where the type actually lands (text_top..text_bottom), but
    fade the scrim in from band_top so there is no visible edge. Sampling the
    whole lower half instead made every photo pay for brightness that sits
    nowhere near the text — a night skyline with one lit window got dimmed as
    hard as an overcast sky.
    """
    from PIL import Image, ImageDraw, ImageFilter

    width, height = img.size
    band = img.convert("RGB").crop((0, text_top, width, min(height, text_bottom)))
    band = band.resize((max(1, width // 12), max(1, band.height // 12)))
    pixels = list(band.getdata())
    # The brightest decile decides it: a mean would let a small blown-out patch
    # sit under the text unreadable while the average looked fine.
    pixels.sort(key=_card_luminance)
    hot = pixels[int(len(pixels) * 0.9)] if pixels else (0, 0, 0)

    alpha = 0
    while alpha < 235:
        mixed = tuple(int(c * (1 - alpha / 255)) for c in hot)
        if _card_contrast(CARD_CREAM, mixed) >= CARD_CONTRAST_FLOOR:
            break
        alpha += 5

    # Ramp to full strength by the time the type starts, then hold. Fading all
    # the way to the bottom meant the band only ever received ~55% of the alpha
    # the solver had committed to, so on a blown-out photo the safety net
    # under-delivered exactly when it was the only thing standing.
    scrim = Image.new("L", (width, height), 0)
    d = ImageDraw.Draw(scrim)
    ramp = max(1, text_top - band_top)
    for y in range(band_top, height):
        t = min(1.0, (y - band_top) / ramp)
        d.line([(0, y), (width, y)], fill=int(alpha * (t ** 0.65)))
    scrim = scrim.filter(ImageFilter.GaussianBlur(26))
    layer = Image.new("RGBA", (width, height), CARD_BASE_DARK + (0,))
    layer.putalpha(scrim)
    return Image.alpha_composite(img, layer), alpha


def _card_bottom_gradient(img, height_px: int = 460, peak: float = 0.72):
    """The cards' `.botgrad`, deepened.

    Theirs is 240px of transparent -> rgba(0,0,0,0.6) over an already-dark
    canvas. Here it sits over a photo and has to carry the whole floor, so it
    runs taller and lands closer to black.
    """
    from PIL import Image, ImageDraw

    width, height = img.size
    grad = Image.new("L", (width, height), 0)
    d = ImageDraw.Draw(grad)
    top = height - height_px
    for y in range(top, height):
        t = (y - top) / max(1, height_px)
        d.line([(0, y), (width, y)], fill=int(255 * peak * (t ** 1.5)))
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    layer.putalpha(grad)
    return Image.alpha_composite(img, layer)


# ── headline accent ────────────────────────────────────────────────────
# The cards put the coin in cream and the number in gold ($ESPORTS +109%). A
# headline has no such fixed slot, so the accent is found — and it is a phrase,
# not a word: one gold word ("Iraq") names an actor without saying what happened,
# so the reader still has to parse the whole line. A phrase carries the claim.
#
#   figure present  -> the quantity phrase      "Cut 4,800 Jobs" · "Pull In $69M"
#   short subject   -> subject + verb           "Iraq Rejects" · "DTCC Launches"
#   long subject    -> verb + object head       "Post First Weekly Inflows"


_CARD_FIGURE = re.compile(r"^[\$€£]?\d[\d,.]*[%kmbtKMBT]?$")
_CARD_YEAR = re.compile(r"^(19|20)\d\d$")
_CARD_TICKER = re.compile(r"^\$[A-Za-z]{2,10}$")

# Words that must never open or close a gold span — they read as a cut-off.
_CARD_EDGE_STOP = {
    "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "from",
    "with", "by", "as", "after", "before", "amid", "while", "over", "under",
    "into", "than", "that", "but", "since", "against", "about", "ahead",
    "during", "beyond", "between", "through", "among", "amongst", "per",
    "its", "his", "her", "their", "this", "these", "those", "is", "are", "was",
    "were", "be", "been", "will", "may", "could", "would", "should", "can",
}

# Units that belong to the number in front of them.
_CARD_UNITS = {
    "billion", "million", "trillion", "bn", "mn", "m", "k", "percent", "pct",
    "basis", "bps", "points", "point",
}

# Headline verbs. A closed list beats POS-guessing here: our feed writes in a
# narrow register, and a fixed list makes the accent predictable enough to
# review. Base forms only — inflections are matched by stripping s/es/ed/ing.
_CARD_VERBS = {
    "accumulate", "acquire", "add", "admit", "adopt", "agree", "allow", "appeal",
    "announce", "approve", "attract", "back", "ban", "beat", "blast", "block",
    "boost", "break", "burn", "buy", "call", "cancel", "charge", "claim",
    "clear", "climb", "close", "confirm", "conduct", "consider", "crash",
    "cut", "declare", "delay", "delist", "deliver", "deny", "deploy", "detail",
    "dip", "disrupt", "double", "drop", "ease", "end", "exceed", "expand",
    "expect", "extend", "face", "fall", "file", "fine", "fire", "forecast",
    "freeze", "fund", "gain", "halt", "halve", "hike", "hire", "hit", "hold",
    "indict", "integrate", "invest", "investigate", "issue", "join", "jump",
    "keep", "land", "launch", "lead", "leave", "lift", "list", "lose", "lower",
    "mandate", "meet", "merge", "mint", "miss", "move", "name", "open",
    "order", "outperform", "partner", "pass", "pause", "plan", "post", "price",
    "probe", "project", "propose", "pull", "push", "quit", "raise", "rally",
    "reach", "rebound", "recommend", "reclaim", "record", "recover", "refuse",
    "reject", "release", "remove", "require", "restart", "resume", "reaffirm",
    "respond", "reveal", "revise", "rise", "risk", "roll", "rule", "say",
    "secure", "seek", "seize", "sell", "send", "set", "settle", "sign", "sink",
    "slash", "slide", "slip", "slow", "slump", "soar", "spike", "stake",
    "stall", "start", "step", "sue", "surge", "tap", "target", "tease", "test",
    "threaten", "tighten", "top", "trail", "trigger", "trim", "tumble",
    "unlock", "unveil", "urge", "value", "vote", "warn", "weigh", "win",
    "withdraw", "report", "rival", "publish", "describe", "estimate",
}


def _card_bare(word: str) -> str:
    return word.strip(",.:;'\"()").lower()


def _card_is_verb(word: str) -> bool:
    w = _card_bare(word)
    if w in _CARD_VERBS:
        return True
    for suffix, cut in (("ies", 3), ("es", 2), ("s", 1), ("ed", 2), ("ing", 3)):
        if w.endswith(suffix) and len(w) > cut + 2:
            stem = w[:-cut]
            if stem in _CARD_VERBS or (stem + "e") in _CARD_VERBS:
                return True
    return False


def _card_figure_index(words):
    for i, w in enumerate(words):
        if _CARD_TICKER.match(_card_bare(w)) or _CARD_TICKER.match(w.strip(",.:;")):
            return i
    for i, w in enumerate(words):
        bare = w.strip(",.:;")
        if _CARD_FIGURE.match(bare) and not _CARD_YEAR.match(bare):
            return i
    return None


def _card_accent_span(words, max_words: int = 4):
    """Indices to set in gold. Empty when nothing carries the claim."""
    if len(words) < 3:
        return set()

    fig = _card_figure_index(words)
    if fig is not None:
        lo = hi = fig
        # The unit belongs to the number: "$1.6 Billion".
        if hi + 1 < len(words) and _card_bare(words[hi + 1]) in _CARD_UNITS:
            hi += 1
        # The noun it counts, but only when it closes the phrase — taking it
        # mid-phrase produced cuts like "2% Inflation" before "Target".
        nxt, after = hi + 1, hi + 2
        if nxt < len(words) and _card_bare(words[nxt]) not in _CARD_EDGE_STOP \
                and not _card_is_verb(words[nxt]) \
                and (after >= len(words) or _card_bare(words[after]) in _CARD_EDGE_STOP):
            hi = nxt
        # Reach left for the action. Cross a preposition only to land on a verb
        # ("Pull In $69M") — otherwise the span picks up an unrelated noun.
        if lo > 0 and _card_bare(words[lo - 1]) not in _CARD_EDGE_STOP:
            lo -= 1
        elif lo > 1 and _card_is_verb(words[lo - 2]):
            lo -= 2
        # A lone number says nothing: run right to the end of the phrase.
        while hi - lo + 1 < max_words and hi + 1 < len(words) \
                and lo == hi and _card_bare(words[hi + 1]) not in _CARD_EDGE_STOP:
            hi += 1
        return set(range(lo, hi + 1))

    verb = next((i for i, w in enumerate(words) if i and _card_is_verb(w)), None)
    if verb is None:
        # No verb we know: the opening actor plus one word is still better than
        # a lone word, as long as neither end is a fragment.
        start = 1 if _card_bare(words[0]) in {"the", "a", "an"} else 0
        end = start + 1
        while end + 1 < len(words) and _card_bare(words[end]) in _CARD_EDGE_STOP:
            end += 1
        return set(range(start, min(end + 1, len(words))))

    start = 1 if _card_bare(words[0]) in {"the", "a", "an"} else 0
    if verb - start + 1 <= max_words:
        # Subject + verb is the claim: "Iraq Rejects", "UK and France Announce".
        return set(range(start, verb + 1))

    # Subject too long to gold — highlighting five words of subject highlights
    # nothing. Gold the predicate instead: "Post First Weekly Inflows".
    hi = verb
    while hi + 1 < len(words) and hi - verb + 1 < max_words:
        if _card_bare(words[hi + 1]) in _CARD_EDGE_STOP:
            break
        hi += 1
    if hi + 1 < len(words) and _card_bare(words[hi + 1]) not in _CARD_EDGE_STOP:
        # Ran into the word cap mid-phrase — that reads as a cut. Fall back to
        # the verb and one word.
        hi = min(verb + 1, len(words) - 1)
    if hi == verb:
        # A lone verb is no better than a lone noun: use the opening actor.
        return set(range(start, min(start + 2, len(words))))
    return set(range(verb, hi + 1))


def _compose_editorial_card(
    raw_path: str,
    headline: str,
    out_path: str,
    *,
    entity_logos: Optional[list] = None,
    angle: Optional[str] = None,
) -> str:
    """The posted news image, on the social-card design system.

    WHY THE RED BOXES WENT
    ----------------------
    The stepped red/white boxes did two jobs at once: LuxQuant identity, and
    giving the type a readable backing on an unpredictable AI photo. The
    render_*.py social cards need no boxes because they own their canvas — a
    dark gradient they draw themselves. So porting that look means reproducing
    the *condition*, not copying pixels: guarantee the headline band is dark,
    then set the type straight onto it exactly as the cards do.

    A fixed scrim cannot make that guarantee — a bright sky and a night skyline
    land in completely different places. So the scrim is measured (see
    _card_measured_scrim): dark photos keep their detail, bright ones get pushed
    down only as far as they must.

    entity_logos / angle are ignored, kept for call-site compatibility: brands
    belong IN the AI raw scene (via reference edit), never as corner stickers.
    """
    del entity_logos, angle
    from PIL import Image, ImageDraw, ImageFilter

    width, height = 1080, 1350
    img = _cover_image(Image.open(raw_path).convert("RGB"), (width, height)).convert("RGBA")
    img = _apply_editorial_shadow(img)

    # Kept from the original renderer: sink the bottom-right corner so a
    # generator watermark (the Gemini / SynthID sparkle on bring-your-own
    # uploads) disappears under it, and the lockup reads on a darker patch.
    # Dropping this would quietly put other people's watermarks back on our
    # posts.
    corner = Image.new("L", (width, height), 0)
    ImageDraw.Draw(corner).ellipse(
        [width - 520, height - 520, width + 200, height + 220], fill=255)
    corner = corner.filter(ImageFilter.GaussianBlur(90))
    shade = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shade.putalpha(corner.point(lambda a: int(a * 0.92)))
    img = Image.alpha_composite(img, shade)

    img = _card_bottom_gradient(img)
    draw = ImageDraw.Draw(img)

    # ── headline ──────────────────────────────────────────────────────
    size = 64
    font = _card_font(size, "ExtraBold")
    widths = [900, 850, 780, 690]

    def wrap(fnt):
        words = (headline or "").replace("—", "-").split()
        out = []
        for w_max in widths:
            if not words:
                break
            line = [words.pop(0)]
            while words:
                if draw.textlength(" ".join(line + [words[0]]), font=fnt) > w_max:
                    break
                line.append(words.pop(0))
            out.append(line)
        if words and out:
            out[-1].extend(words)
        return out[:4]

    lines = wrap(font)
    while len(lines) > 3 and size > 46:
        size -= 4
        font = _card_font(size, "ExtraBold")
        lines = wrap(font)

    flat = [w for line in lines for w in line]
    accent = _card_accent_span(flat)

    line_h = int(size * 1.16)
    # Everything below the headline is placed from the card's edge inwards, and
    # measured where the type actually inks rather than where its box starts —
    # a box carries slack above the caps and below the baseline, which is what
    # made a "26px" gap read as almost nothing.
    #
    # The account line's ink clears the bottom by the same 58px everything
    # clears the left by, and the invitation sits with EQUAL ink gaps above and
    # below: it used to hug the account line while a wide band of gradient sat
    # between it and the headline, so it read as attached to the handle instead
    # of standing on its own.
    _f_cta_m = _card_font(25, "SemiBold")
    _f_row_m = _card_font(21, "ExtraBold")
    BREATH = 44
    foot_y = height - 58 - _f_row_m.getbbox(CARD_HANDLE)[3]
    cta_y = (foot_y + _f_row_m.getbbox(CARD_HANDLE)[1]
             - BREATH - _f_cta_m.getbbox(CARD_CTA_LEAD)[3])
    # The headline's last line inks lower than its box: measure that line, not
    # the box, or a line ending in a descender would crowd the invitation.
    _tail_ink = font.getbbox(" ".join(lines[-1]))[3] if lines else int(size * 1.1)
    y = (cta_y + _f_cta_m.getbbox(CARD_CTA_LEAD)[1]
         - BREATH - _tail_ink - (len(lines) - 1) * line_h)

    img, _alpha = _card_measured_scrim(img, height - 620, y - 24, foot_y + 40)
    draw = ImageDraw.Draw(img)

    idx = 0
    for line in lines:
        x = 58
        for word in line:
            colour = (CARD_GOLD if idx in accent else CARD_CREAM) + (255,)
            draw.text((x + 2, y + 2), word, font=font, fill=(0, 0, 0, 95))
            draw.text((x, y), word, font=font, fill=colour)
            x += draw.textlength(word + " ", font=font)
            idx += 1
        y += line_h

    # ── the bottom block ──────────────────────────────────────────────
    # Two lines, shaped like the Track Record card's footer: the invitation on
    # top with the address it sends you to, the account below it, the lockup at
    # the right holding both.
    #
    # No arrow. An arrow only points; the preposition says what to do with the
    # address — "read the news AT luxquant.tw" is a sentence, "news →" was a
    # gesture. Dropping it also freed the width the full wording needed: the
    # handle used to share this line, which is what forced the copy down to
    # three words.
    #
    # Gold stops at the headline. Everything here is cream — a second accent in
    # the footer competes with the accent carrying meaning three lines above.
    # Drawn into a 4x strip and downscaled, NOT straight onto the card. At 21-25px
    # every glyph advance lands on a whole pixel, and the rounding is not even:
    # measured on the card, letters sat 1-3px apart but "nt" sat 4px apart, wide
    # enough that "luxquant.tw" read as two words. The social cards never show
    # this because Chromium renders them at device_scale_factor=2 with subpixel
    # positioning — this does the same thing by hand.
    ink = CARD_CREAM + (255,)
    ss = 4
    strip_top = cta_y - 34
    strip_h = height - strip_top

    f_cta = _card_font(25 * ss, "SemiBold")
    f_dom = _card_font(25 * ss, "ExtraBold")
    f_row = _card_font(21 * ss, "ExtraBold")

    # The longest wording that still fits beside the lockup. Measured, not
    # assumed: a wider handle or a longer domain must shorten the copy, never
    # push it under the mark.
    lock_w, lock_h = 0, 50                       # .lockup{height:50px}
    if SOCIAL_LOCKUP_PATH.exists():
        lock = Image.open(SOCIAL_LOCKUP_PATH).convert("RGBA")
        lock_w = int(lock.width * lock_h / lock.height)
        lock = lock.resize((lock_w, lock_h), Image.Resampling.LANCZOS)
        lock.putalpha(lock.getchannel("A").point(lambda a: int(a * 0.95)))
        # Centred across both lines, so each one is anchored on the right.
        img.alpha_composite(lock, (width - lock_w - 58,
                                   (cta_y + foot_y + 30 - lock_h) // 2))

    strip = Image.new("RGBA", (width * ss, strip_h * ss), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)

    # An icon sits label-close to its text, so the gap is specified INK to INK,
    # not box to box. Both icons leave empty space inside their square — the X
    # path stops at 22.8 of 24, the globe circle at 21 — and the glyph after it
    # carries its own left bearing, so a 12px box gap measured 14-15px on the
    # card. Stated as ink, 9px is 9px.
    GAP = 9 * ss
    icon = 21 * ss
    X_INK_RIGHT, GLOBE_INK_RIGHT = 22.827 / 24, 21 / 24

    tail = 16 * ss + icon + GAP + sd.textlength(CARD_DOMAIN, font=f_dom)
    room = (width - 58 - (lock_w + 58 + 44 if lock_w else 58)) * ss - tail
    lead = next(
        (c for c in (CARD_CTA_LEAD, "Read daily crypto news at",
                     "Read the daily news at", "Daily news at")
         if sd.textlength(c, font=f_cta) <= room),
        "Daily news at",
    )

    cta_row = (cta_y - strip_top) * ss
    foot_row = (foot_y - strip_top) * ss

    x = 58 * ss
    sd.text((x, cta_row), lead, font=f_cta, fill=ink)
    x += sd.textlength(lead, font=f_cta) + 16 * ss
    _card_globe_icon(sd, x, _card_line_centre(f_dom, CARD_DOMAIN, cta_row)
                     - icon / 2, icon, ink)
    x += icon * GLOBE_INK_RIGHT + GAP - f_dom.getbbox(CARD_DOMAIN)[0]
    sd.text((x, cta_row), CARD_DOMAIN, font=f_dom, fill=ink)

    x = 58 * ss
    _card_x_icon(strip, x, _card_line_centre(f_row, CARD_HANDLE, foot_row)
                 - icon / 2, icon, ink)
    x += icon * X_INK_RIGHT + GAP - f_row.getbbox(CARD_HANDLE)[0]
    sd.text((x, foot_row), CARD_HANDLE, font=f_row, fill=ink)

    img.alpha_composite(
        strip.resize((width, strip_h), Image.Resampling.LANCZOS), (0, strip_top))

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out_path, quality=96)
    return out_path


def recompose_from_raw(
    *,
    raw_path: str,
    out_path: str,
    headline: str,
    entity_logos: Optional[list] = None,
    angle: Optional[str] = None,
) -> str:
    """Free re-compose (no AI image call) from an existing raw background."""
    return _compose_editorial_card(
        raw_path, headline, out_path, entity_logos=entity_logos, angle=angle
    )


def find_raw_image(news_id: int, assets_dir: Optional[Path] = None) -> Optional[str]:
    """Locate ai_raw_{news_id}_*.png if a previous generation saved one."""
    base = Path(assets_dir or ASSETS_DIR)
    if not base.exists():
        return None
    matches = sorted(base.glob(f"ai_raw_{news_id}_*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    if matches:
        return str(matches[0])
    # also accept without slug
    direct = base / f"ai_raw_{news_id}.png"
    return str(direct) if direct.exists() else None


def _materials_dict(assets: dict) -> dict:
    return {
        "inventory": assets.get("inventory") or [],
        "needs_materials": bool(assets.get("needs_materials")),
        "missing_count": int(assets.get("missing_count") or 0),
        "qc_flags": assets.get("qc_flags") or [],
        "logos_resolved": len(assets.get("logos") or []),
        "faces_resolved": len(assets.get("people") or []),
        "critical_missing": assets.get("critical_missing") or [],
        "primary_org": assets.get("primary_org"),
        "primary_logo": assets.get("primary_logo"),
        "story_orgs": assets.get("story_orgs") or [],
        "verified_brands": assets.get("verified_brands") or [],
        "verified_brand_names": assets.get("verified_brand_names") or [],
    }


def generate_ai_social_image(
    *,
    news_id: int,
    headline: str,
    article_summary: str,
    source_domain: Optional[str],
    angle: Optional[str],
    reference_image_url: Optional[str] = None,
    override_prompt: Optional[str] = None,
    featured_person: Optional[str] = None,
    entities: Optional[list] = None,
    skip_if_needs_materials: bool = False,
    force: bool = False,
    force_provider: Optional[str] = None,
    image_model: Optional[str] = None,
    image_quality: Optional[str] = None,
) -> GeneratedSocialImage:
    """Generate cinematic poster image.

    Default provider: OpenAI gpt-image-2 (medium, portrait) when key present;
    else xAI Grok Imagine. force_provider overrides auto/env selection.
    """
    # Honour only a known model and quality: a typo must fall back to the
    # configured default rather than reach the API as an unknown, unpriced id.
    _IMAGE_OVERRIDE.set({
        "model": image_model if image_model in IMAGE_MODELS_ALLOWED else None,
        "quality": image_quality if image_quality in IMAGE_QUALITIES_ALLOWED else None,
    })

    # When the AI editorial pack supplies its own image prompt, use it verbatim;
    # otherwise fall back to the deterministic template prompt.
    prompt = (override_prompt or "").strip() or build_visual_prompt(
        headline=headline,
        article_summary=article_summary,
        source_domain=source_domain,
        angle=angle,
        reference_image_url=reference_image_url,
    )
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    slug = _safe_slug(headline, f"news-{news_id}")
    raw_path = ASSETS_DIR / f"ai_raw_{news_id}_{slug}.png"
    out_path = ASSETS_DIR / f"ai_{news_id}_{slug}.png"

    entity_face = None
    primary_logo_path = None
    primary_org_name = None
    visual_materials: Optional[dict] = None
    try:
        from app.services.social_entity_assets import resolve_entity_assets

        # Safe materials: only admin-trusted assets from resolve (no wiki autofetch gate).
        assets = resolve_entity_assets(
            entities or [],
            featured_person=featured_person,
            headline=headline or "",
            visual_only=True,
        )
        entity_face = assets.get("featured_face_path")  # trusted only
        pl = assets.get("primary_logo") or {}
        primary_logo_path = pl.get("path") if isinstance(pl, dict) else None
        po = assets.get("primary_org") or {}
        primary_org_name = (po.get("name") if isinstance(po, dict) else None) or (
            pl.get("name") if isinstance(pl, dict) else None
        )
        verified_brands = list(assets.get("verified_brands") or [])
        verified_brand_names = list(assets.get("verified_brand_names") or [])
        if not verified_brand_names and primary_org_name:
            verified_brand_names = [primary_org_name]
        visual_materials = _materials_dict(assets)
    except Exception as exc:
        logger = __import__("logging").getLogger(__name__)
        logger.warning("entity asset resolve failed: %s", exc)

    # Pause expensive AI image when primary materials missing (unless forced).
    if (
        skip_if_needs_materials
        and not force
        and visual_materials
        and visual_materials.get("needs_materials")
    ):
        return GeneratedSocialImage(
            image_path=None,
            image_mode="awaiting_materials",
            image_prompt=prompt,
            reference_image_url=reference_image_url,
            reference_image_path=entity_face,
            visual_materials=visual_materials,
            error_message=None,
        )

    # Primary pipeline: GPT Image 2 (quality) or Grok Imagine (fallback) + red-box compose.
    if force_provider in ("openai", "xai"):
        provider = force_provider
        if force_provider == "openai" and not os.environ.get("OPENAI_API_KEY", "").strip():
            provider = "none"
        if force_provider == "xai" and not os.environ.get("XAI_API_KEY", "").strip():
            provider = "none"
    else:
        provider = _resolve_image_provider()
    face_path = entity_face  # admin-trusted only
    brand = primary_org_name or "the primary brand"
    gen_prompt = prompt
    mode = f"ai_{provider}_poster"
    ref_used = None

    if provider == "none":
        return GeneratedSocialImage(
            image_path=None,
            image_mode="template_fallback",
            image_prompt=prompt,
            reference_image_url=reference_image_url,
            error_message="No OPENAI_API_KEY or XAI_API_KEY configured for images",
            visual_materials=visual_materials,
        )

    try:
        logo_paths = [
            b.get("path") for b in verified_brands
            if isinstance(b, dict) and b.get("path") and Path(str(b["path"])).exists()
        ]
        if not logo_paths and primary_logo_path and Path(str(primary_logo_path)).exists():
            logo_paths = [str(primary_logo_path)]
        logo_ok = bool(logo_paths)
        face_ok = bool(face_path and Path(str(face_path)).exists())
        allow = verified_brand_names or ([primary_org_name] if primary_org_name else [])

        scene_prompt = f"{prompt} {_brand_allowlist_clause(allow)}"
        image_api_calls = 0
        image_usage_acc: dict = {}
        image_is_edit = False
        model_label = _image_model() if provider == "openai" else XAI_IMAGE_MODEL

        if face_ok:
            # Single face edit (1:1). Cheap: no second brand API call.
            face_ref = _prepare_face_reference(str(face_path), news_id=news_id)
            ref_used = face_ref
            identity_prompt = _identity_face_prompt(
                scene_prompt,
                brand=primary_org_name,
                verified_brand_names=allow,
            )
            if allow and logo_ok:
                identity_prompt += (
                    f" If possible, subtly include verified brand presence for "
                    f"{', '.join(allow)} via environment/architecture only — "
                    "never invent unlisted brand logos."
                )
            gen_prompt = identity_prompt
            u = _edit_image(identity_prompt, face_ref, raw_path, provider=provider)
            image_usage_acc = _merge_usage(image_usage_acc, u)
            image_api_calls = 1
            image_is_edit = True
            mode = f"ai_{provider}_face_1to1"

            if (
                BRAND_SECOND_PASS
                and IMAGE_MAX_CALLS >= 2
                and logo_ok
                and allow
                and image_api_calls < IMAGE_MAX_CALLS
            ):
                try:
                    brand_prompt = _brand_pass_prompt(
                        scene_prompt, verified_brand_names=allow
                    )
                    u2 = _edit_image(brand_prompt, str(raw_path), raw_path, provider=provider)
                    image_usage_acc = _merge_usage(image_usage_acc, u2)
                    image_api_calls += 1
                    mode = f"ai_{provider}_face_1to1_brands"
                    gen_prompt = identity_prompt + " | brands:" + ",".join(allow)
                except Exception as brand_exc:
                    logger.warning(
                        "brand pass failed (keeping face-locked image): %s", brand_exc
                    )

        elif logo_ok:
            logo_ref = _prepare_logos_sheet(
                [str(p) for p in logo_paths], news_id=news_id
            ) or str(logo_paths[0])
            edit_prompt = (
                "Cinematic vertical Instagram poster. "
                f"Use ONLY the official brand mark(s) from the reference for: {', '.join(allow)}. "
                "Integrate them as large physical 3D elements in the scene "
                "(signage, product emblem, desk object). Match reference geometry exactly. "
                f"{_brand_allowlist_clause(allow)} "
                "Never corner stickers. Full scene: " + scene_prompt
            )
            u = _edit_image(edit_prompt, logo_ref, raw_path, provider=provider)
            image_usage_acc = _merge_usage(image_usage_acc, u)
            image_api_calls = 1
            image_is_edit = True
            ref_used = logo_ref
            mode = f"ai_{provider}_brands_scene"
            gen_prompt = edit_prompt
        else:
            if featured_person:
                gen_prompt = scene_prompt + (
                    " Show the central person only from behind or as a shadowed silhouette, "
                    "face not visible, to avoid depicting an inaccurate likeness."
                )
            else:
                gen_prompt = scene_prompt
            gen_prompt = f"{gen_prompt} {_brand_allowlist_clause([])}"
            u = _generate_image(gen_prompt, raw_path, provider=provider)
            image_usage_acc = _merge_usage(image_usage_acc, u)
            image_api_calls = 1
            image_is_edit = False
            mode = f"ai_{provider}_gen"

        _compose_editorial_card(
            str(raw_path),
            headline,
            str(out_path),
            entity_logos=None,
            angle=angle,
        )
        if visual_materials is not None:
            visual_materials = {
                **visual_materials,
                "raw_image_path": str(raw_path),
                "brand_in_scene": bool(logo_ok),
                "identity_lock": bool(face_ok),
                "primary_brand": primary_org_name,
                "verified_brand_names": allow,
                "image_api_calls": image_api_calls,
                "cheap_mode": CHEAP_MODE,
                "image_provider": provider,
                "image_model": model_label,
                "image_quality": _image_quality() if provider == "openai" else "default",
                "image_size": OPENAI_IMAGE_SIZE if provider == "openai" else "3:4",
                "image_is_edit": image_is_edit,
                "image_usage": image_usage_acc,
            }
        return GeneratedSocialImage(
            image_path=str(out_path),
            image_mode=mode,
            image_prompt=gen_prompt,
            reference_image_url=reference_image_url,
            reference_image_path=str(ref_used) if ref_used else face_path,
            visual_materials=visual_materials,
        )
    except Exception as exc:
        err = f"{provider} image failed: {type(exc).__name__}: {exc}"
        logger.warning("%s", err)
        # One automatic fallback: OpenAI → xAI (no recursion loop)
        if (
            provider == "openai"
            and not force_provider
            and os.environ.get("XAI_API_KEY", "").strip()
        ):
            try:
                logger.info("Falling back to xAI Grok Imagine after OpenAI failure")
                return generate_ai_social_image(
                    news_id=news_id,
                    headline=headline,
                    article_summary=article_summary,
                    source_domain=source_domain,
                    angle=angle,
                    reference_image_url=reference_image_url,
                    override_prompt=override_prompt,
                    featured_person=featured_person,
                    entities=entities,
                    skip_if_needs_materials=False,
                    force=True,
                    force_provider="xai",
                )
            except Exception as fb_exc:
                err = f"{err}; xai fallback failed: {type(fb_exc).__name__}: {fb_exc}"
        return GeneratedSocialImage(
            image_path=None,
            image_mode="template_fallback",
            image_prompt=gen_prompt,
            reference_image_url=reference_image_url,
            reference_image_path=face_path,
            error_message=err,
            visual_materials=visual_materials,
        )
