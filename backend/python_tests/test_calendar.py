import json

import pytest

from backend.app.routers import calendar as calendar_router
from backend.app.services import ai, calendar
from backend.python_tests.test_api import authenticate, client  # noqa: F401  (fixture reuse)
from backend.python_tests.test_send_email import count_audit, http_error


# --- event body ---------------------------------------------------------------------

def test_timed_event_defaults_to_one_hour_in_the_given_time_zone():
    body = calendar.build_event_body("  Project   Meeting ", "2026-10-05T10:00", None, "Australia/Melbourne", location="Room 302")
    assert body == {
        "summary": "Project Meeting",
        "start": {"dateTime": "2026-10-05T10:00:00", "timeZone": "Australia/Melbourne"},
        "end": {"dateTime": "2026-10-05T11:00:00", "timeZone": "Australia/Melbourne"},
        "location": "Room 302",
    }


def test_explicit_end_and_description_are_used():
    body = calendar.build_event_body("T", "2026-10-05T10:00", "2026-10-05T12:30", "UTC", description="From an email")
    assert body["end"]["dateTime"] == "2026-10-05T12:30:00" and body["description"] == "From an email"


def test_all_day_event_uses_an_exclusive_end_date():
    single = calendar.build_event_body("Holiday", "2026-12-25", None, "UTC", all_day=True)
    assert single["start"] == {"date": "2026-12-25"} and single["end"] == {"date": "2026-12-26"}
    multi = calendar.build_event_body("Trip", "2026-12-30", "2027-01-02", "UTC", all_day=True)
    assert multi["end"] == {"date": "2027-01-03"}


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(title="  ", starts_at="2026-10-05T10:00", ends_at=None, time_zone="UTC"),
        dict(title="T", starts_at="2026-10-05T10:00", ends_at=None, time_zone="Not/AZone"),
        dict(title="T", starts_at="2026-10-05T10:00", ends_at=None, time_zone="../etc/passwd"),
        dict(title="T", starts_at="2026-10-05T10:00", ends_at=None, time_zone=""),
        dict(title="T", starts_at="2026-10-05", ends_at=None, time_zone="UTC"),
        dict(title="T", starts_at="2026-10-05T10:00+10:00", ends_at=None, time_zone="UTC"),
        dict(title="T", starts_at="2026-02-30T10:00", ends_at=None, time_zone="UTC"),
        dict(title="T", starts_at="2026-10-05T25:00", ends_at=None, time_zone="UTC"),
        dict(title="T", starts_at="2026-10-05T10:00", ends_at="2026-10-05T09:00", time_zone="UTC"),
        dict(title="T", starts_at="2026-10-05T10:00", ends_at="2026-10-05T10:00", time_zone="UTC"),
        dict(title="T", starts_at="2026-10-05T10:00", ends_at=None, time_zone="UTC", all_day=True),
        dict(title="T", starts_at="2026-10-05", ends_at="2026-10-04", time_zone="UTC", all_day=True),
    ],
)
def test_invalid_events_are_rejected(kwargs):
    with pytest.raises(calendar.EventValidationError):
        calendar.build_event_body(kwargs.pop("title"), kwargs.pop("starts_at"), kwargs.pop("ends_at"), kwargs.pop("time_zone"), **kwargs)


class FakeInsert:
    def __init__(self, sink):
        self.sink = sink

    def events(self):
        return self

    def insert(self, **kwargs):
        self.sink.append(kwargs)
        return self

    def execute(self):
        return {"id": "evt-1", "htmlLink": "https://calendar.google.com/event?eid=abc"}


def test_create_event_inserts_into_the_primary_calendar(monkeypatch):
    calls = []
    monkeypatch.setattr(calendar, "_build_calendar", lambda _t: FakeInsert(calls))
    result = calendar.create_event({}, "Meeting", "2026-10-05T10:00", None, "UTC")
    assert result == {"id": "evt-1", "html_link": "https://calendar.google.com/event?eid=abc"}
    assert calls[0]["calendarId"] == "primary" and calls[0]["body"]["summary"] == "Meeting"


def test_create_event_validates_before_calling_google(monkeypatch):
    monkeypatch.setattr(calendar, "_build_calendar", lambda _t: pytest.fail("Google must not be called"))
    with pytest.raises(calendar.EventValidationError):
        calendar.create_event({}, "", "2026-10-05T10:00", None, "UTC")


# --- extraction ------------------------------------------------------------------------

def run_extract(monkeypatch, payload, email_date="Mon, 28 Sep 2026 09:00:00 +1000"):
    seen = {}

    def fake_chat(system, user, **_kw):
        seen["user"] = user
        return payload if isinstance(payload, str) else json.dumps(payload)

    monkeypatch.setattr(ai, "_chat", fake_chat)
    return ai.extract("Subject", "a@example.com", "Body", email_date), seen


