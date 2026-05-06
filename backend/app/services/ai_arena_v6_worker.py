"""
LuxQuant AI Arena Worker v6 — 3-Stage AI Pipeline
==================================================
Pipeline:
  Stage 1 (GPT-4o-mini)  → Compress raw 23 BG metrics + cycle + confluence
                            into structured layer briefs (~$0.005/run)
  Stage 2 (DeepSeek R1)  → Reasoning chain + multi-horizon verdict +
                            zones + risk scenarios (~$0.015/run)
  Stage 3 (GPT-4o)       → Self-critique audit (~$0.005/run)

Total cost: ~$0.025/run × 4 reports/day × 30 days = ~$3/month baseline
With anomaly triggers (avg 1-3/day): ~$4-7/month total.

Schedule: 00:00 / 06:00 / 12:00 / 18:00 UTC (every 6 hours).
Anomaly: tightened threshold + 30-min cooldown between anomaly reports.

Output stored in:
  - ai_arena_reports.report_json (ReportBundleV6 schema)
  - Redis key lq:ai-report-v6:latest (TTL 86400s)
  - Redis key lq:ai-report-v6:history (last 30 reports)

Uses Phase 1 modules:
  - app.services.bg_advanced.BGClient (data fetcher)
  - app.services.cycle_position (cycle scoring)
  - app.services.confluence_engine (rule-based layer aggregation)
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import traceback
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
from openai import AsyncOpenAI

from app.services import bg_advanced, confluence_engine, cycle_position
from app.services.verdict_schema import (
    CompleteVerdict,
    LayerBriefBundle,
    ReportBundleV6,
    SelfCritique,
)

# Phase 3 — DB persistence helpers
try:
    from app.services.ai_arena_v6_persist import (
        get_previous_verdict_context,
        persist_report_to_db,
    )
    _PERSIST_AVAILABLE = True
except ImportError:
    # Allow worker to run without DB persistence (smoke test mode)
    _PERSIST_AVAILABLE = False
    get_previous_verdict_context = lambda: None  # noqa: E731
    persist_report_to_db = lambda b: None  # noqa: E731

load_dotenv()


# ════════════════════════════════════════════════════════════════════════
# Configuration
# ════════════════════════════════════════════════════════════════════════

REPORT_TTL = 86400  # 24h
HISTORY_MAX = 30
SCHEMA_VERSION = "v6.1"

# Models
MODEL_STAGE1 = "gpt-4o-mini"
MODEL_STAGE2 = "deepseek-reasoner"
MODEL_STAGE3 = "gpt-4o"

# Approximate costs per 1K tokens (USD) — rough estimates for tracking
COST_RATES = {
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "deepseek-reasoner": {"input": 0.00055, "output": 0.00219},  # DeepSeek R1
    "gpt-4o": {"input": 0.0025, "output": 0.01},
}


def _log(msg: str, level: str = "INFO") -> None:
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[arena-v6 {ts}] {level}: {msg}", flush=True)


# ════════════════════════════════════════════════════════════════════════
# Clients
# ════════════════════════════════════════════════════════════════════════

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
deepseek_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
)


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = COST_RATES.get(model, {"input": 0.0, "output": 0.0})
    return (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1000


# ════════════════════════════════════════════════════════════════════════
# Stage 1 — GPT-4o-mini compresses raw metrics into layer briefs
# ════════════════════════════════════════════════════════════════════════

STAGE1_SYSTEM_PROMPT = """You are a senior crypto market analyst. Your task is to compress raw market data into structured "layer briefs" — narrative summaries grouped by analytical lens.

You will receive:
1. BG_SNAPSHOT — 23 metrics across cycle/macro/smart-money/onchain/risk tiers
2. CYCLE_POSITION — composite cycle score (0=bottom, 100=top) with phase classification
3. CONFLUENCE — rule-based per-layer verdicts (macro/smart_money/onchain)
4. PRICE_CONTEXT — current BTC price + recent action

Produce a JSON object matching this exact schema (no prose, no markdown):

