# Send replies and new emails from RevoMail and show real Sent mail

Date: 2026-10-04

## Task Scope

Joel asked for emails to be sent from RevoMail to the correct person when replying, and for sent emails to appear in the Sent tab. (He also removed the earlier threaded-conversation change and asked for the code to be checked for unnecessary leftovers; the thread view was not re-added.)

## Root Cause

- The "Send" buttons only switched the view and showed a toast; nothing was ever sent.
- The reply screen showed a hard-coded recipient ("Prof. Smith <smith@university.edu>") and subject ("Re: Project Meeting Tomorrow") regardless of the open email, and fell back to three canned demo replies if the AI draft was empty.
- The Sent tab was a static placeholder, and the Gmail listing was hard-wired to the INBOX label.

## Changes

- `backend/app/services/gmail.py`: `list_messages` takes an allow-listed `label` (INBOX or SENT). New `send_message`, `build_mime`, `parse_recipients`, `reply_recipients`, `reply_subject`. A reply's recipient is derived server-side from the original message (Reply-To, else From; the original To for a message you sent), and the reply keeps the Gmail thread (`threadId`, `In-Reply-To`, `References`). Recipients are validated and header injection is rejected. `get_message` now also returns `reply_to`.
- `backend/app/routers/emails.py`: `GET /emails?label=`, new `POST /emails/send` (requires `confirmed: true`; idempotent; maps Gmail failures to stable error codes; unknown outcomes are never auto-retried). `backend/app/contracts.py`: `SendEmailRequest`.
- `backend/app/idempotency.py` (new, uses the existing `IdempotencyKey` table) and `backend/app/audit.py` (new, uses the existing `AuditRecord` table), wired into `backend/app/main.py`. No migration needed. Neither stores message content.
- `src/main.js`: reply view uses the open email's real `reply_to` and `Re: <subject>`; the canned demo replies were removed; typed text is kept in state (it was being wiped by re-renders, including the compose "Write with AI" button). "Send" is now "Review & send", which opens a confirmation dialog showing To, Subject and body; "Send now" calls the API, is disabled while sending, keeps the dialog open with the error on failure, and reuses the same idempotency key when retried. Compose is wired through the same flow. The Sent tab loads real Gmail Sent mail (refresh, load more); sent messages open in the reading view and Back returns to Sent. While in these functions I also escaped sender, subject and preview in inbox rows, the subject in the reading view, and the search box value (previously unescaped HTML from email headers).
- `src/mailbox-state.js`: `replySubject`, `outgoingProblem`. `src/style.css`: send dialog styles.
- Tests: `backend/python_tests/test_send_email.py` (new), one lambda signature updated in `backend/python_tests/test_api.py`, new cases in `src/mailbox-state.test.js`. Docs: `docs/api/v1-contracts.md`, `README.md`, `todo.md`.

## Key Commands

- `python -m pytest` and `node --test src/mailbox-state.test.js` in a throwaway Linux copy of the repository (outside the project), with Vite and headless Chromium against a mocked API for the UI flow.

## Validation

- Python: 72 tests passed (Python 3.10 in the throwaway environment; project targets 3.11+), including new tests for recipient selection, threading headers, header-injection rejection, confirmation requirement, idempotent replay, key reuse, unknown-outcome locking, permission errors, label validation and that message content is not stored in the database.
- JS: 11 tests passed with a minimal stand-in for Vitest (not the real runner).
- Headless-browser run against a mock API: reply shows the real sender and subject, dialog shows the final recipient/subject/body, nothing is sent before confirming, cancel keeps the draft, a failed send can be retried with the same idempotency key, Sent tab lists the sent message with its recipient, compose fields survive re-renders, and hostile sender/subject text is not rendered as HTML.

## Known Issues and Remaining Work

- Not verified against a real Gmail account: no network to Google from the build environment. First real send should be to an address Joel controls.
- A Google account connected before `gmail.send` was requested returns `403 INSUFFICIENT_PERMISSIONS` ("Reconnect your Google account in Settings") until reconnected.
- Replies are plain text and reply-to-sender only (no Reply all, Forward, attachments, Cc/Bcc); those buttons are still non-functional.
- Reply recipient and subject are shown but not editable; only the body is editable.
- Drafts and Starred tabs are still placeholders; the Sent view does not apply the search box.
- Not run: `npm test` (real Vitest), `npm run build`. The frontend must be rebuilt (`npm run build`) and the backend restarted to pick up these changes.
