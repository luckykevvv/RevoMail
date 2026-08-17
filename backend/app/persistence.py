import base64
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken

from backend.app.config import PROJECT_ROOT, Settings


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def sqlite_path(database_url: str, project_root: Path = PROJECT_ROOT) -> Path:
    if not database_url.startswith("file:"):
        raise ValueError("DATABASE_URL must use the file: SQLite URL format.")
    raw_path = database_url.removeprefix("file:")
    if raw_path.startswith("//"):
        raw_path = raw_path[2:]
    path = Path(raw_path)
    return path.resolve() if path.is_absolute() else (project_root / path).resolve()


class Database:
    def __init__(self, database_url: str, project_root: Path = PROJECT_ROOT):
        self.path = sqlite_path(database_url, project_root)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
        finally:
            connection.close()

    def migrate(self, migrations_path: Path = PROJECT_ROOT / "database" / "migrations") -> int:
        migration_files = sorted(migrations_path.glob("*/migration.sql"))
        with self.connect() as connection:
            current = int(connection.execute("PRAGMA user_version").fetchone()[0])
            for index, migration_file in enumerate(migration_files, start=1):
                if index <= current:
                    continue
                script = migration_file.read_text(encoding="utf-8")
                connection.executescript(f"BEGIN IMMEDIATE;\n{script}\nPRAGMA user_version = {index};\nCOMMIT;")
                current = index
        return current

    def rollback_last(self, migrations_path: Path = PROJECT_ROOT / "database" / "migrations") -> int:
        migration_directories = sorted(path.parent for path in migrations_path.glob("*/migration.sql"))
        with self.connect() as connection:
            current = int(connection.execute("PRAGMA user_version").fetchone()[0])
            if current == 0:
                return 0
            rollback_file = migration_directories[current - 1] / "rollback.sql"
            if not rollback_file.is_file():
                raise RuntimeError(f"Migration {migration_directories[current - 1].name} has no rollback.sql file.")
            script = rollback_file.read_text(encoding="utf-8")
            connection.executescript(f"BEGIN IMMEDIATE;\n{script}\nPRAGMA user_version = {current - 1};\nCOMMIT;")
            return current - 1

    def is_ready(self) -> bool:
        try:
            with self.connect() as connection:
                connection.execute("SELECT 1").fetchone()
            return True
        except sqlite3.Error:
            return False


class TokenProtector:
    def __init__(self, encryption_key: str, secret_key: str):
        key = encryption_key.strip()
        if not key:
            digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
            key = base64.urlsafe_b64encode(digest).decode("ascii")
        try:
            self._fernet = Fernet(key.encode("ascii"))
        except (ValueError, TypeError) as exc:
            raise ValueError("TOKEN_ENCRYPTION_KEY must be a valid Fernet key.") from exc

    def protect(self, value: dict) -> str:
        payload = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return self._fernet.encrypt(payload).decode("ascii")

    def unprotect(self, value: str) -> dict:
        try:
            payload = self._fernet.decrypt(value.encode("ascii"))
        except InvalidToken as exc:
            raise RuntimeError("Stored credential could not be decrypted.") from exc
        return json.loads(payload.decode("utf-8"))


@dataclass(frozen=True)
class AuthenticatedSession:
    token: str
    user: dict


@dataclass(frozen=True)
class OAuthTransactionRecord:
    return_to: str


