"""API configuration."""

from __future__ import annotations

import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings.

    Local dev: set values in a .env file in the project root.
    Production: set as environment variables on Railway / GitHub Actions.
    """

    # --- Database ---
    # Set DATABASE_URL to a postgres:// connection string to use PostgreSQL
    # (e.g. Supabase). Leave unset to fall back to local DuckDB.
    database_url: str | None = None
    db_path: str = os.getenv("DB_PATH", "data/mcf.duckdb")

    # --- Supabase (optional, enables auth + file storage) ---
    supabase_url: str | None = None
    supabase_service_key: str | None = None
    # JWT secret from Supabase Dashboard > Settings > API > JWT Settings
    supabase_jwt_secret: str | None = None

    # --- User (local dev fallback when auth is disabled) ---
    default_user_id: str = os.getenv("DEFAULT_USER_ID", "default_user")

    # --- Resume (local dev fallback when file upload is disabled) ---
    resume_path: str = os.getenv("RESUME_PATH", "resume/resume.pdf")

    # --- API ---
    api_port: int = int(os.getenv("API_PORT", "8000"))
    # Comma-separated list of allowed CORS origins (e.g. https://myapp.vercel.app)
    allowed_origins: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    # When true, allow requests without Authorization header to use default_user_id (local dev only)
    allow_anonymous_local: bool = os.getenv("ALLOW_ANONYMOUS_LOCAL", "false").lower() in ("1", "true", "yes")

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def cors_origins(self) -> list[str]:
        """Parse ALLOWED_ORIGINS into a list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def auth_enabled(self) -> bool:
        """Auth is enabled when Supabase is configured (JWT secret or URL for JWKS)."""
        return bool(self.supabase_jwt_secret or self.supabase_url)

    @property
    def storage_enabled(self) -> bool:
        """Supabase Storage is enabled when URL + service key are both set."""
        return bool(self.supabase_url and self.supabase_service_key)


settings = Settings()
