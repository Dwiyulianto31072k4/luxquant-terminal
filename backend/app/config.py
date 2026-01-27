from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    # App
    APP_NAME: str = "LuxQuant Terminal API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database - sesuaikan dengan production DB kamu
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://user:password@localhost:5432/luxquant"
    )
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite default
        "http://127.0.0.1:5173",
    ]
    
    # API Keys (optional, untuk future use)
    API_KEY: str = os.getenv("API_KEY", "")
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
