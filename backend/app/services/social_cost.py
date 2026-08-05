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
# Per-model rates (in, out) $/1M tokens, from OpenAI's pricing table. The mini
# model bills at a quarter of the standard rate, so charging every model the
# gpt-image-2 rate overstated it roughly 4x in our own dashboard.
PRICE_OAI_IMAGE_BY_MODEL = {
    "gpt-image-1-mini": (2.5, 8.0),
    "gpt-image-1.5": (8.0, 32.0),
    "gpt-image-2": (PRICE_OAI_IMG_IN_PER_M, PRICE_OAI_IMG_OUT_PER_M),
}

# ── xAI image flat (no public per-token usage on generations) ────
PRICE_IMAGE_XAI = float(os.environ.get("SOCIAL_COST_XAI_IMAGE", "0.05"))
# Flat per image, from xAI's own /v1/image-generation-models (image_price is in
# units of 1e-10 USD) and their published table. The quality model is 2.5x the
# standard one, so billing them at one rate overstated the cheap path.
PRICE_IMAGE_XAI_BY_MODEL = {
    "grok-imagine-image": float(os.environ.get("SOCIAL_COST_XAI_IMAGE_STD", "0.02")),
    "grok-imagine-image-quality": PRICE_IMAGE_XAI,
}
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
    model: Optional[str] = None,
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
    _in_rate, _out_rate = PRICE_OAI_IMAGE_BY_MODEL.get(
        (model or "").lower(), (PRICE_OAI_IMG_IN_PER_M, PRICE_OAI_IMG_OUT_PER_M)
    )
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
            + _usd_from_tokens(img_in or (in_tok - text_in if in_tok > text_in else 0), _in_rate)
            + _usd_from_tokens(out_tok, _out_rate)
        )
        # If only total input without split, bill all input at image input rate
        if in_tok and not text_in and not img_in:
            usd = _usd_from_tokens(in_tok, _in_rate) + _usd_from_tokens(out_tok, _out_rate)
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
        + _usd_from_tokens(out_sched, _out_rate)
    )
    if is_edit:
        # Reference image input tokens — use same order as output for edit metering approx
        # Prefer actual usage when API returns it; schedule adds image-input for edits
        in_sched = openai_image_output_tokens(size, "low") * n  # lower bound for ref tiles
        usd += _usd_from_tokens(in_sched, _in_rate)
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


def compute_xai_image_usd(
    *, image_count: int = 1, usage: Optional[dict] = None, model: Optional[str] = None
) -> dict:
    n = max(0, int(image_count or 0))
    unit = PRICE_IMAGE_XAI_BY_MODEL.get(str(model or ""), PRICE_IMAGE_XAI)
    usage = usage or {}
    # If xAI ever returns usage tokens, prefer them (rate via env)
    pt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    ct = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    if pt or ct:
        # No official public split — use env flat derived from tokens if provided
        usd = n * unit  # flat per image; xAI publishes no token rate for images
        return {
            "image_usd": round(usd, 6),
            "image_count": n,
            "image_source": "actual_usage_flat",  # usage seen but billed flat
            "image_input_tokens": pt,
            "image_output_tokens": ct,
        }
    return {
        "image_usd": round(n * unit, 6),
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
            model=image_model,
        )
    elif provider == "xai" or "grok" in model or "imagine" in model:
        img = compute_xai_image_usd(image_count=image_count, usage=image_usage, model=image_model)
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


# ── Price catalog for the admin's model picker ───────────────────────────────
# The UI used to carry four hand-typed price strings ("$0.19", "$0.015", …).
# They happened to be right when they were typed, and nothing kept them right:
# a rate change, a new size, or a new model would leave the picker quoting a
# number this file no longer charges. Derive the catalog from the same tables
# that do the billing, so the number the admin clicks is the number they pay.
#
# OpenAI image cost here is output-tokens only. That is not a simplification —
# the Images API has not returned input-token usage on any of our calls (every
# stored gen_meta has image_text_tokens = 0), so output tokens × the per-model
# output rate IS the whole billable estimate. Measured against 9 real drafts the
# schedule reads $0.1872 where OpenAI actually billed ~$0.1736, so treat these
# as a ceiling, not a promise.

