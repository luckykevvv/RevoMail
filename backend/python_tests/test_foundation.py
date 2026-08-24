from datetime import timedelta

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app.config import Settings
from backend.app.jobs import JobRepository
from backend.app.mailbox import MailboxRepository
from backend.app.main import create_app
from backend.app.persistence import Database, TokenProtector, utc_now
from backend.app.services.mailbox import MailboxSyncService


def test_production_configuration_fails_fast_with_safe_validation(tmp_path):
    with pytest.raises(ValidationError) as error:
        Settings(
            _env_file=None,
            environment="production",
            app_base_url="http://example.test",
            database_url="file:./test.db",
            secret_key="short",
            token_encryption_key="",
            runtime_key_file=tmp_path / "keys" / "server.key",
        )
    message = str(error.value)
    assert "HTTPS" in message
    assert "short" not in message

    with pytest.raises(ValidationError) as secret_error:
        Settings(
            _env_file=None,
            environment="production",
            app_base_url="https://example.test",
            database_url="file:./test.db",
            secret_key="super-private-secret",
            token_encryption_key="",
            runtime_key_file=tmp_path / "keys" / "server.key",
        )
    assert "super-private-secret" not in str(secret_error.value)


def test_runtime_keys_are_generated_and_persisted(tmp_path):
    key_file = tmp_path / "keys" / "server.key"
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=f"file:{(tmp_path / 'keys.db').as_posix()}",
        secret_key="",
        token_encryption_key="",
        runtime_key_file=key_file,
    )
    assert len(settings.secret_key) >= 32
    assert len(settings.token_encryption_key) == 44
    assert key_file.is_file()
    stored = key_file.read_text(encoding="utf-8")
    assert f"SECRET_KEY={settings.secret_key}" in stored
    assert f"TOKEN_ENCRYPTION_KEY={settings.token_encryption_key}" in stored

    restarted = Settings(
        _env_file=None,
        environment="test",
        database_url=f"file:{(tmp_path / 'keys.db').as_posix()}",
        secret_key="",
        token_encryption_key="",
        runtime_key_file=key_file,
    )
    assert restarted.secret_key == settings.secret_key
    assert restarted.token_encryption_key == settings.token_encryption_key


def test_invalid_configured_encryption_key_is_replaced(tmp_path):
    key_file = tmp_path / "keys" / "server.key"
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=f"file:{(tmp_path / 'keys.db').as_posix()}",
        secret_key="a-configured-secret-that-is-long",
        token_encryption_key="replace-with-base64-encoded-32-byte-key",
        runtime_key_file=key_file,
    )
    assert settings.secret_key == "a-configured-secret-that-is-long"
    assert len(settings.token_encryption_key) == 44
    assert key_file.is_file()


def test_migrations_apply_and_latest_migration_rolls_back(tmp_path):
    database = Database(f"file:{(tmp_path / 'migration.db').as_posix()}")
    assert database.migrate() == 3
    with database.connect() as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='Job'").fetchone()

    assert database.rollback_last() == 2
    with database.connect() as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='MailboxMessage'").fetchone() is None
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='Job'").fetchone()
    assert database.rollback_last() == 1
    with database.connect() as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='Job'").fetchone() is None
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='User'").fetchone()
    assert database.rollback_last() == 0
    with database.connect() as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='User'").fetchone() is None
    assert database.migrate() == 3


def test_token_protector_never_persists_plaintext(tmp_path):
    database = Database(f"file:{(tmp_path / 'credentials.db').as_posix()}")
    database.migrate()
    protector = TokenProtector(Fernet.generate_key().decode("ascii"), "unused")
    protected = protector.protect({"token": "fixture-access-token"})
    assert "fixture-access-token" not in protected
    assert protector.unprotect(protected) == {"token": "fixture-access-token"}


def test_interrupted_jobs_are_recovered_after_restart(tmp_path):
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=f"file:{(tmp_path / 'jobs.db').as_posix()}",
        secret_key="test-session-secret-that-is-long-enough",
        token_encryption_key=Fernet.generate_key().decode("ascii"),
        job_lease_seconds=5,
        job_max_attempts=3,
    )
    database = Database(settings.database_url)
    database.migrate()
    jobs = JobRepository(database, settings)
    job_id = jobs.enqueue("mailbox.sync", {"connectionId": "fixture-connection"})
    assert jobs.claim_next().id == job_id

    expired = (utc_now() - timedelta(seconds=1)).isoformat()
    with database.connect() as connection:
        connection.execute('UPDATE "Job" SET "leaseUntil"=? WHERE "id"=?', (expired, job_id))

    restarted_jobs = JobRepository(database, settings)
    assert restarted_jobs.recover_interrupted() == 1
    recovered = restarted_jobs.claim_next()
    assert recovered.id == job_id
    assert recovered.attempts == 2


