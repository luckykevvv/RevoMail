import base64
from email import message_from_bytes, policy

import pytest
from googleapiclient.errors import HttpError

from backend.app.routers import emails
from backend.app.services import gmail
from backend.python_tests.test_api import authenticate, client  # noqa: F401  (fixture reuse)


def outgoing(**overrides):
    return {"to": ["bob@example.com"], "subject": "Hello", "bodyText": "Hi Bob", "confirmed": True,
            "idempotencyKey": "merged-send-key-0001", **overrides}


def login_csrf(client):
    authenticate(client)
    client.headers["X-CSRF-Token"] = client.get("/api/v1/auth/session").json()["csrfToken"]


def test_canonical_send_confirmation_csrf_and_replay(client, monkeypatch):
    assert client.post("/api/v1/emails/send", json=outgoing()).status_code == 401
    authenticate(client)
    assert client.post("/api/v1/emails/send", json=outgoing()).status_code == 403
    client.headers["X-CSRF-Token"] = client.get("/api/v1/auth/session").json()["csrfToken"]
    calls = []
    monkeypatch.setattr(gmail.GmailAdapter, "__init__", lambda self, tokens: None)
    monkeypatch.setattr(gmail.GmailAdapter, "send_message", lambda self, payload: calls.append(payload) or {"providerMessageId": "sent-1", "threadId": "t"})
    assert client.post("/api/v1/emails/send", json=outgoing(confirmed=False)).status_code == 422
    first = client.post("/api/v1/emails/send", json=outgoing())
    assert first.status_code == 200 and first.json()["status"] == "sent"
    assert client.post("/api/v1/emails/send", json=outgoing()).json() == first.json()
    assert client.post("/api/v1/emails/send", json=outgoing(bodyText="changed")).status_code == 409
    assert len(calls) == 1


def test_unknown_send_is_not_repeated(client, monkeypatch):
    login_csrf(client)
    calls = []
    monkeypatch.setattr(gmail.GmailAdapter, "__init__", lambda self, tokens: None)
    def fail(self, payload):
        calls.append(1)
        raise gmail.ProviderTimeout()
    monkeypatch.setattr(gmail.GmailAdapter, "send_message", fail)
    for _ in range(2):
        assert client.post("/api/v1/emails/send", json=outgoing()).json()["status"] == "unknown"
    assert len(calls) == 1


def test_sent_page_is_not_inserted_into_inbox_cache(client, monkeypatch):
    login_csrf(client)
    calls = []
    monkeypatch.setattr(gmail.GmailAdapter, "__init__", lambda self, tokens: None)
    monkeypatch.setattr(gmail.GmailAdapter, "list_messages", lambda self, *args: calls.append(args) or {"items": [{"id": "sent-only"}], "nextCursor": "next"})
    monkeypatch.setattr(client.app.state.mailbox_repository, "upsert_messages", lambda *args: pytest.fail("SENT must not enter INBOX cache"))
    response = client.get("/api/v1/emails?label=SENT&page_token=cursor")
    assert response.status_code == 200 and response.json()["next_page_token"] == "next"
    assert calls == [(20, "cursor", "", ["SENT"])]
    assert client.get("/api/v1/emails?label=TRASH").status_code == 422


def test_starred_page_reads_gmail_starred_label_without_caching(client, monkeypatch):
    login_csrf(client)
    calls = []
    monkeypatch.setattr(gmail.GmailAdapter, "__init__", lambda self, tokens: None)
    monkeypatch.setattr(gmail.GmailAdapter, "list_messages", lambda self, *args: calls.append(args) or {"items": [{"id": "starred-archived", "starred": True}], "nextCursor": None})
    monkeypatch.setattr(client.app.state.mailbox_repository, "upsert_messages", lambda *args: pytest.fail("STARRED must not enter INBOX cache"))
    response = client.get("/api/v1/emails?label=STARRED")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["messages"]] == ["starred-archived"]
    assert calls == [(20, None, "", ["STARRED"])]


def test_reply_adapter_preserves_reviewed_recipients_and_references():
    fake = FakeGmail(ORIGINAL)
    adapter = object.__new__(gmail.GmailAdapter)
    adapter.gmail = fake
    adapter.get_message = lambda message_id: {"rfcMessageId": "<original@example.com>", "references": "<older@example.com>", "threadId": "thread-9"}
    result = adapter.send_message(outgoing(inReplyToMessageId="msg-1"))
    message = decode_sent(fake)
    assert message["To"] == "bob@example.com"
    assert message["References"] == "<older@example.com> <original@example.com>"
    assert result["threadId"] == "thread-9"


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
    return message_from_bytes(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)), policy=policy.default)


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



def count_audit(client, outcome):
    with client.app.state.database.connect() as connection:
        return connection.execute('SELECT COUNT(*) FROM "AuditRecord" WHERE "outcome"=?', (outcome,)).fetchone()[0]



def http_error(status, content=b"{}"):
    class Resp(dict):
        pass

    resp = Resp(status=status)
    resp.status = status
    resp.reason = "x"
    return HttpError(resp, content)
