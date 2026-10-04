"""
Google Calendar service — creates events on the user's primary calendar.

Only creation is supported. Times arrive as local wall-clock strings plus an IANA time zone, so the
event lands at the time the user confirmed regardless of the server's own time zone.
"""

import re
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from googleapiclient.discovery import build

from backend.app.services.google_credentials import build_credentials

DEFAULT_DURATION = timedelta(hours=1)
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$")


class EventValidationError(ValueError):
    """The event cannot be created as requested."""


def _build_calendar(tokens: dict) -> Any:
    return build("calendar", "v3", credentials=build_credentials(tokens))


def _parse_date(value: str) -> date:
    if not _DATE_RE.match(value or ""):
        raise EventValidationError("Enter a valid date.")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise EventValidationError("Enter a valid date.") from exc


def _parse_datetime(value: str) -> datetime:
    if not _DATETIME_RE.match(value or ""):
        raise EventValidationError("Enter a valid date and start time.")
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise EventValidationError("Enter a valid date and start time.") from exc


def build_event_body(
    title: str,
    starts_at: str,
    ends_at: str | None,
    time_zone: str,
    all_day: bool = False,
    location: str = "",
    description: str = "",
) -> dict:
    """Validate the request and build the Google Calendar event resource."""
    title = " ".join((title or "").split())
    if not title:
        raise EventValidationError("Enter a title for the event.")
    try:
        ZoneInfo(time_zone)
    except Exception as exc:  # unknown key, empty string, path-like values…
        raise EventValidationError("The time zone is not valid.") from exc

    body: dict = {"summary": title[:300]}
    if all_day:
        first = _parse_date(starts_at)
        last = _parse_date(ends_at) if ends_at else first
        if last < first:
            raise EventValidationError("The end date must not be before the start date.")
        # Google's all-day end date is exclusive.
        body["start"] = {"date": first.isoformat()}
        body["end"] = {"date": (last + timedelta(days=1)).isoformat()}
    else:
        start = _parse_datetime(starts_at)
        end = _parse_datetime(ends_at) if ends_at else start + DEFAULT_DURATION
        if end <= start:
            raise EventValidationError("The end time must be after the start time.")
        body["start"] = {"dateTime": start.isoformat(timespec="seconds"), "timeZone": time_zone}
        body["end"] = {"dateTime": end.isoformat(timespec="seconds"), "timeZone": time_zone}
    if location.strip():
        body["location"] = " ".join(location.split())[:500]
    if description.strip():
        body["description"] = description.strip()[:2000]
    return body


def create_event(
    tokens: dict,
    title: str,
    starts_at: str,
    ends_at: str | None,
    time_zone: str,
    all_day: bool = False,
    location: str = "",
    description: str = "",
) -> dict:
    """Create an event on the primary calendar. Requires the calendar scope."""
    body = build_event_body(title, starts_at, ends_at, time_zone, all_day, location, description)
    created = _build_calendar(tokens).events().insert(calendarId="primary", body=body).execute()
    return {"id": created.get("id"), "html_link": created.get("htmlLink")}
