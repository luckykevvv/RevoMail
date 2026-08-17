import os
from enum import Enum
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(os.environ.get("REVOMAIL_PROJECT_ROOT", Path(__file__).resolve().parents[2])).resolve()


class RuntimeEnvironment(str, Enum):
    development = "development"
    test = "test"
    production = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    environment: RuntimeEnvironment = Field(default=RuntimeEnvironment.development, validation_alias="REVOMAIL_ENV")
    host: str = "127.0.0.1"
    port: int = 4173
    debug: bool = Field(default=False, validation_alias="REVOMAIL_DEBUG")
    app_base_url: str = "http://localhost:4173"
    secret_key: str = "revomail-local-session-key"
    token_encryption_key: str = ""
    database_url: str = "file:./data/revomail.db"
    job_lease_seconds: int = Field(default=60, ge=5, le=3600)
    job_max_attempts: int = Field(default=3, ge=1, le=20)

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    @model_validator(mode="after")
    def validate_runtime(self):
        parsed = urlparse(self.app_base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("APP_BASE_URL must be an absolute HTTP or HTTPS URL.")
        if not self.database_url.startswith("file:"):
            raise ValueError("DATABASE_URL must use the file: SQLite URL format.")
        if self.environment == RuntimeEnvironment.production:
            if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
                raise ValueError("APP_BASE_URL must use HTTPS outside loopback in production.")
            if self.secret_key == "revomail-local-session-key" or len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY must contain at least 32 characters in production.")
            if not self.token_encryption_key:
                raise ValueError("TOKEN_ENCRYPTION_KEY is required in production.")
        return self

    @property
    def effective_google_redirect_uri(self) -> str:
        return self.google_redirect_uri or f"{self.app_base_url}/api/v1/auth/google/callback"


settings = Settings()
