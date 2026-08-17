# RevoMail

RevoMail is an AI-assisted email client for email summarization, reply drafting, voice commands, and task/calendar extraction.

> **Current status:** RevoMail uses Python/FastAPI for its active API and SQLite for active server-side sessions, encrypted provider credentials, user/account records, settings, tasks, audits, idempotency records, and recoverable jobs. Google OAuth, Gmail reads, and OpenAI operations are implemented with simulated provider coverage; real Google and OpenAI calls remain unverified. Microsoft, Speech-to-Text, sending, and calendar writes remain pending.

## Current Prototype

The frontend currently demonstrates:

- Google and Microsoft sign-in states backed by the authentication API.
- Searchable and filterable inbox.
- Email reading with an AI summary and extracted information.
- Editable and regeneratable AI reply drafts.
- Voice-command simulation.
- Task and calendar extraction.
- Light, dark, desktop, and mobile layouts.

The inbox keeps demo data while signed out or unconnected and loads Gmail data after a configured Google session. OAuth and OpenAI actions are enabled only when their server-side credentials are configured. Sending and calendar creation remain simulated.

## Quick Start

Prerequisites:

- A current Node.js LTS release.
- Python 3.11 or newer.
- npm.

Install Node and isolated Python dependencies, then launch the desktop application:

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm run desktop
```

On macOS or Linux, use `.venv/bin/python` for the install command. Development commands select the repository `.venv` and then the platform Python command. Packaged desktop builds launch their bundled standalone backend. Google and OpenAI buttons remain unavailable until the relevant server-side credentials are supplied. Register `${APP_BASE_URL}/api/v1/auth/google/callback` with Google.

## Desktop Application

Launch the desktop control room with:

```powershell
npm run desktop
```

The Electron launcher can start, stop, restart, and health-check the RevoMail service without further terminal commands. When the service becomes healthy, it opens the existing RevoMail interface in a separate secured window. Desktop settings persist under Electron's per-user application-data directory and include loopback host, port, automatic startup, open-on-ready, stop-on-exit, theme, preferred language, and reduced motion.

The desktop main process controls the FastAPI child process and passes its validated loopback host, port, and base URL. OAuth and OpenAI credentials remain environment-only and are excluded from renderer settings.

The desktop main process loads private variables without exposing them to the renderer. Installed builds first check `.env` in Electron's private `userData` directory. Local unpacked builds also recognize the repository root `.env`, which keeps the development package aligned with `npm run start`. Existing process variables retain precedence over either file.

For launcher-only development after a current frontend build, use `npm run desktop:dev`. `npm run desktop:pack` builds a PyInstaller standalone backend before assembling the application, so the Windows unpacked application does not depend on a system Python. Native macOS/Linux verification, signing, notarization, and automatic updates remain future work.

## Local FastAPI Preview

For a local preview without Electron, copy `.env.example`, configure the credentials required for the features being tested, then run:

```powershell
npm run build
npm run start
```

`npm run start` selects the repository virtual environment and starts FastAPI. FastAPI serves both the built frontend and `/api/v1`, so browser requests remain same-origin.

Supported runtime variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REVOMAIL_ENV` | `development` | Selects `development`, `test`, or strict `production` validation |
| `HOST` | `127.0.0.1` | Address used by the production server; set explicitly for remote hosting |
| `PORT` | `4173` | Port used by the production preview server |
| `APP_BASE_URL` | `http://localhost:4173` | Public same-origin URL and OAuth callback base |
| `REVOMAIL_DEBUG` | `false` | Enables FastAPI development documentation |
| `DATABASE_URL` | `file:./data/revomail.db` | SQLite database URL used by the active Python repositories |
| `SECRET_KEY` | Development-only local value | Signs the opaque session cookie; at least 32 characters in production |
| `TOKEN_ENCRYPTION_KEY` | Derived locally | Fernet key for stored provider credentials; required in production |
| `JOB_LEASE_SECONDS` | `60` | Lease duration before an interrupted job can be recovered |
| `JOB_MAX_ATTEMPTS` | `3` | Maximum attempts before a recovered job is marked failed |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Empty | Google OAuth application credentials |
| `GOOGLE_REDIRECT_URI` | `${APP_BASE_URL}/api/v1/auth/google/callback` | Registered Google callback override |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Empty | Microsoft OAuth application credentials |
| `OPENAI_API_KEY` | Empty | OpenAI server-side API key |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model used by the merged AI service |

