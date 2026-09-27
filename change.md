# Show read/unread state and mark emails read in Gmail

Date: 2026-09-27

## Task Scope

Every retrieved email shows whether it is read or unread, and opening an email in RevoMail marks it read in Gmail as well.

## Changes

- `backend/app/routers/auth.py`: the Google scope `gmail.readonly` is replaced by `gmail.modify`, which includes read access plus label changes (no permanent delete). `backend/python_tests/test_api.py` was updated for the new scope.
- `backend/app/services/gmail.py`: new `mark_read()` removes the `UNREAD` label through `users.messages.modify`. Unread state on retrieval was already returned from Gmail's labels (`unread` in the list and single-message responses).
- `backend/app/routers/emails.py`: new `POST /api/v1/emails/{message_id}/read`. A 403 from Google returns `403 INSUFFICIENT_PERMISSIONS` with a "reconnect in Settings" message; any other provider failure returns the standard `502 EMAIL_PROVIDER_FAILED`. No provider text is exposed.
- `src/mailbox-state.js`: new `setMessageUnread()`.
- `src/main.js`: opening an unread email now marks the row read in the inbox list (previously only a copy of the message was changed, so the row became unread again on return, and the sidebar count did not drop) and calls the new endpoint in the background. If the call fails the row is restored to unread; the permission explanation is shown once per session. Rows carry a `read`/`unread` class and screen-reader text. Already-read emails and re-opens make no call.
- `src/style.css`: unread rows keep the tinted background, blue dot and bold text; read rows are muted with normal weight; added `.sr-only`.
- Tests: `backend/python_tests/test_gmail_read_state.py` (new, 2), 4 route tests appended to `backend/python_tests/test_api.py`, and 2 tests appended to `src/mailbox-state.test.js`.
- Docs: `docs/api/v1-contracts.md` (new "Read state" section) and `README.md` (scope note).
- Archived the previous task record as `change/change-17.md`.

## Reason

Gmail read state could not be written with the read-only scope, so a new permission was required. The optimistic update-then-revert keeps the interface responsive while never leaving the UI in a state Gmail did not accept.

## Key Commands

- `pip install` of the pinned `backend/requirements.txt` packages in a throwaway directory outside the repository, then `python -m pytest`.
- `node --test` against a minimal stand-in for the `vitest` API, and `node --check` on `src/main.js`.
- Vite dev server with a mock `/api/v1` and headless Chromium (Playwright), driving the real `src/` files.

## Validation

- Python: all 43 tests passed (Python 3.10 in the throwaway environment; the project targets 3.11+). Gmail is faked in every test.
- JavaScript: the 8 tests in `src/mailbox-state.test.js` passed under the vitest stand-in, not real vitest.
- Browser (mock API): opening an unread email turned its row to read and dropped the sidebar count from 14 to 13 with exactly one POST; re-opening it and opening an already-read email made no call; a 403 response restored the row to unread and showed the permission message once, and a second 403 restored the row silently. A screenshot showed the unread row bold with a tinted background and dot, and read rows muted.

## Known Issues and Remaining Work

- Not verified against real Gmail. The existing connected account holds a read-only token, so the first open will fail with the reconnect message until the user chooses Reconnect in Settings and approves the new permission. If Google's consent screen is in testing mode and rejects the scope, add `gmail.modify` to the OAuth consent screen's scopes in Google Cloud Console.
- Not run: `npm test`, `npm run build`, or the Electron window. Rebuild with `npm run build` and restart the server.
- The sidebar unread number counts the loaded page of messages, not the total unread count in Gmail.
- Marking a message unread again, and starring, are not synced to Gmail (starring is still local only).
- Unescaped sender/subject/preview HTML in the inbox rows (recorded in the previous task) is still unfixed.
