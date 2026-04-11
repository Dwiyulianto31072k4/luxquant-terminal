# backend/app/services/ai_arena_worker.py
"""
LuxQuant AI Arena Worker v2
============================
Pipeline: gather_all_data() → compress (GPT-4o-mini) → analyze (DeepSeek R1) → cache Redis

Schedule: Every 8 hours (00:00, 08:00, 16:00 UTC)
Cost estimate: ~$0.15/run (DeepSeek) + ~$0.01 (GPT-4o-mini) + ~$0.13 (X API) ≈ $0.29/run ≈ $26/month

Redis keys:
  - lq:ai-report:latest   → most recent report (TTL 28800s = 8hr)
  - lq:ai-report:history  → list of last 24 reports
"""

import json
import os
import uuid
import asyncio
import traceback
from datetime import datetime
from typing import Dict, Optional

from openai import AsyncOpenAI
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.redis import cache_get, cache_set, get_redis
from app.services.ai_arena_data import gather_all_data
from app.core.database import SessionLocal
from app.models.ai_arena import AIArenaReport
from dotenv import load_dotenv

load_dotenv()


# ════════════════════════════════════════
# Config
# ════════════════════════════════════════

REPORT_TTL = 28800  # 8 hours
HISTORY_MAX = 24
MIN_SOURCES = 4  # price + at least 3 others

# LLM Clients
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
deepseek_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
)


def _log(msg: str):
    print(f"  [arena-worker] {msg}")


# ════════════════════════════════════════
# Stage 1: Compress (GPT-4o-mini)
# ════════════════════════════════════════

COMPRESS_PROMPT = """You are a quantitative crypto data analyst. Compress this raw BTC market data into a dense factual brief.

RULES:
- Include ALL exact numbers, percentages, dollar values. Do NOT round aggressively.
- Do NOT add opinions, predictions, or adjectives — just state the data.
- For tweets: include @username and core claim.
- For news: include headline and source.
- If a data point is None/null/missing, say "N/A" — do NOT fabricate.
- We have TWO OI sources. Coinglass covers 30+ exchanges (more accurate total). Coinalyze covers fewer but has L/S ratio + liquidation history.

OUTPUT SECTIONS (3-5 sentences each, dense with numbers):
1. MARKET OVERVIEW: Current price, 24h change %, 24h range, RSI(14), EMA 20/50 vs price, SMA 100/200 vs price, EMA spread %, volume ratio vs 20d avg. State which MAs act as support/resistance.
2. DERIVATIVES & LIQUIDITY: Coinglass aggregated OI (30+ exchanges) + OI-weighted funding rate. Bybit OI separately. Coinalyze L/S ratio + 24h liquidations (long vs short). Estimated peak liquidation levels. Top 3 exchange OI breakdown.
3. SENTIMENT & ON-CHAIN: Fear & Greed index + classification. NUPL, MVRV, SOPR, STH-SOPR, exchange net flow, realized price. BTC dominance.
4. NEWS & ANALYST VIEWS: Top 5 headlines with [source]. Top 5-8 analyst tweets with @username and core message.

RAW DATA:
{data}"""


async def compress_data(raw: Dict) -> str:
    """Compress raw market data into a dense brief using GPT-4o-mini."""
    # Pre-filter to reduce token count — remove raw klines and large cluster data
    skip_keys = {"klines", "liquidation_history"}
    filtered = {k: v for k, v in raw.items() if k not in skip_keys}
    
    # Simplify liquidation_levels — only peaks, not full cluster maps
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
    
    # Trim Coinglass exchange breakdown to top 5
    if "coinglass_oi" in filtered and "top_exchanges" in filtered.get("coinglass_oi", {}):
        filtered["coinglass_oi"]["top_exchanges"] = filtered["coinglass_oi"]["top_exchanges"][:5]
    if "coinglass_funding" in filtered and "top_exchanges" in filtered.get("coinglass_funding", {}):
        filtered["coinglass_funding"]["top_exchanges"] = filtered["coinglass_funding"]["top_exchanges"][:5]

    # Truncate tweets to essential fields
    if "analyst_tweets" in filtered:
        filtered["analyst_tweets"] = [
            {
                "author": t.get("author"),
                "text": t.get("text", "")[:280],
                "likes": t.get("likes", 0),
                "retweets": t.get("retweets", 0),
            }
            for t in filtered["analyst_tweets"][:15]
        ]

    # Truncate news
    if "news" in filtered:
        filtered["news"] = filtered["news"][:8]

    prompt = COMPRESS_PROMPT.format(data=json.dumps(filtered, default=str, indent=1))

    try:
        res = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1800,
            temperature=0.1,
        )
        brief = res.choices[0].message.content
        _log(f"Compressed to {len(brief)} chars ({res.usage.total_tokens} tokens)")
        return brief
    except Exception as e:
        _log(f"GPT-4o-mini compression failed: {e}")
        # Fallback: raw JSON truncated
        return json.dumps(filtered, default=str)[:4000]


