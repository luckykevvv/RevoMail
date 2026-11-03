import pytest
from cryptography.fernet import Fernet

from backend.app.config import Settings
from backend.app.jobs import JobRepository
from backend.app.mailbox import MailboxRepository
from backend.app.persistence import Database, AuthRepository, TokenProtector
from backend.app.services import mailbox as mailbox_service
from backend.app.services.gmail import InvalidAuthorization, ProviderUnavailable


@pytest.fixture()
def sync_setup(tmp_path):
    settings = Settings(_env_file=None, environment="test", database_url=f"file:{(tmp_path / 'sync.db').as_posix()}", secret_key="safe-sync-fixture-secret-long-enough", token_encryption_key=Fernet.generate_key().decode())
    database = Database(settings.database_url)
    database.migrate()
    protector = TokenProtector(settings.token_encryption_key, settings.secret_key)
    auth = AuthRepository(database, protector)
    user_id, account_id = auth.save_authorized_account({"id": "fixture-user", "email": "fixture@example.com", "displayName": "Fixture"}, "google", [], {})
    repository = MailboxRepository(database, protector)
    repository.upsert_messages(account_id, [{"id": "fixture-message", "sender": "fixture@example.com", "subject": "Cached fixture", "receivedAt": "2026-11-01T00:00:00+00:00", "bodyText": "Sanitized fixture"}])
    repository.set_sync_state(account_id, status="idle", phase="history", history_id="10")
    jobs = JobRepository(database, settings)
    service = mailbox_service.MailboxSyncService(repository, auth, jobs)
    return service, repository, jobs, user_id, account_id


@pytest.mark.parametrize("failure,status,code", [(InvalidAuthorization(), "FAILED", "AUTHORIZATION_EXPIRED"), (ProviderUnavailable(), "PENDING", "PROVIDER_UNAVAILABLE")])
def test_sync_auth_failure_is_terminal_and_network_failure_retries(sync_setup, monkeypatch, failure, status, code):
    service, repository, jobs, user_id, account_id = sync_setup
    class FailedAdapter:
        def __init__(self, _tokens): pass
        def list_history(self, *_args): raise failure
    monkeypatch.setattr(mailbox_service, "GmailAdapter", FailedAdapter)
    job_id = service.enqueue(user_id, account_id)
    assert service.process_next()
    assert jobs.status(job_id)["status"] == status
    assert jobs.status(job_id)["lastErrorCode"] == code
    assert jobs.status(job_id)["attempts"] == 1
    assert repository.sync_state(account_id)["errorCode"] == code
    assert repository.list_messages(account_id, 20)["items"][0]["subject"] == "Cached fixture"
    assert not service.process_next()  # Expired grants are not retried; network retries have a delay.


def test_unexpected_adapter_start_failure_is_recorded_without_sensitive_details(sync_setup, monkeypatch, caplog):
    service, repository, jobs, user_id, account_id = sync_setup
    def failed_adapter(_tokens):
        raise ValueError("private credential and email details")
    monkeypatch.setattr(mailbox_service, "GmailAdapter", failed_adapter)
    job_id = service.enqueue(user_id, account_id)
    assert service.process_next()
    assert repository.sync_state(account_id)["errorCode"] == "SYNC_FAILED"
    assert jobs.status(job_id)["status"] == "FAILED"
    assert "error_type=ValueError" in caplog.text
    assert "private credential and email details" not in caplog.text
