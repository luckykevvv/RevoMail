from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.routers import auth
from backend.app.services.oauth_transactions import OAuthTransactionStore, oauth_transactions


class FakeFlow:
    authorization_options = None

    def __init__(self):
        self.credentials = SimpleNamespace(
            token="access-token",
            refresh_token="refresh-token",
            token_uri="https://oauth.example/token",
            client_id="client-id",
            client_secret="client-secret",
            scopes=list(auth.SCOPES),
        )

    def authorization_url(self, **kwargs):
        type(self).authorization_options = kwargs
        return "https://accounts.example/authorize?state=test-state", "test-state"

    def fetch_token(self, code):
        assert code == "valid-code"


class FakeUserInfoRequest:
    def execute(self):
        return {
            "id": "user-1",
            "email": "tester@example.com",
            "name": "Test User",
            "picture": "https://example.com/avatar.png",
        }


class FakeOAuthService:
    def userinfo(self):
        return self

    def get(self):
        return FakeUserInfoRequest()


@pytest.fixture()
def client(monkeypatch, tmp_path):
    oauth_transactions.clear()
    monkeypatch.setattr(auth, "_providers", lambda: {"google": True})
    monkeypatch.setattr(auth, "_build_flow", FakeFlow)
    monkeypatch.setattr(auth, "build", lambda *_args, **_kwargs: FakeOAuthService())
    test_settings = Settings(
        _env_file=None,
        environment="test",
        database_url=f"file:{(tmp_path / 'api.db').as_posix()}",
        secret_key="test-session-secret-that-is-long-enough",
        token_encryption_key=Fernet.generate_key().decode("ascii"),
    )
    with TestClient(create_app(test_settings)) as test_client:
        yield test_client


def authenticate(client):
    start = client.get("/api/v1/auth/google/start", follow_redirects=False)
    assert start.status_code == 307
    return client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )


def test_health_and_signed_out_session(client):
    health = client.get("/api/v1/health")
    assert health.json()["status"] == "ok"
    assert health.json()["checks"] == {"database": "ok"}
    assert health.headers["x-correlation-id"]
    session = client.get("/api/v1/auth/session").json()
    assert session["authenticated"] is False
    assert session["providers"] == {"google": True}


def test_google_authorization_does_not_merge_legacy_grants(client):
    FakeFlow.authorization_options = None
    response = client.get("/api/v1/auth/google/start", follow_redirects=False)
    assert response.status_code == 307
    assert FakeFlow.authorization_options == {"access_type": "offline", "prompt": "consent"}


def test_google_callback_preserves_account_ui_contract(client):
    callback = authenticate(client)
    assert callback.status_code == 307
    assert "access-token" not in client.cookies.get("revomail_session", "")
    assert b"access-token" not in client.app.state.database.path.read_bytes()

    session = client.get("/api/v1/auth/session").json()
    assert session["authenticated"] is True
    assert session["user"]["displayName"] == "Test User"
    assert session["csrfToken"]

    accounts = client.get("/api/v1/accounts").json()["accounts"]
    assert accounts[0]["provider"] == "google"
    assert accounts[0]["email"] == "tester@example.com"
    assert "https://www.googleapis.com/auth/gmail.modify" in accounts[0]["scopes"]


def test_disconnect_and_logout(client):
    authenticate(client)
    csrf = client.get("/api/v1/auth/session").json()["csrfToken"]
    headers = {"X-CSRF-Token": csrf}
    account_id = client.get("/api/v1/accounts").json()["accounts"][0]["id"]
    assert client.delete(f"/api/v1/accounts/{account_id}", headers=headers).status_code == 204
    assert client.get("/api/v1/accounts").json() == {"accounts": []}
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/auth/session").json()["authenticated"] is False


def test_gmail_and_ai_routes_use_authenticated_provider(client, monkeypatch):
    from backend.app.routers import ai, emails

    authenticate(client)
    account_id = client.get("/api/v1/accounts").json()["accounts"][0]["id"]
    client.app.state.mailbox_repository.upsert_messages(account_id, [{
        "id": "gmail-1", "threadId": "thread-1", "historyId": "10", "sender": "sender@example.com",
        "recipients": ["tester@example.com"], "subject": "Project update", "receivedAt": "2026-08-20T00:00:00+00:00",
        "preview": "The meeting is tomorrow.", "unread": True, "starred": False, "category": "Primary",
        "attachments": [], "bodyText": "The meeting is tomorrow at ten.", "bodyHtmlSafe": "",
    }])
    monkeypatch.setattr(
        ai.gmail_service,
        "get_message",
        lambda _tokens, _message_id: {
            "subject": "Project update",
            "sender": "sender@example.com",
            "body_plain": "The meeting is tomorrow at ten.",
        },
    )
    monkeypatch.setattr(ai.ai_service, "summarise", lambda *_args: {"summary": "Meeting tomorrow.", "bullets": ["Meet at ten"]})

    inbox = client.get("/api/v1/emails")
    assert inbox.status_code == 200
    assert inbox.json()["messages"][0]["id"] == "gmail-1"

    summary = client.post("/api/v1/ai/summarise", json={"message_id": "gmail-1"})
    assert summary.status_code == 200
    assert summary.json()["summary"] == "Meeting tomorrow."


