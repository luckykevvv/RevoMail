import base64
import os
import secrets
from enum import Enum
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(os.environ.get("REVOMAIL_PROJECT_ROOT", Path(__file__).resolve().parents[2])).resolve()

DEFAULT_RUNTIME_KEY_FILE = PROJECT_ROOT / "data" / "revomail-server.key"
_FALLBACK_SECRET_KEY = "revomail-local-session-key"


class RuntimeEnvironment(str, Enum):
    development = "development"
    test = "test"
    production = "production"


def _is_valid_fernet_key(value: str | None) -> bool:
    if not value or len(value) != 44 or not value.endswith("="):
        return False
    try:
        return len(base64.urlsafe_b64decode(value)) == 32
    except Exception:
        return False


def _read_key_file(key_file: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not key_file.is_file():
        return values
    for line in key_file.read_text(encoding="utf-8").splitlines():
        name, _, value = line.partition("=")
        name = name.strip()
        value = value.strip()
        if name:
            values[name] = value
    return values


def resolve_runtime_keys(
    secret_key: str,
    token_encryption_key: str,
    key_file: Path = DEFAULT_RUNTIME_KEY_FILE,
) -> tuple[str, str]:
    """Return the session and credential-encryption keys, generating and persisting any missing one."""
    stored = _read_key_file(key_file)
    needs_write = False
    if not secret_key or secret_key == _FALLBACK_SECRET_KEY:
        secret_key = stored.get("SECRET_KEY")
        if not secret_key:
            secret_key = secrets.token_urlsafe(48)
            needs_write = True
    if not token_encryption_key or not _is_valid_fernet_key(token_encryption_key):
        token_key = stored.get("TOKEN_ENCRYPTION_KEY")
        if not _is_valid_fernet_key(token_key):
            token_key = base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")
            needs_write = True
        token_encryption_key = token_key
    if needs_write:
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_text(
            f"SECRET_KEY={secret_key}\nTOKEN_ENCRYPTION_KEY={token_encryption_key}\n",
            encoding="utf-8",
        )
        try:
            os.chmod(key_file, 0o600)
        except OSError:
            pass
    return secret_key, token_encryption_key


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
    secret_key: str = _FALLBACK_SECRET_KEY
    token_encryption_key: str = ""
    runtime_key_file: Path = DEFAULT_RUNTIME_KEY_FILE
    database_url: str = "file:./data/revomail.db"
    job_lease_seconds: int = Field(default=60, ge=5, le=3600)
    job_max_attempts: int = Field(default=3, ge=1, le=20)
    mail_send_limit_per_minute: int = Field(default=10, ge=1, le=100)

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    @model_validator(mode="after")
    def validate_runtime(self):
        parsed = urlparse(self.app_base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("APP_BASE_URL must be an absolute HTTP or HTTPS URL.")
        if not self.database_url.startswith("file:"):
            raise ValueError("DATABASE_URL must use the file: SQLite URL format.")
        secret_key, token_key = resolve_runtime_keys(self.secret_key, self.token_encryption_key, self.runtime_key_file)
        self.secret_key = secret_key
        self.token_encryption_key = token_key
        if self.environment == RuntimeEnvironment.production:
            if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
                raise ValueError("APP_BASE_URL must use HTTPS outside loopback in production.")
            if len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY must contain at least 32 characters in production.")
        return self

    @property
    def effective_google_redirect_uri(self) -> str:
        return self.google_redirect_uri or f"{self.app_base_url}/api/v1/auth/google/callback"


settings = Settings()
