# Treat a lost encryption key as missing credentials, not a server error

Date: 2026-08-17

## Task Scope

Make the auto-generated server keys behave as decided for the desktop single-instance model: first startup generates and persists `SECRET_KEY` and `TOKEN_ENCRYPTION_KEY`; later startups reuse the file when present; when the key file is gone, previously stored encrypted credentials are treated as absent so the user re-authorizes instead of hitting a 500.

## Changes

- `backend/app/persistence.py` `AuthRepository.get_tokens()` now catches the `RuntimeError` raised when a stored credential cannot be decrypted (key changed or lost) and returns `None`, so `require_tokens()` responds 401 "No connected mailbox is available." instead of an internal server error.
- Added `backend/python_tests/test_api.py` `test_lost_encryption_key_returns_401_not_500`, which authorizes with one key, reopens the same SQLite database with a different Fernet key (simulating a deleted `data/revomail-server.key`), and asserts `/api/v1/emails` returns 401 `NOT_AUTHENTICATED`.
- Archived the previous task record as `change/change-14.md`.

## Reason

The contributor confirmed that RevoMail is a desktop application with exactly one instance, so multi-instance key sharing does not apply. The lifecycle is: first startup generates keys; later startups reuse the persisted file; if the file is missing, previously stored provider credentials are considered abandoned and the user simply re-authorizes. The previous behavior surfaced a raw decrypt failure as a 500.

## Key Commands

- `npm run test:python`
- `git diff --check`

## Validation

- All 20 Python tests passed, including the new lost-key regression test (401 instead of 500, session cookie still accepted).
- `git diff --check` passed.

## Known Issues and Remaining Work

- The stored encrypted credential row remains in SQLite after a lost key; it is ignored (treated as no connected mailbox) but not deleted. Re-authorizing creates a fresh credential row via upsert.
- Desktop single-instance model is assumed; multi-instance key sharing remains explicitly out of scope.
