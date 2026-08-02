# RevoMail

RevoMail is an AI-assisted email client for email summarization, reply drafting, voice commands, and task/calendar extraction.

> **Current status:** Module 1 includes provider-ready Google and Microsoft OAuth, PostgreSQL persistence, encrypted server-side credentials, secure sessions, and connected-account management. Real provider authorization has not been verified because test-app credentials are not currently available. Mailbox access, LLM calls, Speech-to-Text, and calendar writes remain simulated.

## Current Prototype

The frontend currently demonstrates:

- Google and Microsoft sign-in states backed by the authentication API.
- Searchable and filterable inbox.
- Email reading with an AI summary and extracted information.
- Editable and regeneratable AI reply drafts.
- Voice-command simulation.
- Task and calendar extraction.
- Light, dark, desktop, and mobile layouts.

Inbox and assistant features still use static demo data. OAuth buttons are enabled only when their server-side credentials are configured. No email or calendar action currently leaves the browser.

## Quick Start

Prerequisites:

- A current Node.js LTS release.
- npm.
- PostgreSQL 16 or newer.

Copy the safe environment template, set the database and encryption key, install locked dependencies, apply migrations, build, and start the same-origin service:

```powershell
Copy-Item .env.example .env
# Replace TOKEN_ENCRYPTION_KEY with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
npm ci
npm run db:migrate
npm run build
npm run start
```

OAuth buttons remain disabled until the relevant provider client ID and secret are set. Provider callback URLs must be registered as `${APP_BASE_URL}/api/v1/auth/google/callback` and `${APP_BASE_URL}/api/v1/auth/microsoft/callback`.

## Production Preview

Set `NODE_ENV=production`, use an HTTPS `APP_BASE_URL`, supply production PostgreSQL and encryption settings through `.env` or the deployment environment, then run:

```powershell
npm run build
npm run db:migrate
npm run start
```

`server.js` serves the built frontend and the versioned authentication API. Production startup rejects a non-HTTPS `APP_BASE_URL`.

Supported runtime variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Address used by the production preview server |
| `PORT` | `4173` | Port used by the production preview server |
| `APP_BASE_URL` | `http://localhost:4173` | Public same-origin URL and OAuth callback base |
| `DATABASE_URL` | Required | PostgreSQL connection URL |
| `TOKEN_ENCRYPTION_KEY` | Required | Base64-encoded 32-byte AES key |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Empty | Google OAuth application credentials |
| `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_USERINFO_URL`, `GOOGLE_REVOKE_URL` | Google endpoints | Overrideable Google OAuth endpoints, including test fixtures |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Empty | Microsoft OAuth application credentials |
| `MICROSOFT_TENANT` | `common` | Microsoft tenant selector |
| `MICROSOFT_AUTH_URL`, `MICROSOFT_TOKEN_URL`, `MICROSOFT_USERINFO_URL` | Microsoft endpoints | Overrideable Microsoft endpoints, including test fixtures |

The current server loads `.env` with `override: true`, so values in `.env` override inherited process variables. Real `.env` files are ignored and must never be committed.

## npm Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the frontend into `dist/` |
| `npm run start` | Serve the production build with Node.js |
| `npm test` | Run authentication unit and API integration tests |
| `npm run test:db` | Run PostgreSQL repository integration tests using `TEST_DATABASE_URL` |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Apply committed PostgreSQL migrations |
| `npm run db:migrate:dev` | Create and apply migrations during development |
| `npm run pm2:start` | Build and start the production preview with PM2 |
| `npm run pm2:logs` | View RevoMail PM2 logs |
| `npm run pm2:restart` | Rebuild and restart the PM2 process |
| `npm run pm2:stop` | Stop the PM2 process |
| `npm run pm2:delete` | Remove the PM2 process |

## Repository Structure

```text
RevoMail/
|-- AGENTS.md                  # Repository rules for human and AI contributors
|-- README.md                  # Setup, status, and structure
|-- todo.md                    # Requirements, priorities, and acceptance criteria
|-- change.md                  # Active task change record
|-- change/                    # Numbered historical change records
|-- index.html                 # Vite HTML entry point
|-- src/                       # Current frontend source
|   |-- main.js                # Demo state, views, and interactions
|   `-- style.css              # RevoMail design and responsive styles
|-- public/                    # Static frontend assets
|-- server.js                  # Same-origin production frontend and API entry point
|-- prisma/                    # PostgreSQL schema and committed migrations
|-- backend/                   # Reserved backend application boundary
|   |-- README.md              # Backend layering and implementation rules
|   |-- src/
|   |   |-- config/            # Environment loading and configuration validation
|   |   |-- routes/            # HTTP route declarations
|   |   |-- controllers/       # Transport validation and response mapping
|   |   |-- middleware/        # Authentication, errors, rate limits, and tracing
|   |   |-- services/          # Provider-neutral application use cases
|   |   |-- domain/            # Business entities, values, and rules
|   |   |-- providers/
|   |   |   |-- email/         # Gmail and Microsoft Graph adapters
|   |   |   |-- ai/            # LLM adapters
|   |   |   |-- calendar/      # Calendar adapters
|   |   |   `-- speech/        # Speech-to-Text adapters
|   |   |-- repositories/      # Persistence interfaces and implementations
|   |   |-- jobs/              # Retryable and asynchronous work
|   |   `-- utils/             # Small backend-only utilities
|   `-- tests/
|       |-- unit/              # Isolated business and utility tests
|       |-- integration/       # API, provider, and persistence tests
|       `-- fixtures/          # Sanitized test data
|-- shared/
|   |-- contracts/             # Frontend/backend request and response contracts
|   `-- schemas/               # Runtime-neutral validation schemas
|-- docs/
|   |-- architecture/          # Architecture decisions and diagrams
|   `-- api/                   # API specifications and examples
|-- scripts/                   # Reusable development and deployment helpers
|-- package.json               # Current frontend and preview-server commands
|-- package-lock.json          # Locked npm dependency graph
|-- ecosystem.config.cjs       # PM2 process definition
`-- .env.example               # Safe runtime configuration example
```

## Architecture Boundaries

The authentication paths under `backend/src/` are implemented. Other provider and feature directories remain architectural placeholders.

Backend dependency rules:

1. Routes and controllers handle HTTP concerns only.
2. Services implement application use cases and the human-confirmation workflow.
3. Domain code contains provider-independent business rules.
4. Providers isolate Gmail, Microsoft Graph, LLM, calendar, and speech SDKs.
5. Repositories isolate persistence.
6. Shared contracts define the frontend/backend boundary without importing provider SDKs.

The authentication stack decision is recorded in `docs/architecture/0001-authentication-stack.md`; the HTTP contract is documented in `docs/api/authentication.md`.

## Collaboration

Before coding:

1. Read [AGENTS.md](AGENTS.md).
2. Select a requirement from [todo.md](todo.md).
3. Inspect the current `change.md` and preserve other contributors' uncommitted work.
4. Update `change.md` for every repository modification.
5. Run validation proportional to the change and report anything not verified.

Do not mark mocked UI behavior as a completed production integration. The full requirements, priorities, out-of-scope items, and MVP definition of done are maintained in [todo.md](todo.md).
