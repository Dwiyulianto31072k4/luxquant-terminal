# backend/app/services/ai_arena_worker.py
"""
LuxQuant AI Arena Worker v4
============================
Pipeline: gather_all_data() → inject context → compress (GPT-4o-mini) → analyze (DeepSeek R1) → cache + DB

v4 Upgrades:
  - BLUF (Bottom Line Up Front) hero verdict
  - Zones to watch (demand/fair/supply) — legal-safe, no entry/stop language
  - Three Pillars (trend/flow/risk) — 4-5 sentences each
  - Deep Analysis (5 narrative sections replacing 4 accordion paragraphs)
  - Analyst Tape with raw tweets preserved (bulls/bears/neutrals)
  - What Changed — explicit diff vs previous report
  - Backward compatible: still stores sections{} for legacy

Cost estimate: ~$0.15/run (DeepSeek) + ~$0.01 (GPT-4o-mini) + ~$0.13 (X API) ≈ $0.29/run
  Scheduled: 2/day = $0.58/day = ~$18/month
  Anomaly: ~1-3 extra/week = ~$5/month
  Total: ~$23/month

Redis keys:
  - lq:ai-report:latest   → most recent report (TTL 86400s = 24hr)
  - lq:ai-report:history  → list of last 30 reports
"""

import json
import os
import uuid
import asyncio
import traceback
from datetime import datetime, timedelta
from typing import Dict, Optional

from openai import AsyncOpenAI
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.redis import cache_get, cache_set, get_redis
from app.services.ai_arena_data import (
    gather_all_data, check_anomaly,
    fetch_bybit_ticker, fetch_coinglass_oi, fetch_fear_greed,
)
from app.core.database import SessionLocal
from app.models.ai_arena import AIArenaReport, AIArenaAnomalyCheck
from dotenv import load_dotenv

load_dotenv()


# ════════════════════════════════════════
# Config
# ════════════════════════════════════════

REPORT_TTL = 86400     # 24 hours (survives between 12h scheduled runs)
HISTORY_MAX = 30
MIN_SOURCES = 4
ANOMALY_CHECK_INTERVAL = 30  # minutes
ANOMALY_COOLDOWN = 3600      # 1 hour cooldown after anomaly-triggered report

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
deepseek_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
)


def _log(msg: str):
    print(f"  [arena-worker] {msg}")


# ════════════════════════════════════════
# Contextual Memory — Extract Previous Report Summary
# ════════════════════════════════════════

def get_previous_report_context() -> tuple[Optional[str], Optional[Dict]]:
    """
    Query last report from DB and extract:
    1. A compact text summary for DeepSeek context injection
    2. The raw report_json for computing "what_changed" diffs

    Returns (summary_text, previous_report_json)
    """
    try:
        db = SessionLocal()
        prev = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).first()
        db.close()

        if not prev or not prev.report_json:
            return None, None

        r = prev.report_json
        tf = r.get("timeframes_summary", {})
        age_hours = (datetime.utcnow() - prev.timestamp.replace(tzinfo=None)).total_seconds() / 3600 if prev.timestamp else 0

        # Build compact summary
        lines = [
            f"PREVIOUS REPORT ({age_hours:.0f}h ago, {prev.report_id}):",
            f"  Price: ${prev.btc_price:,.0f}" if prev.btc_price else "",
            f"  Sentiment: {prev.sentiment} | Confidence: {prev.confidence}% | Bias: {prev.bias_direction}",
            f"  Fear & Greed: {prev.fear_greed}" if prev.fear_greed else "",
        ]

        # Previous TF technicals
        if tf:
            for tf_key in ["1D", "4H", "1H"]:
                t = tf.get(tf_key, {})
                if t:
                    rsi = t.get("rsi_14", "?")
                    trend = t.get("trend", t.get("ema_bullish_cross", "?"))
                    lines.append(f"  {tf_key}: RSI={rsi}, trend={trend}")

        # Previous key levels
        kl = r.get("key_levels", {})
        if kl:
            lines.append(f"  Key levels: S={kl.get('support','?')}, R={kl.get('resistance','?')}")

        # Previous BLUF (v4) or stance excerpt (v3 fallback)
        bluf = r.get("bluf", "")
        if bluf:
            lines.append(f"  BLUF: {bluf[:300]}")
        else:
            sections = r.get("sections", {})
            stance = sections.get("catalysts_stance", "")
            if stance:
                lines.append(f"  Stance excerpt: {stance[:200]}...")

        # Previous zones
        zones = r.get("zones_to_watch", {})
        if zones:
            demand = zones.get("demand", {})
            supply = zones.get("supply", {})
            lines.append(f"  Zones: demand={demand.get('low','?')}-{demand.get('high','?')}, supply={supply.get('low','?')}-{supply.get('high','?')}")

        summary = "\n".join([l for l in lines if l])
        return summary, r

    except Exception as e:
        _log(f"Previous report query failed: {e}")
        return None, None