{
  "macro": {
    "layer": "macro",
    "direction": "bullish" | "bearish" | "neutral",
    "strength": 0.0-1.0,
    "headline": "single sentence (≤140 chars)",
    "key_points": ["point1", "point2", ...] (2-5 items),
    "notable_metrics": ["M2 $119.4T", "YoY +6.93%", ...] (2-4 items)
  },
  "smart_money": {... same shape ...},
  "onchain": {... same shape ...},
  "cycle": {
    "score": 0-100,
    "phase": "DEEP_BOTTOM" | "ACCUMULATION" | "EARLY_BULL" | "MID_BULL" | "LATE_BULL" | "DISTRIBUTION" | "TOP",
    "confidence": "low" | "medium" | "high",
    "interpretation": "≤240 chars"
  },
  "overall_setup": "≤280 char synthesis paragraph"
}

Guidelines:
- Direction must match the strongest signal in the layer (neutral if mixed)
- Strength reflects conviction: 0.7+ for clear setups, 0.3-0.6 for mixed, <0.3 for noisy
- key_points should cite actual metric values, not vague claims
- notable_metrics format: "<name> <value>" with units (e.g. "Top traders 43% long")
- overall_setup should weave macro/smart/onchain into one coherent thesis

Return ONLY the JSON object. Do not wrap in markdown fences or add commentary."""


def _format_stage1_input(
    bg_snapshot: dict,
    cycle_result,
    confluence_result,
    btc_price: float,
    price_context: dict,
) -> str:
    """Build the user prompt for Stage 1."""
    # Compact BG snapshot
    bg_lines = []
    for key, metric in bg_snapshot.items():
        if not metric.ok:
            continue
        val = metric.value
        if isinstance(val, float):
            if abs(val) > 1e9:
                val_str = f"{val:.3e}"
            else:
                val_str = f"{val:.4g}"
        else:
            val_str = str(val)
        bg_lines.append(f"  {key}: {val_str}")

    cycle_dict = cycle_result.to_dict() if hasattr(cycle_result, "to_dict") else {}
    conf_dict = confluence_result.to_dict() if hasattr(confluence_result, "to_dict") else {}

    return f"""BG_SNAPSHOT (23 metrics):
{chr(10).join(bg_lines)}

CYCLE_POSITION:
  Score: {cycle_dict.get('score', 'n/a')} / 100
  Phase: {cycle_dict.get('phase', 'n/a')} ({cycle_dict.get('phase_label', '')})
  Confidence: {cycle_dict.get('confidence', 'n/a')}
  Pi-Cycle Triggered: {cycle_dict.get('pi_cycle_triggered', False)}
  Notes: {'; '.join(cycle_dict.get('notes', [])) or 'none'}

CONFLUENCE (rule-based):
  Strength: {conf_dict.get('strength', 'n/a')}
  Direction: {conf_dict.get('dominant_direction', 'n/a')}
  Counts: {conf_dict.get('bullish_count', 0)} bullish / {conf_dict.get('bearish_count', 0)} bearish / {conf_dict.get('neutral_count', 0)} neutral
  Summary: {conf_dict.get('summary', '')}
  Layer verdicts:
    macro: {conf_dict.get('layers', {}).get('macro_liquidity', {}).get('verdict', 'n/a')} (strength {conf_dict.get('layers', {}).get('macro_liquidity', {}).get('strength', 0):.2f})
    smart_money: {conf_dict.get('layers', {}).get('smart_money', {}).get('verdict', 'n/a')} (strength {conf_dict.get('layers', {}).get('smart_money', {}).get('strength', 0):.2f})
    onchain: {conf_dict.get('layers', {}).get('onchain', {}).get('verdict', 'n/a')} (strength {conf_dict.get('layers', {}).get('onchain', {}).get('strength', 0):.2f})

PRICE_CONTEXT:
  BTC price: ${btc_price:,.0f}
  24h change: {price_context.get('change_24h_pct', 'n/a')}%
  7d change: {price_context.get('change_7d_pct', 'n/a')}%

