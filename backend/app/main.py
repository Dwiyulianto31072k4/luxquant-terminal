# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.activity_tracker import ActivityTrackerMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
import asyncio

from app.config import settings
from app.api.routes import signals, market, market_overview, auth, watchlist, coingecko, tips
from app.api.routes import signal_journey
from app.api.routes import api_keys
from app.api.routes import public_signals
from app.api.routes import public_data
from app.api.routes import public_analytics
from app.core.database import engine, Base, SessionLocal
from app.core.redis import is_redis_available, get_cache_info
from app.core.http_client import init_clients, close_clients
from app.services.cache_worker import start_cache_workers, precompute_outcomes
from app.services.overview_worker import start_overview_workers
from app.services.notification_worker import start_notification_worker
from app.api.routes import coins, daily_dashboard, edge_lab
from app.api.routes import workspace, finance, growth
from app.api.routes import services_monitor


# Import Router
from app.api.routes.telegram_auth import router as telegram_auth_router
from app.api.routes.discord_auth import router as discord_auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.admin_cashout import router as admin_cashout_router
from app.api.routes.admin_api_keys import router as admin_api_keys_router
from app.api.routes.subscription import router as subscription_router
from app.api.routes.calendar import router as calendar_router
from app.api.routes.whale import router as whale_router
from app.api.routes.money_flow_router import router as money_flow_router
from app.api.routes.delisting import router as delisting_router
from app.api.routes.orderbook import router as orderbook_router
from app.api.routes.referral import router as referral_router
from app.api.routes import ai_arena
from app.api.routes import ai_arena_v6
from app.api.routes import enrichment_v3
from app.api.routes import btc_correlation
from app.api.routes import og_share
from app.api.routes.autotrade import router as autotrade_router
from app.api.routes.autotrade_auth import router as autotrade_auth_router 

from app.api.routes.coin_profile import router as coin_profile_router
from app.api.routes.profile import router as profile_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.notification_preferences import router as notification_prefs_router
from app.api.routes.announcements import router as announcements_router
from app.api.routes.admin_announcements import router as admin_announcements_router
from app.api.routes.coin_watch import router as coin_watch_router
from app.api.routes.journal import router as journal_router
from app.api.routes.market_pulse import router as market_pulse_router
from app.api.routes.crypto_news_endpoint import router as crypto_news_feed_router
from app.api.routes.onchain_endpoint import router as onchain_router
from app.api.routes.fx import router as fx_router



# Import AI Worker
from app.services.ai_arena_worker import start_ai_arena_worker, run_ai_report_pipeline
from app.services.fx_worker import start_fx_worker
from app.services.whale_worker import start_whale_worker
from app.services.subscription_worker import start_subscription_worker

SCREENSHOTS_DIR = os.environ.get("SCREENSHOTS_DIR", "/opt/luxquant/screenshots")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 LuxQuant API Starting...")
    print(f"📡 CoinGecko API Key: {'✓ Configured' if settings.COINGECKO_API_KEY else '✗ Not set'}")

    # === Initialize shared HTTP clients ===
    init_clients()

    # === Single-leader election for background pollers ===
    # Runs in every worker, but only ONE becomes leader and actually polls
    # external APIs — the rest stand by and take over if the leader dies.
    # Prevents N× duplicate CoinGecko/Binance calls under `--workers N`.
    try:
        from app.core.leader import start_leader_election
        start_leader_election()
    except Exception as e:
        print(f"⚠️ Leader election failed to start: {e}")

    # === Pre-create _cache_outcomes table BEFORE workers start ===
    try:
        db = SessionLocal()
        precompute_outcomes(db)
        db.close()
        print("📋 Cache outcomes table initialized")
    except Exception as e:
        print(f"⚠️ Could not pre-create outcomes table: {e}")

    if is_redis_available():
        print(f"🟢 Redis connected ({settings.REDIS_HOST}:{settings.REDIS_PORT})")
        start_cache_workers()
        start_overview_workers()
        start_notification_worker()
        start_fx_worker()
        start_whale_worker()

        # ─── Cache invalidator: LISTEN new_signal/signal_update → flush lq:signals:* ───
        from app.services.cache_invalidator import cache_invalidator_loop
        asyncio.create_task(cache_invalidator_loop())
        print("⚡ Signal cache invalidator started (LISTEN new_signal)")
        
        # ═══════════════════════════════════════════
        # INISIASI QUANTITATIVE AI ENGINE
        # ═══════════════════════════════════════════
        # DEPRECATED 2026-05-06: v4 in-process worker replaced by
        # luxquant-arena-v6.timer (systemd, runs every 6h).
        # Frontend /ai-arena now renders v6. Legacy v4 still accessible at /ai-arena/legacy.
        # To rollback: uncomment start_ai_arena_worker() below + restart backend.
        # try:
        #     start_ai_arena_worker()
        # except Exception as e:
        #     print(f'>>> AI Arena worker FAILED: {e}')
        #     import traceback
        #     traceback.print_exc()
        # asyncio.create_task(run_ai_report_pipeline())
        # ═══════════════════════════════════════════
        
    else:
        print("🟡 Redis not available — running without cache (DB direct queries)")
        start_notification_worker()

    # Subscription expiry + VIP grace/kick worker (independent of Redis)
    start_subscription_worker()

    # Platform-wide journey aggregate (all-pairs time-to-TP) — incremental,
    # materialized in Postgres, refreshed hourly. Backfills on first run.
    try:
        from app.services.journey_aggregate import start_journey_aggregate_worker
        start_journey_aggregate_worker()
        print("📊 Journey aggregate worker started (incremental hourly)")
    except Exception as e:
        print(f"⚠️ Journey aggregate worker failed to start: {e}")

    # NOTE: AutoTrade engine runs as a separate systemd service
    # (luxquant-autotrade.service), not embedded in this uvicorn process.

    yield

    # === Cleanup ===
    print("👋 LuxQuant API Shutting down...")
    await close_clients()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="LuxQuant Institutional API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Passive activity tracking for the Growth dashboard (Batch 1).
