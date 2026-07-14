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
) -> None:
    """Generate via xAI image-edit conditioned on a reference photo (JSON + base64
    data URI, per xAI /images/edits spec)."""
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
    # Prefer vertical social crop when the API accepts it
    if aspect_ratio:
        payload["aspect_ratio"] = aspect_ratio
    response = requests.post(
        f"{XAI_API_BASE.rstrip('/')}/images/edits",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=XAI_IMAGE_TIMEOUT,
    )
    # Some model versions reject aspect_ratio on edits — retry without it
    if response.status_code >= 400 and aspect_ratio:
        payload.pop("aspect_ratio", None)
        response = requests.post(
            f"{XAI_API_BASE.rstrip('/')}/images/edits",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
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


def _identity_face_prompt(scene_prompt: str, *, brand: Optional[str] = None) -> str:
    """Build face-only edit prompt: identity first, scene second."""
    parts = [
        IDENTITY_LOCK_PREFIX,
        "Task: Transform the reference photograph into a cinematic vertical Instagram poster "
        "while keeping the same person's face 1:1.",
        "The hero subject is a large chest-up or three-quarter portrait of THIS exact person "
        "in the upper/middle frame.",
        f"Scene direction (do not change identity for these): {scene_prompt}",
    ]
    if brand:
        parts.append(
            f"Environment may evoke {brand} (architecture, colors, workplace props) "
            "without drawing fake logo stickers in corners; brand marks come in a later pass if needed."
        )
    parts.append(
        "Lower third of the frame darker and calmer for later headline typography. "
        "No readable text, no captions, no watermarks."
    )
    return " ".join(parts)


def _brand_pass_prompt(scene_prompt: str, brand: str) -> str:
    """Second edit: inject brand into an identity-locked scene without touching the face."""
    return (
        f"{BRAND_PASS_FACE_LOCK}"
        f"Add the official {brand} brand presence as a physical scene element "
        f"(wall signage, product emblem, desk object, or architectural mark). "
        f"Match real {brand} brand geometry and colors when possible. "
        "Never as a tiny corner sticker, floating badge, or white plate. "
        f"Keep composition as a cinematic vertical poster. Context: {scene_prompt[:400]} "
        "No readable body text, no caption bars."
    )


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

    Brands: primary org logo is fed via xAI image-edit so it becomes an element
    *inside* the scene (phone UI, signage, prop) — never a corner sticker.
    Materials gate uses visual_only scope (primary org + featured face).
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

    # Preferred backend: xAI/Grok raw image + classic LuxQuant red-box compositor.
    if IMAGE_PROVIDER == "xai":
        # Only use admin-trusted face (never raw wiki scrape for generation accuracy)
        face_path = entity_face

        brand = primary_org_name or "the primary brand"
        gen_prompt = prompt
        mode = "ai_xai_poster"
        ref_used = None
        try:
            logo_ok = bool(primary_logo_path and Path(str(primary_logo_path)).exists())
            face_ok = bool(face_path and Path(str(face_path)).exists())

            if face_ok:
                # ── Step 1: FACE ONLY (1:1 identity). Never dual-collage with logo. ──
                face_ref = _prepare_face_reference(str(face_path), news_id=news_id)
                ref_used = face_ref
                identity_prompt = _identity_face_prompt(
                    prompt,
                    brand=primary_org_name if logo_ok or primary_org_name else None,
                )
                gen_prompt = identity_prompt
                _edit_xai_image(identity_prompt, face_ref, raw_path, aspect_ratio="3:4")
                mode = "ai_xai_face_1to1"

                # ── Step 2 (optional): brand into scene without changing the face ──
                if logo_ok:
                    try:
                        brand_prompt = _brand_pass_prompt(prompt, brand)
                        # Edit FROM the identity-locked scene (not from logo collage)
                        _edit_xai_image(
                            brand_prompt,
                            str(raw_path),
                            raw_path,
                            aspect_ratio="3:4",
                        )
                        mode = "ai_xai_face_1to1_brand"
                        gen_prompt = identity_prompt + " | brand_pass:" + brand
                    except Exception as brand_exc:
                        # Keep identity-locked image if brand pass fails
                        logger = __import__("logging").getLogger(__name__)
                        logger.warning(
                            "brand pass failed (keeping face-locked image): %s", brand_exc
                        )
                elif primary_org_name:
                    # No logo file — light text-only brand environment already in step 1
                    mode = "ai_xai_face_1to1"

            elif logo_ok:
                # Brand mark is the visual anchor — build scene around it as a physical prop
                edit_prompt = (
                    f"Cinematic vertical Instagram poster. Use the official {brand} brand mark from the "
                    "reference image accurately as a LARGE physical 3D element integrated into the scene "
                    "(giant product emblem, phone app icon filling part of a device screen, desk object, "
                    "or environmental signage). Match the reference mark's shape and colors exactly. "
                    "Never as a tiny corner sticker or badge on a white plate. "
                    "Full scene: " + prompt
                )
                _edit_xai_image(edit_prompt, str(primary_logo_path), raw_path, aspect_ratio="3:4")
                ref_used = primary_logo_path
                mode = "ai_xai_brand_scene"
            else:
                if featured_person:
                    gen_prompt = prompt + (
                        " Show the central person only from behind or as a shadowed silhouette, "
                        "face not visible, to avoid depicting an inaccurate likeness."
                    )
                _generate_xai_image(gen_prompt, raw_path)

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
                    "brand_in_scene": bool(logo_ok and face_ok) or (bool(logo_ok) and not face_ok),
                    "identity_lock": bool(face_ok),
                    "primary_brand": primary_org_name,
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
