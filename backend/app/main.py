# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
import asyncio

from app.config import settings
from app.api.routes import signals, market, market_overview, auth, watchlist, coingecko, tips
from app.core.database import engine, Base, SessionLocal
from app.core.redis import is_redis_available, get_cache_info
from app.core.http_client import init_clients, close_clients
from app.services.cache_worker import start_cache_workers, precompute_outcomes
from app.services.overview_worker import start_overview_workers
from app.services.notification_worker import start_notification_worker

# Import Router
from app.api.routes.telegram_auth import router as telegram_auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.subscription import router as subscription_router
from app.api.routes.calendar import router as calendar_router
from app.api.routes.whale import router as whale_router
from app.api.routes.orderbook import router as orderbook_router
from app.api.routes.referral import router as referral_router
from app.api.routes import ai_arena

from app.api.routes.coin_profile import router as coin_profile_router
from app.api.routes.profile import router as profile_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.journal import router as journal_router

# Import AI Worker
from app.services.ai_worker import start_ai_worker, run_ai_report_pipeline

SCREENSHOTS_DIR = os.environ.get("SCREENSHOTS_DIR", "/opt/luxquant/screenshots")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 LuxQuant API Starting...")
    print(f"📡 CoinGecko API Key: {'✓ Configured' if settings.COINGECKO_API_KEY else '✗ Not set'}")

    # === Initialize shared HTTP clients ===
    init_clients()

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
        
        # ═══════════════════════════════════════════
        # INISIASI QUANTITATIVE AI ENGINE
        # ═══════════════════════════════════════════
        # start_ai_worker()
        # asyncio.create_task(run_ai_report_pipeline())
        # ═══════════════════════════════════════════
        
    else:
        print("🟡 Redis not available — running without cache (DB direct queries)")
        start_notification_worker()

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

# Routes
app.include_router(signals.router, prefix="/api/v1/signals", tags=["signals"])
app.include_router(market.router, prefix="/api/v1/market", tags=["market"])
app.include_router(market_overview.router, prefix="/api/v1/market", tags=["market-overview"])
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(coingecko.router, prefix="/api/v1/coingecko", tags=["coingecko"])
app.include_router(tips.router, prefix="/api/v1", tags=["tips"])
app.include_router(telegram_auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1", tags=["admin"])
app.include_router(subscription_router, prefix="/api/v1", tags=["subscription"])
app.include_router(calendar_router, prefix="/api/v1", tags=["calendar"])
app.include_router(whale_router, prefix="/api/v1", tags=["whale"])
app.include_router(orderbook_router, prefix="/api/v1", tags=["orderbook"])
app.include_router(referral_router, prefix="/api/v1", tags=["referral"])
app.include_router(ai_arena.router, prefix="/api/v1/ai-arena", tags=["ai-arena"])
app.include_router(coin_profile_router, prefix="/api/v1/coin-profile", tags=["coin-profile"])
app.include_router(profile_router, prefix="/api/v1", tags=["profile"])
app.include_router(notifications_router, prefix="/api/v1", tags=["notifications"])
app.include_router(journal_router, prefix="/api/v1")

# ═══════════════════════════════════════════
# Serve chart screenshots as static files
# ═══════════════════════════════════════════
if os.path.exists(SCREENSHOTS_DIR):
    app.mount("/api/v1/charts", StaticFiles(directory=SCREENSHOTS_DIR), name="charts")
    print(f"📸 Charts directory mounted: {SCREENSHOTS_DIR}")
else:
    print(f"⚠️ Charts directory not found: {SCREENSHOTS_DIR}")


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