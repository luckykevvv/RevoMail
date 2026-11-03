"""Targeted Google revocation tests use provider fakes and no real credentials."""

from types import SimpleNamespace

import httpx
import pytest

from backend.app.routers import accounts
from backend.app.services import google_revocation
from backend.python_tests.test_api import client, connect_gmail, sign_in  # noqa: F401


def csrf(client):
    return {"X-CSRF-Token": client.get("/api/v1/auth/session").json()["csrfToken"]}


def connected_account(client):
    sign_in(client)
    connect_gmail(client, calendar=False)
    return client.get("/api/v1/accounts").json()["accounts"][0]


class FakeRevocationClient:
    outcome = 200
    seen = {}

    def __init__(self, *, timeout):
        type(self).seen = {"timeout": timeout}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, url, *, data, headers):
        type(self).seen.update(url=url, data=data, headers=headers)
        if isinstance(type(self).outcome, Exception):
            raise type(self).outcome
        return SimpleNamespace(status_code=type(self).outcome)


def test_confirmed_google_revocation_uses_refresh_token_and_preserves_session_and_manual_analysis(client, monkeypatch, caplog):
    account = connected_account(client)
    client.app.state.mailbox_repository.upsert_messages(
        account["id"],
        [{"id": "cached-fixture", "subject": "Cached fixture", "receivedAt": "2026-11-01T00:00:00+00:00"}],
    )
    FakeRevocationClient.outcome = 200
    monkeypatch.setattr(google_revocation.httpx, "AsyncClient", FakeRevocationClient)
    session_before = client.get("/api/v1/auth/session").json()

    response = client.post(f'/api/v1/accounts/{account["id"]}/revoke', headers=csrf(client))

    assert response.status_code == 204
    assert FakeRevocationClient.seen["url"] == google_revocation.GOOGLE_REVOCATION_URL
    assert FakeRevocationClient.seen["data"] == {"token": "refresh-token"}
    assert FakeRevocationClient.seen["headers"] == {"Content-Type": "application/x-www-form-urlencoded"}
    assert FakeRevocationClient.seen["timeout"].connect == 5.0
    assert FakeRevocationClient.seen["timeout"].read == 10.0
    assert client.get("/api/v1/accounts").json() == {"accounts": []}
    with client.app.state.database.connect() as database:
        assert database.execute('SELECT COUNT(*) FROM "OAuthCredential"').fetchone()[0] == 0
        assert database.execute('SELECT COUNT(*) FROM "MailboxMessage"').fetchone()[0] == 0
    session_after = client.get("/api/v1/auth/session").json()
    assert session_after["authenticated"] is True
    assert session_after["user"] == session_before["user"]
    manual = client.post(
        "/api/v1/ai/manual/import?format=txt",
        content=b"Manual analysis remains available.",
        headers={**csrf(client), "Content-Type": "text/plain"},
    )
    assert manual.status_code == 200
    assert "refresh-token" not in caplog.text + response.text


@pytest.mark.parametrize(
    "outcome,expected_code",
    [
        (400, "GOOGLE_REVOCATION_FAILED"),
        (httpx.ReadTimeout("private provider timeout"), "GOOGLE_REVOCATION_UNCERTAIN"),
        (httpx.ConnectError("private provider connection"), "GOOGLE_REVOCATION_UNCERTAIN"),
    ],
)
def test_uncertain_or_failed_revocation_keeps_local_connection(client, monkeypatch, caplog, outcome, expected_code):
    account = connected_account(client)
    client.app.state.mailbox_repository.upsert_messages(
        account["id"],
        [{"id": "retained-fixture", "subject": "Retained", "receivedAt": "2026-11-01T00:00:00+00:00"}],
    )
    FakeRevocationClient.outcome = outcome
    monkeypatch.setattr(google_revocation.httpx, "AsyncClient", FakeRevocationClient)

    response = client.post(f'/api/v1/accounts/{account["id"]}/revoke', headers=csrf(client))

    assert response.status_code in {502, 504}
    assert response.json()["error"]["code"] == expected_code
    assert response.json()["error"]["retryable"] is True
    assert client.get("/api/v1/accounts").json()["accounts"][0]["id"] == account["id"]
    assert client.app.state.mailbox_repository.list_messages(account["id"], 20)["items"][0]["id"] == "retained-fixture"
    assert "private provider" not in response.text + caplog.text


def test_revocation_rejects_missing_credentials_wrong_owner_and_invalid_csrf(client, monkeypatch):
    assert client.post("/api/v1/accounts/google%3Amissing/revoke").status_code == 401
    account = connected_account(client)

    async def provider_must_not_run(_token):
        pytest.fail("revocation provider must not run without ownership and credentials")

    monkeypatch.setattr(accounts, "revoke_google_token", provider_must_not_run)
    assert client.post(f'/api/v1/accounts/{account["id"]}/revoke').status_code == 403

    other_profile = {"id": "user-2", "email": "other@example.com", "displayName": "Other User"}
    _user_id, other_id = client.app.state.auth_repository.save_authorized_account(
        other_profile,
        "google",
        ["https://www.googleapis.com/auth/gmail.modify"],
        {"token": "other-access", "refresh_token": "other-refresh"},
    )
    wrong_owner = client.post(f"/api/v1/accounts/{other_id}/revoke", headers=csrf(client))
    assert wrong_owner.status_code == 404
    assert wrong_owner.json()["error"]["code"] == "GOOGLE_REVOCATION_UNAVAILABLE"

    with client.app.state.database.connect() as database:
        database.execute('DELETE FROM "OAuthCredential" WHERE "connectionId"=?', (account["id"],))
    missing = client.post(f'/api/v1/accounts/{account["id"]}/revoke', headers=csrf(client))
    assert missing.status_code == 404
    assert "Google Account settings" in missing.json()["error"]["message"]


def test_local_disconnect_never_calls_revocation_and_keeps_manual_analysis_available(client, monkeypatch):
    account = connected_account(client)

    async def provider_must_not_run(_token):
        pytest.fail("local disconnect must not revoke Google access")

    monkeypatch.setattr(accounts, "revoke_google_token", provider_must_not_run)
    assert client.delete(f'/api/v1/accounts/{account["id"]}', headers=csrf(client)).status_code == 204
    assert client.get("/api/v1/auth/session").json()["authenticated"] is True
    response = client.post(
        "/api/v1/ai/manual/import?format=txt",
        content=b"Still available after local disconnect.",
        headers={**csrf(client), "Content-Type": "text/plain"},
    )
    assert response.status_code == 200
