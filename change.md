# R9 parser, OAuth origin, and Google revocation hardening

Date: 2026-11-01

## Task scope

Harden malformed HTML parsing and omitted-head handling, improve mismatched-origin sign-in UX without weakening OAuth protections, and add an explicit Google-side revocation action distinct from local Gmail disconnect.

## Changes and reason

- Adapted the supplied parser hardening patch with an open-tag counter so repeated unmatched closing tags return without scanning the element stack. Matched malformed closures still unwind the stack and preserve block/table separators and hidden-depth accounting.
- Treats `<body>` as the implicit end of an unclosed `<head>`, restoring visible HTML-only email bodies while continuing to exclude head content, hidden preheaders, scripts, styles, templates, and nested hidden elements.
- Mismatched-origin Google sign-in starts now navigate to the configured `APP_BASE_URL` with the existing safe error code before creating OAuth state. Callback-origin rejection remains relative to the receiving origin, does not forward authorization codes, and does not consume state.
- Clarified startup validation so a `GOOGLE_REDIRECT_URI` mismatch explicitly names scheme, host, port, session-cookie continuity, and the OAuth callback.
- Added `POST /api/v1/accounts/{id}/revoke`, which validates session, CSRF, ownership, and locally available credentials; prefers the refresh token; calls Google's official revocation endpoint with bounded timeouts; and removes the connection, encrypted credential, sync state, and cached mailbox data only after a confirmed `200` response.
- Kept `DELETE /api/v1/accounts/{id}` as a separate local-only Disconnect operation. Both paths preserve the RevoMail identity/session and Manual Email Analysis access.
- Added distinct Settings actions, confirmations, retry-safe error copy, and guidance for users whose local token was already removed.
- Replaced native Electron `window.confirm()` account prompts with an accessible in-app confirmation dialog. The dialog explicitly traps/restores focus, clears its inert state on cancel or completion, keeps provider errors available for retry, and prevents the renderer-focus loss that made Manual Email Analysis fields temporarily reject typing after Disconnect or Revoke.
- Account-action success now updates the confirmed local account state directly and cancels mailbox polling before closing the dialog, avoiding an unnecessary follow-up account fetch and late render during immediate navigation to Analyse Text.
- Updated API/authentication/architecture documentation, README setup guidance, and the FR-07 status to match the implemented distinction.
- Added targeted parser, OAuth origin, revocation, cleanup, ownership, CSRF, session, manual-analysis, and browser regression coverage. Provider calls in tests are local fakes only.

## Commands and validation

- Confirmed the clean `R9_Manual_email_analysis` branch is one unpushed commit ahead of its remote and has no skip-worktree entries.
- Inspected the supplied local hardening patch, active parser, OAuth/account routes, persistence cleanup, Settings account UI, documentation, and relevant tests.
- Verified Google's official OAuth documentation: token revocation uses an HTTPS `POST` to `https://oauth2.googleapis.com/revoke`; success is an empty `200`, while revocation removes all project scopes rather than selected scopes.
- `node scripts/python-runtime.mjs -m pytest backend/python_tests/test_manual.py backend/python_tests/test_google_revocation.py backend/python_tests/test_api.py::test_oauth_requests_reject_a_mismatched_cookie_origin_without_consuming_state --basetemp build/pytest-r9-hardening-20261101-c -q -p no:cacheprovider` — 42 passed. This required running outside the Windows sandbox because Starlette TestClient's asyncio loopback socket pair was blocked there.
- `node scripts/python-runtime.mjs -m pytest backend/python_tests/test_foundation.py::test_oauth_callback_must_share_the_application_origin --basetemp build/pytest-r9-config-20261101-b -q -p no:cacheprovider` — 1 passed.
- Parser benchmark, five samples per size using `<div>` followed by unmatched closing tags: 2,000 = 0.009349 s (2.337 µs/element), 4,000 = 0.019807 s (2.476 µs/element), 8,000 = 0.039737 s (2.484 µs/element), 16,000 = 0.078788 s (2.462 µs/element), 32,000 = 0.156196 s (2.441 µs/element). Stable per-element cost confirms linear scaling over the measured range.
- `npm run build` — passed; Vite transformed 1,564 modules and produced the production bundle.
- Initial targeted Playwright execution did not run because bundled Chromium was absent. Reran against installed Microsoft Edge with `BROWSER_CHANNEL=msedge npx playwright test --config=playwright.r9.config.js --grep "local disconnect|confirmed Google revocation"` — 2 passed.
- Repeated the two targeted Edge tests after the account-focus correction — 2 passed. They now cancel the dialog with Escape and verify focus returns to Disconnect, then confirm each action, navigate immediately to Analyse Text, click the email body, type through real keyboard events without waiting, and assert the text is accepted.
- Repeated `npm run build` after the focus correction — passed; Vite transformed 1,564 modules and produced the production bundle.
- `git diff --check` — passed; Git reported only existing line-ending conversion notices.

## Remaining work and limitations

- Google revocation and OAuth were verified with deterministic fakes, not real provider credentials. Real-provider end-to-end verification remains outstanding in `todo.md`.
- Google revocation is whole-grant only; the endpoint cannot revoke Gmail and retain Calendar (or the reverse).
- If local credentials were already deleted, RevoMail cannot revoke an unavailable token and instead directs the user to Google Account settings.
- The full Python, JavaScript, and browser suites were not requested or run for this focused hardening task; only the directly affected suites and production build were run.
- No merge or push to `main` is authorized or planned.