# Reads Bearer JWT + URL, dedupes via Redis, writes async — never blocks.
app.add_middleware(ActivityTrackerMiddleware)

# Routes
app.include_router(signals.router, prefix="/api/v1/signals", tags=["signals"])
app.include_router(announcements_router, tags=["announcements"])
app.include_router(admin_announcements_router, tags=["admin-announcements"])
app.include_router(signal_journey.router, prefix="/api/v1/signals", tags=["signals-journey"])
app.include_router(public_signals.router, prefix="/api/public/v1", tags=["public-signals"])
app.include_router(public_data.router, prefix="/api/public/v1", tags=["public-data"])
app.include_router(public_analytics.router, prefix="/api/public/v1", tags=["public-analytics"])
app.include_router(btc_correlation.router, prefix="/api/v1/signals", tags=["btc-correlation"])
app.include_router(og_share.router, prefix="/api/v1", tags=["og-share"])
app.include_router(market.router, prefix="/api/v1/market", tags=["market"])
app.include_router(market_overview.router, prefix="/api/v1/market", tags=["market-overview"])
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(coin_watch_router, prefix="/api/v1", tags=["coin-watch"])
app.include_router(coingecko.router, prefix="/api/v1/coingecko", tags=["coingecko"])
app.include_router(tips.router, prefix="/api/v1", tags=["tips"])
app.include_router(telegram_auth_router, prefix="/api/v1")
app.include_router(api_keys.router, prefix="/api/v1", tags=["api-keys"])
app.include_router(discord_auth_router, prefix="/api/v1")
app.include_router(autotrade_auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1", tags=["admin"])
app.include_router(admin_cashout_router, prefix="/api/v1", tags=["admin-cashout"])
app.include_router(admin_api_keys_router, prefix="/api/v1", tags=["admin-api-keys"])
app.include_router(subscription_router, prefix="/api/v1", tags=["subscription"])
app.include_router(calendar_router, prefix="/api/v1", tags=["calendar"])
app.include_router(whale_router, prefix="/api/v1", tags=["whale"])
app.include_router(money_flow_router, prefix="/api/v1", tags=["money-flow"])
app.include_router(delisting_router, prefix="/api/v1", tags=["delistings"])
app.include_router(orderbook_router, prefix="/api/v1", tags=["orderbook"])
app.include_router(referral_router, prefix="/api/v1", tags=["referral"])
app.include_router(ai_arena.router, prefix="/api/v1/ai-arena", tags=["ai-arena"])
app.include_router(ai_arena_v6.router, prefix="/api/v1", tags=["ai-arena-v6"])
app.include_router(enrichment_v3.router, tags=["enrichment-v3"])
app.include_router(autotrade_router, prefix="/api/v1", tags=["autotrade"])
app.include_router(coin_profile_router, prefix="/api/v1/coin-profile", tags=["coin-profile"])
app.include_router(profile_router, prefix="/api/v1", tags=["profile"])
app.include_router(notifications_router, prefix="/api/v1", tags=["notifications"])
app.include_router(notification_prefs_router, prefix="/api/v1", tags=["notification-preferences"])
app.include_router(journal_router, prefix="/api/v1")
app.include_router(market_pulse_router, prefix="/api/v1/market-pulse", tags=["market-pulse"])
app.include_router(crypto_news_feed_router, prefix="/api/v1/crypto-news-feed", tags=["crypto-news-feed"])
app.include_router(onchain_router, prefix="/api/v1/onchain", tags=["onchain"])
app.include_router(coins.router, prefix="/api/v1/coins", tags=["coins"])
app.include_router(fx_router, prefix="/api/v1/fx", tags=["fx"])
app.include_router(daily_dashboard.router, prefix="/api/v1", tags=["analytics"])
app.include_router(edge_lab.router, prefix="/api/v1", tags=["analytics"])
app.include_router(workspace.router, tags=["workspace"])
app.include_router(services_monitor.router, tags=["workspace-services"])
app.include_router(finance.router, tags=["finance"])
app.include_router(growth.router, tags=["growth"])


# ═══════════════════════════════════════════
# Serve chart screenshots as static files
# ═══════════════════════════════════════════
if os.path.exists(SCREENSHOTS_DIR):
    app.mount("/api/v1/charts", StaticFiles(directory=SCREENSHOTS_DIR), name="charts")
    print(f"📸 Charts directory mounted: {SCREENSHOTS_DIR}")
else:
    print(f"⚠️ Charts directory not found: {SCREENSHOTS_DIR}")

# ═══════════════════════════════════════════
# Serve news images as static files
# ═══════════════════════════════════════════
NEWS_IMAGES_DIR = os.environ.get("NEWS_IMAGES_DIR", "/opt/luxquant/news-images")
if os.path.exists(NEWS_IMAGES_DIR):
    app.mount("/api/v1/news-images", StaticFiles(directory=NEWS_IMAGES_DIR), name="news-images")
    print(f"📷 News images directory mounted: {NEWS_IMAGES_DIR}")
else:
    print(f"⚠️ News images directory not found: {NEWS_IMAGES_DIR}")

# Serve announcement images as static files
ANNOUNCEMENT_IMAGES_DIR = os.environ.get("ANNOUNCEMENT_IMAGES_DIR", "/opt/luxquant/announcement-images")
os.makedirs(ANNOUNCEMENT_IMAGES_DIR, exist_ok=True)
app.mount("/api/v1/announcement-images", StaticFiles(directory=ANNOUNCEMENT_IMAGES_DIR), name="announcement-images")

# ═══════════════════════════════════════════
# Serve news videos as static files
# ═══════════════════════════════════════════
NEWS_VIDEOS_DIR = os.environ.get("NEWS_VIDEOS_DIR", "/opt/luxquant/news-videos")
os.makedirs(NEWS_VIDEOS_DIR, exist_ok=True)
app.mount("/api/v1/news-videos", StaticFiles(directory=NEWS_VIDEOS_DIR), name="news-videos")
print(f"🎬 News videos directory mounted: {NEWS_VIDEOS_DIR}")

# ═══════════════════════════════════════════
# Serve onchain images as static files
# ═══════════════════════════════════════════
ONCHAIN_IMAGES_DIR = os.environ.get("ONCHAIN_IMAGES_DIR", "/opt/luxquant/onchain-images")
if os.path.exists(ONCHAIN_IMAGES_DIR):
    app.mount("/api/v1/onchain-images", StaticFiles(directory=ONCHAIN_IMAGES_DIR), name="onchain-images")
    print(f"🔗 Onchain images directory mounted: {ONCHAIN_IMAGES_DIR}")
else:
    print(f"⚠️ Onchain images directory not found: {ONCHAIN_IMAGES_DIR}")



# ═══════════════════════════════════════════
# Serve AI Arena chart images
# ═══════════════════════════════════════════
AI_ARENA_CHART_DIR = "/opt/luxquant/ai-arena-charts"
if os.path.exists(AI_ARENA_CHART_DIR):
    app.mount("/api/v1/ai-arena-charts", StaticFiles(directory=AI_ARENA_CHART_DIR), name="ai-arena-charts")
    print(f"🧠 AI Arena charts mounted: {AI_ARENA_CHART_DIR}")

@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "status": "running",
        "redis": "connected" if is_redis_available() else "not available",
        "coingecko_api": "configured" if settings.COINGECKO_API_KEY else "not configured"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "redis": get_cache_info(),
    }
