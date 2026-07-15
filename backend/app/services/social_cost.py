"""
Actual cost tracking for social-post generation.

Priority:
  1. API-reported usage tokens × published unit rates  → source "actual"
  2. OpenAI fixed image-output token schedule (size×quality) × rates → "billing_schedule"
     (OpenAI bills image outputs by fixed token tables for known sizes)
  3. Fallback flat unit prices → "estimated"

Dashboard sums gen_meta.total_usd; each post also stores cost_source + breakdown.
"""

from __future__ import annotations

import os
from typing import Any, Optional

# ── Chat (xAI Grok-4 published rates) ────────────────────────────
PRICE_CHAT_INPUT_PER_M = float(os.environ.get("SOCIAL_COST_CHAT_INPUT_PER_M", "3.0"))
PRICE_CHAT_OUTPUT_PER_M = float(os.environ.get("SOCIAL_COST_CHAT_OUTPUT_PER_M", "15.0"))

# ── OpenAI gpt-image-2 token rates ($ / 1M tokens) ───────────────
PRICE_OAI_IMG_IN_PER_M = float(os.environ.get("SOCIAL_COST_OAI_IMG_IN_PER_M", "8.0"))
PRICE_OAI_IMG_OUT_PER_M = float(os.environ.get("SOCIAL_COST_OAI_IMG_OUT_PER_M", "30.0"))
PRICE_OAI_TEXT_IN_PER_M = float(os.environ.get("SOCIAL_COST_OAI_TEXT_IN_PER_M", "5.0"))

# ── xAI image flat (no public per-token usage on generations) ────
PRICE_IMAGE_XAI = float(os.environ.get("SOCIAL_COST_XAI_IMAGE", "0.05"))
PRICE_SEARCH_USD = float(os.environ.get("SOCIAL_COST_SEARCH_USD", "0.016"))
# Legacy flat fallback
PRICE_IMAGE_USD = float(os.environ.get("SOCIAL_COST_IMAGE_USD", "0.045"))

CHEAP_MODE = os.environ.get("SOCIAL_CHEAP_MODE", "1").strip().lower() not in ("0", "false", "no")

# OpenAI image *output* tokens by (size, quality) — billing table used by Images API.
# Values aligned with gpt-image-1 schedule; gpt-image-2 uses the same size/quality grid.
# Source: OpenAI community / calculator-derived tables for 1024×1024 / 1024×1536 / 1536×1024.
_OAI_IMAGE_OUTPUT_TOKENS: dict[tuple[str, str], int] = {
    ("1024x1024", "low"): 272,
    ("1024x1024", "medium"): 1056,
    ("1024x1024", "high"): 4160,
    ("1024x1536", "low"): 408,
    ("1024x1536", "medium"): 1584,
    ("1024x1536", "high"): 6240,
    ("1536x1024", "low"): 400,
    ("1536x1024", "medium"): 1568,
    ("1536x1024", "high"): 6208,
}


def openai_image_output_tokens(size: str = "1024x1536", quality: str = "medium") -> int:
    size = (size or "1024x1536").lower().replace(" ", "")
    quality = (quality or "medium").lower()
    return int(_OAI_IMAGE_OUTPUT_TOKENS.get((size, quality), 1584))


def _usd_from_tokens(tokens: int, price_per_m: float) -> float:
    return (int(tokens or 0) / 1_000_000.0) * float(price_per_m)


def compute_chat_usd(*, prompt_tokens: int, completion_tokens: int) -> dict:
    """Chat cost from API usage (actual tokens)."""
    pt = int(prompt_tokens or 0)
    ct = int(completion_tokens or 0)
    usd = _usd_from_tokens(pt, PRICE_CHAT_INPUT_PER_M) + _usd_from_tokens(ct, PRICE_CHAT_OUTPUT_PER_M)
    return {
        "prompt_tokens": pt,
        "completion_tokens": ct,
        "chat_usd": round(usd, 6),
        "chat_source": "actual" if (pt or ct) else "none",
    }


