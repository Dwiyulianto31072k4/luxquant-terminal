"""
Social AI Image Generator

Generate Instagram-ready AI images for social posts. The service uses OpenAI
Images when OPENAI_API_KEY is configured and gracefully falls back to the
existing deterministic card renderer when the API is unavailable.
"""

from __future__ import annotations

import base64
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests


ASSETS_DIR = Path(os.environ.get("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts"))
OPENAI_IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
OPENAI_IMAGE_SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "1024x1536")
OPENAI_IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "medium")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
IMAGE_TIMEOUT = int(os.environ.get("SOCIAL_IMAGE_TIMEOUT", "120"))


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
        "Create an original cinematic Instagram vertical POSTER scene for a premium crypto intelligence brand.",
        "Hero subject large in the upper/middle frame; one continuous photoreal scene with dramatic lighting.",
        "The image will later receive bold white headline typography from a separate renderer — leave the lower 40% darker and less busy, and put ZERO readable text in the image itself.",
        f"Story context (inspire the scene, do not render as text): {context}",
        f"Source: {source}. Angle: {angle_label}. Headline idea (do not paint these words): {headline}.",
        reference_line,
        "Visual direction: viral crypto Instagram energy — physical 3D props, powerful architecture, hero portraits, giant coins when relevant, high contrast film grading, rim light, not a flat documentary boardroom photo.",
        "STRICT NEGATIVE: no readable text, no letters, no captions, no fake logos/wordmarks, no red subtitle bars, no watermarks, no chart labels, no collage seams.",
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


def _generate_openai_image(prompt: str, out_path: Path) -> None:
    response = requests.post(
        f"{OPENAI_BASE_URL.rstrip('/')}/images/generations",
        headers={**_openai_headers(), "Content-Type": "application/json"},
        json={
            "model": OPENAI_IMAGE_MODEL,
            "prompt": prompt,
            "size": OPENAI_IMAGE_SIZE,
            "quality": OPENAI_IMAGE_QUALITY,
            "n": 1,
        },
        timeout=IMAGE_TIMEOUT,
    )
    response.raise_for_status()
    out_path.write_bytes(_decode_openai_image(response.json()))


def _edit_openai_image(prompt: str, reference_path: str, out_path: Path) -> None:
    with open(reference_path, "rb") as image_file:
        response = requests.post(
            f"{OPENAI_BASE_URL.rstrip('/')}/images/edits",
            headers=_openai_headers(),
            data={
                "model": OPENAI_IMAGE_MODEL,
                "prompt": prompt,
                "size": OPENAI_IMAGE_SIZE,
                "quality": OPENAI_IMAGE_QUALITY,
                "n": "1",
            },
            files={"image": image_file},
            timeout=IMAGE_TIMEOUT,
        )
    response.raise_for_status()
    out_path.write_bytes(_decode_openai_image(response.json()))


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
IMAGE_PROVIDER = os.environ.get("SOCIAL_IMAGE_PROVIDER", "xai").strip().lower()
SOCIAL_LOGO_PATH = os.environ.get("SOCIAL_LOGO_PATH", str(ASSETS_DIR / "logo-luxquant.png"))
# Curated library of real face photos keyed by slug, e.g. faces/vitalik-buterin.jpg.
# When a story's featured_person matches a file here, the image is generated via
# xAI image-edit conditioned on that photo so the likeness is accurate.
SOCIAL_FACE_DIR = Path(os.environ.get("SOCIAL_FACE_DIR", str(ASSETS_DIR / "faces")))
LUX_RED = (190, 0, 28, 238)


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
FACE_AUTOFETCH = os.environ.get("SOCIAL_FACE_AUTOFETCH", "1").strip().lower() not in ("0", "false", "no", "")
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


def _edit_xai_image(prompt: str, reference_path: str, out_path: Path) -> None:
    """Generate via xAI image-edit conditioned on a reference photo (JSON + base64
    data URI, per xAI /images/edits spec)."""
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        raise RuntimeError("XAI_API_KEY is not configured")
    with open(reference_path, "rb") as handle:
        b64 = base64.b64encode(handle.read()).decode("utf-8")
    ext = Path(reference_path).suffix.lstrip(".").lower() or "png"
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    response = requests.post(
        f"{XAI_API_BASE.rstrip('/')}/images/edits",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": XAI_IMAGE_EDIT_MODEL,
            "prompt": prompt,
            "image": {"url": f"data:image/{mime};base64,{b64}", "type": "image_url"},
            "response_format": "b64_json",
        },
        timeout=XAI_IMAGE_TIMEOUT,
    )
    response.raise_for_status()
    item = (response.json().get("data") or [{}])[0]
    if item.get("b64_json"):
        out_path.write_bytes(base64.b64decode(item["b64_json"]))
        return
    if item.get("url"):
        img = requests.get(item["url"], timeout=120)
        img.raise_for_status()
        out_path.write_bytes(img.content)
        return
    raise RuntimeError("xAI image edit response missing b64_json/url")


