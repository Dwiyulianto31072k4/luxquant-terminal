# backend/app/services/ai_worker.py
"""
LuxQuant AI Market Reporter — v3.0 (Self-Sufficient)
=====================================================
Reads cached data from Redis first, but FETCHES DIRECTLY from APIs
when cache is empty. No more "insufficient data" failures.

Data flow:  Redis cache → (miss?) → Direct API fetch → Compress → Analyze → Cache

APIs used as fallback:
  - Bybit (api.bybit.id)      → ticker, funding, OI, klines for technicals
  - CoinGecko                  → price, global market, dominance
  - Alternative.me             → Fear & Greed Index
  - Mempool.space              → hashrate, difficulty, fees, mempool
  - RSS feeds                  → news headlines
"""

import json, os, uuid, asyncio, traceback, math
from datetime import datetime, timedelta
from openai import AsyncOpenAI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.redis import cache_get, cache_set
from dotenv import load_dotenv

load_dotenv()

# ════════════════════════════════════════
# Config
# ════════════════════════════════════════
BYBIT_API = os.getenv("BYBIT_API_URL", "https://api.bybit.id")
COINGECKO_API = "https://api.coingecko.com/api/v3"
CG_API_KEY = os.getenv("COINGECKO_API_KEY", "")
CG_HEADERS = {"accept": "application/json"}
if CG_API_KEY:
    CG_HEADERS["x-cg-demo-api-key"] = CG_API_KEY

MEMPOOL_API = "https://mempool.space/api"
FEAR_GREED_API = "https://api.alternative.me/fng"
TIMEOUT = 15.0

# LLM Clients
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
deepseek_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1"
)


def _log(msg):
    print(f"   → {msg}")


# ════════════════════════════════════════
# Technical Indicator Calculations
# ════════════════════════════════════════
def calc_ema(closes, period):
    if len(closes) < period:
        return None
    multiplier = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for price in closes[period:]:
        ema = (price - ema) * multiplier + ema
    return ema


def calc_rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(diff if diff > 0 else 0)
        losses.append(abs(diff) if diff < 0 else 0)
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    return round(100 - (100 / (1 + avg_gain / avg_loss)), 2)


def calc_macd(closes, fast=12, slow=26, signal=9):
    if len(closes) < slow + signal:
        return None
    fast_mult = 2 / (fast + 1)
    slow_mult = 2 / (slow + 1)
    ef = sum(closes[:fast]) / fast
    es = sum(closes[:slow]) / slow
    macd_line = []
    for i in range(slow, len(closes)):
        ef = closes[i] * fast_mult + ef * (1 - fast_mult)
        es = closes[i] * slow_mult + es * (1 - slow_mult)
        macd_line.append(ef - es)
    if len(macd_line) < signal:
        return None
    sig_mult = 2 / (signal + 1)
    sig = sum(macd_line[:signal]) / signal
    for v in macd_line[signal:]:
        sig = v * sig_mult + sig * (1 - sig_mult)
    macd_val = macd_line[-1]
    histogram = macd_val - sig
    prev_macd = macd_line[-2] if len(macd_line) > 1 else macd_val
    crossover = "bullish" if prev_macd <= sig and macd_val > sig else \
                "bearish" if prev_macd >= sig and macd_val < sig else "neutral"
    return {"macd": round(macd_val, 2), "signal": round(sig, 2),
            "histogram": round(histogram, 2), "crossover": crossover}


def calc_bollinger(closes, period=20, std_dev=2):
    if len(closes) < period:
        return None
    recent = closes[-period:]
    sma = sum(recent) / period
    variance = sum((x - sma) ** 2 for x in recent) / period
    std = variance ** 0.5
    return {"upper": round(sma + std_dev * std, 2), "middle": round(sma, 2),
            "lower": round(sma - std_dev * std, 2),
            "bandwidth": round((std_dev * std * 2) / sma * 100, 2) if sma > 0 else 0}


