import os
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(os.environ.get("REVOMAIL_PROJECT_ROOT", Path(__file__).resolve().parents[2])).resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 4173
    debug: bool = Field(default=False, validation_alias="REVOMAIL_DEBUG")
    app_base_url: str = "http://localhost:4173"
    secret_key: str = Field(
        default="revomail-local-session-key",
        validation_alias=AliasChoices("SECRET_KEY", "TOKEN_ENCRYPTION_KEY"),
    )

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    @property
    def effective_google_redirect_uri(self) -> str:
        return self.google_redirect_uri or f"{self.app_base_url}/api/v1/auth/google/callback"


settings = Settings()
