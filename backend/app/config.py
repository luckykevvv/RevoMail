from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Security
    secret_key: str  # used for signing session cookies — must be set in .env
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    # LLM
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"   # override in .env if you want a different model
    anthropic_api_key: str = ""

    # Database (SQLite for local dev; swap for postgres:// in prod)
    database_url: str = "sqlite:///./revomail.db"


settings = Settings()
