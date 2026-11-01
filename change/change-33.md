# R9 Manual Email Analysis

Date: 2026-11-01

## Task scope

Implement transient paste/upload email analysis for signed-in users without Gmail, separate Google identity from optional Gmail and Calendar authorisation, and preserve existing provider workflows.

## Changes

- Implemented on `codex/r9-manual-email-analysis`; no commit or push performed.
- Archived the previous voice task unchanged as `change/change-32.md`.
- Added the Analyse Text workspace, text/MIME imports, four AI actions, transient input/results, editable reply and task/event suggestions, explicit copy/fallback, and validation/loading/error/retry/cancellation states. Manual analysis never retrieves Gmail content or creates tasks, messages, or events.
- Added session/CSRF-only manual API routes and strict request/response validation, streamed 1 MiB upload and 256 KiB JSON limits, a 15,000-character body limit, bounded MIME parsing, safe HTML-to-text fallback, and a configurable per-user AI action limit. Existing AI methods/preferences are reused; summary prompts explicitly treat email as untrusted.
- Separated identity-only Google sign-in from explicit Gmail and Calendar grants. Encrypted OAuth context carries purpose, scopes, PKCE verifier, user/session binding, and target account; existing grants/refresh tokens survive sign-in and incremental authorisation. No SQL migration or credential reset is required. Legacy pending OAuth transactions require retry.
- Disconnect clears frontend mailbox state/polling while preserving the application session. Settings and the disconnected inbox offer Connect Gmail and Analyse Text; Calendar permission has its own Enable Calendar action.
- Added manual input/view helpers, responsive navigation with six contained mobile controls, stronger sidebar contrast, focus transfer to generated results, and clearing on sign-out, detected expiry, pagehide, or reload.
- Added backend, frontend, and real frontend-to-FastAPI browser coverage using sanitized deterministic provider fakes. Corrected two stale existing browser assertions to target the unchanged voice Summary/Tasks result sections and updated Calendar permission-message expectations.
- Updated README/backend documentation, authentication/API contracts, shared JSON Schema, environment examples, the R9 requirements record, and ADR 0005. The supplied Word report is unchanged.

## Commands and validation

- Inspected repository status, skip-worktree entries, requirements, architecture, implementation, report R9, and existing tests during planning. The starting tracked working tree was clean.
- Created the requested feature branch with `git switch -c codex/r9-manual-email-analysis`.
- Planning baseline: production build passed; three OAuth scope-normalisation tests passed. JavaScript baseline: 131 passed, four loopback-permission failures after using a repository-local temporary directory. Full Python baseline stalled and was interrupted.
- `npm ci` passed with the unchanged lockfile; Python setup confirmed the existing environment was ready. No dependencies were upgraded.
- Initial existing authentication regression: 23 passed. Initial new R9 backend regression: 41 passed.
- `npm run test:js`: 140 passed. Full `npm run test:python -- --basetemp=build/r9-full-pytest -p no:cacheprovider`: 204 passed before the final extra cases.
- A full test attempt using the host's default pytest temporary directory produced 92 setup errors (113 passed) due to Windows temporary-directory permissions. A subsequent run with a repository-local temporary directory exposed one expected Calendar error-copy assertion, which was updated for Enable Calendar.
- Final `$env:PYTEST_ADDOPTS='--basetemp=build/r9-final-verified-pytest -p no:cacheprovider'; npm test`: **140 JavaScript and 207 Python tests passed**, including real-library S256 PKCE, scope validation, ownership/session binding, encrypted state, Gmail, sending, Calendar, voice, MIME limits, no mailbox access/persistence/logging, and manual AI output validation.
- `$env:BROWSER_CHANNEL='msedge'; npm run test:browser:r9`: **11 passed** against actual FastAPI routes and the production frontend with test-only Google/AI adapters. Covered all four AI operations without Gmail requests, text/MIME imports, retry/cancellation, clipboard fallback, sign-out/session expiry, optional grants/disconnect, keyboard focus, and 1280px/320px light/dark axe scans. Earlier runs found and corrected textarea-label matching, light-theme contrast, and navigation geometry issues. Final screenshots were visually inspected.
- `$env:BROWSER_CHANNEL='msedge'; npm run test:browser`: **26 passed** after correcting the two stale voice-result assertions. Existing Gmail/attachment/starred/refresh, Compose/Reply/send review, Calendar, voice, and responsive workflows passed.
- `npm run build` passed repeatedly, including the frontend used in the final browser runs.
- Started the actual `npm run start` entry point in production mode on isolated loopback port 4280 with ignored test database/key paths. Real HTTP checks returned 200 for `/api/v1/health` with database ready, 200 for the built frontend with a hashed production asset, and 401 for unauthenticated manual analysis. Startup launched Uvicorn/FastAPI, not Vite, without PostgreSQL or Docker. The temporary server was stopped afterward.
- Final `npm run build` passed. `git diff --check` and the targeted documentation trailing-whitespace scan passed; shared-schema JSON parsed and all three manual contracts were present. Reviewed the final feature-branch status: only intended source/test/documentation changes and the unchanged archive are present; no skip-worktree overrides, lockfile changes, secrets, dependencies, or generated artifacts were added to Git.

## English upload control follow-up

- Replaced the visible native file input, which inherited the host's Chinese browser labels, with an English Choose file button and No file selected status. Imported filenames remain user content and are displayed safely.
- Kept the native picker behind a hidden, labelled input and added keyboard activation through the English button. Existing import, size/type validation, busy states, and Clear behaviour remain in use.
- Updated the browser import scenario to verify the English labels, hidden native control, keyboard file selection, and imported filename display.
- Follow-up `npm run build` and `npm run test:js` passed (140 tests). Microsoft Edge `npm run test:browser:r9` passed all 11 scenarios, including light/dark desktop/mobile axe checks and keyboard file selection. `git diff --check` passed. The English control was visually checked in the generated browser screenshot.

## Remaining work and limitations

- R9's controlled-text/no-Gmail functional acceptance criterion is verified and recorded as met in `todo.md`. This does not establish live Google/OpenAI integration or AI model accuracy.
- Real Google/OpenAI test-account verification, native macOS/Linux checks, installed Electron packaging, and manual assistive-technology review were not performed. No Electron packaging or main-process behaviour changed.
- Provider-side token revocation remains outside this task; disconnect removes local credentials and keeps the RevoMail session.
- Manual suggestions and drafts intentionally remain copy-only; no Calendar-only connection without Gmail is provided. The manual limiter is per-process and resets on restart, matching the existing single-process MVP boundary.
- Optional grant callbacks require the initiating session cookie on the callback host. Use consistent application/callback hosts; missing continuity fails safely rather than attaching credentials without ownership checks.
- `npm ci` reported 31 dependency vulnerabilities (19 moderate, 11 high, 1 critical) in the existing locked dependency tree; dependency upgrades are outside R9. The npm allow-scripts/deprecation notices did not prevent installation or builds.
