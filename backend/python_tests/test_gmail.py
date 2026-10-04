from backend.app.services.gmail import _sanitise_html


def test_email_html_removes_executable_content():
    cleaned = _sanitise_html('<p>Hello</p><script>alert(1)</script><img src="https://tracker.example/pixel">')
    assert "script" not in cleaned
    assert "alert(1)" not in cleaned
    assert "Hello" in cleaned


class _Call:
    def __init__(self, result):
        self.result = result

    def execute(self):
        return self.result


class _FakeMessages:
    def __init__(self, details):
        self.details = details

    def list(self, **_kwargs):
        return _Call({"messages": [{"id": key} for key in self.details]})

    def get(self, id, **_kwargs):
        return _Call(self.details[id])


class _FakeGmail:
    def __init__(self, details):
        self._messages = _FakeMessages(details)

    def users(self):
        return self

    def messages(self):
        return self._messages


def _detail(message_id, internal_date):
    detail = {
        "id": message_id,
        "threadId": "t",
        "labelIds": ["INBOX"],
        "snippet": "hi",
        "payload": {"mimeType": "text/plain", "headers": [{"name": "Date", "value": "Mon, 28 Sep 2026 00:11:12 +1000"}], "body": {"data": ""}},
    }
    if internal_date is not None:
        detail["internalDate"] = internal_date
    return detail


def test_messages_carry_gmails_own_timestamp(monkeypatch):
    from backend.app.services import gmail

    details = {"a": _detail("a", "1790518272000"), "b": _detail("b", None), "c": _detail("c", "garbage")}
    monkeypatch.setattr(gmail, "_build_gmail", lambda _t: _FakeGmail(details))
    listed = {m["id"]: m for m in gmail.list_messages({})["messages"]}
    assert listed["a"]["internal_date"] == 1790518272000
    assert listed["b"]["internal_date"] is None and listed["c"]["internal_date"] is None
    assert listed["a"]["date"] == "Mon, 28 Sep 2026 00:11:12 +1000"  # the header is still returned
    assert gmail.get_message({}, "a")["internal_date"] == 1790518272000
