# RevoMail

RevoMail is an AI-assisted email client for email summarization, reply drafting, voice commands, and task/calendar extraction.

> **Current status:** Module 1 includes provider-ready Google and Microsoft OAuth, local SQLite persistence, encrypted provider credentials, secure sessions, and connected-account management. RevoMail also includes an Electron desktop launcher that creates and migrates its own per-user database. Real provider authorization has not been verified because test-app credentials are not currently available. Mailbox access, LLM calls, Speech-to-Text, and calendar writes remain simulated.

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

For the desktop application, install locked dependencies and launch it. No PostgreSQL, Docker, database setup, migration command, or manually generated encryption key is required:

```powershell
npm ci
npm run desktop
```

The application stores its SQLite database and generated encryption key in Electron's private per-user application-data directory. OAuth buttons remain disabled until the relevant provider client ID and secret are supplied through the local environment. Provider callback URLs must be registered as `${APP_BASE_URL}/api/v1/auth/google/callback` and `${APP_BASE_URL}/api/v1/auth/microsoft/callback`.

## Desktop Application

Launch the desktop control room with:

```powershell
npm run desktop
```

The Electron launcher can start, stop, restart, and health-check the RevoMail service without further terminal commands. When the service becomes healthy, it opens the existing RevoMail interface in a separate secured window. Desktop settings persist under Electron's per-user application-data directory and include loopback host, port, automatic startup, open-on-ready, stop-on-exit, theme, preferred language, and reduced motion.

The desktop main process selects the per-user SQLite path, applies migrations, and creates a persistent encryption key automatically. The database and key are unavailable to renderer code. Optional OAuth client credentials remain environment-only and are deliberately excluded from desktop settings.

For launcher-only development after a current frontend build, use `npm run desktop:dev`. Create an unpacked application for the current host with `npm run desktop:pack`, or a distributable artifact with `npm run desktop:dist`. Windows packaging is configured; macOS and Linux require native or CI verification, and release signing, notarization, and automatic updates are not yet implemented.

## Local Node Preview

For a local Node.js preview without Electron, copy `.env.example`, replace `TOKEN_ENCRYPTION_KEY` with a base64-encoded 32-byte key, then run:

```powershell
npm run build
npm run start
```

`server.js` creates and migrates the configured SQLite file, then serves the built frontend and versioned authentication API. If `NODE_ENV=production` is selected explicitly, startup still requires an HTTPS `APP_BASE_URL`.

Supported runtime variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Address used by the production preview server |
| `PORT` | `4173` | Port used by the production preview server |
| `APP_BASE_URL` | `http://localhost:4173` | Public same-origin URL and OAuth callback base |
| `DATABASE_URL` | `file:./data/revomail.db` | Local SQLite file URL |
| `TOKEN_ENCRYPTION_KEY` | Required | Base64-encoded 32-byte AES key |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Empty | Google OAuth application credentials |
| `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_USERINFO_URL`, `GOOGLE_REVOKE_URL` | Google endpoints | Overrideable Google OAuth endpoints, including test fixtures |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Empty | Microsoft OAuth application credentials |
| `MICROSOFT_TENANT` | `common` | Microsoft tenant selector |
| `MICROSOFT_AUTH_URL`, `MICROSOFT_TOKEN_URL`, `MICROSOFT_USERINFO_URL` | Microsoft endpoints | Overrideable Microsoft endpoints, including test fixtures |

Normal server and PM2 starts load `.env` with `override: true`, so values in `.env` override inherited process variables. The Electron-managed process is the documented exception: it preserves its validated loopback host, port, and base URL by setting the internal `REVOMAIL_DESKTOP=1` launch marker. Real `.env` files are ignored and must never be committed.

## npm Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the frontend into `dist/` |
| `npm run start` | Serve the production build with Node.js |
| `npm test` | Run authentication unit and API integration tests |
| `npm run test:db` | Run isolated SQLite repository integration tests |
| `npm run db:migrate` | Apply committed SQLite migrations to the configured local database |
| `npm run db:migrate:dev` | Apply committed SQLite migrations during development |
| `npm run pm2:start` | Build and start the production preview with PM2 |
| `npm run pm2:logs` | View RevoMail PM2 logs |
| `npm run pm2:restart` | Rebuild and restart the PM2 process |
| `npm run pm2:stop` | Stop the PM2 process |
| `npm run pm2:delete` | Remove the PM2 process |
| `npm run desktop` | Build and open the Electron desktop control room |
| `npm run desktop:dev` | Open Electron using the current frontend build |
| `npm run desktop:pack` | Build an unpacked desktop application for the current platform |
| `npm run desktop:dist` | Build a desktop installer or distributable artifact |

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
|-- desktop/                   # Electron main, preload, launcher renderer, and tests
|-- server.js                  # Same-origin production frontend and API entry point
|-- database/                  # Ordered SQLite migrations
|-- data/                      # Ignored local SQLite database files
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

The authentication stack decision is recorded in `docs/architecture/0001-authentication-stack.md`; desktop-first SQLite persistence is recorded in `docs/architecture/0002-desktop-sqlite-persistence.md`; the HTTP contract is documented in `docs/api/authentication.md`.

## Collaboration

Before coding:

1. Read [AGENTS.md](AGENTS.md).
2. Select a requirement from [todo.md](todo.md).
3. Inspect the current `change.md` and preserve other contributors' uncommitted work.
4. Update `change.md` for every repository modification.
5. Run validation proportional to the change and report anything not verified.

Do not mark mocked UI behavior as a completed production integration. The full requirements, priorities, out-of-scope items, and MVP definition of done are maintained in [todo.md](todo.md).
