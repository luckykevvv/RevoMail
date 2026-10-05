# Add extracted events to Google Calendar

Date: 2026-10-04

## Task Scope

Joel asked that an event extracted from an email can be added to Google Calendar from a button, creating a real calendar event.

## Changes

- `backend/app/services/calendar.py` (new): validates and builds a Google Calendar event (title, IANA time zone, local start/end, all-day with Google's exclusive end date, 1-hour default, end after start) and inserts it on the primary calendar. `backend/app/routers/calendar.py` (new): `POST /api/v1/calendar/events`, which requires `confirmed: true` and an idempotency key. Registered in `backend/app/main.py`; the reserved `CalendarMutationRequest` in `backend/app/contracts.py` was filled in. No new Google scope was needed (`calendar` was already requested) and no migration.
- `backend/app/once.py` (new): the "do this at most once and audit it" logic that the email-send route had inline (idempotency check, replay, duplicate/in-progress/unknown-outcome handling, Gmail/Google error mapping, audit record) is now shared. `backend/app/routers/emails.py` was refactored to use it with unchanged behaviour and error codes; the existing email-send tests pass unchanged. `backend/app/services/google_credentials.py` (new) holds the credential building that `gmail.py` previously did inline.
- `backend/app/services/ai.py`, `backend/app/routers/ai.py`: extraction now receives the email's sent date and returns each event's `start`, `end` and `all_day` in addition to the original text fields. Values are only kept when they are real dates in the expected format; the prompt says to use null when unsure and treats the email as untrusted. The extraction JSON is otherwise unchanged.
- `src/main.js`, `src/mailbox-state.js`, `src/style.css`: each extracted event in "Key details" gets an "Add to Google Calendar" button. It opens a dialog pre-filled from the extraction (title, date, start/end, all day, location, shows the time zone) that the user can edit; nothing is created until "Add to calendar" is pressed. Missing date or start time is flagged in the dialog instead of guessed. A failed attempt keeps the dialog open and a retry reuses the same idempotency key, so a lost response cannot create a duplicate. After success the event shows "Added to Google Calendar" with an Open link, and that state survives re-running the extraction on the same email (events are matched by content, not list position). The time zone is the browser's.
- Tests: `backend/python_tests/test_calendar.py` (new, 36 cases), plus new cases in `src/mailbox-state.test.js`. Docs: `docs/api/v1-contracts.md`, `README.md`.

## Key Commands

- `python -m pytest` and `node --test src/mailbox-state.test.js` in a throwaway Linux copy of the repository (outside the project); Vite plus headless Chromium against a mocked API with the browser time zone set to Australia/Melbourne.

## Validation

- 121 backend tests passed (Python 3.10 in the throwaway environment; project targets 3.11+), covering event building and validation, extraction normalisation, confirmation requirement, idempotent replay, key reuse, validation failures releasing the key, 403 mapping, unknown-outcome locking, and that event details are not stored in the database.
- 16 JS tests passed with a minimal stand-in for Vitest (not the real runner).
- Headless-browser run against a mock API passed: one button per event, dialog pre-fill, cancel creates nothing, failed attempt then retry with the same key, edited values and the browser's time zone in the payload, all-day events, an event with no resolvable date blocked until the user supplies it, "Added" state persisting, and hostile event titles shown as text.

## Known Issues and Remaining Work

- Not run against real Google Calendar or OpenAI (no network from the build environment). How reliably the AI resolves "tomorrow" or "next Friday" from real emails is unverified, which is why the dialog always shows the values for the user to check.
- Timed events are single-day: an extracted event that ends on a later date is pre-filled with no end time (1 hour by default). Events have no attendees, reminders or recurrence. The user's primary calendar is always used.
- The time zone comes from the browser, not from the email, so an event stated in another zone needs its time adjusted in the dialog.
- Accounts connected before the `calendar` scope was requested get "Reconnect your Google account in Settings" (403) until reconnected.
- The demo "Tasks & events" page (static sample data) still has its old fake "Add to calendar" button; it is unrelated to extracted events.
- Not run: `npm test`, `npm run build`. Rebuild and restart the backend to pick up the changes.