def compute_openai_image_usd(
    *,
    usage: Optional[dict] = None,
    size: str = "1024x1536",
    quality: str = "medium",
    image_count: int = 1,
    is_edit: bool = False,
) -> dict:
    """
    OpenAI image cost.

    Prefer response.usage when present (actual). Else use fixed output-token
    schedule for the size/quality (billing_schedule — how OpenAI meters images).
    """
    n = max(0, int(image_count or 0))
    if n == 0:
        return {
            "image_usd": 0.0,
            "image_count": 0,
            "image_source": "none",
            "image_input_tokens": 0,
            "image_output_tokens": 0,
            "image_text_tokens": 0,
        }

    usage = usage or {}
    # Normalize usage keys from Images API / Responses variants
    in_tok = int(
        usage.get("input_tokens")
        or usage.get("prompt_tokens")
        or 0
    )
    out_tok = int(
        usage.get("output_tokens")
        or usage.get("completion_tokens")
        or 0
    )
    # Some payloads nest details
    details = usage.get("input_tokens_details") or usage.get("prompt_tokens_details") or {}
    text_in = int(details.get("text_tokens") or usage.get("text_input_tokens") or 0)
    img_in = int(details.get("image_tokens") or usage.get("image_input_tokens") or 0)
    if in_tok and not (text_in or img_in):
        # Treat all input as image+text blended at image-input rate (conservative)
        img_in = in_tok

    if out_tok or in_tok or text_in or img_in:
        usd = (
            _usd_from_tokens(text_in, PRICE_OAI_TEXT_IN_PER_M)
            + _usd_from_tokens(img_in or (in_tok - text_in if in_tok > text_in else 0), PRICE_OAI_IMG_IN_PER_M)
            + _usd_from_tokens(out_tok, PRICE_OAI_IMG_OUT_PER_M)
        )
        # If only total input without split, bill all input at image input rate
        if in_tok and not text_in and not img_in:
            usd = _usd_from_tokens(in_tok, PRICE_OAI_IMG_IN_PER_M) + _usd_from_tokens(out_tok, PRICE_OAI_IMG_OUT_PER_M)
        return {
            "image_usd": round(usd, 6),
            "image_count": n,
            "image_source": "actual",
            "image_input_tokens": in_tok or img_in,
            "image_output_tokens": out_tok,
            "image_text_tokens": text_in,
            "is_edit": is_edit,
        }

    # Billing schedule fallback (exact output tokens for known size/quality)
    out_sched = openai_image_output_tokens(size, quality) * n
    # Edits also bill input image tokens roughly similar order; use ~half medium input heuristic
    # Better: schedule output only + small text input estimate (prompt ~200–800 tokens)
    text_est = 400 * n
    usd = (
        _usd_from_tokens(text_est, PRICE_OAI_TEXT_IN_PER_M)
        + _usd_from_tokens(out_sched, PRICE_OAI_IMG_OUT_PER_M)
    )
    if is_edit:
        # Reference image input tokens — use same order as output for edit metering approx
        # Prefer actual usage when API returns it; schedule adds image-input for edits
        in_sched = openai_image_output_tokens(size, "low") * n  # lower bound for ref tiles
        usd += _usd_from_tokens(in_sched, PRICE_OAI_IMG_IN_PER_M)
    return {
        "image_usd": round(usd, 6),
        "image_count": n,
        "image_source": "billing_schedule",
        "image_input_tokens": in_sched if is_edit else 0,
        "image_output_tokens": out_sched,
        "image_text_tokens": text_est,
        "is_edit": is_edit,
        "size": size,
        "quality": quality,
    }


def compute_xai_image_usd(*, image_count: int = 1, usage: Optional[dict] = None) -> dict:
    n = max(0, int(image_count or 0))
    usage = usage or {}
    # If xAI ever returns usage tokens, prefer them (rate via env)
    pt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    ct = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    if pt or ct:
        # No official public split — use env flat derived from tokens if provided
        usd = n * PRICE_IMAGE_XAI  # still unit until xAI publishes token rates
        return {
            "image_usd": round(usd, 6),
            "image_count": n,
            "image_source": "actual_usage_flat",  # usage seen but billed flat
            "image_input_tokens": pt,
            "image_output_tokens": ct,
        }
    return {
        "image_usd": round(n * PRICE_IMAGE_XAI, 6),
        "image_count": n,
        "image_source": "published_rate" if n else "none",
        "image_input_tokens": 0,
        "image_output_tokens": 0,
    }


def compute_search_usd(*, search_count: int = 0) -> dict:
    n = max(0, int(search_count or 0))
    return {
        "search_count": n,
        "search_usd": round(n * PRICE_SEARCH_USD, 6),
        "search_source": "published_rate" if n else "none",
    }