Process variables take precedence over the ignored root `.env`, followed by code defaults. Production startup rejects an insecure public URL, a short signing secret, a missing encryption key, or a non-SQLite database URL. Generate a Fernet key with `.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and store it only in the real environment. Electron supplies its private database and encryption-key paths under `userData`. Real `.env` files are ignored and must never be committed.

## npm Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the frontend into `dist/` |
| `npm run start` | Serve the production build and `/api/v1` with FastAPI |
| `npm test` | Run JavaScript and Python tests |
| `npm run test:js` | Run the retained Node authentication and desktop tests |
| `npm run test:python` | Run FastAPI, OAuth, Gmail, and AI tests |
| `npm run test:db` | Run isolated SQLite repository integration tests |
| `npm run db:migrate` | Apply committed SQLite migrations to the configured local database |
| `npm run db:migrate:dev` | Apply committed SQLite migrations during development |
| `npm run db:rollback` | Roll back the most recently applied SQLite migration |
| `npm run pm2:start` | Build and start the production preview with PM2 |
| `npm run pm2:logs` | View RevoMail PM2 logs |
| `npm run pm2:restart` | Rebuild and restart the PM2 process |
| `npm run pm2:stop` | Stop the PM2 process |
| `npm run pm2:delete` | Remove the PM2 process |
| `npm run desktop` | Build and open the Electron desktop control room |
| `npm run desktop:dev` | Open Electron using the current frontend build |
| `npm run backend:pack` | Build the standalone backend for the current platform |
| `npm run backend:smoke` | Health-check the standalone backend build |
| `npm run desktop:pack` | Build an unpacked desktop application for the current platform |
| `npm run desktop:smoke` | Start and health-check the service from the Windows unpacked package |
| `npm run desktop:ui-smoke` | Exercise the real unpacked Electron launcher and Google authorization entry |
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
|-- server.js                  # Retained Node authentication migration reference
|-- database/                  # Ordered SQLite migrations
|-- data/                      # Ignored local SQLite database files
|-- backend/                   # Active Python/FastAPI backend plus retained Node modules
|   |-- README.md              # Backend layering and implementation rules
|   |-- app/                   # Active FastAPI application
|   |   |-- routers/           # HTTP transport and validation
|   |   |-- services/          # Gmail, OAuth, and AI use cases
|   |   |-- config.py          # Typed environment configuration
|   |   |-- persistence.py     # SQLite migrations, sessions, and credentials
|   |   |-- jobs.py            # Recoverable asynchronous-job foundation
|   |   `-- contracts.py       # Provider-neutral v1 models
|   |-- python_tests/          # Active API, persistence, and provider tests
|   `-- src/                   # Retained Node migration reference and regression tests
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

The active runtime is under `backend/app/`. FastAPI initializes the SQLite schema before serving requests, stores provider credentials with authenticated encryption, keeps only an opaque session token in the signed browser cookie, and recovers expired job leases on restart. The earlier Node authentication paths under `backend/src/` remain temporarily for migration reference and automated regression coverage.

Backend dependency rules:

1. Routes and controllers handle HTTP concerns only.
2. Services implement application use cases and the human-confirmation workflow.
3. Domain code contains provider-independent business rules.
4. Providers isolate Gmail, Microsoft Graph, LLM, calendar, and speech SDKs.
5. Repositories isolate persistence.
6. Shared contracts define the frontend/backend boundary without importing provider SDKs.

The authentication history is recorded in ADR 0001, desktop SQLite history in ADR 0002, the active Python/FastAPI decision in ADR 0003, and the platform persistence decision in ADR 0004. The versioned HTTP contract is documented in `docs/api/v1-contracts.md`.

## Collaboration

Before coding:

1. Read [AGENTS.md](AGENTS.md).
2. Select a requirement from [todo.md](todo.md).
3. Inspect the current `change.md` and preserve other contributors' uncommitted work.
4. Update `change.md` for every repository modification.
5. Run validation proportional to the change and report anything not verified.

Do not mark mocked UI behavior as a completed production integration. The full requirements, priorities, out-of-scope items, and MVP definition of done are maintained in [todo.md](todo.md).
