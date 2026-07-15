"""
Social AI Image Generator

Instagram-ready AI backgrounds for social posts, then classic LuxQuant red-box
compose.

Quality-first + cost-efficient defaults (2026):
  - Primary image model: OpenAI gpt-image-2 @ medium, 1024x1536 (~$0.04/img)
  - Fallback: xAI Grok Imagine if OPENAI_API_KEY missing
  - Max 1 paid image API call per draft (SOCIAL_CHEAP_MODE)
  - Caption/chat stays on xAI Grok (separate, cheaper tokens)
"""

from __future__ import annotations

import base64
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
OPENAI_IMAGE_SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "1024x1536")
OPENAI_IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "medium")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
IMAGE_TIMEOUT = int(os.environ.get("SOCIAL_IMAGE_TIMEOUT", "180"))


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

    return "\n".join([
        "Create an original photoreal premium financial-news Instagram vertical poster scene.",
        "One continuous REAL-WORLD scene a Bloomberg photo editor would approve — architecture, institution, "
        "person, product, or market floor — not surreal crypto meme art.",
        "Hero subject large in the upper/middle frame; natural cinematic lighting.",
        "ZERO readable text in the image (no wall slogans, no logos invented as type). Lower 40% darker for overlay.",
        f"Story context (inspire the scene, never paint as text): {context}",
        f"Source: {source}. Angle: {angle_label}. Headline idea (do not paint these words): {headline}.",
        reference_line,
        "Prefer plausible institutional/city/product settings. Avoid chains-on-books, floating holograms, raining money.",
        "STRICT NEGATIVE: no readable text, no fake logos/wordmarks, no red subtitle bars, no watermarks, no collage seams.",
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
        "model": OPENAI_IMAGE_MODEL,
        "prompt": prompt,
        "size": OPENAI_IMAGE_SIZE,
        "quality": OPENAI_IMAGE_QUALITY,
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
            "model": OPENAI_IMAGE_MODEL,
            "prompt": prompt,
            "size": OPENAI_IMAGE_SIZE,
            "quality": OPENAI_IMAGE_QUALITY,
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


def _measure(draw, text_value: str, font) -> int:
    bbox = draw.textbbox((0, 0), text_value, font=font)
    return bbox[2] - bbox[0]


def _stepped_headline_lines(draw, headline: str, font, widths: list[int]) -> list[str]:
    words = re.sub(r"\s+", " ", headline or "").strip().upper().split()
    if not words:
        return []

    lines = []
    idx = 0
    for max_width in widths:
        if idx >= len(words):
            break
        line = words[idx]
        idx += 1
        while idx < len(words):
            test = f"{line} {words[idx]}"
            if _measure(draw, test, font) <= max_width:
                line = test
                idx += 1
            else:
                break
        lines.append(line)

    if idx < len(words):
        remainder = " ".join(words[idx:])
        if lines:
            lines[-1] = f"{lines[-1]} {remainder}"
        else:
            lines.append(remainder)
    return lines[:4]


def _visual_topic_label(angle: Optional[str], headline: str) -> str:
    text_value = f"{angle or ''} {headline or ''}".lower()
    crypto_terms = (
        "bitcoin", "btc", "ethereum", "eth", "solana", "xrp", "crypto",
        "blockchain", "protocol", "layer 2", "defi", "base", "polkadot",
        "moonbeam", "token", "stablecoin", "ai agent",
    )
    if any(term in text_value for term in crypto_terms):
        return "CRYPTO"
    labels = {
        "macro": "MACRO",
        "policy": "POLICY",
        "market_pulse": "MARKET",
        "news_brief": "CRYPTO",
    }
    return labels.get(angle or "", "CRYPTO")


def compose_luxquant_image(
    *,
    background_path: str,
    out_path: str,
    headline: str,
    source_domain: Optional[str],
    angle: Optional[str],
) -> str:
    from PIL import Image, ImageDraw, ImageFilter

    width, height = 1080, 1350
    img = Image.open(background_path).convert("RGB")
    img = _cover_image(img, (width, height))

    # Keep generated image alive, but add enough contrast for editorial overlay.
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for y in range(height):
        t = y / height
        if y < 650:
            alpha = int(18 + 38 * (1 - t))
        else:
            alpha = int(40 + 145 * ((y - 650) / (height - 650)))
        od.line([(0, y), (width, y)], fill=(0, 0, 0, min(190, alpha)))
    img = Image.alpha_composite(img.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(img)

    gold = (218, 176, 85, 255)
    cream = (255, 244, 220, 255)
    red = (198, 40, 40, 238)
    dark_red = (94, 10, 14, 245)

    # Top source strip.
    label_font = _font(24, True)
    small_font = _font(18, True)
    draw.rounded_rectangle((62, 58, 242, 98), radius=4, fill=(8, 10, 11, 188), outline=(218, 176, 85, 150), width=1)
    draw.text((78, 66), "LUXQUANT", font=label_font, fill=gold)
    angle_label = _visual_topic_label(angle, headline)
    source = (source_domain or "LuxQuant News").upper()
    draw.text((62, 112), f"{angle_label} / {source}", font=small_font, fill=(232, 222, 202, 210))

    # Left-aligned stepped highlight: fixed left, right side gets shorter lower down.
    headline_font = _font(63, True)
    line_font = headline_font
    x = 62
    y = 930
    line_h = 82
    widths = [890, 780, 650, 520]
    lines = _stepped_headline_lines(draw, headline, line_font, widths)
    while len(lines) > 4 and line_font.size > 46:
        line_font = _font(line_font.size - 4, True)
        lines = _stepped_headline_lines(draw, headline, line_font, widths)

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=line_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x = 22
        pad_y = 10
        rect = (x, y - pad_y, x + tw + pad_x * 2, y + th + pad_y + 4)
        fill = red if i == 0 else dark_red
        draw.rounded_rectangle(rect, radius=2, fill=fill)
        draw.text((x + pad_x, y), line, font=line_font, fill=cream)
        y += line_h

    # Bottom accent.
    draw.rectangle((62, 1274, 210, 1282), fill=gold)
    draw.text((230, 1260), "SOURCE VERIFIED / AI-GENERATED VISUAL", font=_font(17, True), fill=(238, 229, 210, 210))

    img = img.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.0, percent=105, threshold=3))
    img.save(out_path, quality=96)
    return out_path


# ── xAI (Grok) image generation + prototype editorial renderer ──────────
XAI_API_BASE = os.environ.get("XAI_API_BASE", "https://api.x.ai/v1")
XAI_IMAGE_MODEL = os.environ.get("XAI_IMAGE_MODEL", "grok-imagine-image-quality")
XAI_IMAGE_EDIT_MODEL = os.environ.get("XAI_IMAGE_EDIT_MODEL", "grok-imagine-image-quality")
XAI_IMAGE_TIMEOUT = int(os.environ.get("XAI_IMAGE_TIMEOUT", "280"))
# Legacy env name still read via _resolve_image_provider(); default is "auto"
SOCIAL_LOGO_PATH = os.environ.get("SOCIAL_LOGO_PATH", str(ASSETS_DIR / "logo-luxquant.png"))
# Curated library of real face photos keyed by slug, e.g. faces/vitalik-buterin.jpg.
# When a story's featured_person matches a file here, the image is generated via
# xAI image-edit conditioned on that photo so the likeness is accurate.
SOCIAL_FACE_DIR = Path(os.environ.get("SOCIAL_FACE_DIR", str(ASSETS_DIR / "faces")))
LUX_RED = (190, 0, 28, 238)
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


def _text_width(draw, text_value: str, fnt) -> int:
    box = draw.textbbox((0, 0), text_value, font=fnt)
    return box[2] - box[0]


def _wrap_headline(draw, text_value: str, fnt) -> list:
    """Classic LuxQuant stepped headline wrap (shorter lines lower down)."""
    words = (text_value or "").replace("—", "-").split()
    widths = [820, 760, 690, 590]
    lines: list = []
    for width in widths:
        if not words:
            break
        line = words.pop(0)
        while words and _text_width(draw, f"{line} {words[0]}", fnt) <= width:
            line += " " + words.pop(0)
        lines.append(line)
    if words and lines:
        lines[-1] += " " + " ".join(words)
    return lines[:4]


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


def _compose_editorial_card(
    raw_path: str,
    headline: str,
    out_path: str,
    *,
    entity_logos: Optional[list] = None,
    angle: Optional[str] = None,
) -> str:
    """Classic LuxQuant editorial card on a cinematic AI background:
    cover-crop 4:5, bottom vignette, white headline on stepped LuxQuant-red
    highlight boxes (lower-left), LuxQuant mark lower-right.

    Brands belong IN the AI raw scene (via reference edit) — never corner stickers.
    entity_logos is ignored (kept for call-site compatibility).
    """
    from PIL import Image, ImageDraw, ImageFilter

    del entity_logos  # no corner paste — brand is in the raw scene
    width, height = 1080, 1350
    img = _cover_image(Image.open(raw_path).convert("RGB"), (width, height)).convert("RGBA")
    img = _apply_editorial_shadow(img)
    draw = ImageDraw.Draw(img)
    fnt = _font(54, bold=True)
    lines = _wrap_headline(draw, str(headline).strip(), fnt)
    y = height - (len(lines) * 68 + max(0, len(lines) - 1) * 14) - 150
    x0 = 58

    for index, line in enumerate(lines):
        x = x0
        bbox = draw.textbbox((0, 0), line, font=fnt)
        tw = bbox[2] - bbox[0]
        glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.rectangle((x - 10, y - 5, x + tw + 32, y + 62), fill=(0, 0, 0, 145))
        img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
        draw = ImageDraw.Draw(img)
        draw.rectangle((x - 4, y - 2, x + tw + 24, y + 58), fill=LUX_RED)
        draw.text((x + 10, y + 28), line, font=fnt, fill=(255, 255, 255, 255), anchor="lm")
        y += 82

    logo_path = Path(SOCIAL_LOGO_PATH)
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        bbox = logo.getbbox()
        if bbox:
            logo = logo.crop(bbox)
        target_w = 190
        target_h = int(logo.height * target_w / max(1, logo.width))
        logo = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
        logo.putalpha(logo.getchannel("A").point(lambda a: int(a * 0.9)))
        img.alpha_composite(logo, (width - target_w - 52, height - target_h - 52))

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
) -> GeneratedSocialImage:
    """Generate cinematic poster image.

    Default provider: OpenAI gpt-image-2 (medium, portrait) when key present;
    else xAI Grok Imagine. force_provider overrides auto/env selection.
    """
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
        model_label = OPENAI_IMAGE_MODEL if provider == "openai" else XAI_IMAGE_MODEL

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
                "image_quality": OPENAI_IMAGE_QUALITY if provider == "openai" else "default",
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