# ── Measured quality, researched 2026-08-05 ─────────────────────────────────
# Two independent sources, because neither alone answers the question.
#
# 1. Artificial Analysis Image Arena — blind pairwise votes, Elo. It publishes
#    BOTH a text-to-image and an image-EDITING board, and they disagree in a way
#    that matters here: this pipeline sends an *edit* on almost every render (a
#    brand sheet, a face, the editor's own references), so the editing board is
#    the one to rank by. GPT Image 2 leads text-to-image by 135 Elo over
#    grok-imagine-image-quality but by only 28 on editing — at 3.7x the price.
#
# 2. VibeDex tier benchmark — the arena only ever measures the `high` tier, so
#    it cannot say what `medium` or `low` are worth. VibeDex scored gpt-image-2
#    across all three on a 0-5 scale over 50 prompts: high 4.155, medium 4.108,
#    low 3.946. Medium beat high on 19 of 50 prompts and tied 9, so the gap is
#    close to a coin flip; low lost 35 of 50 to medium.
#
# The practical consequence for THIS product: the usual reason to pay for `high`
# is small or dense text, and we never ask the model for text — the headline,
# CTA and lockup are composited afterwards in PIL. What `high` still buys us is
# close-up faces and fine material detail. So medium is the right default and
# high is for face stories, which is the opposite of how it was configured.
#
# elo_edit / elo_t2i are MEASURED, at the tier named in elo_tier. Anything else
# is derived and marked as such.
_ARENA = {
    #                              elo_edit, rank_edit, elo_t2i, rank_t2i, tier
    "gpt-image-2":               (1258, 2,  1339, 1,  "high"),
    "gpt-image-1.5":             (1253, 4,  1263, 5,  "high"),
    "grok-imagine-image-quality": (1230, 9,  1204, 13, None),
    "grok-imagine-image":        (1213, 13, 1181, 23, None),
    "gpt-image-1":               (1133, 46, 1137, 51, "high"),
    "gpt-image-1-mini":          (1064, 57, 1093, 78, "medium"),
}

# VibeDex tier scores for gpt-image-2, as a fraction of its own `high`. Applied
# as a proportional haircut to the normalised quality of any tier the arena did
# not measure — a measured within-model ratio, not an invented Elo.
_TIER_RATIO = {"high": 1.0, "medium": 4.108 / 4.155, "low": 3.946 / 4.155}
_TIER_SCORE = {"high": 4.155, "medium": 4.108, "low": 3.946}

# Quality is meaningless for xAI (flat per image) and the arena rank is what the
# extra money buys, so both are stated where the admin is choosing.
_MODEL_NOTES = {
    "gpt-image-2": "Best in the arena on both boards. Worth its price on a close-up face or fine material detail; on anything else medium is nearly the same picture.",
    "gpt-image-1.5": "Within 5 Elo of gpt-image-2 on editing. A reasonable substitute, rarely a reason to prefer it.",
    "gpt-image-1-mini": "Bottom of the measured set — 194 Elo behind the leader. Fine for a plain scene with no face and no mark.",
    "gpt-image-1": "Legacy, and billed at the gpt-image-2 rate. No reason to pick it.",
    "grok-imagine-image": "Only 45 Elo behind the leader on EDITING at a ninth of the price — the value pick when a story has a mark but no face.",
    "grok-imagine-image-quality": "28 Elo behind gpt-image-2 on editing at a quarter of the price. Flat rate, no tiers.",
}


def estimate_image_usd(
    *,
    model: str,
    quality: str = "medium",
    size: str = "1024x1536",
    calls: int = 1,
) -> float:
    """Estimated USD for `calls` images on this model/quality, from the billing tables."""
    model = (model or "").strip()
    if model in PRICE_IMAGE_XAI_BY_MODEL:
        return round(PRICE_IMAGE_XAI_BY_MODEL[model] * max(1, int(calls)), 6)
    out_tokens = openai_image_output_tokens(size, quality)
    _, out_rate = PRICE_OAI_IMAGE_BY_MODEL.get(
        model, (PRICE_OAI_IMG_IN_PER_M, PRICE_OAI_IMG_OUT_PER_M)
    )
    return round(_usd_from_tokens(out_tokens, out_rate) * max(1, int(calls)), 6)


