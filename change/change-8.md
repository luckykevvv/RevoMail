# Merge the Python API application into Module 1

Date: 2026-08-07

## Scope

Merge GitHub PR #53 (`API_application` into `module_1_login`), adopt Python/FastAPI for the API and future LLM integration, retain the existing connected-account UI and `/api/v1` frontend contract, integrate Gmail and OpenAI-backed features, and add automated tests.

## Changes

- Merged the PR branch without committing and resolved `.gitignore` by retaining both desktop/SQLite and Python exclusions.
- Kept the current Module 1 frontend as the conflict base so the connected-account permissions, reconnect, disconnect, and sign-out UI did not regress.
- Added FastAPI routes for health, session bootstrap, Google OAuth, connected accounts, Gmail messages, AI summaries, extraction, and reply drafts under the existing same-origin `/api/v1` contract.
- Integrated the PR's Gmail and LLM service code into the retained inbox, reading, summary, extraction, and reply UI states.
- Made FastAPI serve the production Vite build and added a shared Python runtime resolver for npm, PM2, and Electron-managed starts.
- Added Python API tests with simulated OAuth, Gmail, and AI providers while retaining the existing JavaScript authentication and desktop tests.
- Added sanitized root and backend environment examples for Google OAuth, OpenAI, and FastAPI runtime configuration.
- Removed the Python-runtime override field and made runtime selection internal; also namespaced the debug flag to avoid collisions with machine-level `DEBUG` values.
- Fixed the packaged Electron main-process startup by explicitly including the imported Python runtime resolver in the application file list, with a package-configuration regression test.
- Fixed the subsequent packaged service startup failure caused by Electron falling back to a system Python that lacked `itsdangerous` and other backend dependencies.
- Added a PyInstaller one-directory backend build, embedded it as an Electron extra resource, and made packaged Electron launch only that standalone executable while development retains automatic `.venv` selection.
- Passed the packaged application root to FastAPI internally so the standalone backend can load the built frontend without a public Python-path setting.
- Captured a bounded, URL-redacted backend output tail so service startup failures expose an actionable final error instead of an unrelated OAuth hint.
- Added backend-launch, package-resource, output-reporting, standalone-backend smoke, and packaged ServiceController smoke coverage.
- Updated the README, backend guide, ADR, contributor instructions, and desktop todo status to reflect the bundled Windows backend accurately.
- Fixed packaged provider discovery: the desktop main process now loads private environment values before spawning FastAPI, checking the Electron `userData` `.env` first and the repository `.env` for local unpacked builds without overriding existing process variables.
- Added desktop environment path/loading tests plus an actual packaged-Electron UI smoke test that starts the service, opens RevoMail, checks the Google button state, and verifies navigation reaches Google Accounts without completing authorization.
- Fixed Google sign-in progression inside Electron by allowing navigation only to the managed RevoMail origin and the exact `https://accounts.google.com` OAuth origin; unrelated and lookalike origins remain blocked.
- Extended the packaged UI smoke test with an optional runtime-only test-account identifier so the Google identifier-to-password transition can be verified without storing personal data in the repository or test output.
- Fixed `INVALID_OAUTH_STATE` after Google consent: desktop OAuth previously started on `127.0.0.1` while Google returned to the configured `localhost` callback, so the host-scoped session cookie was unavailable.
- Aligned the default desktop host with the documented `localhost` callback and added a locked, ten-minute, single-use server-side OAuth transaction store so callback state remains verifiable across loopback-host cookie boundaries and cannot be replayed.
- Removed the legacy cookie-state fallback after final review, rejected scheme-relative OAuth return paths, and added callback-level expiry, replay, and return-target regression tests.
- Isolated the real Electron UI smoke test with a fresh temporary browser-data directory so persisted login cookies cannot hide or skip the signed-out Google button flow.
- Archived the previous desktop/SQLite task record as `change/change-7.md`.

## Reason

Use Python for the backend boundary so later LLM and mailbox integrations can use the Python ecosystem, while preserving the account-management experience already implemented in Module 1.