def _generate_xai_image(prompt: str, out_path: Path) -> None:
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
    item = (response.json().get("data") or [{}])[0]
    if item.get("b64_json"):
        out_path.write_bytes(base64.b64decode(item["b64_json"]))
        return
    if item.get("url"):
        img = requests.get(item["url"], timeout=120)
        img.raise_for_status()
        out_path.write_bytes(img.content)
        return
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


# Crypto assets already drawn as physical coins in the AI scene — never stamp
# a redundant corner logo sticker (e.g. BTC badge on a giant Bitcoin coin).
_CRYPTO_TOKEN_LOGO_SKIP = frozenset({
    "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "xrp", "ripple",
    "dogecoin", "doge", "bnb", "binance coin", "cardano", "ada", "avalanche",
    "avax", "tether", "usdt", "ton", "toncoin", "tron", "trx", "chainlink",
    "link", "polkadot", "dot", "polygon", "matic", "litecoin", "ltc",
    "shiba inu", "shib", "pepe", "uniswap", "uni", "sui", "aptos", "apt",
})


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


def _is_crypto_token_logo(name: str) -> bool:
    n = re.sub(r"[^a-z0-9\s]", "", (name or "").lower()).strip()
    if not n:
        return False
    if n in _CRYPTO_TOKEN_LOGO_SKIP:
        return True
    # "Bitcoin ETF" / "Ethereum Foundation" still token-primary
    first = n.split()[0] if n.split() else n
    return first in _CRYPTO_TOKEN_LOGO_SKIP


def _filter_logos_for_overlay(logos: Optional[list]) -> list:
    """Only institutional multi-brand marks — never redundant crypto coin stickers."""
    if not logos:
        return []
    out = []
    for item in logos:
        name = item.get("name") if isinstance(item, dict) else ""
        path = item.get("path") if isinstance(item, dict) else item
        if not path or not Path(str(path)).exists():
            continue
        if _is_crypto_token_logo(str(name or "")):
            continue
        out.append(item if isinstance(item, dict) else {"path": path, "name": ""})
    # Single non-crypto logo alone often looks like a random sticker — require 2+
    # (e.g. Hyperliquid + SEC). Otherwise leave the cinematic scene clean.
    return out[:3] if len(out) >= 2 else []


