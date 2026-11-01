import hashlib
import base64
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from backend.app.routers import auth
from backend.python_tests.test_api import FakeFlow, FakeOAuthService, client, connect_gmail, sign_in  # noqa: F401


def csrf(client):
    return {"X-CSRF-Token": client.get("/api/v1/auth/session").json()["csrfToken"]}


def callback(client, **kwargs):
    return client.get("/api/v1/auth/google/callback", params={"state": "test-state", "code": "valid-code", **kwargs}, follow_redirects=False)


def test_signin_only_creates_identity_and_hashed_session(client):
    sign_in(client)
    assert client.get("/api/v1/auth/session").json()["authenticated"]
    assert client.get("/api/v1/accounts").json() == {"accounts": []}
    with client.app.state.database.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM "OAuthCredential"').fetchone()[0] == 0


def test_connect_and_calendar_separate_preserve_session_and_disconnect(client):
    sign_in(client)
    session = client.get("/api/v1/auth/session").json()
    assert connect_gmail(client, calendar=False).status_code == 307
    account = client.get("/api/v1/accounts").json()["accounts"][0]
    assert auth.CALENDAR_SCOPE not in account["scopes"] and account["calendarRequiresReauthorization"]
    assert client.get("/api/v1/auth/session").json() == session
    assert client.post(f'/api/v1/accounts/{account["id"]}/authorize-calendar', headers=csrf(client)).status_code == 200
    callback(client)
    assert not client.get("/api/v1/accounts").json()["accounts"][0]["calendarRequiresReauthorization"]
    assert client.delete(f'/api/v1/accounts/{account["id"]}', headers=csrf(client)).status_code == 204
    assert client.get("/api/v1/auth/session").json() == session


def test_connect_requires_csrf_and_calendar_requires_owned_account(client):
    assert client.post("/api/v1/accounts/google/connect").status_code == 401
    sign_in(client)
    assert client.post("/api/v1/accounts/google/connect").status_code == 403
    assert client.post("/api/v1/accounts/other/authorize-calendar", headers=csrf(client)).status_code == 404
    assert client.post("/api/v1/accounts/other/reauthorize", headers=csrf(client)).status_code == 404


def test_transaction_contains_encrypted_pkce_and_purpose(client):
    sign_in(client)
    client.post("/api/v1/accounts/google/connect", headers=csrf(client))
    with client.app.state.database.connect() as db:
        row = db.execute('SELECT * FROM "OAuthTransaction"').fetchone()
    assert row["stateHash"] == hashlib.sha256(b"test-state").hexdigest()
    context = client.app.state.auth_repository.protector.unprotect(row["verifierEncrypted"])
    assert context["purpose"] == "gmail" and len(context["code_verifier"]) >= 43 and context["session_hash"]
    assert context["code_verifier"] not in row["verifierEncrypted"]


def test_wrong_or_missing_session_cannot_complete_connection(client):
    sign_in(client)
    client.post("/api/v1/accounts/google/connect", headers=csrf(client))
    client.cookies.clear()
    assert "INVALID_OAUTH_STATE" in callback(client).headers["location"]
    assert client.app.state.auth_repository.list_accounts("user-1") == []


def test_replaced_session_and_wrong_google_account_rejected(client, monkeypatch):
    sign_in(client)
    client.post("/api/v1/accounts/google/connect", headers=csrf(client))
    original = client.cookies.get("revomail_session")
    token = client.app.state.auth_repository.create_session("user-1", "other-csrf")
    context = client.app.state.oauth_transactions.consume("test-state").context
    context["session_hash"] = hashlib.sha256(token.encode()).hexdigest()
    client.app.state.oauth_transactions.put("test-state", "/", context)
    assert "INVALID_OAUTH_STATE" in callback(client).headers["location"]
    assert client.cookies.get("revomail_session") == original
    client.post("/api/v1/accounts/google/connect", headers=csrf(client))
    class OtherUser(FakeOAuthService):
        def execute(self, **kwargs):
            return {"id": "other-user", "email": "other@example.com", "name": "Other"}
        def get(self):
            return self
    monkeypatch.setattr(auth, "build", lambda *args, **kwargs: OtherUser())
    assert "ACCOUNT_MISMATCH" in callback(client).headers["location"]
    assert client.get("/api/v1/accounts").json() == {"accounts": []}


def test_denial_partial_grants_and_signin_do_not_replace_credentials(client, monkeypatch):
    sign_in(client)
    connect_gmail(client)
    before = client.app.state.auth_repository.get_tokens("user-1")
    sign_in(client)
    assert client.app.state.auth_repository.get_tokens("user-1") == before
    client.post("/api/v1/accounts/google/connect", headers=csrf(client))
    assert "AUTHORIZATION_DENIED" in callback(client, error="access_denied").headers["location"]
    class PartialFlow(FakeFlow):
        def __init__(self, *args):
            super().__init__(*args)
            self.credentials.granted_scopes = [*auth.IDENTITY_SCOPES, auth.GMAIL_SCOPES[0]]
    monkeypatch.setattr(auth, "_build_flow", PartialFlow)
    client.post("/api/v1/accounts/google/connect", headers=csrf(client))
    assert "INSUFFICIENT_PERMISSIONS" in callback(client).headers["location"]
    assert client.app.state.auth_repository.get_tokens("user-1") == before