Compress this into the layer-brief JSON schema. Be specific with numbers, concise with words."""


async def stage1_compress(
    bg_snapshot: dict,
    cycle_result,
    confluence_result,
    btc_price: float,
    price_context: dict,
) -> tuple[LayerBriefBundle, dict]:
    """
    Stage 1: GPT-4o-mini compresses raw data into structured briefs.
    Returns (parsed bundle, cost_metadata).
    """
    user_prompt = _format_stage1_input(
        bg_snapshot, cycle_result, confluence_result, btc_price, price_context
    )

    _log("Stage 1 — compressing raw data via GPT-4o-mini")
    t0 = time.monotonic()

    resp = await openai_client.chat.completions.create(
        model=MODEL_STAGE1,
        messages=[
            {"role": "system", "content": STAGE1_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=1500,
    )

    raw_json = resp.choices[0].message.content or "{}"
    bundle = LayerBriefBundle.model_validate_json(raw_json)

    usage = resp.usage
    cost = _estimate_cost(MODEL_STAGE1, usage.prompt_tokens, usage.completion_tokens)
    elapsed = time.monotonic() - t0

    _log(f"Stage 1 done in {elapsed:.1f}s — tokens in={usage.prompt_tokens}/out={usage.completion_tokens}, cost ~${cost:.4f}")

    return bundle, {
        "model": MODEL_STAGE1,
        "input_tokens": usage.prompt_tokens,
        "output_tokens": usage.completion_tokens,
        "cost_usd": cost,
        "elapsed_s": elapsed,
    }


# ════════════════════════════════════════════════════════════════════════
# Stage 2 — DeepSeek R1 reasons + decides verdict
# ════════════════════════════════════════════════════════════════════════

STAGE2_SYSTEM_PROMPT = """You are an elite BTC market strategist with deep on-chain, macro, and derivatives expertise. You produce trading-desk quality verdicts for active crypto traders.

You will receive:
1. LAYER_BRIEFS — three pre-digested layer briefs (macro / smart_money / onchain) + cycle position
2. PRICE_DATA — current price + recent action + key price levels
3. PREVIOUS_VERDICT (optional) — last verdict for continuity / "what changed"

Produce a JSON object matching this exact schema:

{
  "headline": "≤120 char one-line BLUF (e.g. 'Cautiously Bullish — Macro Tailwind, Smart-Money Hedged')",
  "narrative": "≤480 char setup description (2-3 sentences)",

  "primary_30d": {"direction": "bullish/bearish/neutral", "confidence": 0-100, "rationale": "≤180 chars"},
  "secondary_7d": {"direction": "...", "confidence": 0-100, "rationale": "..."},
  "tactical_24h": {"direction": "...", "confidence": 0-100, "rationale": "..."},

  "reasoning_chain": [
    {"step": 1, "title": "≤80", "observation": "≤260", "interpretation": "≤260", "implication": "≤200"},
    ... (4-7 steps total)
  ],

  "invalidation_levels": [
    {"direction": "bullish_invalidated", "price": <number>, "reason": "≤140"},
    {"direction": "bearish_invalidated", "price": <number>, "reason": "≤140"}
  ],

  "zones_to_watch": [
    {"kind": "demand", "price_low": <num>, "price_high": <num>, "why": "≤180", "liquidity_note": "optional ≤140"},
    {"kind": "fair_value", "price_low": <num>, "price_high": <num>, "why": "≤180"},
    {"kind": "supply", "price_low": <num>, "price_high": <num>, "why": "≤180", "liquidity_note": "optional ≤140"}
  ],

  "triple_screen": [
    {"timeframe": "1D", "state": "UPTREND/DOWNTREND/BULLISH/BEARISH/NEUTRAL/MIXED", "note": "≤120"},
    {"timeframe": "4H", "state": "...", "note": "..."},
    {"timeframe": "1H", "state": "...", "note": "..."}
  ],

  "risk_scenarios": [
    {"title": "≤80", "severity": "low/medium/high", "threshold": "≤120 (e.g. 'BTC closes < $72,500')", "why_matters": "≤200"},
    ... (3-6 scenarios)
  ],

  "what_changed": "≤320 char (only if previous verdict provided, else null)"
}