# ════════════════════════════════════════
# Stage 2: Deep Analysis (DeepSeek R1)
# ════════════════════════════════════════

ANALYSIS_SYSTEM_PROMPT = """You are LuxQuant's AI BTC Analyst — a senior derivatives and on-chain researcher.
Your job: produce a comprehensive, actionable BTC market intelligence report in 4 major sections.

DATA SOURCES:
- Bybit: klines, ticker, OI (single exchange)
- Coinglass: aggregated OI from 30+ exchanges, OI-weighted funding rate (most accurate total)
- Coinalyze: L/S ratio, liquidation history (complementary)
- BGeometrics: on-chain (NUPL, MVRV, SOPR)
- Alternative.me: Fear & Greed
- Google News RSS: headlines
- X (Twitter) OAuth: curated analyst tweets

STRICT RULES:
1. USE EXACT NUMBERS from the data. Never say "high" without the actual value.
2. DIRECTIONAL BIAS: State a clear market direction with multi-factor reasoning. No fence-sitting.
3. LIQUIDATION THESIS: Use liquidation cluster data to identify where price is likely to be drawn toward (liquidity magnet theory).
4. ON-CHAIN CONTEXT: Interpret NUPL/MVRV/SOPR in terms of cycle positioning.
5. TWEET SYNTHESIS: Weave analyst tweets into the narrative with @attribution.
6. SMART TAGS: Wrap metric values in [value](tab_name) where tab_name is one of: bitcoin, markets, analytics, orderbook, signals.
   Example: BTC at [$71,004](bitcoin) with RSI [67.6](analytics).
7. NEWS CITATIONS: Cite relevant news as [headline](source).
8. Write each section as a flowing narrative paragraph (3-8 sentences). NOT bullet points.
9. Cross-reference data points across sections.

REQUIRED JSON OUTPUT:
{
  "sentiment": "bullish" | "bearish" | "cautious" | "neutral",
  "confidence": 0-100,
  "bias_direction": "LONG" | "SHORT" | "NEUTRAL",
  "price_target_range": {"low": <number>, "high": <number>},
  "sections": {
    "market_overview": "COMPREHENSIVE (8-12 sentences). Executive summary connecting all factors. Current price, 24h range, EMA 20/50 position (support/resistance?), SMA 100/200 (trend bias), RSI zone, EMA spread signal, volume analysis. Realized price comparison. End with directional bias.",
    "derivatives_liquidity": "COMPREHENSIVE (8-12 sentences). Coinglass aggregated OI ($X from Y exchanges). OI-weighted funding rate — who is paying whom? Compare Bybit vs aggregated. Coinalyze L/S ratio. 24h liquidations. Estimated liquidation clusters: nearest long cluster at $X, nearest short cluster at $Y. Cascade risk. What happens if price hits these levels?",
    "sentiment_onchain": "COMPREHENSIVE (8-12 sentences). Fear & Greed value + interpretation. BTC dominance. NUPL cycle position. MVRV (>1 profit, >3.5 overheated). SOPR and STH-SOPR. Exchange net flow. Realized price as cycle floor. Cross-reference: does sentiment align with on-chain?",
    "catalysts_stance": "COMPREHENSIVE (8-12 sentences). Top 3-5 news catalysts with impact assessment. Analyst tweet synthesis — aligned or split? Then market stance: current regime (trending/ranging/volatile), who has the edge, key levels to watch, what flips the bias."
  },
  "data_sources": {
    "coinglass_oi_usd": <number or null>,
    "coinglass_exchange_count": <number or null>,
    "coinalyze_oi_usd": <number or null>,
    "bybit_oi_usd": <number or null>,
    "oi_weighted_funding": <number or null>
  },
  "key_levels": {
    "strong_support": <number>,
    "support": <number>,
    "resistance": <number>,
    "strong_resistance": <number>
  },
  "liquidation_hotspots": {
    "nearest_long_cluster": <price>,
    "nearest_short_cluster": <price>,
    "cascade_risk": "low" | "medium" | "high"
  },
  "risk_factors": ["risk1", "risk2", "risk3"]
}

IMPORTANT: Output ONLY valid JSON. No markdown, no backticks, no extra text."""