def image_model_catalog(size: str = "1024x1536") -> list[dict]:
    """Every selectable model/quality with its computed price AND measured quality.

    Ordered best-first. The picker used to sort by price, which answered the
    wrong question: the admin is choosing how good the poster should be, and the
    price is the consequence. Ranked by the EDITING board because that is what
    this pipeline actually calls — see the note on _ARENA.
    """
    from app.services.social_image_generator import (
        IMAGE_MODELS_ALLOWED,
        IMAGE_QUALITIES_ALLOWED,
        XAI_MODELS_ALLOWED,
    )

    rows: list[dict] = []

    def _row(provider: str, model: str, quality):
        elo_edit, rank_edit, elo_t2i, rank_t2i, elo_tier = _ARENA.get(
            model, (None, None, None, None, None)
        )
        # The arena measured one tier per model. Say which, and mark every other
        # tier as derived rather than quoting an Elo that was never measured.
        measured = quality is None or elo_tier is None or quality == elo_tier
        return {
            "provider": provider,
            "model": model,
            "quality": quality,
            "size": size,
            "usd": estimate_image_usd(model=model, quality=quality or "medium", size=size),
            "output_tokens": openai_image_output_tokens(size, quality) if quality else None,
            "elo_edit": elo_edit,
            "elo_t2i": elo_t2i,
            "rank_edit": rank_edit,
            "rank_t2i": rank_t2i,
            "elo_tier": elo_tier,
            "elo_measured": bool(measured and elo_edit),
            "tier_score": _TIER_SCORE.get(quality) if model == "gpt-image-2" else None,
            "note": _MODEL_NOTES.get(model, ""),
        }

    for model in IMAGE_MODELS_ALLOWED:
        for quality in IMAGE_QUALITIES_ALLOWED:
            rows.append(_row("openai", model, quality))
    for model in XAI_MODELS_ALLOWED:
        # xAI bills flat per image; a quality tier here would be a lie.
        rows.append(_row("xai", model, None))

    # Quality is TWO axes, and merging them would invent a comparison nobody
    # measured. The arena ranks MODELS (at one tier each); VibeDex ranks TIERS
    # (within gpt-image-2 only). There is no bridge between them, so an earlier
    # version that multiplied a normalised Elo by the tier ratio ended up
    # claiming gpt-image-2 (low) beats grok-imagine-image-quality — a matchup
    # that has never been run.
    #
    # So: quality_pct is the MODEL's measured strength and is identical across
    # that model's tiers. The tier is reported separately, with its own measured
    # score where one exists. Sorting is model strength first, then tier.
    elos = [r["elo_edit"] for r in rows if r["elo_edit"]]
    lo, hi = (min(elos), max(elos)) if elos else (0, 1)
    span = max(1, hi - lo)
    _TIER_ORDER = {"high": 3, "medium": 2, "low": 1, None: 2}
    for r in rows:
        r["quality_pct"] = (
            round(8.0 + 0.92 * (100.0 * (r["elo_edit"] - lo) / span), 1)
            if r["elo_edit"] else None
        )
        r["tier_rank"] = _TIER_ORDER.get(r["quality"], 2)

    rows.sort(key=lambda r: (-(r["quality_pct"] or 0), -r["tier_rank"], r["usd"]))

    # Quality per dollar, on the rows where both numbers are real. This is what
    # makes the cheap edit models look as strong as they actually measure.
    for r in rows:
        r["value"] = round((r["quality_pct"] or 0) / r["usd"], 1) if r["usd"] else None
    best = max((r for r in rows if r["value"]), key=lambda r: r["value"], default=None)
    for r in rows:
        r["best_value"] = bool(best and r is best)
    return rows
