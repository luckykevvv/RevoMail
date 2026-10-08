import asyncio
from types import SimpleNamespace

import httpx
import pytest

from backend.python_tests.test_api import client, authenticate
from backend.app.errors import AppError
from backend.app.preferences import PreferencesRepository
from backend.app.services.speech import SpeechService
from backend.app.services import ai
from backend.app.services import voice_intent


def headers(client):
    return {"X-CSRF-Token": client.get("/api/v1/auth/session").json()["csrfToken"]}


def test_settings_auth_validation_persistence_and_isolation(client):
    assert client.get("/api/v1/settings").status_code == 401
    authenticate(client)
    initial = client.get("/api/v1/settings").json()
    assert initial["settings"]["voiceEnabled"] is False
    assert initial["settings"]["voiceAutoPlay"] is True
    assert initial["settings"]["speechLanguage"] == "auto"
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
    assert client.post(path + "?language=invalid", headers=h, content=b"audio").status_code == 415
    assert client.post(path, headers=h, content=b"invalid").status_code == 422
    client.app.state.settings.speech_max_bytes = 16
    assert client.post(path, headers=h, content=b"\x1a\x45\xdf\xa3" + b"x" * 17).status_code == 413
    async def fake(audio, mime, language):
        assert mime == "audio/webm" and language == "auto"
        return "Show my tasks"
    monkeypatch.setattr(client.app.state.speech, "transcribe", fake)
    assert client.post(path, headers=h, content=b"\x1a\x45\xdf\xa3data").json() == {"text": "Show my tasks"}
    assert "Show my tasks" not in caplog.text and "fixture-key" not in caplog.text
    client.app.state.settings.speech_limit_per_minute = 1
    client.app.state.speech.attempts["transcription"].clear()
    assert client.post(path, headers=h, content=b"\x1a\x45\xdf\xa3data").status_code == 200
    assert client.post(path, headers=h, content=b"\x1a\x45\xdf\xa3data").status_code == 429


def test_voice_intent_review_and_tts_boundaries(client, monkeypatch, caplog):
    authenticate(client)
    h = headers(client)
    intent = client.post("/api/v1/voice/intents", headers=h, json={
        "transcript": "总结这封邮件", "language": "auto",
        "context": {"view": "reading", "currentMessageId": "message-1"},
    })
    assert intent.status_code == 200
    assert intent.json()["action"] == "summarize_message"
    assert intent.json()["target"]["mode"] == "current"
    assert intent.json()["detectedLanguage"] == "zh-CN"
    assert intent.json()["displayText"] == "Summarise the selected email"
    polite_intent = client.post("/api/v1/voice/intents", headers=h, json={
        "transcript": "Help me summarize this email.", "language": "auto",
        "context": {"view": "reading", "currentMessageId": "message-1", "followUpMessageId": "reviewed-message"},
    })
    assert polite_intent.status_code == 200
    assert polite_intent.json()["action"] == "summarize_message"
    assert polite_intent.json()["target"]["mode"] == "current"
    unsafe = client.post("/api/v1/voice/intents", headers=h, json={
        "transcript": "delete every email", "language": "auto", "context": {"view": "inbox"},
    })
    assert unsafe.status_code == 422 and unsafe.json()["error"]["code"] == "VOICE_UNSAFE_COMMAND"

    speech_path = "/api/v1/voice/speech"
    assert client.post(speech_path, headers=h, json={"text": "private fixture", "language": "en"}).status_code == 403
    client.patch("/api/v1/settings", headers=h, json={"voiceEnabled": True, "voiceAutoPlay": True, "speechLanguage": "auto"})
    client.app.state.settings.openai_api_key = "fixture-key"
    async def fake_synthesise(text, language):
        assert text == "private fixture" and language == "en"
        return b"fixture-mp3"
    monkeypatch.setattr(client.app.state.speech, "synthesise", fake_synthesise)
    response = client.post(speech_path, headers=h, json={"text": "private fixture", "language": "en"})
    assert response.status_code == 200 and response.content == b"fixture-mp3"
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.headers["cache-control"] == "no-store"
    assert "private fixture" not in caplog.text


@pytest.mark.parametrize("transcript,action", [
    ("Could you please summarise this email for me?", "summarize_message"),
    ("Please generate a reply to the current email.", "draft_reply"),
    ("请帮我总结一下这封邮件。", "summarize_message"),
    ("可以帮我打开当前邮件吗？", "open_message"),
    ("麻烦你帮我查看我的任务。", "show_tasks"),
])
def test_polite_voice_commands_remain_deterministic(transcript, action):
    parsed = voice_intent.deterministic_intent(transcript, "auto")
    assert parsed["action"] == action


