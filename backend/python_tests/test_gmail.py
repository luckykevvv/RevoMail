import base64
from unittest.mock import MagicMock

import pytest

from backend.app.services.gmail import GmailAdapter, MessageNotFound, ProviderTimeout, _sanitise_html, normalise_message


def test_email_html_removes_executable_content():
    cleaned = _sanitise_html('<p>Hello</p><script>alert(1)</script><img src="https://tracker.example/pixel">')
    assert "script" not in cleaned
    assert "alert(1)" not in cleaned
    assert "Hello" in cleaned
    assert "tracker.example" not in cleaned


def test_message_payload_is_normalised_without_remote_content():
    encoded_plain = base64.urlsafe_b64encode(b"Plain body").decode("ascii")
    encoded_html = base64.urlsafe_b64encode(b'<p>Formatted</p><a href="javascript:alert(1)">bad</a>').decode("ascii")
    message = normalise_message({
        "id": "gmail-1", "threadId": "thread-1", "historyId": "12", "internalDate": "1700000000000",
        "labelIds": ["INBOX", "UNREAD", "STARRED", "CATEGORY_UPDATES"], "snippet": "Preview",
        "payload": {"mimeType": "multipart/mixed", "headers": [
            {"name": "From", "value": "Sender <sender@example.com>"}, {"name": "To", "value": "user@example.com"},
            {"name": "Subject", "value": "Update"}, {"name": "Message-ID", "value": "<message@example.com>"},
        ], "parts": [
            {"mimeType": "multipart/alternative", "parts": [
                {"mimeType": "text/plain", "body": {"data": encoded_plain}},
                {"mimeType": "text/html", "body": {"data": encoded_html}},
            ]},
            {"mimeType": "application/pdf", "filename": "brief.pdf", "body": {"attachmentId": "a1", "size": 42}},
        ]},
    })
    assert message["bodyText"] == "Plain body"
    assert "Formatted" in message["bodyHtmlSafe"]
    assert "javascript:" not in message["bodyHtmlSafe"]
    assert message["attachments"] == [{"id": "a1", "filename": "brief.pdf", "mimeType": "application/pdf", "size": 42}]
    assert message["unread"] is True and message["starred"] is True


def _history_adapter(monkeypatch, result, messages):
    adapter = object.__new__(GmailAdapter)
    adapter.gmail = MagicMock()
    monkeypatch.setattr(adapter, "_execute", lambda _request, **_kwargs: result)

    def get_message(message_id):
        value = messages[message_id]
        if isinstance(value, Exception):
            raise value
        return dict(value)

    monkeypatch.setattr(adapter, "get_message", get_message)
    return adapter


def test_history_keeps_only_messages_that_remain_in_the_inbox(monkeypatch):
    result = {
        "history": [{
            "labelsRemoved": [{"message": {"id": "archived"}}],
            "messagesAdded": [
                {"message": {"id": "incoming"}},
                {"message": {"id": "sent"}},
            ],
        }],
        "historyId": "22",
    }
    adapter = _history_adapter(monkeypatch, result, {
        "archived": {"id": "archived", "_inInbox": False},
        "incoming": {"id": "incoming", "_inInbox": True},
        "sent": {"id": "sent", "_inInbox": False},
    })

    page = adapter.list_history("21")

    assert page["items"] == [{"id": "incoming"}]
    assert page["deletedIds"] == ["archived", "sent"]


def test_history_deletes_only_explicitly_missing_messages(monkeypatch):
    result = {"history": [{"labelsAdded": [{"message": {"id": "missing"}}]}], "historyId": "23"}
    adapter = _history_adapter(monkeypatch, result, {"missing": MessageNotFound()})

    page = adapter.list_history("22")

    assert page["items"] == []
    assert page["deletedIds"] == ["missing"]


def test_history_propagates_retryable_message_read_failures(monkeypatch):
    result = {"history": [{"labelsAdded": [{"message": {"id": "delayed"}}]}], "historyId": "24"}
    adapter = _history_adapter(monkeypatch, result, {"delayed": ProviderTimeout()})

    with pytest.raises(ProviderTimeout):
        adapter.list_history("23")