def compute_technicals_from_klines(klines_data):
    """Compute RSI, MACD, Bollinger, EMA from kline close prices."""
    closes = [float(k) for k in klines_data]
    if len(closes) < 30:
        return None
    rsi = calc_rsi(closes, 14)
    macd = calc_macd(closes, 12, 26, 9)
    bb = calc_bollinger(closes, 20, 2)
    ema50 = calc_ema(closes, 50)
    ema200 = calc_ema(closes, 200)
    price = closes[-1]

    rsi_signal = "oversold" if rsi and rsi < 30 else "overbought" if rsi and rsi > 70 else "neutral"
    bb_position = None
    if bb:
        bb_range = bb["upper"] - bb["lower"]
        if bb_range > 0:
            pct = (price - bb["lower"]) / bb_range
            bb_position = "near_upper" if pct > 0.8 else "near_lower" if pct < 0.2 else "middle"
    ema_cross = None
    if ema50 and ema200:
        ema_cross = "golden_cross" if ema50 > ema200 else "death_cross"

    return {
        "rsi": rsi, "rsi_signal": rsi_signal, "macd": macd,
        "bollinger": bb, "bb_position": bb_position,
        "ema50": round(ema50, 2) if ema50 else None,
        "ema200": round(ema200, 2) if ema200 else None,
        "ema_cross": ema_cross, "price": price,
    }


# ════════════════════════════════════════
# Direct API Fetchers (fallback when Redis empty)
# ════════════════════════════════════════
async def _fetch_json(client, url, params=None, headers=None):
    """Safe JSON fetch with error handling."""
    try:
        res = await client.get(url, params=params, headers=headers, timeout=TIMEOUT)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        _log(f"Fetch failed {url}: {e}")
    return None


async def fetch_btc_ticker_direct(client):
    """Fetch BTC ticker from Bybit."""
    data = await _fetch_json(client, f"{BYBIT_API}/v5/market/tickers",
                             params={"category": "spot", "symbol": "BTCUSDT"})
    if data and data.get("result", {}).get("list"):
        t = data["result"]["list"][0]
        return {
            "price": float(t.get("lastPrice", 0)),
            "high_24h": float(t.get("highPrice24h", 0)),
            "low_24h": float(t.get("lowPrice24h", 0)),
            "volume_24h": float(t.get("turnover24h", 0)),
            "price_change_pct": float(t.get("price24hPcnt", 0)) * 100,
        }
    return None


async def fetch_technical_direct(client):
    """Fetch klines from Bybit and compute technicals for 1h/4h/1d."""
    tf_map = {"1h": "60", "4h": "240", "1d": "D"}
    result = {}
    for tf_key, tf_interval in tf_map.items():
        data = await _fetch_json(client, f"{BYBIT_API}/v5/market/kline",
                                 params={"category": "spot", "symbol": "BTCUSDT",
                                         "interval": tf_interval, "limit": 200})
        if data and data.get("result", {}).get("list"):
            # Bybit returns newest first, reverse for chronological order
            klines = data["result"]["list"][::-1]
            closes = [float(k[4]) for k in klines]  # index 4 = close price
            tf_result = compute_technicals_from_klines(closes)
            if tf_result:
                result[tf_key] = tf_result

    if not result:
        return None

    # Summary
    buy_signals = sell_signals = total_signals = 0
    for tf_data in result.values():
        if tf_data.get("rsi_signal") == "oversold": buy_signals += 1
        elif tf_data.get("rsi_signal") == "overbought": sell_signals += 1
        total_signals += 1
        macd_data = tf_data.get("macd")
        if macd_data:
            if macd_data.get("histogram", 0) > 0: buy_signals += 1
            else: sell_signals += 1
            total_signals += 1
        if tf_data.get("bb_position") == "near_lower": buy_signals += 1
        elif tf_data.get("bb_position") == "near_upper": sell_signals += 1
        total_signals += 1
        if tf_data.get("ema_cross") == "golden_cross": buy_signals += 1
        elif tf_data.get("ema_cross") == "death_cross": sell_signals += 1
        total_signals += 1

    if total_signals > 0:
        buy_pct = buy_signals / total_signals
        sell_pct = sell_signals / total_signals
        summary = "Strong Buy" if buy_pct >= 0.75 else "Buy" if buy_pct >= 0.6 else \
                  "Strong Sell" if sell_pct >= 0.75 else "Sell" if sell_pct >= 0.6 else "Neutral"
    else:
        summary = "Neutral"

    return {"timeframes": result, "summary": summary, "buy_signals": buy_signals,
            "sell_signals": sell_signals, "total_signals": total_signals,
            "timestamp": datetime.utcnow().isoformat()}


