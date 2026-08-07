# ADR 0002: Desktop-first SQLite persistence

Date: 2026-08-03

## Status

Accepted. Supersedes the PostgreSQL persistence portion of ADR 0001.

## Decision

RevoMail uses SQLite as its only persistence engine through the built-in `node:sqlite` module included with the supported Node.js and Electron runtimes. Committed SQL migrations are applied transactionally by the application before the local service begins listening. No database driver package, native rebuild, or external migration engine is required.

The Electron application stores `revomail.db` and a generated 32-byte encryption key under Electron's per-user `userData` directory. These values are main-process-only and are never exposed through preload IPC or renderer settings. A normal Node.js start defaults to the ignored `data/revomail.db` path and accepts another local `file:` URL through `DATABASE_URL`.

Connected-account scopes are encoded as JSON text inside the repository implementation and decoded before crossing the service/API boundary. The external account contract remains an array of scope strings.

## Consequences

- RevoMail no longer requires PostgreSQL, Docker, database credentials, or an external database service.
- A fresh desktop installation can create its database, apply migrations, generate its encryption key, and start with one click.
- Database files, sidecar files, local keys, and packaged user data must remain untracked and outside distributable application assets.
- SQLite is appropriate for the single-user desktop application. Multi-host database deployment and PostgreSQL compatibility are intentionally unsupported.
- Future schema changes must add ordered SQLite-compatible migrations and tests for both clean creation and upgrades.
