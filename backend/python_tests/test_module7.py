import asyncio
from types import SimpleNamespace

import httpx
import pytest

from backend.python_tests.test_api import client, authenticate
from backend.app.errors import AppError
from backend.app.preferences import PreferencesRepository
from backend.app.services.speech import SpeechService
from backend.app.services import ai


def headers(client):
    return {"X-CSRF-Token": client.get("/api/v1/auth/session").json()["csrfToken"]}


def test_settings_auth_validation_persistence_and_isolation(client):
    assert client.get("/api/v1/settings").status_code == 401
    authenticate(client)
    initial = client.get("/api/v1/settings").json()
    assert initial["settings"]["voiceEnabled"] is False
    assert client.patch("/api/v1/settings", json={"theme": "dark"}).status_code == 403
    for patch in ({"language": "es"}, {"voiceEnabled": "true"}, {"theme": None}, {"unknown": 1}, {"defaultAiModel": "fake"}, {}):
        assert client.patch("/api/v1/settings", headers=headers(client), json=patch).status_code == 422
    updated = {"language": "zh-CN", "theme": "dark", "voiceEnabled": True, "replyLength": "detailed"}
    assert client.patch("/api/v1/settings", headers=headers(client), json=updated).status_code == 200
    repository = PreferencesRepository(client.app.state.database, client.app.state.settings)
    assert repository.get("user-1") | updated == repository.get("user-1")
    assert repository.get("other-user")["theme"] == "system"
    assert client.post("/api/v1/auth/logout", headers=headers(client)).status_code in (200, 204)
    authenticate(client)
    assert client.get("/api/v1/settings").json()["settings"]["language"] == "zh-CN"


def test_corrupt_preferences_fall_back_per_field(client):
    authenticate(client)
    repository = client.app.state.preferences
    repository.update("user-1", {"theme": "dark", "voiceEnabled": True})
    with client.app.state.database.connect() as connection:
        connection.execute('UPDATE "UserSettings" SET "language"=?, "reducedMotion"=?, "defaultAiModel"=? WHERE "userId"=?', ("invalid", 9, "unknown", "user-1"))
    values = repository.get("user-1")
    assert values["theme"] == "dark"
    assert values["voiceEnabled"] is True
    assert values["language"] == "en"
    assert values["reducedMotion"] is False
    assert values["defaultAiModel"] == repository.models[0]


def test_voice_boundaries_and_no_content_logs(client, monkeypatch, caplog):
    assert client.get("/api/v1/voice/capabilities").status_code == 401
    authenticate(client)
    h = {**headers(client), "Content-Type": "audio/webm"}
    path = "/api/v1/voice/transcriptions"
    assert client.post(path, headers=h, content=b"audio").status_code == 403
    client.patch("/api/v1/settings", headers=headers(client), json={"voiceEnabled": True})
    client.app.state.settings.openai_api_key = ""
    assert client.post(path, headers=h, content=b"audio").status_code == 503
    client.app.state.settings.openai_api_key = "fixture-key"
    assert client.get("/api/v1/voice/capabilities").json()["available"] is True
    assert client.post(path, headers={"Content-Type": "audio/webm"}, content=b"audio").status_code == 403
    assert client.post(path + "?language=zh-CN", headers=h, content=b"audio").status_code == 415
    assert client.post(path, headers=h, content=b"invalid").status_code == 422
    client.app.state.settings.speech_max_bytes = 16
    assert client.post(path, headers=h, content=b"\x1a\x45\xdf\xa3" + b"x" * 17).status_code == 413
    async def fake(audio, mime, language):
        assert mime == "audio/webm" and language == "en-AU"
        return "Show my tasks"
    monkeypatch.setattr(client.app.state.speech, "transcribe", fake)
    assert client.post(path, headers=h, content=b"\x1a\x45\xdf\xa3data").json() == {"text": "Show my tasks"}
    assert "Show my tasks" not in caplog.text and "fixture-key" not in caplog.text
    client.app.state.settings.speech_limit_per_minute = 1
    assert client.post(path, headers=h, content=b"\x1a\x45\xdf\xa3data").status_code == 429


@pytest.mark.parametrize("status,payload,expected", [(200, {"text": ""}, "VOICE_NO_SPEECH"), (200, {"text": "Show my tasks"}, None), (401, {}, "VOICE_PROVIDER_FAILED"), (429, {}, "VOICE_RATE_LIMITED"), (400, {}, "VOICE_INVALID_AUDIO"), (500, {}, "VOICE_PROVIDER_FAILED")])
def test_speech_provider_mapping(monkeypatch, status, payload, expected):
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs):
            assert kwargs["files"]["file"][0] == "command.webm"
            return httpx.Response(status, json=payload)
    monkeypatch.setattr(httpx, "AsyncClient", Client)
    service = SpeechService(SimpleNamespace(speech_timeout_seconds=30, speech_api_url="https://example.test/transcribe", openai_api_key="fixture", speech_model="fixture"))
    if expected:
        with pytest.raises(AppError) as error: asyncio.run(service.transcribe(b"fixture", "audio/webm", "en-AU"))
        assert error.value.code == expected
    else:
        assert asyncio.run(service.transcribe(b"fixture", "audio/webm", "en-AU")) == "Show my tasks"


def test_ai_preferences_are_request_local(monkeypatch):
    captured = []
    monkeypatch.setattr(ai, "_chat", lambda system, user, **kwargs: captured.append((system, kwargs)) or "draft")
    token = ai.request_preferences.set({"replyLength": "concise", "defaultAiModel": "fixture"})
    try: ai.draft_reply("subject", "sender", "body", "friendly")
    finally: ai.request_preferences.reset(token)
    ai.draft_reply("subject", "sender", "body")
    assert "80 words" in captured[0][0]
    assert captured[0][1]["max_tokens"] < captured[1][1]["max_tokens"]
    assert ai.request_preferences.get() is None
