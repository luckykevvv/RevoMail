# Implement the Electron desktop application with local SQLite

Date: 2026-08-03

## Scope

Implement GitHub Module #45 and its desktop sub-issue plan: provide a cross-platform Electron foundation, one-click local service lifecycle controls, persisted settings, secure IPC boundaries, packaging configuration, and a self-contained SQLite persistence layer that requires no PostgreSQL, Docker, external database, Prisma runtime, or manual migration step.

## Changes

- Archived the previous Module 1 task record as `change/change-6.md`.
- Added an Electron main process, sandboxed preload bridge, single-instance behavior, restricted navigation and permissions, and separate launcher and RevoMail windows.
- Added a managed-service controller with start, stop, restart, duplicate-start protection, health-based readiness, timeout, unexpected-exit, and application-exit handling.
- Added validated desktop settings for loopback host, port, automatic startup, open-on-ready, stop-on-exit, theme, preferred language, and reduced motion.
- Added a RevoMail-styled desktop control room with explicit service states, actionable errors, keyboard-accessible controls, settings validation, and restart-required feedback.
- Replaced PostgreSQL and Prisma with SQLite through the Node.js built-in `node:sqlite` module, eliminating database services, driver adapters, native database rebuilds, and Visual Studio build requirements.
- Added ordered transactional SQLite migrations that run automatically before the local service listens, plus an explicit `npm run db:migrate` command for local Node workflows.
- Added a SQLite authentication repository that preserves the existing service/API contract, including JSON encoding and decoding for connected-account scopes.
- Made SQLite integration tests isolated and always-on instead of conditional on an external test database.
- Made Electron store `revomail.db`, desktop settings, and a generated encryption key under its per-user `userData` directory without exposing the database or key over IPC.
- Added Electron and electron-builder scripts and cross-platform targets; generated output is ignored under `release/` and test sources are excluded from packages.
- Added Vitest exclusions so ignored packaged output cannot duplicate or stale test discovery.
- Removed PostgreSQL, Prisma, and `better-sqlite3` dependencies from the package and lockfile.
- Updated `.env.example`, `.gitignore`, `AGENTS.md`, `todo.md`, README, backend documentation, and ADRs for the SQLite-only desktop architecture.

## Reason

Make RevoMail a self-contained desktop application that starts with one click and does not require contributors or users to install, configure, or run PostgreSQL or Docker.

## Key Commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
rg --files -g '!node_modules' -g '!dist'
Move-Item -LiteralPath 'change.md' -Destination 'change\change-6.md'
npm install --save-dev electron electron-builder
npm install
npm ci
npm run db:migrate
npm test
npm run test:db
npm run build
npm run desktop:pack
node --check desktop\main.js
node --check desktop\service-controller.js
node --check desktop\settings-store.js
node --check desktop\renderer\app.js
node --check desktop\preload.cjs
curl.exe -s -o NUL -w 'health=%{http_code}' http://127.0.0.1:4173/api/v1/health
git diff --check
```

## Validation

- Dependency installation completed from the updated package graph. The final `npm ci` verification reported one moderate-severity transitive dependency vulnerability; it remains open rather than applying an unreviewed dependency rewrite during publication.
- `npm run db:migrate` created and migrated the ignored local SQLite database without PostgreSQL or Docker.
- The current automated test suite and isolated SQLite repository suite pass without an external database or skipped database tests.
- `npm run build` completes the Vite production build successfully.
- A local Node service using SQLite returned HTTP 200 for the built frontend and `/api/v1/health`, and returned a safe signed-out session response.
- `npm run desktop:pack` produced `release/win-unpacked/RevoMail.exe` with ASAR integrity and no native database rebuild requirement.
- The packaged Windows application started from the stopped state with one click, created and migrated its per-user SQLite database, generated its encryption key, reached the running state, and opened the RevoMail workspace automatically.
- The packaged workspace showed the expected safe provider-not-configured state because no OAuth test-app credentials were supplied.
- Closing the desktop application stopped its managed child process and released port 4173.
- The packaged application accessibility tree exposed the service controls, settings fields, switches, status region, and alert.
- Dark-theme saving and persistence after application restart were verified in the real packaged UI.
- Generated desktop output, local databases, SQLite sidecar files, environment files, and local keys remain ignored.

## Remaining Work

- Real Google authorization, refresh, and revocation still require sanitized OAuth test-app credentials and a test account.
- Microsoft OAuth and Microsoft Graph release support remain pending.
- macOS and Linux artifacts have not been verified on native hosts or CI.
- Release code signing, macOS notarization, automatic updates, and a production icon set are not implemented.
- Mailbox synchronization, LLM calls, Speech-to-Text, email sending, and calendar writes remain simulated or outside this desktop module.
