# Fix real Google sign-in always failing with AUTHORIZATION_FAILED

Date: 2026-09-28

## Task Scope

Joel connected a real Google account (not a test fixture) and every sign-in attempt redirected to `/?authError=AUTHORIZATION_FAILED`, even though Google's own logs showed the authorization succeeding and redirecting back to RevoMail with a valid `code`.

## Root Cause

`backend/app/routers/auth.py` exchanges the authorization code with `google_auth_oauthlib.flow.Flow.fetch_token()`, which compares the scope string Google returns against the scope string RevoMail requested. Google's response is essentially never an exact match: it normalises `https://www.googleapis.com/auth/userinfo.email` and `.../userinfo.profile` to the short forms `email` and `profile`, and because the authorization request sets `include_granted_scopes=true`, Google also re-lists any scope already granted from an earlier authorization (here, a leftover `gmail.readonly` from before this app requested `gmail.modify`). The underlying `oauthlib` library treats any such scope mismatch as fatal by default and raises an exception. The callback's `except Exception:` caught that and always redirected to the generic `AUTHORIZATION_FAILED`, with nothing logged, so the real cause was invisible. This is unrelated to the priority classifier, the slowdown fix, or the read/unread feature; it is a pre-existing gap in real Google sign-in, which the project's own README already flagged as unverified.

## Changes

- `backend/app/routers/auth.py`: set `OAUTHLIB_RELAX_TOKEN_SCOPE=1` (via `os.environ.setdefault`, so it never overrides a value the environment already sets) at module import time, before any token exchange can run, with a comment explaining why. This is the documented way to tell `oauthlib` that Google's returned scope differing from the requested one is expected, not an error. Added a `revomail.auth` logger; the callback's exception handler now logs `type(exc).__name__` before redirecting, so a genuine future failure leaves a trace without ever logging the exception message (which can contain the authorization code or token).
- Tests: `backend/python_tests/test_oauth_scope_normalisation.py` (new) exercises the real `oauthlib` scope-comparison function directly, with the exact scope strings from Joel's failing request: one test proves Google's own (correct) response is rejected without the fix, another proves it is accepted with it, and a third checks the fix is active by default. One test appended to `backend/python_tests/test_api.py` checks the callback logs the exception type and never the message.

## Key Commands

- `pip install` of the pinned `backend/requirements.txt` packages in a throwaway directory outside the repository, then `python -m pytest`.

## Validation

- All 47 backend tests passed (Python 3.10 in the throwaway environment; the project targets 3.11+), including the three new scope tests run against the real `oauthlib` package (not a fake), using the exact scope strings from the failing request in Joel's message.
- Not run against Joel's real Google account in this session (no network to Google from here). The fix addresses a documented, general behaviour of Google's OAuth response, not something specific to one account, and the new tests reproduce the exact failure mode with the real library.

## Known Issues and Remaining Work

- Joel should retry Google sign-in after rebuilding and restarting (`npm run build`, `npm run start`). If it still fails, the backend log now has a line under `revomail.auth` naming the exception type, which narrows down any different remaining cause.
- Not run: `npm test`, `npm run build`.
- Unescaped sender/subject/preview HTML in inbox rows (recorded in an earlier task) is still unfixed.
