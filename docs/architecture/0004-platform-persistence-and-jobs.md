# ADR 0004: Platform persistence, sessions, and recoverable jobs

Date: 2026-08-15

## Status

Accepted.

## Context

ADR 0003 selected Python and FastAPI for the active HTTP runtime, but the Python path still kept user identity and provider credentials inside a signed browser cookie. The repository also retained a Node-only SQLite migration path and had no active Python job recovery mechanism.

## Decision

RevoMail uses SQLite through the Python standard library for the MVP persistence boundary. Ordered SQL migrations remain under `database/migrations/` and are applied by `python -m backend.migrate up` or automatically during FastAPI startup. Each migration has a reverse script and the current schema version is recorded with SQLite `user_version`.

The active schema covers users, mailbox connections, encrypted OAuth credentials, application sessions, OAuth transactions, user settings, tasks, audit records, asynchronous jobs, and idempotency keys. Provider credentials are encrypted with Fernet before storage. The browser cookie contains only an opaque, signed application-session token; its hash is stored in SQLite.

Jobs use explicit pending, running, succeeded, and failed states. Claiming a job creates a bounded lease. Startup recovery returns an expired running job to pending or marks it failed when its attempt limit has been reached.

Pydantic Settings remains the typed configuration boundary. Production mode validates public URL security, signing-secret strength, the encryption key, and the SQLite URL before the server becomes ready. Pytest and Vitest remain the Python and JavaScript test runners, while npm scripts remain the contributor command surface.

## Consequences

- The MVP can run without PostgreSQL, Redis, Docker, or an external queue service.
- SQLite is appropriate for the current single-service deployment but is not a claim of horizontal worker scalability.
- Long-running work must use the job repository instead of in-memory background tasks when restart recovery matters.
- Token encryption and session signing keys are server-only configuration and must remain stable across restarts.
- The retained Node authentication implementation remains migration reference only; new persistence behavior belongs in Python.