CRITICAL principles:
- Be evidence-based: every claim must trace to a brief / metric
- Confluence-weighted: primary_30d should reflect cycle + macro layers; tactical_24h should reflect smart_money + price action
- Specific, not vague: prefer "STH-MVRV at 0.99 signals neutral" over "on-chain looks ok"
- Invalidation levels must be specific prices that would flip the thesis
- Zones should reference real price levels, not theoretical
- Reasoning chain shows your work — observation (data) → interpretation (meaning) → implication (action context)
- If previous verdict differs from current, explain WHY in what_changed (data shifts, not opinion changes)

Return ONLY the JSON object."""


def _format_stage2_input(
    bundle: LayerBriefBundle,
    btc_price: float,
    price_context: dict,
    previous_verdict: Optional[dict] = None,
) -> str:
    prev_block = ""
    if previous_verdict:
        prev_age_h = previous_verdict.get("age_hours", "?")
        prev_block = f"""
PREVIOUS_VERDICT ({prev_age_h}h ago):
  Headline: {previous_verdict.get('headline', 'n/a')}
  Primary (30d): {previous_verdict.get('primary_direction', 'n/a')} {previous_verdict.get('primary_confidence', 0)}%
  Tactical (24h): {previous_verdict.get('tactical_direction', 'n/a')}
  Price at call: ${previous_verdict.get('btc_price', 0):,.0f}
"""

    return f"""LAYER_BRIEFS:

[MACRO]
  Direction: {bundle.macro.direction} (strength {bundle.macro.strength:.2f})
  Headline: {bundle.macro.headline}
  Key points:
{chr(10).join(f'    - {p}' for p in bundle.macro.key_points)}
  Notable metrics: {', '.join(bundle.macro.notable_metrics)}

[SMART_MONEY]
  Direction: {bundle.smart_money.direction} (strength {bundle.smart_money.strength:.2f})
  Headline: {bundle.smart_money.headline}
  Key points:
{chr(10).join(f'    - {p}' for p in bundle.smart_money.key_points)}
  Notable metrics: {', '.join(bundle.smart_money.notable_metrics)}

[ONCHAIN]
  Direction: {bundle.onchain.direction} (strength {bundle.onchain.strength:.2f})
  Headline: {bundle.onchain.headline}
  Key points:
{chr(10).join(f'    - {p}' for p in bundle.onchain.key_points)}
  Notable metrics: {', '.join(bundle.onchain.notable_metrics)}

[CYCLE]
  Score: {bundle.cycle.score:.1f} / 100
  Phase: {bundle.cycle.phase}
  Confidence: {bundle.cycle.confidence}
  Interpretation: {bundle.cycle.interpretation}

[OVERALL_SETUP]
{bundle.overall_setup}

