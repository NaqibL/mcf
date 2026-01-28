"""API configuration."""

from __future__ import annotations

import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Database
    database_url: str = os.getenv("DATABASE_URL", "")
    
    # API
    api_port: int = int(os.getenv("API_PORT", "8000"))
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