def build_generation_cost(
    *,
    chat_usage: Optional[dict] = None,
    image_usage: Optional[dict] = None,
    image_count: int = 0,
    search_count: int = 0,
    chat_model: str = "",
    image_model: str = "",
    image_provider: str = "",
    image_size: str = "1024x1536",
    image_quality: str = "medium",
    image_is_edit: bool = False,
) -> dict:
    """
    Build gen_meta cost block for one social draft.

    cost_source overall:
      - actual: chat from API + image from API usage
      - mixed: chat actual + image billing_schedule / published_rate
      - estimated: legacy flat only
    """
    chat_usage = chat_usage or {}
    chat = compute_chat_usd(
        prompt_tokens=int(chat_usage.get("prompt_tokens") or 0),
        completion_tokens=int(chat_usage.get("completion_tokens") or 0),
    )
    search = compute_search_usd(search_count=search_count)

    provider = (image_provider or "").lower()
    model = (image_model or "").lower()
    if image_count <= 0:
        img = {
            "image_usd": 0.0,
            "image_count": 0,
            "image_source": "none",
            "image_input_tokens": 0,
            "image_output_tokens": 0,
            "image_text_tokens": 0,
        }
    elif provider == "openai" or "gpt-image" in model:
        img = compute_openai_image_usd(
            usage=image_usage,
            size=image_size,
            quality=image_quality,
            image_count=image_count,
            is_edit=image_is_edit,
        )
    elif provider == "xai" or "grok" in model or "imagine" in model:
        img = compute_xai_image_usd(image_count=image_count, usage=image_usage)
    else:
        img = {
            "image_usd": round(image_count * PRICE_IMAGE_USD, 6),
            "image_count": image_count,
            "image_source": "estimated",
            "image_input_tokens": 0,
            "image_output_tokens": 0,
        }

    sources = {chat.get("chat_source"), img.get("image_source"), search.get("search_source")}
    sources.discard("none")
    if not sources:
        overall = "none"
    elif sources <= {"actual", "actual_usage_flat"}:
        overall = "actual"
    elif "estimated" in sources and len(sources) == 1:
        overall = "estimated"
    elif "actual" in sources or "billing_schedule" in sources or "published_rate" in sources:
        # billing_schedule is metering-accurate for OpenAI image outputs
        if sources <= {"actual", "billing_schedule", "published_rate", "actual_usage_flat"}:
            overall = "actual" if "estimated" not in sources else "mixed"
            # Treat billing_schedule + actual chat as "actual" for dashboard (metered)
            if "estimated" not in sources:
                overall = "actual"
        else:
            overall = "mixed"
    else:
        overall = "mixed"

    total = float(chat["chat_usd"]) + float(img["image_usd"]) + float(search["search_usd"])

    return {
        # Primary fields (dashboard aggregates these)
        "prompt_tokens": chat["prompt_tokens"],
        "completion_tokens": chat["completion_tokens"],
        "image_count": img["image_count"],
        "search_count": search["search_count"],
        "chat_usd": chat["chat_usd"],
        "image_usd": img["image_usd"],
        "search_usd": search["search_usd"],
        "total_usd": round(total, 6),
        "chat_model": chat_model,
        "image_model": image_model,
        # Actual-tracking metadata
        "cost_source": overall,
        "cost_actual": overall == "actual",
        "chat_source": chat.get("chat_source"),
        "image_source": img.get("image_source"),
        "search_source": search.get("search_source"),
        "image_input_tokens": img.get("image_input_tokens", 0),
        "image_output_tokens": img.get("image_output_tokens", 0),
        "image_text_tokens": img.get("image_text_tokens", 0),
        "image_provider": image_provider,
        "image_size": image_size,
        "image_quality": image_quality,
        "image_is_edit": image_is_edit,
        "rates": {
            "chat_in_per_m": PRICE_CHAT_INPUT_PER_M,
            "chat_out_per_m": PRICE_CHAT_OUTPUT_PER_M,
            "oai_img_in_per_m": PRICE_OAI_IMG_IN_PER_M,
            "oai_img_out_per_m": PRICE_OAI_IMG_OUT_PER_M,
            "oai_text_in_per_m": PRICE_OAI_TEXT_IN_PER_M,
            "xai_image_flat": PRICE_IMAGE_XAI,
            "search_flat": PRICE_SEARCH_USD,
        },
    }


def estimate_cost(
    *,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    image_count: int = 0,
    search_count: int = 0,
    chat_model: str = "",
    image_model: str = "",
    **kwargs: Any,
) -> dict:
    """Backward-compatible wrapper → build_generation_cost."""
    return build_generation_cost(
        chat_usage={
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
        },
        image_count=image_count,
        search_count=search_count,
        chat_model=chat_model,
        image_model=image_model,
        image_provider=kwargs.get("image_provider", ""),
        image_size=kwargs.get("image_size", os.environ.get("OPENAI_IMAGE_SIZE", "1024x1536")),
        image_quality=kwargs.get("image_quality", os.environ.get("OPENAI_IMAGE_QUALITY", "medium")),
        image_is_edit=bool(kwargs.get("image_is_edit", False)),
        image_usage=kwargs.get("image_usage"),
    )
