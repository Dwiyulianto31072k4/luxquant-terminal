# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.api.routes import signals, market, auth, watchlist, coingecko
from app.core.database import engine, Base
from app.core.redis import is_redis_available, get_cache_info
from app.services.cache_worker import start_cache_workers

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 LuxQuant API Starting...")
    print(f"📡 CoinGecko API Key: {'✓ Configured' if settings.COINGECKO_API_KEY else '✗ Not set'}")
    
    # Start Redis cache workers
    if is_redis_available():
        print(f"🟢 Redis connected ({settings.REDIS_HOST}:{settings.REDIS_PORT})")
        start_cache_workers()
    else:
        print("🟡 Redis not available — running without cache (DB direct queries)")
    
    yield
    # Shutdown
    print("👋 LuxQuant API Shutting down...")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="LuxQuant Trading Signals API",
    lifespan=lifespan
)

# CORS
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
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(coingecko.router, prefix="/api/v1/coingecko", tags=["coingecko"])

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