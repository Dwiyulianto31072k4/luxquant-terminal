# backend/app/services/ai_worker.py
import json, os, uuid, httpx, asyncio
from datetime import datetime
from openai import AsyncOpenAI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.redis import cache_set
from dotenv import load_dotenv

load_dotenv()

# Client Configuration
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
deepseek_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"), 
    base_url="https://api.deepseek.com/v1"
)

async def fetch_institutional_intelligence():
    """
    Mengambil data teknis dan intelijen berita (CryptoPanic) untuk narasi yang kaya.
    """
    print("📡 [AI Worker] Gathering High-Fidelity Data & Intelligence...")
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            # 1. Tier 1: Derivatives & Liquidations (Binance)
            res_f = await client.get("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT")
            res_oi = await client.get("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT")
            
            # 2. Intelligence: CryptoPanic News (Free Tier)
            # Gantilah 'API_KEY' dengan key asli Anda atau gunakan publik feed jika tersedia
            news_headlines = []
            try:
                res_news = await client.get("https://cryptopanic.com/api/v1/posts/?currencies=BTC&kind=news&public=true")
                if res_news.status_code == 200:
                    news_headlines = [{"title": p['title'], "url": p['url']} for p in res_news.json()['results'][:5]]
            except: pass

            # 3. Tier 2: Fear & Greed Index
            res_fgi = await client.get("https://api.alternative.me/fng/")
            fgi = res_fgi.json()['data'][0]['value'] if res_fgi.status_code == 200 else "N/A"

            return json.dumps({
                "btc_price": res_f.json().get("markPrice", "0"),
                "funding_rate": res_f.json().get("lastFundingRate", "0"),
                "open_interest": res_oi.json().get("openInterest", "0"),
                "fear_and_greed_index": fgi,
                "latest_intelligence": news_headlines
            })
        except Exception as e:
            print(f"⚠️ [AI Worker] Data fetch warning: {e}")
            return json.dumps({"status": "partial_data", "btc_price": "85000"})

async def run_ai_report_pipeline():
    print(f"🤖 [AI Worker] Initiating AlphaCore Heavy Reasoning... ({datetime.now()})")
    try:
        raw_intelligence = await fetch_institutional_intelligence()
        
        # Stage 1: Professional Pre-Synthesis
        s1_prompt = f"Summarize these market metrics and headlines into a dense quantitative brief: {raw_intelligence}"
        s1_res = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": s1_prompt}],
            max_tokens=400
        )
        brief = s1_res.choices[0].message.content

        # Stage 2: DeepSeek R1 Institutional Synthesis
        s2_system = """You are 'AlphaCore Quantitative Reasoner'. 
        Your mission is to provide an elite, hyper-detailed market analysis. 
        
        STRICT RULES:
        1. NO SIMPLICITY: Be verbose, technical, and analytical. Explain the 'WHY' behind the numbers.
        2. SMART TAGS: Wrap every price, % change, or OI value in: [Value](target_tab). 
           Tabs: orderbook, markets, bitcoin, analytics.
        3. EXTERNAL SOURCES: If a news headline is provided, cite it by wrapping the keyword in: [News Title](URL).
        4. TERMINOLOGY: Use: 'Gamma exposure', 'Orderbook imbalances', 'Liquidity sweeps', 'Mean-reversion'.

        JSON STRUCTURE:
        {
          "sentiment": "bullish/bearish/cautious",
          "confidence": 0-100,
          "sections": {
            "summary": "Executive overview linking price action to news drivers.",
            "derivatives": "Tier 1: Deep dive into mechanical leverage & liquidation zones.",
            "onchain": "Tier 2: Analysis of capital rotation & F&G Index confluence.",
            "chain_of_thought": "> Telemetry scan...\\n> Cross-referencing news with CVD...\\n> Analysis complete."
          }
        }"""
        
        s2_res = await deepseek_client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {"role": "system", "content": s2_system},
                {"role": "user", "content": f"Synthesize this intelligence: {brief}"}
            ],
            response_format={"type": "json_object"}
        )
        
        report_content = json.loads(s2_res.choices[0].message.content)
        final_doc = {
            "id": f"rpt_{uuid.uuid4().hex[:6]}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "model": "AlphaCore Quantitative Reasoner",
            **report_content
        }
        
        cache_set("lq:ai-report:latest", final_doc, ttl=3600)
        print(f"✅ [AI Worker] AlphaCore Institutional Scan Complete.")
        
    except Exception as e:
        print(f"❌ [AI Worker] Pipeline Error: {e}")

def start_ai_worker():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_ai_report_pipeline, 'cron', minute=0)
    scheduler.start()