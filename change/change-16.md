# Implement Module 3 through the original Gmail API

Date: 2026-08-20
Updated: 2026-08-24

## Task Scope

Implement the Gmail-deliverable parts of GitHub Module 3 issue #3 while preserving the original `/api/v1/emails` public API. The current MVP is Gmail-only and temporarily single-user. Remove Microsoft OAuth/API configuration and Microsoft GUI paths; record multi-user and additional-provider work as future scope.

## Changes

- Added the Module 3 SQLite migration for encrypted cached message content, synchronization state, deduplicated provider message IDs, and required indexes.
- Added recoverable paginated Gmail full/history synchronization, history-expiry fallback, cached pagination/search, MIME and attachment parsing, safe HTML sanitization, unread/starred changes, and RFC 2822 sending.
- Extended the existing `/api/v1/emails` namespace with list/detail, `PATCH` state mutation, sync/status, and confirmed idempotent send routes. Removed the parallel account-scoped mailbox router so there is one public mailbox API.
- Selected the connected Google mailbox internally for the temporary single-user flow; public mailbox requests do not accept an account ID.
- Activated per-session CSRF validation for mailbox and account mutations and added confirmed-send request hashing, conflicts, rate limiting, sent/failed/unknown states, and content-free audits.
- Updated the frontend to use only `/api/v1/emails`, render sanitized HTML in a CSP-protected sandbox, support plain-text fallback, roll back failed optimistic state changes, and require a keyboard-accessible final send confirmation.
- Removed Microsoft sign-in controls, provider status, OAuth routes, adapters, environment variables, retained Node test fixtures, and active API/documentation references.
- Updated README, backend/API documentation, shared contracts, `todo.md`, environment examples, and tests. Archived the previous task as `change/change-15.md`.
- Commented on Module 1 Microsoft child issue #11 to record that Microsoft and multi-user/provider routing are deferred to a future dedicated module.
- Created future multi-user Module #62 and child issue #63, explicitly outside the current Gmail-only Module 3 scope.
- Fixed packaged Google sign-in for accounts with legacy Calendar/read/send grants by disabling incremental scope merging. Scope mismatches now return an actionable frontend status, and OAuth callback failures log only correlation ID and exception type.
- Restored the OAuth2 v2 discovery document required by the packaged callback's Google profile lookup. The pruning test now protects both Gmail v1 and OAuth2 v2 while continuing to remove unrelated Google discovery data.
- Stopped mailbox synchronization polling from clearing and rebuilding the entire UI every 700 milliseconds. Intermediate pages now update only synchronization state; the cache refreshes once at completion while preserving the current view, selected message, and loaded body.
- Published the implementation on `codex/module-3-gmail-mailbox`, linked commit `fc198df` from issue #20 with the remaining image/HTML-attachment gap, and opened draft PR #64 without closing partially completed issues.
- Corrected Gmail history processing so messages that no longer carry the `INBOX` label are removed from the local inbox cache, explicit message-level 404 responses are treated as deletions, and retryable timeouts, rate limits, and provider failures propagate to the recoverable job retry path instead of being misclassified as deletions.
- Added a default `Primary` main-inbox filter across cached, live-search, and frontend paths. It excludes `Social` and `Promotions` while retaining Primary, Updates, Forums, and other non-advertising inbox categories; `All` remains available for every synchronized INBOX message.
- Added regression coverage for archived/sent history events, explicit missing messages, retryable history-read failures, repository category filtering, and frontend Primary-category matching.

## Reason

The project currently needs one Gmail implementation and one stable mailbox contract. Introducing a second account-scoped API and retaining an unavailable Microsoft path added unnecessary routing and UI complexity for the single-user MVP.

## Key Commands

- `git status --short --branch`
- `git ls-files -v`
- repository file and reference searches with `git grep`, `Select-String`, and file listings
- `npm test`
- `npm run build`
- `npm run desktop:pack`
- `npx electron-builder --dir` after the sandboxed Electron runtime download was blocked
- `npm run desktop:smoke`
- Read-only inspection of the packaged desktop settings and non-secret OAuth database status
- Python OpenAPI/route inspection and health checks
- `git diff --check`
- `npm run test:python`
- `npm run test:js`
- `npm run build`
- `git switch -c codex/module-3-gmail-mailbox`
- explicit-path `git add`, `git commit`, and `git push`
- GitHub issue #20 comment and draft PR #64 creation

## Validation

- All 54 JavaScript tests passed.
- All 25 Python tests passed, covering Gmail payloads, MIME/HTML safety, synchronization, CSRF, message changes, confirmed sending, idempotency, timeout-to-unknown, rate limiting, and encrypted persistence.
- The Vite production build passed.
- OpenAPI route inspection confirmed `/api/v1/emails`, detail, send, sync, and sync-status routes and confirmed that no account-scoped mailbox or generic provider OAuth route is registered.
- The production FastAPI process started on `127.0.0.1:4173`; database health and the built frontend both returned HTTP 200.
- The Windows x64 Electron unpacked package built successfully under ignored `release/win-unpacked`. Its bundled backend passed the packaged service smoke test, returned healthy database status, exposed only Google provider availability, and produced a Google authorization redirect.
- OAuth regression coverage confirms authorization requests no longer opt into legacy granted-scope merging and that a residual scope mismatch produces the dedicated safe retry instruction. The final suite passed with 54 JavaScript and 27 Python tests before the package rebuild.
- The rebuilt standalone and Electron package were inspected and contain both `gmail.v1.json` and `oauth2.v2.json`; the packaged service smoke test passed after this callback dependency was restored.
- The synchronization refresh regression suite passed with 55 JavaScript and 27 Python tests. The Electron package was rebuilt again and its packaged service smoke test passed.
- The Gmail history and Primary-inbox correction suite passed with 56 JavaScript tests and 30 Python tests.
- The Vite production build passed after the Primary-inbox UI and filtering changes.
- `git diff --check` passed; Git reported only the repository's existing LF-to-CRLF working-copy warnings.

## Known Issues and Remaining Work

- Real Gmail callback, mailbox data, label changes, history synchronization, and sending were not exercised because no dedicated test-account browser session and test recipient were supplied. Fixture coverage is not real-provider validation.
- The rebuilt login path still requires the user to complete one real Google consent flow. If Google continues returning the old grant set, revoke RevoMail in the Google account's third-party access page and authorize again.
- A real browser walkthrough at desktop and 320-pixel widths, including screen-reader and dialog focus-return review, remains unverified in this terminal run.
- Microsoft and multi-user/additional-provider support are intentionally absent from the current implementation and require a future dedicated module and child issues.
- Module 3 issue #19 remains outside the Gmail-only implementation scope and must not be treated as completed.
- Issue #20 remains partially complete: remote/inline email images are blocked with no user-confirmed load action, and HTML file attachments are exposed only as metadata rather than rendered or opened. The current safe HTML body renderer must not be described as full image or HTML-attachment support.
