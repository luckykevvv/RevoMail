# Gmail refresh errors and local-time greeting

Date: 2026-11-01

## Task scope

Diagnose the reported refresh failure, handle rejected Google refresh credentials safely, show actionable sync errors while preserving cached emails, and update the inbox greeting using each user's local clock.

## Changes and reason

- Archived the completed R9 record unchanged as `change/change-33.md`; existing uncommitted R9 work remains preserved on the current branch.
- Read-only desktop metadata confirmed repeated history-sync failures recorded only as `SYNC_FAILED`. A bounded Google credential-refresh diagnostic returned non-retryable `RefreshError` with `invalid_grant`; no mailbox content was fetched, credentials printed, or stored credentials changed.
- The Gmail adapter now maps non-retryable Google credential refresh failures to `AUTHORIZATION_EXPIRED`; retryable refresh, transport, DNS, and connection failures use `PROVIDER_UNAVAILABLE`, while timeouts retain `PROVIDER_TIMEOUT`. Provider exception details stay out of user-facing errors and logs.
- The sync worker catches adapter-construction failures and logs only job identifier and exception type for unknown failures. Expired grants are terminal, temporary failures retain bounded retry behaviour, and cached messages/history cursors remain intact.
- Added an inbox failure banner with reconnect or retry guidance and keyboard-accessible actions. Manual refresh toasts now explain the safe underlying category instead of always saying to try again shortly.
- Replaced the hard-coded greeting with device-local morning (05:00-11:59), afternoon (12:00-17:59), and evening (18:00-04:59). A lightweight DOM update runs every minute and on focus/visibility changes without rerendering the workspace or interrupting typing.
- Updated Gmail/worker regression tests, frontend state tests, browser fixtures/scenarios, README, and the API contract documentation. Preserved the R9 feature and English upload controls.

## Commands and validation

- Inspected Git status, skip-worktree entries, working rules, relevant requirements/documentation, sync worker, Gmail adapter, and frontend refresh path.
- Read only synchronization/error metadata from SQLite and checked credential-refresh acceptance with safe categorical output.
- `$env:PYTEST_ADDOPTS='--basetemp=build/refresh-greeting-pytest -p no:cacheprovider'; npm test`: **153 JavaScript and 216 Python tests passed**. Coverage includes invalid grants, retryable transport errors, safe logs, preserved cached messages, adapter startup failure, greeting boundaries, and the existing feature suites.
- `npm run build`: passed.
- `$env:BROWSER_CHANNEL='msedge'; npm run test:browser`: **32 passed**, including Sydney/Los Angeles local greetings at the same UTC instant, an open-inbox noon transition preserving search focus, cached-mail/reconnect guidance at 1280px and 320px with scoped axe checks, retry buttons, and existing Gmail/send/Calendar/voice workflows. The new mobile failure-banner screenshot was visually inspected.
- `$env:BROWSER_CHANNEL='msedge'; npm run test:browser:r9`: **11 passed**, including manual imports, all four AI operations, keyboard workflows, and light/dark desktop/mobile accessibility checks.
- Started `npm run start` in production mode on an isolated loopback port with ignored test storage. Real HTTP checks passed: health 200 with database ready, frontend 200 referencing built assets, and unauthenticated mailbox 401. No development server, PostgreSQL, or Docker was required. The temporary verification server was stopped.
- `git diff --check` and the documentation trailing-whitespace scan passed; reviewed the final working tree and preserved all existing uncommitted work. No commit or push requested or performed.

## Gmail reconnect recovery follow-up

- Safe metadata showed that reconnect attempts had not updated the stored credentials. Web and desktop credential timestamps both remained unchanged; tokens and mailbox content were not printed or downloaded.
- Reproduced a callback bug with a failing deterministic regression: valid Gmail scopes were rejected with `INSUFFICIENT_PERMISSIONS` solely because an older optional Calendar grant was absent.
- The callback now validates only permissions required by the requested feature. Existing Calendar access is retained when Google returns it; missing Calendar access is exposed through the separate Enable Calendar action instead of blocking Gmail recovery.
- Successful authorisation saves fresh credentials and clears stale credential-failure sync metadata without deleting cached messages/history or reporting sync success. Normal frontend bootstrap starts synchronization.
- Added an explicit authorisation-saved receipt, safe callback failure logs, and a direct Reconnect Gmail button that starts the CSRF-protected OAuth flow from the inbox.
- The regression first failed with the old callback (`INSUFFICIENT_PERMISSIONS`) and now passes, proving fresh access/refresh credentials are persisted, missing Calendar permission is reported separately, session/CSRF identity stays intact, and cached messages/history survive.
- Follow-up `$env:PYTEST_ADDOPTS='--basetemp=build/reconnect-fixed-pytest -p no:cacheprovider'; npm test`: **153 JavaScript and 217 Python tests passed**. `npm run build` passed.
- Follow-up Microsoft Edge `npm run test:browser:r9`: **11 passed**, including real frontend-to-FastAPI Gmail reconnection after a Calendar grant disappears and polling until synchronization reaches idle, using deterministic provider fakes.
- Follow-up Microsoft Edge `npm run test:browser`: **32 passed**, including direct keyboard reconnect with CSRF and the saved-authorisation receipt at desktop/mobile sizes. The first run had 30 passes and two failures because a broad test interceptor shadowed the new specific reconnect fixture; corrected registration order and the full rerun passed.
- Started the production entry point on an isolated loopback port and verified health/database readiness and built frontend HTTP 200; stopped the temporary server. Final whitespace/diff and working-tree checks passed. README and authentication contracts describe optional Calendar recovery and the saved-authorisation receipt.
- The metadata-only check before user retesting still showed the older credential timestamps and rejected authorisation; no credential or mailbox mutation was performed through diagnostic tools.
- On 2026-11-01 the user confirmed that, after restarting and reconnecting with the corrected flow, Gmail authorisation saved appeared and the inbox updated. Live reconnect/synchronization recovery is user-verified; this is distinct from the automated provider-fixture checks above.

## Remaining work and limitations

- Rejected Gmail authorisation requires the user to reconnect Gmail through Google's consent flow; changing application code cannot renew an invalid grant automatically.
- Provider regression tests used deterministic sanitized fixtures; live reconnect and inbox updates were subsequently confirmed by the user. Dedicated provider-test-account validation of other workflows remains pending. The diagnostic established credential rejection, not why Google invalidated the grant.
- This confirmation update changes documentation only; no application code changed or tests reran. Documentation whitespace and `git diff --check` passed.
- Real personal mailbox data was not downloaded for diagnostics or used in tests. Desktop installer/macOS/Linux packaging checks were not run; no Electron lifecycle or packaging behaviour changed.