def test_extract_keeps_valid_start_and_end_and_sends_email_date(monkeypatch):
    result, seen = run_extract(monkeypatch, {"events": [{"title": "Meeting", "start": "2026-10-05T10:00", "end": "2026-10-05T11:00"}]})
    assert result["events"][0]["start"] == "2026-10-05T10:00" and result["events"][0]["end"] == "2026-10-05T11:00"
    assert result["events"][0]["all_day"] is False
    assert "Email sent: Mon, 28 Sep 2026 09:00:00 +1000" in seen["user"]


def test_extract_all_day_event_has_no_end_time(monkeypatch):
    result, _ = run_extract(monkeypatch, {"events": [{"title": "Holiday", "start": "2026-12-25", "end": "2026-12-25T10:00"}]})
    event = result["events"][0]
    assert event["start"] == "2026-12-25" and event["end"] is None and event["all_day"] is True


@pytest.mark.parametrize("bad", ["tomorrow", "2026-13-01T10:00", "2026-10-05T25:61", "2026-10-05 10:00", 12345, None, ""])
def test_extract_drops_unusable_start_values(monkeypatch, bad):
    result, _ = run_extract(monkeypatch, {"events": [{"title": "Meeting", "date": "tomorrow", "start": bad, "end": bad}]})
    event = result["events"][0]
    assert event["start"] is None and event["end"] is None and event["all_day"] is False
    assert event["date"] == "tomorrow"  # the original text is preserved for display


def test_extract_ignores_non_object_events_and_unreadable_replies(monkeypatch):
    result, _ = run_extract(monkeypatch, {"events": ["junk", {"title": "Ok", "start": "2026-10-05T10:00"}], "tasks": []})
    assert [e["title"] for e in result["events"]] == ["Ok"]
    result, _ = run_extract(monkeypatch, "not json at all")
    assert result["events"] == [] and result["raw"] == "not json at all"


# --- route -----------------------------------------------------------------------------

def body(**overrides):
    payload = {
        "title": "Project Meeting",
        "startsAt": "2026-10-05T10:00",
        "endsAt": None,
        "timezone": "Australia/Melbourne",
        "location": "Room 302",
        "confirmed": True,
        "idempotencyKey": "cal-key-0001-abc",
    }
    payload.update(overrides)
    return payload


def test_calendar_requires_authentication(client):
    assert client.post("/api/v1/calendar/events", json=body()).status_code == 401