def compute_what_changed(current_data: Dict, previous_json: Optional[Dict]) -> Optional[Dict]:
    """
    Compute explicit diffs between current raw data and previous report.
    Returns structured diff for frontend display.
    """
    if not previous_json:
        return None

    try:
        diffs = []
        prev_price = previous_json.get("btc_price", 0)
        curr_price = current_data.get("current_price", 0)

        if prev_price and curr_price:
            delta_pct = round((curr_price - prev_price) / prev_price * 100, 2) if prev_price > 0 else 0
            diffs.append({
                "metric": "Price",
                "from": prev_price,
                "to": curr_price,
                "from_fmt": f"${prev_price:,.0f}",
                "to_fmt": f"${curr_price:,.0f}",
                "delta_pct": delta_pct,
            })

        # Fear & Greed
        prev_fg = previous_json.get("fear_greed")
        curr_fg = current_data.get("fear_greed", {}).get("value")
        if prev_fg is not None and curr_fg is not None:
            diffs.append({
                "metric": "Fear & Greed",
                "from": prev_fg,
                "to": curr_fg,
                "from_fmt": str(prev_fg),
                "to_fmt": str(curr_fg),
                "delta_pct": round(((curr_fg - prev_fg) / max(prev_fg, 1)) * 100, 1),
                "unchanged": prev_fg == curr_fg,
            })

        # Sentiment
        prev_sentiment = previous_json.get("sentiment", "")
        diffs.append({
            "metric": "Sentiment",
            "from": prev_sentiment,
            "to": "pending",  # Will be filled after DeepSeek analysis
            "unchanged": False,
        })

        # Confidence
        prev_confidence = previous_json.get("confidence")
        diffs.append({
            "metric": "Confidence",
            "from": prev_confidence,
            "to": "pending",
            "unchanged": False,
        })

        return {
            "vs_previous_id": previous_json.get("id", "?"),
            "hours_ago": 12,  # Will be refined
            "diffs": diffs,
        }

    except Exception as e:
        _log(f"What-changed computation failed: {e}")
        return None


# ════════════════════════════════════════
# Stage 1: Compress (GPT-4o-mini)
# ════════════════════════════════════════

COMPRESS_PROMPT = """You are a quantitative crypto data analyst. Compress this raw BTC market data into a dense factual brief.

RULES:
- Include ALL exact numbers, percentages, dollar values. Do NOT round aggressively.
- Do NOT add opinions, predictions, or adjectives — just state the data.
- For tweets: include @username, exact tweet text, and engagement metrics (likes/retweets).
- For news: include headline and source.
- If a data point is None/null/missing, say "N/A" — do NOT fabricate.
- We have TWO OI sources: Coinglass (30+ exchanges, most accurate) and Coinalyze (fewer exchanges but has L/S ratio + liquidation).
- We have THREE timeframes: 1D (Tide/trend), 4H (Wave/setup), 1H (Ripple/precision).

OUTPUT SECTIONS (3-5 sentences each, dense with numbers):
1. MULTI-TF PRICE ACTION:
   - 1D: Price vs EMA 21/55/200, trend classification (UPTREND/DOWNTREND/SIDEWAYS), RSI
   - 4H: Price vs EMA 20/50 + SMA 100/200, RSI, EMA spread, volume ratio, golden cross status
   - 1H: RSI, momentum (12h ROC%), divergence if detected, range
   - Cross-TF alignment: do all timeframes agree on direction?

2. DERIVATIVES & LIQUIDITY: Coinglass aggregated OI (30+ exchanges) + OI-weighted funding rate. Bybit OI separately. Coinalyze L/S ratio + 24h liquidations (long vs short). Estimated peak liquidation levels. Top 3 exchange OI breakdown.

3. SENTIMENT & ON-CHAIN: Fear & Greed index + classification. NUPL, MVRV, SOPR, STH-SOPR, exchange net flow, realized price. BTC dominance.

4. NEWS & MACRO: Top 5 headlines with [source] and brief impact assessment.

5. ANALYST TWEET BREAKDOWN (v6 — context-aware, pre-classified):
   Each tweet arrives with these fields from Pass-1 classifier:
   - pre_stance: "bullish" | "bearish" | "neutral"
   - relevance: 0-1 (already gated >= 0.5)
   - topic: "price_level" | "sentiment" | "technical" | "derivatives" | "macro"
   - pre_reason: short justification

   STRICT RULES (ANTI-DRIFT):
   1. **PRESERVE pre_stance** — Place each tweet in analyst_tape.bulls/bears/neutrals
      based on pre_stance EXACTLY. Do NOT reclassify.
      - pre_stance="bullish" → bulls array
      - pre_stance="bearish" → bears array
      - pre_stance="neutral" → neutrals array
   2. The ONLY exception: if tweet text contains words that DIRECTLY contradict
      pre_stance (e.g., pre="bullish" but tweet says "this is bearish"), you may flip.
      Otherwise: pre_stance is final.
   3. Your analyst_tape COUNT distribution must match pre_stance distribution exactly.
      If Pass-1 says 7B/4B/4N, your tape MUST be 7 bulls / 4 bears / 4 neutrals.

   In analyst_intelligence narrative:
   - Group by topic (price_level, technical, derivatives, macro, sentiment)
   - Quote specific handles + their pre_reason
   - Highlight consensus vs divergence within each topic
   - Cross-reference with quantitative data (RSI, funding, OI)

   Example narrative:
   "Price level: @cryptofy01 warns $71k midline at risk if $70k breaks (bearish);
   @NexusLab101 sees breakout setup above $70k (bullish). Technical: 4/6 traders
   call distribution. Derivatives: funding reset = clean slate (bullish bias).
   Macro: split — Fed pivot rumors mixed."

   (original instruction below, preserved for compatibility)
5. ANALYST TWEET BREAKDOWN (CRITICAL — preserve FULL tweet text):
   For EACH analyst tweet, provide:
   - @username: [FULL EXACT TWEET TEXT — do not summarize or truncate]
   - Engagement: X likes, Y retweets
   - Stance classification: bullish/bearish/neutral
   Group analysts by stance: bulls vs bears vs neutral.
   If no tweets available, explicitly state "No analyst tweets in this cycle."

{context_block}

RAW DATA:
{data}"""


