from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    # App
    APP_NAME: str = "LuxQuant Terminal API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@141.11.25.194:5433/luxquant"
    
    # External APIs
    COINALYZE_API_KEY: str = ""
    COINGECKO_API_KEY: str = ""  # Demo API key (free, 30 calls/min)
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    
    # API Keys (optional)
    API_KEY: str = os.getenv("API_KEY", "")
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()