import base64

from backend.app.services.gmail import _sanitise_html, normalise_message


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
