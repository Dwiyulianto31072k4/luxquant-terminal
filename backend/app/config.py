# backend/app/config.py
"""
LuxQuant Terminal - Configuration
Load settings dari environment variables
"""
import os
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # App Info
    APP_NAME: str = "LuxQuant Terminal API"
    VERSION: str = "1.0.0"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://luxq:uKCjpVAkpeExAiLcFNETgmP@76.13.194.86:5432/luxquant"
    )
    
    # Redis
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    
    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-super-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ]
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100
    
    # CoinGecko API
    COINGECKO_API_KEY: str = os.getenv("COINGECKO_API_KEY", "")
    SOSOVALUE_API_KEY: str = os.getenv("SOSOVALUE_API_KEY", "")
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()