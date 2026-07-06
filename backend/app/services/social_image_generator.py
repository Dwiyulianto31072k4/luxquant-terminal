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
        "No reference image is available; infer a relevant crypto editorial visual from the article."
    )

    return "\n".join([
        "Create an original Instagram portrait editorial BACKGROUND ONLY for a premium crypto market intelligence post.",
        "The image will later receive text overlays from a separate renderer, so the generated image itself must contain zero readable text.",
        f"Story context to inspire the scene, not to render as text: {context}",
        f"Source: {source}. Editorial angle: {angle_label}.",
        reference_line,
        "Visual direction: Bloomberg-style real-life editorial photography, brighter and tangible, premium financial newsroom or analyst desk, realistic objects, documents without readable writing, glass screens with abstract blurred charts only, blockchain/AI network motifs as physical light lines or generic nodes.",
        "Context rule: show the subject through symbols, not labels. For protocol migrations, show a generic bridge between two abstract blockchain ecosystems and AI-agent network nodes; do not show actual protocol logos or names.",
        "Composition: clean lower third for a headline overlay; main visual interest should sit upper/middle, with no embedded typography.",
        "STRICT NEGATIVE: no text, no letters, no words, no numbers, no captions, no logos, no brand names, no Moonbeam wordmark, no Base logo, no Polkadot logo, no Ethereum logo, no LuxQuant text, no fake tickers, no readable chart labels, no watermark.",
        "If any monitor or phone appears, its screen must show only abstract unreadable color blocks or blurred candlestick shapes, never words or symbols.",
        "Make it feel like an original high-end financial magazine photograph, not a poster with generated text.",
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
XAI_IMAGE_TIMEOUT = int(os.environ.get("XAI_IMAGE_TIMEOUT", "280"))
IMAGE_PROVIDER = os.environ.get("SOCIAL_IMAGE_PROVIDER", "xai").strip().lower()
SOCIAL_LOGO_PATH = os.environ.get("SOCIAL_LOGO_PATH", str(ASSETS_DIR / "logo-luxquant.png"))
LUX_RED = (190, 0, 28, 238)


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
    words = text_value.replace("—", "-").split()
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


def _compose_editorial_card(raw_path: str, headline: str, out_path: str) -> str:
    """LuxQuant editorial card (agreed style): cover-crop 4:5, bottom vignette,
    white headline on stepped LuxQuant-red highlight boxes (lower-left), logo lower-right."""
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
        x = x0  # flush left — all lines share the same left edge
        bbox = draw.textbbox((0, 0), line, font=fnt)
        tw = bbox[2] - bbox[0]
        glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.rectangle((x - 10, y - 5, x + tw + 32, y + 62), fill=(0, 0, 0, 145))
        img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
        draw = ImageDraw.Draw(img)
        draw.rectangle((x - 4, y - 2, x + tw + 24, y + 58), fill=LUX_RED)
        # vertical-center the text inside the red box (box spans y-2 … y+58)
        draw.text((x + 10, y + 28), line, font=fnt, fill=(255, 255, 255, 255), anchor="lm")
        y += 82

    logo_path = Path(SOCIAL_LOGO_PATH)
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        bbox = logo.getbbox()
        if bbox:
            logo = logo.crop(bbox)
        target_w = 190
        target_h = int(logo.height * target_w / logo.width)
        logo = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
        logo.putalpha(logo.getchannel("A").point(lambda a: int(a * 0.9)))
        img.alpha_composite(logo, (width - target_w - 52, height - target_h - 52))

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out_path, quality=96)
    return out_path


def generate_ai_social_image(
    *,
    news_id: int,
    headline: str,
    article_summary: str,
    source_domain: Optional[str],
    angle: Optional[str],
    reference_image_url: Optional[str] = None,
    override_prompt: Optional[str] = None,
) -> GeneratedSocialImage:
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

    # Preferred backend: xAI/Grok raw image + LuxQuant editorial renderer
    # (bottom gradient + white headline + logo), matching the prototype look.
    if IMAGE_PROVIDER == "xai":
        try:
            _generate_xai_image(prompt, raw_path)
            _compose_editorial_card(str(raw_path), headline, str(out_path))
            return GeneratedSocialImage(
                image_path=str(out_path),
                image_mode="ai_xai",
                image_prompt=prompt,
                reference_image_url=reference_image_url,
            )
        except Exception as exc:
            return GeneratedSocialImage(
                image_path=None,
                image_mode="template_fallback",
                image_prompt=prompt,
                reference_image_url=reference_image_url,
                error_message=f"xai image failed: {type(exc).__name__}: {exc}",
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
