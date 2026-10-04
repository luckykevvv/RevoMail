import base64
from email import message_from_bytes, policy

import pytest
from googleapiclient.errors import HttpError

from backend.app.routers import emails
from backend.app.services import gmail
from backend.python_tests.test_api import authenticate, client  # noqa: F401  (fixture reuse)


# --- pure helpers -----------------------------------------------------------

def hdr(**values):
    return [{"name": name.replace("_", "-"), "value": value} for name, value in values.items()]


def test_reply_goes_to_reply_to_then_from():
    assert gmail.reply_recipients(hdr(From="Ann <ann@example.com>"), ["INBOX"]) == ["Ann <ann@example.com>"]
    both = hdr(From="Ann <ann@example.com>", Reply_To="support@example.com")
    assert gmail.reply_recipients(both, ["INBOX"]) == ["support@example.com"]


def test_reply_to_a_sent_message_goes_to_its_recipients():
    headers = hdr(From="me@example.com", To="bob@example.com, Cy <cy@example.com>")
    assert gmail.reply_recipients(headers, ["SENT"]) == ["bob@example.com", "Cy <cy@example.com>"]


def test_reply_recipients_empty_when_header_missing_or_invalid():
    assert gmail.reply_recipients([], ["INBOX"]) == []
    assert gmail.reply_recipients(hdr(From="not-an-address"), ["INBOX"]) == []


@pytest.mark.parametrize("raw", ["", "nobody", "a@b", "x@example.com\r\nBcc: evil@example.com", "a@b.com, junk"])
def test_parse_recipients_rejects_bad_input(raw):
    with pytest.raises(gmail.MessageValidationError):
        gmail.parse_recipients(raw)


def test_parse_recipients_limits_count():
    many = ", ".join(f"u{i}@example.com" for i in range(gmail.MAX_RECIPIENTS + 1))
    with pytest.raises(gmail.MessageValidationError):
        gmail.parse_recipients(many)


def test_reply_subject_prefixes_once():
    assert gmail.reply_subject("Project Meeting") == "Re: Project Meeting"
    assert gmail.reply_subject("RE: Project Meeting") == "RE: Project Meeting"


def test_build_mime_rejects_header_injection():
    with pytest.raises(gmail.MessageValidationError):
        gmail.build_mime(["a@example.com"], "Hi\r\nBcc: evil@example.com", "body")


# --- send_message against a fake Gmail client ------------------------------------

class FakeCall:
    def __init__(self, result):
        self.result = result

    def execute(self):
        return self.result


class FakeMessages:
    def __init__(self, original):
        self.original, self.sent = original, []

    def get(self, **kwargs):
        self.get_kwargs = kwargs
        return FakeCall(self.original)

    def send(self, **kwargs):
        self.sent.append(kwargs)
        return FakeCall({"id": "sent-1", "threadId": kwargs["body"].get("threadId", "new-thread")})


class FakeGmail:
    def __init__(self, original=None):
        self.messages_api = FakeMessages(original)

    def users(self):
        return self

    def messages(self):
        return self.messages_api


def decode_sent(fake):
    raw = fake.messages_api.sent[0]["body"]["raw"]
    return message_from_bytes(base64.urlsafe_b64decode(raw), policy=policy.default)


ORIGINAL = {
    "threadId": "thread-9",
    "labelIds": ["INBOX"],
    "payload": {
        "headers": hdr(
            From="Prof Smith <smith@university.edu>",
            Subject="Project Meeting Tomorrow",
            Message_ID="<orig@mail.example>",
            References="<older@mail.example>",
        )
    },
}


def test_send_reply_is_addressed_from_the_original_and_threaded(monkeypatch):
    fake = FakeGmail(ORIGINAL)
    monkeypatch.setattr(gmail, "_build_gmail", lambda _t: fake)
    result = gmail.send_message({}, "someone-else@example.com", "", "Thanks, see you there.", "msg-1")
    assert result == {"id": "sent-1", "thread_id": "thread-9"}
    message = decode_sent(fake)
    assert message["To"] == "Prof Smith <smith@university.edu>"  # client-supplied `to` is ignored for replies
    assert message["Subject"] == "Re: Project Meeting Tomorrow"
    assert message["In-Reply-To"] == "<orig@mail.example>"
    assert message["References"] == "<older@mail.example> <orig@mail.example>"
    assert message.get_content().strip() == "Thanks, see you there."
    assert fake.messages_api.sent[0]["userId"] == "me"
    assert fake.messages_api.sent[0]["body"]["threadId"] == "thread-9"


def test_send_new_message_has_no_thread(monkeypatch):
    fake = FakeGmail()
    monkeypatch.setattr(gmail, "_build_gmail", lambda _t: fake)
    gmail.send_message({}, "bob@example.com", "Hello", "Hi Bob")
    assert "threadId" not in fake.messages_api.sent[0]["body"]
    assert decode_sent(fake)["To"] == "bob@example.com"


def test_send_reply_without_valid_address_sends_nothing(monkeypatch):
    fake = FakeGmail({"threadId": "t", "labelIds": ["INBOX"], "payload": {"headers": []}})
    monkeypatch.setattr(gmail, "_build_gmail", lambda _t: fake)
    with pytest.raises(gmail.MessageValidationError):
        gmail.send_message({}, None, "", "body", "msg-1")
    assert fake.messages_api.sent == []