async def fetch_funding_direct(client):
    """Fetch BTC/ETH funding rates from Bybit."""
    rates = []
    for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
        data = await _fetch_json(client, f"{BYBIT_API}/v5/market/tickers",
                                 params={"category": "linear", "symbol": sym})
        if data and data.get("result", {}).get("list"):
            t = data["result"]["list"][0]
            rates.append({"symbol": sym, "rate": float(t.get("fundingRate", 0))})
    return rates if rates else None


async def fetch_oi_direct(client):
    """Fetch open interest from Bybit."""
    data = await _fetch_json(client, f"{BYBIT_API}/v5/market/open-interest",
                             params={"category": "linear", "symbol": "BTCUSDT",
                                     "intervalTime": "1h", "limit": 1})
    if data and data.get("result", {}).get("list"):
        oi = data["result"]["list"][0]
        return {"btc": float(oi.get("openInterest", 0)),
                "timestamp": oi.get("timestamp", "")}
    return None


async def fetch_long_short_direct(client):
    """Fetch long/short ratio from Bybit."""
    data = await _fetch_json(client, f"{BYBIT_API}/v5/market/account-ratio",
                             params={"category": "linear", "symbol": "BTCUSDT",
                                     "period": "1h", "limit": 1})
    if data and data.get("result", {}).get("list"):
        ls = data["result"]["list"][0]
        return {"buyRatio": float(ls.get("buyRatio", 0)),
                "sellRatio": float(ls.get("sellRatio", 0)),
                "timestamp": ls.get("timestamp", "")}
    return None


async def fetch_global_direct(client):
    """Fetch global market data + Fear & Greed."""
    global_data = await _fetch_json(client, f"{COINGECKO_API}/global", headers=CG_HEADERS)
    fg_data = await _fetch_json(client, f"{FEAR_GREED_API}/?limit=7")

    result = {}
    if global_data and global_data.get("data"):
        d = global_data["data"]
        result["total_market_cap"] = d.get("total_market_cap", {}).get("usd")
        result["total_volume"] = d.get("total_volume", {}).get("usd")
        result["btc_dominance"] = d.get("market_cap_percentage", {}).get("btc")

    fear_greed = {"value": 50, "label": "Neutral"}
    if fg_data and fg_data.get("data") and len(fg_data["data"]) > 0:
        fear_greed = {"value": int(fg_data["data"][0]["value"]),
                      "label": fg_data["data"][0]["value_classification"]}
    result["fear_greed"] = fear_greed
    return result if result else None


async def fetch_network_direct(client):
    """Fetch network health from mempool.space."""
    fees, mempool, hashrate = await asyncio.gather(
        _fetch_json(client, f"{MEMPOOL_API}/v1/fees/recommended"),
        _fetch_json(client, f"{MEMPOOL_API}/mempool"),
        _fetch_json(client, f"{MEMPOOL_API}/v1/mining/hashrate/1m"),
        return_exceptions=True,
    )
    result = {}
    if fees and not isinstance(fees, Exception):
        result["fees"] = fees
    if mempool and not isinstance(mempool, Exception):
        result["mempool"] = {"count": mempool.get("count", 0), "vsize": mempool.get("vsize", 0)}
    if hashrate and not isinstance(hashrate, Exception):
        result["hashrate"] = hashrate.get("currentHashrate", 0)
        result["difficulty"] = hashrate.get("currentDifficulty", 0)
    return result if result else None


