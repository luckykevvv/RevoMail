# Integrate the Module 7 branch baseline

Date: 2026-09-28

## Task Scope

Create `module-7-voice-settings-accessibility` from `origin/email_classification` and integrate the newer `origin/main` mailbox, sending, security, and navigation-performance work without losing AI priority classification or the real Google OAuth scope-normalisation fix.

## Changes

- Created the Module 7 working branch from `origin/email_classification`.
- Integrated `origin/main` and resolved the overlapping frontend, mailbox, OAuth, API-test, documentation, and task-history changes.
- Retained the latest mailbox cache, synchronization, safe HTML rendering, confirmed idempotent sending, CSRF checks, request cancellation, persistent application shell, and repeated-navigation performance fixes from `origin/main`.
- Retained the AI High/Medium/Low classification endpoint, inbox badges and filters, classification tests, and Google OAuth relaxed scope handling from `email_classification`.
- Diagnosed the real Google callback failure to the token-exchange connection. Its exception chain ended in `PermissionError`, proving that the restricted launch environment denied the backend's outbound Google connection rather than Google rejecting the OAuth configuration. Added bounded connect-only retries, a 15-second timeout, stage-specific safe diagnostics, and an actionable `AUTHORIZATION_NETWORK_FAILED` UI message; read retries remain disabled so an authorization code is never replayed after an uncertain response.
- Disabled Uvicorn request-target access logging because an OAuth callback URL contains a short-lived authorization code. Application diagnostics now retain only a correlation ID, request stage, and exception class chain.
- Separated the initial mailbox synchronisation placeholder from the completed empty-mailbox state. A zero-message mailbox now announces `Synchronising your inbox…` while the provider job is active and displays `Your inbox is empty` only after synchronisation finishes.
- Formatted provider timestamps with the browser's local timezone, kept list dates on one line, and retained the original ISO value in semantic `datetime` attributes.
- Upgraded formatted-email rendering to preserve allowlisted inline CSS, HTTPS images, safe links, and raster CID images up to 2 MB while continuing to strip scripts, active embeds, SVG, dangerous URLs, and unsupported CSS. The sandboxed message frame uses a restrictive CSP and no-referrer policy.
- Added a safe one-time provider refresh when opening HTML cached by the earlier destructive sanitiser, then stores a version marker so subsequent opens remain cache-only. Cached content remains readable if that refresh cannot reach Gmail.
- Fixed the Desktop control room falsely reporting `FAILED` when a healthy RevoMail backend already owns the configured port. Startup now verifies the endpoint identity before spawning, reuses an existing `revomail-api` without claiming its process, labels it `Existing service`, and keeps stop/restart controls disabled for an externally managed process. Unrelated HTTP services are never adopted.
- Preserved both branches' colliding task records by keeping the classification record at `change/change-16.md` and archiving the main Module 3 and both active branch records as `change/change-19.md` through `change/change-21.md`.

## Reason

Module 7 must build on the more advanced email-classification branch, while the latest main branch contains the fix for progressive UI blocking after repeatedly opening different emails and newer mailbox/security behavior required by the project.

## Key Commands

- `git fetch origin email_classification`
- `git switch -c module-7-voice-settings-accessibility origin/email_classification`
- `git merge --no-commit --no-ff origin/main`
- `git commit -m "merge: establish module 7 baseline"`
- `git push -u origin module-7-voice-settings-accessibility`
- `npm test`
- `npm run build`
- `npm run setup`
- `npm run desktop:dev`
- `npm run start`
- `Invoke-RestMethod http://127.0.0.1:4173/api/v1/health`
- `Invoke-WebRequest http://127.0.0.1:4173/`
- Real Google sign-in retry with sanitized OAuth callback logging

## Validation

- All 67 JavaScript tests passed, including regression coverage for synchronising, completed empty-mailbox, invalid-date, local-timezone, existing-service reuse, and rejection of unrelated services.
- All 57 Python tests passed, including safe email CSS/HTTPS-image handling and CID-image embedding.
- The Vite production build passed.
- The production FastAPI process started successfully; `/api/v1/health` returned `ok` with the database check `ok`, and `/` returned the built frontend with HTTP 200.
- The real Electron development launcher started while the existing backend owned port 4173. It reused PID 29264 without spawning another backend, opened live connections from its renderer, and left the original listener healthy.
- A real Google consent flow reached the callback with all requested scopes. Stage-specific logging identified `ConnectionError > MaxRetryError > NewConnectionError > PermissionError` during token exchange in the restricted process. Credential-free probes reached Google's token endpoint, and the same backend was restarted with outbound-network permission for the final interactive retry.
- The contributor confirmed that real Google login and Gmail message reading succeeded after the backend was restarted with outbound-network permission.
- `git diff --cached --check` passed before publication.

## Known Issues and Remaining Work

- OpenAI and microphone behavior are not exercised by this baseline merge.
- Repeated email navigation is covered by the imported regression tests and implementation review; a long real-Gmail stress walkthrough was not performed in this task.
- Module 7 voice, settings, and accessibility implementation has not started; this task establishes its safe baseline.