def test_calendar_requires_explicit_confirmation(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(calendar_router.calendar_service, "create_event", lambda *a: pytest.fail("must not be called"))
    response = client.post("/api/v1/calendar/events", json=body(confirmed=False))
    assert response.status_code == 400 and response.json()["error"]["code"] == "CONFIRMATION_REQUIRED"


def test_calendar_create_is_idempotent_and_audited(client, monkeypatch):
    authenticate(client)
    calls = []

    def fake_create(tokens, title, starts, ends, tz, all_day, location, description):
        calls.append((title, starts, ends, tz, all_day, location))
        return {"id": "evt-1", "html_link": "https://calendar.google.com/event?eid=abc"}

    monkeypatch.setattr(calendar_router.calendar_service, "create_event", fake_create)
    first = client.post("/api/v1/calendar/events", json=body())
    again = client.post("/api/v1/calendar/events", json=body())
    assert first.status_code == 200
    assert first.json() == {"id": "evt-1", "htmlLink": "https://calendar.google.com/event?eid=abc", "created": True, "replayed": False}
    assert again.json()["replayed"] is True and again.json()["id"] == "evt-1"
    assert calls == [("Project Meeting", "2026-10-05T10:00", None, "Australia/Melbourne", False, "Room 302")]
    assert count_audit(client, "SUCCEEDED") == 1
    changed = client.post("/api/v1/calendar/events", json=body(title="Different"))
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert len(calls) == 1


def test_calendar_invalid_time_zone_is_rejected(client):
    authenticate(client)
    first = client.post("/api/v1/calendar/events", json=body(timezone="Nope/Zone"))
    assert first.status_code == 422 and first.json()["error"]["code"] == "INVALID_EVENT"


def test_calendar_validation_failure_releases_the_key(client, monkeypatch):
    authenticate(client)
    outcomes = [calendar.EventValidationError("Enter a valid date."), {"id": "e", "html_link": "l"}]

    def fake_create(*_a):
        outcome = outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(calendar_router.calendar_service, "create_event", fake_create)
    assert client.post("/api/v1/calendar/events", json=body()).status_code == 422
    assert client.post("/api/v1/calendar/events", json=body()).status_code == 200


def test_calendar_permission_error_asks_to_reconnect(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(calendar_router.calendar_service, "create_event", lambda *a: (_ for _ in ()).throw(http_error(403)))
    response = client.post("/api/v1/calendar/events", json=body())
    assert response.status_code == 403 and response.json()["error"]["code"] == "INSUFFICIENT_PERMISSIONS"
    assert "Calendar" in response.json()["error"]["message"]


def google_403(reason_block):
    return http_error(403, json.dumps({"error": {"code": 403, "message": "project 123456 detail", **reason_block}}).encode())


def test_calendar_api_not_enabled_is_reported_distinctly(client, monkeypatch):
    authenticate(client)
    blocks = [
        {"errors": [{"reason": "accessNotConfigured", "domain": "usageLimits"}]},
        {"status": "PERMISSION_DENIED", "details": [{"@type": "x", "reason": "SERVICE_DISABLED"}]},
    ]
    for index, block in enumerate(blocks):
        monkeypatch.setattr(calendar_router.calendar_service, "create_event", lambda *a, b=block: (_ for _ in ()).throw(google_403(b)))
        response = client.post("/api/v1/calendar/events", json=body(idempotencyKey=f"cal-key-api-{index}-abc"))
        error = response.json()["error"]
        assert response.status_code == 403 and error["code"] == "GOOGLE_API_NOT_ENABLED"
        assert "Google Calendar API is not enabled" in error["message"] and "calendar-json.googleapis.com" in error["message"]
        assert "123456" not in response.text  # Google's own message (with the project number) is not passed on


def test_calendar_insufficient_scope_still_asks_to_reconnect(client, monkeypatch):
    authenticate(client)
    block = {"errors": [{"reason": "insufficientPermissions"}], "status": "PERMISSION_DENIED"}
    monkeypatch.setattr(calendar_router.calendar_service, "create_event", lambda *a: (_ for _ in ()).throw(google_403(block)))
    response = client.post("/api/v1/calendar/events", json=body())
    assert response.status_code == 403 and response.json()["error"]["code"] == "INSUFFICIENT_PERMISSIONS"
    assert "tick the Calendar permission" in response.json()["error"]["message"]


def test_google_error_reasons_ignores_unreadable_bodies():
    from backend.app.once import google_error_reasons

    assert google_error_reasons(http_error(403, b"<html>nope</html>")) == set()
    assert google_error_reasons(http_error(403, b'{"error": "string"}')) == set()
    assert google_error_reasons(http_error(403, b'{"error": {"errors": [{"reason": "rateLimitExceeded"}]}}')) == {"rateLimitExceeded"}


def test_calendar_ambiguous_failure_blocks_automatic_retry(client, monkeypatch):
    authenticate(client)
    calls = []

    def fake_create(*_a):
        calls.append(1)
        raise TimeoutError("socket detail that must not leak")

    monkeypatch.setattr(calendar_router.calendar_service, "create_event", fake_create)
    first = client.post("/api/v1/calendar/events", json=body())
    assert first.status_code == 502 and first.json()["error"]["code"] == "CALENDAR_OUTCOME_UNKNOWN"
    assert "socket detail" not in first.text
    second = client.post("/api/v1/calendar/events", json=body())
    assert second.status_code == 409 and second.json()["error"]["code"] == "CALENDAR_OUTCOME_UNKNOWN"
    assert len(calls) == 1


def test_calendar_event_details_are_not_stored(client, monkeypatch):
    authenticate(client)
    monkeypatch.setattr(calendar_router.calendar_service, "create_event", lambda *a: {"id": "evt-1", "html_link": "l"})
    client.post("/api/v1/calendar/events", json=body(title="Secret negotiation", location="Private address 12"))
    data = client.app.state.database.path.read_bytes()
    assert b"Secret negotiation" not in data and b"Private address 12" not in data


def test_calendar_rejects_oversized_fields(client):
    authenticate(client)
    assert client.post("/api/v1/calendar/events", json=body(title="x" * 301)).status_code == 422
    assert client.post("/api/v1/calendar/events", json=body(idempotencyKey="short")).status_code == 422


def test_time_zone_database_is_available_for_common_zones():
    # Windows has no OS time zone database; the pinned `tzdata` package supplies one. If this fails, run
    # `pip install -r backend/requirements.txt` (valid zones such as Australia/Sydney would otherwise be rejected).
    for name in ("Australia/Sydney", "Australia/Melbourne", "America/New_York", "Europe/London", "UTC"):
        calendar.build_event_body("T", "2026-10-05T10:00", None, name)