@pytest.mark.parametrize("transcript,action,sender", [
    ("Help me find the email from Hassan", "search_messages", "hassan"),
    ("Search the email from Hassan and summarize it.", "summarize_message", "hassan"),
    ("查找 Hassan 的邮件并总结它", "summarize_message", "hassan"),
])
def test_mailbox_search_and_safe_terminal_action_remain_one_reviewed_intent(transcript, action, sender):
    parsed = voice_intent.deterministic_intent(transcript, "auto")
    assert parsed["action"] == action
    assert parsed["target"]["mode"] == "search"
    assert parsed["target"]["sender"].lower() == sender


@pytest.mark.parametrize("transcript,action", [
    ("Summarise it", "summarize_message"),
    ("Generate a reply to it", "draft_reply"),
    ("Extract details from the selected email", "extract_details"),
    ("总结它", "summarize_message"),
])
def test_follow_up_references_use_the_reviewed_current_target(transcript, action):
    parsed = voice_intent.deterministic_intent(transcript, "auto")
    assert parsed["action"] == action
    assert parsed["target"]["mode"] == "current"


def test_polite_unsafe_voice_command_is_still_rejected():
    with pytest.raises(AppError) as error:
        voice_intent.deterministic_intent("Please summarize this email and delete it.", "auto")
    assert error.value.code == "VOICE_UNSAFE_COMMAND"


@pytest.mark.parametrize("transcript", [
    "Help me summarize the highest priority email.",
    "Please summarise the most important recent email.",
    "请帮我总结一下优先级最高的邮件。",
])
def test_highest_priority_summary_uses_ranked_mailbox_candidates(transcript):
    parsed = voice_intent.deterministic_intent(transcript, "auto")
    assert parsed["action"] == "summarize_message"
    assert parsed["target"] == {"mode": "search", "newest": True}


def test_complex_voice_intent_uses_strict_structured_output(monkeypatch):
    parsed_payload = {
        "detectedLanguage": "en",
        "action": "summarize_message",
        "target": {
            "mode": "search", "terms": "", "sender": "", "subject": "budget",
            "unread": True, "starred": None, "priority": None, "newest": True,
        },
        "destination": None,
        "displayText": "Summarise the newest unread budget email",
        "confidence": "high",
    }
    captured = {}

    class Completions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
                content=__import__("json").dumps(parsed_payload), refusal=None,
            ))])

    class Client:
        def __init__(self, **kwargs):
            assert kwargs == {"api_key": "fixture-key"}
            self.chat = SimpleNamespace(completions=Completions())

    monkeypatch.setattr(voice_intent, "OpenAI", Client)
    settings = SimpleNamespace(openai_api_key="fixture-key", openai_model="gpt-4o")
    result = voice_intent.parse_intent(
        "Summarise the newest unread budget message", "auto", {"view": "inbox"}, settings,
    )
    assert result == {**parsed_payload, "displayText": "Summarise the selected email"}
    assert captured["response_format"]["type"] == "json_schema"
    assert captured["response_format"]["json_schema"]["strict"] is True
    assert captured["response_format"]["json_schema"]["schema"]["additionalProperties"] is False


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


def test_auto_transcription_omits_provider_language_hint(monkeypatch):
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs):
            assert "language" not in kwargs["data"]
            return httpx.Response(200, json={"text": "总结这封邮件"})
    monkeypatch.setattr(httpx, "AsyncClient", Client)
    service = SpeechService(SimpleNamespace(speech_timeout_seconds=30, speech_api_url="https://example.test/transcribe", openai_api_key="fixture", speech_model="fixture"))
    assert asyncio.run(service.transcribe(b"fixture", "audio/webm", "auto")) == "总结这封邮件"


@pytest.mark.parametrize("status,expected", [(200, None), (400, "VOICE_INVALID_SPEECH"), (429, "VOICE_RATE_LIMITED"), (500, "VOICE_PROVIDER_FAILED")])
def test_tts_provider_mapping(monkeypatch, status, expected):
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs):
            assert kwargs["json"] == {
                "model": "tts-fixture", "voice": "alloy", "input": "Read this",
                "instructions": "Speak clearly in English at a calm, accessible pace.", "response_format": "mp3",
            }
            return httpx.Response(status, content=b"fixture-audio" if status == 200 else b"")
    monkeypatch.setattr(httpx, "AsyncClient", Client)
    service = SpeechService(SimpleNamespace(
        tts_timeout_seconds=30, tts_api_url="https://example.test/speech", openai_api_key="fixture",
        tts_model="tts-fixture", tts_voice="alloy",
    ))
    if expected:
        with pytest.raises(AppError) as error: asyncio.run(service.synthesise("Read this", "en"))
        assert error.value.code == expected
    else:
        assert asyncio.run(service.synthesise("Read this", "en")) == b"fixture-audio"


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
