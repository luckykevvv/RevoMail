# Retire the portable Windows executable and restore the source launcher flow

Date: 2026-08-17

## Task Scope

Retire the tracked root `RevoMail.exe` portable build and its compilation requirements, and make the repository default to a source checkout launched through the root `RevoMail.cmd` one-click launcher. The portable executable was originally compiled to keep a single runnable artifact under GitHub's 100 MB per-file limit without LFS; that workaround is no longer wanted.

## Changes

- Removed the tracked root `RevoMail.exe` from the repository and added `RevoMail.exe` to `.gitignore` so packaged executables are never committed again.
- Deleted the portable publication scripts `scripts/copy-root-desktop.mjs`, `scripts/copy-root-desktop.test.js`, and `scripts/smoke-root-desktop.mjs`.
- Removed the `desktop:root` and `desktop:root-smoke` npm scripts; `verify:push` no longer builds or smoke-tests a portable executable and now runs tests, the frontend build, `desktop:pack`, and the packaged-service smoke.
- Changed the Windows `electron-builder` target from `portable` to `nsis` so `desktop:dist` still produces an installer artifact under ignored `release/`.
- Updated `AGENTS.md` to retire the portable build rule, require all packaged output to stay under ignored `release/`, and keep `RevoMail.cmd` as the tracked one-click source launcher that installs missing or stale dependencies and starts Electron.
- Updated `README.md` to describe the source-launcher flow and remove the portable-executable guidance and stale script-table entries.
- Updated `desktop/tests/package-config.test.js` to assert the removed scripts and the new NSIS target.
- Archived the previous task record as `change/change-11.md`.

## Reason

The portable `RevoMail.exe` was a 98 MB tracked binary used to avoid LFS, but every backend dependency addition risked pushing it over GitHub's 100 MB limit (the Module 2 build reached 101,689,908 bytes and was rejected). The contributor decided the portable workaround is not worth keeping: the repository should default to no committed executable, and contributors should use `RevoMail.cmd` to install the environment and launch the Electron desktop app.

## Key Commands

- `git status --short --branch`
- `git fetch origin`
- `git checkout main`
- `git pull --ff-only origin main`
- `git ls-files --error-unmatch -- RevoMail.exe`
- `git check-ignore -v -- RevoMail.exe`
- `git rm RevoMail.exe scripts/copy-root-desktop.mjs scripts/copy-root-desktop.test.js scripts/smoke-root-desktop.mjs`
- `npm test`
- `npm run build`
- `npm run desktop:pack`
- `npm run desktop:smoke`
- `git diff --check`

## Validation

- `npm test` passed 19 JavaScript test files with 55 tests and all 17 Python tests.
- `npm run build` produced the Vite production frontend successfully.
- `npm run desktop:pack` rebuilt the frontend, standalone Python backend (with discovery-document pruning), and Windows unpacked Electron application successfully.
- `npm run desktop:smoke` initially failed with `Application startup failed (code 3)` because the local ignored root `.env` contains an invalid `TOKEN_ENCRYPTION_KEY` (39 characters; a Fernet key must be 44). With a freshly generated valid Fernet key injected, the packaged backend reached `running`, reported `checks.database: ok`, and returned Google authorization HTTP 307 to `accounts.google.com`. The local `.env` key should be regenerated; this is an environment issue, not a packaging regression.
- `git diff --check` passed.
- No packaged executable, database, environment file, or generated output is tracked; `git status` shows only the intended source and documentation changes, and `git check-ignore` confirms `RevoMail.exe` is now ignored.

## Known Issues and Remaining Work

- The local ignored root `.env` still contains an invalid `TOKEN_ENCRYPTION_KEY`; regenerate it with `.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` before running the packaged desktop app or its smoke test.
- macOS and Linux packaging remain unverified on this Windows host.
- The packaged-service and UI smoke tests cover the unpacked Windows application; the retired portable executable is no longer produced or tested.
- Real provider credentials were not used; OAuth, Gmail, and OpenAI paths remain covered by local fakes.
- `desktop:ui-smoke` could not be completed in this environment because the Electron renderer did not appear; it remains unverified here.