async def compress_data(raw: Dict, previous_summary: Optional[str] = None) -> str:
    """Compress raw market data into a dense brief using GPT-4o-mini."""
    skip_keys = {"klines", "liquidation_history"}
    filtered = {k: v for k, v in raw.items() if k not in skip_keys}

    # Simplify klines in timeframes — only keep technicals, not raw candles
    if "timeframes" in filtered:
        for tf_key, tf_data in filtered["timeframes"].items():
            if "klines" in tf_data:
                del tf_data["klines"]

    # Simplify liquidation_levels
    if "liquidation_levels" in filtered:
        ll = filtered["liquidation_levels"]
        filtered["liquidation_levels"] = {
            "peak_long_price": ll.get("peak_long_price"),
            "peak_long_amount": ll.get("peak_long_amount"),
            "peak_short_price": ll.get("peak_short_price"),
            "peak_short_amount": ll.get("peak_short_amount"),
            "total_long_estimated": ll.get("total_long_estimated"),
            "total_short_estimated": ll.get("total_short_estimated"),
        }

    # Trim Coinglass to top 5
    if "coinglass_oi" in filtered and "top_exchanges" in filtered.get("coinglass_oi", {}):
        filtered["coinglass_oi"]["top_exchanges"] = filtered["coinglass_oi"]["top_exchanges"][:5]
    if "coinglass_funding" in filtered and "top_exchanges" in filtered.get("coinglass_funding", {}):
        filtered["coinglass_funding"]["top_exchanges"] = filtered["coinglass_funding"]["top_exchanges"][:5]

    # Keep FULL tweets (v4: preserve exact text for analyst tape)
    if "analyst_tweets" in filtered:
        filtered["analyst_tweets"] = [
            {
                "author": t.get("author"),
                "text": t.get("text", ""),  # Full text, no truncation
                "likes": t.get("likes", 0),
                "retweets": t.get("retweets", 0),
                "created_at": t.get("created_at", ""),
            }
            for t in filtered["analyst_tweets"][:20]
        ]

    if "news" in filtered:
        filtered["news"] = filtered["news"][:8]

    context_block = ""
    if previous_summary:
        context_block = f"\n6. CONTEXT FROM PREVIOUS REPORT (compare changes):\n{previous_summary}\n"

    prompt = COMPRESS_PROMPT.format(
        data=json.dumps(filtered, default=str, indent=1),
        context_block=context_block,
    )

    try:
        res = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3200,  # Increased for full tweet preservation
            temperature=0.1,
        )
        brief = res.choices[0].message.content
        _log(f"Compressed to {len(brief)} chars ({res.usage.total_tokens} tokens)")
        return brief
    except Exception as e:
        _log(f"GPT-4o-mini compression failed: {e}")
        return json.dumps(filtered, default=str)[:5000]