PRICE_DATA:
  Current BTC: ${btc_price:,.0f}
  24h change: {price_context.get('change_24h_pct', 'n/a')}%
  7d change: {price_context.get('change_7d_pct', 'n/a')}%
  Recent high/low (24h): {price_context.get('high_24h', 'n/a')} / {price_context.get('low_24h', 'n/a')}
{prev_block}
Now produce the verdict JSON. Specific. Evidence-based. No fluff."""


def _repair_json(raw: str) -> str:
    """Best-effort JSON repair for truncated LLM output (v6.3)."""
    import re
    s = raw.strip()
    if not s:
        return "{}"
    # Strip trailing comma before missing closing brace
    s = re.sub(r',\s*$', '', s)
    # Count unclosed braces/brackets and append closures
    open_braces = s.count('{') - s.count('}')
    open_brackets = s.count('[') - s.count(']')
    # Close any unterminated string (odd quote count not preceded by escape)
    quotes = re.findall(r'(?<!\\)"', s)
    if len(quotes) % 2 == 1:
        s += '"'
    # Append missing closing tokens
    s += ']' * max(open_brackets, 0)
    s += '}' * max(open_braces, 0)
    return s


async def stage2_reason(
    bundle: LayerBriefBundle,
    btc_price: float,
    price_context: dict,
    previous_verdict: Optional[dict] = None,
) -> tuple[CompleteVerdict, dict]:
    """Stage 2: DeepSeek R1 reasoning + verdict generation."""
    user_prompt = _format_stage2_input(bundle, btc_price, price_context, previous_verdict)

    _log("Stage 2 — reasoning + verdict via DeepSeek R1")
    t0 = time.monotonic()

    resp = await deepseek_client.chat.completions.create(
        model=MODEL_STAGE2,
        messages=[
            {"role": "system", "content": STAGE2_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        max_tokens=8000,
    )

    # ── v6.3: detect truncation + retry + JSON repair ──
    finish_reason = resp.choices[0].finish_reason
    raw_json = resp.choices[0].message.content or "{}"

    if finish_reason == "length":
        _log(f"WARN Stage 2: response truncated (finish_reason=length, {len(raw_json)} chars). Retrying with concise hint...")
        resp = await deepseek_client.chat.completions.create(
            model=MODEL_STAGE2,
            messages=[
                {"role": "system", "content": STAGE2_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt + "\n\nIMPORTANT: Be concise. Output complete valid JSON within token budget."},
            ],
            response_format={"type": "json_object"},
            max_tokens=8000,
            temperature=0.3,
        )
        finish_reason = resp.choices[0].finish_reason
        raw_json = resp.choices[0].message.content or "{}"
        _log(f"Stage 2 retry done (finish_reason={finish_reason}, {len(raw_json)} chars)")

    try:
        verdict = CompleteVerdict.model_validate_json(raw_json)
    except Exception as parse_err:
        _log(f"WARN Stage 2: JSON parse failed ({type(parse_err).__name__}), attempting repair...")
        repaired = _repair_json(raw_json)
        verdict = CompleteVerdict.model_validate_json(repaired)
        _log("Stage 2: JSON repaired successfully")

    usage = resp.usage
    cost = _estimate_cost(MODEL_STAGE2, usage.prompt_tokens, usage.completion_tokens)
    elapsed = time.monotonic() - t0

    _log(f"Stage 2 done in {elapsed:.1f}s — tokens in={usage.prompt_tokens}/out={usage.completion_tokens}, cost ~${cost:.4f}")

    return verdict, {
        "model": MODEL_STAGE2,
        "input_tokens": usage.prompt_tokens,
        "output_tokens": usage.completion_tokens,
        "cost_usd": cost,
        "elapsed_s": elapsed,
    }


# ════════════════════════════════════════════════════════════════════════
# Stage 3 — GPT-4o self-critique audit
# ════════════════════════════════════════════════════════════════════════

STAGE3_SYSTEM_PROMPT = """You are a senior peer reviewer auditing a market verdict produced by another analyst. Your job: catch overconfidence, internal contradictions, and unsupported claims. You are skeptical but fair.

You will receive:
1. THE_VERDICT — full verdict produced by the prior stage
2. SOURCE_BRIEFS — the layer briefs the verdict was based on
3. CONFLUENCE_FACTS — rule-based confluence output (independent ground truth)

Produce a JSON object matching this schema:

{
  "decision": "approved" | "approved_with_caveat" | "needs_revision",
  "overall_assessment": "≤280 char summary judgment",
  "strengths": ["≤120 each", ...] (0-4 items),
  "concerns": ["≤120 each", ...] (0-4 items),
  "overconfidence_flag": true|false,
  "contradictions_found": ["≤120 each", ...] (0-3 items),
  "suggested_caveat": "≤200 char or null"
}

Audit dimensions:
1. CONFIDENCE CALIBRATION — Is primary_30d confidence >65% with mixed confluence? That's overconfidence.
2. INTERNAL CONSISTENCY — Does primary_30d direction match the cycle phase? Does tactical_24h contradict triple_screen?
3. EVIDENCE TRACE — Does each reasoning_chain step cite real data, or hand-wave?
4. INVALIDATION LOGIC — Are invalidation prices realistic vs zones? (bullish_invalidated should sit below demand zone)
5. ZONE QUALITY — Do zones reflect actual structure (price clusters, prior reactions) or arbitrary?

