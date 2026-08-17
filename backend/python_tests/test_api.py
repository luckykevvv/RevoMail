from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.routers import auth
from backend.app.services.oauth_transactions import OAuthTransactionStore, oauth_transactions


class FakeFlow:
    def __init__(self):
        self.credentials = SimpleNamespace(
            token="access-token",
            refresh_token="refresh-token",
            token_uri="https://oauth.example/token",
            client_id="client-id",
            client_secret="client-secret",
            scopes=list(auth.SCOPES),
        )

    def authorization_url(self, **_kwargs):
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
    monkeypatch.setattr(auth, "_providers", lambda: {"google": True, "microsoft": False})
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
    assert session["providers"] == {"google": True, "microsoft": False}


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
    assert "https://www.googleapis.com/auth/gmail.readonly" in accounts[0]["scopes"]


def test_disconnect_and_logout(client):
    authenticate(client)
    account_id = client.get("/api/v1/accounts").json()["accounts"][0]["id"]
    assert client.delete(f"/api/v1/accounts/{account_id}").status_code == 204
    assert client.get("/api/v1/accounts").json() == {"accounts": []}
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/session").json()["authenticated"] is False


def test_gmail_and_ai_routes_use_authenticated_provider(client, monkeypatch):
    from backend.app.routers import ai, emails

    authenticate(client)
    monkeypatch.setattr(
        emails.gmail_service,
        "list_messages",
        lambda _tokens, _max, _page: {
            "messages": [{"id": "gmail-1", "subject": "Project update"}],
            "next_page_token": None,
        },
    )
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
    monkeypatch.setattr(
        emails.gmail_service,
        "list_messages",
        lambda *_args: (_ for _ in ()).throw(RuntimeError("fixture-access-token private detail")),
    )
    response = client.get("/api/v1/emails", headers={"X-Correlation-ID": "fixture-correlation"})
    assert response.status_code == 502
    assert response.headers["x-correlation-id"] == "fixture-correlation"
    assert response.json() == {
        "error": {
            "code": "EMAIL_PROVIDER_FAILED",
            "message": "The mailbox provider could not complete the request.",
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