# ════════════════════════════════════════
# Stage 2: Deep Analysis (DeepSeek R1) — v4 Prompt
# ════════════════════════════════════════

ANALYSIS_SYSTEM_PROMPT = """You are LuxQuant's AI BTC Analyst — a senior derivatives and on-chain researcher.
Your job: produce a comprehensive, actionable BTC market intelligence report using MULTI-TIMEFRAME analysis.

TRIPLE SCREEN METHOD (Alexander Elder):
- 1D (Tide): Determines the PRIMARY trend. EMA 21/55/200. If all aligned bullish → strong uptrend.
- 4H (Wave): Identifies SETUPS within the trend. EMA 20/50, SMA 100/200, RSI zones.
- 1H (Ripple): Precision layer for ENTRY/EXIT timing. Momentum, divergences.
CRITICAL: Cross-reference all three timeframes. A bullish 1H signal means nothing if 1D is bearish.

DATA SOURCES:
- Bybit: klines (1D/4H/1H), ticker, OI (single exchange)
- Coinglass: aggregated OI from 30+ exchanges, OI-weighted funding rate (most accurate total)
- Coinalyze: L/S ratio, liquidation history (complementary)
- BGeometrics: on-chain (NUPL, MVRV, SOPR)
- Alternative.me: Fear & Greed
- Google News RSS: headlines
- X (Twitter) OAuth: curated analyst tweets

{context_instruction}

STRICT RULES:
1. USE EXACT NUMBERS from the data. Never say "high" without the actual value.
2. CROSS-TF NARRATIVE: Each section must reference how different timeframes align or conflict.
3. DIRECTIONAL BIAS: State a clear market direction with multi-TF reasoning.
4. LIQUIDATION THESIS: Use liquidation cluster data to identify where price is likely drawn toward.
5. ON-CHAIN CONTEXT: Interpret NUPL/MVRV/SOPR in terms of cycle positioning.
6. TWEET SYNTHESIS: Weave analyst tweets into the narrative with @attribution.
7. SMART TAGS: Wrap metric values in [value](tab_name) where tab_name is one of: bitcoin, markets, analytics, orderbook, signals.
8. NEWS CITATIONS: Cite relevant news as [headline](source).
9. Write each section as a flowing narrative paragraph (4-5 sentences). NOT bullet points.
10. COMPARE WITH PREVIOUS REPORT when context is provided — note what changed and why it matters.
11. ZONES TO WATCH must use legal-safe language: "demand zone", "fair value", "supply zone" — NEVER "entry", "buy", "sell", "target", "stop loss".

REQUIRED JSON OUTPUT:
{{
  "bluf": "<2-3 sentence Bottom Line Up Front — what is happening right now, what to watch, and the primary directional lean. This is the HERO text that a trader reads in 10 seconds to understand the entire market state.>",

  "sentiment": "bullish" | "bearish" | "cautious" | "neutral",
  "confidence": 0-100,
  "bias_direction": "LONG" | "SHORT" | "NEUTRAL",

  "primary_bias": {{
    "direction": "LONG" | "SHORT" | "NEUTRAL",
    "confidence": 0-100
  }},

  "timeframe_alignment": {{
    "overall": "all_bullish" | "all_bearish" | "mixed" | "divergent",
    "1D": {{
      "state": "UPTREND" | "DOWNTREND" | "SIDEWAYS",
      "note": "<1 sentence: EMA alignment + RSI context>"
    }},
    "4H": {{
      "state": "BULLISH" | "BEARISH" | "PULLBACK" | "NEUTRAL",
      "note": "<1 sentence: setup context>"
    }},
    "1H": {{
      "state": "BULLISH" | "BEARISH" | "OVERSOLD" | "OVERBOUGHT" | "NEUTRAL",
      "note": "<1 sentence: momentum/divergence context>"
    }}
  }},

  "zones_to_watch": {{
    "demand": {{
      "low": <number>,
      "high": <number>,
      "notes": "<why this zone matters — support confluence, liquidation cluster, etc.>"
    }},
    "fair_value": {{
      "low": <number>,
      "high": <number>,
      "notes": "<current trading area context>"
    }},
    "supply": {{
      "low": <number>,
      "high": <number>,
      "notes": "<resistance, liquidation cluster above, etc.>"
    }},
    "confluence_note": "<1 sentence: what makes these zones significant across multiple data points>"
  }},

  "three_pillars": {{
    "trend": "<4-5 sentences: Multi-TF price structure — 1D trend, 4H setup, 1H precision. EMA alignment, golden cross status, trend classification. Cross-TF confluence or conflict.>",
    "flow": "<4-5 sentences: Derivatives positioning — OI levels and changes, funding rate interpretation, L/S ratio, liquidation clusters, cascade risk. What does money flow tell us about conviction?>",
    "risk": "<4-5 sentences: Key risks to the thesis — sentiment extremes, on-chain warnings, macro catalysts, technical invalidation levels. What could go wrong?>"
  }},

  "deep_analysis": {{
    "price_structure": "<4-5 sentence narrative: Detailed multi-TF price action. 1D sitting at what EMA levels, RSI value, trend classification. 4H setup — EMA cross status, golden cross, SMA positions. 1H momentum and divergence state. How all three TFs confirm or conflict.>",
    "derivatives_liquidity": "<4-5 sentence narrative: Coinglass aggregated OI with exact $ figure and change. OI-weighted funding rate interpretation. Liquidation clusters — nearest long at $X, nearest short at $Y, cascade risk assessment. How derivatives positioning aligns with the technical picture.>",
    "onchain_sentiment": "<4-5 sentence narrative: Fear & Greed value and what it means. NUPL cycle position. MVRV Z-Score interpretation. SOPR and STH-SOPR. Exchange net flow direction. Does on-chain data confirm or diverge from price and derivatives?>",
    "macro_catalysts": "<4-5 sentence narrative: Top 3-5 news catalysts with specific impact assessment. Macro backdrop (rates, dollar, regulation). Any scheduled events that could move price. What is the market not pricing in?>",
    "analyst_intelligence": "<4-5 sentence narrative: Synthesize analyst tweets into a coherent picture. How many bulls vs bears? What is the consensus view? Highlight the strongest contrarian argument. Who has the most compelling thesis and why?>"
  }},

  "analyst_tape": {{
    "total_analyzed": <number>,
    "bulls": [
      {{
        "handle": "<twitter handle without @>",
        "tweet_text": "<EXACT full tweet text as received>",
        "stance_tag": "bullish",
        "why_it_matters": "<1 sentence: why this view is significant>",
        "likes": <number>,
        "retweets": <number>
      }}
    ],
    "bears": [<same structure>],
    "neutrals": [<same structure>]
  }},

  "key_levels": {{
    "strong_support": <number>,
    "support": <number>,
    "resistance": <number>,
    "strong_resistance": <number>
  }},

  "liquidation_hotspots": {{
    "nearest_long_cluster": <price>,
    "nearest_short_cluster": <price>,
    "cascade_risk": "low" | "medium" | "high"
  }},

  "risk_factors": ["risk1", "risk2", "risk3"],

  "sections": {{
    "market_overview": "<Legacy: combine price_structure narrative here for backward compat>",
    "derivatives_liquidity": "<Legacy: derivatives narrative>",
    "sentiment_onchain": "<Legacy: onchain narrative>",
    "catalysts_stance": "<Legacy: macro + analyst intelligence combined>"
  }}
}}

IMPORTANT: Output ONLY valid JSON. No markdown, no backticks, no extra text.
The "sections" field is for backward compatibility — fill it with the same content as deep_analysis but combined appropriately."""


