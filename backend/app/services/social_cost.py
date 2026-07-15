"""
Cost estimation for social-post generation.

Cheap-mode target (SOCIAL_CHEAP_MODE=1, default):
  ~$0.06–0.09 / full draft  = 1× chat + 0–1× search + 1× image (never 2× image)

Per-unit USD prices (overridable via env) based on published 2026 rates:
  - xAI grok-4 chat:            $3.00 / 1M input tokens, $15.00 / 1M output tokens
  - xAI grok-imagine image:     ~$0.05 / image
  - Tavily advanced search:     ~$0.016 / search
Cost is an ESTIMATE for business monitoring, not an invoice.
"""

from __future__ import annotations

import os

PRICE_CHAT_INPUT_PER_M = float(os.environ.get("SOCIAL_COST_CHAT_INPUT_PER_M", "3.0"))
PRICE_CHAT_OUTPUT_PER_M = float(os.environ.get("SOCIAL_COST_CHAT_OUTPUT_PER_M", "15.0"))
# Default image rate ≈ gpt-image-2 medium portrait (~$0.041) or Grok ~$0.05
PRICE_IMAGE_USD = float(os.environ.get("SOCIAL_COST_IMAGE_USD", "0.045"))
PRICE_SEARCH_USD = float(os.environ.get("SOCIAL_COST_SEARCH_USD", "0.016"))
# Optional model-specific overrides
PRICE_IMAGE_GPT2_MEDIUM = float(os.environ.get("SOCIAL_COST_GPT_IMAGE2_MEDIUM", "0.041"))
PRICE_IMAGE_GPT2_HIGH = float(os.environ.get("SOCIAL_COST_GPT_IMAGE2_HIGH", "0.165"))
PRICE_IMAGE_XAI = float(os.environ.get("SOCIAL_COST_XAI_IMAGE", "0.05"))

# Pipeline knobs (mirrored here for ops docs; enforced in worker/image gen)
CHEAP_MODE = os.environ.get("SOCIAL_CHEAP_MODE", "1").strip().lower() not in ("0", "false", "no")


def estimate_cost(
    *,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    image_count: int = 0,
    search_count: int = 0,
    chat_model: str = "",
    image_model: str = "",
) -> dict:
    """Return a per-generation cost breakdown dict (USD)."""
    prompt_tokens = int(prompt_tokens or 0)
    completion_tokens = int(completion_tokens or 0)
    image_count = int(image_count or 0)
    search_count = int(search_count or 0)

    chat_usd = (
        prompt_tokens / 1_000_000 * PRICE_CHAT_INPUT_PER_M
        + completion_tokens / 1_000_000 * PRICE_CHAT_OUTPUT_PER_M
    )
    unit = PRICE_IMAGE_USD
    im = (image_model or "").lower()
    if "gpt-image-2" in im or im.endswith("image-2"):
        q = os.environ.get("OPENAI_IMAGE_QUALITY", "medium").lower()
        unit = PRICE_IMAGE_GPT2_HIGH if q == "high" else PRICE_IMAGE_GPT2_MEDIUM
    elif "grok" in im or "xai" in im or "imagine" in im:
        unit = PRICE_IMAGE_XAI
    image_usd = image_count * unit
    search_usd = search_count * PRICE_SEARCH_USD
    total_usd = chat_usd + image_usd + search_usd

    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "image_count": image_count,
        "search_count": search_count,
        "chat_usd": round(chat_usd, 6),
        "image_usd": round(image_usd, 6),
        "search_usd": round(search_usd, 6),
        "total_usd": round(total_usd, 6),
        "chat_model": chat_model,
        "image_model": image_model,
        "image_unit_usd": unit,
    }
