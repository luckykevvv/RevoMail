from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.routers import auth


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
def client(monkeypatch):
    monkeypatch.setattr(auth, "_providers", lambda: {"google": True, "microsoft": False})
    monkeypatch.setattr(auth, "_build_flow", FakeFlow)
    monkeypatch.setattr(auth, "build", lambda *_args, **_kwargs: FakeOAuthService())
    with TestClient(create_app()) as test_client:
        yield test_client


def authenticate(client):
    start = client.get("/api/v1/auth/google/start", follow_redirects=False)
    assert start.status_code == 307
    return client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=test-state",
        follow_redirects=False,
    )


def test_health_and_signed_out_session(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    session = client.get("/api/v1/auth/session").json()
    assert session["authenticated"] is False
    assert session["providers"] == {"google": True, "microsoft": False}


def test_google_callback_preserves_account_ui_contract(client):
    callback = authenticate(client)
    assert callback.status_code == 307

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
    assert client.delete("/api/v1/accounts/google").status_code == 204
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


def test_invalid_state_returns_retryable_frontend_status(client):
    client.get("/api/v1/auth/google/start", follow_redirects=False)
    response = client.get(
        "/api/v1/auth/google/callback?code=valid-code&state=wrong",
        follow_redirects=False,
    )
    assert response.headers["location"] == "/?authError=INVALID_OAUTH_STATE"
