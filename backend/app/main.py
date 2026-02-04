from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.api.routes import signals, market, auth, watchlist, analytics
from app.core.database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 LuxQuant API Starting...")
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
app.include_router(analytics.router, prefix="/api/v1/signals/analytics", tags=["analytics"])
app.include_router(market.router, prefix="/api/v1/market", tags=["market"])
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])

@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "status": "running"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}