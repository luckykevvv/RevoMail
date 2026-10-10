import base64
from email import message_from_bytes, policy

from backend.app.services import gmail
from backend.python_tests.test_api import authenticate, client  # noqa: F401  (fixture reuse)
from backend.python_tests.test_send_email import login_csrf, outgoing


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


class FakeRequest:
    def __init__(self, result, sink=None, kwargs=None):
        self.result, self.sink, self.kwargs = result, sink, kwargs

    def execute(self):
        if self.sink is not None:
            self.sink.append(self.kwargs)
        return self.result


class FakeGmail:
    """Just enough of the Gmail client for get/attachments/send."""
    def __init__(self, detail=None, attachment_data=None):
        self.detail, self.attachment_data, self.sent = detail, attachment_data, []

    def users(self):
        return self

    def messages(self):
        return self

    def attachments(self):
        return self

    def get(self, **kwargs):
        if "messageId" in kwargs:
            return FakeRequest({"data": self.attachment_data})
        return FakeRequest(self.detail)

    def send(self, **kwargs):
        return FakeRequest({"id": "sent-1", "threadId": "t-1"}, self.sent, kwargs)


def adapter(fake):
    instance = object.__new__(gmail.GmailAdapter)
    instance.gmail = fake
    return instance


MESSAGE = {
    "id": "m-1",
    "payload": {"mimeType": "multipart/mixed", "parts": [
        {"mimeType": "text/plain", "body": {"data": b64url(b"Hello")}},
        {"mimeType": "application/pdf", "filename": "report.pdf", "body": {"attachmentId": "att-big", "size": 9}},
        {"mimeType": "text/csv", "filename": "small.csv", "body": {"data": b64url(b"a,b\n1,2\n"), "size": 8}},
    ]},
}


def test_attachment_index_matches_listed_attachments_and_downloads_both_kinds():
    _plain, _html, listed = gmail._extract_parts(MESSAGE["payload"])
    assert [item["filename"] for item in listed] == ["report.pdf", "small.csv"]
    fake = FakeGmail(MESSAGE, attachment_data=b64url(b"%PDF-1.7"))
    pdf = adapter(fake).get_attachment("m-1", 0)
    assert pdf == {"filename": "report.pdf", "mimeType": "application/pdf", "content": b"%PDF-1.7"}
    assert adapter(fake).get_attachment("m-1", 1)["content"] == b"a,b\n1,2\n"


def test_download_route_always_forces_a_download(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(gmail.GmailAdapter, "__init__", lambda self, tokens: None)
    monkeypatch.setattr(gmail.GmailAdapter, "get_attachment", lambda self, message_id, index: {"filename": "Quarterly “plan”.html", "mimeType": "text/html", "content": b"<script>x</script>"})
    response = client.get("/api/v1/emails/m-1/attachments/0")
    assert response.status_code == 200
    assert response.content == b"<script>x</script>"
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "filename*=UTF-8''Quarterly%20%E2%80%9Cplan%E2%80%9D.html" in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"
    monkeypatch.setattr(gmail.GmailAdapter, "get_attachment", lambda self, message_id, index: (_ for _ in ()).throw(gmail.MessageNotFound()))
    assert client.get("/api/v1/emails/m-1/attachments/7").status_code == 404


def test_send_attaches_files_and_uploads_as_media():
    fake = FakeGmail()
    payload = outgoing(attachments=[{"filename": "notes.txt", "mimeType": "text/plain", "dataBase64": b64(b"remember the milk")}])
    assert adapter(fake).send_message(payload) == {"providerMessageId": "sent-1", "threadId": "t-1"}
    call = fake.sent[0]
    assert "raw" not in call["body"]
    media = call["media_body"]
    message = message_from_bytes(media.getbytes(0, media.size()), policy=policy.default)
    files = list(message.iter_attachments())
    assert [part.get_filename() for part in files] == ["notes.txt"]
    assert files[0].get_content() == "remember the milk"
    assert message.get_body(("plain",)).get_content().strip() == "Hi Bob"


def test_send_without_files_still_uses_a_raw_message():
    fake = FakeGmail()
    adapter(fake).send_message(outgoing())
    assert "raw" in fake.sent[0]["body"] and "media_body" not in fake.sent[0]


def test_send_request_validates_attachments(client, monkeypatch):
    login_csrf(client)
    sent = []
    monkeypatch.setattr(gmail.GmailAdapter, "__init__", lambda self, tokens: None)
    monkeypatch.setattr(gmail.GmailAdapter, "send_message", lambda self, payload: sent.append(payload) or {"providerMessageId": "s", "threadId": "t"})
    good = {"filename": "a.txt", "mimeType": "text/plain", "dataBase64": b64(b"hi")}
    bad_cases = [
        {**good, "filename": "../evil.txt"},
        {**good, "mimeType": "not a type"},
        {**good, "dataBase64": "!!!not-base64!!!"},
        {**good, "dataBase64": b64(b"x" * (25 * 1024 * 1024 + 1))},
    ]
    for number, attachment in enumerate(bad_cases):
        response = client.post("/api/v1/emails/send", json=outgoing(attachments=[attachment], idempotencyKey=f"attachment-bad-{number:04d}"))
        assert response.status_code == 422, attachment["filename"]
    response = client.post("/api/v1/emails/send", json=outgoing(attachments=[good], idempotencyKey="attachment-good-0001"))
    assert response.status_code == 200 and response.json()["status"] == "sent"
    assert sent[0]["attachments"] == [good]