async def deep_analysis(brief: str, previous_summary: Optional[str] = None) -> Dict:
    """Generate deep market analysis using DeepSeek R1 with contextual memory."""

    context_instruction = ""
    if previous_summary:
        context_instruction = f"""CONTEXTUAL MEMORY — You have access to the previous report's key metrics:
{previous_summary}

Use this to:
- Note significant changes (e.g., "RSI climbed from 55 to 70.8 in the last 12 hours")
- Track trend evolution (e.g., "Bias shifted from NEUTRAL to LONG")
- Identify acceleration or deceleration of trends
- Compare current vs previous OI, funding, sentiment levels
- Reference previous zones and whether they held or broke"""

    system_prompt = ANALYSIS_SYSTEM_PROMPT.format(context_instruction=context_instruction)

    try:
        res = await deepseek_client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Analyze this compressed BTC market data:\n\n{brief}"},
            ],
        )

        raw_content = res.choices[0].message.content
        content = raw_content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        report = json.loads(content)

        reasoning = getattr(res.choices[0].message, "reasoning_content", None)
        if reasoning:
            report["_deepseek_reasoning"] = reasoning[:3000]

        _log(
            f"DeepSeek v4 analysis complete — "
            f"sentiment={report.get('sentiment')}, "
            f"confidence={report.get('confidence')}%, "
            f"bias={report.get('bias_direction')}, "
            f"alignment={report.get('timeframe_alignment', {}).get('overall', '?')}"
        )
        return report

    except json.JSONDecodeError as e:
        _log(f"DeepSeek returned invalid JSON: {e}")
        _log(f"Raw content (first 500): {raw_content[:500]}")
        raise
    except Exception as e:
        _log(f"DeepSeek analysis failed: {e}")
        traceback.print_exc()
        raise