async def fetch_news_direct(client):
    """Fetch Bitcoin news from RSS feeds."""
    import xml.etree.ElementTree as ET
    feeds = [
        "https://cointelegraph.com/rss/tag/bitcoin",
        "https://bitcoinmagazine.com/.rss/full/",
    ]
    articles = []
    for url in feeds:
        try:
            res = await client.get(url, timeout=10, follow_redirects=True)
            if res.status_code != 200:
                continue
            root = ET.fromstring(res.text)
            for item in root.iter("item"):
                title = item.findtext("title", "")
                link = item.findtext("link", "")
                if title and link:
                    articles.append({"title": title, "link": link,
                                     "source": "CoinTelegraph" if "cointelegraph" in url else "Bitcoin Magazine"})
                if len(articles) >= 8:
                    break
        except:
            continue
    return articles[:8] if articles else None


# ════════════════════════════════════════
# Stage 0: Gather — Redis first, API fallback
# ════════════════════════════════════════
async def gather_market_intelligence() -> dict:
    """
    Gather all market data. Try Redis cache first (instant),
    fall back to direct API calls for any missing data.
    """
    print("📡 [AI Reporter] Gathering data from Redis cache...")
    import httpx

    data = {}

    # ── Read from Redis first ──
    data["btc_ticker"] = cache_get("lq:market:btc-ticker")
    data["technical"] = cache_get("lq:bitcoin:technical")
    data["funding_rates"] = cache_get("lq:market:funding-rates")
    data["long_short_ratio"] = cache_get("lq:market:long-short-ratio")
    data["open_interest"] = cache_get("lq:market:open-interest")
    data["oi_history"] = cache_get("lq:market:oi-history")
    data["onchain"] = cache_get("lq:bitcoin:onchain")
    data["network"] = cache_get("lq:bitcoin:network")
    data["global"] = None
    global_raw = cache_get("lq:market:global")
    if global_raw and isinstance(global_raw, dict):
        data["global"] = {
            "total_market_cap": global_raw.get("global", {}).get("total_market_cap", {}).get("usd") if isinstance(global_raw.get("global"), dict) else None,
            "total_volume": global_raw.get("global", {}).get("total_volume", {}).get("usd") if isinstance(global_raw.get("global"), dict) else None,
            "btc_dominance": global_raw.get("global", {}).get("market_cap_percentage", {}).get("btc") if isinstance(global_raw.get("global"), dict) else None,
            "fear_greed": global_raw.get("fearGreed"),
        }
    data["liquidations"] = cache_get("lq:mkt:liquidations")

    news_raw = cache_get("lq:bitcoin:news")
    if news_raw and isinstance(news_raw, dict):
        articles = news_raw.get("articles", [])[:8]
        data["news"] = [{"title": a.get("title", ""), "source": a.get("source", ""),
                         "link": a.get("link", ""), "time_ago": a.get("time_ago", "")} for a in articles]
    else:
        data["news"] = None

    analyze_7d = cache_get("lq:signals:analyze:7d:weekly")
    if analyze_7d and isinstance(analyze_7d, dict):
        stats = analyze_7d.get("stats", {})
        data["signal_performance"] = {
            "total_signals": stats.get("total_signals", 0),
            "win_rate": stats.get("win_rate", 0),
            "closed_trades": stats.get("closed_trades", 0),
            "open_signals": stats.get("open_signals", 0),
        }
    else:
        data["signal_performance"] = None

    cached_count = sum(1 for v in data.values() if v is not None)
    total_keys = len(data)
    _log(f"Redis: {cached_count}/{total_keys} sources available")

    # ── Direct API fallback for missing critical data ──
    missing = [k for k, v in data.items() if v is None]
    if missing:
        _log(f"Fetching missing: {', '.join(missing)}")
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            fetch_tasks = {}

            if data["btc_ticker"] is None:
                fetch_tasks["btc_ticker"] = fetch_btc_ticker_direct(client)
            if data["technical"] is None:
                fetch_tasks["technical"] = fetch_technical_direct(client)
            if data["funding_rates"] is None:
                fetch_tasks["funding_rates"] = fetch_funding_direct(client)
            if data["open_interest"] is None:
                fetch_tasks["open_interest"] = fetch_oi_direct(client)
            if data["long_short_ratio"] is None:
                fetch_tasks["long_short_ratio"] = fetch_long_short_direct(client)
            if data["global"] is None:
                fetch_tasks["global"] = fetch_global_direct(client)
            if data["network"] is None:
                fetch_tasks["network"] = fetch_network_direct(client)
            if data["news"] is None:
                fetch_tasks["news"] = fetch_news_direct(client)

            if fetch_tasks:
                results = await asyncio.gather(*fetch_tasks.values(), return_exceptions=True)
                for key, result in zip(fetch_tasks.keys(), results):
                    if result is not None and not isinstance(result, Exception):
                        data[key] = result
                        _log(f"  ✓ {key} fetched from API")
                    else:
                        if isinstance(result, Exception):
                            _log(f"  ✗ {key} failed: {result}")
                        else:
                            _log(f"  ✗ {key} returned empty")

    final_count = sum(1 for v in data.values() if v is not None)
    _log(f"Final: {final_count}/{total_keys} sources ready")
    return data


