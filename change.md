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
npm ci
npm test
npm run build
npm run start
curl.exe -s -i http://127.0.0.1:4173/api/v1/health
curl.exe -s -i http://127.0.0.1:4173/api/v1/auth/session
npm run desktop:pack
rg -n 'Python runtime override' .env.example AGENTS.md README.md package.json ecosystem.config.cjs desktop scripts docs backend
git diff --check
```

## Validation

- The existing and runtime-selection Vitest suites pass: 11 files and 34 tests.
- The 6 new Pytest API and provider-fixture tests pass.
- `npm run build` produces the Vite production frontend successfully.
- `npm run start` selects Python internally and starts Uvicorn without a development reloader.
- The real FastAPI `/api/v1/health`, signed-out session endpoint, and production frontend each returned HTTP 200.
- `npm run desktop:pack` produced the Windows unpacked application successfully.
- The Python runtime override field has been removed from code, examples, and documentation.
- The local `.venv`, real environment files, generated builds, release output, and databases remain ignored.
- The final `npm ci` completed from the lockfile and reported one moderate transitive dependency vulnerability; no unreviewed dependency rewrite was applied during the merge.

## Remaining Work

- Real Google authorization, Gmail reads, OpenAI calls, refresh, and revocation require test credentials and remain unverified.
- Microsoft OAuth and Microsoft Graph remain pending.
- Python runtime selection is internal and has no environment field. The packaged Electron application currently falls back to an installed Python when no bundled runtime exists; adding that bundled runtime is future packaging work.
