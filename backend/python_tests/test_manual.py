"""R9 fixtures contain no personal mailbox data and never use real providers."""
from email.message import EmailMessage

import pytest

from backend.app.services import ai, gmail
from backend.app.services.manual_email import MAX_BODY, MAX_UPLOAD, parse_upload
from backend.app.errors import AppError
from backend.python_tests.test_api import client, sign_in  # noqa: F401

EMAIL = {"subject": "Project review", "sender": "Fixture Tutor <tutor@outlook.example>", "body": "Please review the proposal by 2026-11-06. Meeting on 2026-11-05 at 10:00 in Room 2."}


@pytest.fixture()
def manual(client, monkeypatch):
    sign_in(client)
    client.app.state.settings.openai_api_key = "sanitised-fixture-key"
    assert client.get("/api/v1/accounts").json() == {"accounts": []}

    def forbidden(*args, **kwargs):
        pytest.fail("Manual analysis must never access a mailbox or mutate external data")

    monkeypatch.setattr(client.app.state.auth_repository, "get_tokens", forbidden)
    monkeypatch.setattr(client.app.state.auth_repository, "get_primary_mailbox", forbidden)
    monkeypatch.setattr(gmail, "get_message", forbidden)
    from backend.app.services import calendar
    monkeypatch.setattr(calendar, "create_event", forbidden)
    csrf = client.get("/api/v1/auth/session").json()["csrfToken"]
    client.headers.update({"X-CSRF-Token": csrf})
    return client


def test_summary_without_gmail_reuses_service_and_preferences(manual, monkeypatch, caplog):
    seen = {}

    def summary(subject, sender, body):
        seen.update(subject=subject, sender=sender, body=body, preferences=ai.request_preferences.get())
        return {"summary": "Review the proposal by Friday.", "bullets": ["Attend the meeting."]}

    monkeypatch.setattr(ai, "summarise", summary)
    result = manual.post("/api/v1/ai/manual/summarise", json=EMAIL)
    assert result.status_code == 200 and result.headers["cache-control"] == "no-store"
    assert result.json()["summary"] == "Review the proposal by Friday."
    assert {key: seen[key] for key in EMAIL} == EMAIL
    assert seen["preferences"]["apiKey"] == "sanitised-fixture-key"
    assert ai.request_preferences.get() is None
    assert EMAIL["body"] not in caplog.text and "sanitised-fixture-key" not in caplog.text
    assert EMAIL["body"].encode() not in manual.app.state.database.path.read_bytes()
    with manual.app.state.database.connect() as db:
        for table in ("Task", "Job", "MailboxConnection", "OAuthCredential", "MailboxMessage", "IdempotencyKey", "AuditRecord"):
            assert db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] == 0


def test_classification_without_gmail_uses_bounded_preview(manual, monkeypatch):
    seen = []
    monkeypatch.setattr(ai, "classify", lambda items: seen.extend(items) or {"classifications": {"manual": {"priority": "high", "reason": "Deadline soon"}}, "warning": None})
    result = manual.post("/api/v1/ai/manual/classify", json={**EMAIL, "body": "a" * 900})
    assert result.json() == {"priority": "high", "reason": "Deadline soon", "warning": None}
    assert seen == [{"id": "manual", "subject": EMAIL["subject"], "sender": EMAIL["sender"], "preview": "a" * 400}]


def test_extraction_and_draft_are_suggestions_only(manual, monkeypatch):
    seen = []
    monkeypatch.setattr(ai, "extract", lambda *args: seen.append(args) or {"tasks": [{"title": "Review", "due_date": "2026-11-06"}], "events": [{"title": "Meeting", "start": None}]})
    result = manual.post("/api/v1/ai/manual/extract", json=EMAIL)
    assert result.status_code == 200 and result.json()["events"][0]["start"] is None
    assert seen[0][-1] == ""  # Never assume today's date for copied email.
    monkeypatch.setattr(ai, "draft_reply", lambda *args: seen.append(args) or "Thank you. I will review it.")
    result = manual.post("/api/v1/ai/manual/draft-reply", json={**EMAIL, "tone": "friendly", "instructions": "Acknowledge receipt", "current_draft": "Thanks"})
    assert result.json() == {"draft": "Thank you. I will review it."}
    assert seen[-1][-4:] == ("friendly", "Acknowledge receipt", "Thanks", "Test User")


