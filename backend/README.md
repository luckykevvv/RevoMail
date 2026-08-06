# Backend Workspace

This directory contains the implemented Module 1 authentication boundary plus reserved locations for later RevoMail modules. The selected foundation is Node.js, Express, the built-in `node:sqlite` API, Zod, and provider-neutral OAuth adapters.

Google and Microsoft OAuth code is provider-ready and covered by local automated tests, but real provider flows remain unverified until test-app credentials are available. Do not describe mailbox, AI, calendar, or speech placeholder directories as implemented integrations.

## Proposed Layers

| Directory | Responsibility |
| --- | --- |
| `src/config/` | Environment loading, configuration validation, and safe defaults |
| `src/routes/` | HTTP route declarations |
| `src/controllers/` | Request validation and transport-level response mapping |
| `src/middleware/` | Authentication, authorization, error handling, rate limits, and tracing |
| `src/services/` | Provider-neutral application use cases |
| `src/domain/` | Business entities, value objects, and rules |
| `src/providers/email/` | Gmail and Microsoft Graph adapters |
| `src/providers/ai/` | Replaceable LLM adapters |
| `src/providers/calendar/` | Google and Microsoft calendar adapters |
| `src/providers/speech/` | Speech-to-Text adapters |
| `src/repositories/` | Persistence interfaces and implementations |
| `src/jobs/` | Retryable, scheduled, and asynchronous work |
| `src/utils/` | Small backend-only helpers without business rules |
| `tests/unit/` | Isolated domain, service, and utility tests |
| `tests/integration/` | API, persistence, and provider integration tests |
| `tests/fixtures/` | Sanitized test data with no personal mailbox content |

## Dependency Direction

- Routes and controllers may call services.
- Services may use domain rules, repository interfaces, and provider interfaces.
- Provider and repository implementations may depend on external SDKs or databases.
- Domain code must not import HTTP frameworks, databases, or provider SDKs.
- Shared frontend/backend contracts belong in `../shared/`, not inside a provider implementation.

## Before Adding Another Backend Module

1. Preserve the desktop-first SQLite persistence decision unless a replacement ADR is approved.
2. Record new architectural decisions in `../docs/architecture/`.
3. Define API contracts under `../shared/contracts/` or `../docs/api/`.
4. Add a sanitized environment example without secrets.
5. Add health-check, error-response, validation, and logging conventions.
6. Add unit and integration test commands.
7. Expose stable operations through documented npm scripts.
8. Update the root README, `todo.md`, `AGENTS.md`, and `change.md`.

All email sending, calendar creation, and AI-generated actions must remain user-confirmed and idempotent.