# ════════════════════════════════════════
# Stage 1: Data Compression (GPT-4o-mini)
# ════════════════════════════════════════
async def compress_data(intelligence: dict) -> str:
    """Compress all market data into a dense quantitative brief."""
    prompt = f"""You are a quantitative data analyst. Compress this market data into a dense, factual brief.
Include ALL numbers, percentages, and exact values. Do NOT add opinions — just facts.
Keep news headlines with their source and URL intact.

DATA:
{json.dumps(intelligence, default=str, indent=1)}

Output a structured brief with sections: Price, Technical, Derivatives, OnChain, Network, Sentiment, News, SignalPerformance.
Each section should be 2-4 sentences with exact numbers."""

    try:
        res = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0.1,
        )
        return res.choices[0].message.content
    except Exception as e:
        print(f"⚠️ [AI Reporter] GPT-4o-mini compression failed: {e}")
        return json.dumps(intelligence, default=str)[:3000]


# ════════════════════════════════════════
# Stage 2: Deep Analysis (DeepSeek R1)
# ════════════════════════════════════════
ANALYSIS_SYSTEM_PROMPT = """You are LuxQuant's AI Market Reporter — a professional crypto market analyst.
Your job is to produce a comprehensive, actionable market intelligence report.

STRICT RULES:
1. BE SPECIFIC: Use exact numbers from the data. Never say "high" without the actual value.
2. DIRECTIONAL BIAS: Always state a clear market direction with reasoning. No fence-sitting.
3. SMART TAGS: Wrap every metric value in [value](tab_name) where tab_name is one of: bitcoin, markets, analytics, orderbook, signals.
   Example: BTC is trading at [95,234](bitcoin) with RSI at [42.3](bitcoin).
4. NEWS CITATIONS: If a news headline supports the analysis, cite it as [headline](URL).
5. STRUCTURE: Follow the exact JSON structure below.
6. LANGUAGE: Professional but accessible. Explain WHY each indicator matters.
7. REASONING LOG: Write a step-by-step internal reasoning trace showing how you arrived at your conclusion.
8. MARKET STANCE: Focus on market direction, NOT specific trade instructions.

REQUIRED JSON OUTPUT:
{
  "sentiment": "bullish" | "bearish" | "cautious" | "neutral",
  "confidence": 0-100,
  "bias_direction": "LONG" | "SHORT" | "NEUTRAL",
  "price_target_range": {"low": number, "high": number},
  "sections": {
    "executive_summary": "3-4 sentence overview connecting all data points into a narrative.",
    "price_action": "Current price levels, 24h range, key support/resistance from Bollinger Bands.",
    "technical_analysis": "Multi-timeframe RSI/MACD/EMA analysis. State if signals are aligned or diverging.",
    "derivatives_flow": "Funding rate interpretation, OI changes, long/short ratio meaning.",
    "onchain_network": "Active address trends, network health (hashrate, mempool). What does on-chain tell us?",
    "market_sentiment": "Fear & Greed reading, global market cap trends, BTC dominance implications.",
    "news_catalysts": "Summarize top headlines and their potential market impact. Include [headline](URL) citations.",
    "signal_performance": "LuxQuant signal win rate and recent performance.",
    "reasoning_log": "Step-by-step reasoning trace with '> ' prefix per line.",
    "market_stance": "2-3 paragraph market stance: regime, who has the edge, key levels, what flips the bias."
  },
  "key_levels": {
    "strong_support": number,
    "support": number,
    "resistance": number,
    "strong_resistance": number
  },
  "risk_factors": ["risk1", "risk2", "risk3"]
}"""


