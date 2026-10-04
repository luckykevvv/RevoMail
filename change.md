# Show each email's real date and time in the viewer's local time zone

Date: 2026-10-04

## Task Scope

Joel asked for the date and time shown on emails to be correct for each email.

## Root Cause

The inbox rows and message view printed the sender's raw `Date` header (for example `Mon, 28 Sep 2026 00:11:12 +1000`) as text. That header is written by the sender, is in the sender's time zone, can be missing or malformed, and was not converted to the viewer's time. In the list it also wrapped onto two lines.

## Changes

- `backend/app/services/gmail.py`: list and single-message responses now include `internal_date`, Gmail's own timestamp for the message (milliseconds since the epoch, UTC; `null` if absent). The `date` header field is still returned and still used for event extraction.
- `src/mailbox-state.js`: `parseMailDate`, `formatMailTime` and `formatFullMailTime`. They accept Gmail's timestamp or a `Date` header and format in the viewer's local time zone: the time for today ("4:46 pm"), day and month for earlier this year ("28 Sept"), with the year for older mail ("12 Aug 2025"). The message view shows the full date and time ("Mon, 28 Sept 2026, 2:11 pm"), and each row's time has the full value as a hover tooltip and a machine-readable `datetime` attribute. An unreadable date shows its original text instead of nothing.
- `src/main.js`: rows (Inbox and Sent) and the message view use these; while in that code I also fixed the sender avatar initials for `Name <address>` senders (it showed a stray "<" for names without a second word).
- Tests: `backend/python_tests/test_gmail.py` (timestamp present, missing, garbage), and new date cases in `src/mailbox-state.test.js` (formats, time-zone conversion including the calendar day, fallbacks).

## Key Commands

- `python -m pytest` and `node --test src/mailbox-state.test.js` in the throwaway Linux copy outside the repository; Vite and headless Chromium against a mocked API with the browser set to Australia/Melbourne.

## Validation

- 126 backend tests and 22 JS tests passed (JS runs on a minimal Vitest stand-in, not the real runner).
- In the headless browser: a message from an hour ago shows a clock time; one from last year shows day, month and year; a header-only date with a -0400 offset was converted correctly to Melbourne time; an unreadable date shows its raw text; the message view shows the full local date and time.

## Known Issues and Remaining Work

- Gmail's own timestamp is when Gmail received (or, for sent mail, sent) the message, which can differ slightly from the time the sender's mail program wrote in the header; the full header is still returned by the API.
- Time labels follow the browser's locale and time zone; there is no setting to choose another zone.
- Not run: `npm test`, `npm run build`. Rebuild and restart the backend to pick up the changes.
