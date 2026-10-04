# Tell apart the two causes of a Google 403 when adding a calendar event (or sending mail)

Date: 2026-10-04

## Task Scope

After the time zone fix, Joel's Add-event dialog showed "RevoMail needs permission to use Google Calendar. Reconnect your Google account in Settings." Google answered the calendar request with HTTP 403.

## Root Cause

A 403 from Google has more than one cause and RevoMail reported all of them with the same message. The two likely ones here: (1) the signed-in Google session was not granted the Calendar permission (for example it was connected before Calendar was requested, or the Calendar box was left unticked on Google's consent screen; RevoMail accepts a token with fewer scopes than requested), or (2) the Google Calendar API is not switched on in RevoMail's Google Cloud project, which is a separate setting from the OAuth scopes. Which one applies to Joel could not be determined from here: the project's local database in the folder is an old copy for a different account.

## Changes

- `backend/app/once.py`: reads Google's machine-readable error reason (never its message text). `accessNotConfigured` / `SERVICE_DISABLED` now returns `403 GOOGLE_API_NOT_ENABLED` naming the API and the Cloud console page to enable it; other 403s keep `INSUFFICIENT_PERMISSIONS`. The reason codes and status are logged as a warning (`revomail.once`), without message text or content. Applies to both calendar creation and email sending.
- `backend/app/routers/calendar.py`, `backend/app/routers/emails.py`: API name and enable link added; the reconnect message now says to tick the Calendar / send-email permission on Google's consent screen.
- `backend/python_tests/test_calendar.py`, `backend/python_tests/test_send_email.py`: tests for both reasons, unreadable error bodies, and that Google's own message (which contains the project number) is not passed through.

## Validation

- 125 backend tests passed (Python 3.10 in the throwaway environment). Not run against real Google.

## Known Issues and Remaining Work

- Joel must retry: the dialog will now say either that the Calendar API is not enabled (enable it in Google Cloud, wait a minute, try again) or that the Calendar permission is missing (disconnect and reconnect the Google account in Settings and tick every permission box). The backend terminal also logs `reasons=[...]` for the failed call.
- Not run: `npm test`, `npm run build`. Restart the backend to pick up the change.
