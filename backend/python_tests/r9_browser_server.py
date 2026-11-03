"""Dedicated browser fixture server. Never imported by the production application."""
import json
import secrets
import time
from types import SimpleNamespace

import uvicorn

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.routers import accounts, auth, emails
from backend.app.services import ai, mailbox


def main():
    fixture_settings = Settings(
        _env_file=None, environment="test", host="127.0.0.1", port=4279,
        app_base_url="http://127.0.0.1:4279", database_url="file:./build/r9-browser.db",
        google_redirect_uri="http://127.0.0.1:4279/api/v1/auth/google/callback",
        secret_key="r9-fixture-session-key-not-for-production-0001",
        token_encryption_key="cjktZml4dHVyZS1lbmNyeXB0aW9uLWtleS0wMDAwMDE=",
        openai_api_key="r9-fake-provider-no-network", manual_ai_limit_per_minute=120,
    )

    class FixtureFlow:
        def __init__(self, scopes, code_verifier):
            self.code_verifier = code_verifier
            self.credentials = SimpleNamespace(token="fixture-access", refresh_token="fixture-refresh", token_uri="https://oauth.example/token", client_id="fixture-client", client_secret="fixture-secret", granted_scopes=scopes)

        def authorization_url(self, **kwargs):
            state = secrets.token_urlsafe(32)
            return f"{fixture_settings.app_base_url}/api/v1/auth/google/callback?code=fixture-code&state={state}", state

        def fetch_token(self, **kwargs):
            assert kwargs["code"] == "fixture-code"

    class UserInfo:
        def userinfo(self): return self
        def get(self): return self
        def execute(self, **kwargs):
            return {"id": "r9-browser-user", "email": "reader@example.com", "name": "Fixture Reader"}

    class EmptyMailbox:
        def __init__(self, tokens): pass
        def list_messages(self, *args, **kwargs):
            return {"items": [], "nextCursor": None}

    failed_once = False

    def chat(system, user, **kwargs):
        nonlocal failed_once
        if "R9_FAIL_ONCE" in user and not failed_once:
            failed_once = True
            raise TimeoutError("fixture-private-provider-detail")
        if "R9_SIMULATE_FAILURE" in user:
            raise TimeoutError("fixture-private-provider-detail")
        if "R9_DELAY" in user:
            time.sleep(0.6)
        if "triage assistant" in system:
            return json.dumps({"results": [{"id": "1", "priority": "high", "reason": "Review requested by Friday"}]})
        if "Extract structured" in system:
            return json.dumps({"tasks": [{"title": "Review proposal", "due_date": "2026-11-06"}], "events": [{"title": "Project meeting", "date": "2026-11-05", "time": "10:00", "location": "Room 2", "start": "2026-11-05T10:00"}]})
        if "Draft a reply" in system:
            return "Thank you. I will review the proposal.\n\nBest regards,\nFixture Reader"
        return json.dumps({"summary": "Review the proposal by Friday and attend the project meeting.", "bullets": ["Review the proposal", "Attend the meeting"]})

    auth._providers = lambda: {"google": True}
    auth._build_flow = FixtureFlow
    auth.build = lambda *args, **kwargs: UserInfo()
    ai._chat = chat
    emails.GmailAdapter = EmptyMailbox
    mailbox.GmailAdapter = EmptyMailbox
    async def revoke_google_token(token):
        assert token == "fixture-refresh"
    accounts.revoke_google_token = revoke_google_token
    uvicorn.run(create_app(fixture_settings), host=fixture_settings.host, port=fixture_settings.port, access_log=False)


if __name__ == "__main__":
    main()