# ════════════════════════════════════════
# Pipeline Orchestrator
# ════════════════════════════════════════

async def run_ai_report_pipeline(
    is_anomaly: bool = False,
    anomaly_info: Optional[Dict] = None,
) -> Optional[Dict]:
    """
    Full pipeline v4: Gather → Context → Compress → Analyze → Cache + DB
    """
    start = datetime.utcnow()
    trigger_type = "ANOMALY" if is_anomaly else "SCHEDULED"

    # ── Distributed lock: only 1 uvicorn worker generates at a time ──
    redis_lock = None
    try:
        redis_lock = get_redis()
        if redis_lock:
            lock_key = "lq:ai-report:generating"
            acquired = redis_lock.set(lock_key, f"{trigger_type}:{start.isoformat()}", nx=True, ex=300)
            if not acquired:
                _log(f"Another worker is already generating a report — skipping [{trigger_type}]")
                return None
    except Exception as lock_err:
        _log(f"Lock check failed (proceeding anyway): {lock_err}")

    _log(f"{'=' * 50}")
    _log(f"Starting report generation [{trigger_type}]... ({start.strftime('%Y-%m-%d %H:%M:%S')} UTC)")
    if anomaly_info:
        _log(f"Anomaly trigger: {anomaly_info.get('primary', {}).get('detail', '?')}")
    _log(f"{'=' * 50}")

    try:
        # ── Stage 0: Gather all data (multi-TF) ──
        _log("Stage 0: Gathering market data (3 timeframes)...")
        raw_data = gather_all_data(is_anomaly=is_anomaly)

        skip_keys = {"errors", "timestamp", "gathered_at"}
        available = sum(1 for k, v in raw_data.items()
                       if k not in skip_keys and v is not None and v != [] and v != {})
        errors = raw_data.get("errors", [])
        _log(f"Data gathered: {available} sources, {len(errors)} errors")

        if available < MIN_SOURCES:
            _log(f"Insufficient data ({available}/{MIN_SOURCES}) — skipping report")
            return None

        # ── Stage 0.5: Get previous report context ──
        _log("Stage 0.5: Loading previous report context...")
        previous_summary, previous_json = get_previous_report_context()
        if previous_summary:
            _log(f"Previous context loaded ({len(previous_summary)} chars)")
        else:
            _log("No previous report found — first report")

        # ── Stage 0.6: Compute what_changed ──
        what_changed = compute_what_changed(raw_data, previous_json)

        # ── Stage 1: Compress (multi-TF aware) ──
        _log("Stage 1: Compressing data (GPT-4o-mini)...")
        brief = await compress_data(raw_data, previous_summary)

        # ── Stage 2: Analyze (DeepSeek R1 v4 + context) ──
        _log("Stage 2: Deep analysis (DeepSeek R1 v4 + contextual memory)...")
        report_content = await deep_analysis(brief, previous_summary)

        # Safety: pop data_sources from LLM output (collision prevention)
        report_content.pop("data_sources", None)

        # ── Stage 3: Report ID ──
        report_id = f"rpt_{uuid.uuid4().hex[:8]}"
        chart_path = None  # Interactive chart in frontend

        # ── Stage 4: Assemble & Cache ──
        elapsed = (datetime.utcnow() - start).total_seconds()

        # Build timeframes summary (for contextual memory of next report)
        timeframes_summary = {}
        for tf_key in ["1D", "4H", "1H"]:
            tf_data = raw_data.get("timeframes", {}).get(tf_key, {})
            if tf_data and "technicals" in tf_data:
                timeframes_summary[tf_key] = tf_data["technicals"]

        # Finalize what_changed with DeepSeek outputs
        if what_changed:
            for diff in what_changed.get("diffs", []):
                if diff["metric"] == "Sentiment":
                    diff["to"] = report_content.get("sentiment", "?")
                    diff["unchanged"] = diff["from"] == diff["to"]
                elif diff["metric"] == "Confidence":
                    diff["to"] = report_content.get("confidence", "?")
                    diff["unchanged"] = diff["from"] == diff["to"]

            # Compute hours_ago properly
            if previous_json and previous_json.get("timestamp"):
                try:
                    prev_ts = datetime.fromisoformat(previous_json["timestamp"].replace("Z", "+00:00"))
                    what_changed["hours_ago"] = round((datetime.utcnow() - prev_ts.replace(tzinfo=None)).total_seconds() / 3600, 1)
                except Exception:
                    pass

        # BYPASS_LLM_TAPE_DECISION: Replace LLM tape with Pass-1 classifier truth
        # Research: LLM strict-rule obedience ~81%, code = 100%
        raw_tweets = raw_data.get("analyst_tweets", [])
        if raw_tweets:
            new_tape = {"bulls": [], "bears": [], "neutrals": []}
            for t in raw_tweets:
                stance = t.get("pre_stance", "neutral")
                bucket = "bulls" if stance == "bullish" else ("bears" if stance == "bearish" else "neutrals")
                new_tape[bucket].append({
                    "handle": t.get("author", "unknown"),
                    "tweet_text": t.get("text", ""),
                    "stance_tag": stance,
                    "topic": t.get("topic", "other"),
                    "reason": t.get("pre_reason", ""),
                    "likes": t.get("likes", 0),
                    "retweets": t.get("retweets", 0),
                    "relevance": t.get("relevance", 0.5),
                })
            report_content["analyst_tape"] = new_tape
            print(f"  [arena-worker] BYPASS: tape = {len(new_tape['bulls'])}B/{len(new_tape['bears'])}B/{len(new_tape['neutrals'])}N (from Pass-1)")

        # Inject raw analyst tweets from data layer into analyst_tape
        raw_tweets = raw_data.get("analyst_tweets", [])
        analyst_tape = report_content.get("analyst_tape", {})
        if raw_tweets and analyst_tape:
            # Ensure tweet_text in tape items comes from raw data (DeepSeek might have paraphrased)
            raw_by_author = {}
            for t in raw_tweets:
                author = t.get("author", "").lower()
                if author not in raw_by_author:
                    raw_by_author[author] = t

            for category in ["bulls", "bears", "neutrals"]:
                for item in analyst_tape.get(category, []):
                    handle_lower = item.get("handle", "").lower()
                    if handle_lower in raw_by_author:
                        raw_t = raw_by_author[handle_lower]
                        item["tweet_text"] = raw_t.get("text", item.get("tweet_text", ""))
                        item["likes"] = raw_t.get("likes", item.get("likes", 0))
                        item["retweets"] = raw_t.get("retweets", item.get("retweets", 0))
                        item["created_at"] = raw_t.get("created_at", "")

        final_doc = {
            "id": report_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "generated_in_seconds": round(elapsed, 1),
            "data_sources": available,
            "data_errors": errors,
            "btc_price": raw_data.get("current_price"),
            "fear_greed": raw_data.get("fear_greed", {}).get("value"),
            "chart_image_path": chart_path,
            "timeframes_summary": timeframes_summary,
            "is_anomaly_triggered": is_anomaly,
            "anomaly_reason": anomaly_info.get("primary", {}).get("detail") if anomaly_info else None,
            "what_changed": what_changed,
            **report_content,
        }

        # Cache latest (TTL = 24hr)
        cache_set("lq:ai-report:latest", final_doc, ttl=REPORT_TTL)

        # Push to history list
        try:
            redis_client = get_redis()
            redis_client.lpush("lq:ai-report:history", json.dumps(final_doc, default=str))
            redis_client.ltrim("lq:ai-report:history", 0, HISTORY_MAX - 1)
        except Exception as hist_err:
            _log(f"History push failed: {hist_err}")

        # Save to PostgreSQL
        try:
            db = SessionLocal()

            # Get previous report ID for FK link
            prev_report = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).first()
            prev_id = prev_report.id if prev_report else None

            db_report = AIArenaReport(
                report_id=report_id,
                generated_in_seconds=round(elapsed, 1),
                data_sources_count=available,
                btc_price=raw_data.get("current_price"),
                fear_greed=raw_data.get("fear_greed", {}).get("value"),
                sentiment=report_content.get("sentiment"),
                confidence=report_content.get("confidence"),
                bias_direction=report_content.get("bias_direction"),
                report_json=final_doc,
                timeframes_analyzed=timeframes_summary,
                chart_image_path=chart_path,
                is_anomaly_triggered=is_anomaly,
                anomaly_reason=anomaly_info.get("primary", {}).get("detail") if anomaly_info else None,
                previous_report_id=prev_id,
                bluf_text=report_content.get("bluf", ""),
            )
            db.add(db_report)
            db.commit()
            db.close()
            _log("Report saved to PostgreSQL")
        except Exception as db_err:
            _log(f"DB save failed: {db_err}")

        _log(f"{'=' * 50}")
        _log(
            f"Report [{trigger_type}] generated in {elapsed:.1f}s | "
            f"Sentiment: {report_content.get('sentiment', '?')} | "
            f"Confidence: {report_content.get('confidence', '?')}% | "
            f"Bias: {report_content.get('bias_direction', '?')} | "
            f"TF alignment: {report_content.get('timeframe_alignment', {}).get('overall', '?')} | "
            f"BLUF: {report_content.get('bluf', '?')[:80]}..."
        )
        _log(f"{'=' * 50}")

        # Release lock
        try:
            if redis_lock:
                redis_lock.delete("lq:ai-report:generating")
        except Exception:
            pass

        return final_doc

    except Exception as e:
        _log(f"Pipeline FAILED: {e}")
        traceback.print_exc()
        # Release lock on failure too
        try:
            if redis_lock:
                redis_lock.delete("lq:ai-report:generating")
        except Exception:
            pass
        return None