async def deep_analysis(brief: str) -> Dict:
    """Generate deep market analysis using DeepSeek R1."""
    try:
        res = await deepseek_client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Analyze this BTC market intelligence brief and produce the full report:\n\n{brief}",
                },
            ],
        )

        raw_content = res.choices[0].message.content

        # Try parse JSON — DeepSeek sometimes wraps in ```json
        content = raw_content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        report = json.loads(content)

        # Extract reasoning_content if available (DeepSeek R1 CoT)
        reasoning = getattr(res.choices[0].message, "reasoning_content", None)
        if reasoning:
            report["_deepseek_reasoning"] = reasoning[:3000]

        _log(
            f"DeepSeek analysis complete — "
            f"sentiment={report.get('sentiment')}, "
            f"confidence={report.get('confidence')}%, "
            f"bias={report.get('bias_direction')}"
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


async def run_ai_report_pipeline():
    """Full pipeline: Gather → Compress → Analyze → Cache"""
    start = datetime.utcnow()
    _log(f"{'='*50}")
    _log(f"Starting report generation... ({start.strftime('%Y-%m-%d %H:%M:%S')} UTC)")
    _log(f"{'='*50}")

    try:
        # ── Stage 0: Gather all data ──
        _log("Stage 0: Gathering market data...")
        raw_data = gather_all_data()

        # Count available sources
        skip_keys = {"errors", "timestamp"}
        available = sum(
            1
            for k, v in raw_data.items()
            if k not in skip_keys and v is not None and v != [] and v != {}
        )
        errors = raw_data.get("errors", [])

        _log(f"Data gathered: {available} sources, {len(errors)} errors")

        if available < MIN_SOURCES:
            _log(f"Insufficient data ({available}/{MIN_SOURCES}) — skipping report")
            return

        # ── Stage 1: Compress ──
        _log("Stage 1: Compressing data (GPT-4o-mini)...")
        brief = await compress_data(raw_data)

        # ── Stage 2: Analyze ──
        _log("Stage 2: Deep analysis (DeepSeek R1)...")
        report_content = await deep_analysis(brief)

        # ── Stage 3: Assemble & Cache ──
        elapsed = (datetime.utcnow() - start).total_seconds()

        # Rename DeepSeek's 'data_sources' to avoid overwriting count
        if "data_sources" in report_content:
            report_content["source_metrics"] = report_content.pop("data_sources")

        final_doc = {
            "id": f"rpt_{uuid.uuid4().hex[:8]}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "generated_in_seconds": round(elapsed, 1),
            "data_sources": available,
            "data_errors": errors,
            "btc_price": raw_data.get("current_price"),
            "fear_greed": raw_data.get("fear_greed", {}).get("value"),
            **report_content,
        }

        # Cache latest (TTL = 8hr)
        cache_set("lq:ai-report:latest", final_doc, ttl=REPORT_TTL)

        # Push to history list (keep last 24)
        try:
            redis_client = get_redis()
            redis_client.lpush(
                "lq:ai-report:history",
                json.dumps(final_doc, default=str),
            )
            redis_client.ltrim("lq:ai-report:history", 0, HISTORY_MAX - 1)
        except Exception as hist_err:
            _log(f"History push failed: {hist_err}")

        # Save to PostgreSQL (permanent storage)
        try:
            db = SessionLocal()
            db_report = AIArenaReport(
                report_id=final_doc["id"],
                generated_in_seconds=round(elapsed, 1),
                data_sources_count=available,
                btc_price=raw_data.get("current_price"),
                fear_greed=raw_data.get("fear_greed", {}).get("value"),
                sentiment=report_content.get("sentiment"),
                confidence=report_content.get("confidence"),
                bias_direction=report_content.get("bias_direction"),
                report_json=final_doc,
            )
            db.add(db_report)
            db.commit()
            db.close()
            _log("Report saved to PostgreSQL")
        except Exception as db_err:
            _log(f"DB save failed: {db_err}")

        _log(f"{'='*50}")
        _log(
            f"Report generated in {elapsed:.1f}s | "
            f"Sentiment: {report_content.get('sentiment', '?')} | "
            f"Confidence: {report_content.get('confidence', '?')}% | "
            f"Bias: {report_content.get('bias_direction', '?')}"
        )
        _log(f"{'='*50}")

        return final_doc

    except Exception as e:
        _log(f"Pipeline FAILED: {e}")
        traceback.print_exc()
        return None


# ════════════════════════════════════════
# Manual trigger (for testing)
# ════════════════════════════════════════


async def run_once():
    """Run pipeline once — for manual testing."""
    result = await run_ai_report_pipeline()
    if result:
        _log(f"Report ID: {result['id']}")
        _log(f"Executive summary: {result.get('sections', {}).get('executive_summary', 'N/A')[:200]}...")
    else:
        _log("No report generated.")
    return result


# ════════════════════════════════════════
# Scheduler
# ════════════════════════════════════════


def start_ai_arena_worker():
    """Start the AI Arena report scheduler — runs every 8 hours (00:00, 08:00, 16:00 UTC)."""
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_ai_report_pipeline,
        "cron",
        hour="0,8,16",
        minute=5,  # 5 min past to avoid API congestion at round hours
        id="ai_arena_report",
        replace_existing=True,
    )
    scheduler.start()
    _log("Scheduler started — reports at 00:05, 08:05, 16:05 UTC")

    # Also run immediately on startup (after 30s delay to let APIs warm up)
    scheduler.add_job(
        run_ai_report_pipeline,
        "date",
        run_date=datetime.utcnow() + __import__("datetime").timedelta(seconds=30),
        id="ai_arena_startup",
    )
    _log("Initial report scheduled in 30 seconds...")


# ════════════════════════════════════════
# CLI entry point
# ════════════════════════════════════════

if __name__ == "__main__":
    print("Running AI Arena Worker manually...")
    asyncio.run(run_once())
