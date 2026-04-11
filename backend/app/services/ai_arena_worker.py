# backend/app/services/ai_arena_worker.py
"""
LuxQuant AI Arena Worker v3
============================
Pipeline: gather_all_data() → inject context → compress (GPT-4o-mini) → analyze (DeepSeek R1) → chart image → cache + DB

v3 Upgrades:
  - Multi-timeframe: 1D/4H/1H cross-reference
  - Contextual memory: previous report fed to DeepSeek
  - Anomaly detection: 30min lightweight checker
  - Chart image generation: 3-panel PNG via mplfinance
  - Schedule: 12 hours (00:05, 12:05 UTC) + anomaly triggers

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
    gather_all_data, check_anomaly, generate_chart_image,
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

def get_previous_report_summary() -> Optional[str]:
    """
    Query last report from DB and extract key metrics for contextual memory.
    Returns a compact text summary, or None if no previous report exists.
    """
    try:
        db = SessionLocal()
        prev = db.query(AIArenaReport).order_by(AIArenaReport.id.desc()).first()
        db.close()

        if not prev or not prev.report_json:
            return None

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

        # Previous bias reasoning (first 200 chars of catalysts section)
        sections = r.get("sections", {})
        stance = sections.get("catalysts_stance", "")
        if stance:
            lines.append(f"  Stance excerpt: {stance[:200]}...")

        summary = "\n".join([l for l in lines if l])
        return summary

    except Exception as e:
        _log(f"Previous report query failed: {e}")
        return None


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

4. NEWS & ANALYST VIEWS: Top 5 headlines with [source]. Top 5-8 analyst tweets with @username and core message.

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

    # Truncate tweets
    if "analyst_tweets" in filtered:
        filtered["analyst_tweets"] = [
            {"author": t.get("author"), "text": t.get("text", "")[:280],
             "likes": t.get("likes", 0), "retweets": t.get("retweets", 0)}
            for t in filtered["analyst_tweets"][:15]
        ]

    if "news" in filtered:
        filtered["news"] = filtered["news"][:8]

    context_block = ""
    if previous_summary:
        context_block = f"\n5. CONTEXT FROM PREVIOUS REPORT (compare changes):\n{previous_summary}\n"

    prompt = COMPRESS_PROMPT.format(
        data=json.dumps(filtered, default=str, indent=1),
        context_block=context_block,
    )

    try:
        res = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2200,
            temperature=0.1,
        )
        brief = res.choices[0].message.content
        _log(f"Compressed to {len(brief)} chars ({res.usage.total_tokens} tokens)")
        return brief
    except Exception as e:
        _log(f"GPT-4o-mini compression failed: {e}")
        return json.dumps(filtered, default=str)[:5000]


# ════════════════════════════════════════
# Stage 2: Deep Analysis (DeepSeek R1)
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
3. DIRECTIONAL BIAS: State a clear market direction with multi-TF reasoning. If 1D bullish but 1H bearish divergence → explain the conflict and pick a side with reasoning.
4. LIQUIDATION THESIS: Use liquidation cluster data to identify where price is likely drawn toward.
5. ON-CHAIN CONTEXT: Interpret NUPL/MVRV/SOPR in terms of cycle positioning.
6. TWEET SYNTHESIS: Weave analyst tweets into the narrative with @attribution.
7. SMART TAGS: Wrap metric values in [value](tab_name) where tab_name is one of: bitcoin, markets, analytics, orderbook, signals.
8. NEWS CITATIONS: Cite relevant news as [headline](source).
9. Write each section as a flowing narrative paragraph (8-12 sentences). NOT bullet points.
10. COMPARE WITH PREVIOUS REPORT when context is provided — note what changed and why it matters.

REQUIRED JSON OUTPUT:
{{
  "sentiment": "bullish" | "bearish" | "cautious" | "neutral",
  "confidence": 0-100,
  "bias_direction": "LONG" | "SHORT" | "NEUTRAL",
  "price_target_range": {{"low": <number>, "high": <number>}},
  "timeframe_alignment": {{
    "1D_trend": "UPTREND" | "DOWNTREND" | "SIDEWAYS",
    "4H_setup": "bullish" | "bearish" | "neutral",
    "1H_momentum": "bullish" | "bearish" | "divergence",
    "alignment": "all_bullish" | "all_bearish" | "mixed" | "divergent"
  }},
  "sections": {{
    "market_overview": "COMPREHENSIVE (10-14 sentences). Start with 1D trend context (EMA 21/55/200 alignment, trend classification). Then 4H setup: price vs EMA 20/50, SMA 100/200, RSI zone, golden cross status, EMA spread. Then 1H precision: momentum, divergence, range. EXPLICITLY state: 'The triple screen shows [alignment/conflict] — 1D says X, 4H says Y, 1H says Z.' Realized price comparison. End with directional bias backed by multi-TF reasoning.",
    "derivatives_liquidity": "COMPREHENSIVE (10-14 sentences). Coinglass aggregated OI ($X from Y exchanges). OI-weighted funding rate — who pays whom? Compare Bybit vs aggregated. Coinalyze L/S ratio. 24h liquidations. Estimated liquidation clusters: nearest long at $X, nearest short at $Y. Cascade risk. What happens if price hits these levels? How does OI positioning align with the multi-TF technical picture?",
    "sentiment_onchain": "COMPREHENSIVE (10-14 sentences). Fear & Greed value + interpretation. BTC dominance. NUPL cycle position. MVRV Z-Score. SOPR and STH-SOPR. Exchange net flow. Realized price as cycle floor. Cross-reference: does sentiment align with technicals and on-chain?",
    "catalysts_stance": "COMPREHENSIVE (10-14 sentences). Top 3-5 news catalysts with impact. Analyst tweet synthesis — aligned or split? Market stance: current regime (trending/ranging/volatile), who has edge, key levels to watch, what flips the bias. If previous report context available: what changed since then and does it shift the thesis?"
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
  "risk_factors": ["risk1", "risk2", "risk3"]
}}

IMPORTANT: Output ONLY valid JSON. No markdown, no backticks, no extra text."""


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
- Compare current vs previous OI, funding, sentiment levels"""

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
            f"DeepSeek analysis complete — "
            f"sentiment={report.get('sentiment')}, "
            f"confidence={report.get('confidence')}%, "
            f"bias={report.get('bias_direction')}, "
            f"alignment={report.get('timeframe_alignment', {}).get('alignment', '?')}"
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
    Full pipeline: Gather → Context → Compress → Analyze → Chart → Cache + DB
    """
    start = datetime.utcnow()
    trigger_type = "ANOMALY" if is_anomaly else "SCHEDULED"
    _log(f"{'=' * 50}")
    _log(f"Starting report generation [{trigger_type}]... ({start.strftime('%Y-%m-%d %H:%M:%S')} UTC)")
    if anomaly_info:
        _log(f"Anomaly trigger: {anomaly_info.get('primary', {}).get('detail', '?')}")
    _log(f"{'=' * 50}")

    try:
        # ── Stage 0: Gather all data (multi-TF) ──
        _log("Stage 0: Gathering market data (3 timeframes)...")
        raw_data = gather_all_data()

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
        previous_summary = get_previous_report_summary()
        if previous_summary:
            _log(f"Previous context loaded ({len(previous_summary)} chars)")
        else:
            _log("No previous report found — first report")

        # ── Stage 1: Compress (multi-TF aware) ──
        _log("Stage 1: Compressing data (GPT-4o-mini)...")
        brief = await compress_data(raw_data, previous_summary)

        # ── Stage 2: Analyze (DeepSeek R1 + context) ──
        _log("Stage 2: Deep analysis (DeepSeek R1 + contextual memory)...")
        report_content = await deep_analysis(brief, previous_summary)

        # Safety: pop data_sources from LLM output (collision prevention)
        report_content.pop("data_sources", None)

        # ── Stage 3: Generate chart image ──
        _log("Stage 3: Generating chart image...")
        report_id = f"rpt_{uuid.uuid4().hex[:8]}"

        klines_1d = raw_data.get("timeframes", {}).get("1D", {}).get("klines")
        klines_4h = raw_data.get("timeframes", {}).get("4H", {}).get("klines") or raw_data.get("klines")
        klines_1h = raw_data.get("timeframes", {}).get("1H", {}).get("klines")

        chart_path = generate_chart_image(
            klines_1d=klines_1d,
            klines_4h=klines_4h,
            klines_1h=klines_1h,
            technicals=raw_data.get("technicals", {}),
            liquidation_levels=raw_data.get("liquidation_levels"),
            key_levels=report_content.get("key_levels"),
            report_id=report_id,
        )

        # ── Stage 4: Assemble & Cache ──
        elapsed = (datetime.utcnow() - start).total_seconds()

        # Build timeframes summary (for contextual memory of next report)
        timeframes_summary = {}
        for tf_key in ["1D", "4H", "1H"]:
            tf_data = raw_data.get("timeframes", {}).get(tf_key, {})
            if tf_data and "technicals" in tf_data:
                timeframes_summary[tf_key] = tf_data["technicals"]

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
            "timeframe_alignment": report_content.get("timeframe_alignment"),
            "is_anomaly_triggered": is_anomaly,
            "anomaly_reason": anomaly_info.get("primary", {}).get("detail") if anomaly_info else None,
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
            f"TF alignment: {report_content.get('timeframe_alignment', {}).get('alignment', '?')} | "
            f"Chart: {'✓' if chart_path else '✗'}"
        )
        _log(f"{'=' * 50}")

        return final_doc

    except Exception as e:
        _log(f"Pipeline FAILED: {e}")
        traceback.print_exc()
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

                # Cooldown check — don't trigger if we just triggered recently
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
    Start AI Arena v3:
    - Scheduled reports: every 12 hours (00:05, 12:05 UTC)
    - Anomaly checker: every 30 minutes (lightweight, no LLM cost)
    """
    scheduler = AsyncIOScheduler()

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
    loop = asyncio.get_event_loop()
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
    print("Running AI Arena Worker v3 manually...")
    asyncio.run(run_once())