class AuthRepository:
    def __init__(self, database: Database, protector: TokenProtector):
        self.database = database
        self.protector = protector

    def save_authorized_account(self, profile: dict, provider: str, scopes: list[str], tokens: dict) -> tuple[str, str]:
        now = utc_now().isoformat()
        user_id = str(profile.get("id") or profile["email"])
        connection_id = f"{provider}:{user_id}"
        credential_id = str(uuid4())
        encrypted = self.protector.protect(tokens)
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute(
                    'INSERT INTO "User" ("id", "email", "displayName", "avatarUrl", "createdAt", "updatedAt") '
                    'VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT("id") DO UPDATE SET "email"=excluded."email", '
                    '"displayName"=excluded."displayName", "avatarUrl"=excluded."avatarUrl", "updatedAt"=excluded."updatedAt"',
                    (user_id, profile["email"], profile["displayName"], profile.get("avatarUrl"), now, now),
                )
                connection.execute(
                    'INSERT INTO "MailboxConnection" ("id", "userId", "provider", "providerAccountId", "email", "displayName", "scopes", "status", "createdAt", "updatedAt") '
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT("provider", "providerAccountId") DO UPDATE SET '
                    '"email"=excluded."email", "displayName"=excluded."displayName", "scopes"=excluded."scopes", "status"=excluded."status", "updatedAt"=excluded."updatedAt"',
                    (connection_id, user_id, provider, user_id, profile["email"], profile["displayName"], json.dumps(scopes), "CONNECTED", now, now),
                )
                connection.execute(
                    'INSERT INTO "OAuthCredential" ("id", "connectionId", "accessTokenEncrypted", "refreshTokenEncrypted", "tokenType", "createdAt", "updatedAt") '
                    'VALUES (?, ?, ?, NULL, ?, ?, ?) ON CONFLICT("connectionId") DO UPDATE SET '
                    '"accessTokenEncrypted"=excluded."accessTokenEncrypted", "updatedAt"=excluded."updatedAt", "version"="OAuthCredential"."version"+1',
                    (credential_id, connection_id, encrypted, "EncryptedJson", now, now),
                )
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
        return user_id, connection_id

    def create_session(self, user_id: str, lifetime: timedelta = timedelta(days=7)) -> str:
        token = Fernet.generate_key().decode("ascii")
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        now = utc_now()
        with self.database.connect() as connection:
            connection.execute(
                'INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt", "idleAt", "lastSeenAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
                (str(uuid4()), user_id, token_hash, (now + lifetime).isoformat(), (now + timedelta(hours=24)).isoformat(), now.isoformat(), now.isoformat()),
            )
        return token

    def find_session(self, token: str | None) -> AuthenticatedSession | None:
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        now = utc_now().isoformat()
        with self.database.connect() as connection:
            row = connection.execute(
                'SELECT s."userId", u."email", u."displayName", u."avatarUrl" FROM "Session" s JOIN "User" u ON u."id"=s."userId" '
                'WHERE s."tokenHash"=? AND s."expiresAt">? AND s."idleAt">?',
                (token_hash, now, now),
            ).fetchone()
            if not row:
                return None
            connection.execute('UPDATE "Session" SET "lastSeenAt"=? WHERE "tokenHash"=?', (now, token_hash))
        return AuthenticatedSession(token=token, user={"id": row["userId"], "email": row["email"], "displayName": row["displayName"], "avatarUrl": row["avatarUrl"]})

    def delete_session(self, token: str | None) -> None:
        if not token:
            return
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        with self.database.connect() as connection:
            connection.execute('DELETE FROM "Session" WHERE "tokenHash"=?', (token_hash,))

    def list_accounts(self, user_id: str) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute(
                'SELECT "id", "provider", "email", "displayName", "status", "scopes" FROM "MailboxConnection" WHERE "userId"=? ORDER BY "createdAt"',
                (user_id,),
            ).fetchall()
        return [{"id": row["id"], "provider": row["provider"], "email": row["email"], "displayName": row["displayName"], "status": row["status"], "scopes": json.loads(row["scopes"])} for row in rows]

    def get_tokens(self, user_id: str) -> dict | None:
        with self.database.connect() as connection:
            row = connection.execute(
                'SELECT c."accessTokenEncrypted" FROM "OAuthCredential" c JOIN "MailboxConnection" m ON m."id"=c."connectionId" WHERE m."userId"=? AND m."status"=? ORDER BY m."createdAt" LIMIT 1',
                (user_id, "CONNECTED"),
            ).fetchone()
        return self.protector.unprotect(row["accessTokenEncrypted"]) if row else None

    def disconnect(self, user_id: str, connection_id: str) -> bool:
        with self.database.connect() as connection:
            cursor = connection.execute('DELETE FROM "MailboxConnection" WHERE "id"=? AND "userId"=?', (connection_id, user_id))
            return cursor.rowcount == 1


class OAuthTransactionRepository:
    def __init__(self, database: Database, protector: TokenProtector, ttl_seconds: int = 600):
        self.database = database
        self.protector = protector
        self.ttl_seconds = ttl_seconds

    def put(self, state: str, return_to: str) -> None:
        now = utc_now()
        state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()
        encrypted_marker = self.protector.protect({"purpose": "oauth-state"})
        with self.database.connect() as connection:
            connection.execute('DELETE FROM "OAuthTransaction" WHERE "expiresAt"<=?', (now.isoformat(),))
            connection.execute(
                'INSERT INTO "OAuthTransaction" ("id", "stateHash", "provider", "verifierEncrypted", "returnTo", "expiresAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
                (str(uuid4()), state_hash, "google", encrypted_marker, return_to, (now + timedelta(seconds=self.ttl_seconds)).isoformat(), now.isoformat()),
            )

    def consume(self, state: str) -> OAuthTransactionRecord | None:
        if not state:
            return None
        state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()
        now = utc_now().isoformat()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    'SELECT "id", "returnTo", "expiresAt" FROM "OAuthTransaction" WHERE "stateHash"=?',
                    (state_hash,),
                ).fetchone()
                if row:
                    connection.execute('DELETE FROM "OAuthTransaction" WHERE "id"=?', (row["id"],))
                connection.execute('DELETE FROM "OAuthTransaction" WHERE "expiresAt"<=?', (now,))
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
        if not row or row["expiresAt"] <= now:
            return None
        return OAuthTransactionRecord(return_to=row["returnTo"])


def build_persistence(settings: Settings) -> tuple[Database, AuthRepository, OAuthTransactionRepository]:
    database = Database(settings.database_url)
    database.migrate()
    protector = TokenProtector(settings.token_encryption_key, settings.secret_key)
    return database, AuthRepository(database, protector), OAuthTransactionRepository(database, protector)
