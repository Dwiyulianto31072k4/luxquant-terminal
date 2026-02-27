# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
import asyncio # ← Tambahkan asyncio untuk menjalankan task AI di background

from app.config import settings
from app.api.routes import signals, market, market_overview, auth, watchlist, coingecko, tips
from app.core.database import engine, Base, SessionLocal
from app.core.redis import is_redis_available, get_cache_info
from app.core.http_client import init_clients, close_clients
from app.services.cache_worker import start_cache_workers, precompute_outcomes
from app.services.overview_worker import start_overview_workers

# Import Router
from app.api.routes.telegram_auth import router as telegram_auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.subscription import router as subscription_router
from app.api.routes.calendar import router as calendar_router
from app.api.routes.whale import router as whale_router
from app.api.routes.orderbook import router as orderbook_router
from app.api.routes import ai_arena                                   # ← ROUTER AI ARENA BARU

# Import AI Worker
from app.services.ai_worker import start_ai_worker, run_ai_report_pipeline # ← WORKER AI BARU

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
        
        # ═══════════════════════════════════════════
        # INISIASI QUANTITATIVE AI ENGINE
        # ═══════════════════════════════════════════
        start_ai_worker() # Mulai penjadwalan tiap jam
        
        # Jalankan satu kali pemindaian awal (First Scan) agar saat server nyala, 
        # frontend langsung punya data laporan terbaru tanpa nunggu jam berikutnya.
        asyncio.create_task(run_ai_report_pipeline())
        # ═══════════════════════════════════════════
        
    else:
        print("🟡 Redis not available — running without cache (DB direct queries)")

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
app.include_router(ai_arena.router, prefix="/api/v1/ai-arena", tags=["ai-arena"]) # ← ENDPOINT AI ARENA

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