import pytest

from backend.app.routers import ai as ai_router
from backend.app.services import ai
from backend.python_tests.test_api import authenticate, client  # noqa: F401  (fixture reuse)


@pytest.fixture()
def chat(monkeypatch):
    calls = []

    def fake_chat(system, user, max_tokens=512, temperature=0.4, json_mode=False):
        calls.append({"system": system, "user": user})
        return fake_chat.reply

    fake_chat.reply = "Hello there."
    monkeypatch.setattr(ai, "_chat", fake_chat)
    fake_chat.calls = calls
    return fake_chat


def test_reply_draft_without_instructions_has_no_optional_sections(chat):
    ai.draft_reply("Subject", "a@example.com", "Body text", "friendly", user_name="Joel George")
    prompt = chat.calls[0]
    assert "<original_email>" in prompt["user"] and "Body text" in prompt["user"]
    assert "<user_instructions>" not in prompt["user"] and "<current_draft>" not in prompt["user"]
    assert "Joel George" in prompt["system"]
    assert "warm, conversational" in prompt["system"]


def test_reply_draft_includes_instructions_and_current_draft(chat):
    ai.draft_reply("S", "a@example.com", "Body", "concise", "Say yes but ask for 11am", "Old draft text")
    user = chat.calls[0]["user"]
    assert "<user_instructions>\nSay yes but ask for 11am\n</user_instructions>" in user
    assert "<current_draft>\nOld draft text\n</current_draft>" in user
    assert "untrusted" in chat.calls[0]["system"]


def test_sign_off_never_uses_a_placeholder(chat):
    ai.draft_reply("S", "a@example.com", "Body", user_name="")
    assert "[Your name]" not in chat.calls[0]["system"]
    assert "no name or placeholder" in chat.calls[0]["system"]


def test_unknown_tone_falls_back_to_professional(chat):
    ai.draft_reply("S", "a@example.com", "Body", "sarcastic")
    assert "professional" in chat.calls[0]["system"]


def test_compose_splits_subject_from_body(chat):
    chat.reply = "Subject: Project update\n\nHi Sam,\n\nAll on track.\n\nBest regards,\nJoel"
    result = ai.compose("tell Sam the project is on track", "professional")
    assert result == {"subject": "Project update", "draft": "Hi Sam,\n\nAll on track.\n\nBest regards,\nJoel"}


def test_compose_keeps_user_subject_and_handles_missing_subject_line(chat):
    chat.reply = "Hi Sam,\n\nAll on track."
    result = ai.compose("update", "concise", subject="My own subject", current_draft="draft")
    assert result["subject"] == "My own subject"
    assert result["draft"] == "Hi Sam,\n\nAll on track."
    user = chat.calls[0]["user"]
    assert "<subject>\nMy own subject\n</subject>" in user and "<current_draft>" in user


def test_compose_subject_is_single_line_and_bounded(chat):
    chat.reply = "Subject: Hello\tworld  again\n\nBody"
    assert ai.compose("x")["subject"] == "Hello world again"
    chat.reply = "Subject: " + "A" * 500 + "\n\nBody"
    assert len(ai.compose("x")["subject"]) == 300


def test_instructions_are_truncated_before_sending(chat):
    ai.compose("x" * (ai.MAX_INSTRUCTIONS + 500))
    assert chat.calls[0]["user"].count("x") == ai.MAX_INSTRUCTIONS


# --- routes ---------------------------------------------------------------------------

def test_compose_route_requires_authentication(client):
    assert client.post("/api/v1/ai/compose", json={"instructions": "hi"}).status_code == 401


def test_compose_route_validates_and_passes_user_name(client, monkeypatch):
    authenticate(client)
    seen = {}

    def fake_compose(instructions, tone, subject, current_draft, user_name):
        seen.update(instructions=instructions, tone=tone, subject=subject, current_draft=current_draft, user_name=user_name)
        return {"subject": "S", "draft": "D"}

    monkeypatch.setattr(ai_router.ai_service, "compose", fake_compose)
    assert client.post("/api/v1/ai/compose", json={"instructions": ""}).status_code == 422
    assert client.post("/api/v1/ai/compose", json={"instructions": "x" * 1001}).status_code == 422
    response = client.post("/api/v1/ai/compose", json={"instructions": "write it", "tone": "friendly", "current_draft": "old"})
    assert response.status_code == 200 and response.json() == {"subject": "S", "draft": "D"}
    assert seen == {"instructions": "write it", "tone": "friendly", "subject": "", "current_draft": "old", "user_name": "Test User"}


def test_compose_route_hides_provider_details(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(ai_router.ai_service, "compose", lambda *_a: (_ for _ in ()).throw(RuntimeError("sk-secret detail")))
    response = client.post("/api/v1/ai/compose", json={"instructions": "hi"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "AI_PROVIDER_FAILED"
    assert "sk-secret" not in response.text


def test_draft_reply_route_passes_instructions_draft_and_name(client, monkeypatch):
    authenticate(client)
    seen = {}
    monkeypatch.setattr(
        ai_router.gmail_service,
        "get_message",
        lambda _t, _id: {"subject": "Hi", "sender": "a@example.com", "body_plain": "Body"},
    )
    monkeypatch.setattr(ai_router.ai_service, "draft_reply", lambda *args: seen.setdefault("args", args) and "Draft")
    response = client.post(
        "/api/v1/ai/draft-reply",
        json={"message_id": "m1", "tone": "concise", "instructions": "decline politely", "current_draft": "prev"},
    )
    assert response.status_code == 200 and response.json() == {"draft": "Draft"}
    assert seen["args"] == ("Hi", "a@example.com", "Body", "concise", "decline politely", "prev", "Test User")


def test_draft_reply_route_still_works_without_new_fields(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(ai_router.gmail_service, "get_message", lambda _t, _id: {"subject": "Hi", "sender": "a", "body_plain": "B"})
    monkeypatch.setattr(ai_router.ai_service, "draft_reply", lambda *args: "Draft")
    assert client.post("/api/v1/ai/draft-reply", json={"message_id": "m1"}).status_code == 200