def test_mailbox_sync_pages_resume_and_upsert_without_duplicates(tmp_path, monkeypatch):
    from backend.app.services import mailbox as mailbox_service

    settings = Settings(
        _env_file=None, environment="test", database_url=f"file:{(tmp_path / 'mailbox.db').as_posix()}",
        secret_key="test-session-secret-that-is-long-enough", token_encryption_key=Fernet.generate_key().decode("ascii"),
    )
    database = Database(settings.database_url)
    database.migrate()
    repository = MailboxRepository(database, TokenProtector(settings.token_encryption_key, settings.secret_key))
    jobs = JobRepository(database, settings)
    timestamp = utc_now().isoformat()
    with database.connect() as connection:
        connection.execute('INSERT INTO "User" ("id", "email", "displayName", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)', ("user-1", "fixture@example.com", "Fixture", timestamp, timestamp))
        connection.execute('INSERT INTO "MailboxConnection" ("id", "userId", "provider", "providerAccountId", "email", "scopes", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ("google:user-1", "user-1", "google", "user-1", "fixture@example.com", "[]", "CONNECTED", timestamp, timestamp))

    message = {
        "id": "gmail-1", "threadId": "thread-1", "historyId": "10", "sender": "sender@example.com",
        "recipients": ["user@example.com"], "subject": "First", "receivedAt": timestamp, "preview": "Preview",
        "unread": True, "starred": False, "category": "Primary", "attachments": [], "bodyText": "Body", "bodyHtmlSafe": "",
    }

    class FakeAuth:
        def get_account_tokens(self, user_id, connection_id):
            assert (user_id, connection_id) == ("user-1", "google:user-1")
            return {"provider": "google"}, {"token": "fixture"}

    class FakeAdapter:
        def __init__(self, _tokens):
            pass

        def list_messages(self, _limit, cursor):
            return {"items": [{**message, "subject": "First" if cursor is None else "Updated"}], "nextCursor": "next" if cursor is None else None}

        def list_history(self, history_id, cursor):
            assert (history_id, cursor) == ("10", None)
            return {"items": [], "deletedIds": [], "nextCursor": None, "historyId": "11"}

    monkeypatch.setattr(mailbox_service, "GmailAdapter", FakeAdapter)
    service = MailboxSyncService(repository, FakeAuth(), jobs)
    service.enqueue("user-1", "google:user-1")
    assert service.process_next() is True
    assert repository.sync_state("google:user-1")["pageCursor"] == "next"
    assert service.process_next() is True
    assert service.process_next() is True
    page = repository.list_messages("google:user-1", 20)
    assert len(page["items"]) == 1
    assert page["items"][0]["subject"] == "Updated"
    assert repository.sync_state("google:user-1")["status"] == "idle"
    assert repository.sync_state("google:user-1")["historyId"] == "11"

    repository.upsert_messages("google:user-1", [
        {**message, "id": "primary", "category": "Primary"},
        {**message, "id": "updates", "category": "Updates"},
        {**message, "id": "uncategorized", "category": None},
        {**message, "id": "social", "category": "Social"},
        {**message, "id": "promotions", "category": "Promotions"},
    ])
    primary = repository.list_messages("google:user-1", 20, category="Primary")
    assert {item["id"] for item in primary["items"]} == {"gmail-1", "primary", "updates", "uncategorized"}

    class ExpiredAdapter(FakeAdapter):
        def list_history(self, _history_id, _cursor):
            raise mailbox_service.HistoryExpired()

    monkeypatch.setattr(mailbox_service, "GmailAdapter", ExpiredAdapter)
    service.enqueue("user-1", "google:user-1")
    assert service.process_next() is True
    assert repository.list_messages("google:user-1", 20)["items"] == []
    expired_state = repository.sync_state("google:user-1")
    assert expired_state["status"] == "syncing"
    assert expired_state["phase"] == "full"
    assert expired_state["historyId"] is None


def test_exhausted_interrupted_job_becomes_explicitly_failed(tmp_path):
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=f"file:{(tmp_path / 'failed-job.db').as_posix()}",
        secret_key="test-session-secret-that-is-long-enough",
        token_encryption_key=Fernet.generate_key().decode("ascii"),
        job_lease_seconds=5,
        job_max_attempts=1,
    )
    database = Database(settings.database_url)
    database.migrate()
    jobs = JobRepository(database, settings)
    job_id = jobs.enqueue("mailbox.sync", {"connectionId": "fixture-connection"})
    jobs.claim_next()
    with database.connect() as connection:
        connection.execute(
            'UPDATE "Job" SET "leaseUntil"=? WHERE "id"=?',
            ((utc_now() - timedelta(seconds=1)).isoformat(), job_id),
        )
    assert jobs.recover_interrupted() == 1
    assert jobs.claim_next() is None
    with database.connect() as connection:
        row = connection.execute('SELECT "status", "lastErrorCode" FROM "Job" WHERE "id"=?', (job_id,)).fetchone()
    assert dict(row) == {"status": "FAILED", "lastErrorCode": "WORKER_INTERRUPTED"}


def test_standard_errors_include_correlation_id_and_hide_internal_details(tmp_path):
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=f"file:{(tmp_path / 'errors.db').as_posix()}",
        secret_key="test-session-secret-that-is-long-enough",
        token_encryption_key=Fernet.generate_key().decode("ascii"),
    )
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/v1/accounts")
    payload = response.json()["error"]
    assert response.status_code == 401
    assert payload["code"] == "NOT_AUTHENTICATED"
    assert payload["correlationId"] == response.headers["x-correlation-id"]
    assert payload["retryable"] is False