@pytest.mark.parametrize("payload", [{}, {"body": " \n"}, {"body": "x" * (MAX_BODY + 1)}, {"body": "x\x00"}, {**EMAIL, "message_id": "gmail-1"}, {**EMAIL, "sender": "bad\nheader"}, {**EMAIL, "body": 123}, {**EMAIL, "subject": "s" * 1001}])
def test_invalid_analysis_input_is_safe(manual, payload):
    response = manual.post("/api/v1/ai/manual/summarise", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "MANUAL_INVALID_INPUT"
    assert "input" not in response.json()["error"]


def test_streamed_limits_and_unsupported_types(manual):
    assert manual.post("/api/v1/ai/manual/summarise", content=b"x" * (256 * 1024 + 1), headers={"content-type": "application/json"}).status_code == 413
    assert manual.post("/api/v1/ai/manual/import?format=txt", content=iter([b"x" * MAX_UPLOAD, b"x"]), headers={"content-type": "text/plain"}).status_code == 413
    assert manual.post("/api/v1/ai/manual/import?format=pdf", content=b"pdf", headers={"content-type": "application/pdf"}).status_code == 415
    assert manual.post("/api/v1/ai/manual/summarise", content=b"not json", headers={"content-type": "application/json"}).status_code == 422


@pytest.mark.parametrize("operation", ["summarise", "classify", "extract", "draft-reply", "import?format=txt"])
def test_authentication_and_csrf_required(client, operation):
    url = "/api/v1/ai/manual/" + operation
    assert client.post(url, json=EMAIL).status_code == 401
    sign_in(client)
    assert client.post(url, json=EMAIL).status_code == 403


def test_provider_failure_rate_limit_and_unconfigured_ai(manual, monkeypatch, caplog):
    def fail(*args):
        raise TimeoutError("private-email-content credential")
    monkeypatch.setattr(ai, "summarise", fail)
    response = manual.post("/api/v1/ai/manual/summarise", json=EMAIL)
    assert response.status_code == 502 and response.json()["error"]["retryable"]
    assert "private-email-content" not in response.text + caplog.text
    manual.app.state.settings.manual_ai_limit_per_minute = 1
    assert manual.post("/api/v1/ai/manual/summarise", json=EMAIL).status_code == 429
    manual.app.state.settings.openai_api_key = ""
    assert manual.post("/api/v1/ai/manual/summarise", json=EMAIL).status_code == 503


def test_malformed_ai_output_does_not_escape(manual, monkeypatch):
    monkeypatch.setattr(ai, "summarise", lambda *args: {"summary": ["not text"], "bullets": []})
    assert manual.post("/api/v1/ai/manual/summarise", json=EMAIL).status_code == 502
    monkeypatch.setattr(ai, "extract", lambda *args: {"tasks": [], "events": [], "raw": "private model response"})
    assert manual.post("/api/v1/ai/manual/extract", json=EMAIL).json() == {"tasks": [], "events": [], "warning": "unreadable_reply"}
    monkeypatch.setattr(ai, "classify", lambda *args: {"classifications": {}, "warning": "no_valid_labels"})
    assert manual.post("/api/v1/ai/manual/classify", json=EMAIL).json()["priority"] is None


@pytest.mark.parametrize("encoding", ["utf-8", "utf-8-sig", "utf-16"])
def test_txt_import_then_analysis(manual, monkeypatch, encoding):
    imported = manual.post("/api/v1/ai/manual/import?format=txt", content=EMAIL["body"].encode(encoding), headers={"content-type": "text/plain"})
    assert imported.status_code == 200
    payload = imported.json()
    assert payload.pop("warnings") == []
    assert payload["body"] == EMAIL["body"]
    monkeypatch.setattr(ai, "summarise", lambda *args: {"summary": "Reviewed", "bullets": []})
    assert manual.post("/api/v1/ai/manual/summarise", json=payload).status_code == 200


def test_eml_mime_headers_attachments_html_and_date(manual, monkeypatch):
    message = EmailMessage()
    message["Subject"] = "Review café"
    message["From"] = EMAIL["sender"]
    message["Date"] = "Sun, 01 Nov 2026 10:00:00 +1100"
    message.set_content(EMAIL["body"])
    message.add_alternative('<script>unsafe()</script><p>Wrong alternative<img src="https://tracker.example/pixel"></p>', subtype="html")
    message.add_attachment(b"private attachment", maintype="application", subtype="octet-stream", filename="ignore.txt")
    response = manual.post("/api/v1/ai/manual/import?format=eml", content=message.as_bytes(), headers={"content-type": "message/rfc822"})
    payload = response.json()
    assert response.status_code == 200 and payload["subject"] == "Review café"
    assert payload["body"].strip() == EMAIL["body"] and "2026" in payload["email_date"]
    payload.pop("warnings")
    monkeypatch.setattr(ai, "extract", lambda *args: {"tasks": [], "events": []})
    assert manual.post("/api/v1/ai/manual/extract", json=payload).status_code == 200
    html = b'Subject: HTML\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<style>hidden</style><p>Review &amp; confirm</p><script>unsafe()</script><img src="https://tracker.example/">'
    parsed = parse_upload(html, "eml")
    assert parsed["body"] == "Review & confirm" and parsed["warnings"]


@pytest.mark.parametrize("raw,format", [(b"", "txt"), (b"binary\x00data", "txt"), (b"\xff\xff", "txt"), (b"not email", "eml"), (b"Subject: Empty\n\n", "eml"), (b"x" * 15001, "txt"), (b"Subject: bad\nContent-Type: multipart/mixed; boundary=x\n\n--x\n", "eml")])
def test_invalid_uploads(raw, format):
    with pytest.raises(AppError):
        parse_upload(raw, format)


def test_unknown_charset_and_nested_message_are_safe():
    parsed = parse_upload(b'Subject: Fixture\r\nContent-Type: text/plain; charset=made-up\r\n\r\nReview caf\xc3\xa9', "eml")
    assert parsed["body"] == "Review café" and parsed["warnings"]
    message = EmailMessage()
    message["Subject"] = "Main"
    message.set_content("Only main content")
    nested = EmailMessage()
    nested["Subject"] = "Attached"
    nested.set_content("Do not analyse attached email")
    message.add_attachment(nested)
    assert parse_upload(message.as_bytes(), "eml")["body"].strip() == "Only main content"


def test_folded_standard_headers_and_mime_depth_limit():
    parsed = parse_upload(b"Subject: Long\r\n\tstandard subject\r\nFrom: Tutor <tutor@example.com>\r\n\r\nReview the proposal", "eml")
    assert parsed["subject"] == "Long standard subject"
    nested = EmailMessage()
    nested["Subject"] = "Depth fixture"
    nested.set_content("Text")
    for index in range(22):
        parent = EmailMessage()
        parent["Subject"] = "Depth fixture"
        parent.make_mixed()
        parent.attach(nested)
        nested = parent
    with pytest.raises(AppError, match="too complex"):
        parse_upload(nested.as_bytes(), "eml")