# ════════════════════════════════════════
# Anomaly Checker Loop
# ════════════════════════════════════════

_last_anomaly_trigger = None  # timestamp of last anomaly-triggered report


async def anomaly_check_loop():
    """
    Lightweight anomaly checker — runs every 30 minutes.
    Fetches price + OI + funding only (no LLM, no cost).
    If threshold exceeded → trigger full report pipeline.
    """
    global _last_anomaly_trigger
    _log(f"Anomaly checker started (interval: {ANOMALY_CHECK_INTERVAL}min)")
    await asyncio.sleep(60)  # Wait for other workers to start

    while True:
        try:
            # Get previous report from DB for comparison
            db = SessionLocal()
            prev_report = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).first()
            prev_json = prev_report.report_json if prev_report else None
            db.close()

            anomaly = check_anomaly(prev_json)

            # Log the check
            try:
                ticker = fetch_bybit_ticker()
                db = SessionLocal()
                log_entry = AIArenaAnomalyCheck(
                    btc_price=ticker["price"] if ticker else None,
                    trigger_hit=anomaly is not None,
                    anomaly_type=anomaly["primary"]["type"] if anomaly else None,
                    anomaly_detail=anomaly["primary"]["detail"] if anomaly else None,
                )
                db.add(log_entry)
                db.commit()
                db.close()
            except Exception:
                pass

            if anomaly:
                _log(f"⚠️ ANOMALY DETECTED: {anomaly['primary']['detail']}")

                # Cooldown check
                now = datetime.utcnow()
                if _last_anomaly_trigger and (now - _last_anomaly_trigger).total_seconds() < ANOMALY_COOLDOWN:
                    _log(f"Cooldown active — last trigger was {(now - _last_anomaly_trigger).total_seconds():.0f}s ago, skipping")
                else:
                    _log("Triggering full report pipeline...")
                    _last_anomaly_trigger = now
                    result = await run_ai_report_pipeline(is_anomaly=True, anomaly_info=anomaly)
                    if result:
                        _log(f"Anomaly report generated: {result['id']}")
            else:
                pass  # Normal — no log spam

        except Exception as e:
            _log(f"Anomaly check error: {e}")

        await asyncio.sleep(ANOMALY_CHECK_INTERVAL * 60)


