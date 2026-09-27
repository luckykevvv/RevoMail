from backend.app.services import gmail


class FakeModify:
    def __init__(self, sink, result):
        self.sink, self.result = sink, result

    def modify(self, **kwargs):
        self.sink.append(kwargs)
        return self

    def execute(self):
        return self.result


class FakeGmail:
    def __init__(self, sink, result):
        self._messages = FakeModify(sink, result)

    def users(self):
        return self

    def messages(self):
        return self._messages


def test_mark_read_removes_only_the_unread_label(monkeypatch):
    calls = []
    monkeypatch.setattr(gmail, "_build_gmail", lambda _tokens: FakeGmail(calls, {"id": "m1", "labelIds": ["INBOX"]}))
    assert gmail.mark_read({}, "m1") == {"id": "m1", "unread": False}
    assert calls == [{"userId": "me", "id": "m1", "body": {"removeLabelIds": ["UNREAD"]}}]


def test_mark_read_reports_unread_if_gmail_still_says_unread(monkeypatch):
    monkeypatch.setattr(gmail, "_build_gmail", lambda _tokens: FakeGmail([], {"id": "m1", "labelIds": ["INBOX", "UNREAD"]}))
    assert gmail.mark_read({}, "m1")["unread"] is True