def _paste_entity_logos(img, logos: Optional[list], *, width: int) -> None:
    """Optional multi-org badges top-right (institutions only, never crypto coins)."""
    logos = _filter_logos_for_overlay(logos)
    if not logos:
        return
    from PIL import Image, ImageDraw

    size = 64
    pad = 18
    gap = 10
    x_right = width - pad
    y = pad
    for item in logos:
        path = item.get("path") if isinstance(item, dict) else item
        if not path or not Path(path).exists():
            continue
        try:
            mark = Image.open(path).convert("RGBA")
            side = min(mark.width, mark.height)
            left = (mark.width - side) // 2
            top = (mark.height - side) // 2
            mark = mark.crop((left, top, left + side, top + side))
            mark = mark.resize((size, size), Image.Resampling.LANCZOS)
            plate = Image.new("RGBA", (size + 10, size + 10), (0, 0, 0, 0))
            pd = ImageDraw.Draw(plate)
            pd.rounded_rectangle((0, 0, size + 9, size + 9), radius=12, fill=(0, 0, 0, 90))
            pd.rounded_rectangle((2, 2, size + 7, size + 7), radius=10, fill=(255, 255, 255, 245))
            plate.alpha_composite(mark, (5, 5))
            img.alpha_composite(plate, (x_right - size - 10, y))
            y += size + gap + 4
        except Exception:
            continue


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
    No top-left chip. No redundant crypto logo stickers.
    """
    from PIL import Image, ImageDraw, ImageFilter

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

    # Multi-org institutional badges only (never BTC sticker on a BTC coin scene)
    _paste_entity_logos(img, entity_logos, width=width)

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
) -> GeneratedSocialImage:
    """Generate cinematic poster image.

    If skip_if_needs_materials=True and critical logos/faces are missing, returns
    without calling the paid image API (image_mode='awaiting_materials').
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

    # Resolve real logos + face references for named entities (Hyperliquid, SEC, founders…).
    entity_logos: list = []
    entity_face = None
    visual_materials: Optional[dict] = None
    try:
        from app.services.social_entity_assets import resolve_entity_assets

        # Best-effort face autofetch BEFORE gating, so we don't block if Wiki has a portrait.
        face_path_pre = resolve_face_reference(featured_person)
        if not face_path_pre and featured_person and FACE_AUTOFETCH:
            face_path_pre = fetch_face_reference(featured_person)

        assets = resolve_entity_assets(entities or [], featured_person=featured_person)
        entity_logos = assets.get("logos") or []
        entity_face = assets.get("featured_face_path") or face_path_pre
        visual_materials = _materials_dict(assets)
    except Exception as exc:
        logger = __import__("logging").getLogger(__name__)
        logger.warning("entity asset resolve failed: %s", exc)

    # Pause expensive AI image when materials are still missing (unless forced).
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

    # Preferred backend: xAI/Grok raw image + LuxQuant cinematic poster compositor.
    if IMAGE_PROVIDER == "xai":
        face_path = entity_face or resolve_face_reference(featured_person)
        if not face_path and featured_person and FACE_AUTOFETCH:
            face_path = fetch_face_reference(featured_person)
            if face_path and visual_materials is not None:
                try:
                    from app.services.social_entity_assets import resolve_entity_assets
                    assets = resolve_entity_assets(entities or [], featured_person=featured_person)
                    entity_logos = assets.get("logos") or []
                    visual_materials = _materials_dict(assets)
                except Exception:
                    pass
        gen_prompt = prompt
        mode = "ai_xai_poster"
        try:
            if face_path:
                # Accurate likeness: condition on the curated reference photo.
                edit_prompt = (
                    "Cinematic vertical poster. Place the exact person shown in the reference image — "
                    "preserving their real face, hair, and likeness precisely — as the large hero "
                    "foreground subject of this scene: " + prompt
                )
                _edit_xai_image(edit_prompt, face_path, raw_path)
                mode = "ai_xai_face_poster"
            else:
                if featured_person:
                    # Famous figure requested but no verified reference photo on file:
                    # never fabricate a face — render the person generically instead.
                    gen_prompt = prompt + (
                        " Show the central person only from behind or as a shadowed silhouette, "
                        "face not visible, to avoid depicting an inaccurate likeness."
                    )
                _generate_xai_image(gen_prompt, raw_path)
            _compose_editorial_card(
                str(raw_path),
                headline,
                str(out_path),
                entity_logos=entity_logos,
                angle=angle,
            )
            if entity_logos:
                mode = f"{mode}_logos"
            if visual_materials is not None:
                visual_materials = {
                    **visual_materials,
                    "raw_image_path": str(raw_path),
                }
            if visual_materials and visual_materials.get("needs_materials"):
                mode = f"{mode}_needs_assets"
            return GeneratedSocialImage(
                image_path=str(out_path),
                image_mode=mode,
                image_prompt=gen_prompt,
                reference_image_url=reference_image_url,
                reference_image_path=face_path,
                visual_materials=visual_materials,
            )
        except Exception as exc:
            return GeneratedSocialImage(
                image_path=None,
                image_mode="template_fallback",
                image_prompt=gen_prompt,
                reference_image_url=reference_image_url,
                error_message=f"xai image failed: {type(exc).__name__}: {exc}",
                visual_materials=visual_materials,
            )

    reference_path = download_reference_image(reference_image_url, news_id=news_id)
    edit_error = None
    try:
        if reference_path:
            try:
                _edit_openai_image(prompt, reference_path, raw_path)
                compose_luxquant_image(
                    background_path=str(raw_path),
                    out_path=str(out_path),
                    headline=headline,
                    source_domain=source_domain,
                    angle=angle,
                )
                return GeneratedSocialImage(
                    image_path=str(out_path),
                    image_mode="ai_reference",
                    image_prompt=prompt,
                    reference_image_url=reference_image_url,
                    reference_image_path=reference_path,
                )
            except Exception as exc:
                edit_error = f"{type(exc).__name__}: {exc}"
        _generate_openai_image(prompt, raw_path)
        compose_luxquant_image(
            background_path=str(raw_path),
            out_path=str(out_path),
            headline=headline,
            source_domain=source_domain,
            angle=angle,
        )
        return GeneratedSocialImage(
            image_path=str(out_path),
            image_mode="ai_generated",
            image_prompt=prompt,
            reference_image_url=reference_image_url,
            reference_image_path=reference_path,
            error_message=edit_error,
        )
    except Exception as exc:
        error_message = f"{type(exc).__name__}: {exc}"
        if edit_error:
            error_message = f"reference edit failed ({edit_error}); generation failed ({error_message})"
        return GeneratedSocialImage(
            image_path=None,
            image_mode="template_fallback",
            image_prompt=prompt,
            reference_image_url=reference_image_url,
            reference_image_path=reference_path,
            error_message=error_message,
        )