Decision rules:
- "approved" — solid, no concerns
- "approved_with_caveat" — sound but needs disclaimer (e.g., low data confidence, contradicting layer)
- "needs_revision" — material flaw that misleads users (overconfidence, contradiction, unsupported claim)

Be concise. Quality over quantity. Return ONLY the JSON."""


def _format_stage3_input(
    verdict: CompleteVerdict,
    bundle: LayerBriefBundle,
    confluence_dict: dict,
) -> str:
    return f"""THE_VERDICT:
{verdict.model_dump_json(indent=2)}

SOURCE_BRIEFS:
{bundle.model_dump_json(indent=2)}

CONFLUENCE_FACTS (rule-based, independent ground truth):
  Strength: {confluence_dict.get('strength')}
  Direction: {confluence_dict.get('dominant_direction')}
  Counts: {confluence_dict.get('bullish_count')}↑/{confluence_dict.get('bearish_count')}↓/{confluence_dict.get('neutral_count')}→
  Layer breakdown:
    macro: {confluence_dict.get('layers', {}).get('macro_liquidity', {}).get('verdict')} ({confluence_dict.get('layers', {}).get('macro_liquidity', {}).get('strength', 0):.2f})
    smart_money: {confluence_dict.get('layers', {}).get('smart_money', {}).get('verdict')} ({confluence_dict.get('layers', {}).get('smart_money', {}).get('strength', 0):.2f})
    onchain: {confluence_dict.get('layers', {}).get('onchain', {}).get('verdict')} ({confluence_dict.get('layers', {}).get('onchain', {}).get('strength', 0):.2f})