def test_provider_error_uses_safe_stable_contract(client, monkeypatch):
    from backend.app.routers import emails

    authenticate(client)
    class FailingAdapter:
        def __init__(self, _tokens):
            pass

        def list_messages(self, *_args):
            from backend.app.services.gmail import MailProviderError
            raise MailProviderError("fixture-access-token private detail")

    monkeypatch.setattr(emails, "GmailAdapter", FailingAdapter)
    response = client.get("/api/v1/emails?query=fixture", headers={"X-Correlation-ID": "fixture-correlation"})
    assert response.status_code == 502
    assert response.headers["x-correlation-id"] == "fixture-correlation"
    assert response.json() == {
        "error": {
            "code": "PROVIDER_FAILED",
            "message": "Gmail could not complete the request.",
            "retryable": True,
            "correlationId": "fixture-correlation",
        }
    }
    assert "private detail" not in response.text


def test_invalid_state_returns_retryable_frontend_status(client):
    client.get("/api/v1/auth/google/start", follow_redirects=False)
    response = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=wrong",
        follow_redirects=False,
    )
    assert response.headers["location"] == "/?authError=INVALID_OAUTH_STATE"


def test_scope_mismatch_returns_actionable_frontend_status(client, monkeypatch):
    from backend.app.routers import auth as auth_module

    class ScopeMismatchFlow(FakeFlow):
        def fetch_token(self, code):
            raise Warning("Scope changed")

    monkeypatch.setattr(auth_module, "_build_flow", ScopeMismatchFlow)
    client.get("/api/v1/auth/google/start", follow_redirects=False)
    response = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )
    assert response.headers["location"] == "/?authError=AUTHORIZATION_SCOPE_MISMATCH"


def test_google_callback_survives_loopback_cookie_host_change(client):
    client.get("/api/v1/auth/google/start", follow_redirects=False)
    client.cookies.clear()
    response = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert client.get("/api/v1/auth/session").json()["authenticated"] is True


def test_server_side_oauth_state_expires_and_cannot_be_replayed():
    now = [100.0]
    store = OAuthTransactionStore(ttl_seconds=10, clock=lambda: now[0])
    store.put("state", "/inbox")
    assert store.consume("state").return_to == "/inbox"
    assert store.consume("state") is None

    store.put("expired", "/")
    now[0] = 111.0
    assert store.consume("expired") is None


def test_callback_rejects_expired_and_replayed_server_state(client, monkeypatch):
    now = [100.0]
    store = OAuthTransactionStore(ttl_seconds=10, clock=lambda: now[0])
    client.app.state.oauth_transactions = store

    client.get("/api/v1/auth/google/start", follow_redirects=False)
    now[0] = 111.0
    expired = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )
    assert expired.headers["location"] == "/?authError=INVALID_OAUTH_STATE"

    now[0] = 112.0
    client.get("/api/v1/auth/google/start", follow_redirects=False)
    accepted = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )
    assert accepted.status_code == 307
    replayed = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )
    assert replayed.headers["location"] == "/?authError=INVALID_OAUTH_STATE"


def test_oauth_start_rejects_scheme_relative_return_path(client):
    client.get("/api/v1/auth/google/start?returnTo=//example.test", follow_redirects=False)
    client.cookies.clear()
    response = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )
    assert response.headers["location"] == "/"


