# Remove preset inbox messages for Issue #56 and integrate latest main

Date: 2026-08-17

## Scope

Fix GitHub Issue #56 so an authenticated user never sees RevoMail's preset inbox messages while the connected email provider is loading. Preserve the Module 2 platform foundation and integrate the latest `main` desktop bootstrap and portable-build workflow without rewriting the published feature branch.

## Changes

- Removed all six preset messages from the runtime inbox data in `src/main.js`.
- Initialized mailbox messages and the selected message as empty until the connected provider responds.
- Reset mailbox, selection, pagination, and AI state before the first provider page, on sign-out, and when no connected account exists.
- Added provider-specific loading and empty states instead of rendering stale demo data.
- Replaced the hard-coded Inbox badge and six-email summary message with values derived from the current provider mailbox.
- Added mailbox regression tests for first-page replacement, empty-provider responses, and later-page append behavior.
- Preserved the Module 2 persistence, recoverable jobs, API contracts, standard errors, architecture documentation, and typed production configuration recorded in `change/change-9.md`.
- Merged the latest `main` desktop bootstrap changes while preserving automatic Python setup, `RevoMail.cmd`, portable packaging commands, and package pruning.
- Preserved the Python migration commands and added rollback command while retaining the latest compact Electron packaging configuration and dependency classification from `main`.
- Removed the `AGENTS.md` rule that required every push to rebuild the root portable executable and run `verify:push`, as explicitly requested for this publication.
- Shared desktop backend environment preparation between the real Electron main process and packaged-service smoke test so production validation receives the same database path and server-side keys.
- Included only committed SQL migrations as unpacked Electron runtime resources so the standalone backend can create and upgrade its user-data database.
- Reconciled README, backend README, package scripts, and `todo.md` so both Module 2 and desktop bootstrap behavior remain documented.
- Archived the integrated desktop bootstrap task record as `change/change-10.md`.

## Reason

The frontend previously initialized the authenticated inbox with six demo messages, so users briefly saw unrelated mail before Gmail returned. The feature branch also diverged from `main` after the desktop bootstrap work landed and needed a non-rewriting merge before a pull request could be reviewed safely.

## Key Commands

- `git status --short --branch`
- `git ls-files -v | Select-String '^S'`
- `git fetch origin --prune`
- `git switch codex/issue-2-platform-foundation`
- `git merge --no-commit --no-ff origin/main`
- `git diff --cc -- change.md`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run desktop:pack`
- `npm.cmd run desktop:ui-smoke`
- `npm.cmd run desktop:smoke`
- Direct launch of `release/win-unpacked/resources/python-backend/revomail-backend.exe` with the packaged smoke environment

## Validation

- Before the main integration, `npm.cmd test` passed 16 JavaScript test files with 46 tests and all 17 Python tests.
- Mailbox regression tests verify first-page replacement, an empty provider response, and later-page append behavior.
- The production build contained none of the removed preset inbox sender addresses.
- The Windows unpacked Electron application and UI smoke test passed before the main integration.
- The merged package scripts retain automatic Python environment setup, Python migration and rollback commands, and optional portable desktop packaging.
- The first post-merge `verify:push` attempt passed all JavaScript tests but could not create pytest fixtures in a stale system temp directory; a second attempt exposed an incorrectly quoted temporary path before tests ran.
- Running the Python suite with a quoted ignored `data/` temporary directory passed all 17 tests.
- The first complete portable build reached 101,689,908 bytes and was correctly rejected by the 100,000,000-byte guard before publication.
- Further portable compilation was skipped at the contributor's explicit request; non-portable post-merge validation covers tests, the production frontend, the packaged service, and the Electron UI.
- The initial packaged-service smoke failed because its test harness omitted the production database and secret initialization used by Electron; the shared environment setup fixes that integration gap.
- A direct packaged-backend launch then identified missing runtime migrations through `sqlite3.OperationalError: no such table: Job`; the Electron package now includes the four committed migration and rollback files without including local database data.
- Final `npm.cmd test` passed 20 JavaScript test files with 57 tests and all 17 Python tests.
- `npm.cmd run desktop:pack` rebuilt the Vite frontend, standalone Python backend, and unpacked Electron application without producing a portable executable.
- The final packaged-service smoke reached database-ready health and confirmed Google authorization redirects to `accounts.google.com`.
- The first UI smoke retry was redirected to a stale test-launched portable instance by Electron's single-instance lock; after stopping only those confirmed test processes, the unpacked Electron launcher, application window, database health, and Google authorization UI smoke passed.

## Known Issues and Remaining Work

- The real signed-in Gmail transition was not repeated because no provider test-account credentials were entered. Provider responses remain covered by local fakes and mailbox regression tests.
- This change removes incorrect preset content during initial provider loading; periodic background polling for newly arrived messages remains outside Issue #56.
- macOS and Linux packaging remain unverified on this Windows host.
- The existing npm dependency audit findings remain outside this task.