def test_list_messages_rejects_unknown_label(monkeypatch):
    monkeypatch.setattr(gmail, "_build_gmail", lambda _t: FakeGmail())
    with pytest.raises(ValueError):
        gmail.list_messages({}, 5, None, "TRASH")


# --- HTTP route -------------------------------------------------------------------

def body(**overrides):
    payload = {
        "to": "bob@example.com",
        "subject": "Hello",
        "body": "Hi Bob",
        "confirmed": True,
        "idempotencyKey": "key-0001-abcdef",
    }
    payload.update(overrides)
    return payload


def count_audit(client, outcome):
    with client.app.state.database.connect() as connection:
        return connection.execute('SELECT COUNT(*) FROM "AuditRecord" WHERE "outcome"=?', (outcome,)).fetchone()[0]


def test_send_requires_authentication(client):
    assert client.post("/api/v1/emails/send", json=body()).status_code == 401


def test_send_requires_explicit_confirmation(client, monkeypatch):
    authenticate(client)
    calls = []
    monkeypatch.setattr(emails.gmail_service, "send_message", lambda *a: calls.append(a))
    response = client.post("/api/v1/emails/send", json=body(confirmed=False))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "CONFIRMATION_REQUIRED"
    assert calls == []


def test_send_is_idempotent(client, monkeypatch):
    authenticate(client)
    calls = []

    def fake_send(tokens, to, subject, text, reply_id):
        calls.append((to, subject, text, reply_id))
        return {"id": "sent-1", "thread_id": "t-1"}

    monkeypatch.setattr(emails.gmail_service, "send_message", fake_send)
    first = client.post("/api/v1/emails/send", json=body())
    again = client.post("/api/v1/emails/send", json=body())
    assert first.status_code == 200 and first.json() == {"id": "sent-1", "threadId": "t-1", "sent": True, "replayed": False}
    assert again.status_code == 200 and again.json()["replayed"] is True and again.json()["id"] == "sent-1"
    assert len(calls) == 1
    assert count_audit(client, "SUCCEEDED") == 1

    changed = client.post("/api/v1/emails/send", json=body(body="Different text"))
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert len(calls) == 1


def test_stored_idempotency_row_and_audit_hold_no_message_content(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(emails.gmail_service, "send_message", lambda *a: {"id": "sent-1", "thread_id": "t-1"})
    client.post("/api/v1/emails/send", json=body(body="very private words", to="secret.person@example.com"))
    data = client.app.state.database.path.read_bytes()
    assert b"very private words" not in data
    assert b"secret.person@example.com" not in data


def test_reply_request_passes_reply_id_and_needs_no_recipient(client, monkeypatch):
    authenticate(client)
    seen = {}
    monkeypatch.setattr(
        emails.gmail_service,
        "send_message",
        lambda tokens, to, subject, text, reply_id: seen.update(to=to, reply=reply_id) or {"id": "s", "thread_id": "t"},
    )
    response = client.post("/api/v1/emails/send", json=body(to=None, subject="", replyToMessageId="msg-1"))
    assert response.status_code == 200
    assert seen == {"to": None, "reply": "msg-1"}


def test_send_without_recipient_or_reply_is_rejected(client):
    authenticate(client)
    response = client.post("/api/v1/emails/send", json=body(to=None))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_RECIPIENT"


def test_validation_failure_allows_retry_with_same_key(client, monkeypatch):
    authenticate(client)
    outcomes = [gmail.MessageValidationError("One of the recipient email addresses is not valid."), {"id": "s", "thread_id": "t"}]

    def fake_send(*_args):
        outcome = outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(emails.gmail_service, "send_message", fake_send)
    assert client.post("/api/v1/emails/send", json=body()).status_code == 422
    assert client.post("/api/v1/emails/send", json=body()).status_code == 200


def http_error(status, content=b"{}"):
    class Resp(dict):
        pass

    resp = Resp(status=status)
    resp.status = status
    resp.reason = "x"
    return HttpError(resp, content)


def test_permission_error_maps_to_reconnect_message(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(emails.gmail_service, "send_message", lambda *a: (_ for _ in ()).throw(http_error(403)))
    response = client.post("/api/v1/emails/send", json=body())
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "INSUFFICIENT_PERMISSIONS"
    assert count_audit(client, "FAILED") == 1


def test_ambiguous_failure_blocks_automatic_resend(client, monkeypatch):
    authenticate(client)
    calls = []

    def fake_send(*_args):
        calls.append(1)
        raise TimeoutError("socket detail that must not leak")

    monkeypatch.setattr(emails.gmail_service, "send_message", fake_send)
    first = client.post("/api/v1/emails/send", json=body())
    assert first.status_code == 502
    assert first.json()["error"]["code"] == "SEND_OUTCOME_UNKNOWN"
    assert "socket detail" not in first.text
    second = client.post("/api/v1/emails/send", json=body())
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "SEND_OUTCOME_UNKNOWN"
    assert len(calls) == 1


def test_list_route_validates_label(client, monkeypatch):
    authenticate(client)
    seen = []
    monkeypatch.setattr(
        emails.gmail_service,
        "list_messages",
        lambda _t, _m, _p, label: seen.append(label) or {"messages": [], "next_page_token": None},
    )
    assert client.get("/api/v1/emails?label=sent").status_code == 200
    assert client.get("/api/v1/emails?label=TRASH").status_code == 422
    assert seen == ["SENT"]
