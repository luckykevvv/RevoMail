# Implement Module 2 platform foundation and backend architecture

Date: 2026-08-15

## Scope

Implement GitHub Issue #2 and its platform-foundation children: #9 persistence and recoverable jobs, #10 API contracts and standard errors, #13 backend architecture decisions, and #14 typed configuration and production health validation. Preserve the existing FastAPI, Google, Gmail, AI, web, and Electron behavior while moving active authentication state out of the browser cookie.

## Changes

- Added typed development, test, and production settings with safe startup validation for the public URL, SQLite URL, session signing secret, credential encryption key, and job limits.
- Added active Python SQLite migration support with apply and rollback commands.
- Added schema coverage for users, mailbox connections, encrypted OAuth credentials, OAuth transactions, server-side sessions, settings, tasks, audit records, recoverable jobs, and idempotency keys.
- Added Fernet protection for provider credentials. The signed browser cookie now contains only an opaque session token whose hash is stored in SQLite.
- Replaced the in-memory OAuth transaction used by the active application with an atomic, expiring, single-use SQLite repository.
- Added a lease-based job repository that recovers interrupted work after restart and explicitly fails exhausted jobs.
- Added stable JSON errors with safe messages, retryability, correlation identifiers, and matching `X-Correlation-ID` headers.
- Added provider-neutral Pydantic contracts and a runtime-neutral API v1 JSON Schema covering OAuth, pagination, AI, voice, task, and calendar boundaries without claiming reserved endpoints are implemented.
- Added ADR 0004, API v1 documentation, environment documentation, migration commands, and updated repository status.
- Updated desktop backend startup to supply stable server-side signing and encryption keys and enable production validation in packaged builds.
- Updated the Python resolver to prefer the repository `.venv`, matching the documented development contract.
- Archived the previous active task record as `change/change-8.md`.

## Reason

Module 2 requires the provider-neutral runtime, persistence, session, migration, job, API contract, configuration, and health foundations that later mailbox, AI, voice, task, calendar, security, and production modules depend on.

## Key Commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
git fetch origin main
git restore --staged --worktree -- .
git switch main
git merge --ff-only origin/main
git switch -c codex/issue-2-platform-foundation
.venv\Scripts\python.exe -m pip install cryptography==43.0.3
npm.cmd run test:python
npm.cmd run test:js
npm.cmd test
npm.cmd run build
npm.cmd run start
npm.cmd run desktop:pack
npm.cmd run backend:smoke
npm.cmd run desktop:smoke
npm.cmd run desktop:ui-smoke
curl.exe -s -i http://127.0.0.1:43871/api/v1/health
curl.exe -s -i http://127.0.0.1:43871/api/v1/accounts
git diff --check
git status --short --branch
```

## Validation

- `npm.cmd test` passed all 15 JavaScript test files with 43 tests and all 17 Python tests.
- Python tests verified migration apply and complete rollback, production configuration failures without secret values, encrypted credential protection, opaque browser sessions, atomic OAuth state, interrupted-job recovery, exhausted-job failure, health readiness, and safe correlated errors.
- `npm.cmd run build` produced the Vite production frontend successfully.
- A real production-mode Uvicorn process started on `127.0.0.1:43871` with an isolated temporary SQLite database.
- `GET /api/v1/health` returned HTTP 200 with `status: ok`, database readiness, and a correlation header.
- The built frontend returned HTTP 200 from the same FastAPI process.
- An unauthenticated account request returned HTTP 401 with `NOT_AUTHENTICATED`, `retryable: false`, and a correlation identifier matching the response header.
- `npm.cmd run desktop:pack` produced the Windows unpacked application with SQLite and cryptography included in the standalone backend.
- `npm.cmd run backend:smoke` and `npm.cmd run desktop:smoke` each started the packaged backend, reached database-ready health, verified provider discovery, and stopped cleanly.
- `npm.cmd run desktop:ui-smoke` launched the real unpacked Electron application, reached the running launcher state without an error, opened the authenticated shell, and reached the Google identifier page without entering credentials.
- The production smoke process and its temporary database files were removed after validation.
- The shared API contract JSON parsed successfully.
- `git diff --check` passed.

## Known Issues and Remaining Work

- Real Google callback exchange, Gmail data, token refresh/revocation, and OpenAI calls were not repeated because provider test credentials were not supplied; their existing local-fake coverage remains.
- The recoverable job repository is the Module 2 foundation; provider-specific workers and scheduling belong to later modules.
- SQLite supports the current single-service MVP. Horizontal multi-worker scaling would require a later database and queue decision.
- Microsoft, Speech-to-Text, sending, calendar writes, CI, monitoring, and external idempotent mutations remain assigned to their later issues.
- macOS and Linux desktop packaging remain unverified on this Windows host.