def test_lost_encryption_key_returns_401_not_500(tmp_path, monkeypatch):
    from backend.app.routers import auth as auth_module

    oauth_transactions.clear()
    monkeypatch.setattr(auth_module, "_providers", lambda: {"google": True})
    monkeypatch.setattr(auth_module, "_build_flow", FakeFlow)
    monkeypatch.setattr(auth_module, "build", lambda *_args, **_kwargs: FakeOAuthService())
    database_url = f"file:{(tmp_path / 'lost-key.db').as_posix()}"
    shared_secret = "test-session-secret-that-is-long-enough"

    first_key = Fernet.generate_key().decode("ascii")
    first_settings = Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        secret_key=shared_secret,
        token_encryption_key=first_key,
    )
    with TestClient(create_app(first_settings)) as first_client:
        first_client.get("/api/v1/auth/google/start", follow_redirects=False)
        callback = first_client.get(
            "/api/v1/auth/google/callback?code=valid-code&state=test-state",
            follow_redirects=False,
        )
        assert callback.status_code == 307
        session_cookie = first_client.cookies.get("revomail_session")
        assert session_cookie

    lost_key_settings = Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        secret_key=shared_secret,
        token_encryption_key=Fernet.generate_key().decode("ascii"),
    )
    with TestClient(create_app(lost_key_settings)) as lost_client:
        lost_client.cookies.set("revomail_session", session_cookie)
        response = lost_client.get("/api/v1/emails")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_single_gmail_api_and_idempotent_confirmed_send(client, monkeypatch):
    from backend.app.routers import emails

    authenticate(client)
    session = client.get("/api/v1/auth/session").json()
    account_id = client.get("/api/v1/accounts").json()["accounts"][0]["id"]
    csrf_headers = {"X-CSRF-Token": session["csrfToken"]}
    message = {
        "id": "gmail-1", "threadId": "thread-1", "historyId": "10", "sender": "sender@example.com",
        "recipients": ["tester@example.com"], "subject": "Project update", "receivedAt": "2026-08-20T00:00:00+00:00",
        "preview": "A provider-backed fixture", "unread": True, "starred": False, "category": "Primary",
        "attachments": [], "bodyText": "Fixture body", "bodyHtmlSafe": "<p>Fixture body</p>",
    }
    client.app.state.mailbox_repository.upsert_messages(account_id, [message])
    database_files = client.app.state.database.path.parent.glob(f"{client.app.state.database.path.name}*")
    assert all(b"Fixture body" not in path.read_bytes() for path in database_files)

    class FakeAdapter:
        sent = 0

        def __init__(self, _tokens):
            pass

        def modify_message(self, message_id, unread, starred):
            assert message_id == "gmail-1"
            return {"id": message_id, "unread": unread, "starred": starred}

        def send_message(self, payload):
            FakeAdapter.sent += 1
            assert payload["bodyText"] == "Reviewed reply"
            return {"providerMessageId": "sent-1", "threadId": "thread-1"}

    monkeypatch.setattr(emails, "GmailAdapter", FakeAdapter)
    page = client.get("/api/v1/emails")
    assert page.status_code == 200
    assert page.json()["messages"][0]["id"] == "gmail-1"
    detail = client.get("/api/v1/emails/gmail-1").json()
    assert detail["bodyText"] == "Fixture body"

    missing_csrf = client.patch("/api/v1/emails/gmail-1", json={"starred": True})
    assert missing_csrf.status_code == 403
    changed = client.patch("/api/v1/emails/gmail-1", json={"starred": True}, headers=csrf_headers)
    assert changed.status_code == 200
    assert client.get("/api/v1/emails/gmail-1").json()["starred"] is True

    send_payload = {
        "to": ["sender@example.com"], "cc": [], "bcc": [], "subject": "Re: Project update",
        "bodyText": "Reviewed reply", "inReplyToMessageId": "gmail-1", "confirmed": True,
        "idempotencyKey": "fixture-idempotency-key-0001",
    }
    first = client.post("/api/v1/emails/send", json=send_payload, headers=csrf_headers)
    second = client.post("/api/v1/emails/send", json=send_payload, headers=csrf_headers)
    assert first.json()["status"] == "sent"
    assert second.json() == first.json()
    assert FakeAdapter.sent == 1

    conflict = {**send_payload, "bodyText": "Different reviewed reply"}
    assert client.post("/api/v1/emails/send", json=conflict, headers=csrf_headers).status_code == 409


def test_send_requires_explicit_confirmation(client):
    authenticate(client)
    session = client.get("/api/v1/auth/session").json()
    response = client.post("/api/v1/emails/send", headers={"X-CSRF-Token": session["csrfToken"]}, json={
        "to": ["sender@example.com"], "subject": "Review", "bodyText": "Not confirmed",
        "confirmed": False, "idempotencyKey": "fixture-idempotency-key-0002",
    })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_send_timeout_is_unknown_never_retried_and_is_rate_limited(client, monkeypatch):
    from backend.app.routers import emails
    from backend.app.services.gmail import ProviderTimeout

    authenticate(client)
    session = client.get("/api/v1/auth/session").json()
    headers = {"X-CSRF-Token": session["csrfToken"]}

    class TimeoutAdapter:
        calls = 0

        def send_message(self, _payload):
            TimeoutAdapter.calls += 1
            raise ProviderTimeout()

    monkeypatch.setattr(emails, "GmailAdapter", lambda _tokens: TimeoutAdapter())
    client.app.state.settings.mail_send_limit_per_minute = 1
    payload = {
        "to": ["sender@example.com"], "subject": "Reviewed", "bodyText": "Reviewed body", "confirmed": True,
        "idempotencyKey": "fixture-idempotency-timeout-0001",
    }
    first = client.post("/api/v1/emails/send", json=payload, headers=headers)
    second = client.post("/api/v1/emails/send", json=payload, headers=headers)
    assert first.json()["status"] == "unknown"
    assert second.json() == first.json()
    assert TimeoutAdapter.calls == 1
    database_files = client.app.state.database.path.parent.glob(f"{client.app.state.database.path.name}*")
    assert all(b"Reviewed body" not in path.read_bytes() for path in database_files)

    limited = client.post("/api/v1/emails/send", json={**payload, "idempotencyKey": "fixture-idempotency-timeout-0002"}, headers=headers)
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "SEND_RATE_LIMITED"
