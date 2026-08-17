from datetime import timedelta

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app.config import Settings
from backend.app.jobs import JobRepository
from backend.app.main import create_app
from backend.app.persistence import Database, TokenProtector, utc_now


def test_production_configuration_fails_fast_with_safe_validation():
    with pytest.raises(ValidationError) as error:
        Settings(
            _env_file=None,
            environment="production",
            app_base_url="http://example.test",
            database_url="file:./test.db",
            secret_key="short",
            token_encryption_key="",
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
        )
    assert "super-private-secret" not in str(secret_error.value)


def test_migrations_apply_and_latest_migration_rolls_back(tmp_path):
    database = Database(f"file:{(tmp_path / 'migration.db').as_posix()}")
    assert database.migrate() == 2
    with database.connect() as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='Job'").fetchone()

    assert database.rollback_last() == 1
    with database.connect() as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='Job'").fetchone() is None
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='User'").fetchone()
    assert database.rollback_last() == 0
    with database.connect() as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='User'").fetchone() is None
    assert database.migrate() == 2


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