Audit. Be specific. Return JSON only."""


async def stage3_critique(
    verdict: CompleteVerdict,
    bundle: LayerBriefBundle,
    confluence_dict: dict,
) -> tuple[SelfCritique, dict]:
    """Stage 3: GPT-4o audit of verdict."""
    user_prompt = _format_stage3_input(verdict, bundle, confluence_dict)

    _log("Stage 3 — self-critique via GPT-4o")
    t0 = time.monotonic()

    resp = await openai_client.chat.completions.create(
        model=MODEL_STAGE3,
        messages=[
            {"role": "system", "content": STAGE3_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=1200,
    )

    raw_json = resp.choices[0].message.content or "{}"
    critique = SelfCritique.model_validate_json(raw_json)

    usage = resp.usage
    cost = _estimate_cost(MODEL_STAGE3, usage.prompt_tokens, usage.completion_tokens)
    elapsed = time.monotonic() - t0

    _log(f"Stage 3 done in {elapsed:.1f}s — tokens in={usage.prompt_tokens}/out={usage.completion_tokens}, cost ~${cost:.4f}")
    _log(f"Stage 3 decision: {critique.decision}")

    return critique, {
        "model": MODEL_STAGE3,
        "input_tokens": usage.prompt_tokens,
        "output_tokens": usage.completion_tokens,
        "cost_usd": cost,
        "elapsed_s": elapsed,
    }


# ════════════════════════════════════════════════════════════════════════
# Top-level pipeline orchestrator
# ════════════════════════════════════════════════════════════════════════

async def generate_v6_report(
    btc_price: float,
    price_context: Optional[dict] = None,
    previous_verdict: Optional[dict] = None,
    is_anomaly: bool = False,
    anomaly_reason: Optional[str] = None,
) -> ReportBundleV6:
    """
    Run full 3-stage pipeline and return validated report bundle.

    Caller is responsible for:
    - Persisting to DB (ai_arena_reports table)
    - Caching to Redis
    - Computing previous_verdict context (from DB)

    Args:
        btc_price: current BTC price
        price_context: dict with change_24h_pct, change_7d_pct, high_24h, low_24h
        previous_verdict: optional dict from previous report for continuity
        is_anomaly: whether this run was anomaly-triggered
        anomaly_reason: e.g. "price_dump_3.2%_60min"

    Returns:
        ReportBundleV6 (validated, ready to serialize as JSON)
    """
    pipeline_start = time.monotonic()
    price_context = price_context or {}

    # Auto-fetch previous verdict if not provided (Phase 3)
    if previous_verdict is None and _PERSIST_AVAILABLE:
        try:
            previous_verdict = get_previous_verdict_context()
            if previous_verdict:
                _log(
                    f"Loaded previous verdict {previous_verdict['report_id']} "
                    f"({previous_verdict['age_hours']}h ago)"
                )
        except Exception as e:
            _log(f"Could not load previous verdict: {e}", level="WARN")
            previous_verdict = None

    # ─────────────────────────────────────
    # Phase 1: Fetch + analyze (rule-based)
    # ─────────────────────────────────────
    _log("Fetching BG snapshot (23 endpoints)...")
    bg = bg_advanced.BGClient()
    bg_snapshot = await bg.fetch_all()

    ok_count = sum(1 for m in bg_snapshot.values() if m.ok)
    if ok_count < 18:
        raise RuntimeError(
            f"BG snapshot incomplete: only {ok_count}/23 endpoints succeeded. "
            f"Failed: {[k for k, m in bg_snapshot.items() if not m.ok]}"
        )
    _log(f"BG snapshot OK: {ok_count}/23 endpoints")

    cycle_result = cycle_position.from_bg_snapshot(bg_snapshot)
    confluence_result = confluence_engine.compute_all(bg_snapshot=bg_snapshot)
    _log(
        f"Cycle: {cycle_result.score:.1f}/{cycle_result.phase} | "
        f"Confluence: {confluence_result.strength} {confluence_result.dominant_direction} "
        f"({confluence_result.bullish_count}↑/{confluence_result.bearish_count}↓/{confluence_result.neutral_count}→)"
    )

    # ─────────────────────────────────────
    # Phase 2: 3-stage AI pipeline
    # ─────────────────────────────────────
    bundle, cost1 = await stage1_compress(
        bg_snapshot=bg_snapshot,
        cycle_result=cycle_result,
        confluence_result=confluence_result,
        btc_price=btc_price,
        price_context=price_context,
    )

    verdict, cost2 = await stage2_reason(
        bundle=bundle,
        btc_price=btc_price,
        price_context=price_context,
        previous_verdict=previous_verdict,
    )

    confluence_dict = confluence_result.to_dict()
    critique, cost3 = await stage3_critique(
        verdict=verdict,
        bundle=bundle,
        confluence_dict=confluence_dict,
    )

    # ─────────────────────────────────────
    # Assemble bundle
    # ─────────────────────────────────────
    cycle_dict = cycle_result.to_dict()
    bg_summary = {
        k: {"value": m.value, "ok": m.ok, "error": m.error}
        for k, m in bg_snapshot.items()
    }

    total_cost = cost1["cost_usd"] + cost2["cost_usd"] + cost3["cost_usd"]
    elapsed_total = time.monotonic() - pipeline_start

    bundle_v6 = ReportBundleV6(
        schema_version=SCHEMA_VERSION,
        report_id=f"v6_{uuid.uuid4().hex[:10]}",
        generated_at=datetime.now(timezone.utc).isoformat(),
        btc_price=btc_price,
        layer_briefs=bundle,
        verdict=verdict,
        critique=critique,
        confluence=confluence_dict,
        cycle_position=cycle_dict,
        bg_snapshot_summary=bg_summary,
        cost_breakdown={
            "stage1": cost1,
            "stage2": cost2,
            "stage3": cost3,
            "total_usd": total_cost,
        },
        is_anomaly_triggered=is_anomaly,
        anomaly_reason=anomaly_reason,
    )

    # Persist to DB + create pending outcome rows (Phase 3)
    if _PERSIST_AVAILABLE:
        try:
            report_pk = persist_report_to_db(bundle_v6)
            _log(f"Report persisted to DB (pk={report_pk})")
        except Exception as e:
            _log(f"DB persist failed (report still returned): {e}", level="ERROR")

    _log(
        f"Pipeline complete in {elapsed_total:.1f}s | "
        f"cost ~${total_cost:.4f} | "
        f"verdict: {verdict.headline} ({verdict.primary_30d.confidence}% conf) | "
        f"critique: {critique.decision}"
    )

    return bundle_v6


# ════════════════════════════════════════════════════════════════════════
# Convenience helpers
# ════════════════════════════════════════════════════════════════════════

async def run_smoke_test() -> None:
    """Quick end-to-end test (manual run)."""
    _log("=== SMOKE TEST: full v6 pipeline ===")

    # Fetch BTC price (cheap)
    import httpx

    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT")
        ticker = r.json()["result"]["list"][0]
        btc_price = float(ticker["lastPrice"])
        change_24h = float(ticker["price24hPcnt"]) * 100
        high_24h = float(ticker["highPrice24h"])
        low_24h = float(ticker["lowPrice24h"])

    _log(f"BTC: ${btc_price:,.0f} ({change_24h:+.2f}% 24h)")

    price_context = {
        "change_24h_pct": round(change_24h, 2),
        "change_7d_pct": None,
        "high_24h": high_24h,
        "low_24h": low_24h,
    }

    bundle = await generate_v6_report(
        btc_price=btc_price,
        price_context=price_context,
    )

    print("\n" + "=" * 70)
    print(f"REPORT ID: {bundle.report_id}")
    print(f"GENERATED: {bundle.generated_at}")
    print(f"BTC PRICE: ${bundle.btc_price:,.0f}")
    print("=" * 70)
    print(f"\nHEADLINE: {bundle.verdict.headline}")
    print(f"\nNARRATIVE:\n  {bundle.verdict.narrative}")
    print(f"\nVERDICTS:")
    print(f"  30d: {bundle.verdict.primary_30d.direction.upper()} ({bundle.verdict.primary_30d.confidence}%)")
    print(f"       {bundle.verdict.primary_30d.rationale}")
    print(f"  7d : {bundle.verdict.secondary_7d.direction.upper()} ({bundle.verdict.secondary_7d.confidence}%)")
    print(f"  24h: {bundle.verdict.tactical_24h.direction.upper()} ({bundle.verdict.tactical_24h.confidence}%)")
    print(f"\nREASONING ({len(bundle.verdict.reasoning_chain)} steps):")
    for s in bundle.verdict.reasoning_chain:
        print(f"  Step {s.step} — {s.title}")
        print(f"    Obs: {s.observation[:100]}...")
    print(f"\nINVALIDATION:")
    for lv in bundle.verdict.invalidation_levels:
        print(f"  {lv.direction}: ${lv.price:,.0f} — {lv.reason}")
    print(f"\nZONES:")
    for z in bundle.verdict.zones_to_watch:
        print(f"  {z.kind.upper()}: ${z.price_low:,.0f}-${z.price_high:,.0f} — {z.why}")
    print(f"\nTRIPLE SCREEN:")
    for ts in bundle.verdict.triple_screen:
        print(f"  {ts.timeframe}: {ts.state} — {ts.note}")
    print(f"\nRISK SCENARIOS:")
    for r in bundle.verdict.risk_scenarios:
        print(f"  [{r.severity.upper()}] {r.title}")
        print(f"    Threshold: {r.threshold}")
    print(f"\nCRITIQUE: {bundle.critique.decision.upper()}")
    print(f"  {bundle.critique.overall_assessment}")
    if bundle.critique.concerns:
        print(f"  Concerns:")
        for c in bundle.critique.concerns:
            print(f"    - {c}")
    if bundle.critique.suggested_caveat:
        print(f"  Caveat: {bundle.critique.suggested_caveat}")
    print(f"\nCOST BREAKDOWN:")
    for stage in ["stage1", "stage2", "stage3"]:
        s = bundle.cost_breakdown[stage]
        print(f"  {stage}: {s['model']} | tokens {s['input_tokens']}+{s['output_tokens']} | ${s['cost_usd']:.4f}")
    print(f"  TOTAL: ${bundle.cost_breakdown['total_usd']:.4f}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_smoke_test())