def test_refresh_token_preserved_for_incremental_grant(client, monkeypatch):
    sign_in(client)
    connect_gmail(client, calendar=False)
    account = client.get("/api/v1/accounts").json()["accounts"][0]
    class NoRefreshFlow(FakeFlow):
        def __init__(self, *args):
            super().__init__(*args)
            self.credentials.refresh_token = None
    monkeypatch.setattr(auth, "_build_flow", NoRefreshFlow)
    client.post(f'/api/v1/accounts/{account["id"]}/authorize-calendar', headers=csrf(client))
    callback(client)
    tokens = client.app.state.auth_repository.get_tokens("user-1")
    assert tokens["refresh_token"] == "refresh-token" and auth.CALENDAR_SCOPE in tokens["scopes"]


def test_legacy_pending_transaction_fails_safely(client):
    client.app.state.oauth_transactions.put("test-state", "/")
    assert "INVALID_OAUTH_STATE" in callback(client).headers["location"]


def test_scope_aliases_and_return_path_validation():
    assert auth.normalise_scopes("openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile") == {"openid", "email", "profile"}
    for path in ("//external.example", "/\\external.example", "/\nexternal", "https://external.example"):
        assert auth._safe_return_to(path) == "/"


def test_requested_scopes_are_not_treated_as_grants(client, monkeypatch):
    sign_in(client)
    class UnknownGrantFlow(FakeFlow):
        def __init__(self, *args):
            super().__init__(*args)
            self.credentials.granted_scopes = None
    monkeypatch.setattr(auth, "_build_flow", UnknownGrantFlow)
    client.post("/api/v1/accounts/google/connect", headers=csrf(client))
    assert "INSUFFICIENT_PERMISSIONS" in callback(client).headers["location"]
    assert client.get("/api/v1/accounts").json()["accounts"] == []


def test_gmail_reconnect_can_recover_without_an_old_calendar_grant(client, monkeypatch):
    sign_in(client)
    connect_gmail(client, calendar=True)
    account = client.get("/api/v1/accounts").json()["accounts"][0]
    assert not account["calendarRequiresReauthorization"]
    mailbox = client.app.state.mailbox_repository
    mailbox.upsert_messages(account["id"], [{"id": "cached-fixture", "subject": "Cached fixture", "receivedAt": "2026-11-01T00:00:00+00:00"}])
    mailbox.set_sync_state(account["id"], status="failed", phase="history", history_id="10", error_code="AUTHORIZATION_EXPIRED")
    before_session = client.get("/api/v1/auth/session").json()
    class ReconnectedFlow(FakeFlow):
        def __init__(self, *args):
            super().__init__(*args)
            self.credentials.token = "new-gmail-access"
            self.credentials.refresh_token = "new-gmail-refresh"
            # Google grants all requested Gmail scopes, but an old Calendar grant
            # was revoked or not returned. Calendar must not block mailbox recovery.
            self.credentials.granted_scopes = [*auth.IDENTITY_SCOPES, *auth.GMAIL_SCOPES]
    monkeypatch.setattr(auth, "_build_flow", ReconnectedFlow)
    result = client.post(f'/api/v1/accounts/{account["id"]}/reauthorize', headers=csrf(client))
    assert result.status_code == 200
    result = callback(client)
    assert "authError" not in result.headers["location"]
    assert "connected=gmail" in result.headers["location"]
    stored = client.app.state.auth_repository.get_tokens("user-1")
    assert stored["token"] == "new-gmail-access"
    assert stored["refresh_token"] == "new-gmail-refresh"
    assert client.get("/api/v1/accounts").json()["accounts"][0]["calendarRequiresReauthorization"]
    assert client.get("/api/v1/auth/session").json() == before_session
    assert mailbox.sync_state(account["id"])["status"] == "idle"
    assert mailbox.sync_state(account["id"])["errorCode"] is None
    assert mailbox.sync_state(account["id"])["historyId"] == "10"
    assert mailbox.list_messages(account["id"], 20)["items"][0]["id"] == "cached-fixture"


def test_real_flow_uses_identity_only_and_s256_pkce(monkeypatch):
    monkeypatch.setattr(auth, "_providers", lambda: {"google": True})
    monkeypatch.setattr(auth, "settings", SimpleNamespace(google_client_id="fixture-client", google_client_secret="fixture-secret", effective_google_redirect_uri="http://localhost/api/v1/auth/google/callback"))
    verifier = "a" * 64
    flow = auth._build_flow(auth.IDENTITY_SCOPES, verifier)
    url, state = flow.authorization_url(access_type="online")
    query = parse_qs(urlsplit(url).query)
    assert set(query["scope"][0].split()) == {"openid", "email", "profile"}
    assert query["code_challenge_method"] == ["S256"]
    assert query["code_challenge"] == [base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()]
    assert state and flow.code_verifier == verifier