## Key Commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
git fetch origin API_application
git merge --no-commit --no-ff origin/API_application
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe -m pip install pyinstaller==6.21.0
npm ci
npm test
npm run build
npm run start
curl.exe -s -i http://127.0.0.1:4173/api/v1/health
curl.exe -s -i http://127.0.0.1:4173/api/v1/auth/session
npm run desktop:pack
npm run backend:smoke
npm run desktop:smoke
npm run desktop:ui-smoke
node scripts\smoke-electron-ui.mjs "<test-account-email>"
node node_modules\@electron\asar\bin\asar.js list release\win-unpacked\resources\app.asar
rg -n 'Python runtime override' .env.example AGENTS.md README.md package.json ecosystem.config.cjs desktop scripts docs backend
rg --pcre2 -n --hidden -g '!node_modules/**' -g '!release/**' -g '!build/**' -g '!.git/**' '(client_secret\s*[=:]\s*["''](?!\s*$)|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,})' .
git diff --check
git add -A
git commit -m "fix: package Python backend and complete Google OAuth flow"
git push -u origin module_1_login
```

## Validation

- The existing, runtime-selection, package-configuration, backend-launch, environment-loading, navigation-policy, and service-output Vitest suites pass: 15 files and 43 tests.
- The 10 Pytest API, provider-fixture, cross-loopback callback, expiry, replay, and safe-return tests pass.
- `npm run build` produces the Vite production frontend successfully.
- `npm run start` selects Python internally and starts Uvicorn without a development reloader.
- The real FastAPI `/api/v1/health`, signed-out session endpoint, and production frontend each returned HTTP 200.
- `npm run desktop:pack` built the standalone FastAPI backend and produced the Windows unpacked application successfully.
- The standalone backend and the copy under `release/win-unpacked/resources/python-backend` each returned a real healthy API response.
- `npm run desktop:smoke` exercised the production `ServiceController` against the packaged backend, reached the `running` state, returned HTTP 200 from `/api/v1/health`, and stopped the child process.
- Before the provider-loading fix, the packaged backend reported `google: false` despite both Google variables being present in the ignored root `.env`; after the fix, the packaged desktop service reports `google: true` and `microsoft: false`.
- The Google authorization endpoint returns HTTP 307 to `accounts.google.com`.
- `npm run desktop:ui-smoke` launched the real rebuilt EXE, started a healthy managed service, confirmed the launcher had no error, opened the real frontend, confirmed the Google button existed with `disabled=false`, and reached Google's `/v3/signin/identifier` page titled `登录 - Google 账号`. It did not enter credentials or complete the OAuth callback.
- The rebuilt EXE accepted the test-account identifier and advanced from Google's identifier screen to the password stage (`passwordStage: true`, `identifierStage: false`, `invalidIdentifier: false`). No password was entered and no callback or consent action was completed.
- A simulated callback with its browser session cookie cleared still completed through the server-side transaction, while a replay and a callback after the ten-minute expiry were rejected.
- The latest rebuilt EXE starts on `localhost`, reaches the real Google account chooser, and keeps Google provider availability enabled. Completing the password and consent screens remains a manual test-account step.
- The final isolated `npm run desktop:ui-smoke` run started the rebuilt EXE, showed an enabled Google button, and reached Google's real identifier page without relying on prior Electron cookies.
- The rebuilt ASAR contains the Python runtime resolver required by `desktop/main.js`.
- The rebuilt `RevoMail.exe` opens the real `RevoMail Desktop` launcher without a main-process JavaScript error; packaged service readiness is additionally covered by the controller smoke check.
- The Python runtime override field has been removed from code, examples, and documentation.
- The local `.venv`, real environment files, generated builds, release output, and databases remain ignored.
- The credential-pattern scan found no credential-like values in repository workspace files, excluding ignored build and dependency directories.
- The final `npm ci` completed from the lockfile and reported one moderate transitive dependency vulnerability; no unreviewed dependency rewrite was applied during the merge.

## Remaining Work

- Google OAuth initiation is verified against the real provider, but test-account sign-in, callback exchange, Gmail access, refresh, and revocation remain unverified.
- Real OpenAI calls remain unverified.
- Microsoft OAuth and Microsoft Graph remain pending.
- The standalone backend is built and smoke-tested on Windows only. macOS and Linux package builds remain unverified and must be produced on their native platforms.
