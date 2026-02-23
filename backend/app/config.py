"""
LuxQuant Terminal - Application Configuration
==============================================
Central config for all settings. Values can be overridden via .env file
or environment variables.

Changes from original:
+ Redis connection settings (REDIS_HOST, REDIS_PORT, REDIS_DB)
+ Cache worker intervals (SIGNAL_CACHE_INTERVAL, MARKET_CACHE_INTERVAL, etc.)
+ HTTP client timeouts (BINANCE_TIMEOUT, COINGECKO_TIMEOUT)
+ Production CORS origins
+ BSCSCAN_API_KEY + RECEIVING_WALLET_BSC for subscription payments
"""
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # ============================================
    # App
    # ============================================
    APP_NAME: str = "LuxQuant Terminal API"
    VERSION: str = "2.0.0"
    DEBUG: bool = False

    # ============================================
    # Database
    # ============================================
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://user:password@localhost:5432/luxquant"
    )

    # ============================================
    # Redis
    # ============================================
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))

    # ============================================
    # CORS
    # ============================================
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",      # Vite default
        "http://127.0.0.1:5173",
    ]

    # ============================================
    # API Keys (optional, for future use)
    # ============================================
    API_KEY: str = os.getenv("API_KEY", "")

    # ============================================
    # Pagination
    # ============================================
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # ============================================
    # Cache Worker Intervals (seconds)
    # ============================================
    # Tier 1 — HOT: BTC price, market overview
    MARKET_CACHE_INTERVAL: int = int(os.getenv("MARKET_CACHE_INTERVAL", "15"))

    # Tier 2 — WARM: Signal stats, outcomes, pages
    SIGNAL_CACHE_INTERVAL: int = int(os.getenv("SIGNAL_CACHE_INTERVAL", "90"))

    # Tier 3 — COOL: CoinGecko global, coins market
    COINGECKO_CACHE_INTERVAL: int = int(os.getenv("COINGECKO_CACHE_INTERVAL", "180"))

    # Tier 4 — COLD: Bitcoin detailed (technical, network, on-chain, news)
    BITCOIN_CACHE_INTERVAL: int = int(os.getenv("BITCOIN_CACHE_INTERVAL", "90"))

    # ============================================
    # HTTP Client Timeouts (seconds)
    # ============================================
    BINANCE_TIMEOUT: float = float(os.getenv("BINANCE_TIMEOUT", "12.0"))
    COINGECKO_TIMEOUT: float = float(os.getenv("COINGECKO_TIMEOUT", "15.0"))
    GENERAL_TIMEOUT: float = float(os.getenv("GENERAL_TIMEOUT", "15.0"))

    # ============================================
    # External API Keys
    # ============================================
    COINGECKO_API_KEY: str = os.getenv("COINGECKO_API_KEY", "")
    SOSOVALUE_API_KEY: str = os.getenv("SOSOVALUE_API_KEY", "")
    ETHERSCAN_API_KEY: str = os.getenv("ETHERSCAN_API_KEY", "") # ✅ Tambahkan baris ini

    # ============================================
    # Subscription / BSCScan (NEW)
    # ============================================
    BSCSCAN_API_KEY: str = os.getenv("BSCSCAN_API_KEY", "")
    RECEIVING_WALLET_BSC: str = os.getenv("RECEIVING_WALLET_BSC", "")

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Allow extra env vars without error


settings = Settings()