# ════════════════════════════════════════
# Manual trigger
# ════════════════════════════════════════

async def run_once():
    """Run pipeline once — for manual testing."""
    result = await run_ai_report_pipeline()
    if result:
        _log(f"Report ID: {result['id']}")
    else:
        _log("No report generated.")
    return result


# ════════════════════════════════════════
# Scheduler
# ════════════════════════════════════════

def start_ai_arena_worker():
    """
    Start AI Arena v4:
    - Scheduled reports: every 12 hours (00:05, 12:05 UTC)
    - Anomaly checker: every 30 minutes (lightweight, no LLM cost)
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.get_event_loop()
    scheduler = AsyncIOScheduler(event_loop=loop)

    # Scheduled reports (12h)
    scheduler.add_job(
        run_ai_report_pipeline,
        "cron",
        hour="0,12",
        minute=5,
        id="ai_arena_report",
        replace_existing=True,
    )

    scheduler.start()
    _log("Scheduler started — reports at 00:05, 12:05 UTC (12h interval)")

    # Start anomaly checker as background task
    loop.create_task(anomaly_check_loop())
    _log(f"Anomaly checker registered ({ANOMALY_CHECK_INTERVAL}min interval)")

    # Initial report on startup (after 30s delay)
    scheduler.add_job(
        run_ai_report_pipeline,
        "date",
        run_date=datetime.utcnow() + timedelta(seconds=30),
        id="ai_arena_startup",
    )
    _log("Initial report scheduled in 30 seconds...")


# ════════════════════════════════════════
# CLI entry point
# ════════════════════════════════════════

if __name__ == "__main__":
    print("Running AI Arena Worker v4 manually...")
    asyncio.run(run_once())