async def deep_analysis(brief: str) -> dict:
    """Generate deep market analysis using DeepSeek R1."""
    try:
        res = await deepseek_client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                {"role": "user", "content": f"Analyze this market intelligence and produce the report:\n\n{brief}"}
            ],
            response_format={"type": "json_object"},
        )
        return json.loads(res.choices[0].message.content)
    except Exception as e:
        print(f"⚠️ [AI Reporter] DeepSeek analysis failed: {e}")
        traceback.print_exc()
        raise


# ════════════════════════════════════════
# Pipeline Orchestrator
# ════════════════════════════════════════
MIN_SOURCES_FOR_REPORT = 3  # Minimum: price + at least 2 others

async def run_ai_report_pipeline():
    """Full pipeline: Gather (Redis+API) → Compress → Analyze → Cache"""
    start = datetime.utcnow()
    print(f"\n{'='*60}")
    print(f"🤖 [AI Reporter] Starting report generation... ({start.isoformat()})")
    print(f"{'='*60}")

    try:
        # Stage 0: Gather from Redis + API fallback
        intelligence = await gather_market_intelligence()

        # Check minimum data availability
        available = sum(1 for v in intelligence.values() if v is not None)
        has_price = intelligence.get("btc_ticker") is not None
        has_any_analysis = intelligence.get("technical") is not None or \
                           intelligence.get("global") is not None or \
                           intelligence.get("funding_rates") is not None

        if not has_price or available < MIN_SOURCES_FOR_REPORT:
            print(f"⚠️ [AI Reporter] Insufficient data ({available} sources, need {MIN_SOURCES_FOR_REPORT}) — skipping")
            return

        print(f"📊 [AI Reporter] Stage 1: Compressing {available} data sources...")
        brief = await compress_data(intelligence)

        print("🧠 [AI Reporter] Stage 2: Deep analysis (DeepSeek R1)...")
        report_content = await deep_analysis(brief)

        # Assemble final document
        elapsed = (datetime.utcnow() - start).total_seconds()
        final_doc = {
            "id": f"rpt_{uuid.uuid4().hex[:8]}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "generated_in_seconds": round(elapsed, 1),
            "data_sources": available,
            **report_content,
        }

        # Cache with 2-hour TTL
        cache_set("lq:ai-report:latest", final_doc, ttl=7200)

        # Push to history list (keep last 24)
        try:
            from app.core.redis import get_redis
            redis_client = get_redis()
            if redis_client:
                redis_client.lpush("lq:ai-report:history", json.dumps(final_doc, default=str))
                redis_client.ltrim("lq:ai-report:history", 0, 23)
        except Exception as hist_err:
            print(f"⚠️ [AI Reporter] History push failed: {hist_err}")

        print(f"✅ [AI Reporter] Report generated in {elapsed:.1f}s | "
              f"Sentiment: {report_content.get('sentiment', '?')} | "
              f"Confidence: {report_content.get('confidence', '?')}%")

    except Exception as e:
        print(f"❌ [AI Reporter] Pipeline failed: {e}")
        traceback.print_exc()


# ════════════════════════════════════════
# Scheduler
# ════════════════════════════════════════
def start_ai_worker():
    """Start the AI report scheduler — runs at the top of every hour."""
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_ai_report_pipeline, 'cron', minute=0)
    scheduler.start()
    print("🤖 [AI Reporter] Scheduler started — reports every hour at :00")