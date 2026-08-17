# Change Record

## Date

2026-08-15

## Task Scope

Make source installations prepare the Python environment automatically so contributors can run RevoMail after installing npm dependencies.

## Changes

- Added an idempotent setup script that creates `.venv`, installs `backend/requirements.txt`, and records a requirements fingerprint.
- Added npm lifecycle hooks for install, backend start, Python tests, Electron development launches, and backend packaging.
- Added the root-level `RevoMail.cmd` source launcher. It installs missing or stale Node dependencies, triggers Python setup, builds the frontend, and starts Electron.
- Changed the Windows distributable target to a single portable executable and added a deterministic, size-guarded copy step from `release/` to the repository root.
- Added a real root-portable smoke check that starts `RevoMail.exe` and waits for the Electron launcher window.
- Pruned unused Google API discovery documents from the standalone backend while retaining the Gmail v1 definition required at runtime.
- Limited the Electron package to active runtime files, production main-process dependencies, and the English and Simplified Chinese locales.
- Added `npm run verify:push` and an `AGENTS.md` rule requiring every push to refresh the root portable build and smoke-test the packaged service.
- Added unit coverage for interpreter discovery, environment invalidation, and package lifecycle configuration.
- Updated setup documentation and the project TODO to distinguish automatic source setup from the already standalone packaged application.

## Reason

Other contributors reported that a source checkout did not prepare its Python environment. The existing launcher selected `.venv` when present but never created it or installed dependencies.

## Key Commands

- `git status --short --branch`
- `git ls-files -v | Select-String '^S'`
- `rg --files -g '!node_modules' -g '!dist'`
- `git fetch origin`
- `git checkout main`
- `git pull --ff-only origin main`
- `npm run setup`
- `npm ci`
- `npm test`
- `npm run build`
- `npx vitest run scripts/setup-python-env.test.js desktop/tests/package-config.test.js`
- `npm run desktop:pack`
- `npm run desktop:smoke`
- `npm run desktop:root`
- `npm run desktop:root-smoke`
- `npm run verify:push`
- `npm run start`
- `curl.exe -s -i http://127.0.0.1:4173/api/v1/health`

## Validation

- The first setup run installed the requirements into the existing un-stamped `.venv`; the second run detected the matching fingerprint and skipped installation.
- `npm ci` invoked the new post-install setup hook successfully.
- All 19 JavaScript test files and 53 tests passed, including missing-environment creation, root-launch dependency handling, package pruning, portable publication, and lifecycle-hook coverage.
- All 10 Python tests passed.
- The Vite production build passed.
- `npm run start` invoked the setup pre-hook, started FastAPI, and returned HTTP 200 from the real `/api/v1/health` endpoint.
- `npm run desktop:pack` rebuilt the standalone Python backend and Windows unpacked Electron application successfully.
- `npm run desktop:smoke` started the packaged backend, reached the healthy running state, and confirmed Google authorization redirects to `accounts.google.com`.
- `npm run desktop:root` initially produced a 111,367,337-byte portable build. Discovery-document, locale, runtime-file, and production-dependency pruning reduced the final root executable to 98,714,309 bytes, below GitHub's 100,000,000-byte limit.
- `npm run desktop:root-smoke` launched the root executable and detected the real `RevoMail Desktop` window.
- The rebuilt packaged backend retained `gmail.v1.json`, removed 526 unrelated discovery documents totaling 80,066,542 bytes, reached a healthy state, and still redirected Google authorization to `accounts.google.com`.
- The final `npm run verify:push` gate completed successfully, covering JavaScript and Python tests, the production frontend build, portable Windows packaging, packaged-service health, Google authorization routing, and root-executable startup.

## Remaining Work

- A system Python 3.11 or newer remains required for source development.
- Packaged Windows builds remain standalone and do not run this source-environment setup.
- macOS and Linux setup and packaging were not verified on this Windows host.
- `npm ci` reported one moderate and one high dependency vulnerability; dependency upgrades were outside this task.
